import { type CdkDrag, type CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  type ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import type { FolderNodeDto } from '@simoncodes-ca/data-transfer';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { SearchInput } from '../../../shared/components/search-input';
import { injectConfirm } from '../../../shared/confirm';
import { injectMidpointFlip } from '../../../shared/timed-transients';
import { injectFeedback } from '../../feedback';
import { BrowserStore } from '../../store/browser.store';
import { folderDrop } from '../../store/folder-drop';
import type { DragData } from '../../types/drag-data';
import { extractFolderNameFromPath } from '../../utils/folder-path.utils';
import { FolderNode } from './folder-node/folder-node';
import { InlineFolderInput } from './inline-folder-input/inline-folder-input';

const NESTED_ANIMATION_DURATION_MS = 250;
const SCROLL_EDGE_THRESHOLD_PX = 50;
const SCROLL_SPEED_PX = 15;
const SCROLL_INTERVAL_MS = 50;

/**
 * FolderTree component for hierarchical folder navigation.
 *
 * Features:
 * - Search/filter folders, which opens the branches holding matches
 * - Collapsible folders, plus expand/collapse-all on the root row
 * - An artificial root row standing for the collection itself, so the content area can
 *   list every resource across every folder
 * - Folder selection
 * - Toggle between current folder and nested resources view
 * - Disabled while the store says so (`isDisabled`: a search is shown or a move is in flight). It
 *   is derived, so remounting the tree (re-entering the collection mid-search) keeps it disabled.
 */
@Component({
  selector: 'app-folder-tree',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatTooltipModule,
    FolderNode,
    InlineFolderInput,
    TranslocoPipe,
    SearchInput,
    CdkDropList,
  ],
  templateUrl: './folder-tree.html',
  styleUrl: './folder-tree.scss',
})
export class FolderTree {
  readonly store = inject(BrowserStore);
  readonly #confirm = injectConfirm();
  readonly TOKENS = TRACKER_TOKENS;
  readonly #feedback = injectFeedback();

  /** Name of the collection to browse */
  readonly collectionName = input.required<string>();

  /** Active drag data from parent (may come from translation items) */
  readonly activeDragDataFromParent = input<DragData | null>(null);

  /** Emitted when a folder is selected */
  folderSelected = output<string>();

  /** Emitted when drag starts on a folder */
  dragStarted = output<DragData>();

  /** Emitted when drag ends on a folder */
  dragEnded = output<void>();

  /** Signal exposing nested resources visibility from store */
  readonly showNestedResources = this.store.showNestedResources;

  /** Whether the root row — the collection itself — is the current selection */
  readonly isRootSelected = computed(() => this.store.currentFolderPath() === '');

  /** True while a drag hovers the root row, for drop-target styling */
  readonly isRootHoveredDuringDrag = signal(false);

  /** The refusal of the last create typed into the tree, as the store decided it. */
  readonly folderWriteError = computed(() => {
    const feedback = this.store.folderCreateError();
    return feedback ? this.#feedback.text(feedback) : null;
  });

  /** Root accepts folders only: a resource is moved between folders, never onto the collection. */
  readonly #rootDropDecision = computed(() => folderDrop(this.activeDragData(), '', this.store.effectiveDisabled()));

  readonly isValidRootDropTarget = computed(() => this.#rootDropDecision().canLand);

  /** Drives the icon flip animation — true for one animation frame when toggled */
  readonly #nestedFlip = injectMidpointFlip(NESTED_ANIMATION_DURATION_MS);
  readonly isNestedToggleFlipping = this.#nestedFlip.active;

  /** Signal exposing whether a folder is being added */
  readonly isAddingFolder = this.store.isAddingFolder;

  /** Signal exposing the parent path for the folder being added */
  readonly addFolderParentPath = this.store.addFolderParentPath;

  readonly #searchSubject = new Subject<string>();

  /** Reference to the scrollable folder list container */
  readonly folderListRef = viewChild<ElementRef<HTMLDivElement>>('folderList');

  /** Signal tracking the currently dragged item from folder nodes */
  readonly #localActiveDragData = signal<DragData | null>(null);

  /** Combined active drag data (from local folders or parent translation items) */
  readonly activeDragData = computed(() => {
    return this.#localActiveDragData() || this.activeDragDataFromParent();
  });

  /** Auto-scroll interval handle */
  #autoScrollInterval: ReturnType<typeof setInterval> | undefined;

  /** Direction currently being auto-scrolled */
  #autoScrollDirection: 'up' | 'down' | undefined;

  /** Last recorded mouse Y position */
  #lastMouseY = 0;

  readonly #destroyRef = inject(DestroyRef);

  constructor() {
    // Debounce search input
    this.#searchSubject.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed()).subscribe((value) => {
      this.store.setFolderTreeFilter(value);
    });

