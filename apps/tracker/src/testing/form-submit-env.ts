import type { DestroyRef } from '@angular/core';
import { type Mock, vi } from 'vitest';
import type { DialogCloser, FormSubmitEnv } from '../app/collections/store/dialog-config-submit';

/** A form's submit environment without TestBed: tokens translate to themselves; `destroy()` runs the destroy callbacks. */
export function fakeEnv(): FormSubmitEnv & { destroy(): void } {
  const callbacks: Array<() => void> = [];
  const destroyRef: DestroyRef = {
    destroyed: false,
    onDestroy: (callback) => {
      callbacks.push(callback);
      return () => {
        const index = callbacks.indexOf(callback);
        if (index >= 0) callbacks.splice(index, 1);
      };
    },
  };
  return {
    translate: (token) => token,
    destroyRef,
    confirm: vi.fn(async () => true),
    destroy: () => {
      for (const callback of callbacks.splice(0)) callback();
    },
  };
}

/** A dialog close handle whose `close` is a spy. */
export function fakeDialog<TResult>(): DialogCloser<TResult> & { close: Mock<(result: TResult) => void> } {
  return { disableClose: false, close: vi.fn<(result: TResult) => void>() };
}
