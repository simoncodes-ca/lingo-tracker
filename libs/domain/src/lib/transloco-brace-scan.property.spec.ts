import { parse } from '@messageformat/parser';
import * as fc from 'fast-check';
import { arbitraryMessage, identifier, supportedMessage } from './testing/icu-arbitraries';
import {
  convertTranslocoPlaceholders,
  expandPlaceholderOnlyBranchBodies,
  hasUnbundlableBranchBody,
  maskTranslocoPlaceholders,
} from './transloco-brace-scan';

function stripContext(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripContext);
  if (node !== null && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node)
        .filter(([key]) => key !== 'ctx')
        .map(([key, value]) => [key, stripContext(value)]),
    );
  }
  return node;
}

describe('transloco brace scan properties', () => {
  it('never throws on arbitrary Unicode or brace-heavy strings and keeps mask offsets', () => {
    fc.assert(
      fc.property(arbitraryMessage, (value) => {
        expect(typeof convertTranslocoPlaceholders(value)).toBe('string');
        expect(typeof expandPlaceholderOnlyBranchBodies(value)).toBe('string');
        expect(typeof hasUnbundlableBranchBody(value)).toBe('boolean');
        expect(maskTranslocoPlaceholders(value)).toHaveLength(value.length);
      }),
    );
  });

  it('masks generated interpolations to the same parser structure as conversion', () => {
    fc.assert(
      fc.property(fc.array(identifier, { minLength: 1, maxLength: 6 }), (names) => {
        const input = names.map((name) => `{{ \t${name} }}`).join(' ');
        expect(stripContext(parse(maskTranslocoPlaceholders(input)))).toEqual(
          stripContext(parse(convertTranslocoPlaceholders(input))),
        );
      }),
    );
  });

  it('expands supported branch bodies once, collapses them back and flags none', () => {
    fc.assert(
      fc.property(supportedMessage, (message) => {
        const expanded = expandPlaceholderOnlyBranchBodies(message);
        expect(expandPlaceholderOnlyBranchBodies(expanded)).toBe(expanded);
        expect(convertTranslocoPlaceholders(expanded)).toBe(message);
        expect(hasUnbundlableBranchBody(message)).toBe(false);
      }),
    );
  });
});
