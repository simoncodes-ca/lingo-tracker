import {
  Component,
  ChangeDetectionStrategy,
  inject,
  type OnInit,
  type OnDestroy,
  type AfterViewInit,
  signal,
  computed,
  HostListener,
  ViewChild,
  type ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, Validators, FormArray } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatAutocompleteModule, type MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatTooltipModule } from '@angular/material/tooltip';
import { OverlayModule } from '@angular/cdk/overlay';
import { TextFieldModule } from '@angular/cdk/text-field';
import { NotificationService } from '../../../shared/notification';
import type {
  ResourceSummaryDto,
  TranslationStatus,
  CreateResourceDto,
  CreateResourceResponseDto,
  UpdateResourceDto,
  UpdateResourceResponseDto,
  SearchResultDto,
  FolderNodeDto,
} from '@simoncodes-ca/data-transfer';
import { BrowserApiService } from '../../services/browser-api.service';
import { BrowserStore } from '../../store/browser.store';
import { HttpErrorResponse } from '@angular/common/http';
import { ConfirmationDialog } from '../../../shared/components/confirmation-dialog/confirmation-dialog';
import type { ConfirmationDialogData } from '../../../shared/components/confirmation-dialog/confirmation-dialog-data';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { SimilarTranslations } from './similar-translations';
import { filterSimilarByValue, SIMILAR_SEARCH_MAX_RESULTS } from './similar-value-filter';
import { FolderPicker } from './folder-picker/folder-picker';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError, takeUntil, tap } from 'rxjs/operators';
import { of } from 'rxjs';
import { isValidSegment, normalizeTag } from '@simoncodes-ca/domain';

/**
 * The id of the dialog's heading. The MatDialog container is labelled by this id
 * (`ariaLabelledBy`) and the template stamps it onto the `<h2>`, so the two can
 * never drift apart.
 */
export const TRANSLATION_EDITOR_TITLE_ID = 'translation-editor-title';

export interface TranslationEditorDialogData {
  mode: 'create' | 'edit';
  resource?: ResourceSummaryDto;
  collectionName: string;
  folderPath?: string;
  availableLocales: string[];
  baseLocale: string;
  /** When true, the dialog opens in view-only mode: inputs disabled, no save. */
  readOnly?: boolean;
}

interface TranslationFormValue {
  key: string;
  baseValue: string;
  comment: string;
  translations: LocaleTranslation[];
}

interface LocaleTranslation {
  locale: string;
  value: string;
  status: TranslationStatus;
}

/** One row of the context column's "Where it lands" tree. */
export interface ContextTreeNode {
  kind: 'folder' | 'entry' | 'more';
  name: string;
  path: string;
  depth: number;
  /** The folder the entry lands in. */
  here?: boolean;
  expanded?: boolean;
  /** The entry this dialog is writing, and what it is doing to it. */
  mark?: 'new' | 'editing' | 'exists';
}

export interface TranslationEditorResult {
  key: string;
  baseValue: string;
  comment?: string;
  folderPath: string;
  translations?: LocaleTranslation[];
  success?: boolean;
  shouldOpenEdit?: boolean;
  existingResourceKey?: string;
  resource?: ResourceSummaryDto;
  /** Locales skipped during auto-translation due to ICU format incompatibility. */
  skippedLocales?: string[];
}

@Component({
  standalone: true,
  selector: 'app-translation-editor-dialog',
  templateUrl: './translation-editor-dialog.html',
  styleUrls: ['./translation-editor-dialog.scss', './translation-editor-context.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    OverlayModule,
    TextFieldModule,
    MatAutocompleteModule,
    SimilarTranslations,
    FolderPicker,
    TranslocoPipe,
    MatTooltipModule,
  ],
})
export class TranslationEditorDialog implements OnInit, OnDestroy, AfterViewInit {
  /** How many sibling entries the context tree lists before it counts the rest. */
  private static readonly CONTEXT_TREE_ENTRY_LIMIT = 8;

  private readonly dialogRef = inject(MatDialogRef<TranslationEditorDialog>);
  private readonly dialog = inject(MatDialog);
  private readonly browserApi = inject(BrowserApiService);
  private readonly browserStore = inject(BrowserStore);
  private readonly notifications = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroy$ = new Subject<void>();
  private readonly baseValueSearch$ = new Subject<string>();

  readonly data = inject<TranslationEditorDialogData>(MAT_DIALOG_DATA);
  readonly TOKENS = TRACKER_TOKENS;
  /** Exposed to the template so the heading id matches the container's `aria-labelledby`. */
  readonly titleId = TRANSLATION_EDITOR_TITLE_ID;

  @ViewChild('keyInput') keyInput?: ElementRef<HTMLInputElement>;
  @ViewChild('baseValueInput') baseValueInput?: ElementRef<HTMLTextAreaElement>;
  /** The Comment field, so the empty-comment confirmation can hand the caret to it. */
  @ViewChild('commentInput') commentInput?: ElementRef<HTMLTextAreaElement>;
  /** The tree inside the location popover, so "New folder" can reuse its creation flow. */
  @ViewChild(FolderPicker) folderPicker?: FolderPicker;
  /** Focus anchors: opening a panel moves focus in, closing it hands focus back. */
  @ViewChild('locationPill') locationPill?: ElementRef<HTMLButtonElement>;
  @ViewChild('otherLocalesRow') otherLocalesRow?: ElementRef<HTMLButtonElement>;
  @ViewChild('folderFilterInput') folderFilterInput?: ElementRef<HTMLInputElement>;
  @ViewChild('drawerFirstControl') drawerFirstControl?: ElementRef<HTMLElement>;

  #commentConfirmationShown = false;
  #originalBaseValue = '';
  #originalTags: string[] = [];
  #originalFolderPath = '';
  /**
   * The folder path this dialog last derived from a dotted key. Typing `a.` then
   * `b.` has to extend `a`, not re-anchor on `b`; a folder the user picked on the
   * Location tab is never extended, only replaced.
   */
  #folderFromKey: string | null = null;
  #locationFlashTimer: ReturnType<typeof setTimeout> | undefined;
  #keyCopiedTimer: ReturnType<typeof setTimeout> | undefined;

  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly similarResources = signal<SearchResultDto[]>([]);
  readonly isSearchingSimilar = signal(false);
  readonly baseValueLength = signal(0);
  /** The English value as typed, for the exact-match test against the pinned hits. */
  readonly baseValueText = signal('');
  /** True while the location pill is highlighting a folder it just absorbed from the key field. */
  readonly locationAbsorbedFlash = signal(false);
  /** Live-region text announcing the same move to a screen reader, which cannot see the flash. */
  readonly locationAbsorbedMessage = signal('');
  /** Set once the user attempts to save, so errors surface on untouched fields too. */
  readonly submitAttempted = signal(false);
  /** True for a moment after the footer key is copied, so the button can confirm it. */
  readonly keyJustCopied = signal(false);

