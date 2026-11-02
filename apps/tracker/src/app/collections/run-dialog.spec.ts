import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { launchRunDialog, restoreRunFocus } from './run-dialog';

describe('run dialog focus', () => {
  let host: HTMLElement;
  let trigger: HTMLButtonElement;
  let strip: HTMLElement;
  let heading: HTMLElement;

  beforeEach(() => {
    host = document.createElement('section');
    host.innerHTML =
      '<button>Launch</button><div data-testid="export-strip" tabindex="-1"></div><h2 id="collections-heading" tabindex="-1">Collections</h2>';
    document.body.append(host);
    const button = host.querySelector('button');
    const result = host.querySelector<HTMLElement>('[data-testid="export-strip"]');
    const title = host.querySelector<HTMLElement>('h2');
    if (!button || !result || !title) throw new Error('Missing test fixture');
    trigger = button;
    strip = result;
    heading = title;
  });
  afterEach(() => host.remove());

  it('returns focus to a usable trigger before considering fallbacks', () => {
    restoreRunFocus(host, trigger, 'export-strip');
    expect(document.activeElement).toBe(trigger);
  });

  it.each(['disabled', 'aria-disabled', 'detached', 'body', 'tabindex', 'missing'])(
    'falls back to the strip for a %s trigger',
    (kind) => {
      let target: HTMLElement | null = trigger;
      if (kind === 'disabled') trigger.disabled = true;
      if (kind === 'aria-disabled') trigger.setAttribute('aria-disabled', 'true');
      if (kind === 'detached') trigger.remove();
      if (kind === 'body') target = document.body;
      if (kind === 'tabindex') trigger.tabIndex = -2;
      if (kind === 'missing') target = null;
      restoreRunFocus(host, target, 'export-strip');
      expect(document.activeElement).toBe(strip);
    },
  );

  it('falls back to the heading when the strip is missing', () => {
    strip.remove();
    restoreRunFocus(host, null, 'export-strip');
    expect(document.activeElement).toBe(heading);
  });

  it('skips an aria-disabled strip', () => {
    strip.setAttribute('aria-disabled', 'true');
    restoreRunFocus(host, null, 'export-strip');
    expect(document.activeElement).toBe(heading);
  });

  it('does nothing when no target is usable', () => {
    strip.remove();
    heading.remove();
    trigger.focus();
    restoreRunFocus(host, null, 'export-strip');
    expect(document.activeElement).toBe(trigger);
  });

  it.each(['export', 'import'] as const)(
    'captures focus before lazy-loading the %s dialog and restores after close',
    async (kind) => {
      strip.dataset['testid'] = `${kind}-strip`;
      const closed = new Subject<void>();
      const open = vi.fn().mockReturnValue({ afterClosed: () => closed });
      const dialog = { open } as unknown as Pick<MatDialog, 'open'>;
      class Dialog {}
      let resolve: ((component: typeof Dialog) => void) | undefined;
      const loading = new Promise<typeof Dialog>((done) => {
        resolve = done;
      });
      trigger.focus();
      launchRunDialog(dialog, host, () => loading, { preselectedCollection: 'main' }, kind, 'wide');
      heading.focus();
      resolve?.(Dialog);
      await loading;
      expect(open).toHaveBeenCalledWith(Dialog, {
        data: { preselectedCollection: 'main' },
        panelClass: `${kind}-dialog-panel`,
        maxWidth: 'wide',
        restoreFocus: false,
      });
      expect(document.activeElement).toBe(heading);
      closed.next();
      expect(document.activeElement).toBe(trigger);
    },
  );

  it('uses an explicit return target instead of the captured active element', async () => {
    const closed = new Subject<void>();
    const open = vi.fn().mockReturnValue({ afterClosed: () => closed });
    class Dialog {}
    heading.focus();
    launchRunDialog(
      { open } as unknown as Pick<MatDialog, 'open'>,
      host,
      () => Promise.resolve(Dialog),
      {},
      'export',
      'wide',
      trigger,
    );
    await Promise.resolve();
    closed.next();
    expect(document.activeElement).toBe(trigger);
  });
});
