import { computed, signal } from '@angular/core';
import {
  type AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  type ValidationErrors,
  type ValidatorFn,
  Validators,
} from '@angular/forms';
import type {
  BundleDefinitionDto,
  BundleDryRunRequestDto,
  BundleDryRunResultDto,
  CollectionBundleDefinitionDto,
  EntrySelectionRuleDto,
  TokenCasingDto,
} from '@simoncodes-ca/data-transfer';
import {
  bundleKeyToConstantName,
  bundleOutputFile,
  checkBundleDefinition,
  hasBundleCollections,
  hasBundleRules,
  hasLocalePlaceholder,
  isTypeScriptFile,
  isValidJavaScriptIdentifier,
  normalizeBundleDefinition,
} from '@simoncodes-ca/domain';
import { catchError, debounceTime, map, type Observable, of, Subscription, startWith, switchMap, tap } from 'rxjs';
import { addTagToList, removeTagFromList } from '../../shared/tag-list-edit';
import { segmentValidator } from '../../shared/validators/segment.validator';
import type { BundleFormDialogData, BundleFormResult } from './bundle-form-dialog-data';

export interface BundleFormOptions {
  data: BundleFormDialogData;
  collectionNames: () => readonly string[];
  bundleNames: () => readonly string[];
  locales: () => readonly string[];
  baseLocale: () => string;
  tokenCasing: () => TokenCasingDto;
  icuTransform: () => boolean;
  nameValidator?: ValidatorFn;
  dryRun: (request: BundleDryRunRequestDto) => Observable<BundleDryRunResultDto>;
}

export type RuleGroup = FormGroup<{
  matchingPattern: FormControl<string>;
  matchingTags: FormControl<string[]>;
  matchingTagOperator: FormControl<TagOperator>;
}>;

export type CollectionGroup = FormGroup<{
  name: FormControl<string>;
  bundledKeyPrefix: FormControl<string>;
  mergeStrategy: FormControl<MergeStrategy>;
  allEntries: FormControl<boolean>;
  rules: FormArray<RuleGroup>;
}>;

export type PreviewStatus = 'waiting' | 'loading' | 'ready' | 'error';

const TOKEN_SEPARATORS = /(?<=[._])/;

/** Typed bundle editing and preview state, independent of the dialog DOM. */
export class BundleForm {
  readonly #changes = new Subscription();
  readonly form: FormGroup<{
    name: FormControl<string>;
    dist: FormControl<string>;
    bundleName: FormControl<string>;
    allCollections: FormControl<boolean>;
    collections: FormArray<CollectionGroup>;
    typesEnabled: FormControl<boolean>;
    typeDistFile: FormControl<string>;
    tokenCasing: FormControl<TokenCasingChoice>;
    tokenConstantName: FormControl<string>;
    transformICUToTransloco: FormControl<IcuChoice>;
  }>;

