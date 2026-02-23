import { Component, ChangeDetectionStrategy, input, output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { CdkDrag, CdkDragHandle, CdkDropList, type CdkDragDrop } from '@angular/cdk/drag-drop';
import type { FolderNodeDto } from '@simoncodes-ca/data-transfer';
import { TranslocoModule } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../../../../i18n-types/tracker-resources';
import { InlineFolderInput } from '../inline-folder-input/inline-folder-input';
import { BrowserStore } from '../../../store/browser.store';
import type { DragData } from '../../../types/drag-data';

/**
 * Recursive component for rendering folder tree nodes.
 *
 * Features:
 * - Displays folder icon and name
 * - Shows "click to load" for unloaded folders
 * - Recursively renders child folders
 * - Emits events for folder clicks and load requests
 */
@Component({
  selector: 'app-folder-node',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    TranslocoModule,
    InlineFolderInput,
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
  ],
  templateUrl: './folder-node.html',
  styleUrl: './folder-node.scss',
})
export class FolderNode {
  readonly store = inject(BrowserStore);

  /** The folder data to render */
  folder = input.required<FolderNodeDto>();

  /** Currently selected folder path */
  selectedPath = input<string | null>(null);

  /** Whether nested resources mode is active */
  showNestedResources = input<boolean>(false);

  /** Whether the tree is disabled */
  disabled = input<boolean>(false);

  /** Emitted when a folder is clicked */
  folderClick = output<FolderNodeDto>();

  /** Emitted when "load" is clicked for an unloaded folder */
  loadFolder = output<string>();

  /** Emitted when delete button is clicked or Delete key is pressed */
  deleteFolder = output<string>();

  /** Whether this folder is currently being deleted */
  isDeleting = input<boolean>(false);

  /** Emitted when a resource is dropped on this folder */
  resourceDropped = output<{ dragData: DragData; targetFolderPath: string }>();

  /** Emitted when a folder is dropped on this folder */
  folderDropped = output<{ dragData: DragData; targetFolderPath: string }>();

  /** Emitted when drag starts on this folder */
  dragStarted = output<DragData>();

  /** Emitted when drag ends on this folder */
  dragEnded = output<void>();

  /** Signal tracking the currently active drag item */
  activeDragData = input<DragData | null>(null);

  readonly TOKENS = TRACKER_TOKENS;

  /** Timer for auto-expand on hover */
  #expandTimer: ReturnType<typeof setTimeout> | null = null;

  /** Signal tracking if this folder is being hovered during drag */
  readonly isHoveredDuringDrag = signal(false);

  /** Signal exposing whether a folder is being added */
  readonly isAddingFolder = this.store.isAddingFolder;

  /** Signal exposing the parent path for the folder being added */
  readonly addFolderParentPath = this.store.addFolderParentPath;

  /** Signal exposing the path of the newly created folder */
  readonly newlyCreatedFolderPath = this.store.newlyCreatedFolderPath;

  /** Whether the inline input should be shown for this folder */
  readonly shouldShowInlineInput = computed(() => {
    return this.isAddingFolder() && this.addFolderParentPath() === this.folder().fullPath;
  });

  /** Whether this folder was just created */
  readonly isNewlyCreated = computed(() => {
    return this.newlyCreatedFolderPath() === this.folder().fullPath;
  });

  /** Checks if this folder is a descendant of the selected folder */
  readonly isDescendantOfSelected = computed(() => {
    const selected = this.selectedPath();
    const myPath = this.folder().fullPath;
    if (!selected || !myPath) return false;
    return myPath.startsWith(`${selected}.`);
  });

  /** Determines which icon to display for the folder */
  readonly folderIcon = computed(() => {
    if (this.isSelected()) return 'folder_check';
    if (this.showNestedResources() && this.isDescendantOfSelected()) {
      return 'folder_check';
    }
    return this.folder().loaded ? 'folder_open' : 'folder';
  });

  /**
   * Handles folder click.
   * Single click both selects the folder AND loads it (if not already loaded).
   */
  onFolderClick(): void {
    if (!this.disabled()) {
      const currentFolder = this.folder();

      // Always emit folderClick to select the folder
      this.folderClick.emit(currentFolder);

      // If folder is not loaded, also emit loadFolder to trigger loading
      if (!currentFolder.loaded) {
        this.loadFolder.emit(currentFolder.fullPath);
      }
    }
  }

