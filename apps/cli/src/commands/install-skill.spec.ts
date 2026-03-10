import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseCollectionArg, substituteSkillTemplate, readPatternsMdTemplate, getTemplatesDir } from './install-skill';

// ---------------------------------------------------------------------------
// parseCollectionArg
// ---------------------------------------------------------------------------

describe('parseCollectionArg', () => {
  const VALID_RAW = 'myCol:my-bundle:MY_TOKENS:src/i18n/my.ts';

  it('parses a valid four-part spec into a CollectionSpec', () => {
    const result = parseCollectionArg(VALID_RAW);
    expect(result).toEqual({
      name: 'myCol',
      bundle: 'my-bundle',
      tokenConstant: 'MY_TOKENS',
      tokenFilePath: 'src/i18n/my.ts',
    });
  });

  it('throws when given only three parts', () => {
    expect(() => parseCollectionArg('myCol:my-bundle:MY_TOKENS')).toThrow(
      /Expected format: name:bundle:TokenConstant:tokenFilePath/,
    );
  });

  it('throws when given five parts', () => {
    expect(() => parseCollectionArg('myCol:my-bundle:MY_TOKENS:src/i18n/my.ts:extra')).toThrow(
      /Expected format: name:bundle:TokenConstant:tokenFilePath/,
    );
  });

  it('throws when a required part is empty (bundle is empty)', () => {
    expect(() => parseCollectionArg('myCol::MY_TOKENS:src/i18n/my.ts')).toThrow(
      /All four parts \(name, bundle, TokenConstant, tokenFilePath\) are required/,
    );
  });

  it('throws when a required part is empty (name is empty)', () => {
    expect(() => parseCollectionArg(':my-bundle:MY_TOKENS:src/i18n/my.ts')).toThrow(
      /All four parts \(name, bundle, TokenConstant, tokenFilePath\) are required/,
    );
  });
});

// ---------------------------------------------------------------------------
// substituteSkillTemplate — single collection
// (reads real template from disk to test actual substitution)
// ---------------------------------------------------------------------------

describe('substituteSkillTemplate (single collection)', () => {
  let template: string;

  beforeAll(() => {
    template = fs.readFileSync(path.join(getTemplatesDir(), 'SKILL.md'), 'utf-8');
  });

  const singleCollection = [
    {
      name: 'myCol',
      bundle: 'my-bundle',
      tokenConstant: 'MY_TOKENS',
      tokenFilePath: 'src/i18n/my.ts',
    },
  ];

  it('does not contain ensure-cli.sh', () => {
    expect(substituteSkillTemplate(template, singleCollection)).not.toContain('ensure-cli.sh');
  });

  it('does not contain "bash .claude/skills"', () => {
    expect(substituteSkillTemplate(template, singleCollection)).not.toContain('bash .claude/skills');
  });

  it('contains the add-resource command for the collection', () => {
    const output = substituteSkillTemplate(template, singleCollection);
    expect(output).toContain('npx lingo-tracker add-resource');
    expect(output).toContain('--collection myCol');
  });

  it('contains the find-similar command for the collection', () => {
    expect(substituteSkillTemplate(template, singleCollection)).toContain(
      'npx lingo-tracker find-similar --collection myCol',
    );
  });

  it('contains the bundle command with the correct bundle name', () => {
    expect(substituteSkillTemplate(template, singleCollection)).toContain('npx lingo-tracker bundle --name my-bundle');
  });

  it('does not contain --token-casing when tokenCasing is not specified', () => {
    expect(substituteSkillTemplate(template, singleCollection)).not.toContain('--token-casing');
  });

  it('contains --token-casing camelCase when tokenCasing is "camelCase"', () => {
    expect(substituteSkillTemplate(template, singleCollection, 'camelCase')).toContain('--token-casing camelCase');
  });

  it('contains the token constant name', () => {
    expect(substituteSkillTemplate(template, singleCollection)).toContain('MY_TOKENS');
  });

  it('contains the token file path', () => {
    expect(substituteSkillTemplate(template, singleCollection)).toContain('src/i18n/my.ts');
  });

  it('does not start with blank lines in the CLI commands section', () => {
    const output = substituteSkillTemplate(template, singleCollection);
    // The CLI commands section is introduced by the fixed prefix line; it must
    // not contain two consecutive newlines before "### Add a resource".
    expect(output).not.toMatch(/\n\n\n### Add a resource/);
  });

  it('does not contain any unsubstituted {{PLACEHOLDER}} tokens', () => {
    const output = substituteSkillTemplate(template, singleCollection);
    expect(output).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });
});

// ---------------------------------------------------------------------------
// substituteSkillTemplate — multi-collection
// ---------------------------------------------------------------------------

describe('substituteSkillTemplate (multi-collection)', () => {
  let template: string;

  beforeAll(() => {
    template = fs.readFileSync(path.join(getTemplatesDir(), 'SKILL.md'), 'utf-8');
  });

  const multiCollections = [
    {
      name: 'primaryCol',
      bundle: 'bundleA',
      tokenConstant: 'PRIMARY_TOKENS',
      tokenFilePath: 'src/i18n/primary.ts',
    },
    {
      name: 'secondaryCol',
      bundle: 'bundleB',
      tokenConstant: 'SECONDARY_TOKENS',
      tokenFilePath: 'src/i18n/secondary.ts',
    },
  ];

  it('bundle command contains both bundle names joined with a comma', () => {
    expect(substituteSkillTemplate(template, multiCollections)).toContain('--name bundleA,bundleB');
  });

  it('multi-collection note references the secondary collection name', () => {
    expect(substituteSkillTemplate(template, multiCollections)).toContain('secondaryCol');
  });

  it('add-resource example uses the primary collection', () => {
    const output = substituteSkillTemplate(template, multiCollections);
    expect(output).toContain('--collection primaryCol');
  });
});

// ---------------------------------------------------------------------------
// readPatternsMdTemplate
// ---------------------------------------------------------------------------

describe('readPatternsMdTemplate', () => {
  it('contains TranslocoPipe', async () => {
    expect(await readPatternsMdTemplate()).toContain('TranslocoPipe');
  });

  it('contains TranslocoService', async () => {
    expect(await readPatternsMdTemplate()).toContain('TranslocoService');
  });

  it('does not contain the hardcoded constant name TRACKER_TOKENS', async () => {
    expect(await readPatternsMdTemplate()).not.toContain('TRACKER_TOKENS');
  });

  it('uses the generic TOKEN_CONSTANT placeholder', async () => {
    expect(await readPatternsMdTemplate()).toContain('TOKEN_CONSTANT');
  });
});
