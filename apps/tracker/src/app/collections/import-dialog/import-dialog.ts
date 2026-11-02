import { DOCUMENT, LowerCasePipe, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { IMPORT_UPLOAD_EXTENSIONS, type ImportStrategyDto } from '@simoncodes-ca/data-transfer';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import { codeMarkup } from '../../shared/code-markup';
import { LOCAL_STORAGE } from '../../shared/storage/browser-storage';
import { STATUS_PRESENTATION } from '../../shared/translation-status/translation-status-presentation';
import { splitAfterSeparators } from '../../shared/utils/split-after-separators';
import { CollectionsStore } from '../store/collections.store';
import { submitDialogJob } from '../store/dialog-config-submit';
import { formatModified } from './format-modified';
import type { ImportDialogData, ImportDialogResult } from './import-dialog-data';
import {
  BYTES_PER_MB,
  DISPLAY_DECIMALS,
  ISSUE_ROWS,
  importFooter,
  importPlanPresentation,
  importFilesError,
} from './import-dialog-decisions';
import { changedAdvancedCount, changedOptionCount, effectiveOptions } from './import-draft';
import { ImportForm, type ImportSection } from './import-form';

interface StrategyCard {
  readonly value: ImportStrategyDto;
  readonly title: string;
  readonly hint: string;
}

const STRATEGY_CARDS: readonly StrategyCard[] = [
  {
    value: 'translation-service',
    title: TRACKER_TOKENS.IMPORT.DIALOG.STRATEGY.TRANSLATIONSERVICE,
    hint: TRACKER_TOKENS.IMPORT.DIALOG.STRATEGY.TRANSLATIONSERVICEHINT,
  },
  {
    value: 'verification',
    title: TRACKER_TOKENS.IMPORT.DIALOG.STRATEGY.VERIFICATION,
    hint: TRACKER_TOKENS.IMPORT.DIALOG.STRATEGY.VERIFICATIONHINT,
  },
  {
    value: 'migration',
    title: TRACKER_TOKENS.IMPORT.DIALOG.STRATEGY.MIGRATION,
    hint: TRACKER_TOKENS.IMPORT.DIALOG.STRATEGY.MIGRATIONHINT,
  },
  {
    value: 'update',
    title: TRACKER_TOKENS.IMPORT.DIALOG.STRATEGY.UPDATE,
    hint: TRACKER_TOKENS.IMPORT.DIALOG.STRATEGY.UPDATEHINT,
  },
];

/** Rows listed beyond this stay in the well's scroll area; the stagger stops here. */
const STAGGER_ROWS = 12;
const BYTES_PER_KB = 1024;

function sizeLabel(bytes: number): string {
  // Technical units, not copy.
  return bytes >= BYTES_PER_MB
    ? `${(bytes / BYTES_PER_MB).toFixed(DISPLAY_DECIMALS)} MB`
    : `${Math.round(bytes / BYTES_PER_KB)} KB`;
}

@Component({
  selector: 'app-import-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LowerCasePipe,
    NgTemplateOutlet,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatTooltipModule,
    TranslocoPipe,
  ],
  templateUrl: './import-dialog.html',
  styleUrl: './import-dialog.scss',
})
export class ImportDialog {
  readonly #dialogRef = inject<MatDialogRef<ImportDialog, ImportDialogResult | undefined>>(MatDialogRef);
  readonly #data = inject<ImportDialogData>(MAT_DIALOG_DATA);
  readonly #transloco = inject(TranslocoService);
  readonly #destroyRef = inject(DestroyRef);
  readonly store = inject(CollectionsStore);

  readonly TOKENS = TRACKER_TOKENS;
  readonly strategyCards = STRATEGY_CARDS;
  readonly stagger = STAGGER_ROWS;
  readonly issueRows = ISSUE_ROWS;
  readonly statusLabel = (status: keyof typeof STATUS_PRESENTATION): string => STATUS_PRESENTATION[status].labelToken;

