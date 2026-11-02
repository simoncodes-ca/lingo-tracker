import { type CdkDrag, type CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import type { FolderNodeDto } from '@simoncodes-ca/data-transfer';
import { folderPathLeaf } from '@simoncodes-ca/domain';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { SearchInput } from '../../../shared/components/search-input';
import { injectConfirmedWrite } from '../../../shared/confirmed-write';
import { injectMidpointFlip } from '../../../shared/timed-transients';
import { injectFeedback } from '../../feedback';
import { BrowserStore } from '../../store/browser.store';
import { folderDrop } from '../../store/folder-drop';
import { navigateTree, SIDEBAR_NAVIGATION } from '../../store/tree-navigation';
import type { DragData } from '../../types/drag-data';
import { DragAutoScroll } from './drag-auto-scroll.directive';
import { FolderNode } from './folder-node/folder-node';
import { InlineFolderInput } from './inline-folder-input/inline-folder-input';

const NESTED_ANIMATION_DURATION_MS = 250;

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
    DragAutoScroll,
  ],
  templateUrl: './folder-tree.html',
  styleUrl: './folder-tree.scss',
})
export class FolderTree {
  readonly store = inject(BrowserStore);
  readonly #write = injectConfirmedWrite();
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

  /** Signal tracking the currently dragged item from folder nodes */
  readonly #localActiveDragData = signal<DragData | null>(null);

  /** Combined active drag data (from local folders or parent translation items) */
  readonly activeDragData = computed(() => {
    return this.#localActiveDragData() || this.activeDragDataFromParent();
  });

  constructor() {
    // Debounce search input
    this.#searchSubject.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed()).subscribe((value) => {
      this.store.setFolderTreeFilter(value);
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

  onRootTreeKeydown(event: Event, key: string): void {
    const next = navigateTree(
      { focusedPath: '', expanded: this.store.isRootExpanded(), hasChildren: false, hasRows: true },
      key,
      SIDEBAR_NAVIGATION,
    );
    switch (next.intent.kind) {
      case 'select':
        this.onRootClick();
        break;
      case 'expand':
        if (this.store.setRootExpanded(true) && next.preventDefault) event.preventDefault();
        break;
      case 'collapse':
        if (this.store.setRootExpanded(false) && next.preventDefault) event.preventDefault();
        break;
      case 'focus':
      case 'none':
        break;
    }
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
    const name = folderPathLeaf(folderPath);
    const confirm = this.#write.confirmDestructive({
      title: TRACKER_TOKENS.BROWSER.DIALOG.DELETEFOLDER.TITLE,
      message: { token: TRACKER_TOKENS.BROWSER.DIALOG.DELETEFOLDER.MESSAGEX, params: { name } },
      width: '400px',
    });
    void this.#write.runWrite(this.store.requestFolderDelete(folderPath, confirm));
  }

  /** Confirms a folder move before handing the write to the store. */
  confirmMoveFolder(sourceFolderPath: string, destinationFolderPath: string): void {
    const confirm = this.#write.confirmWrite({
      title: TRACKER_TOKENS.BROWSER.DIALOG.MOVEFOLDER.TITLE,
      message: {
        token: TRACKER_TOKENS.BROWSER.DIALOG.MOVEFOLDER.MESSAGEX,
        params: {
          name: folderPathLeaf(sourceFolderPath),
          dest: destinationFolderPath || { token: TRACKER_TOKENS.BROWSER.FOLDERPICKER.ROOTLABEL },
        },
      },
      confirmButtonText: TRACKER_TOKENS.COMMON.ACTIONS.MOVE,
      actionType: 'standard',
      width: '400px',
    });
    void this.#write.runWrite(this.store.requestFolderMove({ sourceFolderPath, destinationFolderPath }, confirm));
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
    this.dragEnded.emit();
  }
}
