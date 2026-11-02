import { Option } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commandManifest } from './command-manifest';
import { createCli } from './program';
import { createRecordingManifest } from './testing/recording-manifest';

interface Case {
  name: string;
  fullArgv: string[];
  fullCall: unknown[];
  defaultArgv?: string[];
  defaultCall: unknown[];
}

const cases: Case[] = [
  {
    name: 'init',
    fullArgv: [
      '--collection-name',
      'app',
      '--translations-folder',
      'src/i18n',
      '--export-folder',
      'out',
      '--import-folder',
      'in',
      '--base-locale',
      'en',
      '--locales',
      'en',
      'fr',
      '--runtime',
      'transloco',
      '--setup-bundle',
      'false',
      '--bundle-dist',
      'dist',
      '--bundle-name',
      '{locale}',
      '--token-casing',
      'camelCase',
      '--type-dist-file',
      'tokens.ts',
      '--token-constant-name',
      'TOKENS',
      '--enable-auto-translation',
      '--translation-provider',
      'google',
      '--translation-api-key-env',
      'KEY',
    ],
    fullCall: [
      {
        collectionName: 'app',
        translationsFolder: 'src/i18n',
        exportFolder: 'out',
        importFolder: 'in',
        baseLocale: 'en',
        locales: ['en', 'fr'],
        runtime: 'transloco',
        setupBundle: false,
        bundleDist: 'dist',
        bundleName: '{locale}',
        tokenCasing: 'camelCase',
        typeDistFile: 'tokens.ts',
        tokenConstantName: 'TOKENS',
        enableAutoTranslation: true,
        translationProvider: 'google',
        translationApiKeyEnv: 'KEY',
      },
    ],
    defaultCall: [{}],
  },
  {
    name: 'add-collection',
    fullArgv: [
      '--collection-name',
      'app',
      '--translations-folder',
      'src/i18n',
      '--export-folder',
      'out',
      '--import-folder',
      'in',
      '--base-locale',
      'en',
      '--locales',
      'en',
      'fr',
      '--no-read-only',
    ],
    fullCall: [
      {
        collectionName: 'app',
        translationsFolder: 'src/i18n',
        exportFolder: 'out',
        importFolder: 'in',
        baseLocale: 'en',
        locales: ['en', 'fr'],
        readOnly: false,
      },
    ],
    defaultCall: [{}],
  },
  {
    name: 'delete-collection',
    fullArgv: ['--collection-name', 'app', '--yes'],
    fullCall: [{ collectionName: 'app', yes: true }],
    defaultCall: [{}],
  },
  {
    name: 'add-locale',
    fullArgv: ['--collection', 'app', '--locale', 'fr'],
    fullCall: [{ collection: 'app', locale: 'fr' }],
    defaultCall: [{}],
  },
  {
    name: 'remove-locale',
    fullArgv: ['--collection', 'app', '--locale', 'fr'],
    fullCall: [{ collection: 'app', locale: 'fr' }],
    defaultCall: [{}],
  },
  {
    name: 'add-resource',
    fullArgv: [
      '--collection',
      'app',
      '--key',
      'a.b',
      '--value',
      'Hello',
      '--comment',
      'Greeting',
      '--tags',
      'ui,common',
      '--target-folder',
      'a',
      '--translations',
      '[{"locale":"fr"}]',
      '--override',
    ],
    fullCall: [
      {
        collection: 'app',
        key: 'a.b',
        value: 'Hello',
        comment: 'Greeting',
        tags: ['ui', 'common'],
        targetFolder: 'a',
        translations: '[{"locale":"fr"}]',
        override: true,
      },
    ],
    defaultCall: [{}],
  },
  {
    name: 'edit-resource',
    fullArgv: [
      '--collection',
      'app',
      '--key',
      'a.b',
      '--base-value',
      'Hello',
      '--comment',
      'Greeting',
      '--tags',
      'ui,common',
      '--target-folder',
      'a',
      '--locale',
      'fr',
      '--locale-value',
      'Bonjour',
    ],
    fullCall: [
      {
        collection: 'app',
        key: 'a.b',
        baseValue: 'Hello',
        comment: 'Greeting',
        tags: ['ui', 'common'],
        targetFolder: 'a',
        locale: 'fr',
        localeValue: 'Bonjour',
      },
    ],
    defaultCall: [{}],
  },
  {
    name: 'delete-resource',
    fullArgv: ['--collection', 'app', '--key', 'a.b', '--yes'],
    fullCall: [{ collection: 'app', key: ['a.b'], yes: true }],
    defaultCall: [{}],
  },
  {
    name: 'move',
    fullArgv: ['--collection', 'app', '--source', 'a.b', '--dest', 'c.d', '--dest-collection', 'other', '--override'],
    fullCall: [{ collection: 'app', source: 'a.b', dest: 'c.d', destCollection: 'other', override: true }],
    defaultCall: [{}],
  },
  {
    name: 'normalize',
    fullArgv: ['--collection', 'app', '--all', '--dry-run', '--json', '--yes'],
    fullCall: [{ collection: 'app', all: true, dryRun: true, json: true, yes: true }],
    defaultCall: [{}],
  },
  {
    name: 'translate-locale',
    fullArgv: ['--collection', 'app', '--locale', 'fr', '--verbose'],
    fullCall: [{ collection: 'app', locale: 'fr', verbose: true }],
    defaultCall: [{}],
  },
  {
    name: 'bundle',
    fullArgv: [
      '--name',
      'core',
      '--locale',
      'fr',
      '--quiet',
      '--verbose',
      '--token-casing',
      'upperCase',
      '--token-constant-name',
      'TOKENS',
      '--no-transform-icu-to-transloco',
      '--debug-keys',
      '99',
    ],
    fullCall: [
      {
        name: ['core'],
        locale: ['fr'],
        quiet: true,
        verbose: true,
        tokenCasing: 'upperCase',
        tokenConstantName: 'TOKENS',
        transformICUToTransloco: false,
        debugKeys: '99',
      },
    ],
    defaultCall: [{}],
  },
  {
    name: 'export',
    fullArgv: [
      '--format',
      'json',
      '--collection',
      'app',
      '--locale',
      'fr',
      '--status',
      'verified',
      '--tags',
      'ui',
      '--output',
      'dist',
      '--structure',
      'flat',
      '--rich',
      '--include-base',
      '--include-status',
      '--include-comment',
      '--include-tags',
      '--no-protect-notes',
      '--base-property-name',
      'source',
      '--filename',
      '{locale}.json',
      '--dry-run',
      '--verbose',
    ],
    fullCall: [
      {
        format: 'json',
        collection: ['app'],
        locale: ['fr'],
        status: ['verified'],
        tags: ['ui'],
        output: 'dist',
        structure: 'flat',
        rich: true,
        includeBase: true,
        includeStatus: true,
        includeComment: true,
        includeTags: true,
        protectNotes: false,
        basePropertyName: 'source',
        filename: '{locale}.json',
        dryRun: true,
        verbose: true,
      },
    ],
    defaultCall: [
      {
        protectNotes: true,
        dryRun: false,
        verbose: false,
      },
    ],
  },
  {
    name: 'import',
    fullArgv: [
      '--format',
      'xliff',
      '--source',
      'file.xlf',
      '--locale',
      'fr',
      '--collection',
      'app',
      '--strategy',
      'migration',
      '--update-comments',
      '--update-tags',
      '--preserve-status',
      '--create-missing',
      '--validate-base',
      '--dry-run',
      '--verbose',
    ],
    fullCall: [
      {
        format: 'xliff',
        source: 'file.xlf',
        locale: 'fr',
        collection: 'app',
        strategy: 'migration',
        updateComments: true,
        updateTags: true,
        preserveStatus: true,
        createMissing: true,
        validateBase: true,
        dryRun: true,
        verbose: true,
      },
    ],
    defaultCall: [
      {
        dryRun: false,
        verbose: false,
      },
    ],
  },
  {
    name: 'validate',
    fullArgv: [
      '--allow-translated',
      '--skip-locales',
      'fr,de',
      '--skip-icu',
      '--skip-runtime',
      '--require-portable-plurals',
      '--skip-placeholders',
      '--skip-protected-terms',
    ],
    fullCall: [
      {
        allowTranslated: true,
        skipLocales: ['fr', 'de'],
        skipIcu: true,
        skipRuntime: true,
        requirePortablePlurals: true,
        skipPlaceholders: true,
        skipProtectedTerms: true,
      },
    ],
    defaultCall: [
      {
        allowTranslated: false,
        skipIcu: false,
        skipRuntime: false,
        requirePortablePlurals: false,
        skipPlaceholders: false,
        skipProtectedTerms: false,
      },
    ],
  },
  {
    name: 'find-similar',
    fullArgv: ['--collection', 'app', '--value', 'Hello', '--max-results', '8'],
    fullCall: [{ collection: 'app', value: 'Hello', maxResults: 8 }],
    defaultCall: [{}],
  },
  {
    name: 'glossary',
    fullArgv: [
      '--text',
      'Hello',
      '--input',
      'input.txt',
      '--output',
      'out.json',
      '--stdout',
      '--collection',
      'app',
      '--locales',
      'en,fr',
      '--include-all',
      '--extractor',
      'ai',
    ],
    fullCall: [
      {
        text: 'Hello',
        input: 'input.txt',
        output: 'out.json',
        stdout: true,
        collection: 'app',
        locales: ['en', 'fr'],
        includeAll: true,
        extractor: 'ai',
      },
    ],
    defaultCall: [{ extractor: 'ngram' }],
  },
  {
    name: 'edit-collection',
    fullArgv: ['app', '--add-tag', 'one', '--add-tag', 'two', '--remove-tag', 'old', '--set-tags', 'ui,common'],
    fullCall: [{ name: 'app', addTag: ['one', 'two'], removeTag: ['old'], setTags: ['ui', 'common'] }],
    defaultArgv: ['app'],
    defaultCall: [{ name: 'app', addTag: [], removeTag: [] }],
  },
  {
    name: 'protected-terms',
    fullArgv: [
      '--collection',
      'app',
      '--add',
      'Brand',
      '--add',
      'Product',
      '--remove',
      'Old',
      '--set',
      'Brand,Product',
      '--list',
      '--file',
      'terms.json',
    ],
    fullCall: [
      {
        collection: 'app',
        add: ['Brand', 'Product'],
        remove: ['Old'],
        set: ['Brand', 'Product'],
        list: true,
        file: 'terms.json',
      },
    ],
    defaultCall: [{ add: [], remove: [] }],
  },
  {
    name: 'preferred-terminology',
    fullArgv: ['--list', '--add', 'bad', '--preferred', 'good', '--reason', 'style', '--remove', 'old'],
    fullCall: [{ list: true, add: 'bad', preferred: 'good', reason: 'style', remove: 'old' }],
    defaultCall: [{}],
  },
  {
    name: 'install-skill',
    fullArgv: [
      '--collection',
      'app:bundle:Tokens:path',
      '--collection',
      'other:bundle:Tokens:path',
      '--dir',
      '.claude',
      '--token-casing',
      'camelCase',
    ],
    fullCall: [
      { collection: ['app:bundle:Tokens:path', 'other:bundle:Tokens:path'], dir: '.claude', tokenCasing: 'camelCase' },
    ],
    defaultCall: [{ collection: [] }],
  },
];

