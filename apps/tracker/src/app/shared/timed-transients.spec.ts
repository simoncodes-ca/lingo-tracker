import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFlash,
  createRestartableDelay,
  injectFlash,
  injectMidpointFlip,
  injectRestartableDelay,
} from './timed-transients';

beforeEach(() => {
  vi.useFakeTimers();
  TestBed.configureTestingModule({});
});

afterEach(() => {
  TestBed.resetTestingModule();
  vi.useRealTimers();
});

describe('injectRestartableDelay', () => {
  it('runs only after the full delay', () => {
    const schedule = TestBed.runInInjectionContext(() => injectRestartableDelay(900));
    const callback = vi.fn();
    schedule(callback);
    vi.advanceTimersByTime(899);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('replaces the pending callback and restarts its delay', () => {
    const schedule = TestBed.runInInjectionContext(() => injectRestartableDelay(900));
    const first = vi.fn();
    const second = vi.fn();
    schedule(first);
    vi.advanceTimersByTime(500);
    schedule(second);
    vi.advanceTimersByTime(899);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(second).toHaveBeenCalledOnce();
  });

  it('cancels on destroy and ignores later schedules', () => {
    const schedule = TestBed.runInInjectionContext(() => injectRestartableDelay(900));
    const callback = vi.fn();
    schedule(callback);
    TestBed.resetTestingModule();
    expect(vi.getTimerCount()).toBe(0);
    schedule(callback);
    vi.runAllTimers();
    expect(callback).not.toHaveBeenCalled();
  });
});

describe('injectFlash', () => {
  it('is initially false, becomes true on trigger, and resets at the duration', () => {
    const flash = TestBed.runInInjectionContext(() => injectFlash(1500));
    expect(flash.active()).toBe(false);
    flash.trigger();
    expect(flash.active()).toBe(true);
    vi.advanceTimersByTime(1499);
    expect(flash.active()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(flash.active()).toBe(false);
  });

  it('keeps true for a full duration after a retrigger', () => {
    const flash = TestBed.runInInjectionContext(() => injectFlash(1500));
    flash.trigger();
    vi.advanceTimersByTime(1000);
    flash.trigger();
    vi.advanceTimersByTime(1499);
    expect(flash.active()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(flash.active()).toBe(false);
  });

  it('clears the pending reset without mutating a destroyed owner', () => {
    const flash = TestBed.runInInjectionContext(() => injectFlash(1500));
    flash.trigger();
    TestBed.resetTestingModule();
    expect(vi.getTimerCount()).toBe(0);
    vi.runAllTimers();
    // Destroy cancels the reset without changing the destroyed owner's last signal value.
    expect(flash.active()).toBe(true);
  });

  it('ignores triggers after destruction', () => {
    const flash = TestBed.runInInjectionContext(() => injectFlash(1500));
    TestBed.resetTestingModule();
    flash.trigger();
    expect(flash.active()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('injectMidpointFlip', () => {
  it('commits once at the midpoint and ends at the full duration', () => {
    const flip = TestBed.runInInjectionContext(() => injectMidpointFlip(250));
    const commit = vi.fn();
    expect(flip.active()).toBe(false);
    flip.trigger(commit);
    expect(flip.active()).toBe(true);
    vi.advanceTimersByTime(124);
    expect(commit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(commit).toHaveBeenCalledOnce();
    expect(flip.active()).toBe(true);
    vi.advanceTimersByTime(124);
    expect(flip.active()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(flip.active()).toBe(false);
    expect(commit).toHaveBeenCalledOnce();
  });

  it('replaces a pending commit and restarts both phases', () => {
    const flip = TestBed.runInInjectionContext(() => injectMidpointFlip(250));
    const first = vi.fn();
    const second = vi.fn();
    flip.trigger(first);
    vi.advanceTimersByTime(100);
    flip.trigger(second);
    vi.advanceTimersByTime(124);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(second).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(124);
    expect(flip.active()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(flip.active()).toBe(false);
  });

  it('can restart after the previous midpoint without repeating that commit', () => {
    const flip = TestBed.runInInjectionContext(() => injectMidpointFlip(250));
    const first = vi.fn();
    const second = vi.fn();
    flip.trigger(first);
    vi.advanceTimersByTime(150);
    flip.trigger(second);
    vi.advanceTimersByTime(125);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(flip.active()).toBe(true);
    vi.advanceTimersByTime(125);
    expect(flip.active()).toBe(false);
  });

  it('cancels both phases on destroy and ignores subsequent triggers', () => {
    const flip = TestBed.runInInjectionContext(() => injectMidpointFlip(250));
    const commit = vi.fn();
    flip.trigger(commit);
    TestBed.resetTestingModule();
    expect(vi.getTimerCount()).toBe(0);
    flip.trigger(commit);
    vi.runAllTimers();
    expect(commit).not.toHaveBeenCalled();
    expect(flip.active()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('timed transients without an injector', () => {
  it('can cancel a pending delay and schedule again until destroyed', () => {
    const delay = createRestartableDelay(900);
    const callback = vi.fn();
    delay.schedule(callback);
    delay.cancel();
    vi.advanceTimersByTime(900);
    expect(callback).not.toHaveBeenCalled();
    delay.schedule(callback);
    vi.advanceTimersByTime(900);
    expect(callback).toHaveBeenCalledOnce();
    delay.schedule(callback);
    delay.destroy();
    delay.schedule(callback);
    vi.runAllTimers();
    expect(callback).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restarts a flash and cancels its reset on explicit destruction', () => {
    const flash = createFlash(1500);
    flash.trigger();
    vi.advanceTimersByTime(1000);
    flash.trigger();
    vi.advanceTimersByTime(1499);
    expect(flash.active()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(flash.active()).toBe(false);
    flash.trigger();
    flash.destroy();
    flash.trigger();
    vi.runAllTimers();
    expect(flash.active()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
