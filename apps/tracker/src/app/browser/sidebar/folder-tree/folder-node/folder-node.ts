import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { FolderNodeDto } from '@simoncodes-ca/data-transfer';
import {TranslocoModule} from "@jsverse/transloco";
import {TRACKER_TOKENS} from "../../../../../i18n-types/tracker-resources";

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
  imports: [CommonModule, MatIconModule, MatButtonModule, TranslocoModule],
  templateUrl: './folder-node.html',
  styleUrl: './folder-node.scss',
})
export class FolderNode {
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

  readonly TOKENS = TRACKER_TOKENS;

  /** Checks if this folder is a descendant of the selected folder */
  readonly isDescendantOfSelected = computed(() => {
    const selected = this.selectedPath();
    const myPath = this.folder().fullPath;
    if (!selected || !myPath) return false;
    return myPath.startsWith(selected + '.');
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
}
