import { DestroyRef, inject, type Signal, signal } from '@angular/core';

export interface RestartableDelay {
  schedule(callback: () => void): void;
  /** Cancel the pending callback but permit another schedule. */
  cancel(): void;
  /** Cancel the pending callback and ignore all later schedules. */
  destroy(): void;
}

/** A restartable delay with an explicit owner, independent of an Angular injector. */
export function createRestartableDelay(durationMs: number): RestartableDelay {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;
  const cancel = (): void => {
    clearTimeout(timer);
    timer = undefined;
  };
  return {
    schedule(callback) {
      if (destroyed) return;
      cancel();
      timer = setTimeout(() => {
        timer = undefined;
        callback();
      }, durationMs);
    },
    cancel,
    destroy() {
      destroyed = true;
      cancel();
    },
  };
}

/** A restartable delay owned by the current component, service or store injector. */
export function injectRestartableDelay(durationMs: number): (callback: () => void) => void {
  const delay = createRestartableDelay(durationMs);
  inject(DestroyRef).onDestroy(() => delay.destroy());
  return delay.schedule;
}

export interface Flash {
  readonly active: Signal<boolean>;
  trigger(): void;
}

export interface OwnedFlash extends Flash {
  /** Cancel the pending reset and ignore later triggers without changing the last signal value. */
  destroy(): void;
}

/** True immediately on trigger, then false after the full duration; retriggers restart it. */
export function createFlash(durationMs: number): OwnedFlash {
  const active = signal(false);
  const delay = createRestartableDelay(durationMs);
  let destroyed = false;
  return {
    active: active.asReadonly(),
    trigger() {
      if (destroyed) return;
      active.set(true);
      delay.schedule(() => active.set(false));
    },
    destroy() {
      destroyed = true;
      delay.destroy();
    },
  };
}

/** A flash owned by the current component, service or store injector. */
export function injectFlash(durationMs: number): Flash {
  const flash = createFlash(durationMs);
  inject(DestroyRef).onDestroy(() => flash.destroy());
  return flash;
}

export interface MidpointFlip {
  readonly active: Signal<boolean>;
  trigger(commitAtMidpoint: () => void): void;
}

/** Keeps the flip active for a full cycle and commits the icon/store change halfway through. */
export function injectMidpointFlip(durationMs: number): MidpointFlip {
  const flash = injectFlash(durationMs);
  const commitAfterDelay = injectRestartableDelay(durationMs / 2);
  return {
    active: flash.active,
    trigger(commitAtMidpoint) {
      flash.trigger();
      commitAfterDelay(commitAtMidpoint);
    },
  };
}
