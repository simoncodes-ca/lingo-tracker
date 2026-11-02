import { ADD_COLLECTION_REGISTRATION } from './add-collection/add-collection-flags';
import { ADD_RESOURCE_REGISTRATION } from './add-resource/add-resource-flags';
import { ADD_LOCALE_REGISTRATION } from './commands/add-locale-flags';
import { BUNDLE_REGISTRATION } from './commands/bundle-flags';
import { DELETE_RESOURCE_REGISTRATION } from './commands/delete-resource-flags';
import { EDIT_COLLECTION_REGISTRATION } from './commands/edit-collection-flags';
import { EDIT_RESOURCE_REGISTRATION } from './commands/edit-resource-flags';
import { EXPORT_REGISTRATION } from './commands/export-cmd-flags';
import { FIND_SIMILAR_REGISTRATION } from './commands/find-similar-flags';
import { GLOSSARY_REGISTRATION } from './commands/glossary-flags';
import { IMPORT_REGISTRATION } from './commands/import-cmd-flags';
import { INSTALL_SKILL_REGISTRATION } from './commands/install-skill-flags';
import { MOVE_REGISTRATION } from './commands/move-flags';
import { NORMALIZE_REGISTRATION } from './commands/normalize-flags';
import { PREFERRED_TERMINOLOGY_REGISTRATION } from './commands/preferred-terminology-flags';
import { PROTECTED_TERMS_REGISTRATION } from './commands/protected-terms-flags';
import { REMOVE_LOCALE_REGISTRATION } from './commands/remove-locale-flags';
import { TRANSLATE_LOCALE_REGISTRATION } from './commands/translate-locale-flags';
import { VALIDATE_REGISTRATION } from './commands/validate-options';
import { DELETE_COLLECTION_REGISTRATION } from './delete-collection/delete-collection-flags';
import { INIT_REGISTRATION } from './init/init-flags';
import type { CommandRegistration } from './runner/register-command';

/** Keep each handler paired with its option type when registering the mixed command list. */
function manifestEntry<Options>(registration: CommandRegistration<Options>) {
  return registration;
}

/** Help order and lazy command loaders are defined here once. */
export const commandManifest = [
  manifestEntry({
    ...INIT_REGISTRATION,
    load: () => import('./init/init').then((module) => module.initCommand),
  }),
  manifestEntry({
    ...ADD_COLLECTION_REGISTRATION,
    load: () => import('./add-collection/add-collection').then((module) => module.addCollectionCommand),
  }),
  manifestEntry({
    ...DELETE_COLLECTION_REGISTRATION,
    load: () => import('./delete-collection/delete-collection').then((module) => module.deleteCollectionCommand),
  }),
  manifestEntry({
    ...ADD_LOCALE_REGISTRATION,
    load: () => import('./commands/add-locale').then((module) => module.addLocaleCommand),
  }),
  manifestEntry({
    ...REMOVE_LOCALE_REGISTRATION,
    load: () => import('./commands/remove-locale').then((module) => module.removeLocaleCommand),
  }),
  manifestEntry({
    ...ADD_RESOURCE_REGISTRATION,
    load: () => import('./add-resource/add-resource').then((module) => module.addResourceCommand),
  }),
  manifestEntry({
    ...EDIT_RESOURCE_REGISTRATION,
    load: () => import('./commands/edit-resource').then((module) => module.editResourceCommand),
  }),
  manifestEntry({
    ...DELETE_RESOURCE_REGISTRATION,
    load: () => import('./commands/delete-resource').then((module) => module.deleteResourceCommand),
  }),
  manifestEntry({
    ...MOVE_REGISTRATION,
    load: () => import('./commands/move').then((module) => module.moveResourceCommand),
  }),
  manifestEntry({
    ...NORMALIZE_REGISTRATION,
    load: () => import('./commands/normalize').then((module) => module.normalizeCommand),
  }),
  manifestEntry({
    ...TRANSLATE_LOCALE_REGISTRATION,
    load: () => import('./commands/translate-locale').then((module) => module.translateLocaleCommand),
  }),
  manifestEntry({
    ...BUNDLE_REGISTRATION,
    load: () => import('./commands/bundle').then((module) => module.bundleCommand),
  }),
  manifestEntry({
    ...EXPORT_REGISTRATION,
    load: () => import('./commands/export-cmd').then((module) => module.exportCommand),
  }),
  manifestEntry({
    ...IMPORT_REGISTRATION,
    load: () => import('./commands/import-cmd').then((module) => module.importCommand),
  }),
  manifestEntry({
    ...VALIDATE_REGISTRATION,
    load: () => import('./commands/validate').then((module) => module.validateCommand),
  }),
  manifestEntry({
    ...FIND_SIMILAR_REGISTRATION,
    load: () => import('./commands/find-similar').then((module) => module.findSimilarCommand),
  }),
  manifestEntry({
    ...GLOSSARY_REGISTRATION,
    load: () => import('./commands/glossary').then((module) => module.glossaryCommand),
  }),
  manifestEntry({
    ...EDIT_COLLECTION_REGISTRATION,
    load: () => import('./commands/edit-collection').then((module) => module.editCollectionCommand),
  }),
  manifestEntry({
    ...PROTECTED_TERMS_REGISTRATION,
    load: () => import('./commands/protected-terms').then((module) => module.protectedTermsCommand),
  }),
  manifestEntry({
    ...PREFERRED_TERMINOLOGY_REGISTRATION,
    load: () => import('./commands/preferred-terminology').then((module) => module.preferredTerminologyCommand),
  }),
  manifestEntry({
    ...INSTALL_SKILL_REGISTRATION,
    load: () => import('./commands/install-skill').then((module) => module.installSkillCommand),
  }),
];

export type CommandManifest = readonly (typeof commandManifest)[number][];
