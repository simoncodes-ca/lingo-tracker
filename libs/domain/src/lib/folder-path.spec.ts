import { describe, expect, it } from 'vitest';
import { isDescendantFolderPath } from './folder-path';

describe('isDescendantFolderPath', () => {
  it('includes immediate and deeply nested descendants', () => {
    expect(isDescendantFolderPath('apps.buttons', 'apps.buttons.child')).toBe(true);
    expect(isDescendantFolderPath('apps', 'apps.buttons.child')).toBe(true);
  });

  it('excludes the source itself and its ancestors', () => {
    expect(isDescendantFolderPath('apps.buttons', 'apps.buttons')).toBe(false);
    expect(isDescendantFolderPath('apps.buttons', 'apps')).toBe(false);
    expect(isDescendantFolderPath('apps.buttons', '')).toBe(false);
  });

  it('requires a segment boundary and excludes unrelated paths', () => {
    expect(isDescendantFolderPath('apps', 'appsExtra.buttons')).toBe(false);
    expect(isDescendantFolderPath('apps.buttons', 'apps.buttonsExtra.child')).toBe(false);
    expect(isDescendantFolderPath('apps.buttons', 'shared.buttons.child')).toBe(false);
  });

  it('treats every non-root folder as a descendant of the root', () => {
    expect(isDescendantFolderPath('', 'apps')).toBe(true);
    expect(isDescendantFolderPath('', 'apps.buttons')).toBe(true);
    expect(isDescendantFolderPath('', '')).toBe(false);
  });
});
