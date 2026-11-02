import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import type { BundleDefinitionDto, BundleDryRunRequestDto, BundleDryRunResultDto } from '@simoncodes-ca/data-transfer';
import { normalizeBundleDefinition } from '@simoncodes-ca/domain';
import { Observable, of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import { fakeDialog, fakeEnv } from '../../../testing/form-submit-env';
import { toApiError } from '../../shared/api-error/api-error';
import { BundleForm, type BundleFormOptions, type BundleSection } from './bundle-form';
import type { BundleFormDialogData, BundleFormResult } from './bundle-form-dialog-data';

const definition: BundleDefinitionDto = {
  bundleName: 'admin.{locale}',
  dist: './dist/i18n',
  collections: [{ name: 'main', entriesSelectionRules: 'All' }],
};
const result: BundleDryRunResultDto = {
  name: 'admin',
  locales: ['en', 'fr'],
  files: [{ path: 'dist/i18n/admin.en.json', kind: 'bundle', locale: 'en', exists: true, keysCount: 12 }],
  keysPerLocale: { en: 12, fr: 10 },
  conflictsCount: 0,
  conflictKeys: [],
  hierarchicalConflicts: [],
  warnings: [],
};

const models: BundleForm[] = [];
function build(options: Partial<BundleFormOptions> = {}): BundleForm {
  const env = options.env ?? fakeEnv();
  const model = new BundleForm({
    data: { mode: 'create', name: 'admin', bundle: definition },
    collectionNames: () => ['main', 'extra'],
    bundleNames: () => ['taken'],
    locales: () => ['en', 'fr'],
    baseLocale: () => 'en',
    tokenCasing: () => 'upperCase',
    icuTransform: () => true,
    dryRun: () => of(result),
    ...options,
    env,
  });
  models.push(model);
  return model;
}

afterEach(() => {
  for (const model of models) model.destroy();
  models.length = 0;
  vi.useRealTimers();
});

describe('BundleForm', () => {
  it('settles sibling validators after populate and keeps collection and rule order', () => {
    const bundle: BundleDefinitionDto = {
      ...definition,
      typeDistFile: './types.ts',
      tokenCasing: 'camelCase',
      tokenConstantName: 'ADMIN_KEYS',
      transformICUToTransloco: false,
      collections: [
        { name: 'extra', entriesSelectionRules: 'All' },
        {
          name: 'main',
          bundledKeyPrefix: 'app',
          mergeStrategy: 'override',
          entriesSelectionRules: [
            { matchingPattern: 'app.*', matchingTags: ['ui'], matchingTagOperator: 'All' },
            { matchingPattern: 'shared.*' },
          ],
        },
      ],
    };
    const model = build({ data: { mode: 'edit', name: 'admin', bundle } });
    expect(model.form.valid).toBe(true);
    expect(model.form.controls.collections.errors).toBeNull();
    expect(model.form.controls.typeDistFile.errors).toBeNull();
    expect(model.form.controls.collections.at(0).controls.rules.errors).toBeNull();
    expect(model.form.controls.collections.at(1).controls.rules.errors).toBeNull();
    expect(model.form.controls.name.disabled).toBe(true);
    expect(model.activeSection()).toBe('output');
    expect(model.buildResult()).toEqual({ name: 'admin', bundle });
    expect(model.submitResult()).toEqual({ name: 'admin', bundle });
  });

  it('settles initially invalid types and rules and an empty edit collection list', () => {
    const model = build({
      data: {
        mode: 'edit',
        name: 'admin',
        bundle: {
          ...definition,
          typeDistFile: './types.js',
          collections: [{ name: 'main', entriesSelectionRules: [] }],
        },
      },
    });
    expect(model.form.controls.typeDistFile.errors).toEqual({ notTypeScript: true });
    expect(model.form.controls.collections.at(0).controls.rules.errors).toEqual({ rulesEmpty: true });
    const empty = build({ data: { mode: 'edit', name: 'admin', bundle: { ...definition, collections: [] } } });
    expect(empty.form.controls.collections.errors).toEqual({ collectionsEmpty: true });
    const all = build({ data: { mode: 'edit', name: 'admin', bundle: { ...definition, collections: 'All' } } });
    expect(all.form.controls.collections.errors).toBeNull();
    expect(all.form.valid).toBe(true);
  });

  it('revalidates dependent controls on toggles and publishes touched and status changes', () => {
    const model = build();
    const controls = model.form.controls;
    expect(model.sectionErrors().size).toBe(0);
    controls.typesEnabled.setValue(true);
    expect(controls.typeDistFile.errors).toEqual({ required: true });
    expect(model.sectionErrors().size).toBe(0);
    controls.typeDistFile.markAsTouched();
    expect(model.sectionErrors()).toEqual(new Set(['types']));
    expect(model.firstInvalidSection()).toBe('types');
    controls.typeDistFile.setValue('./types.ts');
    expect(model.sectionErrors().size).toBe(0);
    controls.typeDistFile.setValue('./types.js');
    expect(controls.typeDistFile.errors).toEqual({ notTypeScript: true });
    controls.typesEnabled.setValue(false);
    expect(controls.typeDistFile.errors).toBeNull();
    const group = controls.collections.at(0);
    group.controls.allEntries.setValue(false);
    expect(group.controls.rules.errors).toEqual({ rulesEmpty: true });
    group.controls.rules.markAsTouched();
    expect(model.sectionErrors()).toEqual(new Set(['coll:0']));
    group.controls.allEntries.setValue(true);
    expect(group.controls.rules.errors).toBeNull();
    model.removeCollection(0);
    expect(controls.collections.errors).toEqual({ collectionsEmpty: true });
    expect(model.firstInvalidSection()).toBe('collections');
    controls.allCollections.setValue(true);
    expect(controls.collections.errors).toBeNull();
    expect(model.sectionErrors().size).toBe(0);
  });

  it('validates names, pattern, identifier, rules and submit errors without a dialog', () => {
    const model = build();
    const controls = model.form.controls;
    controls.name.setValue('taken');
    expect(controls.name.errors).toEqual({ nameExists: { name: 'taken' } });
    controls.name.setValue('bad name!');
    expect(controls.name.hasError('pattern')).toBe(true);
    controls.name.setValue('admin');
    controls.bundleName.setValue('admin');
    expect(controls.bundleName.errors).toEqual({ missingLocale: true });
    controls.bundleName.setValue('{locale}');
    for (const invalid of ['1BAD', 'class', 'type', 'await', 'undefined']) {
      controls.tokenConstantName.setValue(invalid);
      expect(controls.tokenConstantName.errors).toEqual({ invalidIdentifier: true });
    }
    controls.tokenConstantName.setValue('ADMIN_KEYS');
    const group = controls.collections.at(0);
    group.controls.allEntries.setValue(false);
    model.addRule(group);
    expect(group.controls.rules.at(0).controls.matchingPattern.errors).toEqual({ required: true });
    expect(model.submitResult()).toBeUndefined();
    expect(model.submitAttempted()).toBe(true);
    expect(model.activeSection()).toBe('coll:0');
    group.controls.rules.at(0).controls.matchingPattern.setValue('*');
    group.controls.name.setValue('ghost');
    expect(model.form.valid).toBe(true);
    expect(model.submitResult()).toBeUndefined();
    expect(model.submitErrors()).toEqual(["Collection 'ghost' does not exist in the configuration."]);
    group.controls.name.setValue('main');
    expect(model.submitErrors()).toEqual([]);
    expect(model.submitResult()?.bundle.collections).toEqual([
      { name: 'main', entriesSelectionRules: [{ matchingPattern: '*' }] },
    ]);
  });

  it('uses current config signals for available collections, locales and inherited ICU', () => {
    const names = signal(['main', 'extra']);
    const locales = signal(['en']);
    const icu = signal(true);
    const model = build({ collectionNames: names, locales, icuTransform: icu });
    expect(model.availableCollections()).toEqual(['extra']);
    expect(model.preview.patternFiles()).toEqual(['admin.en.json']);
    names.set(['main', 'new']);
    locales.set(['fr']);
    icu.set(false);
    expect(model.availableCollections()).toEqual(['new']);
    expect(model.preview.patternFiles()).toEqual(['admin.fr.json']);
    expect(model.icuChecked()).toBe(false);
    model.setIcu(true);
    expect(model.buildResult().bundle.transformICUToTransloco).toBe(true);
    model.setIcu(false);
    expect(model.buildResult().bundle).not.toHaveProperty('transformICUToTransloco');
  });
});

describe('BundleForm preview', () => {
  beforeEach(() => vi.useFakeTimers());

  it('debounces the initial request and rapid edits, publishing waiting, loading and ready', () => {
    const response = new Subject<BundleDryRunResultDto>();
    const dryRun = vi.fn(() => response);
    const model = build({ dryRun });
    expect(model.preview.previewStatus()).toBe('waiting');
    expect(model.preview.previewStale()).toBe(true);
    vi.advanceTimersByTime(200);
    model.form.controls.dist.setValue('./other');
    vi.advanceTimersByTime(299);
    expect(dryRun).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(dryRun).toHaveBeenCalledTimes(1);
    expect(dryRun).toHaveBeenCalledWith({ name: 'admin', bundle: { ...definition, dist: './other' } });
    expect(model.preview.previewStatus()).toBe('loading');
    expect(model.preview.previewStale()).toBe(true);
    response.next(result);
    expect(model.preview.previewStatus()).toBe('ready');
    expect(model.preview.previewStale()).toBe(false);
    expect(model.preview.dryRun()).toBe(result);
    expect(model.preview.previewFileCount()).toBe(1);
    expect(model.preview.keysPerLocale()).toBe(12);
  });

  it('keeps the planned tree reference across draft and locale changes', () => {
    const projectLocales = signal<readonly string[]>(['en', 'fr']);
    const model = build({ locales: projectLocales });
    vi.advanceTimersByTime(300);
    const tree = model.preview.previewTree();
    model.form.controls.dist.setValue('./other');
    expect(model.preview.previewTree()).toBe(tree);
    projectLocales.set(['en', 'de']);
    expect(model.preview.previewTree()).toBe(tree);
  });

  it('cancels the previous request when the next debounced request starts', () => {
    const first = new Subject<BundleDryRunResultDto>();
    const second = new Subject<BundleDryRunResultDto>();
    const cancelled = vi.fn();
    const dryRun = vi
      .fn()
      .mockReturnValueOnce(
        new Observable<BundleDryRunResultDto>((subscriber) => {
          const subscription = first.subscribe(subscriber);
          return () => {
            subscription.unsubscribe();
            cancelled();
          };
        }),
      )
      .mockReturnValueOnce(second);
    const model = build({ dryRun });
    vi.advanceTimersByTime(300);
    model.form.controls.dist.setValue('./new');
    vi.advanceTimersByTime(299);
    expect(cancelled).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cancelled).toHaveBeenCalledTimes(1);
    first.next(result);
    expect(model.preview.dryRun()).toBeUndefined();
    expect(model.preview.previewStatus()).toBe('loading');
    const latest = { ...result, name: 'latest' };
    second.next(latest);
    expect(model.preview.dryRun()).toBe(latest);
    expect(model.preview.previewStale()).toBe(false);
  });

  it('keeps a ready result and status while refreshing, retains it on error, then recovers', () => {
    const refresh = new Subject<BundleDryRunResultDto>();
    const recovery = new Subject<BundleDryRunResultDto>();
    const dryRun = vi.fn().mockReturnValueOnce(of(result)).mockReturnValueOnce(refresh).mockReturnValueOnce(recovery);
    const model = build({ dryRun });
    vi.advanceTimersByTime(300);
    model.form.controls.dist.setValue('./new');
    expect(model.preview.previewStatus()).toBe('ready');
    expect(model.preview.previewStale()).toBe(true);
    expect(model.preview.dryRun()).toBe(result);
    vi.advanceTimersByTime(300);
    expect(model.preview.previewStatus()).toBe('ready');
    expect(model.preview.previewTree()[0]?.path).toBe('dist/i18n');
    refresh.error(new Error('failed'));
    expect(model.preview.previewStatus()).toBe('error');
    expect(model.preview.previewStale()).toBe(false);
    expect(model.preview.dryRun()).toBe(result);
    expect(model.preview.previewTree()).toEqual(model.preview.localTree());
    model.form.controls.dist.setValue('./recovered');
    vi.advanceTimersByTime(300);
    expect(model.preview.previewStatus()).toBe('loading');
    expect(model.preview.dryRun()).toBe(result);
    recovery.next({ ...result, hierarchicalConflicts: ['a.b'] });
    expect(model.preview.previewStatus()).toBe('ready');
    expect(model.preview.previewStale()).toBe(false);
    expect(model.preview.hierarchicalConflicts()).toEqual(['a.b']);
  });

  it('clears a previous result and returns to waiting when the request gate closes', () => {
    const dryRun = vi.fn(() => of(result));
    const model = build({ dryRun });
    vi.advanceTimersByTime(300);
    model.form.controls.name.setValue(' ');
    expect(model.preview.previewStale()).toBe(true);
    expect(model.preview.dryRun()).toBe(result);
    vi.advanceTimersByTime(300);
    expect(dryRun).toHaveBeenCalledTimes(1);
    expect(model.preview.previewStatus()).toBe('waiting');
    expect(model.preview.previewStale()).toBe(false);
    expect(model.preview.dryRun()).toBeUndefined();
  });

  it('shows the local tree after an initial error and can retry on the next edit', () => {
    const response = new Subject<BundleDryRunResultDto>();
    const dryRun = vi.fn().mockReturnValueOnce(response).mockReturnValueOnce(of(result));
    const model = build({ dryRun });
    vi.advanceTimersByTime(300);
    response.error(new Error('failed'));
    expect(model.preview.previewStatus()).toBe('error');
    expect(model.preview.previewStale()).toBe(false);
    expect(model.preview.dryRun()).toBeUndefined();
    expect(model.preview.previewTree()).toEqual(model.preview.localTree());
    model.form.controls.dist.setValue('./retry');
    vi.advanceTimersByTime(300);
    expect(model.preview.previewStatus()).toBe('ready');
    expect(model.preview.dryRun()).toBe(result);
  });

  it('cancels pending debounce and in-flight work on destroy', () => {
    const dryRun = vi.fn(() => of(result));
    const pending = build({ dryRun });
    pending.destroy();
    vi.advanceTimersByTime(300);
    expect(dryRun).not.toHaveBeenCalled();
    const response = new Subject<BundleDryRunResultDto>();
    const cancelled = vi.fn();
    const active = build({
      dryRun: () =>
        new Observable((subscriber) => {
          const subscription = response.subscribe(subscriber);
          return () => {
            subscription.unsubscribe();
            cancelled();
          };
        }),
    });
    vi.advanceTimersByTime(300);
    active.destroy();
    expect(cancelled).toHaveBeenCalledTimes(1);
    response.next(result);
    expect(active.preview.dryRun()).toBeUndefined();
    active.form.controls.dist.setValue('./ignored');
    vi.advanceTimersByTime(300);
    expect(active.preview.dryRun()).toBeUndefined();
  });
});

