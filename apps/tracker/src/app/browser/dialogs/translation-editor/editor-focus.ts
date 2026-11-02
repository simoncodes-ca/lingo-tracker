import { afterNextRender, type AfterRenderRef, DestroyRef, inject, Injector } from '@angular/core';

/** Where the caret should go once the view that holds it has rendered. */
export type EditorFocusTarget =
  | 'location-pill'
  | 'locales-row'
  | 'folder-filter'
  | 'drawer-first-control'
  | 'invalid-locale-value'
  | 'key'
  | 'comment'
  | 'base-value';

/** Minimal anchor contract, also usable without an Angular view. */
export interface EditorFocusAnchor {
  focus(): void;
}

/** Owns after-render focus, live anchors and fallback rules for one editor. */
export class EditorFocus {
  readonly #injector = inject(Injector);
  readonly #destroyRef = inject(DestroyRef);
  #pending: AfterRenderRef | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;

  readonly #registered = new Map<EditorFocusTarget, { element: EditorFocusAnchor }[]>();

  constructor() {
    this.#destroyRef.onDestroy(() => this.#cancelPending());
  }

  /** The latest live registration wins; cleanup reveals any earlier live anchor. */
  register(target: EditorFocusTarget, element: EditorFocusAnchor): () => void {
    const stack = this.#registered.get(target) ?? [];
    const registration = { element };
    stack.push(registration);
    this.#registered.set(target, stack);
    return () => {
      const index = stack.indexOf(registration);
      if (index < 0) return;
      stack.splice(index, 1);
      if (stack.length === 0) this.#registered.delete(target);
    };
  }

  /** The latest request wins; Angular cancels pending work when the editor is destroyed. */
  request(target: EditorFocusTarget): void {
    if (this.#destroyRef.destroyed) return;
    this.#cancelPending();
    this.#pending = afterNextRender(
      () => {
        this.#pending = undefined;
        // A closing confirmation may restore its opener in a queued task.
        // Wait past that task as well as the render that registers our anchors.
        this.#timer = setTimeout(() => {
          this.#timer = undefined;
          this.#focus(target);
        });
      },
      { injector: this.#injector },
    );
  }

  #cancelPending(): void {
    this.#pending?.destroy();
    this.#pending = undefined;
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  #focus(target: EditorFocusTarget): void {
    // The first invalid row takes over the first row's anchor, so opening the drawer still lands in it.
    const element = (
      this.#registered.get(target) ??
      (target === 'drawer-first-control' ? this.#registered.get('invalid-locale-value') : undefined)
    )?.at(-1)?.element;
    if (!element) return;
    element.focus();
    if (target === 'comment' && element instanceof HTMLTextAreaElement) {
      // The field may be below the fold on a scrolled form.
      element.scrollIntoView?.({ block: 'nearest' });
      // Select existing text for a rewrite, or park the caret in an empty field.
      element.setSelectionRange(0, element.value.length);
    }
  }
}
