import { defineFlags, flagName } from '../runner/flag-record';
import type { ValidateCommandOptions } from './validate';

const portablePluralsFlag = {
  flags: '--require-portable-plurals',
  description: "Warn when a base-locale plural selects by category (one, few, ...) instead of an exact '=N' match",
  defaultValue: false,
};

export const VALIDATE_FLAGS = defineFlags<ValidateCommandOptions>()({
  allowTranslated: {
    flags: '--allow-translated',
    description: 'Treat translated status as warning instead of error',
    defaultValue: false,
  },
  skipLocales: {
    runtimeDefault: [],
    list: 'optional',
    flags: '--skip-locales <locales>',
    description: 'Comma-separated list of locales to exclude from validation',
  },
  skipIcu: {
    flags: '--skip-icu',
    description: `Do not compile values as ICU for their own locale (${flagName(portablePluralsFlag)} still applies)`,
    defaultValue: false,
  },
  skipRuntime: {
    flags: '--skip-runtime',
    description: 'Do not check whether the configured app runtime can render ICU constructs',
    defaultValue: false,
  },
  requirePortablePlurals: portablePluralsFlag,
  skipPlaceholders: {
    flags: '--skip-placeholders',
    description: 'Do not check that each translation interpolates the same placeholders as its base value',
    defaultValue: false,
  },
  skipProtectedTerms: {
    flags: '--skip-protected-terms',
    description: 'Do not check translations for dropped or altered protected terms',
    defaultValue: false,
  },
});

import { validateHelpText } from '../runner/help-text';

export const VALIDATE_REGISTRATION = {
  name: 'validate',
  description: 'Verify translation completeness and readiness for production release',
  flags: VALIDATE_FLAGS,
  helpText: () => validateHelpText(),
};
