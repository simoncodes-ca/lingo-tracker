import { hasFsErrorCode } from '@simoncodes-ca/core';
import fs from 'fs';
import path from 'path';
import { ADD_RESOURCE_FLAGS } from '../add-resource/add-resource-flags';
import { CommandOutput } from '../runner/command-output';
import { type Ask, defineCommand } from '../runner/command-runner';
import { flagName } from '../runner/flag-record';
import { requiredText } from '../utils';
import { BUNDLE_FLAGS } from './bundle-flags';
import { DELETE_RESOURCE_FLAGS } from './delete-resource-flags';
import { EDIT_RESOURCE_FLAGS } from './edit-resource-flags';
import { INSTALL_SKILL_FLAGS } from './install-skill-flags';
import { NORMALIZE_FLAGS } from './normalize-flags';
import { PREFERRED_TERMINOLOGY_FLAGS } from './preferred-terminology-flags';

export interface CollectionSpec {
  name: string;
  bundle: string;
  tokenConstant: string;
  tokenFilePath: string;
}

export interface InstallSkillOptions {
  collection?: string[];
  tokenCasing?: 'upperCase' | 'camelCase';
  dir?: string;
}

export function parseCollectionArg(raw: string): CollectionSpec {
  const parts = raw.split(':');
  if (parts.length !== 4) {
    throw new Error(`Invalid collection spec "${raw}". Expected format: name:bundle:TokenConstant:tokenFilePath`);
  }
  const [name, bundle, tokenConstant, tokenFilePath] = parts;
  if (!name || !bundle || !tokenConstant || !tokenFilePath) {
    throw new Error(
      `Invalid collection spec "${raw}". All four parts (name, bundle, TokenConstant, tokenFilePath) are required.`,
    );
  }
  return { name, bundle, tokenConstant, tokenFilePath };
}

async function promptForCollections(ask: Ask): Promise<CollectionSpec[]> {
  const collections: CollectionSpec[] = [];
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  let addMore = true;

  while (addMore) {
    CommandOutput.log(`\nCollection ${collections.length + 1}:`);

    const answers = await ask([
      {
        type: 'text',
        name: 'name',
        message: 'Collection name (e.g., trackerResources)',
        validate: requiredText,
      },
      {
        type: 'text',
        name: 'bundle',
        message: 'Bundle name (e.g., tracker)',
        validate: requiredText,
      },
      {
        type: 'text',
        name: 'tokenConstant',
        message: 'Token constant name (e.g., TRACKER_TOKENS)',
        validate: requiredText,
      },
      {
        type: 'text',
        name: 'tokenFilePath',
        message: 'Token file path (e.g., src/i18n-types/tracker-resources.ts)',
        validate: requiredText,
      },
    ]);

    collections.push({
      name: text(answers.name),
      bundle: text(answers.bundle),
      tokenConstant: text(answers.tokenConstant),
      tokenFilePath: text(answers.tokenFilePath),
    });

    const more = await ask({
      type: 'confirm',
      name: 'value',
      message: 'Add another collection?',
      initial: false,
    });
    addMore = more.value === true;
  }

  return collections;
}

export function generateCollectionsSection(collections: CollectionSpec[]): string {
  if (collections.length === 1) {
    const collection = collections[0];
    return `- **Collection**: \`${collection.name}\`
- **Bundle**: \`${collection.bundle}\` (tokens at \`${collection.tokenFilePath}\`)
- **Token constant**: \`${collection.tokenConstant}\` (exported from \`${collection.tokenFilePath}\`)`;
  }

  const lines = collections.map((collection, i) => {
    const label = i === 0 ? ' (primary)' : '';
    return `- **\`${collection.name}\`**${label}: bundle \`${collection.bundle}\`, token constant \`${collection.tokenConstant}\`, tokens at \`${collection.tokenFilePath}\``;
  });
  return lines.join('\n');
}

