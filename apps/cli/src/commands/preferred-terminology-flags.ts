import { defineFlags, flagName } from '../runner/flag-record';
import type { PreferredTerminologyOptions } from './preferred-terminology';

const addFlag = {
  flags: '--add <discouraged>',
  description: 'Add a rule for a discouraged term, or replace the existing one (case-insensitive)',
};

export const PREFERRED_TERMINOLOGY_FLAGS = defineFlags<PreferredTerminologyOptions>()({
  list: { flags: '--list', description: 'List the rules and the file that holds them' },
  add: addFlag,
  preferred: {
    flags: '--preferred <preferred>',
    description: `Preferred term for ${flagName(addFlag)} (required with ${flagName(addFlag)})`,
  },
  reason: {
    flags: '--reason <reason>',
    description: `Optional reason shown with the suggestion (used with ${flagName(addFlag)})`,
  },
  remove: {
    flags: '--remove <discouraged>',
    description: 'Remove the rule for a discouraged term (case-insensitive)',
  },
});

import { preferredTerminologyHelpText } from '../runner/help-text';

export const PREFERRED_TERMINOLOGY_REGISTRATION = {
  name: 'preferred-terminology',
  description:
    'Manage preferred terminology rules. A base-locale value using a discouraged term gets a warning suggesting the preferred term.',
  flags: PREFERRED_TERMINOLOGY_FLAGS,
  helpText: () => preferredTerminologyHelpText(),
};
