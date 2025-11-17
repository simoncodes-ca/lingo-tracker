import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../services/api';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'create-collection-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatChipsModule, MatIconModule],
  templateUrl: './create-collection-dialog.html',
  styleUrl: './create-collection-dialog.scss',
})
export class CreateCollectionDialogComponent {
  private dialogRef = inject(MatDialogRef<CreateCollectionDialogComponent, { created: boolean; message?: string }>);
  private fb = inject(FormBuilder);
  private api = inject(ApiService);

  submitting = false;

  form = this.fb.group({
    name: this.fb.control<string>('', { validators: [Validators.required], nonNullable: true }),
    translationsFolder: this.fb.control<string>('', { validators: [Validators.required], nonNullable: true }),
    exportFolder: this.fb.control<string>(''),
    importFolder: this.fb.control<string>(''),
    baseLocale: this.fb.control<string>(''),
    localesInput: this.fb.control<string>(''),
  });

  onCancel() {
    this.dialogRef.close({ created: false });
  }

  async onSubmit() {
    if (this.form.invalid || this.submitting) return;
    this.submitting = true;
    const raw = this.form.getRawValue();
    const locales = (raw.localesInput || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    try {
      const result = await firstValueFrom(this.api.createCollection({
        name: raw.name ?? 'unknown',
        collection: {
          translationsFolder: raw.translationsFolder ?? '',
          exportFolder: raw.exportFolder || undefined,
          importFolder: raw.importFolder || undefined,
          baseLocale: raw.baseLocale || undefined,
          locales: locales.length ? locales : undefined,
        }
      }));
      this.dialogRef.close({ created: true, message: result.message });
    } catch (_error) {
      this.submitting = false;
      // Keep the dialog open; user will see snack in parent
    }
  }
}


