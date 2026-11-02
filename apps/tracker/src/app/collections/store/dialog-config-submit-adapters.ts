import { DestroyRef, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import type { BundleDefinitionDto, LingoTrackerCollectionDto } from '@simoncodes-ca/data-transfer';
import { injectConfirm } from '../../shared/confirm';
import { CollectionsStore } from './collections.store';
import type { FormSubmitEnv, NamedEntryWrite } from './dialog-config-submit';

function injectFormSubmitEnv(): FormSubmitEnv {
  const transloco = inject(TranslocoService);
  return { translate: (token) => transloco.translate(token), destroyRef: inject(DestroyRef), confirm: injectConfirm() };
}

/** The bundle's submit environment and Config Write payloads. */
export function injectBundleFormSubmit() {
  const store = inject(CollectionsStore);
  const write: NamedEntryWrite<{ name: string; bundle: BundleDefinitionDto }>['write'] = {
    create: (result) => store.createBundle({ name: result.name, bundle: result.bundle }),
    update: (name, patch, result) => store.updateBundle(name, { ...patch, bundle: result.bundle }),
  };
  return { env: injectFormSubmitEnv(), write };
}

/** The collection's submit environment and Config Write payloads. */
export function injectCollectionFormSubmit() {
  const store = inject(CollectionsStore);
  const write: NamedEntryWrite<{ name: string; config: LingoTrackerCollectionDto }>['write'] = {
    create: (result) => store.createCollection({ name: result.name, collection: result.config }),
    update: (name, patch, result) => store.updateCollection(name, { ...patch, collection: result.config }),
  };
  return { env: injectFormSubmitEnv(), write };
}
