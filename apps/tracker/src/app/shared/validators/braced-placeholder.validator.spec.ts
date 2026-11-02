import { FormControl } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import { bracedPlaceholderValidator } from './braced-placeholder.validator';

describe('bracedPlaceholderValidator', () => {
  it('accepts dotted simple arguments and still rejects brace frames under either runtime', () => {
    for (const runtime of ['transloco', 'transloco-messageformat'] as const) {
      expect(bracedPlaceholderValidator(new FormControl('{user.name}'), runtime)).toBeNull();
      expect(
        bracedPlaceholderValidator(new FormControl('{user.name} has {n, plural, other {# items}}'), runtime),
      ).toBeNull();
      expect(bracedPlaceholderValidator(new FormControl('{{{user.name}}}'), runtime)).toEqual({
        bracedPlaceholder: { name: 'user.name', position: 0 },
      });
    }
  });

  it.each([
    'Hello {{name}}',
    '{n, plural, other {{{a}}}}',
    '{n, plural, =1 {{{a}}} other {x}}',
    "'{'{{a}}'}'",
    '{ {{a}} }',
  ])('should accept %s', (value) => {
    expect(bracedPlaceholderValidator(new FormControl(value))).toBeNull();
  });

  it('should report the name and position of the first braced placeholder', () => {
    expect(bracedPlaceholderValidator(new FormControl('x {{{a}}} {{{b}}}'))).toEqual({
      bracedPlaceholder: { name: 'a', position: 2 },
    });
  });

  it('should reject a braced placeholder inside a case body', () => {
    expect(bracedPlaceholderValidator(new FormControl('{n, plural, other {x {{{a}}} y}}'))).toEqual({
      bracedPlaceholder: { name: 'a', position: 21 },
    });
  });

  it('should leave an empty value to Validators.required', () => {
    expect(bracedPlaceholderValidator(new FormControl(''))).toBeNull();
    expect(bracedPlaceholderValidator(new FormControl(null))).toBeNull();
  });
});
