import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  type OnInit,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { FolderNodeDto } from '@simoncodes-ca/data-transfer';
import { collectAncestorPaths } from '@simoncodes-ca/domain';
import { TRACKER_TOKENS } from '../../../../../i18n-types/tracker-resources';
import { injectFeedback } from '../../../feedback';
import { BrowserStore } from '../../../store/browser.store';
import { FolderDraftSession } from '../../../store/folder-draft';
import { expandTreePath, navigateTree, PICKER_NAVIGATION } from '../../../store/tree-navigation';
import { PickerFolderNode } from './picker-folder-node/picker-folder-node';

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
  imports: [CommonModule, MatIconModule, MatButtonModule, PickerFolderNode, TranslocoPipe],
  templateUrl: './folder-picker.html',
  styleUrl: './folder-picker.scss',
})
export class FolderPicker implements OnInit {
  readonly #store = inject(BrowserStore);
  readonly #destroyRef = inject(DestroyRef);
  readonly #feedback = injectFeedback();
  readonly #transloco = inject(TranslocoService);
  readonly TOKENS = TRACKER_TOKENS;

  /** Current folder path (persisted selection) */
  readonly currentPath = input.required<string>();

  /** Root folders from the folder tree */
  readonly rootFolders = input.required<FolderNodeDto[]>();

  /** Emitted when a folder selection is confirmed */
  readonly folderConfirmed = output<string>();

  /** Emitted when a new folder is created */
  readonly folderCreated = output<FolderNodeDto>();

  /** When true, the folder tree is shown immediately and the currentPath ancestors are expanded */
  readonly initiallyExpanded = input(false);

  /**
   * Hides the picker's own "Folder: path" row. Inside the editor's location
   * popover the pill that opened the popover already states the path, so a
   * second copy of it above the tree is noise.
   */
  readonly hideHeader = input(false);

  readonly isExpanded = signal(false);
  readonly expandedPaths = signal<ReadonlySet<string>>(new Set());
  readonly selectedPath = signal<string | null>(null);
  readonly focusedPath = signal<string | null>(null);
  readonly isAddingFolder = computed(() => this.#draftSession.state().isAddingFolder);
  readonly addFolderParentPath = computed(() => this.#draftSession.state().addFolderParentPath);
  readonly #draftSession = new FolderDraftSession({
    create: (name, parent) => this.#store.createFolder(name, parent),
    staleDraft: 'cancel',
    revealParent: (path) => this.expandedPaths.update((expanded) => new Set(expanded).add(path)),
    created: (folder) => {
      this.folderCreated.emit(folder);
      this.selectedPath.set(folder.fullPath);
    },
  });
  readonly isCreatingFolder = this.#draftSession.isCreating;

  /**
   * The refusal of the last create, as Folder Writes decided it, shown under the still-open input.
   * The picker keeps its own add-folder draft rather than the store's: the editor dialog is open
   * over the sidebar, and a shared draft would also open (and focus) the sidebar's input behind
   * the dialog. The store keeps the refusal for a create made from its own draft only, so the
   * picker holds this one itself.
   */
  readonly createError = computed(() => {
    const feedback = this.#draftSession.state().folderCreateError;
    return feedback ? this.#feedback.text(feedback) : null;
  });

  readonly displayPath = computed(() => {
    const rootLabel = this.#transloco.translate(TRACKER_TOKENS.BROWSER.FOLDERPICKER.ROOTLABEL) || 'root';
    const stagedPath = this.selectedPath();
    if (stagedPath !== null) {
      return stagedPath || rootLabel;
    }
    const current = this.currentPath();
    return current || rootLabel;
  });

  readonly chevronIcon = computed(() => {
    return this.isExpanded() ? 'expand_less' : 'expand_more';
  });

  readonly hasRootFolders = computed(() => {
    return this.rootFolders().length > 0;
  });

  ngOnInit(): void {
    if (this.initiallyExpanded()) {
      this.isExpanded.set(true);
      const currentPath = this.currentPath();
      if (currentPath) {
        this.selectedPath.set(currentPath);
        // Note: we intentionally don't emit folderConfirmed here because the
        // parent dialog already has the correct path from its data.
        // Expand all ancestor segments so the current path is visible
        this.expandedPaths.set(new Set([...collectAncestorPaths(currentPath), currentPath]));
      }
    }
  }

  toggleExpanded(): void {
    if (this.initiallyExpanded()) {
      return;
    }
    this.isExpanded.update((expanded) => !expanded);
    if (!this.isExpanded()) {
      this.selectedPath.set(null);
      this.focusedPath.set(null);
    }
  }

  onFolderSelect(folderPath: string): void {
    this.selectedPath.set(folderPath);
    this.folderConfirmed.emit(folderPath);
    if (!this.initiallyExpanded()) {
      this.isExpanded.set(false);
    }
    this.focusedPath.set(null);
  }

  onCreateFirstFolder(): void {
    this.#draftSession.start('');
  }

  onAddFolder(parentPath: string): void {
    this.#draftSession.start(parentPath);
  }

  onFolderNameConfirmed(folderName: string): void {
    if (this.addFolderParentPath() === null) return;
    this.#draftSession
      .confirm(folderName)
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe((outcome) => this.#feedback.toast(outcome.feedback));
  }

  onFolderNameEdited(): void {
    this.#draftSession.edit();
  }

  onFolderNameCancelled(): void {
    this.#draftSession.cancel();
  }

  onExpandToggle(folderPath: string): void {
    this.expandedPaths.update((expanded) => expandTreePath(expanded, folderPath));
  }

  onTreeKeydown(event: KeyboardEvent): void {
    const next = navigateTree(
      {
        focusedPath: this.focusedPath(),
        expanded: this.expandedPaths().has(this.focusedPath() ?? ''),
        hasChildren: false,
        hasRows: this.rootFolders().length > 0,
        tree: { nodes: this.rootFolders(), expandedPaths: this.expandedPaths() },
      },
      event.key,
      PICKER_NAVIGATION,
    );
    if (next.preventDefault) event.preventDefault();
    const intent = next.intent;
    switch (intent.kind) {
      case 'focus':
        this.focusedPath.set(intent.path);
        break;
      case 'expand':
        this.expandedPaths.update((paths) => expandTreePath(paths, intent.path, true));
        break;
      case 'collapse':
        this.expandedPaths.update((paths) => expandTreePath(paths, intent.path, false));
        break;
      case 'select':
        this.onFolderSelect(intent.path);
        break;
      case 'none':
        break;
    }
  }
}