  /**
   * Checks if this folder is currently selected.
   */
  isSelected(): boolean {
    return this.folder().fullPath === this.selectedPath();
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
   * Handles delete button click.
   * Stops event propagation to prevent folder selection.
   */
  onDeleteClick(event: Event): void {
    event.stopPropagation();
    if (!this.disabled()) {
      this.deleteFolder.emit(this.folder().fullPath);
    }
  }

  /**
   * Handles Delete key press on folder header.
   * Stops event propagation to prevent unwanted side effects.
   */
  onDeleteKeydown(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    if (!this.disabled()) {
      this.deleteFolder.emit(this.folder().fullPath);
    }
  }

  /**
   * Drag data for this folder.
   * Contains folder path and type identifier.
   */
  readonly dragData = computed<DragData>(() => ({
    type: 'folder',
    path: this.folder().fullPath,
  }));

  /**
   * Validates if the current drag operation is a valid drop target.
   * Returns true if this folder can accept the currently dragged item.
   */
  readonly isValidDropTarget = computed(() => {
    const dragData = this.activeDragData();
    if (!dragData) return false;

    const targetFolderPath = this.folder().fullPath;

    if (dragData.type === 'folder') {
      const sourceFolderPath = dragData.path;
      if (!sourceFolderPath) return false;

      // Cannot drop folder onto itself
      if (sourceFolderPath === targetFolderPath) {
        return false;
      }

      // Cannot drop folder onto its own descendant (circular dependency)
      // Target is a descendant if it starts with source path followed by "."
      if (targetFolderPath.startsWith(`${sourceFolderPath}.`)) {
        return false;
      }

      return true;
    }

    if (dragData.type === 'resource') {
      const currentFolderPath = dragData.folderPath;
      if (!currentFolderPath) return false;

      // Cannot drop resource onto its current parent folder
      if (currentFolderPath === targetFolderPath) {
        return false;
      }

      return true;
    }

    return false;
  });

  /**
   * Handles drop events on this folder.
   * Determines if a resource or folder was dropped and emits appropriate event.
   */
  onDrop(event: CdkDragDrop<string>): void {
    this.isHoveredDuringDrag.set(false);

    const dragData = event.item.data as DragData;
    const targetFolderPath = this.folder().fullPath;

    // Skip if dropped back into same container (no-op)
    if (dragData.type === 'folder' && dragData.path === targetFolderPath) {
      return;
    }

    if (dragData.type === 'resource') {
      this.resourceDropped.emit({ dragData, targetFolderPath });
    } else if (dragData.type === 'folder') {
      this.folderDropped.emit({ dragData, targetFolderPath });
    }
  }

  /**
   * Handles drag started event.
   * Emits drag data to parent components for tracking.
   */
  onDragStarted(): void {
    this.dragStarted.emit(this.dragData());
  }

  /**
   * Handles drag ended event.
   * Notifies parent components that drag has ended.
   */
  onDragEnded(): void {
    this.dragEnded.emit();
  }

  /**
   * Handles drop list entered event.
   * Starts auto-expand timer and sets hover state.
   */
  onDropListEntered(): void {
    this.isHoveredDuringDrag.set(true);

    // Only auto-expand if folder is not already loaded and is a valid drop target
    if (!this.folder().loaded && this.isValidDropTarget()) {
      this.#expandTimer = setTimeout(() => {
        this.loadFolder.emit(this.folder().fullPath);
      }, 500);
    }
  }

  /**
   * Handles drop list exited event.
   * Cancels auto-expand timer and clears hover state.
   */
  onDropListExited(): void {
    this.isHoveredDuringDrag.set(false);

    // Clear the auto-expand timer if it exists
    if (this.#expandTimer) {
      clearTimeout(this.#expandTimer);
      this.#expandTimer = null;
    }
  }

  /**
   * Predicate function for CDK drop list to determine if drop is allowed.
   */
  canDrop = (drag: CdkDrag<DragData>): boolean => {
    const dragData = drag.data;
    if (!dragData) return false;

    const targetFolderPath = this.folder().fullPath;

    if (dragData.type === 'folder') {
      const sourceFolderPath = dragData.path;
      if (!sourceFolderPath) return false;
      if (sourceFolderPath === targetFolderPath) return false;
      if (targetFolderPath.startsWith(`${sourceFolderPath}.`)) return false;
      return true;
    }

    if (dragData.type === 'resource') {
      const currentFolderPath = dragData.folderPath;
      if (!currentFolderPath) return false;
      if (currentFolderPath === targetFolderPath) return false;
      return true;
    }

    return false;
  };
}
