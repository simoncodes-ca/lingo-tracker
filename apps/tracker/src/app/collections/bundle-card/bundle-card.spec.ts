import type { ComponentFixture } from '@angular/core/testing';
import { provideTranslocoMessageformat } from '@jsverse/transloco-messageformat';
import { createComponentFactory, type Spectator } from '@ngneat/spectator/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslocoTestingModule } from '../../../testing/transloco-testing.module';
import type { BundleRunState } from '../store/bundle-runs';
import type { BundleEntry } from '../store/features/with-bundles.feature';
import { BundleCard } from './bundle-card';

const trackerEntry: BundleEntry = {
  name: 'tracker',
  definition: {
    bundleName: '{locale}',
    dist: './apps/tracker/src/assets/i18n',
    collections: [{ name: 'trackerResources', entriesSelectionRules: 'All' }],
    typeDistFile: './apps/tracker/src/i18n-types/tracker-resources.ts',
  },
};

const mainEntry: BundleEntry = {
  name: 'main',
  definition: { bundleName: 'main.{locale}', dist: './dist/i18n/', collections: 'All' },
};

const completedRun: BundleRunState = {
  status: 'completed',
  progress: { current: 2, total: 2 },
  result: {
    filesGenerated: ['apps/tracker/src/assets/i18n/en.json', 'apps/tracker/src/assets/i18n/fr-ca.json'],
    keysPerLocale: { en: 286, 'fr-ca': 280 },
    warnings: [],
    localesProcessed: ['en', 'fr-ca'],
    typeDistFile: 'apps/tracker/src/i18n-types/tracker-resources.ts',
    typesKeysCount: 286,
  },
  finishedAt: new Date().toISOString(),
};

