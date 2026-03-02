import { Component, ChangeDetectionStrategy, input, output, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import type { FolderNodeDto } from '@simoncodes-ca/data-transfer';
import { PickerFolderNode } from './picker-folder-node/picker-folder-node';
import { BrowserStore } from '../../../store/browser.store';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { HttpErrorResponse } from '@angular/common/http';

/**
 * Folder picker component for the Translation Editor Dialog.
 *
 * Features:
 * - Display current folder path
 * - Expand/collapse tree-based folder selector
 * - Allow folder selection from tree with keyboard navigation
 * - Support inline folder creation
 * - Auto-select newly created folders
 * - Auto-confirm selection when clicking or pressing Enter/Space on a folder
 */
@Component({
  selector: 'app-folder-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, MatButtonModule, PickerFolderNode],
  templateUrl: './folder-picker.html',
  styleUrl: './folder-picker.scss',
})
export class FolderPicker {
  readonly #store = inject(BrowserStore);
  readonly #snackBar = inject(MatSnackBar);

  /** Current folder path (persisted selection) */
  readonly currentPath = input.required<string>();

  /** Root folders from the folder tree */
  readonly rootFolders = input.required<FolderNodeDto[]>();

  /** Emitted when a folder selection is confirmed */
  readonly folderConfirmed = output<string>();

  /** Emitted when a new folder is created */
  readonly folderCreated = output<FolderNodeDto>();

  readonly isExpanded = signal(false);
  readonly expandedPaths = signal<Set<string>>(new Set());
  readonly selectedPath = signal<string | null>(null);
  readonly focusedPath = signal<string | null>(null);
  readonly isAddingFolder = signal(false);
  readonly addFolderParentPath = signal<string | null>(null);
  readonly isCreatingFolder = signal(false);

  readonly displayPath = computed(() => {
    const stagedPath = this.selectedPath();
    if (stagedPath !== null) {
      return stagedPath || 'root';
    }
    const current = this.currentPath();
    return current || 'root';
  });

  readonly chevronIcon = computed(() => {
    return this.isExpanded() ? 'expand_less' : 'expand_more';
  });

  readonly hasRootFolders = computed(() => {
    return this.rootFolders().length > 0;
  });

  toggleExpanded(): void {
    this.isExpanded.update((expanded) => !expanded);
    if (!this.isExpanded()) {
      this.selectedPath.set(null);
      this.focusedPath.set(null);
    }
  }

  onFolderSelect(folderPath: string): void {
    this.selectedPath.set(folderPath);
    this.folderConfirmed.emit(folderPath);
    this.isExpanded.set(false);
    this.focusedPath.set(null);
  }

  onCreateFirstFolder(): void {
    this.isAddingFolder.set(true);
    this.addFolderParentPath.set('');
  }

  onAddFolder(parentPath: string): void {
    this.isAddingFolder.set(true);
    this.addFolderParentPath.set(parentPath);
    // Auto-expand the parent folder to show the inline input
    this.expandedPaths.update((expanded) => new Set(expanded).add(parentPath));
  }

  onFolderNameConfirmed(folderName: string): void {
    const parentPath = this.addFolderParentPath();
    if (parentPath === null) {
      return;
    }

    this.isCreatingFolder.set(true);

    this.#store.createFolderAt(folderName, parentPath || null).subscribe({
      next: (response) => {
        this.isCreatingFolder.set(false);
        this.isAddingFolder.set(false);
        this.addFolderParentPath.set(null);

        if (response) {
          this.folderCreated.emit(response.folder);
          this.selectedPath.set(response.folder.fullPath);

          // Auto-expand parent to show the new folder
          if (parentPath) {
            this.expandedPaths.update((expanded) => new Set(expanded).add(parentPath));
          }

          this.#snackBar.open(response.created ? 'Folder created successfully' : 'Folder already exists', 'Close', {
            duration: 3000,
          });
        }
      },
      error: (error: HttpErrorResponse) => {
        this.isCreatingFolder.set(false);
        this.isAddingFolder.set(false);
        this.addFolderParentPath.set(null);

        const errorMessage = error.error?.message || 'Failed to create folder';
        this.#snackBar.open(errorMessage, 'Close', { duration: 5000 });
      },
    });
  }

  onFolderNameCancelled(): void {
    this.isAddingFolder.set(false);
    this.addFolderParentPath.set(null);
  }

  onExpandToggle(folderPath: string): void {
    this.expandedPaths.update((expanded) => {
      const newSet = new Set(expanded);
      if (newSet.has(folderPath)) {
        newSet.delete(folderPath);
      } else {
        newSet.add(folderPath);
      }
      return newSet;
    });
  }

  onTreeKeydown(event: KeyboardEvent): void {
    const visiblePaths = this.#getVisibleFolderPaths();
    if (visiblePaths.length === 0) {
      return;
    }

    const currentFocus = this.focusedPath();
    const currentIndex = currentFocus !== null ? visiblePaths.indexOf(currentFocus) : -1;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (currentIndex < visiblePaths.length - 1) {
          this.focusedPath.set(visiblePaths[currentIndex + 1]);
        } else if (currentIndex === -1) {
          this.focusedPath.set(visiblePaths[0]);
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (currentIndex > 0) {
          this.focusedPath.set(visiblePaths[currentIndex - 1]);
        }
        break;

      case 'ArrowRight':
        event.preventDefault();
        if (currentFocus !== null) {
          this.expandedPaths.update((expanded) => {
            const newSet = new Set(expanded);
            newSet.add(currentFocus);
            return newSet;
          });
        }
        break;

      case 'ArrowLeft':
        event.preventDefault();
        if (currentFocus !== null) {
          const expanded = this.expandedPaths();
          if (expanded.has(currentFocus)) {
            this.expandedPaths.update((exp) => {
              const newSet = new Set(exp);
              newSet.delete(currentFocus);
              return newSet;
            });
          } else {
            const parentPath = this.#getParentPath(currentFocus);
            if (parentPath !== null) {
              this.focusedPath.set(parentPath);
            }
          }
        }
        break;

      case 'Enter':
      case ' ':
        event.preventDefault();
        if (currentFocus !== null) {
          this.onFolderSelect(currentFocus);
        }
        break;
    }
  }

  #getVisibleFolderPaths(): string[] {
    const paths: string[] = [];
    const expanded = this.expandedPaths();

    const collectPaths = (folders: FolderNodeDto[], _parentPath = ''): void => {
      for (const folder of folders) {
        paths.push(folder.fullPath);
        if (expanded.has(folder.fullPath) && folder.loaded && folder.tree?.children) {
          collectPaths(folder.tree.children, folder.fullPath);
        }
      }
    };

    collectPaths(this.rootFolders());
    return paths;
  }

  #getParentPath(path: string): string | null {
    const lastDotIndex = path.lastIndexOf('.');
    if (lastDotIndex === -1) {
      return null;
    }
    return path.substring(0, lastDotIndex);
  }
}
