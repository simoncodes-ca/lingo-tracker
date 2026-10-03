import { TestBed } from '@angular/core/testing';
import { signalStore } from '@ngrx/signals';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withItemUiState } from './with-item-ui-state.feature';

// Reusing the feature also exercises independent timer ownership for each store instance.
const feature = withItemUiState();
const FirstStore = signalStore(feature);
const SecondStore = signalStore(feature);

describe('withItemUiState flash', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [FirstStore, SecondStore] });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('shows the key immediately and clears it at 1500 ms', () => {
    const store = TestBed.inject(FirstStore);
    expect(store.recentlyUpdatedKey()).toBeUndefined();
    store.flashRecentlyUpdated('first');
    expect(store.isRecentlyUpdated('first')).toBe(true);
    vi.advanceTimersByTime(1499);
    expect(store.isRecentlyUpdated('first')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(store.recentlyUpdatedKey()).toBeUndefined();
  });

  it('replaces the key and restarts its full duration', () => {
    const store = TestBed.inject(FirstStore);
    store.flashRecentlyUpdated('first');
    vi.advanceTimersByTime(1000);
    store.flashRecentlyUpdated('second');
    expect(store.isRecentlyUpdated('first')).toBe(false);
    vi.advanceTimersByTime(1499);
    expect(store.isRecentlyUpdated('second')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(store.recentlyUpdatedKey()).toBeUndefined();
  });

  it('clears the timer on destroy without patching a dead store', () => {
    const store = TestBed.inject(FirstStore);
    store.flashRecentlyUpdated('first');
    TestBed.resetTestingModule();
    expect(vi.getTimerCount()).toBe(0);
    vi.runAllTimers();
    expect(store.recentlyUpdatedKey()).toBe('first');
  });

  it('keeps separate timers when two stores reuse the same feature', () => {
    const first = TestBed.inject(FirstStore);
    const second = TestBed.inject(SecondStore);
    first.flashRecentlyUpdated('first');
    vi.advanceTimersByTime(500);
    second.flashRecentlyUpdated('second');
    vi.advanceTimersByTime(1000);
    expect(first.recentlyUpdatedKey()).toBeUndefined();
    expect(second.recentlyUpdatedKey()).toBe('second');
    vi.advanceTimersByTime(500);
    expect(second.recentlyUpdatedKey()).toBeUndefined();
  });
});
