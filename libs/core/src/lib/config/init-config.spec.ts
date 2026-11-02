import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { CONFIG_FILENAME } from '../../constants';
import { InvalidConfigError } from '../errors/lingo-tracker-error';
import { initConfig } from './init-config';

describe('initConfig', () => {
  let cwd: string;
  const config: LingoTrackerConfig = {
    exportFolder: 'dist/lingo-export',
    importFolder: 'dist/lingo-import',
    baseLocale: 'en',
    locales: [],
    collections: { Main: { translationsFolder: 'src/translations' } },
    bundles: { main: { bundleName: '{locale}', dist: './src/assets/i18n', collections: 'All' } },
  };
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'init-config-'));
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it('writes the same bytes as the previous CLI default serialization', () => {
    initConfig(config, { cwd });
    expect(readFileSync(join(cwd, CONFIG_FILENAME), 'utf8')).toBe(JSON.stringify(config, null, 2));
  });

  it('refuses an existing file and leaves its bytes unchanged', () => {
    const file = join(cwd, CONFIG_FILENAME);
    writeFileSync(file, '{"existing":true}');
    expect(() => initConfig(config, { cwd })).toThrow(InvalidConfigError);
    expect(readFileSync(file, 'utf8')).toBe('{"existing":true}');
  });

  it('validates before writing', () => {
    expect(() => initConfig({ ...config, baseLocale: '' }, { cwd })).toThrow(InvalidConfigError);
  });
});
