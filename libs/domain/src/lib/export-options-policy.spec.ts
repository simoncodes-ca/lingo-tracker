import { describe, expect, it } from 'vitest';
import { DEFAULT_EXPORT_BASE_PROPERTY_NAME } from './export-defaults';
import { exportOptionsPolicy as policy } from './export-options-policy';
import { NEEDS_WORK_STATUSES } from './translation-status';

describe('Export Options Policy', () => {
  it('preserves shared defaults and distinguishes format preselection from resolution', () => {
    expect(policy.defaults).toEqual({
      statuses: ['new', 'stale'],
      structure: 'hierarchical',
      basePropertyName: DEFAULT_EXPORT_BASE_PROPERTY_NAME,
      rich: false,
      includeBase: false,
      includeStatus: false,
      includeComment: false,
      includeTags: false,
      protectNotes: true,
    });
    expect(policy.defaults.statuses).toEqual(NEEDS_WORK_STATUSES);
    expect(policy.initialFormat).toBe('xliff');
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.defaults)).toBe(true);
    expect(policy.statusOrder).toEqual(['new', 'stale', 'translated', 'verified']);
  });

  it('identifies JSON and rich JSON directly', () => {
    expect(policy.isJson({ format: 'json' })).toBe(true);
    expect(policy.isJson({ format: 'json', rich: false })).toBe(true);
    expect(policy.isRichJson({ format: 'json', rich: true })).toBe(true);
    expect(policy.isRichJson({ format: 'json', rich: false })).toBe(false);
    expect(policy.isRichJson({ format: 'json' })).toBe(false);
    for (const format of [undefined, 'xliff', 'JSON', '']) {
      expect(policy.isJson({ format })).toBe(false);
      expect(policy.isRichJson({ format, rich: true })).toBe(false);
    }
  });

  it('keeps the base-property question applicable to JSON with include-base regardless of rich', () => {
    for (const rich of [undefined, false, true]) {
      expect(policy.isApplicable('basePropertyName', { format: 'json', includeBase: true, rich })).toBe(true);
      expect(policy.isApplicable('basePropertyName', { format: 'json', includeBase: false, rich })).toBe(false);
      expect(policy.isApplicable('basePropertyName', { format: 'json', rich })).toBe(false);
      expect(policy.isApplicable('basePropertyName', { format: 'xliff', includeBase: true, rich })).toBe(false);
      expect(policy.isApplicable('basePropertyName', { includeBase: true, rich })).toBe(false);
    }
  });

  it('accepts exactly the supported formats and structures', () => {
    for (const value of ['xliff', 'json']) expect(policy.isFormat(value)).toBe(true);
    for (const value of ['flat', 'hierarchical']) expect(policy.isJsonStructure(value)).toBe(true);
    for (const value of [undefined, null, '', 'JSON', 'xlf', 0, {}, []]) expect(policy.isFormat(value)).toBe(false);
    for (const value of [undefined, null, '', 'nested', 'Flat', 0, {}, []])
      expect(policy.isJsonStructure(value)).toBe(false);
  });

  it('permits plain JSON options without rich and requires rich for metadata', () => {
    for (const option of ['structure', 'rich'] as const) {
      expect(policy.isApplicable(option, { format: 'json' })).toBe(true);
      expect(policy.advisory(option, { format: 'json' })).toBeUndefined();
    }
    for (const option of ['includeBase', 'includeStatus', 'includeComment', 'includeTags'] as const) {
      expect(policy.advisory(option, { format: 'json' })).toEqual({ reason: 'needs-rich' });
      expect(policy.advisory(option, { format: 'json', rich: true })).toBeUndefined();
    }
  });

  it('returns presentation-free reasons for XLIFF and missing formats', () => {
    for (const option of [
      'structure',
      'rich',
      'includeBase',
      'includeStatus',
      'includeComment',
      'includeTags',
    ] as const) {
      expect(policy.advisory(option, { format: 'xliff', rich: true })).toEqual({ reason: 'xliff' });
      expect(policy.advisory(option, { rich: true })).toEqual({ reason: 'json-only' });
    }
  });

  it('preserves base-property advisory precedence and empty-value suppression', () => {
    expect(policy.advisory('basePropertyName', {})).toBeUndefined();
    expect(policy.advisory('basePropertyName', { basePropertyName: '' })).toBeUndefined();
    expect(policy.advisory('basePropertyName', { basePropertyName: 'source', format: 'xliff' })).toEqual({
      reason: 'needs-base',
    });
    expect(
      policy.advisory('basePropertyName', { basePropertyName: 'source', includeBase: true, format: 'json' }),
    ).toEqual({ reason: 'needs-rich' });
    expect(
      policy.advisory('basePropertyName', { basePropertyName: 'source', includeBase: true, format: 'xliff' }),
    ).toEqual({ reason: 'xliff' });
    expect(policy.advisory('basePropertyName', { basePropertyName: 'source', includeBase: true })).toEqual({
      reason: 'json-only',
    });
    expect(
      policy.advisory('basePropertyName', {
        basePropertyName: 'source',
        includeBase: true,
        format: 'json',
        rich: true,
      }),
    ).toBeUndefined();
  });
});
