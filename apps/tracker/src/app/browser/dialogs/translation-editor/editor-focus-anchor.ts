import { Directive, ElementRef, effect, inject, input } from '@angular/core';
import { EditorFocus, type EditorFocusTarget } from './editor-focus';

/** Registers conditional and overlay elements with their editor's focus scope. */
@Directive({
  standalone: true,
  selector: '[editorFocusAnchor]',
})
export class EditorFocusAnchorDirective {
  readonly editorFocusAnchor = input.required<EditorFocusTarget | null>();
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly focus = inject(EditorFocus);

  constructor() {
    effect((onCleanup) => {
      const target = this.editorFocusAnchor();
      if (target === null) return;
      onCleanup(this.focus.register(target, this.element.nativeElement));
    });
  }
}
