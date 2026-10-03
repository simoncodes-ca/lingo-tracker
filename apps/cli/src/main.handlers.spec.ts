import { afterEach, describe, expect, it, vi } from 'vitest';

const handlers = vi.hoisted(() => ({
  init: vi.fn(),
  addCollection: vi.fn(),
  deleteCollection: vi.fn(),
  addLocale: vi.fn(),
  removeLocale: vi.fn(),
  addResource: vi.fn(),
  editResource: vi.fn(),
  deleteResource: vi.fn(),
  move: vi.fn(),
  normalize: vi.fn(),
  translateLocale: vi.fn(),
  bundle: vi.fn(),
  export: vi.fn(),
  import: vi.fn(),
  validate: vi.fn(),
  findSimilar: vi.fn(),
  glossary: vi.fn(),
  editCollection: vi.fn(),
  protectedTerms: vi.fn(),
  preferredTerminology: vi.fn(),
  installSkill: vi.fn(),
}));

vi.mock('./init/init', () => ({ initCommand: handlers.init }));
vi.mock('./add-collection/add-collection', () => ({ addCollectionCommand: handlers.addCollection }));
vi.mock('./delete-collection/delete-collection', () => ({ deleteCollectionCommand: handlers.deleteCollection }));
vi.mock('./commands/add-locale', () => ({ addLocaleCommand: handlers.addLocale }));
vi.mock('./commands/remove-locale', () => ({ removeLocaleCommand: handlers.removeLocale }));
vi.mock('./add-resource/add-resource', () => ({ addResourceCommand: handlers.addResource }));
vi.mock('./commands/edit-resource', () => ({ editResourceCommand: handlers.editResource }));
vi.mock('./commands/delete-resource', () => ({ deleteResourceCommand: handlers.deleteResource }));
vi.mock('./commands/move', () => ({ moveResourceCommand: handlers.move }));
vi.mock('./commands/normalize', () => ({ normalizeCommand: handlers.normalize }));
vi.mock('./commands/translate-locale', () => ({ translateLocaleCommand: handlers.translateLocale }));
vi.mock('./commands/bundle', () => ({ bundleCommand: handlers.bundle }));
vi.mock('./commands/export-cmd', () => ({ exportCommand: handlers.export }));
vi.mock('./commands/import-cmd', () => ({ importCommand: handlers.import }));
vi.mock('./commands/validate', () => ({ validateCommand: handlers.validate }));
vi.mock('./commands/find-similar', () => ({ findSimilarCommand: handlers.findSimilar }));
vi.mock('./commands/glossary', () => ({ glossaryCommand: handlers.glossary }));
vi.mock('./commands/edit-collection', () => ({ editCollectionCommand: handlers.editCollection }));
vi.mock('./commands/protected-terms', () => ({ protectedTermsCommand: handlers.protectedTerms }));
vi.mock('./commands/preferred-terminology', () => ({ preferredTerminologyCommand: handlers.preferredTerminology }));
vi.mock('./commands/install-skill', () => ({ installSkillCommand: handlers.installSkill }));

type Handler = (typeof handlers)[keyof typeof handlers];
interface Case {
  name: string;
  handler: Handler;
  fullArgv: string[];
  fullCall: unknown[];
  defaultArgv?: string[];
  defaultCall: unknown[];
}