  /**
   * Reactive forms are not signals. Every form event (value, status, touched, submit) bumps this
   * signal so the computeds below re-read the form.
   */
  readonly #formTick = signal(Symbol());
  readonly #draft = computed<BundleDraft>(() => {
    this.#formTick();
    return this.form.getRawValue();
  });

  readonly activeSection = signal<BundleSection>('output');
  readonly submitAttempted = signal(false);
  /**
   * What stopped the last submit: messages from the domain Bundle Definition rules that the
   * control validators did not catch, or the server's refusal (its rule messages, else its
   * one message). Cleared on the next edit.
   */
  readonly submitErrors = signal<readonly string[]>([]);

  readonly dryRun = signal<BundleDryRunResultDto | undefined>(undefined);
  readonly previewStatus = signal<PreviewStatus>('waiting');
  /** True from the first keystroke until the next dry run lands. */
  readonly previewStale = signal(false);

  readonly activeKind = computed<'output' | 'collections' | 'collection' | 'types' | 'options'>(() => {
    const section = this.activeSection();
    return section.startsWith('coll:') ? 'collection' : (section as Exclude<BundleSection, `coll:${number}`>);
  });

  readonly activeCollectionIndex = computed(() => {
    const section = this.activeSection();
    return section.startsWith('coll:') ? Number(section.slice(5)) : -1;
  });

  readonly activeCollectionGroup = computed(() => {
    this.#formTick();
    const index = this.activeCollectionIndex();
    return index >= 0 ? this.form.controls.collections.at(index) : undefined;
  });

  /** Names of every configured collection, in config order. */
  readonly allCollectionNames = computed(() => this.options.collectionNames());

  /** Collections not yet in the bundle — what the "Add a collection" menu offers. */
  readonly availableCollections = computed(() => {
    this.#formTick();
    const used = new Set(this.form.controls.collections.controls.map((group) => group.controls.name.value));
    return this.allCollectionNames().filter((name) => !used.has(name));
  });

  readonly projectLocales = computed(() => this.options.locales());
  readonly projectBaseLocale = computed(() => this.options.baseLocale());
  readonly projectTokenCasing = computed<TokenCasingDto>(() => this.options.tokenCasing());
  readonly projectIcuTransform = computed(() => this.options.icuTransform());

  readonly collectionCount = computed(() => {
    this.#formTick();
    return this.form.controls.allCollections.value
      ? this.allCollectionNames().length
      : this.form.controls.collections.length;
  });

  /** Rail summary under Output: `dist/pattern.json` (the placeholder kept), or nothing until one is typed. */
  readonly outputSummary = computed(() => outputSummary(this.#draft()));

  readonly typeFileName = computed(() => typeFileName(this.#draft()));

  readonly derivedConstantName = computed(() => bundleKeyToConstantName(this.#draft().name.trim() || 'bundle'));

  /** The bundle file per project locale, relative to the output folder. */
  readonly patternFiles = computed(() => patternFiles(this.#draft(), this.projectLocales()));

  /** Sections whose fields are invalid and worth flagging in the rail. */
  readonly sectionErrors = computed<ReadonlySet<BundleSection>>(() => {
    this.#formTick();
    const flag = (control: AbstractControl): boolean =>
      control.invalid && (control.touched || control.dirty || this.submitAttempted());
    const errors = new Set<BundleSection>();
    const controls = this.form.controls;

    if ([controls.name, controls.dist, controls.bundleName].some(flag)) errors.add('output');
    if (flag(controls.collections) && controls.collections.hasError('collectionsEmpty')) errors.add('collections');
    controls.collections.controls.forEach((group, index) => {
      if (flag(group)) errors.add(`coll:${index}`);
    });
    if ([controls.typeDistFile, controls.tokenConstantName].some(flag)) errors.add('types');
    return errors;
  });

  readonly firstInvalidSection = computed(() =>
    firstErrorSection(this.sectionErrors(), this.form.controls.collections.length),
  );

  /** Client-side tree from the form alone; used while waiting and when the dry run fails. */
  readonly localTree = computed<readonly PreviewFolder[]>(() => localTree(this.#draft(), this.projectLocales()));

  readonly previewTree = computed<readonly PreviewFolder[]>(() => {
    const result = this.dryRun();
    if (!result || this.previewStatus() === 'error') return this.localTree();
    return plannedTree(result.files);
  });

  readonly previewFileCount = computed(() =>
    this.previewTree().reduce((total, folder) => total + folder.files.length, 0),
  );

  /**
   * Bundled keys that are both a leaf and a parent (e.g. `buttons.ok` next to
   * `buttons.ok.label`). Generation throws on these, so the preview must show
   * them as an error rather than letting the bundle look ready to ship.
   */
  readonly hierarchicalConflicts = computed<readonly string[]>(() => {
    if (this.previewStatus() === 'error') return [];
    return this.dryRun()?.hierarchicalConflicts ?? [];
  });

  /** The colliding keys as one readable list for the preview error line. */
  readonly hierarchicalConflictList = computed(() => this.hierarchicalConflicts().join(', '));

  readonly keysPerLocale = computed(() => {
    const result = this.dryRun();
    if (!result) return undefined;
    const base = result.keysPerLocale[this.projectBaseLocale()];
    if (base !== undefined) return base;
    return Math.max(0, ...Object.values(result.keysPerLocale));
  });

  /** What the ICU switch shows: the explicit choice, or the project default while inheriting. */
  readonly icuChecked = computed(() => {
    this.#formTick();
    const choice = this.form.controls.transformICUToTransloco.value;
    return choice === 'inherit' ? this.projectIcuTransform() : choice === 'on';
  });

  /** Example token path split after `.` and `_`, so it wraps between segments, never mid-identifier. */
  readonly tokenPathParts = computed<readonly string[]>(() => {
    const tokenPath = this.dryRun()?.exampleKey?.tokenPath;
    if (!tokenPath) return [];
    return splitAfterSeparators(tokenPath, TOKEN_SEPARATORS);
  });

  readonly hasOverride = computed(() => {
    this.#formTick();
    return this.form.controls.collections.controls.some((group) => group.controls.mergeStrategy.value === 'override');
  });

  constructor(private readonly options: BundleFormOptions) {
    this.form = new FormGroup({
      name: new FormControl<string>('', {
        nonNullable: true,
        validators: [Validators.required, segmentValidator, this.#uniqueNameValidator()],
      }),
      dist: new FormControl<string>('', { nonNullable: true, validators: [Validators.required] }),
      bundleName: new FormControl<string>('', {
        nonNullable: true,
        validators: [Validators.required, localePlaceholderValidator],
      }),
      allCollections: new FormControl<boolean>(false, { nonNullable: true }),
      collections: new FormArray<CollectionGroup>([], { validators: [collectionsRequiredValidator] }),
      typesEnabled: new FormControl<boolean>(false, { nonNullable: true }),
      typeDistFile: new FormControl<string>('', { nonNullable: true, validators: [typeFileValidator] }),
      tokenCasing: new FormControl<TokenCasingChoice>('inherit', { nonNullable: true }),
      tokenConstantName: new FormControl<string>('', { nonNullable: true, validators: [identifierValidator] }),
      transformICUToTransloco: new FormControl<IcuChoice>('inherit', { nonNullable: true }),
    });
    this.activeSection.set(this.#initialSection());
    this.#populate();
    this.#changes.add(this.form.events.subscribe(() => this.#formTick.set(Symbol())));
    this.#wireDependentValidation();
    this.#wireDryRun();
    this.#changes.add(this.form.valueChanges.subscribe(() => this.submitErrors.set([])));
  }

  get isEditMode(): boolean {
    return this.options.data.mode === 'edit';
  }

  destroy(): void {
    this.#changes.unsubscribe();
  }

  // ───────────────────────────── navigation ─────────────────────────────

  activate(section: BundleSection): void {
    this.activeSection.set(section);
  }

  isActive(section: BundleSection): boolean {
    return this.activeSection() === section;
  }

  activateCollection(index: number): void {
    this.activate(`coll:${index}`);
  }

  isActiveCollection(index: number): boolean {
    return this.activeCollectionIndex() === index;
  }

  hasCollectionError(index: number): boolean {
    return this.sectionErrors().has(`coll:${index}`);
  }

  /** A choice equal to the project default is redundant, so it collapses back to inherit. */
  setIcu(checked: boolean): void {
    const control = this.form.controls.transformICUToTransloco;
    control.setValue(checked === this.projectIcuTransform() ? 'inherit' : checked ? 'on' : 'off');
    control.markAsDirty();
    control.markAsTouched();
  }

  // ───────────────────────────── collections ─────────────────────────────

  addCollection(name: string): void {
    const collections = this.form.controls.collections;
    collections.push(
      this.#buildCollectionGroup({
        name,
        bundledKeyPrefix: '',
        mergeStrategy: 'merge',
        allEntries: true,
        rules: [],
      }),
    );
    collections.markAsDirty();
    this.activate(`coll:${collections.length - 1}`);
  }

  removeCollection(index: number): void {
    const collections = this.form.controls.collections;
    if (index < 0 || index >= collections.length) return;
    collections.removeAt(index);
    collections.markAsDirty();
    collections.markAsTouched();
    this.activate('collections');
  }

  onAllCollectionsToggle(): void {
    if (this.form.controls.allCollections.value && this.activeKind() === 'collection') {
      this.activate('collections');
    }
  }

  /** The one-line summary shown on a collection row and in the rail. */
  ruleCount(group: CollectionGroup): number {
    return group.controls.rules.length;
  }

  // ───────────────────────────── rules ─────────────────────────────

  addRule(group: CollectionGroup): void {
    group.controls.rules.push(
      this.#buildRuleGroup({ matchingPattern: '', matchingTags: [], matchingTagOperator: 'Any' }),
    );
    group.controls.rules.markAsDirty();
  }

  removeRule(group: CollectionGroup, index: number): void {
    group.controls.rules.removeAt(index);
    group.controls.rules.markAsDirty();
    group.controls.rules.markAsTouched();
  }

  addRuleTag(rule: RuleGroup, raw: string): void {
    const control = rule.controls.matchingTags;
    const tags = addTagToList(control.value, raw);
    if (tags === control.value) return;
    control.setValue([...tags]);
    control.markAsDirty();
  }

  removeRuleTag(rule: RuleGroup, tag: string): void {
    const control = rule.controls.matchingTags;
    control.setValue([...removeTagFromList(control.value, tag)]);
    control.markAsDirty();
  }

  toggleTagOperator(rule: RuleGroup): void {
    const control = rule.controls.matchingTagOperator;
    control.setValue(control.value === 'Any' ? 'All' : 'Any');
    control.markAsDirty();
  }

  // ───────────────────────────── errors ─────────────────────────────

  showError(control: AbstractControl, error?: string): boolean {
    if (!(control.touched || control.dirty || this.submitAttempted())) return false;
    return error ? control.hasError(error) : control.invalid;
  }

  // ───────────────────────────── submit ─────────────────────────────

  /** Validate an attempted submit and reveal the first invalid section. */
  submitResult(): BundleFormResult | undefined {
    this.submitAttempted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      const first = this.firstInvalidSection();
      if (first) this.activate(first);
      return undefined;
    }
    const result = this.buildResult();
    const errors = this.#domainErrors(result);
    this.submitErrors.set(errors);
    return errors.length > 0 ? undefined : result;
  }

  // ───────────────────────────── private ─────────────────────────────

  #initialSection(): BundleSection {
    if (this.options.data.mode === 'edit') return 'output';
    const collections = this.options.data.bundle?.collections;
    return Array.isArray(collections) && collections.length > 0 ? 'coll:0' : 'collections';
  }

  #populate(): void {
    const draft = toDraft(this.options.data.bundle, this.isEditMode ? [] : this.allCollectionNames());
    const name = this.options.data.name ?? '';
    this.form.patchValue({ ...draft, name });

    for (const collection of draft.collections) {
      this.form.controls.collections.push(this.#buildCollectionGroup(collection), { emitEvent: false });
    }

    // A new bundle opens on its first collection, including an explicitly empty list.
    if (!this.isEditMode && this.form.controls.collections.length > 0 && !this.form.controls.allCollections.value) {
      this.activeSection.set('coll:0');
    }

    if (this.isEditMode && name) {
      this.form.controls.name.disable({ emitEvent: false });
    }

    // Cross-control validators ran before their siblings had values; settle them now.
    this.form.controls.typeDistFile.updateValueAndValidity({ emitEvent: false });
    this.form.controls.collections.updateValueAndValidity({ emitEvent: false });
  }

  #buildCollectionGroup(collection: BundleDraftCollection): CollectionGroup {
    const group: CollectionGroup = new FormGroup({
      name: new FormControl<string>(collection.name, { nonNullable: true, validators: [Validators.required] }),
      bundledKeyPrefix: new FormControl<string>(collection.bundledKeyPrefix, { nonNullable: true }),
      mergeStrategy: new FormControl<MergeStrategy>(collection.mergeStrategy, { nonNullable: true }),
      allEntries: new FormControl<boolean>(collection.allEntries, { nonNullable: true }),
      rules: new FormArray<RuleGroup>(
        collection.rules.map((rule) => this.#buildRuleGroup(rule)),
        { validators: [rulesRequiredValidator] },
      ),
    });
    // The rules validator reads `allEntries`, which it could not see before the group existed;
    // settle it now and re-run it on every toggle.
    group.controls.rules.updateValueAndValidity({ emitEvent: false });
    this.#changes.add(
      group.controls.allEntries.valueChanges.subscribe(() => group.controls.rules.updateValueAndValidity()),
    );
    return group;
  }

  #buildRuleGroup(rule: BundleDraftRule): RuleGroup {
    return new FormGroup({
      matchingPattern: new FormControl<string>(rule.matchingPattern, {
        nonNullable: true,
        validators: [Validators.required],
      }),
      matchingTags: new FormControl<string[]>([...rule.matchingTags], { nonNullable: true }),
      matchingTagOperator: new FormControl<TagOperator>(rule.matchingTagOperator, { nonNullable: true }),
    });
  }

  #uniqueNameValidator(): ValidatorFn {
    return (control) => {
      if (this.options.data.mode === 'edit') return null;
      const value = String(control.value ?? '').trim();
      if (!value) return null;
      return (
        this.options.nameValidator?.(control) ??
        (this.options.bundleNames().includes(value) ? { nameExists: { name: value } } : null)
      );
    };
  }

  /**
   * Validators that read a sibling control do not re-run on their own when the sibling changes;
   * these subscriptions nudge them.
   */
  #wireDependentValidation(): void {
    const controls = this.form.controls;
    this.#changes.add(
      controls.typesEnabled.valueChanges.subscribe(() => {
        controls.typeDistFile.updateValueAndValidity();
        controls.tokenConstantName.updateValueAndValidity();
      }),
    );
    this.#changes.add(
      controls.allCollections.valueChanges.subscribe(() => {
        controls.collections.updateValueAndValidity();
      }),
    );
  }

  #wireDryRun(): void {
    this.#changes.add(
      this.form.valueChanges
        .pipe(
          startWith(null),
          tap(() => this.previewStale.set(true)),
          debounceTime(300),
          map(() => dryRunRequest(this.#draft())),
          switchMap((request) => {
            if (!request) {
              return of({ status: 'waiting' as const, result: undefined });
            }
            this.previewStatus.update((status) => (status === 'ready' ? status : 'loading'));
            return this.options.dryRun(request).pipe(
              map((result) => ({ status: 'ready' as const, result })),
              catchError(() => of({ status: 'error' as const, result: undefined })),
            );
          }),
        )
        .subscribe(({ status, result }) => {
          this.previewStatus.set(status);
          if (status !== 'error') this.dryRun.set(result);
          this.previewStale.set(false);
        }),
    );
  }

  buildResult(): BundleFormResult {
    const draft = this.#draft();
    return { name: draft.name.trim(), bundle: toDefinition(draft) };
  }

  /**
   * The same domain rules the API applies on save, so the dialog never closes on a
   * definition the server would reject. The key is checked only when it can be sent
   * (it is locked in edit mode).
   */
  #domainErrors({ name, bundle }: BundleFormResult): string[] {
    return checkBundleDefinition(bundle, this.allCollectionNames(), this.form.controls.name.enabled ? name : undefined)
      .errors;
  }
}

function localePlaceholderValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '');
  if (!value.trim()) return null;
  return hasLocalePlaceholder(value) ? null : { missingLocale: true };
}

function typeFileValidator(control: AbstractControl): ValidationErrors | null {
  const parent = control.parent;
  const enabled = parent?.get('typesEnabled')?.value === true;
  if (!enabled) return null;
  const value = String(control.value ?? '').trim();
  if (!value) return { required: true };
  return isTypeScriptFile(value) ? null : { notTypeScript: true };
}

/** Domain identifier rule, the one `validateBundleDefinition` applies to `tokenConstantName`. */
function identifierValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  if (!value) return null;
  return isValidJavaScriptIdentifier(value) ? null : { invalidIdentifier: true };
}

function collectionsRequiredValidator(control: AbstractControl): ValidationErrors | null {
  const parent = control.parent;
  const all = parent?.get('allCollections')?.value === true;
  return control instanceof FormArray && collectionsRequired(all, control.length) ? { collectionsEmpty: true } : null;
}

function rulesRequiredValidator(control: AbstractControl): ValidationErrors | null {
  const parent = control.parent;
  const all = parent?.get('allEntries')?.value === true;
  return control instanceof FormArray && rulesRequired(all, control.length) ? { rulesEmpty: true } : null;
}

