import { describe, expect, it } from 'vitest';
import { JOB_RETENTION_MS } from './index';

describe('job retention public export', () => {
  it('exports the shared thirty-minute job retention window', () => {
    expect(JOB_RETENTION_MS).toBe(30 * 60 * 1000);
  });
});