const cases: Case[] = [
  {
    name: 'init',
    handler: handlers.init,
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
    handler: handlers.addCollection,
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
    handler: handlers.deleteCollection,
    fullArgv: ['--collection-name', 'app', '--yes'],
    fullCall: [{ collectionName: 'app', yes: true }],
    defaultCall: [{}],
  },
  {
    name: 'add-locale',
    handler: handlers.addLocale,
    fullArgv: ['--collection', 'app', '--locale', 'fr'],
    fullCall: [{ collection: 'app', locale: 'fr' }],
    defaultCall: [{}],
  },
  {
    name: 'remove-locale',
    handler: handlers.removeLocale,
    fullArgv: ['--collection', 'app', '--locale', 'fr'],
    fullCall: [{ collection: 'app', locale: 'fr' }],
    defaultCall: [{}],
  },
  {
    name: 'add-resource',
    handler: handlers.addResource,
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
    handler: handlers.editResource,
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
    handler: handlers.deleteResource,
    fullArgv: ['--collection', 'app', '--key', 'a.b', '--yes'],
    fullCall: [{ collection: 'app', key: ['a.b'], yes: true }],
    defaultCall: [{}],
  },
  {
    name: 'move',
    handler: handlers.move,
    fullArgv: ['--collection', 'app', '--source', 'a.b', '--dest', 'c.d', '--dest-collection', 'other', '--override'],
    fullCall: [{ collection: 'app', source: 'a.b', dest: 'c.d', destCollection: 'other', override: true }],
    defaultCall: [{}],
  },
  {
    name: 'normalize',
    handler: handlers.normalize,
    fullArgv: ['--collection', 'app', '--all', '--dry-run', '--json'],
    fullCall: [{ collection: 'app', all: true, dryRun: true, json: true }],
    defaultCall: [{}],
  },
  {
    name: 'translate-locale',
    handler: handlers.translateLocale,
    fullArgv: ['--collection', 'app', '--locale', 'fr', '--verbose'],
    fullCall: [{ collection: 'app', locale: 'fr', verbose: true }],
    defaultCall: [{}],
  },
  {
    name: 'bundle',
    handler: handlers.bundle,
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
        transformIcuToTransloco: false,
        debugKeys: '99',
      },
    ],
    defaultCall: [{ transformIcuToTransloco: true }],
  },
  {
    name: 'export',
    handler: handlers.export,
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
    handler: handlers.import,
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
    handler: handlers.validate,
    fullArgv: [
      '--allow-translated',
      '--skip-locales',
      'fr,de',
      '--skip-icu',
      '--require-portable-plurals',
      '--skip-placeholders',
    ],
    fullCall: [
      {
        allowTranslated: true,
        skipLocales: ['fr', 'de'],
        skipIcu: true,
        requirePortablePlurals: true,
        skipPlaceholders: true,
      },
    ],
    defaultCall: [
      {
        allowTranslated: false,
        skipLocales: [],
        skipIcu: false,
        requirePortablePlurals: false,
        skipPlaceholders: false,
      },
    ],
  },
  {
    name: 'find-similar',
    handler: handlers.findSimilar,
    fullArgv: ['--collection', 'app', '--value', 'Hello', '--max-results', '8'],
    fullCall: [{ collection: 'app', value: 'Hello', maxResults: 8 }],
    defaultCall: [{ maxResults: 5 }],
  },
  {
    name: 'glossary',
    handler: handlers.glossary,
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
    handler: handlers.editCollection,
    fullArgv: ['app', '--add-tag', 'one', '--add-tag', 'two', '--remove-tag', 'old', '--set-tags', 'ui,common'],
    fullCall: ['app', { addTag: ['one', 'two'], removeTag: ['old'], setTags: ['ui', 'common'] }],
    defaultArgv: ['app'],
    defaultCall: ['app', { addTag: [], removeTag: [] }],
  },
  {
    name: 'protected-terms',
    handler: handlers.protectedTerms,
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
    handler: handlers.preferredTerminology,
    fullArgv: ['--list', '--add', 'bad', '--preferred', 'good', '--reason', 'style', '--remove', 'old'],
    fullCall: [{ list: true, add: 'bad', preferred: 'good', reason: 'style', remove: 'old' }],
    defaultCall: [{}],
  },
  {
    name: 'install-skill',
    handler: handlers.installSkill,
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

const originalArgv = process.argv;

async function invoke(name: string, argv: string[], handler: Handler): Promise<void> {
  process.argv = ['node', 'lingo-tracker', name, ...argv];
  vi.resetModules();
  await import('./main');
  await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
}

describe('every CLI handler registration', () => {
  afterEach(() => {
    process.argv = originalArgv;
    vi.clearAllMocks();
  });

  for (const entry of cases) {
    it(`${entry.name} passes parsed full argv to its handler`, async () => {
      await invoke(entry.name, entry.fullArgv, entry.handler);
      expect(entry.handler).toHaveBeenCalledWith(...entry.fullCall);
    });

    it(`${entry.name} passes parsed defaults to its handler`, async () => {
      await invoke(entry.name, entry.defaultArgv ?? [], entry.handler);
      expect(entry.handler).toHaveBeenCalledWith(...entry.defaultCall);
    });
  }
});
