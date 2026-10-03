import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { type FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { TokenCasingDto } from '@simoncodes-ca/data-transfer';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import { ChipInput } from '../../shared/chip-input/chip-input';
import { CollectionsStore } from '../store/collections.store';
import { NamedEntrySubmit } from '../store/dialog-config-submit';
import { BundleForm, LOCALE_PLACEHOLDER, type MergeStrategy } from './bundle-form';
import type { BundleFormDialogData, BundleFormResult } from './bundle-form-dialog-data';
import { SegmentedControl, type SegmentOption } from './segmented-control';

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const code = (value: string): string => `<code>${escapeHtml(value)}</code>`;

@Component({
  selector: 'app-bundle-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatSlideToggleModule,
    MatTooltipModule,
    TranslocoPipe,
    ChipInput,
    SegmentedControl,
  ],
  templateUrl: './bundle-form-dialog.html',
  styleUrl: './bundle-form-dialog.scss',
})
export class BundleFormDialog {
  readonly #dialogRef = inject(MatDialogRef<BundleFormDialog, BundleFormResult | undefined>);
  readonly #data = inject<BundleFormDialogData>(MAT_DIALOG_DATA);
  readonly #destroyRef = inject(DestroyRef);
  readonly #transloco = inject(TranslocoService);
  readonly store = inject(CollectionsStore);

  readonly TOKENS = TRACKER_TOKENS;
  readonly configFileMarkup = '<code>.lingo-tracker.json</code>';
  readonly bundlesKeyMarkup = '<code>bundles</code>';
  readonly tsExtensionMarkup = '<code>.ts</code>';
  /** Braces as entities so messageformat never reads the examples as arguments. */
  readonly icuExampleMarkup = '<code>&#123;count&#125;</code>';
  readonly translocoExampleMarkup = '<code>&#123;&#123;count&#125;&#125;</code>';
  readonly localePlaceholder = LOCALE_PLACEHOLDER;
  /** Rail sub-labels always render; these stand in until the matching field is filled. */
  readonly placeholderPattern = TRACKER_TOKENS.BUNDLES.DIALOG.SECTIONS.OUTPUTPLACEHOLDER;
  readonly placeholderTypeFile = TRACKER_TOKENS.BUNDLES.DIALOG.SECTIONS.TYPESPLACEHOLDER;

  readonly mergeOptions: readonly SegmentOption<MergeStrategy>[] = [
    { value: 'merge', label: TRACKER_TOKENS.BUNDLES.DIALOG.COLLECTION.FIRSTWINS },
    { value: 'override', label: TRACKER_TOKENS.BUNDLES.DIALOG.COLLECTION.THISOVERRIDES },
  ];
  readonly entriesOptions: readonly SegmentOption<boolean>[] = [
    { value: true, label: TRACKER_TOKENS.BUNDLES.DIALOG.COLLECTION.ALLENTRIES, icon: 'done_all' },
    { value: false, label: TRACKER_TOKENS.BUNDLES.DIALOG.COLLECTION.ONLYMATCHING, icon: 'filter_alt' },
  ];
  readonly casingOptions: readonly SegmentOption<TokenCasingDto>[] = [
    { value: 'upperCase', text: 'UPPER_CASE' },
    { value: 'camelCase', text: 'camelCase' },
  ];

  /** True from submit until the server has answered. */
  readonly saving = signal(false);
  readonly #namedEntrySubmit: NamedEntrySubmit<BundleFormResult> = new NamedEntrySubmit({
    nameControl: (): FormControl<string> => this.model.form.controls.name,
    normalizeName: (value) => String(value ?? '').trim(),
    fallbackTokens: {
      create: TRACKER_TOKENS.BUNDLES.TOAST.CREATEFAILED,
      update: TRACKER_TOKENS.BUNDLES.TOAST.UPDATEFAILED,
    },
    translate: (token) => this.#transloco.translate(token),
    dialogRef: this.#dialogRef,
    saving: this.saving,
    destroyRef: this.#destroyRef,
  });

  readonly model = new BundleForm({
    data: this.#data,
    collectionNames: () => this.store.collectionEntries().map((entry) => entry.name),
    bundleNames: () => this.store.bundleEntries().map((entry) => entry.name),
    locales: () => this.store.config()?.locales ?? [],
    baseLocale: () => this.store.config()?.baseLocale ?? '',
    tokenCasing: () => this.store.config()?.tokenCasing ?? 'upperCase',
    icuTransform: () => this.store.config()?.transformICUToTransloco ?? true,
    nameValidator: this.#namedEntrySubmit.nameValidator,
    dryRun: (request) => this.store.dryRunBundle(request),
  });
  readonly previewOpen = signal(false);
  readonly writesHintParams = computed(() => {
    const files = this.model.patternFiles();
    return { examples: files.slice(0, 2).map(code).join(', '), count: files.length };
  });

  constructor() {
    this.#destroyRef.onDestroy(() => this.model.destroy());
  }

  codeMarkup(value: string): string {
    return code(value);
  }

  togglePreview(): void {
    this.previewOpen.update((open) => !open);
  }

  onCancel(): void {
    this.#dialogRef.close(undefined);
  }

  onSubmit(): void {
    if (this.saving()) return;
    const result = this.model.submitResult();
    if (!result) return;
    this.#save(result);
  }

  #save(result: BundleFormResult): void {
    const existingName = this.model.isEditMode ? this.#data.name : undefined;
    this.#namedEntrySubmit.submit({
      existingName,
      name: result.name,
      create: () => this.store.createBundle({ name: result.name, bundle: result.bundle }),
      update: (name, patch) => this.store.updateBundle(name, { ...patch, bundle: result.bundle }),
      result,
      onRefusal: (refusal) => {
        if (refusal.kind === 'name-conflict') {
          this.model.activate('output');
          return;
        }
        // Server rule messages take precedence over the general refusal message.
        const details = refusal.details.filter((item): item is string => typeof item === 'string');
        this.model.submitErrors.set(details.length > 0 ? details : [refusal.message]);
      },
    });
  }
}
