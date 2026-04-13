import { describe, it, expect } from 'vitest';
import { makeBaseConfig } from './locale-spec-helpers';

describe('locale-spec-helpers', () => {
  it('makeBaseConfig returns the expected shape', () => {
    const config = makeBaseConfig();
    expect(config).toMatchObject({
      baseLocale: 'en',
      locales: ['en', 'fr'],
      collections: {
        main: {
          translationsFolder: 'src/i18n',
        },
      },
    });
  });
});
