import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorFocus, type EditorFocusTarget } from './editor-focus';

@Component({
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: EditorFocus, useFactory: () => new EditorFocus() }],
})
class Host {
  readonly focus = inject(EditorFocus);
}

function flushFocus(): void {
  TestBed.tick();
  vi.advanceTimersByTime(0);
}

describe('EditorFocus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });
  it('focuses only the anchor registered for each target', () => {
    const focus = TestBed.runInInjectionContext(() => new EditorFocus());
    const targets: EditorFocusTarget[] = [
      'key',
      'base-value',
      'comment',
      'location-pill',
      'locales-row',
      'folder-filter',
      'drawer-first-control',
    ];
    const fakes = targets.map(() => ({ focus: vi.fn() }));
    targets.forEach((target, index) => {
      const element = fakes[index];
      if (element) focus.register(target, element);
    });
    targets.forEach((target, index) => {
      focus.request(target);
      flushFocus();
      fakes.forEach((fake, other) => {
        expect(fake.focus).toHaveBeenCalledTimes(other <= index ? 1 : 0);
      });
    });
  });

  it('ignores anchors that are not rendered', () => {
    const focus = TestBed.runInInjectionContext(() => new EditorFocus());
    expect(() => {
      focus.request('folder-filter');
      flushFocus();
    }).not.toThrow();
  });

  it('resolves the current anchor after conditional views change', () => {
    const focus = TestBed.runInInjectionContext(() => new EditorFocus());
    focus.request('drawer-first-control');
    flushFocus();
    const first = { focus: vi.fn() };
    const removeFirst = focus.register('drawer-first-control', first);
    focus.request('drawer-first-control');
    flushFocus();
    removeFirst();
    const replacement = { focus: vi.fn() };
    const removeReplacement = focus.register('drawer-first-control', replacement);
    focus.request('drawer-first-control');
    flushFocus();
    removeReplacement();
    focus.request('drawer-first-control');
    flushFocus();
    expect(first.focus).toHaveBeenCalledTimes(1);
    expect(replacement.focus).toHaveBeenCalledTimes(1);
  });

  it('focuses, reveals and selects all existing comment text in order', () => {
    const comment = document.createElement('textarea');
    comment.value = 'Translator context';
    const calls: string[] = [];
    vi.spyOn(comment, 'focus').mockImplementation(() => calls.push('focus'));
    comment.scrollIntoView = vi.fn(() => calls.push('scroll'));
    const select = vi.spyOn(comment, 'setSelectionRange').mockImplementation(() => calls.push('select'));
    const focus = TestBed.runInInjectionContext(() => new EditorFocus());
    focus.register('comment', comment);
    focus.request('comment');
    flushFocus();
    expect(calls).toEqual(['focus', 'scroll', 'select']);
    expect(comment.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(select).toHaveBeenCalledWith(0, comment.value.length);
  });

  it('parks the caret in an empty comment even without scrollIntoView', () => {
    const comment = document.createElement('textarea');
    const select = vi.spyOn(comment, 'setSelectionRange');
    const focus = TestBed.runInInjectionContext(() => new EditorFocus());
    focus.register('comment', comment);
    focus.request('comment');
    flushFocus();
    expect(select).toHaveBeenCalledWith(0, 0);
  });

  it('does not select textarea contents for other targets', () => {
    const value = document.createElement('textarea');
    const select = vi.spyOn(value, 'setSelectionRange');
    const focus = TestBed.runInInjectionContext(() => new EditorFocus());
    focus.register('base-value', value);
    focus.request('base-value');
    flushFocus();
    expect(select).not.toHaveBeenCalled();
  });

  it('falls back to the invalid locale value only when the drawer anchor is absent', () => {
    const focus = TestBed.runInInjectionContext(() => new EditorFocus());
    const invalid = { focus: vi.fn() };
    const first = { focus: vi.fn() };
    focus.register('invalid-locale-value', invalid);
    focus.request('drawer-first-control');
    flushFocus();
    expect(invalid.focus).toHaveBeenCalledOnce();

    focus.register('drawer-first-control', first);
    focus.request('drawer-first-control');
    flushFocus();
    expect(first.focus).toHaveBeenCalledOnce();
    expect(invalid.focus).toHaveBeenCalledOnce();
  });

  it('defers anchor lookup and replaces a pending request with the latest target', () => {
    const focus = TestBed.runInInjectionContext(() => new EditorFocus());
    const key = { focus: vi.fn() };
    const invalid = { focus: vi.fn() };
    focus.register('key', key);
    focus.request('key');
    focus.request('invalid-locale-value');
    focus.register('invalid-locale-value', invalid);
    expect(invalid.focus).not.toHaveBeenCalled();
    flushFocus();
    expect(key.focus).not.toHaveBeenCalled();
    expect(invalid.focus).toHaveBeenCalledOnce();
  });

  it('honours repeated requests for the same target across renders', () => {
    const focus = TestBed.runInInjectionContext(() => new EditorFocus());
    const key = { focus: vi.fn() };
    focus.register('key', key);
    focus.request('key');
    flushFocus();
    focus.request('key');
    flushFocus();
    expect(key.focus).toHaveBeenCalledTimes(2);
  });

  it('drops focus pending a render when the host is destroyed and ignores requests after destroy', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const focus = fixture.componentInstance.focus;
    const anchor = { focus: vi.fn() };
    focus.register('key', anchor);
    focus.request('key');
    fixture.destroy();
    flushFocus();
    expect(anchor.focus).not.toHaveBeenCalled();

    expect(() => focus.request('key')).not.toThrow();
    flushFocus();
    expect(anchor.focus).not.toHaveBeenCalled();
  });

  it('cancels focus already queued after render when the host is destroyed', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const focus = fixture.componentInstance.focus;
    const anchor = { focus: vi.fn() };
    focus.register('key', anchor);
    focus.request('key');
    TestBed.tick();
    expect(anchor.focus).not.toHaveBeenCalled();
    fixture.destroy();
    flushFocus();
    expect(anchor.focus).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('replaces a request already queued after render with the latest target', () => {
    const focus = TestBed.runInInjectionContext(() => new EditorFocus());
    const key = { focus: vi.fn() };
    const comment = { focus: vi.fn() };
    focus.register('key', key);
    focus.register('comment', comment);
    focus.request('key');
    TestBed.tick();
    focus.request('comment');
    flushFocus();
    expect(key.focus).not.toHaveBeenCalled();
    expect(comment.focus).toHaveBeenCalledOnce();
  });
});
