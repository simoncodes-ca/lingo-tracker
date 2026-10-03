import { DestroyRef, inject, type Signal, signal } from '@angular/core';

/** A restartable delay owned by the current component, service or store injector. */
export function injectRestartableDelay(durationMs: number): (callback: () => void) => void {
  const destroyRef = inject(DestroyRef);
  let timer: ReturnType<typeof setTimeout> | undefined;
  destroyRef.onDestroy(() => {
    clearTimeout(timer);
    timer = undefined;
  });
  return (callback) => {
    if (destroyRef.destroyed) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      callback();
    }, durationMs);
  };
}

export interface Flash {
  readonly active: Signal<boolean>;
  trigger(): void;
}

/** True immediately on trigger, then false after the full duration; retriggers restart it. */
export function injectFlash(durationMs: number): Flash {
  const destroyRef = inject(DestroyRef);
  const active = signal(false);
  const resetAfterDelay = injectRestartableDelay(durationMs);
  return {
    active: active.asReadonly(),
    trigger() {
      if (destroyRef.destroyed) return;
      active.set(true);
      resetAfterDelay(() => active.set(false));
    },
  };
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
