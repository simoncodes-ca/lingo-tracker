import { createComponentFactory, type Spectator } from '@ngneat/spectator/vitest';
import type { PreferredTermFinding } from '@simoncodes-ca/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslocoTestingModule } from '../../../../../testing/transloco-testing.module';
import { PreferredTermAdvisories } from './preferred-term-advisories';

describe('PreferredTermAdvisories', () => {
  let spectator: Spectator<PreferredTermAdvisories>;

  const findings: PreferredTermFinding[] = [
    {
      rule: { discouraged: 'Expenditure', preferred: 'Investment', reason: 'Former financial-planning term.' },
      ranges: [{ start: 0, end: 11 }],
    },
    { rule: { discouraged: 'Custom Field', preferred: 'Configurable Field' }, ranges: [{ start: 16, end: 28 }] },
  ];

  const createComponent = createComponentFactory({
    component: PreferredTermAdvisories,
    imports: [getTranslocoTestingModule()],
    detectChanges: false,
  });

  beforeEach(() => {
    spectator = createComponent({ props: { findings, advisoryId: 'advice' } });
    spectator.detectChanges();
  });

  it('should stamp the id the field describes itself with', () => {
    expect(spectator.query('#advice')).not.toBeNull();
  });

  it('should render one advisory per finding with the configured copy', () => {
    const items = spectator.queryAll('[data-testid="preferred-term-advisory"]');

    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Preferred terminology: consider “Investment” instead of “Expenditure”.');
    expect(items[0].textContent).toContain('Former financial-planning term.');
    expect(items[1].querySelector('[data-testid="preferred-term-reason"]')).toBeNull();
  });

  it('should name each button after its preferred term', () => {
    const labels = spectator
      .queryAll<HTMLButtonElement>('[data-testid="preferred-term-use"]')
      .map((button) => button.textContent?.trim());

    expect(labels).toEqual(['Use “Investment”', 'Use “Configurable Field”']);
  });

  it('should emit the rule when Use is clicked', () => {
    const applied = vi.fn();
    spectator.output('applyRule').subscribe(applied);

    spectator.click(spectator.queryAll('[data-testid="preferred-term-use"]')[1]);

    expect(applied).toHaveBeenCalledWith(findings[1].rule);
  });

  it('should hide Use when read-only', () => {
    spectator.setInput('readOnly', true);
    spectator.detectChanges();

    expect(spectator.query('[data-testid="preferred-term-use"]')).toBeNull();
    expect(spectator.queryAll('[data-testid="preferred-term-advisory"]')).toHaveLength(2);
  });
});