export function generateCliCommandsSection(collections: CollectionSpec[], tokenCasing?: string): string {
  const primary = collections[0];
  const bundleFlag =
    collections.length === 1
      ? `${flagName(BUNDLE_FLAGS.name)} ${primary.bundle}`
      : `${flagName(BUNDLE_FLAGS.name)} ${collections.map((c) => c.bundle).join(',')}`;
  const casingFlag = tokenCasing ? ` ${flagName(BUNDLE_FLAGS.tokenCasing)} ${tokenCasing}` : '';

  const multiCollectionNote =
    collections.length > 1
      ? `\n\n> **Multi-collection repo**: The examples below use the primary collection \`${primary.name}\`. For other collections, substitute the collection name and bundle accordingly:\n${collections
          .slice(1)
          .map((c) => `> - \`${c.name}\` → bundle \`${c.bundle}\`, tokens \`${c.tokenConstant}\``)
          .join('\n')}`
      : '';

  const notePrefix = multiCollectionNote ? `${multiCollectionNote}\n\n` : '';
  return `${notePrefix}### Add a resource
\`\`\`bash
npx lingo-tracker add-resource \\
  ${flagName(ADD_RESOURCE_FLAGS.collection)} ${primary.name} \\
  ${flagName(ADD_RESOURCE_FLAGS.key)} <dot.delimited.key> \\
  ${flagName(ADD_RESOURCE_FLAGS.value)} "<base locale text>" \\
  ${flagName(ADD_RESOURCE_FLAGS.comment)} "<context for translators>" \\
  ${flagName(ADD_RESOURCE_FLAGS.tags)} "<single top-level domain tag>"
\`\`\`

### Regenerate bundle (after adding/editing resources)
\`\`\`bash
npx lingo-tracker bundle ${bundleFlag}${casingFlag}
\`\`\`
This regenerates both the JSON bundle files and the typed TypeScript token constants.

### Edit a resource
\`\`\`bash
npx lingo-tracker edit-resource \\
  ${flagName(EDIT_RESOURCE_FLAGS.collection)} ${primary.name} \\
  ${flagName(EDIT_RESOURCE_FLAGS.key)} <dot.delimited.key> \\
  ${flagName(EDIT_RESOURCE_FLAGS.baseValue)} "<new text>"
\`\`\`

### Delete a resource
\`\`\`bash
npx lingo-tracker delete-resource \\
  ${flagName(DELETE_RESOURCE_FLAGS.collection)} ${primary.name} \\
  ${flagName(DELETE_RESOURCE_FLAGS.key)} <dot.delimited.key> \\
  ${flagName(DELETE_RESOURCE_FLAGS.yes)}
\`\`\`

### Preferred terminology (project-wide)
\`\`\`bash
npx lingo-tracker preferred-terminology ${flagName(PREFERRED_TERMINOLOGY_FLAGS.list)}
npx lingo-tracker preferred-terminology ${flagName(PREFERRED_TERMINOLOGY_FLAGS.add)} "<discouraged term>" ${flagName(PREFERRED_TERMINOLOGY_FLAGS.preferred)} "<preferred term>" ${flagName(PREFERRED_TERMINOLOGY_FLAGS.reason)} "<optional reason>"
npx lingo-tracker preferred-terminology ${flagName(PREFERRED_TERMINOLOGY_FLAGS.remove)} "<discouraged term>"
\`\`\`
Base-locale values that use a discouraged term get a warning suggesting the preferred term.

### Other useful commands
\`\`\`bash
npx lingo-tracker normalize ${flagName(NORMALIZE_FLAGS.collection)} ${primary.name}
npx lingo-tracker validate
\`\`\``;
}

// After esbuild bundles the CLI, __dirname resolves to dist/apps/cli/ (the flat bundle root).
// The asset config in project.json intentionally outputs install-skill-templates/ to
// dist/apps/cli/install-skill-templates/ so that this path join aligns at runtime.
export function getTemplatesDir(): string {
  return path.join(__dirname, 'install-skill-templates');
}

export function substituteSkillTemplate(template: string, collections: CollectionSpec[], tokenCasing?: string): string {
  const primary = collections[0];
  const collectionsSection = generateCollectionsSection(collections);
  const cliCommandsSection = generateCliCommandsSection(collections, tokenCasing);
  const tokenImportPath = primary.tokenFilePath.replace(/\.ts$/, '');
  const tokenFileBasename = path.basename(primary.tokenFilePath);

  return template
    .replace(/\{\{PRIMARY_COLLECTION\}\}/g, primary.name)
    .replace(/\{\{PRIMARY_BUNDLE\}\}/g, primary.bundle)
    .replace(/\{\{TOKEN_FILE_BASENAME\}\}/g, tokenFileBasename)
    .replace(/\{\{COLLECTIONS_SECTION\}\}/g, collectionsSection)
    .replace(/\{\{CLI_COMMANDS_SECTION\}\}/g, cliCommandsSection)
    .replace(/\{\{TOKEN_IMPORT_PATH\}\}/g, tokenImportPath)
    .replace(/\{\{PRIMARY_TOKEN_CONSTANT\}\}/g, primary.tokenConstant);
}

