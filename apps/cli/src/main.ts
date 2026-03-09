#!/usr/bin/env node
import { Command, Option } from 'commander';

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

const program = new Command();

program
  .name('lingo-tracker')
  .description('Effortlessly track, validate, and manage your translations')
  .version('0.8.0');

program
  .command('init')
  .description('Initialize Lingo Tracker in the current project')
  .option('--collectionName <name>', 'Name for the translation collection')
  .option('--translationsFolder <path>')
  .option('--exportFolder <path>', 'dist/lingo-export')
  .option('--importFolder <path>', 'dist/lingo-import')
  .option('--baseLocale <locale>', 'en')
  .option('--locales <locales...>', 'supported locales')
  .action(async (options) => {
    const { initCommand } = await import('./init/init');
    await initCommand(options);
  });

program
  .command('add-collection')
  .description('Add a new translation collection to the project')
  .option('--collectionName <name>', 'Name for the translation collection')
  .option('--translationsFolder <path>')
  .option('--exportFolder <path>', 'dist/lingo-export')
  .option('--importFolder <path>', 'dist/lingo-import')
  .option('--baseLocale <locale>', 'en')
  .option('--locales <locales...>', 'supported locales')
  .action(async (options) => {
    const { addCollectionCommand } = await import('./add-collection/add-collection');
    await addCollectionCommand(options);
  });

program
  .command('delete-collection')
  .description('Delete a translation collection from the project')
  .option('--collectionName <name>', 'Name of the collection to delete')
  .action(async (options) => {
    const { deleteCollectionCommand } = await import('./delete-collection/delete-collection');
    await deleteCollectionCommand(options);
  });

program
  .command('add-resource')
  .description('Add a translation resource to a collection')
  .option('--collection <name>', 'Name of the collection')
  .option('--key <key>', 'Resource key (dot-delimited, e.g., apps.common.buttons.ok)')
  .option('--value <value>', 'Base value (source text)')
  .option('--comment <comment>', 'Optional context for translators')
  .option('--tags <tags>', 'Optional tags (comma-separated)')
  .option('--targetFolder <folder>', 'Optional target folder (dot-delimited)')
  .option(
    '--translations <json>',
    'Optional translations as JSON array, e.g., \'[{"locale":"es","value":"Aplicar","status":"translated"}]\'',
  )
  .action(async (options) => {
    const { addResourceCommand } = await import('./add-resource/add-resource');
    const processedOptions = {
      ...options,
      translations: options.translations ? JSON.parse(options.translations) : undefined,
    };
    await addResourceCommand(processedOptions);
  });

program
  .command('edit-resource')
  .description('Edit an existing translation resource')
  .option('--collection <name>', 'Name of the collection')
  .option('--key <key>', 'Resource key (dot-delimited)')
  .option('--baseValue <value>', 'New base value (source text)')
  .option('--comment <comment>', 'New comment')
  .option('--tags <tags>', 'New tags (comma-separated)')
  .option('--targetFolder <folder>', 'New target folder (dot-delimited)')
  .option('--locale <locale>', 'Locale to update (requires --localeValue)')
  .option('--localeValue <value>', 'New value for the specified locale')
  .action(async (options) => {
    const { editResourceCommand } = await import('./commands/edit-resource');
    await editResourceCommand(options);
  });

program
  .command('delete-resource')
  .description('Delete one or more translation resources from a collection')
  .option('--collection <name>', 'Name of the collection')
  .option('--key <keys>', 'Resource key(s) - single key or comma-separated (e.g., key1,key2,key3)')
  .option('--yes', 'Skip confirmation prompt')
  .action(async (options) => {
    const { deleteResourceCommand } = await import('./commands/delete-resource');
    await deleteResourceCommand(options);
  });

program
  .command('move')
  .description('Move or rename translation resources')
  .option('--collection <name>', 'Name of the collection')
  .option('--source <source>', 'Source key or pattern (e.g., common.buttons.ok or common.buttons.*)')
  .option('--dest <dest>', 'Destination key (e.g., common.actions.ok)')
  .option('--override', 'Override destination if it exists')
  .option('--verbose', 'Show detailed output')
  .action(async (options) => {
    const { moveResourceCommand } = await import('./commands/move');
    await moveResourceCommand(options);
  });

program
  .command('normalize')
  .description('Normalize translation resources (fix checksums, add missing locales, clean up empty folders)')
  .option('--collection <name>', 'Collection name (required unless --all)')
  .option('--all', 'Normalize all collections')
  .option('--dry-run', 'Preview changes without applying them')
  .option('--json', 'Output results as JSON')
  .action(async (options) => {
    const { normalizeCommand } = await import('./commands/normalize');
    await normalizeCommand(options);
  });

