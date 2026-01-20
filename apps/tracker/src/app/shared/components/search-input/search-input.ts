import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  model,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

/**
 * Reusable search input component with loading and clear functionality.
 *
 * Features:
 * - Search icon prefix
 * - Clear button when value exists (hidden during loading)
 * - Loading spinner (replaces clear button when active)
 * - Two-way binding via model signal
 * - Customizable placeholder and aria label
 * - Disabled state support
 *
 * @example
 * <app-search-input
 *   [(value)]="searchQuery"
 *   [placeholder]="'Search translations...'"
 *   [ariaLabel]="'Search input'"
 *   [isLoading]="isSearching()"
 *   (cleared)="onSearchCleared()"
 * />
 */
@Component({
  selector: 'app-search-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './search-input.html',
  styleUrl: './search-input.scss',
})
export class SearchInput {
  /** Placeholder text for the input field */
  placeholder = input<string>('Search...');

  /** Current search value (supports two-way binding) */
  value = model<string>('');

  /** Whether the input is disabled */
  disabled = input<boolean>(false);

  /** Whether to show loading spinner instead of clear button */
  isLoading = input<boolean>(false);

  /** Aria label for accessibility */
  ariaLabel = input<string>('Search');

  /** Emitted when clear button is clicked */
  cleared = output<void>();

  /**
   * Handles clear button click.
   * Clears the value and emits cleared event.
   */
  onClear(): void {
    this.value.set('');
    this.cleared.emit();
  }
}