export async function generateSkillMd(collections: CollectionSpec[], tokenCasing?: string): Promise<string> {
  const templatesDir = getTemplatesDir();
  const filePath = path.join(templatesDir, 'SKILL.md');
  try {
    const template = await fs.promises.readFile(filePath, 'utf-8');
    return substituteSkillTemplate(template, collections, tokenCasing);
  } catch (err) {
    if (hasFsErrorCode(err, 'ENOENT')) {
      // eslint-disable-next-line preserve-caught-error -- printCliError prints a cause as a second line; this message already says enough.
      throw new Error(
        `Template file not found: ${filePath}. Make sure the CLI was built with pnpm run build:cli before running.`,
      );
    }
    throw err;
  }
}

export async function readPatternsMdTemplate(): Promise<string> {
  const templatesDir = getTemplatesDir();
  const filePath = path.join(templatesDir, 'references', 'patterns.md');
  try {
    return await fs.promises.readFile(filePath, 'utf-8');
  } catch (err) {
    if (hasFsErrorCode(err, 'ENOENT')) {
      // eslint-disable-next-line preserve-caught-error -- printCliError prints a cause as a second line; this message already says enough.
      throw new Error(
        `Template file not found: ${filePath}. Make sure the CLI was built with pnpm run build:cli before running.`,
      );
    }
    throw err;
  }
}

export const installSkillCommand = defineCommand<InstallSkillOptions>()({
  flags: INSTALL_SKILL_FLAGS,
  name: 'Install skill',
  // Generates a skill file from templates; reads no project configuration.
  collection: 'none',
  config: false,
  run: async ({ answers: options, cwd, interactive, ask }) => {
    let collections: CollectionSpec[];
    let outputDir: string;
    let tokenCasing = options.tokenCasing; // may be overridden by interactive prompt

    if (options.collection && options.collection.length > 0) {
      // Non-interactive: parse from flags (a malformed spec throws; the runner exits 1)
      collections = options.collection.map(parseCollectionArg);
      outputDir = options.dir ?? '.claude';
    } else if (interactive) {
      const dirAnswer = await ask({
        type: 'select',
        name: 'value',
        message: 'Install skill into which AI tool directory?',
        choices: [
          { title: '.claude (default)', value: '.claude' },
          { title: '.agents', value: '.agents' },
          { title: '.cursor', value: '.cursor' },
        ],
        initial: 0,
      });
      outputDir = typeof dirAnswer.value === 'string' ? dirAnswer.value : '.claude';

      collections = await promptForCollections(ask);

      const casingAnswer = await ask({
        type: 'select',
        name: 'value',
        message: 'Token property key casing?',
        choices: [
          { title: 'upperCase (default)', value: 'upperCase' },
          { title: 'camelCase', value: 'camelCase' },
        ],
        initial: 0,
      });

      if (casingAnswer.value === 'camelCase') {
        tokenCasing = casingAnswer.value;
      }
    } else {
      throw new Error(
        `Missing required option in non-interactive mode: ${flagName(INSTALL_SKILL_FLAGS.collection)}\n` +
          `Usage: npx lingo-tracker install-skill ${flagName(INSTALL_SKILL_FLAGS.collection)} name:bundle:TokenConstant:tokenFilePath`,
      );
    }

    // Relative to the project root (INIT_CWD under pnpm), not to wherever node was started.
    const skillDir = path.resolve(cwd, outputDir, 'skills', 'lingo-tracker');
    const referencesDir = path.join(skillDir, 'references');

    fs.mkdirSync(referencesDir, { recursive: true });

    const skillMdPath = path.join(skillDir, 'SKILL.md');
    const patternsMdPath = path.join(referencesDir, 'patterns.md');

    fs.writeFileSync(skillMdPath, await generateSkillMd(collections, tokenCasing), 'utf-8');
    fs.writeFileSync(patternsMdPath, await readPatternsMdTemplate(), 'utf-8');

    CommandOutput.log('Skill installed successfully:');
    CommandOutput.log(`  ${skillMdPath}`);
    CommandOutput.log(`  ${patternsMdPath}`);
  },
});