describe('BundleCard', () => {
  let fixture: ComponentFixture<BundleCard>;
  let component: BundleCard;
  let spectator: Spectator<BundleCard>;

  const text = (): string => (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
  const query = <T extends Element>(selector: string): T | null =>
    (fixture.nativeElement as HTMLElement).querySelector<T>(selector);

  const createComponent = createComponentFactory({
    component: BundleCard,
    imports: [getTranslocoTestingModule()],
    providers: [provideTranslocoMessageformat()],
    detectChanges: false,
  });

  beforeEach(() => {
    spectator = createComponent();
    fixture = spectator.fixture;
    component = spectator.component;
    spectator.setInput({
      entry: trackerEntry,
      collectionNames: ['trackerResources'],
      localeCount: 6,
      baseLocale: 'en',
    });
    spectator.detectComponentChanges();
  });

  it('splits the output path around the locale placeholder and adds a trailing slash', () => {
    expect(component.outputPath()).toEqual({
      prefix: './apps/tracker/src/assets/i18n/',
      placeholder: '{locale}',
      suffix: '.json',
    });

    fixture.componentRef.setInput('entry', mainEntry);
    expect(component.outputPath()).toEqual({ prefix: './dist/i18n/main.', placeholder: '{locale}', suffix: '.json' });
  });

  it('renders one chip per collection, or a single "All collections" chip', () => {
    expect(query('.chip')?.textContent).toContain('trackerResources');
    expect(text()).toContain('./apps/tracker/src/i18n-types/tracker-resources.ts');

    fixture.componentRef.setInput('entry', mainEntry);
    fixture.componentRef.setInput('collectionNames', ['a', 'b', 'c', 'd']);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.chip').length).toBe(1);
    expect(text()).toContain('All collections (4)');
    expect(text()).toContain('off');
  });

  it('shows the footer locale count and an enabled Generate button when idle', () => {
    const button = query<HTMLButtonElement>('.card-footer .btn');

    expect(text()).toContain('6 locales');
    expect(button?.getAttribute('aria-disabled')).toBeNull();
    expect(button?.textContent).toContain('Generate');
  });

  it('emits generate on click, but not while a run is in progress', () => {
    const generate = vi.fn();
    component.generate.subscribe(generate);

    query<HTMLButtonElement>('.card-footer .btn')?.click();
    expect(generate).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('run', {
      status: 'running',
      progress: { current: 3, total: 6, currentFile: 'x/fr-ca.json' },
    });
    fixture.detectChanges();
    query<HTMLButtonElement>('.card-footer .btn')?.click();

    expect(generate).toHaveBeenCalledTimes(1);
    expect(query('.card-footer .btn')?.getAttribute('aria-disabled')).toBe('true');
  });

  it('renders the running strip with the current file, progress and bar width', () => {
    fixture.componentRef.setInput('run', {
      status: 'running',
      progress: { current: 3, total: 6, currentFile: 'x/fr-ca.json' },
    });
    fixture.detectChanges();

    const strip = query<HTMLElement>('.result--run');
    expect(strip?.getAttribute('role')).toBe('status');
    expect(strip?.textContent).toContain('fr-ca.json');
    expect(strip?.textContent).toContain('3 of 6 locales');
    expect(query<HTMLElement>('.bar i')?.style.width).toBe('50%');
  });

  it('renders the success strip with base-locale key count and a details disclosure', () => {
    fixture.componentRef.setInput('run', completedRun);
    fixture.detectChanges();

    const strip = query<HTMLElement>('.result--ok');
    expect(strip?.classList.contains('result--warn')).toBe(false);
    expect(strip?.textContent).toContain('2 files');
    expect(strip?.textContent).toContain('286 keys per locale');
    // A clean run is stated by the success tint and check glyph, not by a clause
    // announcing the absence of warnings.
    expect(strip?.textContent).not.toContain('warning');
    expect(strip?.querySelectorAll('.fig').length).toBe(3);
    expect(query('.result-details')).toBeNull();

    query<HTMLButtonElement>('.details-toggle')?.click();
    fixture.detectChanges();

    const details = query<HTMLElement>('.result-details');
    expect(details?.textContent).toContain('fr-ca.json');
    expect(details?.textContent).toContain('280 keys');
    expect(details?.textContent).toContain('tracker-resources.ts');
    expect(query('.details-toggle')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('falls back to the largest locale count when the base locale is unknown', () => {
    fixture.componentRef.setInput('baseLocale', undefined);
    fixture.componentRef.setInput('run', completedRun);

    expect(component.keysPerLocale()).toBe(286);
  });

  it('switches to the amber warning variant and lists warnings when present', () => {
    const run: BundleRunState = {
      ...completedRun,
      result: { ...completedRun.result, warnings: ['Key conflict: a.b'] } as BundleRunState['result'],
    };
    fixture.componentRef.setInput('run', run);
    fixture.detectChanges();

    expect(query('.result--ok')?.classList.contains('result--warn')).toBe(true);
    expect(text()).toContain('1 warning');

    query<HTMLButtonElement>('.details-toggle')?.click();
    fixture.detectChanges();
    expect(query('.details-list--warnings')?.textContent).toContain('Key conflict: a.b');
  });

  it('renders the failed strip with the error and emits retry', () => {
    const retry = vi.fn();
    component.retry.subscribe(retry);
    fixture.componentRef.setInput('run', {
      status: 'failed',
      error: 'Disk full',
      finishedAt: new Date().toISOString(),
    });
    fixture.detectChanges();

    const strip = query<HTMLElement>('.result--failed');
    expect(strip?.textContent).toContain('Generation failed');
    expect(strip?.textContent).toContain('Disk full');

    strip?.querySelector<HTMLButtonElement>('button')?.click();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('reports hover and focus to the parent, ignoring focus moving within the card', () => {
    const hoverChange = vi.fn();
    component.hoverChange.subscribe(hoverChange);
    const host = fixture.nativeElement as HTMLElement;

    host.dispatchEvent(new Event('mouseenter'));
    host.dispatchEvent(new Event('mouseleave'));
    expect(hoverChange.mock.calls.map(([value]) => value)).toEqual([true, false]);

    const inner = host.querySelector('button');
    host.dispatchEvent(new FocusEvent('focusout', { relatedTarget: inner }));
    expect(hoverChange).toHaveBeenCalledTimes(2);

    host.dispatchEvent(new FocusEvent('focusout', { relatedTarget: null }));
    expect(hoverChange).toHaveBeenCalledTimes(3);
    expect(hoverChange).toHaveBeenLastCalledWith(false);
  });

  it('applies the linked class to the host and its chips', () => {
    fixture.componentRef.setInput('linked', true);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).classList.contains('bundle-card--linked')).toBe(true);
    expect(query('.chip')?.classList.contains('chip--linked')).toBe(true);
  });
});