program
  .command('bundle')
  .description('Generate translation bundles for deployment')
  .option('--name <names>', 'Bundle name(s) - single name or comma-separated (e.g., core,admin)')
  .option('--locale <locales>', 'Locale(s) to generate - comma-separated (e.g., en,fr)')
  .option('--verbose', 'Show detailed output including warnings')
  .addOption(new Option('--token-casing <casing>', 'Token property key casing').choices(['upperCase', 'camelCase']))
  .action(async (options) => {
    const { bundleCommand } = await import('./commands/bundle');
    await bundleCommand(options);
  });

program
  .command('export')
  .description('Export translation resources to XLIFF or JSON')
  .option('-f, --format <format>', 'Export format (xliff | json)')
  .option('-c, --collection <names>', 'Specific collection(s) to export (comma-separated)')
  .option('-l, --locale <locales>', 'Target locale(s) to export (comma-separated)')
  .option('-s, --status <statuses>', 'Filter by translation status (comma-separated)', 'new,stale')
  .option('-t, --tags <tags>', 'Filter by tags (comma-separated)')
  .option('-o, --output <path>', 'Output directory path')
  .option('--structure <type>', 'JSON structure (flat | hierarchical)', 'hierarchical')
  .option('--rich', 'Include metadata in JSON objects', false)
  .option('--include-base', 'Include base locale value (JSON only)', false)
  .option('--include-status', 'Include status in rich objects (JSON only)', false)
  .option('--include-comment', 'Include comment in rich objects (JSON only)', true)
  .option('--include-tags', 'Include tags array in rich objects (JSON only)', false)
  .option('--filename <pattern>', 'Custom filename pattern')
  .option('--dry-run', 'Show what would be exported without writing files', false)
  .option('--verbose', 'Show detailed export progress', false)
  .action(async (options) => {
    const { exportCommand } = await import('./commands/export-cmd');
    await exportCommand(options);
  });

program
  .command('import')
  .description('Import translation resources from XLIFF or JSON')
  .option('-f, --format <format>', 'Import format (xliff | json) - auto-detected from file extension if omitted')
  .option('-s, --source <path>', 'Path to import file (required)')
  .option('-l, --locale <locale>', 'Target locale for import (e.g., es, fr-ca)')
  .option('-c, --collection <name>', 'Target collection to import into')
  .option(
    '--strategy <strategy>',
    'Import strategy (translation-service | verification | migration | update)',
    'translation-service',
  )
  .option('--update-comments', 'Update resource comments from import data', false)
  .option('--update-tags', 'Update resource tags from rich JSON', false)
  .option('--preserve-status', 'Allow rich JSON to specify status (advanced)', false)
  .option('--create-missing', "Create new resources if they don't exist")
  .option('--validate-base', 'Warn if source base value differs from existing', true)
  .option('--dry-run', 'Show what would be imported without modifying files', false)
  .option('--verbose', 'Show detailed import progress', false)
  .addHelpText(
    'after',
    `
Examples:
  # Import XLIFF from translation service (most common workflow)
  $ lingo-tracker import --source translations-es.xlf --locale es

  # Import with dry-run to preview changes first
  $ lingo-tracker import --source translations-fr.xlf --locale fr --dry-run

  # Import JSON file (format auto-detected from .json extension)
  $ lingo-tracker import --source translated-de.json --locale de

  # Migrate from another translation system with rich metadata
  $ lingo-tracker import --source old-system.json --locale es \\
      --strategy migration --create-missing --update-comments --update-tags

  # Language expert verification workflow
  $ lingo-tracker import --source verified-ja.xlf --locale ja --strategy verification

  # Bulk update existing translations (preserves current status)
  $ lingo-tracker import --source updates-pt.json --locale pt --strategy update

  # Import to specific collection with verbose logging
  $ lingo-tracker import --source admin-ko.xlf --locale ko \\
      --collection admin --verbose

Import Strategies:
  translation-service  Professional translation import (default)
                       - Updates existing resources only (no creation)
                       - Sets status to 'translated'
                       - Best for workflow with translation agencies

  verification        Language expert review workflow
                       - Sets status to 'verified' for reviewed translations
                       - Used after native speaker review
                       - Indicates higher confidence level

  migration           Migrate from another translation system
                       - Allows creating missing resources (with --create-missing)
                       - Resolves Transloco-style references: {{t('key')}}
                       - Can update comments and tags
                       - Best for one-time migration

  update              Bulk update existing translations
                       - Preserves current translation status
                       - Updates values without changing metadata
                       - Best for automated batch updates

Notes:
  - Format is auto-detected from file extension (.xlf, .xliff, .json)
  - Use --dry-run to preview changes before committing
  - Summary report saved to {translationsFolder}/import-summary.md
  - Large files (>5MB) will show a warning
`,
  )
  .action(async (options) => {
    const { importCommand } = await import('./commands/import-cmd');
    await importCommand(options);
  });

