import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportCommand } from '../commands/export-cmd';
import { importCommand } from '../commands/import-cmd';
import { CommandOutput, withCommandOutput } from '../runner/command-output';
import { defineCommand } from '../runner/command-runner';
import { type CommandProject, createCommandProject } from '../testing/command-project';
import { type ReportedRun, reportRun, RunTiming } from './reported-run';

describe('reported run', () => {
  let project: CommandProject;
  const summaries = () => readdirSync(project.cwd).filter((name) => name.startsWith('lingo-tracker-'));
  beforeEach(() => {
    project = createCommandProject();
  });
  afterEach(() => project.cleanup());

  it('saves before the body, then prints counts, diagnostics, completion and announcement in order', async () => {
    const command = defineCommand()({
      name: 'Report',
      collection: 'none',
      run: () =>
        reportRun({
          summary: { kind: 'export', text: '# All findings', directory: project.cwd },
          printBody: () => {
            const [summary] = summaries();
            expect(summary).toBeDefined();
            expect(readFileSync(join(project.cwd, summary), 'utf8')).toBe('# All findings');
            CommandOutput.log('Body');
          },
          counts: { Files: 2 },
          warnings: ['warning'],
          errors: ['failure'],
          outcome: 'failed',
          printCompletion: () => CommandOutput.log('Complete'),
        }),
    });
    const output: string[] = [];
    const result = await project.run(
      command,
      {},
      {
        output: { stdout: (text) => output.push(text), stderr: (text) => output.push(text) },
      },
    );
    const [summary] = summaries();
    expect(output.join('')).toBe(
      `Body\n  Files: 2\n⚠️  Warnings (1):\n  - warning\n❌ Errors (1):\n  - failure\nComplete\n\nExport summary written to: ${join(project.cwd, summary)}\n`,
    );
    expect(result.exitCode).toBe(1);
  });

  it('saves the real export summary before locale results, then prints totals, warnings and announcement', async () => {
    await project.seed('buttons.ok');
    project.write('dist/export/fr.json', {});
    const output: string[] = [];
    let summaryAtBody: string | undefined;
    const result = await project.run(
      exportCommand,
      { format: 'json', locale: ['fr'] },
      {
        output: {
          stdout: (text) => {
            if (text.includes('✅ fr: Exported')) {
              const [summary] = summaries();
              expect(summary).toBeDefined();
              summaryAtBody = summary;
              expect(readFileSync(join(project.cwd, summary), 'utf8')).toContain('Overwriting existing file: fr.json');
            }
            output.push(text);
          },
          stderr: (text) => output.push(text),
        },
      },
    );
    const [summary] = summaries();
    expect(summaryAtBody).toBe(summary);
    expect(output.join('')).toContain(
      `  ✅ fr: Exported 1 resources to fr.json\n\n📊 Export Summary\n${'─'.repeat(50)}\n  Files Created: 1\n  Resources Exported: 1\n⚠️  Warnings (1):\n  - Overwriting existing file: fr.json\n\nExport summary written to: ${join(project.cwd, summary)}\n`,
    );
    expect(result.exitCode).toBe(0);
  });

  it('caps long lists through reportRun only after saving the full summary', async () => {
    const warnings = Array.from({ length: 12 }, (_, index) => `warning ${index + 1}`);
    const errors = Array.from({ length: 11 }, (_, index) => `error ${index + 1}`);
    const text = [...warnings, ...errors].join('\n');
    const command = defineCommand()({
      name: 'Capped report',
      collection: 'none',
      run: () =>
        reportRun({
          summary: { kind: 'import', text, directory: project.cwd },
          warnings,
          errors,
          outcome: 'failed',
        }),
    });
    const result = await project.run(command, {});
    const [summary] = summaries();
    const summaryPath = join(project.cwd, summary);
    expect(readFileSync(summaryPath, 'utf8')).toBe(text);
    expect(result.stderr).toBe(
      `⚠️  Warnings (12):\n${warnings
        .slice(0, 10)
        .map((warning) => `  - ${warning}\n`)
        .join('')}  ... and 2 more (full list in ${summaryPath})\n❌ Errors (11):\n${errors
        .slice(0, 10)
        .map((error) => `  - ${error}\n`)
        .join('')}  ... and 1 more (full list in ${summaryPath})\n`,
    );
    expect(result.exitCode).toBe(1);
  });

  it.each(['import', 'export'] as const)(
    'writes no %s summary in a dry run and only renders export previews',
    async (kind) => {
      const render = vi.fn(() => '# Preview');
      const errors = Array.from({ length: 12 }, (_, index) => `error ${index}`);
      const command = defineCommand()({
        name: 'Preview',
        collection: 'none',
        run: () =>
          reportRun({
            summary: { kind, text: render, directory: project.cwd, previewOnDryRun: kind === 'export' },
            dryRun: true,
            printBody: () => CommandOutput.log('Body'),
            warnings: [],
            errors,
            outcome: 'failed',
          }),
      });
      const result = await project.run(command, {});
      expect(summaries()).toEqual([]);
      expect(render).toHaveBeenCalledTimes(kind === 'export' ? 1 : 0);
      expect(result.stdout).toMatch(/^Body\n\n(?:Import|Export) summary would be written to: /);
      expect(result.stdout.endsWith('# Preview\n')).toBe(kind === 'export');
      expect(result.stderr).toBe(`❌ Errors (12):\n${errors.map((error) => `  - ${error}\n`).join('')}`);
      expect(result.exitCode).toBe(1);
    },
  );

  it('announces a summary failure after the report without changing the outcome', async () => {
    const command = defineCommand()({
      name: 'Report',
      collection: 'none',
      run: () =>
        reportRun({
          summary: {
            kind: 'import',
            text: () => {
              throw new Error('render failed');
            },
            directory: project.cwd,
          },
          printBody: () => CommandOutput.log('Body'),
          warnings: [],
          errors: [],
          outcome: 'succeeded',
        }),
    });
    const output: string[] = [];
    const result = await project.run(
      command,
      {},
      {
        output: { stdout: (text) => output.push(text), stderr: (text) => output.push(text) },
      },
    );
    expect(output.join('')).toBe('Body\n\n⚠️  Failed to write import summary file: render failed\n');
    expect(result.exitCode).toBe(0);
    expect(summaries()).toEqual([]);
  });

  it('uses the runner clock for verbose import timing at the existing output positions', async () => {
    await project.seed('buttons.ok');
    project.write('fr.json', { 'buttons.ok': 'Bonjour' });
    const start = new Date('2026-01-01T12:00:00Z').getTime();
    const end = start + 1234;
    const now = vi.fn().mockReturnValueOnce(start).mockReturnValueOnce(end);
    const result = await project.run(
      importCommand,
      { source: 'fr.json', locale: 'fr', format: 'json', verbose: true },
      { now },
    );
    expect(result.exitCode).toBe(0);
    expect(now).toHaveBeenCalledTimes(2);
    expect(result.stdout).toContain(`Started at: ${new Date(start).toLocaleTimeString()}\n`);
    expect(result.stdout).toContain(
      `\nCompleted at: ${new Date(end).toLocaleTimeString()}\nElapsed time: 1.23s (1234ms)\n\n📊 Import Results\n`,
    );
    expect(result.stdout.indexOf('Started at:')).toBeGreaterThan(result.stdout.indexOf('Collection: main'));
    expect(result.stdout.indexOf('Import summary written to:')).toBeGreaterThan(
      result.stdout.indexOf('Import completed successfully!'),
    );
  });

  it('does not read the clock or print timing when disabled', async () => {
    const now = vi.fn();
    const command = defineCommand()({
      name: 'Timing',
      collection: 'none',
      run: ({ now }) => {
        const timing = new RunTiming(now, false);
        timing.start();
        timing.complete();
      },
    });
    const result = await project.run(command, {}, { now });
    expect(now).not.toHaveBeenCalled();
    expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '' });
  });
});

