import { ChangeDetectionStrategy, Component, ElementRef, forwardRef, inject, input, signal } from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';

export type SegmentValue = string | boolean;

export interface SegmentOption<T extends SegmentValue = SegmentValue> {
  readonly value: T;
  /** Transloco token for the visible label. Omit for technical literals and set `text`. */
  readonly label?: string;
  /** Untranslated literal label (identifiers such as `camelCase`). */
  readonly text?: string;
  readonly icon?: string;
}

/**
 * A hand-rolled segmented control: parchment-muted pills inside a hairline well, exposed as a
 * radio group so arrow keys move the selection the way a native radio set does. Plugs into
 * reactive forms through ControlValueAccessor.
 */
@Component({
  selector: 'app-segmented-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, TranslocoPipe],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SegmentedControl), multi: true }],
  host: {
    class: 'segmented',
    role: 'radiogroup',
    '[class.segmented--mono]': 'mono()',
    '[class.segmented--disabled]': 'disabled()',
    '[attr.aria-labelledby]': 'labelledBy() || null',
    '(keydown)': 'onKeydown($event)',
  },
  template: `
    @for (option of options(); track option.value; let index = $index) {
      <button
        type="button"
        class="segment"
        role="radio"
        [class.segment--on]="option.value === value()"
        [attr.aria-checked]="option.value === value()"
        [attr.data-index]="index"
        [tabindex]="tabIndexFor(option.value, index)"
        [disabled]="disabled()"
        (click)="select(option.value)"
      >
        @if (option.icon) {
          <mat-icon aria-hidden="true">{{ option.icon }}</mat-icon>
        }
        @if (option.label) {
          <span>{{ option.label | transloco }}</span>
        } @else {
          <span>{{ option.text }}</span>
        }
      </button>
    }
  `,
  styleUrl: './segmented-control.scss',
})
export class SegmentedControl implements ControlValueAccessor {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly options = input.required<readonly SegmentOption[]>();
  readonly mono = input(false);
  readonly labelledBy = input<string>('');

  readonly value = signal<SegmentValue | undefined>(undefined);
  readonly disabled = signal(false);

  #onChange: (value: SegmentValue) => void = () => undefined;
  #onTouched: () => void = () => undefined;

  /** Only the checked pill (or the first, when nothing is checked) is in the tab order. */
  tabIndexFor(optionValue: SegmentValue, index: number): number {
    const current = this.value();
    const hasSelection = this.options().some((option) => option.value === current);
    if (hasSelection) return optionValue === current ? 0 : -1;
    return index === 0 ? 0 : -1;
  }

  select(next: SegmentValue): void {
    if (this.disabled() || next === this.value()) {
      this.#onTouched();
      return;
    }
    this.value.set(next);
    this.#onChange(next);
    this.#onTouched();
  }

  onKeydown(event: KeyboardEvent): void {
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    if (!forward && !backward) return;
    event.preventDefault();

    const options = this.options();
    if (options.length === 0) return;
    const currentIndex = options.findIndex((option) => option.value === this.value());
    const step = forward ? 1 : -1;
    const nextIndex = (currentIndex + step + options.length) % options.length;
    const nextOption = options[nextIndex];
    if (!nextOption) return;

    this.select(nextOption.value);
    const button = this.#host.nativeElement.querySelector<HTMLButtonElement>(`[data-index="${nextIndex}"]`);
    button?.focus();
  }

  writeValue(value: SegmentValue | undefined): void {
    this.value.set(value);
  }

  registerOnChange(fn: (value: SegmentValue) => void): void {
    this.#onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.#onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