program
  .command('validate')
  .description('Verify translation completeness and readiness for production release')
  .option('--allow-translated', 'Treat translated status as warning instead of error', false)
  .addHelpText(
    'after',
    `
Examples:
  # Basic validation (strict mode - requires all translations verified)
  $ lingo-tracker validate

  # Relaxed mode - allow translated status with warnings
  $ lingo-tracker validate --allow-translated

  # Use in CI pipeline (exits with code 1 on validation failure)
  $ lingo-tracker validate || exit 1

Example Output (Success):
  ✅ Validation PASSED

  📊 Validation Statistics:
  ──────────────────────────────────────────────────
    Total Resources Validated: 450
    Unique Resource Keys: 150
    Locales Validated: 3
    Collections Validated: 1

  📈 Status Breakdown:
  ──────────────────────────────────────────────────
    ✅ Verified: 450
    ✏️  Translated: 0
    ⚠️  Stale: 0
    ❌ New: 0

  ──────────────────────────────────────────────────
  📋 Summary:
    Total Failures: 0
    Total Successes: 450

  ✅ Validation passed successfully!

Example Output (Failures):
  ❌ Validation FAILED

  📊 Validation Statistics:
  ──────────────────────────────────────────────────
    Total Resources Validated: 450
    Unique Resource Keys: 150
    Locales Validated: 3
    Collections Validated: 1

  📈 Status Breakdown:
  ──────────────────────────────────────────────────
    ✅ Verified: 420
    ✏️  Translated: 15
    ⚠️  Stale: 10
    ❌ New: 5

  ❌ Failures (30):
  ──────────────────────────────────────────────────
    Locale: es (10 failures)
      ❌ [main] common.buttons.submit (new)
      ⚠️  [main] dashboard.title (stale)
      ✏️  [main] settings.description (translated)
      ...

    Locale: fr (10 failures)
      ...

  ──────────────────────────────────────────────────
  📋 Summary:
    Total Failures: 30
    Total Successes: 420

  ❌ Validation failed. Please review the failures above.

CI Integration Examples:

  # GitHub Actions
  - name: Validate translations
    run: |
      npm install -g lingo-tracker
      lingo-tracker validate
      # Or with relaxed mode: lingo-tracker validate --allow-translated

  # GitLab CI
  validate-translations:
    stage: test
    script:
      - npm install -g lingo-tracker
      - lingo-tracker validate
    only:
      - main
      - merge_requests

  # CircleCI
  - run:
      name: Validate translations
      command: |
        npm install -g lingo-tracker
        lingo-tracker validate

  # Jenkins
  stage('Validate Translations') {
    steps {
      sh 'npm install -g lingo-tracker'
      sh 'lingo-tracker validate'
    }
  }

Validation Rules:
  ❌ new        Resource not yet translated → FAILURE
  ⚠️  stale      Translation out of sync with source → FAILURE
  ✏️  translated Has translation but not verified → FAILURE (default)
                                                  → WARNING (--allow-translated)
  ✅ verified   Translation reviewed and approved → SUCCESS

Exit Codes:
  0  All validations passed (all resources verified)
  1  Validation failures found (new/stale/translated resources)

Notes:
  - Validates ALL collections and ALL target locales (no filtering)
  - Collects ALL failures before reporting (comprehensive check)
  - Perfect for pre-release quality gates in CI/CD pipelines
  - Use --allow-translated for staging environments
  - Strict mode (default) recommended for production releases
`,
  )
  .action(async (options) => {
    const { validateCommand } = await import('./commands/validate');
    await validateCommand({ allowTranslated: options.allowTranslated });
  });

program
  .command('find-similar')
  .description('Find existing translation resources with similar base locale values')
  .option('--collection <name>', 'Name of the collection to search')
  .option('--value <text>', 'Base locale text to search for similar values')
  .option('--max-results <n>', 'Maximum number of results to return (default: 5)', '5')
  .action(async (options) => {
    const { findSimilarCommand } = await import('./commands/find-similar');
    const raw = parseInt(options.maxResults, 10);
    const maxResults = Number.isNaN(raw) || raw < 1 ? 5 : raw;
    await findSimilarCommand({ ...options, maxResults });
  });

program
  .command('install-skill')
  .description('Generate a lingo-tracker AI skill configured for this repository')
  .option('--collection <spec>', 'Collection spec: name:bundle:TokenConstant:tokenFilePath (repeatable)', collect, [])
  .option('--dir <path>', 'Output directory (default: .claude)')
  .addOption(new Option('--token-casing <casing>', 'Token property key casing').choices(['upperCase', 'camelCase']))
  .action(async (options) => {
    const { installSkillCommand } = await import('./commands/install-skill');
    await installSkillCommand(options);
  });

program.parse();
