import { afterEach, describe, expect, it } from 'vitest';
import { type CommandProject, createCommandProject } from '../testing/command-project';
import { bundleCommand } from './bundle';

const legacyWarning =
  "Warning: Bundle 'main': 'typeDist' is deprecated and will be removed in the next major version. Please rename to 'typeDistFile' in your .lingo-tracker.json config.";
const failure =
  "Type generation failed: typeDistFile must end with a .ts extension (e.g. './src/types/tokens.ts'), but got: types/invalid.txt";
const modes = [{}, { quiet: true }, { verbose: true }] as const;

describe('bundle type output with a real command project', () => {
  let project: CommandProject | undefined;
  afterEach(() => project?.cleanup());

  it('keeps plural generation successful, counts its warning, and shows detail only when verbose', async () => {
    project = createCommandProject({
      exportFolder: 'export',
      importFolder: 'import',
      baseLocale: 'en',
      locales: ['en', 'fr', 'es'],
      runtime: 'transloco',
      collections: { main: { translationsFolder: 'resources' } },
      bundles: { main: { bundleName: '{locale}', dist: 'out', collections: 'All' } },
    });
    const plural = '{n, plural, one {# item} other {# items}}';
    await project.seed('count', plural);
    const warning =
      "Key 'count': uses ICU plural, which the transloco runtime cannot render; the bundled value is written in messageformat form. Set runtime to transloco-messageformat or rewrite the value without ICU constructs.";
    for (const verbose of [false, true]) {
      const result = await project.run(bundleCommand, { name: ['main'], verbose });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe(`⚠️  Warnings: 1\n${verbose ? `  - ${warning}\n` : ''}`);
      expect(result.stdout).not.toContain(warning);
      for (const locale of ['en', 'fr', 'es']) {
        expect(project.json(`out/${locale}.json`)).toEqual({ count: plural });
      }
    }
  });

  it('prints the runtime config mismatch once per bundle without verbose', async () => {
    project = createCommandProject({
      exportFolder: 'export',
      importFolder: 'import',
      baseLocale: 'en',
      locales: ['en', 'fr'],
      runtime: 'transloco',
      transformICUToTransloco: false,
      collections: { main: { translationsFolder: 'resources' } },
      bundles: {
        main: { bundleName: '{locale}', dist: 'out', collections: 'All' },
        second: { bundleName: '{locale}', dist: 'second', collections: 'All' },
      },
    });
    const value = "Showing '{'first'}' entries";
    await project.seed('entries', value);
    const result = await project.run(bundleCommand, {});
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe(
      ['main', 'second']
        .map(
          (name) =>
            `Bundle '${name}': transformICUToTransloco is off, so the transloco runtime setting does not apply; the bundle holds ICU-quoted text\n`,
        )
        .join(''),
    );
    expect(project.json('out/en.json')).toEqual({ entries: value });
  });

  for (const status of ['written', 'skipped', 'failed', 'not-configured'] as const) {
    for (const legacy of [false, true]) {
      for (const mode of modes) {
        it(`preserves exact streams for ${status}, legacy=${legacy}, mode=${JSON.stringify(mode)}`, async () => {
          const typePath =
            status === 'not-configured' ? '' : status === 'failed' ? 'types/invalid.txt' : 'types/main.ts';
          project = createCommandProject({
            exportFolder: 'export',
            importFolder: 'import',
            baseLocale: 'en',
            locales: ['en'],
            collections: { main: { translationsFolder: 'resources' } },
            bundles: {
              main: {
                bundleName: '{locale}',
                dist: 'out',
                collections: 'All',
                ...(legacy ? { typeDist: typePath } : { typeDistFile: typePath }),
              },
            },
          });
          if (status !== 'skipped') await project.seed('hello', 'Hello');
          const result = await project.run(bundleCommand, { name: ['main'], ...mode });
          const quiet = 'quiet' in mode;
          const verbose = 'verbose' in mode;
          const display =
            status === 'written'
              ? '└─ Types: types/main.ts (1 keys)'
              : status === 'skipped'
                ? '└─ Types: Skipped (bundle is empty)'
                : '└─ Types: Skipped (no typeDistFile configured)';
          const stdout = quiet
            ? ''
            : '\n🔄 Generating bundle: main\n' +
              `  ✅ Files generated: ${status === 'skipped' ? 0 : 1}\n` +
              `  ✅ Locales: ${status === 'skipped' ? '' : 'en'}\n` +
              (status === 'failed' ? '' : `  ${display}\n`);
          const stderr =
            (legacy ? `${legacyWarning}\n` : '') +
            (status === 'failed' ? `❌ ${failure}\n` : '') +
            (status === 'skipped'
              ? `⚠️  Warnings: 1\n${verbose ? "  - Bundle 'main' for locale 'en' is empty\n" : ''}`
              : '');
          expect(result).toEqual({ stdout, stderr, exitCode: status === 'failed' ? 1 : 0 });
        });
      }
    }
  }

  for (const mode of modes) {
    it(`preserves multi-bundle warning totals, mode=${JSON.stringify(mode)}`, async () => {
      const legacy = {
        bundleName: '{locale}',
        dist: 'out',
        collections: 'All' as const,
        typeDist: 'types/invalid.txt',
      };
      project = createCommandProject({
        exportFolder: 'export',
        importFolder: 'import',
        baseLocale: 'en',
        locales: ['en'],
        collections: { main: { translationsFolder: 'resources' } },
        bundles: {
          main: legacy,
          second: { bundleName: '{locale}', dist: 'second', collections: 'All' },
        },
      });
      await project.seed('hello', 'Hello');
      const result = await project.run(bundleCommand, mode);
      const quiet = 'quiet' in mode;
      const stdout = quiet
        ? ''
        : '\n🔄 Generating bundle: main\n  ✅ Files generated: 1\n  ✅ Locales: en\n' +
          '\n🔄 Generating bundle: second\n  ✅ Files generated: 1\n  ✅ Locales: en\n' +
          '  └─ Types: Skipped (no typeDistFile configured)\n' +
          '\n📊 Summary (2 bundles)\n' +
          '─'.repeat(50) +
          '\n  Total files generated: 2\n';
      expect(result).toEqual({ stdout, stderr: `${legacyWarning}\n❌ ${failure}\n`, exitCode: 1 });
    });
  }
});