  /** The folder picker popover anchored to the location pill. */
  readonly isFolderPopoverOpen = signal(false);
  /** The folder staged inside the popover; only committed by "Use this folder". */
  readonly stagedFolderPath = signal<string | null>(null);
  /** Filter text typed in the popover, matched against folder paths. */
  readonly folderFilter = signal('');
  /** The other-locales drawer sliding over the context column. */
  readonly isLocalesDrawerOpen = signal(false);
  /** The context disclosure shown in place of the column below 1100px. */
  readonly isContextOpen = signal(false);
  /**
   * Entry keys per folder path, loaded once each and kept for the dialog's life.
   * The browser's own folder is never re-fetched — the store already holds it —
   * and picking a folder in the popover never moves the browser behind us.
   */
  readonly #loadedFolderEntries = signal<ReadonlyMap<string, readonly string[]>>(new Map());
  /** Folders whose entries are in flight. A folder in here claims no collision yet. */
  readonly #loadingFolders = signal<ReadonlySet<string>>(new Set());

  readonly tagInputText = signal('');
  readonly tagsList = signal<string[]>([]);
  readonly inheritedTagsList = computed(() => this.data.resource?.inheritedTags ?? []);

  readonly form = new FormGroup({
    key: new FormControl<string>('', {
      validators: [Validators.required, Validators.pattern(/^[a-zA-Z0-9_-]+$/)],
      nonNullable: true,
    }),
    baseValue: new FormControl<string>('', {
      validators: [Validators.required],
      nonNullable: true,
    }),
    comment: new FormControl<string>('', {
      nonNullable: true,
    }),
    translations: new FormArray<
      FormGroup<{
        locale: FormControl<string>;
        value: FormControl<string>;
        status: FormControl<TranslationStatus>;
      }>
    >([]),
  });

  readonly selectedFolderPath = signal<string>('');

  readonly rootFolders = computed(() => this.browserStore.rootFolders());

  readonly otherLocales = computed(() =>
    this.data.availableLocales.filter((locale) => locale !== this.data.baseLocale),
  );

  readonly translationStatusOptions: TranslationStatus[] = ['new', 'translated', 'stale', 'verified'];

  readonly isEditMode = computed(() => this.data.mode === 'edit');
  /** Whether the dialog is view-only because the collection is read-only. */
  readonly isReadOnly = computed(() => this.data.readOnly === true);
  readonly dialogTitle = computed(() =>
    this.isEditMode()
      ? TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.EDITTITLE
      : TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CREATETITLE,
  );
  readonly dialogSubtitle = computed(() =>
    this.isEditMode()
      ? TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.EDITSUBTITLEX
      : TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CREATESUBTITLEX,
  );
  readonly saveButtonLabel = computed(() =>
    this.isEditMode()
      ? TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.UPDATEBUTTON
      : TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.SAVEBUTTON,
  );
  readonly hasSearchQuery = computed(() => this.baseValueLength() >= 3);

  /**
   * Bumped on every form status change. Reactive forms are not signal-based, so
   * anything computed from validity has to read this to stay live.
   */
  readonly formRevision = signal(0);

  /**
   * Live "this key is already taken in the target folder" state.
   *
   * Matches the rule the writer uses: `addResource` resolves the key to a folder
   * and a single entry key, then asks whether that entry key is already a
   * property of the folder's `resource_entries.json` — an exact, case-sensitive
   * string match. So does this. In edit mode the key is locked, so there is
   * nothing to collide with; while a folder's entries are still loading nothing
   * is claimed either way.
   */
  readonly keyCollision = computed(() => {
    this.formRevision();
    if (this.isEditMode()) {
      return false;
    }
    const key = this.form.controls.key.value.trim();
    if (!key) {
      return false;
    }
    return this.#folderEntryKeys(this.selectedFolderPath())?.has(key) === true;
  });

  /** Live form validity, for the footer's earned check glyph. */
  readonly isFormValid = computed(() => {
    this.formRevision();
    return this.form.valid && !this.keyCollision();
  });

  /** True once the key control is both invalid and worth complaining about. */
  readonly showKeyError = computed(() => {
    this.formRevision();
    return this.form.controls.key.invalid && (this.form.controls.key.touched || this.submitAttempted());
  });

  /** True once the English value is both missing and worth complaining about. */
  readonly showBaseValueError = computed(() => {
    this.formRevision();
    return this.form.controls.baseValue.invalid && (this.form.controls.baseValue.touched || this.submitAttempted());
  });

  /** Localized label for a translation status, so the spine never shows raw enum text. */
  readonly statusLabels: Record<TranslationStatus, string> = {
    new: TRACKER_TOKENS.BROWSER.STATUS.NEW,
    translated: TRACKER_TOKENS.BROWSER.STATUS.TRANSLATED,
    stale: TRACKER_TOKENS.BROWSER.STATUS.STALE,
    verified: TRACKER_TOKENS.BROWSER.STATUS.VERIFIED,
  };

