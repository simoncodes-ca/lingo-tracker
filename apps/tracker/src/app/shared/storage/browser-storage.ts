import { isPlatformBrowser } from '@angular/common';
import { InjectionToken, inject, PLATFORM_ID } from '@angular/core';
import type { StorageAdapter } from './keyed-storage';

function browserStorage(kind: 'localStorage' | 'sessionStorage'): () => StorageAdapter | undefined {
  const browser = isPlatformBrowser(inject(PLATFORM_ID));
  // Resolve lazily inside KeyedStorage's failure boundary, including blocked getters.
  return () => (browser ? globalThis[kind] : undefined);
}

export const LOCAL_STORAGE = new InjectionToken<() => StorageAdapter | undefined>('Tracker local storage', {
  providedIn: 'root',
  factory: () => browserStorage('localStorage'),
});
export const SESSION_STORAGE = new InjectionToken<() => StorageAdapter | undefined>('Tracker session storage', {
  providedIn: 'root',
  factory: () => browserStorage('sessionStorage'),
});
