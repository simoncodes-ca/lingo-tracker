import { describe, expect, it } from 'vitest';
import { isJavaScriptReservedWord, isValidJavaScriptIdentifier, validateJavaScriptIdentifier } from './js-identifier';

describe('isJavaScriptReservedWord', () => {
  it('flags ES and TypeScript keywords', () => {
    for (const word of ['class', 'const', 'type', 'interface', 'await', 'satisfies']) {
      expect(isJavaScriptReservedWord(word)).toBe(true);
    }
  });

  it('flags globals that should not be shadowed', () => {
    expect(isJavaScriptReservedWord('undefined')).toBe(true);
    expect(isJavaScriptReservedWord('NaN')).toBe(true);
  });

  it('is case sensitive and leaves ordinary names alone', () => {
    expect(isJavaScriptReservedWord('Type')).toBe(false);
    expect(isJavaScriptReservedWord('MY_TOKENS')).toBe(false);
  });
});

describe('isValidJavaScriptIdentifier', () => {
  it('accepts any casing convention', () => {
    for (const name of ['MY_KEYS', 'myKeys', 'MyKeys', '_internal', '$tokens', 'a1']) {
      expect(isValidJavaScriptIdentifier(name)).toBe(true);
    }
  });

  it('rejects empty and malformed names', () => {
    for (const name of ['', '1bad', 'my-key', 'my key', 'ünïcode']) {
      expect(isValidJavaScriptIdentifier(name)).toBe(false);
    }
  });

  it('rejects reserved words even though they match the character pattern', () => {
    expect(isValidJavaScriptIdentifier('type')).toBe(false);
    expect(isValidJavaScriptIdentifier('typeTokens')).toBe(true);
  });
});

describe('validateJavaScriptIdentifier', () => {
  it('should return undefined for a valid SCREAMING_SNAKE_CASE identifier', () => {
    expect(validateJavaScriptIdentifier('MY_TOKENS')).toBeUndefined();
  });

  it('should return undefined for a valid camelCase identifier', () => {
    expect(validateJavaScriptIdentifier('myTokens')).toBeUndefined();
  });

  it('should return undefined for a valid PascalCase identifier', () => {
    expect(validateJavaScriptIdentifier('MyTokens')).toBeUndefined();
  });

  it('should return undefined for an identifier starting with underscore', () => {
    expect(validateJavaScriptIdentifier('_tokens')).toBeUndefined();
  });

  it('should return undefined for an identifier starting with dollar sign', () => {
    expect(validateJavaScriptIdentifier('$tokens')).toBeUndefined();
  });

  it('should return an error for an empty string', () => {
    expect(validateJavaScriptIdentifier('')).toMatch(/must not be empty/);
  });

  it('should return an error for an identifier starting with a digit', () => {
    expect(validateJavaScriptIdentifier('1bad')).toMatch(/must start with a letter/);
  });

  it('should return an error for an identifier containing a hyphen', () => {
    expect(validateJavaScriptIdentifier('my-key')).toMatch(/may only contain/);
  });

  it('should return an error for an identifier containing a space', () => {
    expect(validateJavaScriptIdentifier('my key')).toMatch(/may only contain/);
  });

  it('should return an error for a JS reserved word', () => {
    expect(validateJavaScriptIdentifier('class')).toMatch(/reserved word/);
  });

  it('should return an error for the reserved word "const"', () => {
    expect(validateJavaScriptIdentifier('const')).toMatch(/reserved word/);
  });

  it('should return an error for the TypeScript keyword "async"', () => {
    expect(validateJavaScriptIdentifier('async')).toMatch(/reserved word/);
  });

  it('should return an error for the TypeScript keyword "type"', () => {
    expect(validateJavaScriptIdentifier('type')).toMatch(/reserved word/);
  });

  it('should return an error for the TypeScript keyword "declare"', () => {
    expect(validateJavaScriptIdentifier('declare')).toMatch(/reserved word/);
  });
});
