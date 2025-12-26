#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('lingo-tracker')
  .description('Effortlessly track, validate, and manage your translations')
  .version('0.1.0');

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
  .option('--translations <json>', 'Optional translations as JSON array, e.g., \'[{"locale":"es","value":"Aplicar","status":"translated"}]\'')
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

program.parse();

