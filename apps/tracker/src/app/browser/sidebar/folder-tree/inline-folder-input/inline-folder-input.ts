import { Component, ChangeDetectionStrategy, input, output, effect, viewChild, type ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';

/**
 * Inline input component for creating new folders in the folder tree.
 *
 * Features:
 * - Auto-focuses input on appearance
 * - Validates folder name format (alphanumeric, dash, underscore only)
 * - Enter key confirms if valid
 * - Escape key or blur cancels
 * - Shows inline validation errors
 */
@Component({
  selector: 'app-inline-folder-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatIconModule],
  templateUrl: './inline-folder-input.html',
  styleUrl: './inline-folder-input.scss',
})
export class InlineFolderInput {
  /** The parent folder path (null for root level) */
  readonly parentPath = input<string | null>(null);

  /** Emitted when user confirms the folder name (Enter key) */
  readonly confirm = output<string>();

  /** Emitted when user cancels (Escape key or blur) */
  readonly cancel = output<void>();

  /** Reference to the input element for auto-focus */
  readonly inputElement = viewChild<ElementRef<HTMLInputElement>>('inputField');

  /** Form control for folder name with validation */
  readonly folderNameControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/^[A-Za-z0-9_-]+$/)],
  });

  /** Track if confirm was already emitted to prevent blur from canceling */
  #confirmed = false;

  constructor() {
    // Auto-focus the input when component appears
    effect(() => {
      const element = this.inputElement();
      if (element) {
        element.nativeElement.focus();
      }
    });
  }

  /**
   * Handles Enter key press.
   * Confirms the folder name if validation passes.
   */
  onEnterKey(): void {
    if (this.folderNameControl.valid) {
      const folderName = this.folderNameControl.value.trim();
      if (folderName) {
        this.#confirmed = true;
        this.confirm.emit(folderName);
      }
    }
  }

  /**
   * Handles Escape key press.
   * Cancels the folder creation.
   */
  onEscapeKey(): void {
    this.cancel.emit();
  }

  /**
   * Handles input blur event.
   * Cancels the folder creation when clicking outside.
   * Does not cancel if confirm was already emitted.
   */
  onBlur(): void {
    if (!this.#confirmed) {
      this.cancel.emit();
    }
  }

  /**
   * Gets the validation error message to display.
   */
  getErrorMessage(): string {
    if (this.folderNameControl.hasError('required')) {
      return 'Folder name is required';
    }
    if (this.folderNameControl.hasError('pattern')) {
      return 'Only letters, numbers, dashes, and underscores allowed';
    }
    return '';
  }

  /**
   * Checks if validation errors should be shown.
   * Only show errors after the user has interacted with the input.
   */
  shouldShowError(): boolean {
    return this.folderNameControl.invalid && (this.folderNameControl.dirty || this.folderNameControl.touched);
  }
}