const minimal: BundleDefinitionDto = {
  bundleName: '{locale}',
  dist: './dist',
  collections: [{ name: 'main', entriesSelectionRules: 'All' }],
};

describe('BundleForm definition mapping', () => {
  const cases: {
    name: string;
    definition: BundleDefinitionDto;
    expected?: BundleDefinitionDto;
  }[] = [
    { name: 'minimal definition', definition: minimal },
    { name: 'All collections', definition: { ...minimal, collections: 'All' } },
    {
      name: 'explicit collections, rules, tags and override',
      definition: {
        ...minimal,
        collections: [
          {
            name: 'main',
            bundledKeyPrefix: ' app ',
            mergeStrategy: 'override',
            entriesSelectionRules: [{ matchingPattern: ' app.* ', matchingTags: ['ui'], matchingTagOperator: 'All' }],
          },
        ],
      },
    },
    { name: 'ICU on', definition: { ...minimal, transformICUToTransloco: true } },
    { name: 'ICU off', definition: { ...minimal, transformICUToTransloco: false } },
    { name: 'inherited casing with types on', definition: { ...minimal, typeDistFile: './types.ts' } },
    {
      name: 'explicit casing and constant name',
      definition: { ...minimal, typeDistFile: './types.ts', tokenCasing: 'camelCase', tokenConstantName: 'MAIN_KEYS' },
    },
    {
      name: 'merge strategy other than override is omitted',
      definition: { ...minimal, collections: [{ name: 'main', entriesSelectionRules: 'All', mergeStrategy: 'merge' }] },
      expected: minimal,
    },
    {
      name: 'empty prefix is omitted',
      definition: { ...minimal, collections: [{ name: 'main', entriesSelectionRules: 'All', bundledKeyPrefix: ' ' }] },
    },
    {
      name: 'types off drops type fields',
      definition: { ...minimal, tokenCasing: 'upperCase', tokenConstantName: 'MAIN_KEYS' },
      expected: minimal,
    },
    {
      name: 'legacy typeDist becomes typeDistFile',
      definition: { ...minimal, typeDist: './legacy.ts' } as BundleDefinitionDto,
    },
  ];

  it.each(cases)('$name', ({ definition, expected }) => {
    const model = build({ data: { mode: 'create', bundle: definition } });
    expect(model.buildResult().bundle).toEqual(expected ?? normalizeBundleDefinition(definition));
  });

  it('starts a new bundle with the first configured collection', () => {
    const firstCollection = [
      { name: 'main', bundledKeyPrefix: '', mergeStrategy: 'merge', allEntries: true, rules: [] },
    ];
    const blank = build({ data: { mode: 'create' } });
    const empty = build({ data: { mode: 'create', bundle: { ...minimal, collections: [] } } });
    const noNames = build({ data: { mode: 'create' }, collectionNames: () => [] });
    const emptyNoNames = build({
      data: { mode: 'create', bundle: { ...minimal, collections: [] } },
      collectionNames: () => [],
    });
    expect(blank.form.getRawValue().collections).toEqual(firstCollection);
    expect(empty.form.getRawValue().collections).toEqual(firstCollection);
    expect(noNames.form.getRawValue().collections).toEqual([]);
    expect(emptyNoNames.form.getRawValue().collections).toEqual([]);
  });

  it('preserves collection order and emits All despite hidden collection groups', () => {
    const definition: BundleDefinitionDto = {
      ...minimal,
      collections: [
        { name: 'extra', entriesSelectionRules: 'All' },
        { name: 'main', entriesSelectionRules: 'All' },
      ],
    };
    const model = build({ data: { mode: 'create', bundle: definition } });
    expect(model.form.getRawValue().collections.map((collection) => collection.name)).toEqual(['extra', 'main']);
    expect(model.buildResult().bundle.collections).toEqual(definition.collections);
    model.form.controls.allCollections.setValue(true);
    expect(model.buildResult().bundle.collections).toBe('All');
  });

  it('preserves hidden type choices in the draft but drops them when types are off', () => {
    const model = build({
      data: { mode: 'create', bundle: { ...minimal, typeDistFile: './types.ts', tokenCasing: 'camelCase' } },
    });
    expect(model.form.getRawValue().tokenCasing).toBe('camelCase');
    model.form.controls.typesEnabled.setValue(false);
    expect(model.buildResult().bundle).toEqual(minimal);
  });

  it('keeps rule All and empty tag choices separate from emitted fields', () => {
    const model = build({ data: { mode: 'create', bundle: minimal } });
    const group = model.form.controls.collections.at(0);
    expect(group.controls.allEntries.value).toBe(true);
    group.controls.allEntries.setValue(false);
    model.addRule(group);
    group.controls.rules.at(0).patchValue({ matchingPattern: ' * ', matchingTags: [], matchingTagOperator: 'All' });
    expect(model.buildResult().bundle.collections).toEqual([
      { name: 'main', entriesSelectionRules: [{ matchingPattern: '*' }] },
    ]);
  });

  it('emits Any with tags and omits the operator for whitespace-only or empty tags', () => {
    const model = build({ data: { mode: 'create', bundle: minimal } });
    const group = model.form.controls.collections.at(0);
    group.controls.allEntries.setValue(false);
    model.addRule(group);
    const rule = group.controls.rules.at(0);
    rule.patchValue({ matchingPattern: '*', matchingTags: ['ui'], matchingTagOperator: 'Any' });
    expect(model.buildResult().bundle.collections).toEqual([
      {
        name: 'main',
        entriesSelectionRules: [{ matchingPattern: '*', matchingTags: ['ui'], matchingTagOperator: 'Any' }],
      },
    ]);
    rule.controls.matchingTags.setValue([]);
    expect(model.buildResult().bundle.collections).toEqual([
      { name: 'main', entriesSelectionRules: [{ matchingPattern: '*' }] },
    ]);
    rule.controls.matchingTags.setValue(['  ']);
    expect(model.buildResult().bundle.collections).toEqual([
      {
        name: 'main',
        entriesSelectionRules: [{ matchingPattern: '*', matchingTags: ['  '], matchingTagOperator: 'Any' }],
      },
    ]);
  });
});