    this.#destroyRef.onDestroy(() => {
      this.#stopAutoScroll();
    });
  }

  /**
   * Handles folder click events from child nodes.
   * Single click selects the folder and shows its translations.
   */
  onFolderClick(folder: FolderNodeDto): void {
    if (this.store.selectFolder(folder.fullPath)) this.folderSelected.emit(folder.fullPath);
  }

  /** Selects the collection root, whose resource list spans every folder. */
  onRootClick(): void {
    if (this.store.selectFolder('')) this.folderSelected.emit('');
  }

  /** Flips one folder open or shut from its chevron. */
  onToggleExpanded(folderPath: string): void {
    this.store.toggleFolderExpanded(folderPath);
  }

  /** Opens a folder that may already be open — from selection, ArrowRight, or a drag hover. */
  onExpandRequested(folderPath: string): void {
    this.store.expandFolder(folderPath);
  }

  /** Flips the root row itself, hiding or revealing the whole tree. */
  onToggleRootExpanded(event: Event): void {
    event.stopPropagation();
    this.store.setRootExpanded();
  }

  /** ArrowRight on the root row opens it. */
  onRootExpandKeydown(event: Event): void {
    if (this.store.setRootExpanded(true)) event.preventDefault();
  }

  /** ArrowLeft on the root row shuts it. */
  onRootCollapseKeydown(event: Event): void {
    if (this.store.setRootExpanded(false)) event.preventDefault();
  }

  /**
   * Opens or shuts every folder in view. Scoped to the filtered subtree while a filter is
   * active, and the root row stays open either way so the top level remains reachable.
   */
  onToggleExpandAll(event: Event): void {
    event.stopPropagation();
    this.store.toggleAllFoldersExpanded();
  }

  /** Predicate for the root drop list: folders only, and only ones not already at root. */
  canDropOnRoot = (drag: CdkDrag<DragData>): boolean => {
    return this.#rootDropDecisionFor(drag.data).canLand;
  };

  /** Moves a folder dropped on the root row out to the top level. */
  onRootDrop(event: CdkDragDrop<string>): void {
    this.isRootHoveredDuringDrag.set(false);

    const dragData = event.item.data as DragData;
    const decision = this.#rootDropDecisionFor(dragData);
    if (!decision.canLand) return;
    if (dragData.type !== 'folder' || !dragData.path) return;

    this.confirmMoveFolder(dragData.path, '');
  }

  #rootDropDecisionFor(dragData: DragData) {
    return dragData === this.activeDragData()
      ? this.#rootDropDecision()
      : folderDrop(dragData, '', this.store.effectiveDisabled());
  }

  /**
   * Handles search input changes with debouncing.
   */
  onSearchChange(value: string): void {
    this.#searchSubject.next(value);
  }

  /**
   * Sets the nested resources visibility state and triggers the icon flip animation.
   * The store update (icon swap) is deferred to the 90° midpoint of the animation
   * when the element is edge-on and invisible, so the new icon is never seen rotating.
   */
  setNestedResources(value: boolean): void {
    this.#nestedFlip.trigger(() => this.store.setNestedResources(value));
  }

  /**
   * Handles confirmation of folder name from inline input.
   * The store closes the draft and keeps a refusal for the inline error; a toast shows the rest.
   */
  onFolderConfirm(folderName: string, parentPath: string | null = this.store.addFolderParentPath()): void {
    this.store
      .confirmFolderDraft(folderName, parentPath)
      .subscribe((outcome) => this.#feedback.toast(outcome.feedback));
  }

  /**
   * Handles cancellation of folder creation from inline input.
   * Calls the store to reset the adding state.
   */
  onFolderCancel(): void {
    this.store.cancelAddingFolder();
  }

  /**
   * Initiates folder creation in the currently selected folder.
   * Triggers the inline input for entering a new folder name.
   */
  onAddFolderButtonClick(): void {
    const currentFolderPath = this.store.currentFolderPath();
    this.store.startAddingFolder(currentFolderPath || null);
  }

  /**
   * Handles delete folder request from child nodes.
   * Opens confirmation dialog and deletes folder if confirmed.
   */
  onDeleteFolder(folderPath: string): void {
    const folderName = extractFolderNameFromPath(folderPath);

    this.store
      .requestFolderDelete(folderPath, (inSession) =>
        this.#confirm(
          {
            title: TRACKER_TOKENS.BROWSER.DIALOG.DELETEFOLDER.TITLE,
            message: { token: TRACKER_TOKENS.BROWSER.DIALOG.DELETEFOLDER.MESSAGEX, params: { name: folderName } },
            confirmButtonText: TRACKER_TOKENS.COMMON.ACTIONS.DELETE,
            actionType: 'destructive',
          },
          { width: '400px', canOpen: inSession },
        ),
      )
      .subscribe((outcome) => this.#feedback.toast(outcome.feedback));
  }

  /** Confirms a folder move before handing the write to the store. */
  confirmMoveFolder(sourceFolderPath: string, destinationFolderPath: string): void {
    this.store
      .requestFolderMove({ sourceFolderPath, destinationFolderPath }, (inSession) =>
        this.#confirm(
          {
            title: TRACKER_TOKENS.BROWSER.DIALOG.MOVEFOLDER.TITLE,
            message: {
              token: TRACKER_TOKENS.BROWSER.DIALOG.MOVEFOLDER.MESSAGEX,
              params: {
                name: extractFolderNameFromPath(sourceFolderPath),
                dest: destinationFolderPath || { token: TRACKER_TOKENS.BROWSER.FOLDERPICKER.ROOTLABEL },
              },
            },
            confirmButtonText: TRACKER_TOKENS.COMMON.ACTIONS.MOVE,
            actionType: 'standard',
          },
          { width: '400px', canOpen: inSession },
        ),
      )
      .subscribe((outcome) => this.#feedback.toast(outcome.feedback));
  }

  /**
   * Handles resource drop events bubbled up from folder nodes.
   * Calls store to move the resource to the target folder.
   */
  onResourceDropped(event: { dragData: DragData; targetFolderPath: string }): void {
    const { dragData, targetFolderPath } = event;

    if (dragData.type !== 'resource' || !dragData.key) {
      console.error('Invalid resource drop event:', event);
      return;
    }

    this.store
      .moveResource({
        sourceKey: dragData.key,
        destinationFolderPath: targetFolderPath,
      })
      .subscribe((outcome) => this.#feedback.toast(outcome.feedback));
  }

  /**
   * Handles folder drop events bubbled up from folder nodes.
   * Calls store to move the folder to the target location.
   */
  onFolderDropped(event: { dragData: DragData; targetFolderPath: string }): void {
    const { dragData, targetFolderPath } = event;

    if (dragData.type !== 'folder' || !dragData.path) {
      console.error('Invalid folder drop event:', event);
      return;
    }

    this.confirmMoveFolder(dragData.path, targetFolderPath);
  }

  /**
   * Handles drag started event from folder nodes.
   * Sets the active drag data and emits to parent.
   */
  onDragStarted(dragData: DragData): void {
    this.#localActiveDragData.set(dragData);
    this.dragStarted.emit(dragData);
  }

  /**
   * Handles drag ended event from folder nodes.
   * Clears the active drag data, stops auto-scroll, and emits to parent.
   */
  onDragEnded(): void {
    this.#localActiveDragData.set(null);
    this.#stopAutoScroll();
    this.dragEnded.emit();
  }

  /**
   * Handles mouse move events during drag.
   * Checks if near edges and triggers auto-scroll.
   */
  onDragMoved(event: MouseEvent): void {
    this.#lastMouseY = event.clientY;
    this.#checkAutoScroll();
  }

  /**
   * Checks if mouse is near top or bottom edge and triggers auto-scroll.
   */
  #checkAutoScroll(): void {
    const folderList = this.folderListRef()?.nativeElement;
    if (!folderList) return;

    const rect = folderList.getBoundingClientRect();
    const distanceFromTop = this.#lastMouseY - rect.top;
    const distanceFromBottom = rect.bottom - this.#lastMouseY;

    // Check if near top edge
    if (distanceFromTop < SCROLL_EDGE_THRESHOLD_PX && distanceFromTop > 0) {
      this.#startAutoScroll('up');
      return;
    }

    // Check if near bottom edge
    if (distanceFromBottom < SCROLL_EDGE_THRESHOLD_PX && distanceFromBottom > 0) {
      this.#startAutoScroll('down');
      return;
    }

    // Not near any edge, stop auto-scroll
    this.#stopAutoScroll();
  }

  /**
   * Starts auto-scrolling in the specified direction.
   * If already scrolling in the same direction, this is a no-op.
   * If scrolling in the opposite direction, the existing interval is stopped first.
   */
  #startAutoScroll(direction: 'up' | 'down'): void {
    if (this.#autoScrollDirection === direction) return;
    if (this.#autoScrollInterval) this.#stopAutoScroll();

    this.#autoScrollDirection = direction;
    this.#autoScrollInterval = setInterval(() => {
      const folderList = this.folderListRef()?.nativeElement;
      if (!folderList) {
        this.#stopAutoScroll();
        return;
      }

      const scrollAmount = direction === 'up' ? -SCROLL_SPEED_PX : SCROLL_SPEED_PX;
      folderList.scrollBy({ top: scrollAmount, behavior: 'auto' });
    }, SCROLL_INTERVAL_MS);
  }

  /**
   * Stops auto-scrolling and resets direction tracking.
   */
  #stopAutoScroll(): void {
    if (this.#autoScrollInterval) {
      clearInterval(this.#autoScrollInterval);
      this.#autoScrollInterval = undefined;
    }
    this.#autoScrollDirection = undefined;
  }
}
