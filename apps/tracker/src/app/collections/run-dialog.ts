import type { ComponentType } from '@angular/cdk/portal';
import type { MatDialog } from '@angular/material/dialog';

/** A busy or removed trigger falls back to the strip, then the section heading. */
export function restoreRunFocus(host: HTMLElement, trigger: HTMLElement | null, stripTestId: string): void {
  const usable = (element: HTMLElement | null): element is HTMLElement =>
    !!element &&
    element.isConnected &&
    // Safari does not focus a clicked button, so the "active" element can be the body.
    element !== document.body &&
    element.tabIndex >= -1 &&
    !(element instanceof HTMLButtonElement && element.disabled) &&
    element.getAttribute('aria-disabled') !== 'true';
  const target = [
    trigger,
    host.querySelector<HTMLElement>(`[data-testid="${stripTestId}"]`),
    host.querySelector<HTMLElement>('#collections-heading'),
  ].find(usable);
  target?.focus();
}

/** Capture focus before loading; the dialog starts the job and needs no result handler. */
export function launchRunDialog<T, D>(
  dialog: Pick<MatDialog, 'open'>,
  host: HTMLElement,
  load: () => Promise<ComponentType<T>>,
  data: D,
  kind: 'export' | 'import',
  maxWidth: string,
  returnTo?: HTMLElement,
): void {
  const active = document.activeElement;
  const trigger = returnTo ?? (active instanceof HTMLElement && active !== document.body ? active : null);
  void load().then((component) => {
    const ref = dialog.open(component, { data, panelClass: `${kind}-dialog-panel`, maxWidth, restoreFocus: false });
    ref.afterClosed().subscribe(() => restoreRunFocus(host, trigger, `${kind}-strip`));
  });
}