function report(input: Partial<ReportedRun> = {}) {
  let stdout = '';
  let stderr = '';
  const result = withCommandOutput(
    {
      sink: {
        stdout: (text) => {
          stdout += text;
        },
        stderr: (text) => {
          stderr += text;
        },
      },
    },
    () => reportRun({ warnings: [], errors: [], outcome: 'succeeded', ...input }),
  );
  return { result, stdout, stderr };
}

const items = (count: number): string[] => Array.from({ length: count }, (_, index) => `item ${index + 1}`);

describe('run report through reportRun', () => {
  let project: CommandProject;
  const summary = () => ({ kind: 'import' as const, text: '# Summary', directory: project.cwd });
  const summaryPath = () => {
    const [name] = readdirSync(project.cwd).filter((name) => name.startsWith('lingo-tracker-'));
    return join(project.cwd, name);
  };
  beforeEach(() => {
    project = createCommandProject();
  });
  afterEach(() => project.cleanup());

  it('prints nothing for empty lists', () => {
    expect(report()).toEqual({ result: undefined, stdout: '', stderr: '' });
  });

  it('prints counts on stdout in order', () => {
    expect(report({ counts: { Files: 2, Resources: 5 } }).stdout).toBe('  Files: 2\n  Resources: 5\n');
  });

  it('prints warnings only, bulleted on stderr', () => {
    const { stderr, stdout, result } = report({ warnings: ['one', 'two'] });
    expect(stderr).toBe('⚠️  Warnings (2):\n  - one\n  - two\n');
    expect(stdout).toBe('');
    expect(result).toBeUndefined();
  });

  it('prints errors only, bulleted on stderr', () => {
    const { stderr, result } = report({ errors: ['boom'], outcome: 'failed' });
    expect(stderr).toBe('❌ Errors (1):\n  - boom\n');
    expect(result).toEqual({ exitCode: 1 });
  });

  it('prints warnings before errors', () => {
    const { stderr } = report({ warnings: ['w'], errors: ['e'], outcome: 'failed' });
    expect(stderr).toBe('⚠️  Warnings (1):\n  - w\n❌ Errors (1):\n  - e\n');
  });

  it('prints a list of exactly ten in full even with a summary path', () => {
    const { stderr } = report({ warnings: items(10), summary: summary() });
    expect(stderr).not.toContain('more');
    expect(stderr).toContain('  - item 10');
  });

  it('caps lists over ten and points at the summary when one was written', () => {
    const { stderr } = report({ warnings: items(12), errors: items(11), outcome: 'failed', summary: summary() });
    expect(stderr).toContain('Warnings (12):');
    expect(stderr).toContain(`  - item 10\n  ... and 2 more (full list in ${summaryPath()})\n`);
    expect(stderr).not.toContain('item 11\n  ... and 2');
    expect(stderr).toContain('Errors (11):');
    expect(stderr).toContain(`  ... and 1 more (full list in ${summaryPath()})\n`);
  });

  it('prints every item without a summary path', () => {
    const { stderr } = report({ errors: items(12), outcome: 'failed' });
    expect(stderr).toContain('  - item 12\n');
    expect(stderr).not.toContain('more');
  });

  it('prints every item in a dry run, which writes no summary file', () => {
    const { stderr } = report({ warnings: items(12), dryRun: true, summary: summary() });
    expect(stderr).toContain('  - item 12\n');
    expect(stderr).not.toContain('more');
  });

  it('returns the exit result for the outcome', () => {
    expect(report({ outcome: 'succeeded' }).result).toBeUndefined();
    expect(report({ outcome: 'failed' }).result).toEqual({ exitCode: 1 });
  });
  it('prints the declared JSON payload byte for byte, with diagnostics still on stderr', () => {
    const payload = { collections: [{ collectionName: 'main', entriesProcessed: 2 }], totals: { entriesProcessed: 2 } };
    const result = report({
      presentation: { kind: 'json', payload },
      counts: { 'Total entries processed': 2 },
      section: 'Summary',
      notice: 'Dry run completed - no changes were made.',
      warnings: ['warning'],
      errors: ['failure'],
      outcome: 'failed',
    });
    expect(result.stdout).toBe(`${JSON.stringify(payload, null, 2)}\n`);
    expect(result.stderr).toBe('⚠️  Warnings (1):\n  - warning\n❌ Errors (1):\n  - failure\n');
    expect(result.result).toEqual({ exitCode: 1 });
  });
  it('counts a multiline failure once and keeps its diagnostic details', () => {
    const result = report({ errors: ['Failure\nCause'], outcome: 'failed' });
    expect(result.stderr).toBe('❌ Errors (1):\n  - Failure\n  Cause\n');
    expect(result.result).toEqual({ exitCode: 1 });
  });
});
