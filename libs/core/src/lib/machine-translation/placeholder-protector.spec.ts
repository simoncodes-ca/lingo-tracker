import { describe, expect, it } from 'vitest';
import { protectPlaceholders, restorePlaceholders } from './placeholder-protector';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the notranslate-wrapped marker used by the implementation. */
function wrappedMarker(index: number): string {
  return `<span class="notranslate">__PH${index}__</span>`;
}

// ---------------------------------------------------------------------------
// protectPlaceholders
// ---------------------------------------------------------------------------

describe('protectPlaceholders', () => {
  it('replaces a single single-brace placeholder with a wrapped marker', () => {
    const { protectedText, placeholders } = protectPlaceholders('Hello {name}');

    expect(protectedText).toBe(`Hello ${wrappedMarker(0)}`);
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0]).toEqual({ original: '{name}', marker: '__PH0__' });
  });

  it('replaces a single double-brace Transloco placeholder with a wrapped marker', () => {
    const { protectedText, placeholders } = protectPlaceholders('Hello {{ name }}');

    expect(protectedText).toBe(`Hello ${wrappedMarker(0)}`);
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0]).toEqual({ original: '{{ name }}', marker: '__PH0__' });
  });

  it('replaces multiple single-brace placeholders in order', () => {
    const { protectedText, placeholders } = protectPlaceholders('File {fileA} is newer than {fileB}');

    expect(protectedText).toBe(`File ${wrappedMarker(0)} is newer than ${wrappedMarker(1)}`);
    expect(placeholders).toHaveLength(2);
    expect(placeholders[0]).toEqual({ original: '{fileA}', marker: '__PH0__' });
    expect(placeholders[1]).toEqual({ original: '{fileB}', marker: '__PH1__' });
  });

  it('replaces a double-brace placeholder with surrounding text', () => {
    const { protectedText, placeholders } = protectPlaceholders('Changed filename to {{ newFileName }}');

    expect(protectedText).toBe(`Changed filename to ${wrappedMarker(0)}`);
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0]).toEqual({ original: '{{ newFileName }}', marker: '__PH0__' });
  });

  it('replaces a mix of single and double-brace placeholders', () => {
    const { protectedText, placeholders } = protectPlaceholders('{a} and {{ b }}');

    expect(protectedText).toBe(`${wrappedMarker(0)} and ${wrappedMarker(1)}`);
    expect(placeholders).toHaveLength(2);
    expect(placeholders[0]).toEqual({ original: '{a}', marker: '__PH0__' });
    expect(placeholders[1]).toEqual({ original: '{{ b }}', marker: '__PH1__' });
  });

  it('returns empty placeholders array and unchanged text for a plain string', () => {
    const { protectedText, placeholders } = protectPlaceholders('Hello world');

    expect(protectedText).toBe('Hello world');
    expect(placeholders).toHaveLength(0);
  });

  it('assigns sequential markers for three or more placeholders', () => {
    const { placeholders } = protectPlaceholders('{a}{b}{c}');

    expect(placeholders.map((p) => p.marker)).toEqual(['__PH0__', '__PH1__', '__PH2__']);
  });

  it('protects and restores quoted literal braces', () => {
    const source = "'{'first'}'";
    const { protectedText, placeholders } = protectPlaceholders(source);

    expect(protectedText).toBe(`${wrappedMarker(0)}first${wrappedMarker(1)}`);
    expect(placeholders).toEqual([
      { original: "'{'", marker: '__PH0__' },
      { original: "'}'", marker: '__PH1__' },
    ]);
    expect(restorePlaceholders(protectedText, placeholders)).toEqual({ success: true, value: source });
  });

  it('protects quoted runs and placeholders in source order', () => {
    const source = "'{'a'}' {b}";
    const { protectedText, placeholders } = protectPlaceholders(source);

    expect(protectedText).toBe(`${wrappedMarker(0)}a${wrappedMarker(1)} ${wrappedMarker(2)}`);
    expect(placeholders.map(({ original }) => original)).toEqual(["'{'", "'}'", '{b}']);
    expect(restorePlaceholders(protectedText, placeholders)).toEqual({ success: true, value: source });
  });

  it('protects a whole quoted run without extracting apparent placeholders inside it', () => {
    const source = "'{a} and {b}' {c}";
    const { protectedText, placeholders } = protectPlaceholders(source);

    expect(protectedText).toBe(`${wrappedMarker(0)} ${wrappedMarker(1)}`);
    expect(placeholders.map(({ original }) => original)).toEqual(["'{a} and {b}'", '{c}']);
    expect(restorePlaceholders(protectedText, placeholders)).toEqual({ success: true, value: source });
  });

  it('restores quoted apostrophes verbatim when the provider mangles apostrophes', () => {
    const { protectedText, placeholders } = protectPlaceholders("It's '{a''b}'");
    for (const translated of [protectedText, protectedText.replace(/<\/?span[^>]*>/g, '')]) {
      expect(restorePlaceholders(translated.replace(/'/g, '’'), placeholders)).toEqual({
        success: true,
        value: "It’s '{a''b}'",
      });
    }
  });

  it('keeps the existing protected text when there are no quoted runs', () => {
    const { protectedText, placeholders } = protectPlaceholders("Don't change {a.b} or {{ count }}; '' stays");

    expect(protectedText).toBe(`Don't change ${wrappedMarker(0)} or ${wrappedMarker(1)}; '' stays`);
    expect(placeholders.map(({ original }) => original)).toEqual(['{a.b}', '{{ count }}']);
  });

  it('rejects a quoted-run marker that the provider dropped or duplicated', () => {
    const { protectedText, placeholders } = protectPlaceholders("'{'first'}'");

    for (const translated of [protectedText.replace(wrappedMarker(0), ''), `${protectedText}${wrappedMarker(0)}`]) {
      expect(restorePlaceholders(translated, placeholders)).toEqual({
        success: false,
        reason: 'marker-count-mismatch',
      });
    }
  });
});

