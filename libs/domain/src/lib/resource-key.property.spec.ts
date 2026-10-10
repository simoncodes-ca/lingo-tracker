import * as fc from 'fast-check';
import {
  isValidSegment,
  resolveResourceKey,
  splitResolvedKey,
  validateKey,
  validateTargetFolder,
} from './resource-key';
import { isKeyTooLong, validateImportKey } from './validation-utils';

const segment = fc
  .array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'), {
    minLength: 1,
    maxLength: 20,
  })
  .map((characters) => characters.join(''));
const segments = fc.array(segment, { minLength: 1, maxLength: 6 });

function expectRejected(key: string): void {
  expect(() => validateKey(key)).toThrow();
  expect(() => validateImportKey(key)).toThrow();
}

describe('resource key properties', () => {
  it('accepts valid segments and preserves parse/join and folder resolution round trips', () => {
    fc.assert(
      fc.property(segments, fc.array(segment, { maxLength: 4 }), (parts, folder) => {
        const key = parts.join('.');
        const path = folder.join('.');
        for (const part of parts) expect(isValidSegment(part)).toBe(true);
        expect(() => validateKey(key)).not.toThrow();
        expect(() => validateImportKey(key)).not.toThrow();
        expect(() => validateTargetFolder(path)).not.toThrow();
        const split = splitResolvedKey(key);
        expect(split.segments).toEqual(parts);
        expect(resolveResourceKey(split.entryKey, split.folderPath.join('.'))).toBe(key);
        expect(splitResolvedKey(resolveResourceKey(key, path)).segments).toEqual([...folder, ...parts]);
      }),
    );
  });

  it('rejects empty keys, empty segments and leading or trailing dots', () => {
    fc.assert(
      fc.property(segments, (parts) => {
        const key = parts.join('.');
        for (const malformed of ['', `.${key}`, `${key}.`, `${key}..leaf`]) expectRejected(malformed);
        expect(() => validateKey(`${key}..leaf`, { allowConsecutiveDots: true })).toThrow('Invalid key segment');
        expect(() => validateKey(`.${key}`, { allowLeadingTrailingDots: true })).toThrow('Invalid key segment');
      }),
    );
  });

  it('rejects whitespace and non-ASCII characters within otherwise valid keys', () => {
    fc.assert(
      fc.property(
        segments,
        fc.constantFrom(' ', '\t', '\n', '\r', '\u00a0', 'é', '中', '🙂', '\u200b'),
        (parts, invalid) => {
          expectRejected(`${parts.join('.')}${invalid}`);
          expect(isValidSegment(`valid${invalid}`)).toBe(false);
          expect(() => validateTargetFolder(`valid${invalid}`)).toThrow();
        },
      ),
    );
  });

  it('accepts long keys and reports length over 200 as a warning', () => {
    fc.assert(
      fc.property(segment, fc.integer({ min: 190, max: 1000 }), (part, length) => {
        const key = part.repeat(Math.ceil(length / part.length)).slice(0, length);
        expect(() => validateKey(key)).not.toThrow();
        expect(() => validateImportKey(key)).not.toThrow();
        expect(isKeyTooLong(key)).toBe(length > 200);
      }),
    );
    expect(isKeyTooLong('a'.repeat(200))).toBe(false);
    expect(isKeyTooLong('a'.repeat(201))).toBe(true);
  });

  it('accepts prototype-related segments as ordinary names without changing their spelling', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('__proto__', 'constructor', 'prototype'), {
          minLength: 1,
          maxLength: 5,
        }),
        (parts) => {
          const key = parts.join('.');
          expect(() => validateKey(key)).not.toThrow();
          expect(() => validateImportKey(key)).not.toThrow();
          expect(() => validateTargetFolder(key)).not.toThrow();
          expect(splitResolvedKey(key).segments).toEqual(parts);
        },
      ),
    );
    expect(splitResolvedKey('__proto__.constructor.prototype')).toEqual({
      segments: ['__proto__', 'constructor', 'prototype'],
      folderPath: ['__proto__', 'constructor'],
      entryKey: 'prototype',
    });
  });
});
