#!/usr/bin/env node
import { Command } from 'commander';
import type { EditCollectionOptions } from './commands/edit-collection';
import {
  EXPORT_DEFAULTS,
  IMPORT_DEFAULTS,
  IMPORT_STRATEGY_DEFAULTS as importStrategyDefaults,
  IMPORT_MIGRATION_DEFAULTS as migrationDefaults,
} from './commands/run-option-defaults';
import { importHelpText, preferredTerminologyHelpText, validateHelpText } from './runner/help-text';
import {
  choiceOption,
  collectionOption,
  collectionSetupOptions,
  option,
  commaListOption,
  repeatableListOption,
  resourceFieldOptions,
  setupBundleOption,
  tokenCasingOption,
  yesOption,
} from './runner/options';
import { parseValidateOptions } from './commands/validate-options';
import { parseMaxResults } from './commands/find-similar-options';
import { registerCommand } from './runner/register-command';

const program = new Command();

program
  .name('lingo-tracker')
  .description('Effortlessly track, validate, and manage your translations')
  .version(__CLI_VERSION__);

registerCommand(program, {
  name: 'init',
  description: 'Initialize Lingo Tracker in the current project',
  options: [
    ...collectionSetupOptions,
    setupBundleOption,
    option({ flags: '--bundle-dist <path>', description: 'Bundle output directory' }),
    option({ flags: '--bundle-name <pattern>', description: 'Bundle name pattern (e.g. {locale})' }),
    tokenCasingOption,
    option({ flags: '--type-dist-file <path>', description: 'Path for generated TypeScript type definitions file' }),
    option({ flags: '--token-constant-name <name>', description: 'Custom name for the generated TypeScript constant' }),
    option({ flags: '--enable-auto-translation', description: 'Enable automatic translation' }),
    option({
      flags: '--translation-provider <provider>',
      description: 'Translation provider (e.g., google-translate)',
    }),
    option({
      flags: '--translation-api-key-env <envVar>',
      description: 'Environment variable name for the translation API key',
    }),
  ],
  load: () => import('./init/init').then((module) => module.initCommand),
});

registerCommand(program, {
  name: 'add-collection',
  description: 'Add a new translation collection to the project',
  options: [
    ...collectionSetupOptions,
    option({
      flags: '--read-only',
      description: 'Mark the collection as read-only (its resources cannot be modified)',
    }),
    option({
      flags: '--no-read-only',
      description: 'Force the collection writable, overriding node_modules auto-detection',
    }),
  ],
  load: () => import('./add-collection/add-collection').then((module) => module.addCollectionCommand),
});

registerCommand(program, {
  name: 'delete-collection',
  description: 'Delete a translation collection from the project',
  options: [option({ flags: '--collection-name <name>', description: 'Name of the collection to delete' }), yesOption],
  load: () => import('./delete-collection/delete-collection').then((module) => module.deleteCollectionCommand),
});

registerCommand(program, {
  name: 'add-locale',
  description: 'Add a locale to a collection and backfill all existing resources',
  options: [
    collectionOption('Name of the collection'),
    option({ flags: '--locale <locale>', description: 'Locale to add (e.g., fr-ca, de, es)' }),
  ],
  load: () => import('./commands/add-locale').then((module) => module.addLocaleCommand),
});

registerCommand(program, {
  name: 'remove-locale',
  description: 'Remove a locale from a collection and purge all locale data',
  options: [
    collectionOption('Name of the collection'),
    option({ flags: '--locale <locale>', description: 'Locale to remove' }),
  ],
  load: () => import('./commands/remove-locale').then((module) => module.removeLocaleCommand),
});

registerCommand(program, {
  name: 'add-resource',
  description: 'Add a translation resource to a collection',
  options: [
    collectionOption('Name of the collection'),
    ...resourceFieldOptions('add'),
    option({ flags: '--override', description: 'Replace the resource if it already exists' }),
    option({
      flags: '--translations <json>',
      description:
        'Optional translations as JSON array, e.g., \'[{"locale":"es","value":"Aplicar","status":"translated"}]\'',
    }),
  ],
  load: () => import('./add-resource/add-resource').then((module) => module.addResourceCommand),
});

registerCommand(program, {
  name: 'edit-resource',
  description: 'Edit an existing translation resource',
  options: [
    collectionOption('Name of the collection'),
    ...resourceFieldOptions('edit'),
    option({ flags: '--locale <locale>', description: 'Locale to update (requires --locale-value)' }),
    option({ flags: '--locale-value <value>', description: 'New value for the specified locale' }),
  ],
  load: () => import('./commands/edit-resource').then((module) => module.editResourceCommand),
});