  readonly model = new ImportForm({
    data: this.#data,
    translate: (key, params) => this.#transloco.translate(key, params),
    config: () => this.store.config(),
    listSources: (collection, folder) => this.store.listImportSources(collection, folder),
    dryRun: (request) => this.store.dryRunImport(request),
    uploadSources: (collection, files, options) => this.store.uploadImportSources(collection, files, options),
    storage: inject(LOCAL_STORAGE),
  });
  readonly saving = this.model.saving;
  readonly previewOpen = signal(false);
  readonly dragOver = signal(false);
  #dragDepth = 0;
  readonly #document = inject(DOCUMENT);
  /** What the upload did, in the words that stay accurate: all checked, some not listed, or some not checkable. */
  readonly uploadMessage = computed(() => {
    const notice = this.model.uploadNotice();
    const source = TRACKER_TOKENS.IMPORT.DIALOG.SOURCE;
    if (!notice) return undefined;
    if (notice.listed < notice.uploaded)
      return { token: source.UPLOADEDPARTIALX, params: { listed: notice.listed, count: notice.uploaded } };
    if (notice.checked < notice.uploaded)
      return { token: source.UPLOADEDUNCHECKEDX, params: { count: notice.uploaded, checked: notice.checked } };
    return { token: source.UPLOADEDX, params: { count: notice.uploaded } };
  });
  /** Technical value for the file input's `accept`, not copy. */
  readonly uploadAccept = IMPORT_UPLOAD_EXTENSIONS.join(',');
  readonly #advancedChoice = signal<boolean | undefined>(undefined);
  /** Open by default when no primary option rows are shown (every strategy but migration); never persisted. */
  readonly advancedOpen = computed(() => this.#advancedChoice() ?? !this.isMigration());
  readonly listing = this.model.listing;

  /** A previous plan is never shown beside a failed preview. */
  readonly plan = computed(() => (this.model.preview.status() === 'error' ? undefined : this.model.preview.plan()));
  readonly options = computed(() => effectiveOptions(this.model.draft()));
  readonly isMigration = computed(() => this.model.draft().strategy === 'migration');
  readonly changedOptions = computed(() => changedOptionCount(this.model.draft()));
  readonly changedAdvanced = computed(() => changedAdvancedCount(this.model.draft()));
  readonly strategyTitle = computed(
    () => STRATEGY_CARDS.find((card) => card.value === this.model.draft().strategy)?.title ?? '',
  );
  readonly strategyNote = computed(() =>
    this.isMigration()
      ? TRACKER_TOKENS.IMPORT.DIALOG.STRATEGY.MIGRATIONNOTE
      : TRACKER_TOKENS.IMPORT.DIALOG.STRATEGY.PROTECTEDNOTE,
  );
  readonly railErrors = computed<ReadonlySet<string>>(() => new Set<string>(this.model.sectionErrors()));

  /** Checklist rows in the Collections page's grid order (case-insensitive by name). */
  readonly collectionRows = computed(() => {
    const collections = this.store.config()?.collections ?? {};
    return [...this.model.collectionNames()]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map((name) => ({
        name,
        folderParts: splitAfterSeparators(collections[name]?.translationsFolder ?? ''),
        readOnly: collections[name]?.readOnly === true,
      }));
  });
  readonly folderShown = computed(() => this.model.listing()?.folder ?? this.model.draft().folder.trim());
  /** The folder as mono `<code>` runs that may break after each separator, as export's resolved path. */
  readonly folderMarkup = computed(() => splitAfterSeparators(this.folderShown()).map(codeMarkup).join('<wbr>'));
  readonly fileRows = computed(() =>
    this.model.rows().map((row) => ({
      ...row,
      formatToken:
        row.file.format === 'json'
          ? TRACKER_TOKENS.EXPORT.DIALOG.FORMAT.JSON
          : TRACKER_TOKENS.EXPORT.DIALOG.FORMAT.XLIFF,
      size: sizeLabel(row.file.sizeBytes),
      modified: formatModified(row.file.modifiedAt, new Date(), this.#transloco.getActiveLang()),
    })),
  );
  readonly allChecked = computed(() => {
    const selectable = this.model.rows().filter((row) => !row.blocked);
    return selectable.length > 0 && selectable.every((row) => row.checked);
  });
  readonly folderEmpty = computed(
    () =>
      this.model.listingStatus() === 'ready' && this.model.listing()?.exists === true && this.fileRows().length === 0,
  );
  readonly folderMissing = computed(
    () => this.model.listingStatus() === 'ready' && this.model.listing()?.exists === false,
  );
  /** Field-level messages: shown only once the section's errors are revealed. */
  readonly collectionError = computed(() => {
    if (!this.model.sectionErrors().has('source')) return undefined;
    const control = this.model.form.controls.collection;
    if (control.hasError('collectionReadOnly')) return TRACKER_TOKENS.IMPORT.DIALOG.VALIDATION.COLLECTIONREADONLY;
    return control.hasError('collectionRequired')
      ? TRACKER_TOKENS.IMPORT.DIALOG.VALIDATION.COLLECTIONREQUIRED
      : undefined;
  });
  readonly filesError = computed(() =>
    importFilesError({
      problem: this.model.problem(),
      invalid: this.model.form.controls.files.invalid,
      touched: this.model.form.controls.files.touched,
      attempted: this.model.submitAttempted(),
      obsoleteLocale: this.model.hasObsoleteLocale(),
    }),
  );

  readonly presentation = computed(() => importPlanPresentation(this.plan(), this.model.listing()));

  readonly footer = computed(() =>
    importFooter({
      readOnly: this.model.readOnly(),
      settings: !!this.model.settings(),
      uploadStatus: this.model.uploadStatus(),
      listingStatus: this.model.listingStatus(),
      checkedCount: this.model.checkedCount(),
      everyFileUnreadable: this.presentation().everyFileUnreadable,
      valid: this.model.valid(),
      stale: this.model.preview.stale(),
      status: this.model.preview.status(),
      plan: this.plan(),
      saving: this.saving(),
      running: this.store.isImporting(),
    }),
  );

  constructor() {
    // The config can arrive after the dialog opens; reseed and reconcile once it does.
    effect(() => {
      if (this.store.config()) untracked(() => this.model.configLoaded());
    });
    // A drag can end where the zone never hears it (a hovered row replaced by a relist, a drop outside
    // the zone), so the document ends it too, and so does anything that replaces the well's contents.
    const endDrag = () => this.#resetDrag();
    this.#document.addEventListener('dragend', endDrag);
    this.#document.addEventListener('drop', endDrag);
    effect(() => {
      this.model.listing();
      this.model.listingStatus();
      this.model.activeSection();
      untracked(() => this.#resetDrag());
    });
    this.#destroyRef.onDestroy(() => {
      this.#document.removeEventListener('dragend', endDrag);
      this.#document.removeEventListener('drop', endDrag);
      this.model.destroy();
    });
  }

  #resetDrag(): void {
    this.#dragDepth = 0;
    this.dragOver.set(false);
  }

