import {
  createComponentFactory,
  createHostFactory,
  type Spectator,
  type SpectatorHost,
} from '@ngneat/spectator/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RunResultStrip } from './run-result-strip';
import type { RunResultView } from './run-result-view';

type RunningView = Extract<RunResultView, { status: 'running' }>;
type CompletedView = Extract<RunResultView, { status: 'completed' }>;
type FailedView = Extract<RunResultView, { status: 'failed' }>;

const runningView = (fields: Partial<Omit<RunningView, 'status'>> = {}): RunningView => ({
  headline: 'Exporting…',
  currentItemLabel: 'Writing',
  currentItem: 'de.xliff',
  progress: { current: 2, total: 4 },
  progressLabel: '2 of 4 locales',
  ...fields,
  status: 'running',
});
const completedView = (fields: Partial<Omit<CompletedView, 'status'>> = {}): CompletedView => ({
  headline: 'Exported',
  clauses: ['4 files', '612 entries'],
  detailsLabel: 'Details',
  detailsAriaLabel: 'Details of export',
  dismissAriaLabel: 'Dismiss export result',
  ...fields,
  status: 'completed',
});
const failedView = (fields: Partial<Omit<FailedView, 'status'>> = {}): FailedView => ({
  headline: 'Export failed',
  error: "Output directory '/srv/locked' is not writable.",
  retryLabel: 'Retry',
  ...fields,
  status: 'failed',
});