registerCommand(program, {
  name: 'delete-resource',
  description: 'Delete one or more translation resources from a collection',
  options: [
    collectionOption('Name of the collection'),
    commaListOption({
      flags: '--key <keys>',
      description: 'Resource key(s) - single key or comma-separated (e.g., key1,key2,key3)',
    }),
    yesOption,
  ],
  load: () => import('./commands/delete-resource').then((module) => module.deleteResourceCommand),
});

registerCommand(program, {
  name: 'move',
  description: 'Move or rename translation resources',
  options: [
    collectionOption('Name of the collection'),
    option({
      flags: '--source <source>',
      description: 'Source key or pattern (e.g., common.buttons.ok or common.buttons.*)',
    }),
    option({ flags: '--dest <dest>', description: 'Destination key (e.g., common.actions.ok)' }),
    option({
      flags: '--dest-collection <name>',
      description: 'Move into another collection; the destination key is relative to that collection',
    }),
    option({ flags: '--override', description: 'Override destination if it exists' }),
  ],
  load: () => import('./commands/move').then((module) => module.moveResourceCommand),
});

registerCommand(program, {
  name: 'normalize',
  description: 'Normalize translation resources (fix checksums, add missing locales, clean up empty folders)',
  options: [
    collectionOption('Collection name (required unless --all)'),
    option({ flags: '--all', description: 'Normalize all collections' }),
    option({ flags: '--dry-run', description: 'Preview changes without applying them' }),
    option({ flags: '--json', description: 'Output results as JSON' }),
    yesOption,
  ],
  load: () => import('./commands/normalize').then((module) => module.normalizeCommand),
});

registerCommand(program, {
  name: 'translate-locale',
  description: 'Auto-translate all new/stale resources for a target locale',
  options: [
    collectionOption('Collection name'),
    option({ flags: '--locale <locale>', description: 'Target locale to translate' }),
    option({ flags: '--verbose', description: 'Show per-batch progress' }),
  ],
  load: () => import('./commands/translate-locale').then((module) => module.translateLocaleCommand),
});

registerCommand(program, {
  name: 'bundle',
  description: 'Generate translation bundles for deployment',
  options: [
    commaListOption({
      flags: '--name <names>',
      description: 'Bundle name(s) - single name or comma-separated (e.g., core,admin)',
    }),
    commaListOption({
      flags: '--locale <locales>',
      description: 'Locale(s) to generate - comma-separated (e.g., en,fr)',
    }),
    option({
      flags: '--quiet',
      description: 'Suppress progress and success output (warnings and errors are still shown)',
    }),
    option({ flags: '--verbose', description: 'Show detailed output including warnings' }),
    tokenCasingOption,
    option({
      flags: '--token-constant-name <name>',
      description: 'Custom name for the generated TypeScript constant (single bundle only, e.g. MY_TOKENS)',
    }),
    option({
      flags: '--no-transform-icu-to-transloco',
      description: 'Disable ICU to Transloco format conversion in bundle output',
    }),
    option({
      flags: '--debug-keys [locale]',
      description:
        'Also emit a debug bundle where each value is its own dot-delimited key. Optional locale code (default: 99)',
    }),
  ],
  load: () => import('./commands/bundle').then((module) => module.bundleCommand),
});

registerCommand(program, {
  name: 'export',
  description: 'Export translation resources to XLIFF or JSON',
  options: [
    option({ flags: '-f, --format <format>', description: 'Export format (xliff | json)' }),
    commaListOption({
      flags: '-c, --collection <names>',
      description: 'Specific collection(s) to export (comma-separated)',
    }),
    commaListOption({ flags: '-l, --locale <locales>', description: 'Target locale(s) to export (comma-separated)' }),
    commaListOption({
      flags: '-s, --status <statuses>',
      empty: 'preserve',
      description: 'Filter by translation status (comma-separated)',
      helpDefault: EXPORT_DEFAULTS.status,
    }),
    commaListOption({ flags: '-t, --tags <tags>', description: 'Filter by tags (comma-separated)' }),
    option({ flags: '-o, --output <path>', description: 'Output directory path' }),
    option({
      flags: '--structure <type>',
      description: 'JSON structure (flat | hierarchical)',
      helpDefault: EXPORT_DEFAULTS.structure,
    }),
    option({ flags: '--rich', description: 'Include metadata in JSON objects', helpDefault: EXPORT_DEFAULTS.rich }),
    option({
      flags: '--include-base',
      description: 'Include base locale value (JSON only)',
      helpDefault: EXPORT_DEFAULTS.includeBase,
    }),
    option({
      flags: '--include-status',
      description: 'Include translation status (JSON only)',
      helpDefault: EXPORT_DEFAULTS.includeStatus,
    }),
    option({
      flags: '--include-comment',
      description: 'Include comment (JSON only)',
      helpDefault: EXPORT_DEFAULTS.includeComment,
    }),
    option({
      flags: '--include-tags',
      description: 'Include tags array (JSON only)',
      helpDefault: EXPORT_DEFAULTS.includeTags,
    }),
    option({
      flags: '--no-protect-notes',
      description: 'Do not emit do-not-translate instructions for protected terms',
    }),
    option({
      flags: '--base-property-name <name>',
      description: 'Property name for base locale value in JSON output (default: baseValue)',
    }),
    option({ flags: '--filename <pattern>', description: 'Custom filename pattern' }),
    option({
      flags: '--dry-run',
      description: 'Show what would be exported without writing files',
      defaultValue: false,
    }),
    option({ flags: '--verbose', description: 'Show detailed export progress', defaultValue: false }),
  ],
  load: () => import('./commands/export-cmd').then((module) => module.exportCommand),
});