export type BundleSection = 'output' | 'collections' | `coll:${number}` | 'types' | 'options';
export type MergeStrategy = 'merge' | 'override';
export type TagOperator = 'Any' | 'All';
export type TokenCasingChoice = 'inherit' | TokenCasingDto;
export type IcuChoice = 'inherit' | 'on' | 'off';

interface BundleDraftRule {
  matchingPattern: string;
  matchingTags: string[];
  matchingTagOperator: TagOperator;
}

interface BundleDraftCollection {
  name: string;
  bundledKeyPrefix: string;
  mergeStrategy: MergeStrategy;
  allEntries: boolean;
  rules: BundleDraftRule[];
}

/** The form's raw choices, including values hidden by its toggles. */
interface BundleDraft {
  name: string;
  dist: string;
  bundleName: string;
  allCollections: boolean;
  collections: BundleDraftCollection[];
  typesEnabled: boolean;
  typeDistFile: string;
  tokenCasing: TokenCasingChoice;
  tokenConstantName: string;
  transformICUToTransloco: IcuChoice;
}

export interface PreviewFolder {
  readonly path: string;
  readonly pathParts: readonly string[];
  readonly files: readonly PreviewFile[];
}

interface PreviewFile {
  readonly name: string;
  readonly nameParts: readonly string[];
  readonly kind: 'bundle' | 'types';
  readonly exists: boolean | undefined;
}

