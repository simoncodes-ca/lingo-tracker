import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  inject,
  input,
  output,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FolderNode } from './folder-node/folder-node';
import { FolderTreeStore } from './folder-tree.store';
import { FolderNodeDto } from '@simoncodes-ca/data-transfer';

/**
 * FolderTree component for hierarchical folder navigation.
 *
 * Features:
 * - Search/filter folders
 * - Progressive loading (click to load)
 * - Folder selection
 * - Disabled state during search
 */
@Component({
  selector: 'app-folder-tree',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [FolderTreeStore],
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    FolderNode,
  ],
  templateUrl: './folder-tree.html',
  styleUrl: './folder-tree.scss',
})
export class FolderTree implements OnInit {
  readonly store = inject(FolderTreeStore);

  /** Name of the collection to browse */
  collectionName = input.required<string>();

  /** Whether the tree is disabled (e.g., during translation search) */
  disabled = input<boolean>(false);

  /** Emitted when a folder is selected */
  folderSelected = output<string>();

  readonly #searchSubject = new Subject<string>();

  constructor() {
    // Sync disabled state to store
    effect(() => {
      this.store.setDisabled(this.disabled());
    });

    // Debounce search input
    this.#searchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed()
      )
      .subscribe((value) => {
        this.store.setSearchFilter(value);
      });
  }

  ngOnInit(): void {
    this.store.loadRootFolders(this.collectionName());
  }

  /**
   * Handles folder click events from child nodes.
   */
  onFolderClick(folder: FolderNodeDto): void {
    this.store.selectFolder(folder.fullPath);
    this.folderSelected.emit(folder.fullPath);
  }

  /**
   * Handles load folder requests from child nodes.
   */
  onLoadFolder(folderPath: string): void {
    this.store.loadFolderChildren({
      collectionName: this.collectionName(),
      folderPath,
    });
  }

  /**
   * Handles search input changes with debouncing.
   */
  onSearchChange(value: string): void {
    this.#searchSubject.next(value);
  }
}
