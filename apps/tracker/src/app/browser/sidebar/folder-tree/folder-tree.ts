import { Component, ChangeDetectionStrategy, inject, input, output, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
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
  readonly TOKENS = TRACKER_TOKENS;

  /** Name of the collection to browse */
  collectionName = input.required<string>();

  /** Whether the tree is disabled (e.g., during translation search) */
  disabled = input<boolean>(false);

  /** Emitted when a folder is selected */
  folderSelected = output<string>();

  /** Signal exposing nested resources visibility from store */
  readonly showNestedResources = this.store.showNestedResources;

  /** Signal exposing whether a folder is being added */
  readonly isAddingFolder = this.store.isAddingFolder;

  /** Signal exposing the parent path for the folder being added */
  readonly addFolderParentPath = this.store.addFolderParentPath;

  readonly #searchSubject = new Subject<string>();

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
}