const { handlers, recordingManifest, handler } = createRecordingManifest();

async function invoke(name: string, argv: string[]): Promise<void> {
  await createCli(recordingManifest).parseAsync([name, ...argv], { from: 'user' });
}

describe('every CLI handler registration', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('matches every manifest entry to a recording loader and argv case', async () => {
    expect(cases.map((entry) => entry.name)).toEqual(commandManifest.map((entry) => entry.name));
    const loadedHandlers = await Promise.all(recordingManifest.map((entry) => entry.load()));
    expect(loadedHandlers).toEqual(cases.map((entry) => handler(entry.name)));
    expect(new Set(loadedHandlers)).toEqual(new Set(handlers.values()));
  });

  it('covers every registered command and every record key with parsed handler values', async () => {
    expect(commandManifest.map((entry) => entry.name)).toEqual(
      createCli(recordingManifest).commands.map((command) => command.name()),
    );
    for (const registration of commandManifest) {
      const entry = cases.find((entry) => entry.name === registration.name);
      expect(entry).toBeDefined();
      if (!entry) throw new Error(`Missing argv case for ${registration.name}`);
      const program = createCli(recordingManifest);
      await program.parseAsync([entry.name, ...entry.fullArgv], { from: 'user' });
      const command = program.commands.find((command) => command.name() === entry.name);
      const options = handler(entry.name)?.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      for (const [key, record] of Object.entries(registration.flags)) {
        if ('flags' in record) {
          const attribute = new Option(record.flags).attributeName();
          expect(command?.getOptionValueSource(attribute), `${registration.name}.${key} supplied in argv`).toBe('cli');
        }
        expect(options, `${registration.name}.${key}`).toHaveProperty(key);
        expect(options?.[key], `${registration.name}.${key}`).not.toBeUndefined();
      }
    }
  });

  for (const entry of cases) {
    it(`${entry.name} passes parsed full argv to its handler`, async () => {
      await invoke(entry.name, entry.fullArgv);
      expect(handler(entry.name)).toHaveBeenCalledWith(...entry.fullCall);
    });

    it(`${entry.name} passes parsed defaults to its handler`, async () => {
      await invoke(entry.name, entry.defaultArgv ?? []);
      expect(handler(entry.name)).toHaveBeenCalledWith(...entry.defaultCall);
    });
  }
});
