import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { TranslocoService } from '@jsverse/transloco';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { fakeDialog } from '../../../testing/form-submit-env';
import { CollectionsStore } from './collections.store';
import { NamedEntrySubmit } from './dialog-config-submit';
import { injectBundleFormSubmit, injectCollectionFormSubmit } from './dialog-config-submit-adapters';

function setup() {
  const store = {
    createBundle: vi.fn(() => of(null)),
    updateBundle: vi.fn(() => of(null)),
    createCollection: vi.fn(() => of(null)),
    updateCollection: vi.fn(() => of(null)),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: CollectionsStore, useValue: store },
      { provide: TranslocoService, useValue: { translate: (token: string) => token } },
      { provide: MatDialog, useValue: {} },
    ],
  });
  return store;
}

const attempts = [
  { mode: 'create', name: 'entry', original: undefined, rename: undefined },
  { mode: 'edit', name: 'entry', original: 'entry', rename: undefined },
  { mode: 'edit', name: 'renamed', original: 'entry', rename: 'renamed' },
] as const;

describe('Dialog Config Submit adapters', () => {
  it.each(attempts)('pins bundle $mode payload for $name', async ({ mode, name, original, rename }) => {
    const store = setup();
    const adapter = TestBed.runInInjectionContext(injectBundleFormSubmit);
    const result = { name, bundle: { bundleName: '{locale}.json', dist: './dist', collections: 'All' as const } };
    const lifecycle = new NamedEntrySubmit<typeof result>({
      nameControl: () => new FormControl(name, { nonNullable: true }),
      fallbackTokens: { create: 'create-failed', update: 'update-failed' },
      env: adapter.env,
    });
    await lifecycle.submit({
      dialog: fakeDialog(),
      entry: { mode, name: original },
      prepare: () => result,
      write: adapter.write,
      onRefusal: vi.fn(),
    });
    if (mode === 'create') {
      expect(store.createBundle).toHaveBeenCalledExactlyOnceWith({ name, bundle: result.bundle });
      expect(store.updateBundle).not.toHaveBeenCalled();
    } else {
      expect(store.updateBundle).toHaveBeenCalledExactlyOnceWith(original, { name: rename, bundle: result.bundle });
      expect(store.createBundle).not.toHaveBeenCalled();
    }
  });

  it.each(attempts)('pins collection $mode payload for $name', async ({ mode, name, original, rename }) => {
    const store = setup();
    const adapter = TestBed.runInInjectionContext(injectCollectionFormSubmit);
    const result = {
      name,
      config: {
        translationsFolder: './i18n',
        locales: ['en', 'fr'],
        protectedTerms: ['Acme'],
        protectedTermsFile: './terms.json',
      },
    };
    const lifecycle = new NamedEntrySubmit<typeof result>({
      nameControl: () => new FormControl(name, { nonNullable: true }),
      fallbackTokens: { create: 'create-failed', update: 'update-failed' },
      env: adapter.env,
    });
    await lifecycle.submit({
      dialog: fakeDialog(),
      entry: { mode, name: original },
      prepare: () => result,
      write: adapter.write,
      onRefusal: vi.fn(),
    });
    if (mode === 'create') {
      expect(store.createCollection).toHaveBeenCalledExactlyOnceWith({ name, collection: result.config });
      expect(store.updateCollection).not.toHaveBeenCalled();
    } else {
      expect(store.updateCollection).toHaveBeenCalledExactlyOnceWith(original, {
        name: rename,
        collection: result.config,
      });
      expect(store.createCollection).not.toHaveBeenCalled();
    }
  });
});