interface PreviewPath {
  path: string;
  kind: PreviewFile['kind'];
  exists: boolean | undefined;
}

export const LOCALE_PLACEHOLDER = '{locale}';
const PATH_SEPARATORS = /(?<=[._\-/])/;

function toDraft(definition: BundleDefinitionDto | undefined, allCollectionNames: readonly string[]): BundleDraft {
  const bundle = definition === undefined ? undefined : normalizeBundleDefinition(definition);
  const collections = bundle?.collections;
  const selected = Array.isArray(collections) ? collections.map(toDraftCollection) : [];
  const first = allCollectionNames[0];
  if (collections !== 'All' && selected.length === 0 && first) {
    selected.push(toDraftCollection({ name: first, entriesSelectionRules: 'All' }));
  }

  return {
    name: '',
    dist: bundle?.dist ?? '',
    bundleName: bundle?.bundleName ?? '',
    allCollections: collections === 'All',
    collections: selected,
    typesEnabled: Boolean(bundle?.typeDistFile),
    typeDistFile: bundle?.typeDistFile ?? '',
    tokenCasing: bundle?.tokenCasing ?? 'inherit',
    tokenConstantName: bundle?.tokenConstantName ?? '',
    transformICUToTransloco:
      bundle?.transformICUToTransloco === undefined ? 'inherit' : bundle.transformICUToTransloco ? 'on' : 'off',
  };
}