// ---------------------------------------------------------------------------
// restorePlaceholders
// ---------------------------------------------------------------------------

describe('restorePlaceholders', () => {
  it('restores a single placeholder from a plain marker', () => {
    const placeholders = [{ original: '{name}', marker: '__PH0__' }];
    const result = restorePlaceholders('Hallo __PH0__', placeholders);

    expect(result).toEqual({ success: true, value: 'Hallo {name}' });
  });

  it('restores a single placeholder from a wrapped marker', () => {
    const placeholders = [{ original: '{name}', marker: '__PH0__' }];
    const result = restorePlaceholders(`Hallo ${wrappedMarker(0)}`, placeholders);

    expect(result).toEqual({ success: true, value: 'Hallo {name}' });
  });

  it('restores a double-brace placeholder from a plain marker', () => {
    const placeholders = [{ original: '{{ name }}', marker: '__PH0__' }];
    const result = restorePlaceholders('Hallo __PH0__', placeholders);

    expect(result).toEqual({ success: true, value: 'Hallo {{ name }}' });
  });

  it('restores multiple placeholders in order', () => {
    const placeholders = [
      { original: '{fileA}', marker: '__PH0__' },
      { original: '{fileB}', marker: '__PH1__' },
    ];
    const result = restorePlaceholders('Datei __PH0__ ist neuer als __PH1__', placeholders);

    expect(result).toEqual({ success: true, value: 'Datei {fileA} ist neuer als {fileB}' });
  });

  it('returns success for an empty placeholder array (no markers expected)', () => {
    const result = restorePlaceholders('Hallo Welt', []);

    expect(result).toEqual({ success: true, value: 'Hallo Welt' });
  });

  // -------------------------------------------------------------------------
  // Count mismatch detection
  // -------------------------------------------------------------------------

  it('returns failure when a marker is missing from the translated text', () => {
    const placeholders = [{ original: '{name}', marker: '__PH0__' }];
    const result = restorePlaceholders('Hallo', placeholders);

    expect(result).toEqual({ success: false, reason: 'marker-count-mismatch' });
  });

  it('returns failure when all markers are missing from the translated text', () => {
    const placeholders = [
      { original: '{fileA}', marker: '__PH0__' },
      { original: '{fileB}', marker: '__PH1__' },
    ];
    const result = restorePlaceholders('Datei ist neuer als eine andere Datei', placeholders);

    expect(result).toEqual({ success: false, reason: 'marker-count-mismatch' });
  });

  it('returns failure when only some markers survive translation', () => {
    const placeholders = [
      { original: '{fileA}', marker: '__PH0__' },
      { original: '{fileB}', marker: '__PH1__' },
    ];
    // Only __PH0__ made it through — __PH1__ was dropped.
    const result = restorePlaceholders('Datei __PH0__ ist neuer', placeholders);

    expect(result).toEqual({ success: false, reason: 'marker-count-mismatch' });
  });

  it('returns failure when a marker is duplicated and another is dropped', () => {
    const placeholders = [
      { original: '{fileA}', marker: '__PH0__' },
      { original: '{fileB}', marker: '__PH1__' },
    ];
    // __PH0__ appears twice (duplicated) and __PH1__ was dropped.
    // An includes-based check would incorrectly count 2 present markers and pass.
    const result = restorePlaceholders('Datei __PH0__ und __PH0__ ist neuer', placeholders);

    expect(result).toEqual({ success: false, reason: 'marker-count-mismatch' });
  });
});

// Dotted names already use the protector's existing pattern under both runtimes.
describe('dotted simple arguments', () => {
  it('protects an entire dotted argument and restores its exact name', () => {
    const { protectedText, placeholders } = protectPlaceholders('Hello {user.name}');
    expect(protectedText).toBe('Hello <span class="notranslate">__PH0__</span>');
    expect(placeholders).toEqual([{ original: '{user.name}', marker: '__PH0__' }]);
    expect(restorePlaceholders('Bonjour __PH0__', placeholders)).toEqual({
      success: true,
      value: 'Bonjour {user.name}',
    });
  });
});