registerCommand(program, {
  name: 'import',
  description: 'Import translation resources from XLIFF or JSON',
  options: [
    option({
      flags: '-f, --format <format>',
      description: 'Import format (xliff | json) - auto-detected from file extension if omitted',
    }),
    option({ flags: '-s, --source <path>', description: 'Path to import file (required)' }),
    option({ flags: '-l, --locale <locale>', description: 'Target locale for import (e.g., es, fr-ca)' }),
    option({ flags: '-c, --collection <name>', description: 'Target collection to import into' }),
    option({
      flags: '--strategy <strategy>',
      description: 'Import strategy (translation-service | verification | migration | update)',
      helpDefault: IMPORT_DEFAULTS.strategy,
    }),
    option({
      flags: '--update-comments',
      description: `Update resource comments from import data (migration: ${migrationDefaults.updateComments})`,
      helpDefault: importStrategyDefaults.updateComments,
    }),
    option({
      flags: '--update-tags',
      description: `Update resource tags from rich JSON (migration: ${migrationDefaults.updateTags})`,
      helpDefault: importStrategyDefaults.updateTags,
    }),
    option({
      flags: '--preserve-status',
      description: 'Allow rich JSON to specify status (advanced)',
      helpDefault: IMPORT_DEFAULTS.preserveStatus,
    }),
    option({
      flags: '--create-missing',
      description: `Create new resources if they don't exist (migration: ${migrationDefaults.createMissing})`,
      helpDefault: importStrategyDefaults.createMissing,
    }),
    option({
      flags: '--validate-base',
      description: 'Warn if source base value differs from existing',
      helpDefault: IMPORT_DEFAULTS.validateBase,
    }),
    option({ flags: '--no-validate-base', description: 'Do not warn when source base value differs from existing' }),
    option({
      flags: '--dry-run',
      description: 'Show what would be imported without modifying files',
      defaultValue: false,
    }),
    option({ flags: '--verbose', description: 'Show detailed import progress', defaultValue: false }),
  ],
  helpText: importHelpText,
  load: () => import('./commands/import-cmd').then((module) => module.importCommand),
});

registerCommand(program, {
  name: 'validate',
  description: 'Verify translation completeness and readiness for production release',
  options: [
    option({
      flags: '--allow-translated',
      description: 'Treat translated status as warning instead of error',
      defaultValue: false,
    }),
    commaListOption({
      flags: '--skip-locales <locales>',
      description: 'Comma-separated list of locales to exclude from validation',
    }),
    option({
      flags: '--skip-icu',
      description: 'Do not compile values as ICU for their own locale (--require-portable-plurals still applies)',
      defaultValue: false,
    }),
    option({
      flags: '--require-portable-plurals',
      description: "Warn when a base-locale plural selects by category (one, few, ...) instead of an exact '=N' match",
      defaultValue: false,
    }),
    option({
      flags: '--skip-placeholders',
      description: 'Do not check that each translation interpolates the same placeholders as its base value',
      defaultValue: false,
    }),
  ],
  helpText: validateHelpText,
  load: () => import('./commands/validate').then((module) => module.validateCommand),
  mapOptions: (raw) => parseValidateOptions(raw as Parameters<typeof parseValidateOptions>[0]),
});

