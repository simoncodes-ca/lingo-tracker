import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { createComponentFactory } from '@ngneat/spectator/vitest';
import type {
  BundleDefinitionDto,
  BundleDryRunRequestDto,
  BundleDryRunResultDto,
  LingoTrackerConfigDto,
} from '@simoncodes-ca/data-transfer';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslocoTestingModule } from '../../../testing/transloco-testing.module';
import { toApiError } from '../../shared/api-error/api-error';
import { CollectionsStore } from '../store/collections.store';
import { BundleForm } from './bundle-form';
import { BundleFormDialog } from './bundle-form-dialog';
import type { BundleFormDialogData } from './bundle-form-dialog-data';

const config: LingoTrackerConfigDto = {
  exportFolder: './export',
  importFolder: './import',
  baseLocale: 'en',
  locales: ['en', 'fr-ca', 'es'],
  collections: {
    trackerResources: { translationsFolder: './apps/tracker/src/i18n' },
    mockDesignSystem: { translationsFolder: './libs/ds/i18n' },
    TestDataPlayground: { translationsFolder: './tmp/i18n' },
  },
};

const trackerBundle: BundleDefinitionDto = {
  bundleName: '{locale}',
  dist: './apps/tracker/src/assets/i18n',
  collections: [{ name: 'trackerResources', entriesSelectionRules: 'All' }],
  typeDistFile: './apps/tracker/src/i18n-types/tracker-resources.ts',
  transformICUToTransloco: true,
};

const dryRunResult: BundleDryRunResultDto = {
  name: 'admin',
  locales: ['en', 'fr-ca', 'es'],
  files: [
    { path: 'dist/i18n/admin.en.json', kind: 'bundle', locale: 'en', exists: false, keysCount: 12 },
    { path: 'dist/i18n/admin.fr-ca.json', kind: 'bundle', locale: 'fr-ca', exists: false, keysCount: 12 },
    { path: 'dist/i18n/admin.es.json', kind: 'bundle', locale: 'es', exists: true, keysCount: 12 },
  ],
  keysPerLocale: { en: 12, 'fr-ca': 12, es: 12 },
  conflictsCount: 0,
  conflictKeys: [],
  hierarchicalConflicts: [],
  exampleKey: { collectionName: 'trackerResources', sourceKey: 'a.b', bundledKey: 'a.b' },
  warnings: [],
};

interface Harness {
  fixture: ComponentFixture<BundleFormDialog>;
  component: BundleFormDialog;
  /** `close`, and `disableClose`, which the dialog sets while a write is in flight. */
  dialogRef: { close: ReturnType<typeof vi.fn>; disableClose: boolean | undefined };
  /** The two Config Writes the dialog makes; both accept by default. */
  store: {
    createBundle: ReturnType<typeof vi.fn>;
    updateBundle: ReturnType<typeof vi.fn>;
    dryRunBundle: ReturnType<typeof vi.fn>;
  };
}

const apiError = (status: number, body: object) =>
  toApiError(new HttpErrorResponse({ status, error: { statusCode: status, ...body } }));

const rejection = (status: number, body: object) => throwError(() => apiError(status, body));

const createComponent = createComponentFactory({
  component: BundleFormDialog,
  imports: [NoopAnimationsModule, getTranslocoTestingModule()],
  detectChanges: false,
});

const buildHarness = (data: BundleFormDialogData): Harness => {
  const dialogRef: Harness['dialogRef'] = { close: vi.fn(), disableClose: false };
  const store = {
    config: signal<LingoTrackerConfigDto | null>(config),
    collectionEntries: signal(
      Object.entries(config.collections).map(([name, collection]) => ({ name, config: collection })),
    ),
    bundleEntries: signal([{ name: 'tracker', definition: trackerBundle }]),
    createBundle: vi.fn(() => of(config)),
    updateBundle: vi.fn(() => of(config)),
    dryRunBundle: vi.fn(() => of(dryRunResult)),
  };

  const spectator = createComponent({
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: dialogRef },
      { provide: CollectionsStore, useValue: store },
    ],
  });
  spectator.detectChanges();
  const fixture = spectator.fixture;
  return { fixture, component: fixture.componentInstance, dialogRef, store };
};

