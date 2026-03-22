import {
  Component,
  ChangeDetectionStrategy,
  DestroyRef,
  inject,
  input,
  output,
  effect,
  signal,
  viewChild,
  type ElementRef,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FolderNode } from './folder-node/folder-node';
import { InlineFolderInput } from './inline-folder-input/inline-folder-input';
import { BrowserStore } from '../../store/browser.store';
import type { FolderNodeDto } from '@simoncodes-ca/data-transfer';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { SearchInput } from '../../../shared/components/search-input';
import { MatIconModule } from '@angular/material/icon';
import type { DragData } from '../../types/drag-data';
import { extractFolderNameFromPath } from '../../utils/folder-path.utils';

const NESTED_ANIMATION_DURATION_MS = 250;
const SCROLL_EDGE_THRESHOLD_PX = 50;
const SCROLL_SPEED_PX = 15;
const SCROLL_INTERVAL_MS = 50;

/**
 * FolderTree component for hierarchical folder navigation.
 *
 * Features:
 * - Search/filter folders
 * - Progressive loading (click to load)
 * - Folder selection
 * - Toggle between current folder and nested resources view
 * - Disabled state during search
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
  ],
  templateUrl: './folder-tree.html',
  styleUrl: './folder-tree.scss',
})
export class FolderTree {
  readonly store = inject(BrowserStore);
  readonly #dialog = inject(MatDialog);
  readonly TOKENS = TRACKER_TOKENS;
  readonly #transloco = inject(TranslocoService);

  /** Name of the collection to browse */
  readonly collectionName = input.required<string>();

  /** Whether the tree is disabled (e.g., during translation search) */
  readonly disabled = input<boolean>(false);

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

  /** Drives the icon flip animation — true for one animation frame when toggled */
  readonly isNestedToggleFlipping = signal(false);

  #nestedFlipMidTimeout: ReturnType<typeof setTimeout> | undefined;
  #nestedFlipEndTimeout: ReturnType<typeof setTimeout> | undefined;

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
    // Sync disabled state to store
    effect(() => {
      this.store.setDisabled(this.disabled());
    });

    // Debounce search input
    this.#searchSubject.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed()).subscribe((value) => {
      this.store.setFolderTreeFilter(value);
    });

    this.#destroyRef.onDestroy(() => {
      if (this.#nestedFlipMidTimeout) clearTimeout(this.#nestedFlipMidTimeout);
      if (this.#nestedFlipEndTimeout) clearTimeout(this.#nestedFlipEndTimeout);
      this.#stopAutoScroll();
    });
  }

  /**
   * Handles folder click events from child nodes.
   * Single click selects the folder and shows its translations.
   */
  onFolderClick(folder: FolderNodeDto): void {
    this.store.selectFolder(folder.fullPath);
    this.folderSelected.emit(folder.fullPath);
  }

  /**
   * Handles load folder requests from child nodes.
   * Loads the folder's children for expansion.
   * Note: Selection is handled separately by onFolderClick.
   */
  onLoadFolder(folderPath: string): void {
    this.store.loadFolderChildren(folderPath);
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
    if (this.#nestedFlipMidTimeout) clearTimeout(this.#nestedFlipMidTimeout);
    if (this.#nestedFlipEndTimeout) clearTimeout(this.#nestedFlipEndTimeout);

    this.isNestedToggleFlipping.set(true);

    this.#nestedFlipMidTimeout = setTimeout(() => {
      this.store.setNestedResources(value);
      this.#nestedFlipMidTimeout = undefined;
    }, NESTED_ANIMATION_DURATION_MS / 2);

    this.#nestedFlipEndTimeout = setTimeout(() => {
      this.isNestedToggleFlipping.set(false);
      this.#nestedFlipEndTimeout = undefined;
    }, NESTED_ANIMATION_DURATION_MS);
  }

  /**
   * Handles confirmation of folder name from inline input.
   * Calls the store to create the folder.
   */
  onFolderConfirm(folderName: string): void {
    this.store.createFolder(folderName);
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

    import('../../../shared/components/confirmation-dialog/confirmation-dialog').then((m) => {
      const dialogRef = this.#dialog.open(m.ConfirmationDialog, {
        data: {
          title: this.#transloco.translate(TRACKER_TOKENS.BROWSER.DIALOG.DELETEFOLDER.TITLE),
          message: this.#transloco.translate(TRACKER_TOKENS.BROWSER.DIALOG.DELETEFOLDER.MESSAGEX, { name: folderName }),
          confirmButtonText: this.#transloco.translate(TRACKER_TOKENS.COMMON.ACTIONS.DELETE),
          actionType: 'destructive',
        },
        width: '400px',
      });

      dialogRef.afterClosed().subscribe((confirmed) => {
        if (confirmed === true) {
          this.store.deleteFolder(folderPath);
        }
      });
    });
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

    this.store.moveResource({
      sourceKey: dragData.key,
      destinationFolderPath: targetFolderPath,
    });
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

    this.store.moveFolder({
      sourceFolderPath: dragData.path,
      destinationFolderPath: targetFolderPath,
    });
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
