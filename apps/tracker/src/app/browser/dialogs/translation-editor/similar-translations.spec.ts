import { createComponentFactory, type Spectator } from '@ngneat/spectator/vitest';
import type { SearchResultDto } from '@simoncodes-ca/data-transfer';
import { beforeEach, describe, expect, it } from 'vitest';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing.module';
import { SimilarTranslations } from './similar-translations';

describe('SimilarTranslations', () => {
  let spectator: Spectator<SimilarTranslations>;

  const hit = (fullKey: string, value: string, similarity?: number): SearchResultDto => {
    const segments = fullKey.split('.');
    const entryKey = segments.pop() ?? '';
    return {
      fullKey,
      folderPath: segments.join('.'),
      entryKey,
      base: { locale: 'en', value },
      targets: [],
      tags: [],
      inheritedTags: [],
      matchType: 'similar-value',
      ...(similarity === undefined ? {} : { similarity }),
    };
  };

  const createComponent = createComponentFactory({
    component: SimilarTranslations,
    imports: [getTranslocoTestingModule()],
    detectChanges: false,
  });

  const chips = () => spectator.queryAll('[data-testid="similar-similarity"]');

  beforeEach(() => {
    spectator = createComponent({ props: { results: [], hasSearchQuery: true } });
  });

  it('should show each similarity as a rounded percentage with a screen-reader label', () => {
    spectator.setInput('results', [hit('common.save', 'Save', 1), hit('common.saveDraft', 'Save draft', 0.4049)]);
    spectator.detectChanges();

    const rendered = chips();
    expect(rendered).toHaveLength(2);
    expect(rendered[0].querySelector('[aria-hidden="true"]')?.textContent?.trim()).toBe('100%');
    expect(rendered[1].querySelector('[aria-hidden="true"]')?.textContent?.trim()).toBe('40%');
    expect(rendered[1].querySelector('.sr-only')?.textContent?.trim()).toBe('40% similar');
  });

  it('should show 0% for a similarity of 0, not hide it', () => {
    spectator.setInput('results', [hit('common.save', 'Save', 0)]);
    spectator.detectChanges();

    const rendered = chips();
    expect(rendered).toHaveLength(1);
    expect(rendered[0].querySelector('[aria-hidden="true"]')?.textContent?.trim()).toBe('0%');
    expect(rendered[0].querySelector('.sr-only')?.textContent?.trim()).toBe('0% similar');
  });

  it('should show no percentage for a hit without similarity', () => {
    spectator.setInput('results', [hit('common.save', 'Save'), hit('common.saveDraft', 'Save draft', 0.8)]);
    spectator.detectChanges();

    const rows = spectator.queryAll('.result-item');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('[data-testid="similar-similarity"]')).toBeNull();
    expect(rows[1].querySelector('[data-testid="similar-similarity"]')?.textContent).toContain('80%');
    expect(rows[0].textContent).not.toContain('%');
  });
});
