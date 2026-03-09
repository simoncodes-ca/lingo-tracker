import fs from 'fs';
import path from 'path';

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

async function promptForCollections(): Promise<CollectionSpec[]> {
  const prompts = (await import('prompts')).default;
  const collections: CollectionSpec[] = [];
  let addMore = true;

  while (addMore) {
    const collectionNum = collections.length + 1;
    console.log(`\nCollection ${collectionNum}:`);

    const answers = await prompts([
      {
        type: 'text',
        name: 'name',
        message: 'Collection name (e.g., trackerResources)',
        validate: (v: string) => v.trim().length > 0 || 'Required',
      },
      {
        type: 'text',
        name: 'bundle',
        message: 'Bundle name (e.g., tracker)',
        validate: (v: string) => v.trim().length > 0 || 'Required',
      },
      {
        type: 'text',
        name: 'tokenConstant',
        message: 'Token constant name (e.g., TRACKER_TOKENS)',
        validate: (v: string) => v.trim().length > 0 || 'Required',
      },
      {
        type: 'text',
        name: 'tokenFilePath',
        message: 'Token file path (e.g., src/i18n-types/tracker-resources.ts)',
        validate: (v: string) => v.trim().length > 0 || 'Required',
      },
    ]);

    if (!answers.name) {
      // User cancelled
      break;
    }

    collections.push({
      name: answers.name.trim(),
      bundle: answers.bundle.trim(),
      tokenConstant: answers.tokenConstant.trim(),
      tokenFilePath: answers.tokenFilePath.trim(),
    });

    const more = await prompts({
      type: 'confirm',
      name: 'value',
      message: 'Add another collection?',
      initial: false,
    });
    if (more.value === undefined) break;
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
    collections.length === 1 ? `--name ${primary.bundle}` : `--name ${collections.map((c) => c.bundle).join(',')}`;
  const casingFlag = tokenCasing ? ` --token-casing ${tokenCasing}` : '';

  const multiCollectionNote =
    collections.length > 1
      ? `\n\n> **Multi-collection repo**: The examples below use the primary collection \`${primary.name}\`. For other collections, substitute the collection name and bundle accordingly:\n${collections
          .slice(1)
          .map((c) => `> - \`${c.name}\` → bundle \`${c.bundle}\`, tokens \`${c.tokenConstant}\``)
          .join('\n')}`
      : '';

  const notePrefix = multiCollectionNote ? multiCollectionNote + '\n\n' : '';
  return `${notePrefix}### Add a resource
\`\`\`bash
npx lingo-tracker add-resource \\
  --collection ${primary.name} \\
  --key <dot.delimited.key> \\
  --value "<base locale text>" \\
  --comment "<context for translators>" \\
  --tags "<single top-level domain tag>"
\`\`\`

### Regenerate bundle (after adding/editing resources)
\`\`\`bash
npx lingo-tracker bundle ${bundleFlag}${casingFlag}
\`\`\`
This regenerates both the JSON bundle files and the typed TypeScript token constants.

### Edit a resource
\`\`\`bash
npx lingo-tracker edit-resource \\
  --collection ${primary.name} \\
  --key <dot.delimited.key> \\
  --baseValue "<new text>"
\`\`\`

### Delete a resource
\`\`\`bash
npx lingo-tracker delete-resource \\
  --collection ${primary.name} \\
  --key <dot.delimited.key> \\
  --yes
\`\`\`

### Other useful commands
\`\`\`bash
npx lingo-tracker normalize --collection ${primary.name}
npx lingo-tracker validate --collection ${primary.name}
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
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
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
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `Template file not found: ${filePath}. Make sure the CLI was built with pnpm run build:cli before running.`,
      );
    }
    throw err;
  }
}

export async function installSkillCommand(options: InstallSkillOptions): Promise<void> {
  const isTTY = process.stdin.isTTY;

  let collections: CollectionSpec[];
  let outputDir: string;
  let tokenCasing = options.tokenCasing; // may be overridden by interactive prompt

  if (options.collection && options.collection.length > 0) {
    // Non-interactive: parse from flags
    try {
      collections = options.collection.map(parseCollectionArg);
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
    outputDir = options.dir ?? '.claude';
  } else if (isTTY) {
    // Interactive mode
    const prompts = (await import('prompts')).default;

    const dirAnswer = await prompts({
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

    if (dirAnswer.value === undefined) {
      console.log('Cancelled.');
      return;
    }
    outputDir = dirAnswer.value;

    collections = await promptForCollections();
    if (collections.length === 0) {
      console.error('Error: at least one collection is required.');
      process.exit(1);
    }

    const casingAnswer = await prompts({
      type: 'select',
      name: 'value',
      message: 'Token property key casing?',
      choices: [
        { title: 'upperCase (default)', value: 'upperCase' },
        { title: 'camelCase', value: 'camelCase' },
      ],
      initial: 0,
    });

    if (casingAnswer.value && casingAnswer.value !== 'upperCase') {
      tokenCasing = casingAnswer.value;
    }
  } else {
    console.error('Error: --collection is required in non-interactive mode.');
    console.error('Usage: npx lingo-tracker install-skill --collection name:bundle:TokenConstant:tokenFilePath');
    process.exit(1);
  }

  const skillDir = path.join(outputDir, 'skills', 'lingo-tracker');
  const referencesDir = path.join(skillDir, 'references');

  fs.mkdirSync(referencesDir, { recursive: true });

  const skillMdPath = path.join(skillDir, 'SKILL.md');
  const patternsMdPath = path.join(referencesDir, 'patterns.md');

  fs.writeFileSync(skillMdPath, await generateSkillMd(collections, tokenCasing), 'utf-8');
  fs.writeFileSync(patternsMdPath, await readPatternsMdTemplate(), 'utf-8');

  console.log('Skill installed successfully:');
  console.log(`  ${skillMdPath}`);
  console.log(`  ${patternsMdPath}`);
}
