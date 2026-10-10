import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTempProject, runCli, workspaceRoot } from './support/run-cli';

describe('built CLI', () => {
  let project: ReturnType<typeof createTempProject>;
  const run = (args: string[], input?: string, timeoutMs?: number) =>
    runCli(args, { cwd: project.cwd, input, timeoutMs });
  const read = (file: string) => readFileSync(join(project.cwd, file), 'utf8');
  const json = (file: string): unknown => JSON.parse(read(file));
  const entriesFile = 'translations/main/common/buttons/resource_entries.json';
  const metaFile = 'translations/main/common/buttons/tracker_meta.json';

  async function init() {
    const result = await run([
      'init',
      '--collection-name',
      'main',
      '--translations-folder',
      'translations/main',
      '--base-locale',
      'en',
      '--locales',
      'en',
      'fr',
      '--bundle-dist',
      'bundles',
      '--bundle-name',
      '{locale}',
      '--type-dist-file',
      'tokens.ts',
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain('Created .lingo-tracker.json');
  }

  async function add(verified = false) {
    const args = ['add-resource', '--collection', 'main', '--key', 'common.buttons.ok', '--value', 'OK'];
    if (verified) {
      args.push('--translations', JSON.stringify([{ locale: 'fr', value: "D'accord", status: 'verified' }]));
    }
    const result = await run(args);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain('Resource added: common.buttons.ok');
  }

  beforeEach(() => {
    project = createTempProject();
  });
  afterEach(() => {
    project.cleanup();
  });

  it('prints the package version exactly', async () => {
    const { version } = JSON.parse(readFileSync(join(workspaceRoot, 'package.json'), 'utf8')) as { version: string };
    expect(await run(['--version'])).toEqual({ exitCode: 0, stdout: `${version}\n`, stderr: '' });
  });

  it('lists every command from the help baseline', async () => {
    const baseline = JSON.parse(
      readFileSync(join(workspaceRoot, 'apps/cli/src/testing/cli-help-baseline.json'), 'utf8'),
    ) as Record<string, string>;
    const result = await run(['--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    for (const name of Object.keys(baseline)) {
      if (name === 'lingo-tracker') continue;
      expect(result.stdout).toMatch(new RegExp(`^  ${name}(?:\\s|\\[|$)`, 'm'));
    }
  });

  it('rejects an unknown command on stderr', async () => {
    const result = await run(['unknown-smoke-command']);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("unknown command 'unknown-smoke-command'");
    expect(result.stdout).toBe('');
  });

  it('initializes, stores a resource and generates JSON bundles and tokens', async () => {
    await init();
    await add();
    expect(json(entriesFile)).toMatchObject({ ok: { source: 'OK', fr: 'OK' } });
    expect(json(metaFile)).toMatchObject({ ok: { fr: { status: 'new' } } });
    const result = await run(['bundle', '--name', 'main']);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(json('bundles/en.json')).toMatchObject({ common: { buttons: { ok: 'OK' } } });
    expect(json('bundles/fr.json')).toMatchObject({ common: { buttons: { ok: 'OK' } } });
    expect(read('tokens.ts')).toContain('common.buttons.ok');
  });

  it('fails quickly with clean stdout when a required flag is missing', async () => {
    await init();
    const result = await run(['add-resource', '--collection', 'main', '--key', 'common.buttons.ok'], undefined, 5_000);
    expect(result).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: '❌ Missing required options in non-interactive mode: --value\n',
    });
  });

  it('validates a project with a verified translation', async () => {
    await init();
    await add(true);
    const result = await run(['validate']);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain('Validation PASSED');
  });

  it('fails validation for a new untranslated locale', async () => {
    await init();
    await add();
    const result = await run(['validate']);
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain('Validation FAILED');
    expect(result.stdout + result.stderr).toContain('common.buttons.ok');
    expect(result.stdout + result.stderr).toContain('Locale: fr (1 failures)\n    ❌ [main] common.buttons.ok (new)');
  });

  it('reads piped glossary text and writes matching translations to disk', async () => {
    await init();
    await add(true);
    const result = await run(['glossary', '--output', 'glossary.json'], 'OK');
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain('1 term(s) matched');
    expect(json('glossary.json')).toMatchObject({
      matchCount: 1,
      terms: [{ key: 'common.buttons.ok', base: 'OK', translations: { fr: "D'accord" } }],
    });
  });

  it('installs the bundled skill templates with substituted project settings', async () => {
    const result = await run(['install-skill', '--collection', 'main:main:MAIN_TOKENS:tokens.ts', '--dir', '.claude']);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain('Skill installed successfully');
    const skill = read('.claude/skills/lingo-tracker/SKILL.md');
    expect(skill).toContain('MAIN_TOKENS');
    expect(skill).toContain('`main`');
    expect(skill).not.toContain('{{PRIMARY_COLLECTION}}');
    expect(read('.claude/skills/lingo-tracker/references/patterns.md').length).toBeGreaterThan(0);
  });

  it('round-trips an exported JSON translation through import', async () => {
    await init();
    await add(true);
    const exported = await run([
      'export',
      '--format',
      'json',
      '--locale',
      'fr',
      '--status',
      'verified',
      '--output',
      'exported',
    ]);
    expect(exported.exitCode, exported.stderr).toBe(0);
    expect(json('exported/fr.json')).toMatchObject({ common: { buttons: { ok: "D'accord" } } });
    const edited = await run([
      'edit-resource',
      '--collection',
      'main',
      '--key',
      'common.buttons.ok',
      '--locale',
      'fr',
      '--locale-value',
      'Changed',
    ]);
    expect(edited.exitCode, edited.stderr).toBe(0);
    expect(json(entriesFile)).toMatchObject({ ok: { fr: 'Changed' } });
    const imported = await run(['import', '--source', 'exported/fr.json', '--locale', 'fr', '--collection', 'main']);
    expect(imported.exitCode, imported.stderr).toBe(0);
    expect(imported.stdout).toContain('Resources Imported');
    expect(json(entriesFile)).toMatchObject({ ok: { source: 'OK', fr: "D'accord" } });
    expect(json(metaFile)).toMatchObject({ ok: { fr: { status: 'translated' } } });
  });
});
