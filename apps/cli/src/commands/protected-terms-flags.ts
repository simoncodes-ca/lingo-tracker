import { collectionFlag, defineFlags } from '../runner/flag-record';
import type { ProtectedTermsOptions } from './protected-terms';

export const PROTECTED_TERMS_FLAGS = defineFlags<ProtectedTermsOptions>()({
  collection: collectionFlag('Target collection (absent = global scope)'),
  add: { flags: '--add <term>', description: 'Add a protected term (repeatable)', list: 'repeatable' },
  remove: { flags: '--remove <term>', description: 'Remove a protected term (repeatable)', list: 'repeatable' },
  set: {
    flags: '--set <terms>',
    list: 'clear',
    description: 'Replace protected terms with a comma-separated list (use "" to clear)',
  },
  list: { flags: '--list', description: 'List protected terms (effective union for a collection)' },
  file: {
    flags: '--file <path>',
    description: 'Point this scope at a protected terms JSON file (use "" to clear)',
  },
});

export const PROTECTED_TERMS_REGISTRATION = {
  name: 'protected-terms',
  description: 'Manage protected terms (global or per-collection). Terms are kept verbatim and never translated.',
  flags: PROTECTED_TERMS_FLAGS,
};
