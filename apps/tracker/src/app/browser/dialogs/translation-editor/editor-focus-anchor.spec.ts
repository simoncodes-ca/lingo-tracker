import { Component, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EditorFocus, type EditorFocusTarget } from './editor-focus';
import { EditorFocusAnchorDirective } from './editor-focus-anchor';
import { EditorPanels } from './editor-panels';

@Component({
  imports: [EditorFocusAnchorDirective],
  providers: [{ provide: EditorFocus, useFactory: () => new EditorFocus() }],
  template: `
    @if (visible()) { <input data-testid="older" [editorFocusAnchor]="target()" /> }
    @if (newerVisible()) { <input data-testid="newer" [editorFocusAnchor]="target()" /> }
  `,
})
class Host {
  readonly visible = signal(true);
  readonly newerVisible = signal(false);
  readonly target = signal<EditorFocusTarget | null>('folder-filter');
  readonly focus = inject(EditorFocus);
  readonly panels = new EditorPanels({
    editorFocus: this.focus,
    canOpenFolderPopover: () => true,
    canOpenLocalesDrawer: () => true,
  });
}

describe('EditorFocusAnchorDirective', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('registers the element and unregisters it when its conditional view is destroyed', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    const element = (fixture.nativeElement as HTMLElement).querySelector('input');
    expect(element).toBeDefined();
    if (element === null) return;
    const focus = vi.spyOn(element, 'focus');
    fixture.componentInstance.focus.request('folder-filter');
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    expect(focus).toHaveBeenCalledTimes(1);
    fixture.componentInstance.visible.set(false);
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    fixture.componentInstance.focus.request('folder-filter');
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('moves its registration when the target changes and removes it for a null target', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    const element = (fixture.nativeElement as HTMLElement).querySelector('input');
    if (element === null) throw new Error('Missing focus anchor');
    const focus = vi.spyOn(element, 'focus');
    fixture.componentInstance.target.set('key');
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    fixture.componentInstance.focus.request('folder-filter');
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    expect(focus).not.toHaveBeenCalled();
    fixture.componentInstance.focus.request('key');
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    expect(focus).toHaveBeenCalledTimes(1);
    fixture.componentInstance.target.set(null);
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    fixture.componentInstance.focus.request('key');
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('lands a deferred focus request on an element rendered after the request', () => {
    const fixture = TestBed.createComponent(Host);
    const host = fixture.componentInstance;
    host.visible.set(false);
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    host.panels.openFolderPopover();
    host.visible.set(true);
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    const element = (fixture.nativeElement as HTMLElement).querySelector('input');
    if (element === null) throw new Error('Missing focus anchor');
    expect(document.activeElement).toBe(element);
  });

  it('unregisters the element when the host is destroyed', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    const element = (fixture.nativeElement as HTMLElement).querySelector('input');
    if (element === null) throw new Error('Missing focus anchor');
    const focus = vi.spyOn(element, 'focus');
    const registry = fixture.componentInstance.focus;
    fixture.destroy();
    registry.request('folder-filter');
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    expect(focus).not.toHaveBeenCalled();
  });

  it('focuses the latest live anchor and restores the older one when the newer view is destroyed', () => {
    const fixture = TestBed.createComponent(Host);
    const host = fixture.componentInstance;
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    const root = fixture.nativeElement as HTMLElement;
    const older = root.querySelector<HTMLInputElement>('[data-testid="older"]');
    if (older === null) throw new Error('Missing older focus anchor');
    const focusOlder = vi.spyOn(older, 'focus');

    host.newerVisible.set(true);
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    const newer = root.querySelector<HTMLInputElement>('[data-testid="newer"]');
    if (newer === null) throw new Error('Missing newer focus anchor');
    const focusNewer = vi.spyOn(newer, 'focus');
    host.focus.request('folder-filter');
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    expect(focusNewer).toHaveBeenCalledOnce();
    expect(focusOlder).not.toHaveBeenCalled();

    host.newerVisible.set(false);
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    host.focus.request('folder-filter');
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    expect(focusOlder).toHaveBeenCalledOnce();
    expect(focusNewer).toHaveBeenCalledOnce();

    host.newerVisible.set(true);
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    const replacement = root.querySelector<HTMLInputElement>('[data-testid="newer"]');
    if (replacement === null) throw new Error('Missing replacement focus anchor');
    const focusReplacement = vi.spyOn(replacement, 'focus');
    host.visible.set(false);
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    host.focus.request('folder-filter');
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    expect(focusReplacement).toHaveBeenCalledOnce();
    expect(focusOlder).toHaveBeenCalledOnce();
  });

  it('cancels pending focus when the host is destroyed', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    const focus = fixture.componentInstance.focus;
    const anchor = { focus: vi.fn() };
    focus.register('key', anchor);
    focus.request('key');
    fixture.destroy();
    TestBed.tick();
    vi.advanceTimersByTime(0);
    expect(anchor.focus).not.toHaveBeenCalled();
  });
});
