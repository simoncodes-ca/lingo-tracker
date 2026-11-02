import { defineFlags, tokenCasingFlag } from '../runner/flag-record';
import type { InstallSkillOptions } from './install-skill';

export const INSTALL_SKILL_FLAGS = defineFlags<InstallSkillOptions>()({
  collection: {
    flags: '--collection <spec>',
    description: 'Collection spec: name:bundle:TokenConstant:tokenFilePath (repeatable)',
    list: 'repeatable',
  },
  dir: { flags: '--dir <path>', description: 'Output directory (default: .claude)' },
  tokenCasing: tokenCasingFlag,
});

export const INSTALL_SKILL_REGISTRATION = {
  name: 'install-skill',
  description: 'Generate a lingo-tracker AI skill configured for this repository',
  flags: INSTALL_SKILL_FLAGS,
};