  /** Explains a disabled Other locales row instead of leaving it silently grey. */
  readonly otherLocalesDisabledTooltip = computed(() =>
    this.otherLocales().length === 0
      ? this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.NOOTHERLOCALESTOOLTIP)
      : '',
  );

  /** Explains a disabled location trigger instead of leaving it silently grey. */
  readonly locationDisabledTooltip = computed(() =>
    this.isReadOnly() ? this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.READONLYTABTOOLTIP) : '',
  );

  /** The complete dot-delimited key, for the location pill's tooltip. */
  readonly fullKeyPreview = computed(() => {
    this.formRevision();
    const folder = this.selectedFolderPath();
    const key = this.form.controls.key.value.trim();
    if (!key) {
      return folder;
    }
    return folder ? `${folder}.${key}` : key;
  });

  /** The base locale under a name a reader recognises ("English"), for the value label. */
  readonly baseLocaleName = computed(() => this.getLocaleDisplayName(this.data.baseLocale));

  /** The target folder split into the segments the location pill renders with `›` between them. */
  readonly folderSegments = computed(() =>
    this.selectedFolderPath()
      .split('.')
      .filter((segment) => segment.length > 0),
  );

  /** Every non-base locale with the value and status the form currently holds. */
  readonly localeSummaries = computed<LocaleTranslation[]>(() => {
    this.formRevision();
    return this.form.controls.translations.controls.map((group) => group.getRawValue());
  });

  /**
   * The locales a reviewer still owes work on. The context column lists these
   * alone: a locale that is already translated or verified is not news.
   */
  readonly localesNeedingWork = computed<LocaleTranslation[]>(() =>
    this.localeSummaries().filter((locale) => locale.status === 'new' || locale.status === 'stale'),
  );

  /** Locales that are new or stale: the ones a reviewer still owes work on. */
  readonly needWorkCount = computed(() => this.localesNeedingWork().length);

  /** The right-hand summary on the "Other locales" row, already localized. */
  readonly otherLocalesSummary = computed(() =>
    this.isEditMode()
      ? this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.NEEDWORKX, { count: this.needWorkCount() })
      : this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.AUTOTRANSLATEDX, {
          count: this.otherLocales().length,
        }),
  );

  /** How many similar values are pinned in the context column right now. */
  readonly similarCount = computed(() => this.similarResources().length);

  /**
   * The similar-values block only exists once the search has hits to show. It
   * never stands in for a pending search: the results clear the moment the
   * English value changes, so an empty block would be a placeholder, not news.
   */
  readonly showSimilarContext = computed(() => this.similarCount() > 0);

  /**
   * A pinned hit whose base value is the typed value, ignoring case. The entry
   * is not merely similar — it is the same string under a key that already
   * exists, which is the one case worth saying out loud.
   */
  readonly exactMatch = computed(() => {
    const typed = this.baseValueText().trim().toLowerCase();
    if (!typed) {
      return undefined;
    }
    return this.similarResources().find(
      (result) => (result.translations[this.data.baseLocale] ?? '').trim().toLowerCase() === typed,
    );
  });

  /** The key carrying the exact same text, or '' when no hit matches verbatim. */
  readonly exactMatchKey = computed(() => this.exactMatch()?.key ?? '');

  /** The one-line summary the narrow "Context" disclosure carries. */
  readonly contextSummary = computed(() => {
    // The key itself is not summarised here: the footer carries it in full, and
    // the form's own key error carries the collision.
    const parts = [
      this.selectedFolderPath() || this.transloco.translate(TRACKER_TOKENS.BROWSER.FOLDERPICKER.ROOTLABEL),
    ];
    if (this.similarCount() > 0) {
      parts.push(
        this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CONTEXT.SIMILARCOUNTX, {
          count: this.similarCount(),
        }),
      );
    }
    return parts.join(' · ');
  });

  /**
   * The mini tree in "Where it lands": the target folder's siblings under their
   * shared parent, with the target expanded over the entries it already holds and
   * the entry being written marked. Entries are only known for folders the tree
   * has loaded; an unloaded folder shows as a folder node and nothing more.
   */
  readonly contextTree = computed<ContextTreeNode[]>(() => {
    this.formRevision();
    const roots = this.rootFolders();
    const segments = this.folderSegments();
    const targetPath = this.selectedFolderPath();
    const nodes: ContextTreeNode[] = [];

    if (segments.length === 0) {
      roots.forEach((folder) => nodes.push({ kind: 'folder', name: folder.name, path: folder.fullPath, depth: 0 }));
      nodes.push(...this.#entryNodes(targetPath, 0));
      return nodes;
    }

    const parentPath = segments.slice(0, -1).join('.');
    const siblings = parentPath ? (this.#findFolder(roots, parentPath)?.tree?.children ?? []) : roots;
    let depth = 0;

    if (parentPath) {
      nodes.push({
        kind: 'folder',
        name: segments[segments.length - 2],
        path: parentPath,
        depth: 0,
        expanded: true,
      });
      depth = 1;
    }

    let placed = false;
    for (const sibling of siblings) {
      const here = sibling.fullPath === targetPath;
      placed = placed || here;
      nodes.push({ kind: 'folder', name: sibling.name, path: sibling.fullPath, depth, here, expanded: here });
      if (here) {
        nodes.push(...this.#entryNodes(targetPath, depth + 1));
      }
    }

    // The folder may not be in the tree yet — a path absorbed from a dotted key,
    // or one the user has not expanded. It is still where the entry lands.
    if (!placed) {
      nodes.push({
        kind: 'folder',
        name: segments[segments.length - 1],
        path: targetPath,
        depth,
        here: true,
        expanded: true,
      });
      nodes.push(...this.#entryNodes(targetPath, depth + 1));
    }

    return nodes;
  });

  /** Root folders narrowed by the popover's filter, pruned to the matching subtrees. */
  readonly filteredRootFolders = computed(() => {
    const filter = this.folderFilter().trim().toLowerCase();
    if (!filter) {
      return this.rootFolders();
    }
    return this.#filterFolders(this.rootFolders(), filter);
  });

  /** The folder the popover's primary button would commit. */
  readonly popoverFolderPath = computed(() => this.stagedFolderPath() ?? this.selectedFolderPath());

  /**
   * App-owned markup, never translator input, so the ICU hint can carry a <code>
   * run. The braces are HTML entities: a literal `{count}` handed to Transloco
   * as a parameter is re-read as an ICU argument and resolves to `undefined`.
   */
  readonly icuPlaceholderMarkup = '<code>&#123;count&#125;</code>';

  readonly allTagSuggestions = computed(() => {
    const seen = new Set<string>();
    for (const resource of this.browserStore.translations()) {
      for (const tag of resource.tags ?? []) {
        seen.add(tag);
      }
    }
    return [...seen].sort();
  });

  readonly filteredTagSuggestions = computed(() => {
    const input = this.tagInputText().toLowerCase();
    const existing = new Set([...this.tagsList(), ...this.inheritedTagsList()]);
    return this.allTagSuggestions().filter((t) => !existing.has(t) && (input === '' || t.includes(input)));
  });

  ngOnInit(): void {
    // Initialize folder path from dialog data
    this.#setSelectedFolder(this.data.folderPath || '');
    this.#initializeOtherLocaleFormControls();

    if (this.isEditMode() && this.data.resource) {
      const baseValue = this.data.resource.translations[this.data.baseLocale] || '';
      const comment = this.data.resource.comment || '';

      this.form.patchValue({
        key: this.data.resource.key,
        baseValue,
        comment,
      });

      this.tagsList.set(this.data.resource.tags ?? []);

      this.#originalBaseValue = baseValue;

      this.#populateOtherLocaleTranslations();
    }

    this.#originalTags = [...this.tagsList()];
    this.#originalFolderPath = this.selectedFolderPath();

    this.#setupSimilarResourcesSearch();

    if (!this.isEditMode()) {
      this.#setupDottedKeyAbsorption();
    }

    this.form.statusChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.formRevision.update((revision) => revision + 1);
    });
    this.form.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.formRevision.update((revision) => revision + 1);
    });

    // View-only mode: lock down all inputs. Save is hidden in the template.
    if (this.isReadOnly()) {
      this.form.disable({ emitEvent: false });
    }

    this.#guardAgainstAccidentalClose();
  }

  /**
   * Escape and backdrop clicks used to discard the whole form without a word.
   * Take ownership of both so an edited entry always gets a confirmation first.
   */
  #guardAgainstAccidentalClose(): void {
    this.dialogRef.disableClose = true;

    this.dialogRef
      .keydownEvents()
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          void this.onCancel();
        }
      });

    this.dialogRef
      .backdropClick()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        void this.onCancel();
      });
  }

  /** True when closing now would throw away work the user has done. */
  hasUnsavedChanges(): boolean {
    if (this.isReadOnly() || this.isSubmitting()) {
      return false;
    }

    if (this.form.dirty) {
      return true;
    }

    if (this.selectedFolderPath() !== this.#originalFolderPath) {
      return true;
    }

    const tags = this.tagsList();
    return tags.length !== this.#originalTags.length || tags.some((tag, i) => tag !== this.#originalTags[i]);
  }

  ngOnDestroy(): void {
    clearTimeout(this.#locationFlashTimer);
    clearTimeout(this.#keyCopiedTimer);
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngAfterViewInit(): void {
    this.dialogRef.afterOpened().subscribe(() => {
      if (this.isEditMode()) {
        this.baseValueInput?.nativeElement.focus();
      } else {
        this.keyInput?.nativeElement.focus();
      }
    });
  }

  #initializeOtherLocaleFormControls(): void {
    const translationsArray = this.form.controls.translations;
    translationsArray.clear();

    this.otherLocales().forEach((locale) => {
      const localeGroup = new FormGroup({
        locale: new FormControl<string>(locale, { nonNullable: true }),
        value: new FormControl<string>('', { nonNullable: true }),
        status: new FormControl<TranslationStatus>('new', {
          nonNullable: true,
        }),
      });

      translationsArray.push(localeGroup);
    });
  }

  #populateOtherLocaleTranslations(): void {
    if (!this.data.resource) {
      return;
    }

    const translationsArray = this.form.controls.translations;

    translationsArray.controls.forEach((control) => {
      const locale = control.value.locale;
      if (!locale) {
        return;
      }
      const value = this.data.resource?.translations[locale] || '';
      const status = this.data.resource?.status[locale] || 'new';

      control.patchValue({ value, status });
    });
  }

  #setupSimilarResourcesSearch(): void {
    this.form.controls.baseValue.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
      this.baseValueLength.set(value.trim().length);
      this.baseValueText.set(value);

      // Hits are pinned to the text that produced them. The moment that text
      // changes they are stale, so they go now rather than after the debounce —
      // a list that no longer describes the field is worse than no list.
      this.similarResources.set([]);

      if (this.#shouldSearchForSimilar(value)) {
        this.baseValueSearch$.next(value);
      } else {
        this.isSearchingSimilar.set(false);
      }
    });

    this.baseValueSearch$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        tap(() => this.isSearchingSimilar.set(true)),
        switchMap((query) => {
          if (!query || query.trim().length < 3) {
            return of({
              query: '',
              results: [],
              totalFound: 0,
              limited: false,
            });
          }

          return this.browserApi.searchTranslations(this.data.collectionName, query, SIMILAR_SEARCH_MAX_RESULTS).pipe(
            catchError(() =>
              of({
                query: '',
                results: [],
                totalFound: 0,
                limited: false,
              }),
            ),
          );
        }),
        tap(() => this.isSearchingSimilar.set(false)),
        takeUntil(this.destroy$),
      )
      .subscribe((searchResults) => {
        // Filter out current resource in edit mode
        const withoutSelf =
          this.isEditMode() && this.data.resource
            ? searchResults.results.filter((r) => r.key !== this.#buildOriginalFullKey())
            : searchResults.results;

        // The API matches keys too, and reports a key match ahead of a value one.
        // Everything downstream — the count, the exact-duplicate caption, what
        // stays pinned — reads this signal, so the key-only hits go before it.
        this.similarResources.set(
          filterSimilarByValue(withoutSelf, searchResults.query || this.baseValueText(), this.data.baseLocale),
        );
      });
  }

  /**
   * The primary user arrives holding a full dotted key — `apps.common.buttons.ok` —
   * and the key control only accepts a single segment. Rather than rejecting the
   * one string they have, take the dotted prefix as the folder and keep the leaf.
   *
   * Listening on `valueChanges` covers every way text arrives: typed, pasted,
   * dropped, or completed by the browser. The pattern validator stays on as the
   * backstop for characters that are invalid in any position.
   */
  #setupDottedKeyAbsorption(): void {
    this.form.controls.key.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
      this.#absorbDottedKey(value);
    });
  }

  #absorbDottedKey(rawValue: string): void {
    if (!rawValue.includes('.')) {
      return;
    }

    // Empty segments cover leading, trailing and consecutive dots in one pass;
    // a trailing dot means the user has finished a folder but not started a leaf.
    const segments = rawValue.split('.').filter((segment) => segment.length > 0);
    const leaf = rawValue.endsWith('.') ? '' : (segments.pop() ?? '');

    // Anything the pattern validator would reject is left in the field verbatim,
    // so the error names the real problem instead of a silently mangled key.
    if (segments.some((segment) => !isValidSegment(segment))) {
      return;
    }

    this.#setKeyControl(leaf);

    if (segments.length === 0) {
      return;
    }

    const prefix = segments.join('.');
    const isContinuation = this.#folderFromKey !== null && this.selectedFolderPath() === this.#folderFromKey;
    const nextFolder = isContinuation ? `${this.#folderFromKey}.${prefix}` : prefix;

    this.#folderFromKey = nextFolder;
    this.#setSelectedFolder(nextFolder);
    this.#announceLocationAbsorbed(nextFolder);
  }

  /** Writes the leaf back without re-entering the subscription that produced it. */
  #setKeyControl(leaf: string): void {
    const control = this.form.controls.key;
    control.setValue(leaf, { emitEvent: false });
    control.markAsDirty();
    control.updateValueAndValidity({ emitEvent: false });
    this.formRevision.update((revision) => revision + 1);
  }

  /**
   * The prefix leaves the field the user is looking at and lands in a pill above
   * it, so say so twice: a highlight for the eye, a live region for the reader.
   */
  #announceLocationAbsorbed(folderPath: string): void {
    this.locationAbsorbedMessage.set(
      this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.LOCATIONFROMKEYX, { folder: folderPath }),
    );

    clearTimeout(this.#locationFlashTimer);
    this.locationAbsorbedFlash.set(false);
    // Let the class drop for a frame so a second paste re-runs the animation.
    requestAnimationFrame(() => this.locationAbsorbedFlash.set(true));
    this.#locationFlashTimer = setTimeout(() => this.locationAbsorbedFlash.set(false), 900);
  }

  #shouldSearchForSimilar(currentValue: string): boolean {
    if (!currentValue || currentValue.trim().length < 3) {
      return false;
    }

    if (this.isEditMode()) {
      return currentValue !== this.#originalBaseValue;
    }

    return true;
  }

  // Escape is handled through `dialogRef.keydownEvents()` in
  // `#guardAgainstAccidentalClose`. A window-scoped listener also fired for
  // keystrokes aimed at the confirmation dialogs stacked on top of this one,
  // closing the editor underneath them and destroying the form.

  @HostListener('window:keydown.control.enter', ['$event'])
  @HostListener('window:keydown.meta.enter', ['$event'])
  onCtrlEnter(event: Event): void {
    event.preventDefault();
    void this.onSubmit();
  }

  /** The single writer of the target folder, so nothing can move it unseen. */
  #setSelectedFolder(folderPath: string): void {
    this.selectedFolderPath.set(folderPath);
    this.#ensureFolderEntries(folderPath);
  }

  /**
   * Fetches a folder's own entries once, so the collision check and the "Where
   * it lands" tree work for any folder the user picks — not only the one the
   * browser happens to be showing. Deliberately a plain read: the store's
   * `selectFolder` would navigate the list behind the dialog.
   */
  #ensureFolderEntries(folderPath: string): void {
    if (this.isEditMode() || this.#folderEntryKeys(folderPath) || this.#loadingFolders().has(folderPath)) {
      return;
    }

    this.#loadingFolders.update((paths) => new Set(paths).add(folderPath));

    this.browserApi
      .getResourceTree(this.data.collectionName, folderPath, false)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (tree) => {
          if ('resources' in tree) {
            const keys = tree.resources.map((resource) => resource.key);
            this.#loadedFolderEntries.update((entries) => new Map(entries).set(folderPath, keys));
          }
          this.#finishFolderLoad(folderPath);
        },
        // A folder we cannot read claims nothing. The save path still guards.
        error: () => this.#finishFolderLoad(folderPath),
      });
  }

  #finishFolderLoad(folderPath: string): void {
    this.#loadingFolders.update((paths) => {
      const next = new Set(paths);
      next.delete(folderPath);
      return next;
    });
    this.formRevision.update((revision) => revision + 1);
  }

  /**
   * The entry keys known for a folder, or undefined when they are not known at
   * all. Three sources, cheapest first: a folder already expanded in the tree,
   * the folder the browser is showing, then anything this dialog fetched.
   */
  #folderEntryKeys(folderPath: string): ReadonlySet<string> | undefined {
    const expanded = folderPath ? this.#findFolder(this.rootFolders(), folderPath)?.tree?.resources : undefined;
    const known =
      expanded ?? (this.browserStore.currentFolderPath() === folderPath ? this.browserStore.translations() : undefined);

    if (known) {
      return this.#ownEntryKeys(known.map((resource) => resource.key));
    }

    const loaded = this.#loadedFolderEntries().get(folderPath);
    return loaded ? this.#ownEntryKeys(loaded) : undefined;
  }

  /**
   * An entry key is a single segment. The browser lists a folder with its nested
   * resources folded in, and those arrive under keys relative to the folder —
   * `translationEditor.saveButton`, not `saveButton`. They live somewhere else,
   * so they neither collide with this key nor belong in the folder's own row.
   */
  #ownEntryKeys(keys: readonly string[]): ReadonlySet<string> {
    return new Set(keys.filter((key) => !key.includes('.')));
  }

  #findFolder(folders: FolderNodeDto[], path: string): FolderNodeDto | undefined {
    for (const folder of folders) {
      if (folder.fullPath === path) {
        return folder;
      }
      if (path.startsWith(`${folder.fullPath}.`) && folder.tree?.children) {
        const found = this.#findFolder(folder.tree.children, path);
        if (found) {
          return found;
        }
      }
    }
    return undefined;
  }

  /**
   * The entries already in a folder, plus the one this dialog is about to write.
   * A folder can hold hundreds of keys and this is a glance, not a browser, so
   * the list is a window around the entry being written; the rest is one count.
   */
  #entryNodes(folderPath: string, depth: number): ContextTreeNode[] {
    const key = this.form.controls.key.value.trim();
    const loaded = this.#folderEntryKeys(folderPath);

    // A folder still loading shows as a folder and nothing else: listing the new
    // entry alone would claim the folder is empty before we know that it is.
    if (!loaded && this.#loadingFolders().has(folderPath)) {
      return [];
    }

    const names = new Set(loaded ?? []);
    const taken = key.length > 0 && names.has(key);
    if (key) {
      names.add(key);
    }

    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    const window = TranslationEditorDialog.CONTEXT_TREE_ENTRY_LIMIT;
    let shown = sorted;
    if (sorted.length > window) {
      const anchor = key ? Math.max(0, sorted.indexOf(key)) : 0;
      const start = Math.min(Math.max(0, anchor - Math.floor(window / 2)), sorted.length - window);
      shown = sorted.slice(start, start + window);
    }

    const nodes: ContextTreeNode[] = shown.map((name) => ({
      kind: 'entry' as const,
      name,
      path: folderPath ? `${folderPath}.${name}` : name,
      depth,
      mark:
        name === key && key.length > 0
          ? this.isEditMode()
            ? ('editing' as const)
            : taken || this.keyCollision()
              ? ('exists' as const)
              : ('new' as const)
          : undefined,
    }));

    const hidden = sorted.length - shown.length;
    if (hidden > 0) {
      nodes.push({
        kind: 'more',
        name: this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CONTEXT.MOREENTRIESX, {
          count: hidden,
        }),
        path: `${folderPath}::more`,
        depth,
      });
    }

    return nodes;
  }

  /** Keeps a folder when it or any loaded descendant matches, and prunes the rest. */
  #filterFolders(folders: FolderNodeDto[], filter: string): FolderNodeDto[] {
    const kept: FolderNodeDto[] = [];
    for (const folder of folders) {
      const children = folder.tree?.children ? this.#filterFolders(folder.tree.children, filter) : [];
      const selfMatches = folder.fullPath.toLowerCase().includes(filter);
      if (selfMatches) {
        kept.push(folder);
      } else if (children.length > 0 && folder.tree) {
        kept.push({ ...folder, tree: { ...folder.tree, children } });
      }
    }
    return kept;
  }

  // ── Location popover ──────────────────────────────────────────────────────

  toggleFolderPopover(): void {
    if (this.isReadOnly()) {
      return;
    }
    if (this.isFolderPopoverOpen()) {
      this.closeFolderPopover();
      return;
    }
    this.openFolderPopover();
  }

  openFolderPopover(): void {
    if (this.isReadOnly()) {
      return;
    }
    this.stagedFolderPath.set(null);
    this.folderFilter.set('');
    this.isFolderPopoverOpen.set(true);
    this.#focusOnceRendered(() => this.folderFilterInput?.nativeElement);
  }

  /**
   * Confirm, Escape and a backdrop click all land here, so focus comes back to
   * the pill that opened the popover rather than the top of the dialog. The
   * `(detach)` binding fires a second time after we have already closed; the
   * `wasOpen` check keeps that from stealing focus from wherever it went next.
   */
  closeFolderPopover(restoreFocus = true): void {
    const wasOpen = this.isFolderPopoverOpen();
    this.isFolderPopoverOpen.set(false);
    this.stagedFolderPath.set(null);
    if (wasOpen && restoreFocus) {
      this.#focusOnceRendered(() => this.locationPill?.nativeElement);
    }
  }

  /** Opens the picker's own inline folder-name field under the staged folder. */
  startNewFolder(): void {
    this.folderPicker?.onAddFolder(this.popoverFolderPath());
  }

  onFolderFilterInput(event: Event): void {
    this.folderFilter.set((event.target as HTMLInputElement).value);
  }

  /** Confirms the folder staged in the popover and closes it. */
  confirmStagedFolder(): void {
    const staged = this.stagedFolderPath();
    if (staged !== null) {
      this.onFolderConfirmed(staged);
    }
    this.closeFolderPopover();
  }

  // ── Other-locales drawer ──────────────────────────────────────────────────

  openLocalesDrawer(): void {
    if (this.otherLocales().length === 0) {
      return;
    }
    this.isLocalesDrawerOpen.set(true);
    this.#focusOnceRendered(() => this.drawerFirstControl?.nativeElement);
  }

  /** Done, Escape and the back arrow all hand focus back to the row that opened it. */
  closeLocalesDrawer(restoreFocus = true): void {
    const wasOpen = this.isLocalesDrawerOpen();
    this.isLocalesDrawerOpen.set(false);
    if (wasOpen && restoreFocus) {
      this.#focusOnceRendered(() => this.otherLocalesRow?.nativeElement);
    }
  }

  /**
   * Focus after the view that holds the target exists. A microtask would run
   * before change detection has rendered a panel that was just opened.
   *
   * `afterFocus` runs on the same element once it holds focus, for callers that
   * also have a caret to place or a field to scroll into view.
   */
  #focusOnceRendered<T extends HTMLElement>(target: () => T | undefined, afterFocus?: (element: T) => void): void {
    setTimeout(() => {
      const element = target();
      if (!element) {
        return;
      }
      element.focus();
      afterFocus?.(element);
    });
  }

  toggleContext(): void {
    this.isContextOpen.update((open) => !open);
  }

  /** Writes a status from the per-locale pill menu into the same FormArray as before. */
  setLocaleStatus(index: number, status: TranslationStatus): void {
    const group = this.getLocaleFormGroup(index);
    group.controls.status.setValue(status);
    group.controls.status.markAsDirty();
  }

  async onCancel(): Promise<void> {
    // Escape and the close button reach here; an open panel is the nearest thing
    // to dismiss, so it goes first and the form stays untouched.
    if (this.isFolderPopoverOpen()) {
      this.closeFolderPopover();
      return;
    }
    if (this.isLocalesDrawerOpen()) {
      this.closeLocalesDrawer();
      return;
    }
    if (this.hasUnsavedChanges() && !(await this.#confirmDiscard())) {
      return;
    }
    this.dialogRef.close();
  }

  #confirmDiscard(): Promise<boolean> {
    const dialogData: ConfirmationDialogData = {
      title: this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.UNSAVED.TITLE),
      message: this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.UNSAVED.MESSAGE),
      confirmButtonText: this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.UNSAVED.DISCARD),
      cancelButtonText: this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.UNSAVED.KEEPEDITING),
    };

    return new Promise((resolve) => {
      this.dialog
        .open<ConfirmationDialog, ConfirmationDialogData, boolean>(ConfirmationDialog, {
          data: dialogData,
          width: '440px',
          disableClose: true,
        })
        .afterClosed()
        .subscribe((discard) => resolve(discard === true));
    });
  }

  /** The picker inside the popover stages a folder; the popover's button commits it. */
  onFolderStaged(folderPath: string): void {
    this.stagedFolderPath.set(folderPath);
  }

  onFolderConfirmed(folderPath: string): void {
    this.#folderFromKey = null;
    this.#setSelectedFolder(folderPath);
  }

  onFolderCreated(folder: FolderNodeDto): void {
    // Store's createFolderAt already updated rootFolders, just update selection
    this.#folderFromKey = null;
    this.#setSelectedFolder(folder.fullPath);
    this.stagedFolderPath.set(folder.fullPath);
  }

  /** Enter and comma commit the typed tag; Backspace on an empty field removes the last one. */
  onTagKeydown(event: KeyboardEvent, input: HTMLInputElement): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addTagValue(input.value);
      input.value = '';
      return;
    }
    if (event.key === 'Backspace' && input.value === '') {
      const tags = this.tagsList();
      if (tags.length > 0) {
        this.removeTag(tags[tags.length - 1]);
      }
    }
  }

  addTagValue(rawValue: string): void {
    const normalized = normalizeTag(rawValue);
    if (normalized && !this.tagsList().includes(normalized)) {
      this.tagsList.update((tags) => [...tags, normalized]);
    }
    this.tagInputText.set('');
  }

  addTagFromAutocomplete(event: MatAutocompleteSelectedEvent, input: HTMLInputElement): void {
    this.addTagValue(event.option.value as string);
    input.value = '';
  }

  removeTag(tag: string): void {
    if (this.inheritedTagsList().includes(tag)) return;
    this.tagsList.update((tags) => tags.filter((t) => t !== tag));
  }

  onTagInputChange(event: Event): void {
    this.tagInputText.set((event.target as HTMLInputElement).value);
  }

  /**
   * Leaves for the entry that already holds this key. Same close payload as the
   * conflict dialog's "Edit existing", and the same unsaved-work guard as any
   * other way out of the dialog.
   */
  async openExistingResource(): Promise<void> {
    const existingKey = this.#buildFullKey(this.form.controls.key.value.trim());

    if (this.hasUnsavedChanges() && !(await this.#confirmDiscard())) {
      return;
    }

    this.dialogRef.close({
      key: this.form.controls.key.value,
      baseValue: this.form.controls.baseValue.value,
      comment: this.form.controls.comment.value.trim() || undefined,
      folderPath: this.selectedFolderPath(),
      shouldOpenEdit: true,
      existingResourceKey: existingKey,
    });
  }

  onSimilarResourceClick(result: SearchResultDto): void {
    const fullKey = result.key;
    this.#copyToClipboard(fullKey, this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.KEYCOPIED));
  }

  /**
   * The footer is the only place the full dotted key is spelled out, so it is
   * also the place to take it from. Same clipboard path and same snackbar the
   * row's key chip uses, plus a check glyph while the toast is still up.
   */
  copyFullKey(): void {
    this.#copyToClipboard(
      this.fullKeyPreview(),
      this.transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.COPIEDTOCLIPBOARD),
      () => this.#flashKeyCopied(),
    );
  }

  #flashKeyCopied(): void {
    clearTimeout(this.#keyCopiedTimer);
    this.keyJustCopied.set(true);
    this.#keyCopiedTimer = setTimeout(() => this.keyJustCopied.set(false), 1500);
  }

  #copyToClipboard(text: string, successMessage: string, onCopied?: () => void): void {
    const failedMessage = this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.COPYFAILED);

    if (!navigator.clipboard?.writeText) {
      this.notifications.error(failedMessage);
      return;
    }

    navigator.clipboard
      .writeText(text)
      .then(() => {
        this.notifications.success(successMessage);
        onCopied?.();
      })
      .catch(() => {
        this.notifications.error(failedMessage);
      });
  }

  async onSubmit(): Promise<void> {
    if (this.isReadOnly() || this.isSubmitting()) {
      return;
    }

    // The save button stays enabled so an invalid form can explain itself
    // rather than presenting a dead control with no error anywhere on screen.
    if (this.form.invalid) {
      this.#revealValidationFailure();
      return;
    }

    // The key is already taken, and the writer would overwrite the entry rather
    // than refuse it. Stop before the network and offer the same two ways out
    // the save-time conflict offers, so both routes end in the same place.
    if (this.keyCollision()) {
      this.#showKeyConflictDialog(this.#buildFullKey(this.form.controls.key.value.trim()));
      return;
    }

    const formValue = this.form.getRawValue() as TranslationFormValue;
    const commentValue = formValue.comment.trim();

    if (!commentValue && !this.#commentConfirmationShown) {
      const shouldProceed = await this.#showCommentConfirmation();

      if (!shouldProceed) {
        return;
      }
    }

    if (this.isEditMode()) {
      this.#handleEditSubmit(formValue, commentValue);
    } else {
      this.#handleCreateSubmit(formValue, commentValue);
    }
  }

  /**
   * Names the problem, dismisses anything covering the form, and puts the caret
   * in the offending field.
   */
  #revealValidationFailure(): void {
    this.submitAttempted.set(true);
    this.form.markAllAsTouched();
    this.formRevision.update((revision) => revision + 1);
    this.errorMessage.set(this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.FIXERRORS));

    // Focus belongs to the offending field, not to whatever opened the panel.
    this.closeFolderPopover(false);
    this.closeLocalesDrawer(false);

    queueMicrotask(() => {
      const target = this.form.controls.key.invalid ? this.keyInput : this.baseValueInput;
      target?.nativeElement.focus();
    });
  }

  #handleEditSubmit(formValue: TranslationFormValue, commentValue: string): void {
    if (!this.data.resource) {
      this.errorMessage.set(this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.ERROR.MISSINGRESOURCE));
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const originalKey = this.#buildOriginalFullKey();
    const newKey = formValue.key;
    const newFolderPath = this.selectedFolderPath();
    const originalFolderPath = this.data.folderPath || '';

    // The key control is readonly in edit mode (`html`), so `newKey` can only
    // ever equal the original; renaming is a move, handled by the CLI.
    const hasFolderChanged = newFolderPath !== originalFolderPath;

    const filledTranslations = formValue.translations.filter((translation) => {
      const hasValue = translation.value.trim().length > 0;
      const originalStatus = this.data.resource?.status[translation.locale] ?? 'new';
      const hasStatusChange = translation.status !== originalStatus;
      return hasValue || hasStatusChange;
    });

    const locales: Record<string, { value: string; status: TranslationStatus }> = {};
    filledTranslations.forEach((translation) => {
      locales[translation.locale] = { value: translation.value, status: translation.status };
    });

    const updateDto: UpdateResourceDto = {
      key: originalKey,
      baseValue: formValue.baseValue,
      comment: commentValue || undefined,
      tags: this.tagsList(),
    };

    if (hasFolderChanged) {
      updateDto.targetFolder = newFolderPath || undefined;
    }

    if (Object.keys(locales).length > 0) {
      updateDto.locales = locales;
    }

    this.browserApi.updateResource(this.data.collectionName, updateDto).subscribe({
      next: (response: UpdateResourceResponseDto) => {
        this.dialogRef.close({
          key: newKey,
          baseValue: formValue.baseValue,
          comment: commentValue || undefined,
          folderPath: newFolderPath,
          translations: filledTranslations.length > 0 ? filledTranslations : undefined,
          success: true,
          resource: response.resource,
          skippedLocales: response.skippedLocales?.length ? response.skippedLocales : undefined,
        });
      },
      error: (error: unknown) => {
        this.isSubmitting.set(false);
        this.#handleUpdateError(error);
      },
    });
  }

  #handleCreateSubmit(formValue: TranslationFormValue, commentValue: string): void {
    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const fullKey = this.#buildFullKey(formValue.key);

    const filledTranslations = formValue.translations
      .filter((translation) => translation.value.trim().length > 0)
      .map((translation) => ({
        locale: translation.locale,
        value: translation.value,
        status: 'new' as TranslationStatus,
      }));

    const createDto: CreateResourceDto = {
      key: fullKey,
      baseValue: formValue.baseValue,
      comment: commentValue || undefined,
      tags: this.tagsList().length > 0 ? this.tagsList() : undefined,
      baseLocale: this.data.baseLocale,
      translations: filledTranslations.length > 0 ? filledTranslations : undefined,
    };

    this.browserApi.createResource(this.data.collectionName, createDto).subscribe({
      next: (response: CreateResourceResponseDto) => {
        this.dialogRef.close({
          key: formValue.key,
          baseValue: formValue.baseValue,
          comment: commentValue || undefined,
          folderPath: this.selectedFolderPath(),
          translations: filledTranslations.length > 0 ? filledTranslations : undefined,
          success: true,
          skippedLocales: response.skippedLocales?.length ? response.skippedLocales : undefined,
        });
      },
      error: (error: unknown) => {
        this.isSubmitting.set(false);
        this.#handleCreateError(error, fullKey);
      },
    });
  }

  #buildFullKey(key: string): string {
    const folderPath = this.selectedFolderPath();
    if (!folderPath) {
      return key;
    }
    return `${folderPath}.${key}`;
  }

  #buildOriginalFullKey(): string {
    if (!this.data.resource) {
      return '';
    }
    const folderPath = this.data.folderPath || '';
    const key = this.data.resource.key;
    if (!folderPath) {
      return key;
    }
    return `${folderPath}.${key}`;
  }

  #handleCreateError(error: unknown, fullKey: string): void {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 409) {
        this.#showKeyConflictDialog(fullKey);
        return;
      }

      if (error.status === 400) {
        const message =
          error.error?.message ||
          error.message ||
          this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.ERROR.INVALIDREQUEST);
        this.errorMessage.set(message);
        return;
      }

      this.errorMessage.set(
        error.error?.message ||
          error.message ||
          this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.ERROR.CREATEFAILED),
      );
      return;
    }

    this.errorMessage.set(this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.ERROR.UNEXPECTED));
  }

  #handleUpdateError(error: unknown): void {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 404) {
        this.errorMessage.set(this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.ERROR.NOTFOUND));
        return;
      }

      if (error.status === 400) {
        const message =
          error.error?.message ||
          error.message ||
          this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.ERROR.INVALIDREQUEST);
        this.errorMessage.set(message);
        return;
      }

      this.errorMessage.set(
        error.error?.message ||
          error.message ||
          this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.ERROR.UPDATEFAILED),
      );
      return;
    }

    this.errorMessage.set(this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.ERROR.UNEXPECTED));
  }

  #showKeyConflictDialog(existingKey: string): void {
    const dialogData: ConfirmationDialogData = {
      title: this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CONFLICT.TITLE),
      message: this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CONFLICT.MESSAGEX, {
        key: existingKey,
      }),
      confirmButtonText: this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CONFLICT.EDITEXISTING),
      cancelButtonText: this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CONFLICT.CHOOSEDIFFERENTKEY),
    };

    const dialogRef = this.dialog.open<ConfirmationDialog, ConfirmationDialogData, boolean>(ConfirmationDialog, {
      data: dialogData,
      width: '500px',
    });

    dialogRef.afterClosed().subscribe((shouldEditExisting) => {
      if (shouldEditExisting) {
        this.dialogRef.close({
          key: this.form.controls.key.value,
          baseValue: this.form.controls.baseValue.value,
          comment: this.form.controls.comment.value.trim() || undefined,
          folderPath: this.selectedFolderPath(),
          shouldOpenEdit: true,
          existingResourceKey: existingKey,
        });
      }
    });
  }

  async #showCommentConfirmation(): Promise<boolean> {
    this.#commentConfirmationShown = true;

    const confirmationDialogData: ConfirmationDialogData = {
      title: this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.COMMENTCONFIRM.TITLE),
      message: this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.COMMENTCONFIRM.MESSAGE),
      confirmButtonText: this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.COMMENTCONFIRM.SAVEANYWAY),
      cancelButtonText: this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.COMMENTCONFIRM.ADDCOMMENT),
    };

    const confirmationDialogRef = this.dialog.open(ConfirmationDialog, {
      data: confirmationDialogData,
      width: '400px',
      disableClose: true,
    });

    const confirmed = await confirmationDialogRef.afterClosed().toPromise();

    if (!confirmed) {
      this.#commentConfirmationShown = false;
      this.#focusCommentField();
    }

    return confirmed === true;
  }

  /**
   * "Add comment" asked for the Comment field, so put the caret in it. The
   * confirmation's focus trap hands focus back to the Save button as it closes,
   * and `afterClosed()` resolves in that same turn — deferring a task past it
   * (the `#focusOnceRendered` pattern) is what keeps CDK from taking it back.
   */
  #focusCommentField(): void {
    this.#focusOnceRendered(
      () => this.commentInput?.nativeElement,
      (textarea) => {
        // The field may be below the fold on a scrolled form.
        textarea.scrollIntoView?.({ block: 'nearest' });
        // Selects whatever is there, so a rewrite types over it; an empty field
        // just parks the caret.
        textarea.setSelectionRange(0, textarea.value.length);
      },
    );
  }

  getLocaleFormGroup(index: number): FormGroup<{
    locale: FormControl<string>;
    value: FormControl<string>;
    status: FormControl<TranslationStatus>;
  }> {
    return this.form.controls.translations.at(index) as FormGroup<{
      locale: FormControl<string>;
      value: FormControl<string>;
      status: FormControl<TranslationStatus>;
    }>;
  }

  /**
   * Renders a locale as a name the reader recognises ("French (Canada)") with
   * the raw code as the fallback, rather than shouting `FR-CA` at them.
   */
  getLocaleDisplayName(locale: string | undefined): string {
    if (!locale) {
      return '';
    }

    const code = locale.toUpperCase();
    try {
      const names = new Intl.DisplayNames([this.transloco.getActiveLang()], { type: 'language' });
      const name = names.of(locale);
      return name && name.toLowerCase() !== locale.toLowerCase() ? name : code;
    } catch {
      return code;
    }
  }

  getKeyErrorMessage(): string {
    const keyControl = this.form.controls.key;

    if (keyControl.hasError('required')) {
      return TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.KEYREQUIRED;
    }

    if (keyControl.hasError('pattern')) {
      return TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.KEYPATTERNERROR;
    }

    return '';
  }
}
