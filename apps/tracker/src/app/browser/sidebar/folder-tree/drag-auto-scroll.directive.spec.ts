import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DragAutoScroll } from './drag-auto-scroll.directive';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [DragAutoScroll],
  template: '<div [appDragAutoScroll]="active()"></div>',
})
class Host {
  readonly active = input(true);
}

describe('DragAutoScroll', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [Host] }));

  it('scrolls at the original speed, reverses, and stops outside the edge or when drag ends', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(Host);
    try {
      fixture.detectChanges();
      const element: HTMLDivElement = fixture.nativeElement.querySelector('div');
      vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 400 } as DOMRect);
      const scroll = vi.fn();
      element.scrollBy = scroll;
      element.dispatchEvent(new MouseEvent('mousemove', { clientY: 125 }));
      vi.advanceTimersByTime(100);
      expect(scroll).toHaveBeenCalledTimes(2);
      expect(scroll).toHaveBeenLastCalledWith({ top: -15, behavior: 'auto' });
      element.dispatchEvent(new MouseEvent('mousemove', { clientY: 375 }));
      vi.advanceTimersByTime(50);
      expect(scroll).toHaveBeenLastCalledWith({ top: 15, behavior: 'auto' });
      element.dispatchEvent(new MouseEvent('mousemove', { clientY: 250 }));
      vi.advanceTimersByTime(100);
      expect(scroll).toHaveBeenCalledTimes(3);
      element.dispatchEvent(new MouseEvent('mousemove', { clientY: 100 }));
      element.dispatchEvent(new MouseEvent('mousemove', { clientY: 450 }));
      vi.advanceTimersByTime(50);
      expect(scroll).toHaveBeenCalledTimes(3);
      element.dispatchEvent(new MouseEvent('mousemove', { clientY: 375 }));
      fixture.componentRef.setInput('active', false);
      fixture.detectChanges();
      vi.advanceTimersByTime(100);
      expect(scroll).toHaveBeenCalledTimes(3);
      element.dispatchEvent(new MouseEvent('mousemove', { clientY: 125 }));
      vi.advanceTimersByTime(100);
      expect(scroll).toHaveBeenCalledTimes(3);
    } finally {
      fixture.destroy();
      vi.useRealTimers();
    }
  });

  it('cancels a running interval when the list is destroyed', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(Host);
    try {
      fixture.detectChanges();
      const element: HTMLDivElement = fixture.nativeElement.querySelector('div');
      vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 400 } as DOMRect);
      const scroll = vi.fn();
      element.scrollBy = scroll;
      element.dispatchEvent(new MouseEvent('mousemove', { clientY: 125 }));
      fixture.destroy();
      vi.advanceTimersByTime(100);
      expect(scroll).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      fixture.destroy();
      vi.useRealTimers();
    }
  });
});