describe('RunResultStrip', () => {
  let spectator: Spectator<RunResultStrip>;

  const createComponent = createComponentFactory({ component: RunResultStrip, detectChanges: false });

  const strip = (): HTMLElement | null => spectator.query<HTMLElement>('.result');
  const click = (selector: string): void => {
    spectator.click(selector);
  };

  const setStrip = (view: RunResultView, controls: { detailsOpen?: boolean; detailsId?: string } = {}): void => {
    spectator.setInput({ view, detailsOpen: controls.detailsOpen ?? false, detailsId: controls.detailsId });
  };

  beforeEach(() => {
    spectator = createComponent({ props: { view: { status: 'running', headline: 'Exporting…' } } });
  });

  describe('running', () => {
    beforeEach(() => {
      setStrip(runningView());
      spectator.detectChanges();
    });

    it('renders the headline, current item and progress clause as separated figures', () => {
      expect(strip()?.classList.contains('result--run')).toBe(true);
      expect(spectator.queryAll('.fig').map((el) => el.textContent?.trim())).toEqual([
        'Exporting…',
        'Writing de.xliff',
        '2 of 4 locales',
      ]);
      expect(spectator.query('.fig code.mono')?.textContent).toBe('de.xliff');
    });

    it('announces politely and sizes the bar from the progress', () => {
      expect(strip()?.getAttribute('role')).toBe('status');
      expect(strip()?.getAttribute('aria-live')).toBe('polite');
      expect(spectator.query<HTMLElement>('.bar i')?.style.width).toBe('50%');
    });

    it('omits the current item and progress clause when they are not given', () => {
      setStrip(runningView({ currentItem: undefined, progressLabel: undefined, progress: undefined }));

      expect(spectator.queryAll('.fig').length).toBe(1);
      expect(spectator.query<HTMLElement>('.bar i')?.style.width).toBe('0%');
    });

    it('clamps the bar at 100%', () => {
      setStrip(runningView({ progress: { current: 9, total: 4 } }));

      expect(spectator.query<HTMLElement>('.bar i')?.style.width).toBe('100%');
    });
  });

  describe('completed', () => {
    beforeEach(() => {
      setStrip(completedView(), { detailsId: 'details-1' });
      spectator.detectChanges();
    });

    it('renders the headline and each clause with the success tint and a status role', () => {
      expect(strip()?.classList.contains('result--ok')).toBe(true);
      expect(strip()?.classList.contains('result--warn')).toBe(false);
      expect(strip()?.getAttribute('role')).toBe('status');
      expect(strip()?.hasAttribute('aria-live')).toBe(false);
      expect(spectator.queryAll('.fig').map((el) => el.textContent?.trim())).toEqual([
        'Exported',
        '4 files',
        '612 entries',
      ]);
      expect(spectator.query('mat-icon')?.textContent?.trim()).toBe('check_circle');
    });

    it('switches to the warning tint and glyph when there are warnings', () => {
      setStrip(completedView({ warningsCount: 2, clauses: ['4 files', '2 warnings'] }));

      expect(strip()?.classList.contains('result--ok')).toBe(true);
      expect(strip()?.classList.contains('result--warn')).toBe(true);
      expect(spectator.query('mat-icon')?.textContent?.trim()).toBe('warning');
    });

    it('wires the details toggle with its ARIA state and emits detailsToggle', () => {
      const detailsToggle = vi.fn();
      spectator.output('detailsToggle').subscribe(detailsToggle);

      const toggle = spectator.query<HTMLButtonElement>('.details-toggle');
      expect(toggle?.textContent).toContain('Details');
      expect(toggle?.getAttribute('aria-expanded')).toBe('false');
      expect(toggle?.getAttribute('aria-controls')).toBe('details-1');
      expect(toggle?.getAttribute('aria-label')).toBe('Details of export');

      click('.details-toggle');

      expect(detailsToggle).toHaveBeenCalledTimes(1);
    });

    it('emits dismiss from a labelled button', () => {
      const dismiss = vi.fn();
      spectator.output('dismiss').subscribe(dismiss);

      expect(spectator.query('.dismiss')?.getAttribute('aria-label')).toBe('Dismiss export result');
      click('.dismiss');

      expect(dismiss).toHaveBeenCalledTimes(1);
    });

    it('reflects detailsOpen on the strip, the toggle and the panel id', () => {
      setStrip(completedView(), { detailsOpen: true, detailsId: 'details-1' });

      expect(strip()?.classList.contains('result--open')).toBe(true);
      expect(spectator.query('.details-toggle')?.getAttribute('aria-expanded')).toBe('true');
      expect(spectator.query('.result-details')?.getAttribute('id')).toBe('details-1');
    });

    it('does not render the details panel while closed', () => {
      expect(spectator.query('.result-details')).toBeNull();
    });
  });

  describe('failed', () => {
    beforeEach(() => {
      setStrip(failedView());
      spectator.detectChanges();
    });

    it('is an alert showing the headline and the error as prose', () => {
      expect(strip()?.classList.contains('result--failed')).toBe(true);
      expect(strip()?.getAttribute('role')).toBe('alert');
      expect(spectator.query('.fig b')?.textContent).toBe('Export failed');
      expect(spectator.query('.fig--prose')?.textContent).toContain('is not writable');
    });

    it('emits retry from the retry button', () => {
      const retry = vi.fn();
      spectator.output('retry').subscribe(retry);

      expect(spectator.query('button')?.textContent?.trim()).toBe('Retry');
      click('button');

      expect(retry).toHaveBeenCalledTimes(1);
    });

    it('omits the prose clause when there is no error', () => {
      setStrip(failedView({ error: undefined }));

      expect(spectator.query('.fig--prose')).toBeNull();
    });

    it('is Retry-only unless Details and Dismiss are named', () => {
      expect(spectator.query('.details-toggle')).toBeNull();
      expect(spectator.query('.dismiss')).toBeNull();
      expect(spectator.queryAll('button').length).toBe(1);
    });

    it('opts in to Dismiss and Details with their labels and emits both outputs', () => {
      const dismiss = vi.fn();
      const detailsToggle = vi.fn();
      spectator.output('dismiss').subscribe(dismiss);
      spectator.output('detailsToggle').subscribe(detailsToggle);
      setStrip(failedView({ detailsLabel: 'Details', dismissAriaLabel: 'Dismiss' }), { detailsId: 'fail-details' });

      expect(spectator.query('.details-toggle')?.getAttribute('aria-controls')).toBe('fail-details');
      click('.details-toggle');
      click('.dismiss');

      expect(detailsToggle).toHaveBeenCalledTimes(1);
      expect(dismiss).toHaveBeenCalledTimes(1);
    });

    it('shows the projected panel on failure only when details are open', () => {
      setStrip(failedView({ detailsLabel: 'Details' }), { detailsId: 'fail-details', detailsOpen: true });

      expect(spectator.query('.result-details')?.getAttribute('id')).toBe('fail-details');
      expect(strip()?.getAttribute('role')).toBe('alert');
    });
  });

  describe('typed clauses', () => {
    beforeEach(() => {
      setStrip(
        completedView({
          clauses: ['3 files', { text: 'XLIFF', kind: 'text' }, { text: 'dist/lingo-export_v2.1', kind: 'mono' }],
          detailsLabel: undefined,
          detailsAriaLabel: undefined,
          dismissAriaLabel: undefined,
        }),
      );
      spectator.detectChanges();
    });

    it('renders plain strings and figures as numerals and text kind without them', () => {
      const figs = spectator.queryAll('.fig');

      expect(figs[1].classList.contains('num')).toBe(true);
      expect(figs[2].textContent?.trim()).toBe('XLIFF');
      expect(figs[2].classList.contains('num')).toBe(false);
    });

    it('splits a mono clause after separators with a wbr between the parts', () => {
      const mono = spectator.query('.fig--mono code.mono');

      expect(mono?.textContent).toBe('dist/lingo-export_v2.1');
      expect(Array.from(mono?.querySelectorAll('span') ?? []).map((el) => el.textContent)).toEqual([
        'dist/',
        'lingo-',
        'export_',
        'v2.',
        '1',
      ]);
      expect(mono?.querySelectorAll('wbr').length).toBe(5);
    });
  });

  describe('minimal configuration', () => {
    it('renders no unnamed buttons for any status', () => {
      for (const status of ['running', 'completed', 'failed'] as const) {
        setStrip({ status, headline: 'Working' });

        expect(spectator.queryAll('button').length).toBe(0);
        expect(spectator.query('.result-controls')).toBeNull();
      }
    });
  });
});

describe('RunResultStrip details projection', () => {
  let spectator: SpectatorHost<RunResultStrip>;

  const createHost = createHostFactory({ component: RunResultStrip });

  const template = (open: boolean): string => `
    <app-run-result-strip [view]="{ status: 'completed', headline: 'Exported', detailsLabel: 'Details' }" detailsId="d" [detailsOpen]="${open}">
      <p class="projected">Files written</p>
    </app-run-result-strip>`;

  it('renders projected content inside the details panel when open', () => {
    spectator = createHost(template(true));

    expect(spectator.query('.result-details .projected')?.textContent).toBe('Files written');
  });

  it('does not attach projected content while closed', () => {
    spectator = createHost(template(false));

    expect(spectator.query('.projected')).toBeNull();
  });
});
