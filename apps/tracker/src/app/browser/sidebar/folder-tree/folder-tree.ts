import {
  Component,
  ChangeDetectionStrategy,
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
import { MatButtonToggleModule } from '@angular/material/button-toggle';
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
import { TranslocoModule } from '@jsverse/transloco';
import { SearchInput } from '../../../shared/components/search-input';
import { MatIconModule } from '@angular/material/icon';
import type { DragData } from '../../types/drag-data';
import { extractFolderNameFromPath } from '../../utils/folder-path.utils';

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
    MatButtonToggleModule,
    MatTooltipModule,
    FolderNode,
    InlineFolderInput,
    TranslocoModule,
    SearchInput,
  ],
  templateUrl: './folder-tree.html',
  styleUrl: './folder-tree.scss',
})
export class FolderTree {
  readonly store = inject(BrowserStore);
  readonly dialog = inject(MatDialog);
  readonly TOKENS = TRACKER_TOKENS;

  /** Name of the collection to browse */
  collectionName = input.required<string>();

  /** Whether the tree is disabled (e.g., during translation search) */
  disabled = input<boolean>(false);

  /** Active drag data from parent (may come from translation items) */
  activeDragDataFromParent = input<DragData | null>(null, { alias: 'activeDragData' });

  /** Emitted when a folder is selected */
  folderSelected = output<string>();

  /** Emitted when drag starts on a folder */
  dragStarted = output<DragData>();

  /** Emitted when drag ends on a folder */
  dragEnded = output<void>();

  /** Signal exposing nested resources visibility from store */
  readonly showNestedResources = this.store.showNestedResources;

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
  #autoScrollInterval: ReturnType<typeof setInterval> | null = null;

  /** Last recorded mouse Y position */
  #lastMouseY = 0;

  constructor() {
    // Sync disabled state to store
    effect(() => {
      this.store.setDisabled(this.disabled());
    });

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
   * Sets the nested resources visibility state.
   * Calls the store method to update the value and reload the current folder.
   */
  setNestedResources(value: boolean): void {
    this.store.setNestedResources(value);
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
      const dialogRef = this.dialog.open(m.ConfirmationDialog, {
        data: {
          title: 'Delete Folder',
          message: `Delete "${folderName}" and all its contents?`,
          confirmButtonText: 'Delete',
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
    const scrollThreshold = 50; // pixels from edge to trigger scroll

    const distanceFromTop = this.#lastMouseY - rect.top;
    const distanceFromBottom = rect.bottom - this.#lastMouseY;

    // Check if near top edge
    if (distanceFromTop < scrollThreshold && distanceFromTop > 0) {
      this.#startAutoScroll('up');
      return;
    }

    // Check if near bottom edge
    if (distanceFromBottom < scrollThreshold && distanceFromBottom > 0) {
      this.#startAutoScroll('down');
      return;
    }

    // Not near any edge, stop auto-scroll
    this.#stopAutoScroll();
  }

  /**
   * Starts auto-scrolling in the specified direction.
   */
  #startAutoScroll(direction: 'up' | 'down'): void {
    // Don't start if already scrolling in this direction
    if (this.#autoScrollInterval) return;

    const scrollSpeed = 15; // pixels per interval
    const scrollInterval = 50; // milliseconds

    this.#autoScrollInterval = setInterval(() => {
      const folderList = this.folderListRef()?.nativeElement;
      if (!folderList) {
        this.#stopAutoScroll();
        return;
      }

      const scrollAmount = direction === 'up' ? -scrollSpeed : scrollSpeed;
      folderList.scrollBy({ top: scrollAmount, behavior: 'auto' });
    }, scrollInterval);
  }

  /**
   * Stops auto-scrolling.
   */
  #stopAutoScroll(): void {
    if (this.#autoScrollInterval) {
      clearInterval(this.#autoScrollInterval);
      this.#autoScrollInterval = null;
    }
  }
}
