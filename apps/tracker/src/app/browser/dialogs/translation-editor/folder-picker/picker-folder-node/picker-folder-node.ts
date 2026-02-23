import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import type { FolderNodeDto } from '@simoncodes-ca/data-transfer';
import { InlineFolderInput } from '../../../../sidebar/folder-tree/inline-folder-input/inline-folder-input';

/**
 * Recursive component for rendering folder nodes in the folder picker dialog.
 *
 * Displays folders with expand/collapse, selection states, and keyboard navigation.
 * Shows an add folder button on hover/focus and supports inline folder creation.
 */
@Component({
  selector: 'app-picker-folder-node',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, MatButtonModule, InlineFolderInput],
  templateUrl: './picker-folder-node.html',
  styleUrl: './picker-folder-node.scss',
})
export class PickerFolderNode {
  /** The folder data to render */
  readonly folder = input.required<FolderNodeDto>();

  /** Currently selected folder path */
  readonly selectedPath = input<string | null>(null);

  /** Set of expanded folder paths */
  readonly expandedPaths = input.required<Set<string>>();

  /** Currently focused folder path for keyboard navigation */
  readonly focusedPath = input<string | null>(null);

  /** Whether a folder is being added */
  readonly isAddingFolder = input(false);

  /** Parent path of the folder being added */
  readonly addFolderParentPath = input<string | null>(null);

  /** Emitted when a folder is selected */
  readonly select = output<string>();

  /** Emitted when expand/collapse is toggled */
  readonly toggleExpand = output<string>();

  /** Emitted when add folder button is clicked */
  readonly addFolder = output<string>();

  /** Emitted when new folder name is confirmed */
  readonly confirmNewFolder = output<string>();

  /** Emitted when new folder creation is cancelled */
  readonly cancelNewFolder = output<void>();

  /** Whether this folder is currently selected */
  readonly isSelected = computed(() => {
    return this.folder().fullPath === this.selectedPath();
  });

  /** Whether this folder is currently expanded */
  readonly isExpanded = computed(() => {
    return this.expandedPaths().has(this.folder().fullPath);
  });

  /** Whether this folder is currently focused */
  readonly isFocused = computed(() => {
    return this.folder().fullPath === this.focusedPath();
  });

  /** Whether this folder has children */
  readonly hasChildren = computed(() => {
    return (this.folder().tree?.children.length ?? 0) > 0;
  });

  /** Icon to display for expand/collapse */
  readonly expandIcon = computed(() => {
    return this.isExpanded() ? 'expand_more' : 'chevron_right';
  });

  /** Whether the inline input should be shown for this folder */
  readonly shouldShowInlineInput = computed(() => {
    return this.isAddingFolder() && this.addFolderParentPath() === this.folder().fullPath;
  });

  /**
   * Handles click on the folder row.
   * Selects the folder and toggles expansion if it has children.
   */
  onFolderClick(): void {
    const folderPath = this.folder().fullPath;
    this.select.emit(folderPath);
    if (this.hasChildren()) {
      this.toggleExpand.emit(folderPath);
    }
  }

  /**
   * Handles click on the expand/collapse button.
   * Prevents propagation to avoid triggering folder selection.
   */
  onExpandClick(event: Event): void {
    event.stopPropagation();
    this.toggleExpand.emit(this.folder().fullPath);
  }

  /**
   * Handles click on the add folder button.
   * Prevents propagation to avoid triggering folder selection.
   */
  onAddFolderClick(event: Event): void {
    event.stopPropagation();
    this.addFolder.emit(this.folder().fullPath);
  }

  /**
   * Handles keyboard navigation on the folder row.
   */
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.onFolderClick();
    } else if (event.key === 'ArrowRight' && this.hasChildren() && !this.isExpanded()) {
      event.preventDefault();
      this.toggleExpand.emit(this.folder().fullPath);
    } else if (event.key === 'ArrowLeft' && this.isExpanded()) {
      event.preventDefault();
      this.toggleExpand.emit(this.folder().fullPath);
    }
  }

  /**
   * Handles confirmation of folder name from inline input.
   */
  onFolderConfirm(folderName: string): void {
    this.confirmNewFolder.emit(folderName);
  }

  /**
   * Handles cancellation of folder creation from inline input.
   */
  onFolderCancel(): void {
    this.cancelNewFolder.emit();
  }
}
