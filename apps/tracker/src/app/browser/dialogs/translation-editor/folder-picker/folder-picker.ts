import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { FolderNodeDto } from '@simoncodes-ca/data-transfer';
import { FolderNode } from '../../../sidebar/folder-tree/folder-node/folder-node';

/**
 * Folder picker component for the Translation Editor Dialog.
 *
 * Features:
 * - Display selected folder path
 * - Expand/collapse folder tree
 * - Allow folder selection from tree
 * - Support custom folder path input
 * - Show "new folder" indicator for non-existent folders
 */
@Component({
  selector: 'app-folder-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
    FolderNode,
  ],
  templateUrl: './folder-picker.html',
  styleUrl: './folder-picker.scss',
})
export class FolderPicker {
  /** Current folder path selection */
  selectedPath = input.required<string>();

  /** Root folders from the folder tree */
  rootFolders = input.required<FolderNodeDto[]>();

  /** Whether the folder exists in the tree */
  folderExists = input<boolean>(true);

  /** Emitted when a folder is selected */
  folderSelected = output<string>();

  /** Emitted when a folder needs to be loaded */
  loadFolder = output<string>();

  readonly isExpanded = signal<boolean>(false);
  readonly customInput = signal<string>('');

  readonly displayPath = computed(() => {
    const path = this.selectedPath();
    return path || 'root';
  });

  readonly chevronIcon = computed(() => {
    return this.isExpanded() ? 'expand_less' : 'expand_more';
  });

  toggleExpanded(): void {
    this.isExpanded.update(expanded => !expanded);
  }

  onFolderClick(folder: FolderNodeDto): void {
    this.folderSelected.emit(folder.fullPath);
    this.customInput.set('');
    this.isExpanded.set(false);
  }

  onLoadFolder(folderPath: string): void {
    this.loadFolder.emit(folderPath);
  }

  selectRoot(): void {
    this.folderSelected.emit('');
    this.customInput.set('');
    this.isExpanded.set(false);
  }

  onCustomInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.trim();

    this.customInput.set(value);

    if (value) {
      this.folderSelected.emit(value);
    }
  }

  onCustomInputKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.isExpanded.set(false);
    }
  }
}