  /**
   * Focus follows the clicked rail item. Safari does not focus a button on click, which would
   * leave the ring on the item that had focus when the dialog opened beside the selected fill.
   */
  activate(section: ImportSection, event?: Event): void {
    this.model.activeSection.set(section);
    if (event?.currentTarget instanceof HTMLElement) event.currentTarget.focus({ preventScroll: true });
  }

  /** Arrow keys move through a radio group natively; this keeps the strategy rows in step with it. */
  chooseStrategy(strategy: ImportStrategyDto): void {
    this.model.setStrategy(strategy);
  }

  chooseCollection(name: string): void {
    this.model.selectCollection(name);
  }

  onFilesPicked(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const files = Array.from(input.files ?? []);
    // Picking the same file again must still fire `change`.
    input.value = '';
    this.model.uploadFiles(files);
  }

  /** The browser would otherwise navigate to a dropped file, so the zone always claims the drag. */
  onDragEnter(event: DragEvent): void {
    event.preventDefault();
    this.#dragDepth += 1;
    this.dragOver.set(this.#carriesFiles(event));
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(this.#carriesFiles(event));
  }

  /** Moving over a child fires leave on the zone, so the highlight ends only when the depth returns to zero. */
  onDragLeave(): void {
    this.#dragDepth = Math.max(0, this.#dragDepth - 1);
    if (this.#dragDepth === 0) this.dragOver.set(false);
  }

  #carriesFiles(event: DragEvent): boolean {
    return this.model.canUpload() && event.dataTransfer?.types.includes('Files') === true;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.#resetDrag();
    if (this.model.canUpload()) this.model.uploadFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  toggleFile(path: string, checked: boolean): void {
    this.model.toggleFile(path, checked);
  }

  onLocaleChange(path: string, event: Event): void {
    if (event.target instanceof HTMLSelectElement) this.model.setLocale(path, event.target.value);
  }

  setOption(name: Parameters<ImportForm['setOption']>[0], value: boolean): void {
    this.model.setOption(name, value);
  }

  toggleAllFiles(): void {
    this.model.setAllFiles(!this.allChecked());
  }

  retryListing(): void {
    this.model.retryListing();
  }

  retryPreview(): void {
    this.model.retryPreview();
  }

  /** The footer's invalid state is actionable: show the errors and jump to the first marked section. */
  fixSections(): void {
    this.model.revealErrors();
  }

  togglePreview(): void {
    this.previewOpen.update((open) => !open);
  }

  toggleAdvanced(): void {
    this.#advancedChoice.set(!this.advancedOpen());
  }

  onCancel(): void {
    this.#dialogRef.close(undefined);
  }

  onSubmit(): void {
    if (!this.footer().canSubmit) return;
    submitDialogJob({
      dialogRef: this.#dialogRef,
      start: this.model.submit((request) => this.store.startImport(request)),
      destroyRef: this.#destroyRef,
    });
  }
}