function toDraftCollection(collection: CollectionBundleDefinitionDto): BundleDraftCollection {
  return {
    name: collection.name,
    bundledKeyPrefix: collection.bundledKeyPrefix ?? '',
    mergeStrategy: collection.mergeStrategy ?? 'merge',
    allEntries: collection.entriesSelectionRules === 'All',
    rules: Array.isArray(collection.entriesSelectionRules) ? collection.entriesSelectionRules.map(toDraftRule) : [],
  };
}

function toDraftRule(rule: EntrySelectionRuleDto): BundleDraftRule {
  return {
    matchingPattern: rule.matchingPattern,
    matchingTags: [...(rule.matchingTags ?? [])],
    matchingTagOperator: rule.matchingTagOperator ?? 'Any',
  };
}

function toDefinition(draft: BundleDraft): BundleDefinitionDto {
  const collections: BundleDefinitionDto['collections'] = draft.allCollections
    ? 'All'
    : draft.collections.map((collection) => {
        const prefix = collection.bundledKeyPrefix.trim();
        const entriesSelectionRules: CollectionBundleDefinitionDto['entriesSelectionRules'] = collection.allEntries
          ? 'All'
          : collection.rules.map((rule) => ({
              matchingPattern: rule.matchingPattern.trim(),
              ...(rule.matchingTags.length > 0
                ? { matchingTags: [...rule.matchingTags], matchingTagOperator: rule.matchingTagOperator }
                : {}),
            }));
        return {
          name: collection.name,
          ...(prefix ? { bundledKeyPrefix: prefix } : {}),
          entriesSelectionRules,
          ...(collection.mergeStrategy === 'override' ? { mergeStrategy: 'override' as const } : {}),
        };
      });

  const typeDistFile = draft.typeDistFile.trim();
  const tokenConstantName = draft.tokenConstantName.trim();
  const typesOn = draft.typesEnabled && typeDistFile.length > 0;

  return {
    bundleName: draft.bundleName.trim(),
    dist: draft.dist.trim(),
    collections,
    ...(typesOn ? { typeDistFile } : {}),
    ...(typesOn && draft.tokenCasing !== 'inherit' ? { tokenCasing: draft.tokenCasing } : {}),
    ...(typesOn && tokenConstantName ? { tokenConstantName } : {}),
    ...(draft.transformICUToTransloco !== 'inherit'
      ? { transformICUToTransloco: draft.transformICUToTransloco === 'on' }
      : {}),
  };
}

