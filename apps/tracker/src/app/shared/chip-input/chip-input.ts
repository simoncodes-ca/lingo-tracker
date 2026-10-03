import { Directive, ElementRef, inject, input, output } from '@angular/core';

/**
 * Key handling for a free-text chip field, set on its `<input>`. Enter or comma commits the
 * typed text, Backspace on an empty field removes the last chip. The directive clears the field
 * on commit and never interprets the text: the host decides what a tag or a term is.
 */
@Directive({
  selector: 'input[appChipInput]',
  host: {
    '(keydown)': 'onKeydown($event)',
    '(blur)': 'onBlur()',
  },
})
export class ChipInput {
  readonly #input = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;

  /** The chips now shown, so Backspace knows which one is last. */
  readonly chips = input.required<readonly string[]>({ alias: 'appChipInput' });
  /** Leaving the field with text typed commits it instead of dropping it. */
  readonly commitOnBlur = input(false);

  /** The typed text as it was, even blank: the host rule ignores a blank, but its own input state still resets. */
  readonly chipAdd = output<string>();
  readonly chipRemove = output<string>();

  onKeydown(event: KeyboardEvent): void {
    // Enter or comma inside an IME composition belongs to the composition, not to the chip.
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.#commit();
      return;
    }
    if (event.key === 'Backspace' && this.#input.value === '') {
      const last = this.chips().at(-1);
      if (last !== undefined) this.chipRemove.emit(last);
    }
  }

  onBlur(): void {
    if (this.commitOnBlur()) this.#commit();
  }

  #commit(): void {
    const text = this.#input.value;
    this.#input.value = '';
    this.chipAdd.emit(text);
  }
}