describe('BundleForm definition preview and validation', () => {
  beforeEach(() => vi.useFakeTimers());

  it.each(['name', 'dist', 'bundleName'] as const)('does not dry run without %s', (field) => {
    const dryRun = vi.fn((_request: BundleDryRunRequestDto) => of(result));
    const model = build({ data: { mode: 'create', name: 'main', bundle: minimal }, dryRun });
    model.form.controls[field].setValue('  ');
    vi.advanceTimersByTime(300);
    expect(dryRun.mock.calls[0]?.[0]).toBeUndefined();
  });

  it('uses the trimmed name and definition in a dry run', () => {
    const dryRun = vi.fn((_request: BundleDryRunRequestDto) => of(result));
    const model = build({ data: { mode: 'create', name: ' main ', bundle: minimal }, dryRun });
    vi.advanceTimersByTime(300);
    expect(dryRun.mock.calls[0]?.[0]).toEqual({ name: 'main', bundle: model.buildResult().bundle });
  });

  it('derives the same output summary, files, type name and local tree', () => {
    const model = build({ data: { mode: 'create', bundle: minimal } });
    model.form.patchValue({
      bundleName: '{locale}/admin',
      dist: ' ./dist//i18n/ ',
      typesEnabled: true,
      typeDistFile: './dist/types/admin.ts',
    });
    expect(model.preview.outputSummary()).toBe('dist/i18n/{locale}/admin.json');
    expect(model.preview.typeFileName()).toBe('admin.ts');
    expect(model.preview.patternFiles()).toEqual(['en/admin.json', 'fr/admin.json']);
    expect(
      model.preview
        .localTree()
        .flatMap((folder) =>
          folder.files.filter((file) => file.kind === 'bundle').map((file) => `${folder.path}/${file.name}`),
        ),
    ).toEqual(['dist/i18n/en/admin.json', 'dist/i18n/fr/admin.json']);
    expect(
      model.preview.localTree().map((folder) => ({
        path: folder.path,
        files: folder.files.map((file) => [file.name, file.kind, file.exists]),
      })),
    ).toEqual([
      { path: 'dist/i18n/en', files: [['admin.json', 'bundle', undefined]] },
      { path: 'dist/i18n/fr', files: [['admin.json', 'bundle', undefined]] },
      { path: 'dist/types', files: [['admin.ts', 'types', undefined]] },
    ]);
  });

  it('delegates empty collection and rule choices to the domain rules', () => {
    const model = build({ data: { mode: 'create' }, collectionNames: () => [] });
    const collections = model.form.controls.collections;
    expect(collections.hasError('collectionsEmpty')).toBe(true);
    model.form.controls.allCollections.setValue(true);
    expect(collections.hasError('collectionsEmpty')).toBe(false);
    model.form.controls.allCollections.setValue(false);
    model.addCollection('main');
    expect(collections.hasError('collectionsEmpty')).toBe(false);
    const group = collections.at(0);
    group.controls.allEntries.setValue(false);
    expect(group.controls.rules.hasError('rulesEmpty')).toBe(true);
    group.controls.allEntries.setValue(true);
    expect(group.controls.rules.hasError('rulesEmpty')).toBe(false);
    group.controls.allEntries.setValue(false);
    model.addRule(group);
    expect(group.controls.rules.hasError('rulesEmpty')).toBe(false);
    model.addCollection('extra');
    model.form.controls.allCollections.setValue(true);
    expect(collections.hasError('collectionsEmpty')).toBe(false);
    model.addRule(group);
    group.controls.allEntries.setValue(true);
    expect(group.controls.rules.hasError('rulesEmpty')).toBe(false);
  });

  it.each([
    [['types', 'coll:1', 'output'], 'output'],
    [['types', 'coll:1', 'collections'], 'collections'],
    [['types', 'coll:1', 'coll:0'], 'coll:0'],
    [['types', 'coll:1'], 'coll:1'],
    [['types'], 'types'],
    [[], undefined],
  ] as [BundleSection[], BundleSection | undefined][])(
    'reveals the first section in rail order',
    (errors, expected) => {
      const model = build({ data: { mode: 'create', name: 'main', bundle: minimal } });
      model.form.controls.allCollections.setValue(true);
      model.addCollection('extra');
      if (errors.includes('output')) model.form.controls.dist.setErrors({ required: true });
      if (errors.includes('collections')) model.form.controls.collections.setErrors({ collectionsEmpty: true });
      for (let index = 0; index < 2; index++) {
        if (errors.includes(`coll:${index}`)) model.form.controls.collections.at(index).setErrors({ invalid: true });
      }
      if (errors.includes('types')) model.form.controls.typeDistFile.setErrors({ required: true });
      model.form.markAllAsTouched();
      expect(model.firstInvalidSection()).toBe(expected);
    },
  );
});

