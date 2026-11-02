import { describe, expect, it, vi } from 'vitest';

vi.mock('@simoncodes-ca/core', () => {
  throw new Error('CLI metadata must not load core');
});

describe('CLI metadata startup', () => {
  it('imports every flag module and generates help without loading core', async () => {
    const { createCli } = await import('./program');
    const { commandManifest } = await import('./command-manifest');
    const program = createCli();
    expect(program.commands).toHaveLength(commandManifest.length);
    for (const command of [program, ...program.commands]) {
      expect(command.helpInformation()).toContain('Usage:');
    }
  });
});
