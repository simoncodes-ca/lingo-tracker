import { describe, it, expect } from 'vitest';
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