// Preview and seeding cases need only the model and its injected dry-run call.
const modelHarnesses: BundleForm[] = [];
afterEach(() => {
  for (const model of modelHarnesses) model.destroy();
  modelHarnesses.length = 0;
});
const buildModelHarness = (data: BundleFormDialogData) => {
  const store = { dryRunBundle: vi.fn((_request: BundleDryRunRequestDto) => of(dryRunResult)) };
  const model = new BundleForm({
    data,
    collectionNames: () => Object.keys(config.collections),
    bundleNames: () => ['tracker'],
    locales: () => config.locales,
    baseLocale: () => config.baseLocale,
    tokenCasing: () => 'upperCase',
    icuTransform: () => true,
    dryRun: (request) => store.dryRunBundle(request),
  });
  modelHarnesses.push(model);
  return { component: { model }, store };
};

const submitErrorsText = (harness: Harness): string | null =>
  (harness.fixture.nativeElement as HTMLElement).querySelector('[data-testid="submit-errors"]')?.textContent?.trim() ??
  null;

/** Cancel in the footer and the close icon in the header. */
const closeButtons = (harness: Harness): HTMLButtonElement[] =>
  Array.from(
    (harness.fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[data-testid="cancel"]'),
  );

const fillOutput = (component: { model: BundleForm }): void => {
  component.model.form.controls.name.setValue('admin');
  component.model.form.controls.dist.setValue('./dist/i18n');
  component.model.form.controls.bundleName.setValue('admin.{locale}');
};

describe('BundleFormDialog — create mode', () => {
  let harness: Harness;
  let component: BundleFormDialog;

  beforeEach(async () => {
    harness = buildHarness({ mode: 'create' });
    component = harness.component;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(component.model.isEditMode).toBe(false);
  });

  it('should add, normalize and remove rule tags and toggle the operator', () => {
    const group = component.model.form.controls.collections.at(0);
    group.controls.allEntries.setValue(false);
    component.model.addRule(group);
    const rule = group.controls.rules.at(0);

    component.model.addRuleTag(rule, ' Admin UI ');
    expect(rule.controls.matchingTags.value).toEqual(['admin-ui']);

    component.model.addRuleTag(rule, 'admin-ui');
    expect(rule.controls.matchingTags.value).toEqual(['admin-ui']);

    component.model.toggleTagOperator(rule);
    expect(rule.controls.matchingTagOperator.value).toBe('All');

    component.model.removeRuleTag(rule, 'admin-ui');
    expect(rule.controls.matchingTags.value).toEqual([]);
  });

  it("should edit a rule's tags from the keyboard: commit on Enter, remove the last on Backspace, commit on blur", () => {
    const group = component.model.form.controls.collections.at(0);
    group.controls.allEntries.setValue(false);
    component.model.addRule(group);
    const rule = group.controls.rules.at(0);
    component.model.activateCollection(0);
    harness.fixture.detectChanges();
    const input = (harness.fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input.tags-input');
    expect(input).not.toBeNull();
    if (!input) return;
    const press = (key: string): void => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
      harness.fixture.detectChanges();
    };

    input.value = ' Admin UI ';
    press('Enter');
    expect(input.value).toBe('');
    input.value = 'beta';
    press(',');
    expect(rule.controls.matchingTags.value).toEqual(['admin-ui', 'beta']);

    press('Backspace');
    expect(rule.controls.matchingTags.value).toEqual(['admin-ui']);

    input.value = 'late';
    input.dispatchEvent(new Event('blur'));
    expect(rule.controls.matchingTags.value).toEqual(['admin-ui', 'late']);
  });

  it('should not close when submitted invalid, and land on the first section with errors', () => {
    component.onSubmit();

    expect(harness.dialogRef.close).not.toHaveBeenCalled();
    expect(component.model.submitAttempted()).toBe(true);
    expect(component.model.activeSection()).toBe('output');
  });

  it('should close with a definition that omits empty optional fields and maps inherit to undefined', () => {
    fillOutput(component);
    const group = component.model.form.controls.collections.at(0);
    group.controls.allEntries.setValue(false);
    component.model.addRule(group);
    group.controls.rules.at(0).controls.matchingPattern.setValue('apps.admin.*');
    component.model.addCollection('mockDesignSystem');
    const second = component.model.form.controls.collections.at(1);
    second.controls.bundledKeyPrefix.setValue('ds');
    second.controls.mergeStrategy.setValue('override');
    component.model.form.controls.typesEnabled.setValue(true);
    component.model.form.controls.typeDistFile.setValue('./dist/i18n-types/admin.ts');

    component.onSubmit();

    expect(harness.dialogRef.close).toHaveBeenCalledWith({
      name: 'admin',
      bundle: {
        bundleName: 'admin.{locale}',
        dist: './dist/i18n',
        collections: [
          { name: 'trackerResources', entriesSelectionRules: [{ matchingPattern: 'apps.admin.*' }] },
          { name: 'mockDesignSystem', bundledKeyPrefix: 'ds', entriesSelectionRules: 'All', mergeStrategy: 'override' },
        ],
        typeDistFile: './dist/i18n-types/admin.ts',
      },
    });
    const bundle = harness.dialogRef.close.mock.calls[0][0].bundle as BundleDefinitionDto;
    expect(bundle).not.toHaveProperty('tokenCasing');
    expect(bundle).not.toHaveProperty('tokenConstantName');
    expect(bundle).not.toHaveProperty('transformICUToTransloco');
  });

  it('should send "All" for collections and explicit casing and ICU choices when set', () => {
    fillOutput(component);
    component.model.form.controls.allCollections.setValue(true);
    component.model.form.controls.typesEnabled.setValue(true);
    component.model.form.controls.typeDistFile.setValue('./dist/i18n-types/admin.ts');
    component.model.form.controls.tokenCasing.setValue('camelCase');
    component.model.form.controls.tokenConstantName.setValue('ADMIN_KEYS');
    component.model.setIcu(false);

    component.onSubmit();

    expect(harness.dialogRef.close).toHaveBeenCalledWith({
      name: 'admin',
      bundle: {
        bundleName: 'admin.{locale}',
        dist: './dist/i18n',
        collections: 'All',
        typeDistFile: './dist/i18n-types/admin.ts',
        tokenCasing: 'camelCase',
        tokenConstantName: 'ADMIN_KEYS',
        transformICUToTransloco: false,
      },
    });
  });

  it('should close with undefined on cancel', () => {
    component.onCancel();
    expect(harness.dialogRef.close).toHaveBeenCalledWith(undefined);
  });

  describe('writing through the store', () => {
    it('should create the bundle through the store and close only once the server has accepted it', () => {
      fillOutput(component);

      component.onSubmit();

      expect(harness.store.createBundle).toHaveBeenCalledWith({
        name: 'admin',
        bundle: expect.objectContaining({ bundleName: 'admin.{locale}', dist: './dist/i18n' }),
      });
      expect(harness.dialogRef.close).toHaveBeenCalledWith(expect.objectContaining({ name: 'admin' }));
    });

    it('should show a taken-name refusal in the Output section and keep the dialog open', () => {
      harness.store.createBundle.mockReturnValue(
        rejection(409, { message: 'Bundle "admin" already exists', error: 'Conflict' }),
      );
      fillOutput(component);
      component.model.activate('types');

      component.onSubmit();
      harness.fixture.detectChanges();

      expect(harness.dialogRef.close).not.toHaveBeenCalled();
      expect(component.saving()).toBe(false);
      expect(component.model.form.controls.name.hasError('nameExists')).toBe(true);
      expect(component.model.activeSection()).toBe('output');
      expect(harness.fixture.nativeElement.textContent).toContain('A bundle named admin already exists.');
      expect(submitErrorsText(harness)).toBeNull();

      component.model.form.controls.name.setValue('other');
      expect(component.model.form.controls.name.hasError('nameExists')).toBe(false);
      expect(component.model.form.controls.name.valid).toBe(true);
    });

    it('should stay open and list every rule message of a definition the server rejects', () => {
      harness.store.createBundle.mockReturnValue(
        rejection(400, {
          message: 'Invalid bundle definition',
          error: 'Bad Request',
          errors: ['dist (output folder) is required.', "Collection 'ghost' does not exist in the configuration."],
        }),
      );
      fillOutput(component);

      component.onSubmit();
      harness.fixture.detectChanges();

      expect(harness.dialogRef.close).not.toHaveBeenCalled();
      expect(component.model.submitErrors()).toEqual([
        'dist (output folder) is required.',
        "Collection 'ghost' does not exist in the configuration.",
      ]);
      expect(submitErrorsText(harness)).toContain("Collection 'ghost' does not exist in the configuration.");

      // The next edit clears the server's answer like any other submit error.
      component.model.form.controls.dist.setValue('./dist/other');
      expect(component.model.submitErrors()).toEqual([]);
    });

    it('should show the server message, else the create-failed text, for any other refusal', () => {
      harness.store.createBundle
        .mockReturnValueOnce(rejection(403, { message: 'Config is read-only', error: 'Forbidden' }))
        .mockReturnValueOnce(rejection(500, { error: 'Internal Server Error' }));
      fillOutput(component);

      component.onSubmit();
      expect(component.model.submitErrors()).toEqual(['Config is read-only']);

      component.model.form.controls.dist.setValue('./dist/other');
      component.onSubmit();
      expect(component.model.submitErrors()).toEqual(['Failed to create bundle']);
      expect(harness.dialogRef.close).not.toHaveBeenCalled();
    });

    it('should not let the dialog close while the write is in flight, and allow it again after a refusal', () => {
      const write = new Subject<LingoTrackerConfigDto | null>();
      harness.store.createBundle.mockReturnValue(write);
      fillOutput(component);

      component.onSubmit();
      harness.fixture.detectChanges();

      expect(harness.dialogRef.disableClose).toBe(true);
      expect(closeButtons(harness).every((button) => button.disabled)).toBe(true);

      write.error(apiError(403, { message: 'Config is read-only', error: 'Forbidden' }));
      harness.fixture.detectChanges();

      expect(harness.dialogRef.disableClose).toBe(false);
      expect(closeButtons(harness).some((button) => button.disabled)).toBe(false);
    });

    it('should ignore a second submit while the first is in flight', () => {
      harness.store.createBundle.mockReturnValue(new Subject<LingoTrackerConfigDto | null>());
      fillOutput(component);

      component.onSubmit();
      component.onSubmit();

      expect(harness.store.createBundle).toHaveBeenCalledTimes(1);
    });
  });

  it('should not close when the domain rules reject what the field validators allowed', () => {
    fillOutput(component);
    component.model.form.controls.collections.at(0).controls.name.setValue('ghost');

    component.onSubmit();
    harness.fixture.detectChanges();

    expect(harness.dialogRef.close).not.toHaveBeenCalled();
    expect(component.model.submitErrors()).toEqual(["Collection 'ghost' does not exist in the configuration."]);
    const errors = (harness.fixture.nativeElement as HTMLElement).querySelector('[data-testid="submit-errors"]');
    expect(errors?.getAttribute('role')).toBe('alert');
    expect(errors?.textContent).toContain("Collection 'ghost' does not exist in the configuration.");

    component.model.form.controls.collections.at(0).controls.name.setValue('trackerResources');
    expect(component.model.submitErrors()).toEqual([]);
    component.onSubmit();
    expect(harness.dialogRef.close).toHaveBeenCalledTimes(1);
  });
});

describe('BundleFormDialog — all collections', () => {
  it('should seed the first collection when a create definition has an empty collection list', () => {
    const { component } = buildModelHarness({
      mode: 'create',
      bundle: { bundleName: '{locale}', dist: './dist', collections: [] },
    });

    expect(component.model.form.controls.collections.length).toBe(1);
    expect(component.model.form.controls.collections.at(0).controls.name.value).toBe('trackerResources');
    expect(component.model.activeSection()).toBe('coll:0');
  });

  it('should open the Collections pane when the bundle includes every collection', () => {
    const { component } = buildModelHarness({
      mode: 'create',
      bundle: { bundleName: '{locale}', dist: './dist', collections: 'All' },
    });

    expect(component.model.activeSection()).toBe('collections');
    expect(component.model.form.controls.collections.length).toBe(0);
  });
});

describe('BundleFormDialog — dry run', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should debounce edits and call the API once with the current definition', async () => {
    const { component, store } = buildModelHarness({ mode: 'create' });
    fillOutput(component);
    component.model.form.controls.dist.setValue('./dist/i18n');
    expect(store.dryRunBundle).not.toHaveBeenCalled();
    expect(component.model.previewStale()).toBe(true);

    vi.advanceTimersByTime(299);
    expect(store.dryRunBundle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(store.dryRunBundle).toHaveBeenCalledTimes(1);
    expect(store.dryRunBundle).toHaveBeenCalledWith({
      name: 'admin',
      bundle: expect.objectContaining({ bundleName: 'admin.{locale}', dist: './dist/i18n' }),
    });
    expect(component.model.dryRun()).toEqual(dryRunResult);
    expect(component.model.previewStatus()).toBe('ready');
    expect(component.model.previewStale()).toBe(false);
    expect(component.model.previewFileCount()).toBe(3);
    expect(component.model.keysPerLocale()).toBe(12);
  });

  it('should not call the API until name, folder and pattern are all present', async () => {
    const { component, store } = buildModelHarness({ mode: 'create' });
    component.model.form.controls.name.setValue('admin');
    vi.advanceTimersByTime(300);

    expect(store.dryRunBundle).not.toHaveBeenCalled();
    expect(component.model.previewStatus()).toBe('waiting');
  });

  it('should fall back to the client-side tree when the dry run fails', async () => {
    const { component, store } = buildModelHarness({ mode: 'create' });
    store.dryRunBundle.mockReturnValue(
      throwError(() => toApiError(new HttpErrorResponse({ status: 500, error: { message: 'boom' } }))),
    );
    fillOutput(component);
    component.model.form.controls.typesEnabled.setValue(true);
    component.model.form.controls.typeDistFile.setValue('./dist/i18n-types/admin.ts');
    vi.advanceTimersByTime(300);

    expect(component.model.previewStatus()).toBe('error');
    expect(component.model.dryRun()).toBeUndefined();
    expect(
      component.model.previewTree().map((folder) => ({
        path: folder.path,
        files: folder.files.map((file) => ({ name: file.name, kind: file.kind, exists: file.exists })),
      })),
    ).toEqual([
      {
        path: 'dist/i18n',
        files: [
          { name: 'admin.en.json', kind: 'bundle', exists: undefined },
          { name: 'admin.fr-ca.json', kind: 'bundle', exists: undefined },
          { name: 'admin.es.json', kind: 'bundle', exists: undefined },
        ],
      },
      { path: 'dist/i18n-types', files: [{ name: 'admin.ts', kind: 'types', exists: undefined }] },
    ]);
  });

  it('should split tree paths and names after separators so they wrap between segments', async () => {
    const { component, store } = buildModelHarness({ mode: 'create' });
    store.dryRunBundle.mockReturnValue(
      throwError(() => toApiError(new HttpErrorResponse({ status: 500, error: { message: 'boom' } }))),
    );
    fillOutput(component);
    vi.advanceTimersByTime(300);

    const folder = component.model.previewTree()[0];
    expect(folder).toBeDefined();
    expect(folder?.pathParts).toEqual(['dist/', 'i18n']);
    expect(folder?.files[0]?.nameParts).toEqual(['admin.', 'en.', 'json']);
    expect(folder?.files[0]?.nameParts.join('')).toBe(folder?.files[0]?.name);
  });

  it('should split the example token path after separators', async () => {
    const { component } = buildModelHarness({ mode: 'create' });
    fillOutput(component);
    vi.advanceTimersByTime(300);

    component.model.dryRun.set({
      ...dryRunResult,
      exampleKey: {
        collectionName: 'trackerResources',
        sourceKey: 'app.skipToMainContent',
        bundledKey: 'app.skipToMainContent',
        tokenPath: 'TRACKER_TOKENS.APP.SKIPTOMAINCONTENT',
      },
    });

    expect(component.model.tokenPathParts()).toEqual(['TRACKER_', 'TOKENS.', 'APP.', 'SKIPTOMAINCONTENT']);
    expect(component.model.tokenPathParts().join('')).toBe('TRACKER_TOKENS.APP.SKIPTOMAINCONTENT');
  });

  it('should surface hierarchical key collisions as an error in the preview', async () => {
    const { component, fixture } = buildHarness({ mode: 'create' });
    fillOutput(component);
    vi.advanceTimersByTime(300);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="hierarchical-conflicts"]')).toBeNull();

    component.model.dryRun.set({ ...dryRunResult, hierarchicalConflicts: ['buttons.ok', 'menu.file'] });
    fixture.detectChanges();

    expect(component.model.hierarchicalConflicts()).toEqual(['buttons.ok', 'menu.file']);
    expect(component.model.hierarchicalConflictList()).toBe('buttons.ok, menu.file');

    // The message itself is translated (asserted via the token), so the test checks
    // that the error line appears at all and that it is announced.
    const error = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="hierarchical-conflicts"]');
    expect(error).toBeTruthy();
    expect(error?.getAttribute('role')).toBe('alert');
  });
});

