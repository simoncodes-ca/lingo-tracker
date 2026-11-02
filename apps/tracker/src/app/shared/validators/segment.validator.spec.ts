import { FormControl } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import { segmentValidator } from './segment.validator';

describe('segmentValidator', () => {
  it.each(['test123', 'test_key_name', 'test-key-name', 'ABC'])('should accept %s', (value) => {
    expect(segmentValidator(new FormControl(value))).toBeNull();
  });

  it.each(['test/key', 'test key', 'a.b', ...['@', '#', '$', '%', '^', '&', '*', '(', ')'].map((c) => `test${c}key`)])(
    'should reject %s under the pattern error key',
    (value) => {
      expect(segmentValidator(new FormControl(value))).toEqual({ pattern: { actualValue: value } });
    },
  );

  it('should leave an empty value to Validators.required', () => {
    expect(segmentValidator(new FormControl(''))).toBeNull();
    expect(segmentValidator(new FormControl(null))).toBeNull();
  });
});