const rejection = (status: number, body: object) =>
  throwError(() => toApiError(new HttpErrorResponse({ status, error: { statusCode: status, ...body } })));

describe('BundleForm — submit', () => {
  const setup = (data: BundleFormDialogData = { mode: 'create' }) => {
    const env = fakeEnv();
    const form = build({ data, env });
    if (data.mode === 'create') {
      form.form.controls.name.setValue('admin');
      form.form.controls.dist.setValue('./dist/i18n');
      form.form.controls.bundleName.setValue('admin.{locale}');
      form.form.controls.allCollections.setValue(true);
    }
    const dialog = fakeDialog<BundleFormResult>();
    const create = vi.fn((_result: BundleFormResult) => of(null));
    const update = vi.fn((_name: string, _patch: { name: string | undefined }, _result: BundleFormResult) => of(null));
    const submit = () => form.submit({ dialog, write: { create, update } });
    return { env, form, dialog, create, update, submit };
  };
  const editData: BundleFormDialogData = { mode: 'edit', name: 'admin', bundle: definition };

  it('creates the bundle and closes only once the write has been accepted', () => {
    const { dialog, create, submit } = setup();
    const write = new Subject<null>();
    create.mockReturnValue(write);

    submit();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'admin' }));
    expect(dialog.close).not.toHaveBeenCalled();

    write.next(null);
    expect(dialog.close).toHaveBeenCalledWith(expect.objectContaining({ name: 'admin' }));
  });

  it('builds the validated submit result exactly once', async () => {
    const { form, create, submit } = setup();
    const buildResult = vi.spyOn(form, 'buildResult');
    await submit();
    expect(buildResult).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(buildResult.mock.results[0]?.value);
  });

  it('does not write while the form is invalid', () => {
    const { form, dialog, create, submit } = setup();
    form.form.controls.dist.setValue('');
    submit();
    expect(create).not.toHaveBeenCalled();
    expect(dialog.close).not.toHaveBeenCalled();
  });

  it('updates under the existing name and omits an unchanged rename', () => {
    const { create, update, submit } = setup(editData);
    submit();
    expect(update).toHaveBeenCalledWith('admin', { name: undefined }, expect.objectContaining({ name: 'admin' }));
    expect(create).not.toHaveBeenCalled();
  });

  it('shows a taken name on the name field and opens the Output section', () => {
    const { form, dialog, create, submit } = setup();
    create.mockReturnValue(rejection(409, { message: 'taken', error: 'Conflict' }));
    form.activate('types');

    submit();

    expect(dialog.close).not.toHaveBeenCalled();
    expect(form.saving()).toBe(false);
    expect(form.form.controls.name.hasError('nameExists')).toBe(true);
    expect(form.activeSection()).toBe('output');
    expect(form.submitErrors()).toEqual([]);

    form.form.controls.name.setValue('other');
    expect(form.form.controls.name.valid).toBe(true);
  });

  it('lists every rule message of a definition the server rejects, and clears them on the next edit', () => {
    const { form, dialog, create, submit } = setup();
    create.mockReturnValue(rejection(400, { message: 'Invalid', errors: ['dist is required.', 'ghost is missing.'] }));

    submit();

    expect(dialog.close).not.toHaveBeenCalled();
    expect(form.submitErrors()).toEqual(['dist is required.', 'ghost is missing.']);

    form.form.controls.dist.setValue('./dist/other');
    expect(form.submitErrors()).toEqual([]);
  });

  it('shows the server message, else the create-failed text, for any other refusal', () => {
    const { form, create, submit } = setup();
    create
      .mockReturnValueOnce(rejection(403, { message: 'Config is read-only', error: 'Forbidden' }))
      .mockReturnValueOnce(rejection(500, { error: 'Internal Server Error' }));

    submit();
    expect(form.submitErrors()).toEqual(['Config is read-only']);

    form.form.controls.dist.setValue('./dist/other');
    submit();
    expect(form.submitErrors()).toEqual([TRACKER_TOKENS.BUNDLES.TOAST.CREATEFAILED]);
  });

  it('lists server details from a locked-name conflict', () => {
    const { form, update, submit } = setup(editData);
    update.mockReturnValue(rejection(409, { message: 'already exists', errors: ['Conflicting output path.'] }));
    submit();
    expect(form.submitErrors()).toEqual(['Conflicting output path.']);
  });

  it('locks closing while the write is in flight and restores it after a refusal', () => {
    const { form, dialog, create, submit } = setup();
    const write = new Subject<null>();
    create.mockReturnValue(write);

    submit();
    expect(form.saving()).toBe(true);
    expect(dialog.disableClose).toBe(true);

    write.error(toApiError(new HttpErrorResponse({ status: 403, error: { message: 'nope' } })));
    expect(form.saving()).toBe(false);
    expect(dialog.disableClose).toBe(false);
  });

  it('ignores a second submit while the first is in flight', () => {
    const { create, submit } = setup();
    create.mockReturnValue(new Subject<null>());
    submit();
    submit();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('cancels an in-flight write when destroyed, without closing or reporting', () => {
    const { env, form, dialog, create, submit } = setup();
    const write = new Subject<null>();
    create.mockReturnValue(write);
    submit();

    env.destroy();
    write.next(null);

    expect(dialog.close).not.toHaveBeenCalled();
    expect(write.observed).toBe(false);
    expect(form.submitErrors()).toEqual([]);
  });
});