describe('BundleFormDialog — legacy typeDist', () => {
  it('should show a legacy typeDist as the types file and save it as typeDistFile', () => {
    const legacy = {
      ...trackerBundle,
      typeDistFile: undefined,
      typeDist: './src/legacy-tokens.ts',
    } as BundleDefinitionDto;
    const { component, dialogRef } = buildHarness({ mode: 'edit', name: 'tracker', bundle: legacy });

    expect(component.model.form.controls.typesEnabled.value).toBe(true);
    expect(component.model.form.controls.typeDistFile.value).toBe('./src/legacy-tokens.ts');

    component.onSubmit();

    const bundle = dialogRef.close.mock.calls[0][0].bundle as BundleDefinitionDto;
    expect(bundle.typeDistFile).toBe('./src/legacy-tokens.ts');
    expect(bundle).not.toHaveProperty('typeDist');
  });
});

describe('BundleFormDialog — edit mode', () => {
  let harness: Harness;
  let component: BundleFormDialog;

  beforeEach(async () => {
    harness = buildHarness({ mode: 'edit', name: 'tracker', bundle: trackerBundle });
    component = harness.component;
  });

  it('should open on the Output section', () => {
    expect(component.model.isEditMode).toBe(true);
    expect(component.model.activeSection()).toBe('output');
  });

  it('should lock the name and skip the collision check against itself', () => {
    expect(component.model.form.controls.name.disabled).toBe(true);
    expect(component.model.form.controls.name.value).toBe('tracker');
    expect(component.model.form.controls.name.errors).toBeNull();
    expect(harness.fixture.nativeElement.querySelector('[data-testid="name-locked"]')).toBeTruthy();
  });

  it('should keep the name in the result even though the control is disabled', () => {
    component.onSubmit();

    expect(harness.dialogRef.close).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'tracker',
        bundle: expect.objectContaining({ collections: trackerBundle.collections, transformICUToTransloco: true }),
      }),
    );
  });

  it('should update the bundle under its existing name through the store', () => {
    component.onSubmit();

    expect(harness.store.updateBundle).toHaveBeenCalledWith('tracker', {
      name: undefined,
      bundle: expect.objectContaining({ dist: './apps/tracker/src/assets/i18n' }),
    });
    expect(harness.store.createBundle).not.toHaveBeenCalled();
  });

  it('should show a refusal above the footer when the name is locked, so a conflict has no field to land on', () => {
    harness.store.updateBundle.mockReturnValue(rejection(409, { message: 'Bundle "tracker" already exists' }));

    component.onSubmit();
    harness.fixture.detectChanges();

    expect(harness.dialogRef.close).not.toHaveBeenCalled();
    expect(component.model.submitErrors()).toEqual(['Bundle "tracker" already exists']);
  });

  it('should list server details from a conflict when the name is locked', () => {
    harness.store.updateBundle.mockReturnValue(
      rejection(409, { message: 'Bundle "tracker" already exists', errors: ['Conflicting bundle output path.'] }),
    );

    component.onSubmit();
    harness.fixture.detectChanges();

    expect(harness.dialogRef.close).not.toHaveBeenCalled();
    expect(component.model.submitErrors()).toEqual(['Conflicting bundle output path.']);
    expect(submitErrorsText(harness)).toContain('Conflicting bundle output path.');
  });
});