function dryRunRequest(draft: BundleDraft): BundleDryRunRequestDto | undefined {
  const name = draft.name.trim();
  if (!name || !draft.dist.trim() || !draft.bundleName.trim()) return undefined;
  return { name, bundle: toDefinition(draft) };
}

function outputSummary(draft: BundleDraft): string {
  if (!draft.dist.trim() && !draft.bundleName.trim()) return '';
  return bundleOutputFile({ dist: draft.dist.trim(), bundleName: draft.bundleName.trim() }, LOCALE_PLACEHOLDER);
}

function typeFileName(draft: BundleDraft): string {
  if (!draft.typesEnabled) return '';
  return draft.typeDistFile.trim().split('/').pop() ?? '';
}

function patternFiles(draft: BundleDraft, locales: readonly string[]): string[] {
  const bundleName = draft.bundleName.trim();
  if (!bundleName) return [];
  return locales.map((locale) => bundleOutputFile({ dist: '', bundleName }, locale));
}

function outputFiles(draft: BundleDraft, locales: readonly string[]): string[] {
  const bundleName = draft.bundleName.trim();
  if (!bundleName) return [];
  return locales.map((locale) => bundleOutputFile({ dist: draft.dist.trim(), bundleName }, locale));
}

function localTree(draft: BundleDraft, locales: readonly string[]): readonly PreviewFolder[] {
  const files: PreviewPath[] = outputFiles(draft, locales).map((path) => ({ path, kind: 'bundle', exists: undefined }));
  if (draft.typesEnabled && draft.typeDistFile.trim()) {
    files.push({ path: stripDotSlash(draft.typeDistFile.trim()), kind: 'types', exists: undefined });
  }
  return groupIntoFolders(files);
}

/** The API plan echoes configured type paths, so tidy those paths for the tree. */
function stripDotSlash(path: string): string {
  return path.replace(/^\.\//, '').replace(/\/+$/, '');
}

function plannedTree(files: readonly PreviewPath[]): readonly PreviewFolder[] {
  return groupIntoFolders(files.map((file) => ({ ...file, path: stripDotSlash(file.path) })));
}

function groupIntoFolders(files: readonly PreviewPath[]): readonly PreviewFolder[] {
  const folders = new Map<string, PreviewFile[]>();
  for (const file of files) {
    const slash = file.path.lastIndexOf('/');
    const folder = slash >= 0 ? file.path.slice(0, slash) : '';
    const name = slash >= 0 ? file.path.slice(slash + 1) : file.path;
    const list = folders.get(folder) ?? [];
    list.push({ name, nameParts: splitAfterSeparators(name, PATH_SEPARATORS), kind: file.kind, exists: file.exists });
    folders.set(folder, list);
  }
  return [...folders.entries()].map(([path, files]) => ({
    path,
    pathParts: splitAfterSeparators(path, PATH_SEPARATORS),
    files,
  }));
}

function splitAfterSeparators(value: string, separators: RegExp): readonly string[] {
  return value.length === 0 ? [] : value.split(separators);
}

/** Keep the form's error keys while using the domain definition rules. */
function collectionsRequired(allCollections: boolean, count: number): boolean {
  return !hasBundleCollections(allCollections ? 'All' : Array.from({ length: count }, () => null));
}

function rulesRequired(allEntries: boolean, count: number): boolean {
  return !hasBundleRules(allEntries ? 'All' : Array.from({ length: count }, () => null));
}

/** Reveal invalid fields in the same order as the dialog's navigation rail. */
function firstErrorSection(errors: ReadonlySet<BundleSection>, collectionCount: number): BundleSection | undefined {
  const order: BundleSection[] = [
    'output',
    'collections',
    ...Array.from({ length: collectionCount }, (_, index) => `coll:${index}` as const),
    'types',
  ];
  return order.find((section) => errors.has(section));
}
