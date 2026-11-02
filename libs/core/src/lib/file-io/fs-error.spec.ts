import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { hasFsErrorCode } from './fs-error';

describe('hasFsErrorCode', () => {
  it('recognizes a real filesystem error', () => {
    expect.assertions(1);
    try {
      readFileSync(join(__dirname, 'fs-error.ts', 'missing'));
    } catch (error) {
      expect(hasFsErrorCode(error, 'ENOTDIR')).toBe(true);
    }
  });

  it('recognizes a plain object with the requested code', () => {
    expect(hasFsErrorCode({ code: 'EEXIST' }, 'EEXIST')).toBe(true);
  });

  it('recognizes an error from another VM realm', () => {
    const error: unknown = runInNewContext("Object.assign(new Error('Missing file'), { code: 'ENOENT' })");
    expect(error instanceof Error).toBe(false);
    expect(hasFsErrorCode(error, 'ENOENT')).toBe(true);
  });

  it('rejects a different code', () => {
    expect(hasFsErrorCode({ code: 'EACCES' }, 'ENOENT')).toBe(false);
  });

  it('rejects an object without a code', () => {
    expect(hasFsErrorCode(new Error('Missing code'), 'ENOENT')).toBe(false);
  });

  it.each([null, undefined, 'ENOENT'])('rejects %s', (error) => {
    expect(hasFsErrorCode(error, 'ENOENT')).toBe(false);
  });
});