// These existing cases now exercise the form model directly, without constructing a dialog.
describe('BundleForm — migrated dialog form cases', () => {
  let model: BundleForm;
  const createModel = (data: BundleFormDialogData) =>
    new BundleForm({
      data,
      collectionNames: () => Object.keys(config.collections),
      bundleNames: () => ['tracker'],
      locales: () => config.locales,
      baseLocale: () => config.baseLocale,
      tokenCasing: () => 'upperCase',
      icuTransform: () => true,
      dryRun: () => of(dryRunResult),
    });
  beforeEach(() => {
    model = createModel({ mode: 'create' });
  });
  afterEach(() => model.destroy());
  it('should start with the first collection pane open, seeded with the first collection', () => {
    expect(model.form.controls.collections.length).toBe(1);
    expect(model.form.controls.collections.at(0).controls.name.value).toBe('trackerResources');
    expect(model.activeSection()).toBe('coll:0');
    expect(model.activeKind()).toBe('collection');
  });

  it('should keep the name editable', () => {
    expect(model.form.controls.name.disabled).toBe(false);
  });

  it('should reject a name that collides with an existing bundle', () => {
    model.form.controls.name.setValue('tracker');
    expect(model.form.controls.name.hasError('nameExists')).toBe(true);

    model.form.controls.name.setValue('admin');
    expect(model.form.controls.name.errors).toBeNull();
  });

  it('should reject names outside the letters, numbers, hyphens and underscores charset', () => {
    model.form.controls.name.setValue('my bundle!');
    expect(model.form.controls.name.hasError('pattern')).toBe(true);
  });

  it('should require {locale} in the file name pattern', () => {
    model.form.controls.bundleName.setValue('admin');
    expect(model.form.controls.bundleName.hasError('missingLocale')).toBe(true);

    model.form.controls.bundleName.setValue('admin.{locale}');
    expect(model.form.controls.bundleName.errors).toBeNull();
  });

  it('should require a .ts type file only while types are on', () => {
    const typeFile = model.form.controls.typeDistFile;
    expect(typeFile.errors).toBeNull();

    model.form.controls.typesEnabled.setValue(true);
    expect(typeFile.hasError('required')).toBe(true);

    typeFile.setValue('./dist/types/admin.js');
    expect(typeFile.hasError('notTypeScript')).toBe(true);

    typeFile.setValue('./dist/types/admin.ts');
    expect(typeFile.errors).toBeNull();

    typeFile.setValue('./dist/types/admin.js');
    model.form.controls.typesEnabled.setValue(false);
    expect(typeFile.errors).toBeNull();
  });

  it('should require a valid JavaScript identifier for the constant name', () => {
    const constant = model.form.controls.tokenConstantName;
    constant.setValue('1BAD');
    expect(constant.hasError('invalidIdentifier')).toBe(true);

    constant.setValue('ADMIN_TOKENS');
    expect(constant.errors).toBeNull();

    constant.setValue('');
    expect(constant.errors).toBeNull();
  });

  it('should reject reserved words the server would reject, so the dialog never closes on a 400', () => {
    const constant = model.form.controls.tokenConstantName;

    for (const reserved of ['type', 'class', 'interface', 'await', 'undefined']) {
      constant.setValue(reserved);
      expect(constant.hasError('invalidIdentifier')).toBe(true);
    }

    constant.setValue('typeTokens');
    expect(constant.errors).toBeNull();
  });

  it('should require at least one collection unless every collection is included', () => {
    model.removeCollection(0);
    expect(model.form.controls.collections.hasError('collectionsEmpty')).toBe(true);
    expect(model.activeSection()).toBe('collections');

    model.form.controls.allCollections.setValue(true);
    expect(model.form.controls.collections.errors).toBeNull();
  });

  it('should require at least one rule unless the collection takes all entries', () => {
    const group = model.form.controls.collections.at(0);
    expect(group.controls.rules.errors).toBeNull();

    group.controls.allEntries.setValue(false);
    expect(group.controls.rules.hasError('rulesEmpty')).toBe(true);

    model.addRule(group);
    expect(group.controls.rules.errors).toBeNull();
    expect(group.controls.rules.at(0).controls.matchingPattern.hasError('required')).toBe(true);

    model.removeRule(group, 0);
    expect(group.controls.rules.hasError('rulesEmpty')).toBe(true);
  });

  it('should add a collection from the remaining ones and open its pane', () => {
    expect(model.availableCollections()).toEqual(['mockDesignSystem', 'TestDataPlayground']);

    model.addCollection('mockDesignSystem');

    expect(model.form.controls.collections.length).toBe(2);
    expect(model.activeSection()).toBe('coll:1');
    expect(model.availableCollections()).toEqual(['TestDataPlayground']);
  });

  it('should flag an invalid section in the rail once it has been touched', () => {
    expect(model.sectionErrors().has('output')).toBe(false);

    model.form.controls.bundleName.setValue('admin');
    model.form.controls.bundleName.markAsTouched();

    expect(model.sectionErrors().has('output')).toBe(true);
  });

  it('should preview the output paths with the domain output-file rule', () => {
    model.form.controls.dist.setValue(' ./dist//i18n/ ');
    model.form.controls.bundleName.setValue('{locale}/admin');

    expect(model.outputSummary()).toBe('dist/i18n/{locale}/admin.json');
    expect(model.patternFiles()).toEqual(['en/admin.json', 'fr-ca/admin.json', 'es/admin.json']);
    expect(model.localTree().flatMap((folder) => folder.files.map((file) => `${folder.path}/${file.name}`))).toEqual([
      'dist/i18n/en/admin.json',
      'dist/i18n/fr-ca/admin.json',
      'dist/i18n/es/admin.json',
    ]);
  });

  it('should pre-populate the definition', () => {
    model.destroy();
    model = createModel({ mode: 'edit', name: 'tracker', bundle: trackerBundle });
    const raw = model.form.getRawValue();
    expect(raw.dist).toBe('./apps/tracker/src/assets/i18n');
    expect(raw.bundleName).toBe('{locale}');
    expect(raw.allCollections).toBe(false);
    expect(raw.collections).toHaveLength(1);
    expect(raw.collections[0]?.allEntries).toBe(true);
    expect(raw.typesEnabled).toBe(true);
    expect(raw.typeDistFile).toBe('./apps/tracker/src/i18n-types/tracker-resources.ts');
    expect(raw.tokenCasing).toBe('inherit');
    expect(raw.transformICUToTransloco).toBe('on');
  });

  it('should collapse an ICU choice equal to the project default (on) back to inherit', () => {
    model.destroy();
    model = createModel({ mode: 'edit', name: 'tracker', bundle: trackerBundle });
    model.setIcu(true);
    expect(model.form.controls.transformICUToTransloco.value).toBe('inherit');

    model.setIcu(false);
    expect(model.form.controls.transformICUToTransloco.value).toBe('off');
  });
});
