import { computed, type Signal, signal } from '@angular/core';
import {
  type AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  type ValidationErrors,
  type ValidatorFn,
  Validators,
} from '@angular/forms';
import type { BundleDryRunRequestDto, BundleDryRunResultDto, TokenCasingDto } from '@simoncodes-ca/data-transfer';
import {
  bundleKeyToConstantName,
  hasBundleCollections,
  hasBundleRules,
  hasLocalePlaceholder,
  isTypeScriptFile,
  isValidJavaScriptIdentifier,
} from '@simoncodes-ca/domain';
import { type Observable, Subscription } from 'rxjs';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import { addTagToList, removeTagFromList } from '../../shared/tag-list-edit';
import { segmentValidator } from '../../shared/validators/segment.validator';
import type { FormSubmitEnv, NamedEntryWrite } from '../store/dialog-config-submit';
import { detailsElseMessage, FormSubmitAttempt } from '../store/form-submit-attempt';
import {
  type BundleDraft,
  type BundleDraftCollection,
  type BundleDraftRule,
  bundleDraftErrors,
  type IcuChoice,
  type MergeStrategy,
  type TagOperator,
  type TokenCasingChoice,
  toBundleDraft,
  toBundleResult,
} from './bundle-draft';
import type { BundleFormDialogData, BundleFormResult } from './bundle-form-dialog-data';
import { BundlePreview } from './bundle-output-preview';

export interface BundleFormOptions {
  data: BundleFormDialogData;
  collectionNames: () => readonly string[];
  bundleNames: () => readonly string[];
  locales: () => readonly string[];
  baseLocale: () => string;
  tokenCasing: () => TokenCasingDto;
  icuTransform: () => boolean;
  env: FormSubmitEnv;
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

/** Typed bundle editing and submit state, independent of the dialog DOM. */
export class BundleForm {
  readonly #changes = new Subscription();
  readonly #attempt: FormSubmitAttempt<BundleFormResult>;
  /** True from submit until the server has answered. */
  readonly saving: Signal<boolean>;
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
  readonly submitAttempted: Signal<boolean>;
  /**
   * What stopped the last submit: messages from the domain Bundle Definition rules that the
   * control validators did not catch, or the server's refusal (its rule messages, else its
   * one message). Cleared on the next edit.
   */
  readonly submitErrors: Signal<readonly string[]>;

  readonly preview = new BundlePreview({
    draft: () => this.#draft(),
    locales: () => this.projectLocales(),
    baseLocale: () => this.projectBaseLocale(),
    dryRun: (request) => this.options.dryRun(request),
  });

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

  readonly derivedConstantName = computed(() => bundleKeyToConstantName(this.#draft().name.trim() || 'bundle'));

  /** Sections whose fields are invalid and worth flagging in the rail. */
  readonly sectionErrors = computed<ReadonlySet<BundleSection>>(() => {
    this.#formTick();
    const flag = (control: AbstractControl): boolean => control.invalid && this.#attempt.reveals(control);
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

  /** What the ICU switch shows: the explicit choice, or the project default while inheriting. */
  readonly icuChecked = computed(() => {
    this.#formTick();
    const choice = this.form.controls.transformICUToTransloco.value;
    return choice === 'inherit' ? this.projectIcuTransform() : choice === 'on';
  });

  readonly hasOverride = computed(() => {
    this.#formTick();
    return this.form.controls.collections.controls.some((group) => group.controls.mergeStrategy.value === 'override');
  });

  constructor(private readonly options: BundleFormOptions) {
    this.#attempt = new FormSubmitAttempt({
      nameControl: () => this.form.controls.name,
      normalizeName: (value) => String(value ?? '').trim(),
      fallbackTokens: {
        create: TRACKER_TOKENS.BUNDLES.TOAST.CREATEFAILED,
        update: TRACKER_TOKENS.BUNDLES.TOAST.UPDATEFAILED,
      },
      env: options.env,
      entry: options.data,
      prepare: () => this.submitResult(),
      refusalMessages: detailsElseMessage,
      onNameConflict: () => this.activate('output'),
      reveal: 'touched-dirty-attempted',
    });
    this.saving = this.#attempt.saving;
    this.submitAttempted = this.#attempt.attempted;
    this.submitErrors = this.#attempt.errors;
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
    this.#changes.add(this.preview.connect(this.form.valueChanges));
    this.#changes.add(this.#attempt.clearOnEdit(this.form));
    options.env.destroyRef.onDestroy(() => this.destroy());
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
    return this.#attempt.showError(control, error);
  }

  // ───────────────────────────── submit ─────────────────────────────

  /** Validate an attempted submit and reveal the first invalid section. */
  submitResult(): BundleFormResult | undefined {
    if (!this.#attempt.check(this.form)) {
      const first = this.firstInvalidSection();
      if (first) this.activate(first);
      return undefined;
    }
    const result = this.buildResult();
    const errors = bundleDraftErrors(result, this.allCollectionNames(), this.form.controls.name.enabled);
    this.#attempt.fail(errors);
    return errors.length > 0 ? undefined : result;
  }

  /**
   * Validates, then writes the bundle and closes `dialog` with it once the server accepts. A taken
   * name opens the Output section on the name field; any other refusal lands in `submitErrors`.
   * Ignored while a write is in flight.
   */
  submit(options: NamedEntryWrite<BundleFormResult>): Promise<void> {
    return this.#attempt.submit(options);
  }

  // ───────────────────────────── private ─────────────────────────────

  #initialSection(): BundleSection {
    if (this.options.data.mode === 'edit') return 'output';
    const collections = this.options.data.bundle?.collections;
    return Array.isArray(collections) && collections.length > 0 ? 'coll:0' : 'collections';
  }

  #populate(): void {
    const draft = toBundleDraft(this.options.data.bundle, this.isEditMode ? [] : this.allCollectionNames());
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
        this.#attempt.nameValidator(control) ??
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

  buildResult(): BundleFormResult {
    return toBundleResult(this.#draft());
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