registerCommand(program, {
  name: 'find-similar',
  description: 'Find existing translation resources with similar base locale values',
  options: [
    collectionOption('Name of the collection to search'),
    option({ flags: '--value <text>', description: 'Base locale text to search for similar values' }),
    option({
      flags: '--max-results <n>',
      description: 'Maximum number of results to return (default: 5)',
      helpDefault: '5',
      parse: parseMaxResults,
    }),
  ],
  load: () => import('./commands/find-similar').then((module) => module.findSimilarCommand),
  mapOptions: (raw) => ({ ...raw, maxResults: (raw.maxResults as number | undefined) ?? 5 }),
});

registerCommand(program, {
  name: 'glossary',
  description: 'Extract translations for terms found in a block of text (e.g. for online help)',
  options: [
    option({ flags: '--text <text>', description: 'Inline text block to extract terms from' }),
    option({ flags: '--input <file>', description: 'Path to a file whose contents are the input text block' }),
    option({
      flags: '--output <file>',
      description: 'Output JSON file path (default: ./lingo-tracker-glossary-<timestamp>.json)',
    }),
    option({ flags: '--stdout', description: 'Print the glossary JSON to stdout instead of writing a file' }),
    collectionOption('Limit matching to a single collection (default: all collections)'),
    commaListOption({
      flags: '--locales <list>',
      description: 'Comma-separated locales to include (default: all configured locales)',
    }),
    option({ flags: '--include-all', description: 'Include new/stale entries (default: only translated + verified)' }),
    choiceOption('--extractor <mode>', 'Term extraction strategy', ['ngram', 'ai'], 'ngram'),
  ],
  load: () => import('./commands/glossary').then((module) => module.glossaryCommand),
});

registerCommand(program, {
  name: 'edit-collection',
  description: 'Edit a collection configuration (currently: manage collection-level tags)',
  argument: ['<name>', 'Collection name'],
  options: [
    repeatableListOption('--add-tag <tag>', 'Add a tag to the collection (repeatable)'),
    repeatableListOption('--remove-tag <tag>', 'Remove a tag from the collection (repeatable)'),
    commaListOption({
      flags: '--set-tags <tags>',
      empty: 'clear',
      description: 'Replace all collection tags with a comma-separated list (use "" to clear)',
    }),
  ],
  load: () =>
    import('./commands/edit-collection').then(
      (module) =>
        ({ name, options }: { name: string; options: Parameters<typeof module.editCollectionCommand>[1] }) =>
          module.editCollectionCommand(name, options),
    ),
  mapOptions: (raw, args) => ({ name: args[0] as string, options: raw as EditCollectionOptions }),
});

registerCommand(program, {
  name: 'protected-terms',
  description: 'Manage protected terms (global or per-collection). Terms are kept verbatim and never translated.',
  options: [
    collectionOption('Target collection (absent = global scope)'),
    repeatableListOption('--add <term>', 'Add a protected term (repeatable)'),
    repeatableListOption('--remove <term>', 'Remove a protected term (repeatable)'),
    commaListOption({
      flags: '--set <terms>',
      empty: 'clear',
      description: 'Replace protected terms with a comma-separated list (use "" to clear)',
    }),
    option({ flags: '--list', description: 'List protected terms (effective union for a collection)' }),
    option({
      flags: '--file <path>',
      description: 'Point this scope at a protected terms JSON file (use "" to clear)',
    }),
  ],
  load: () => import('./commands/protected-terms').then((module) => module.protectedTermsCommand),
});

registerCommand(program, {
  name: 'preferred-terminology',
  description:
    'Manage preferred terminology rules. A base-locale value using a discouraged term gets a warning suggesting the preferred term.',
  options: [
    option({ flags: '--list', description: 'List the rules and the file that holds them' }),
    option({
      flags: '--add <discouraged>',
      description: 'Add a rule for a discouraged term, or replace the existing one (case-insensitive)',
    }),
    option({ flags: '--preferred <preferred>', description: 'Preferred term for --add (required with --add)' }),
    option({ flags: '--reason <reason>', description: 'Optional reason shown with the suggestion (used with --add)' }),
    option({
      flags: '--remove <discouraged>',
      description: 'Remove the rule for a discouraged term (case-insensitive)',
    }),
  ],
  helpText: preferredTerminologyHelpText,
  load: () => import('./commands/preferred-terminology').then((module) => module.preferredTerminologyCommand),
});

registerCommand(program, {
  name: 'install-skill',
  description: 'Generate a lingo-tracker AI skill configured for this repository',
  options: [
    repeatableListOption(
      '--collection <spec>',
      'Collection spec: name:bundle:TokenConstant:tokenFilePath (repeatable)',
    ),
    option({ flags: '--dir <path>', description: 'Output directory (default: .claude)' }),
    tokenCasingOption,
  ],
  load: () => import('./commands/install-skill').then((module) => module.installSkillCommand),
});

program.parse();
