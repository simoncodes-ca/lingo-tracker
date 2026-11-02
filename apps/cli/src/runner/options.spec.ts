import { describe, expect, it } from 'vitest';
import { option } from './options';

describe('option definitions', () => {
  it('rejects a parser and default value together at definition time', () => {
    expect(() =>
      option({
        flags: '--count <n>',
        parse: (value) => Number(value),
        defaultValue: '5',
      }),
    ).toThrow('A CLI option cannot define both parse and defaultValue.');
  });
});
