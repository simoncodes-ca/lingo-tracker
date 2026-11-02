import { DestroyRef, Directive, ElementRef, effect, inject, input } from '@angular/core';

const SCROLL_EDGE_THRESHOLD_PX = 50;
const SCROLL_SPEED_PX = 15;
const SCROLL_INTERVAL_MS = 50;

/** Edge scrolling for the folder list while a local or external drag is active. */
@Directive({
  selector: '[appDragAutoScroll]',
  standalone: true,
  host: { '(mousemove)': 'onMouseMove($event)' },
})
export class DragAutoScroll {
  readonly appDragAutoScroll = input(false);
  readonly #element = inject<ElementRef<HTMLDivElement>>(ElementRef);
  #interval: ReturnType<typeof setInterval> | undefined;
  #direction: 'up' | 'down' | undefined;

  constructor() {
    effect(() => {
      if (!this.appDragAutoScroll()) this.#stop();
    });
    inject(DestroyRef).onDestroy(() => this.#stop());
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.appDragAutoScroll()) return;
    const rect = this.#element.nativeElement.getBoundingClientRect();
    const top = event.clientY - rect.top;
    const bottom = rect.bottom - event.clientY;
    if (top < SCROLL_EDGE_THRESHOLD_PX && top > 0) this.#start('up');
    else if (bottom < SCROLL_EDGE_THRESHOLD_PX && bottom > 0) this.#start('down');
    else this.#stop();
  }

  #start(direction: 'up' | 'down'): void {
    if (this.#direction === direction) return;
    this.#stop();
    this.#direction = direction;
    this.#interval = setInterval(() => {
      this.#element.nativeElement.scrollBy({
        top: direction === 'up' ? -SCROLL_SPEED_PX : SCROLL_SPEED_PX,
        behavior: 'auto',
      });
    }, SCROLL_INTERVAL_MS);
  }

  #stop(): void {
    clearInterval(this.#interval);
    this.#interval = undefined;
    this.#direction = undefined;
  }
}
