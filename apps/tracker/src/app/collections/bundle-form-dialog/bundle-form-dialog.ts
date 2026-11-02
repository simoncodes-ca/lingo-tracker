import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import type { TokenCasingDto } from '@simoncodes-ca/data-transfer';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import { ChipInput } from '../../shared/chip-input/chip-input';
import { CONFIG_FILE_MARKUP, codeMarkup } from '../../shared/code-markup';
import { CollectionsStore } from '../store/collections.store';
import { injectBundleFormSubmit } from '../store/dialog-config-submit-adapters';
import type { MergeStrategy } from './bundle-draft';
import { BundleForm } from './bundle-form';
import type { BundleFormDialogData, BundleFormResult } from './bundle-form-dialog-data';
import { LOCALE_PLACEHOLDER } from './bundle-output-preview';
import { SegmentedControl, type SegmentOption } from './segmented-control';

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
  readonly store = inject(CollectionsStore);

  readonly #submit = injectBundleFormSubmit();

  readonly TOKENS = TRACKER_TOKENS;
  readonly configFileMarkup = CONFIG_FILE_MARKUP;
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

  readonly model = new BundleForm({
    data: this.#data,
    collectionNames: () => this.store.collectionEntries().map((entry) => entry.name),
    bundleNames: () => this.store.bundleEntries().map((entry) => entry.name),
    locales: () => this.store.config()?.locales ?? [],
    baseLocale: () => this.store.config()?.baseLocale ?? '',
    tokenCasing: () => this.store.config()?.tokenCasing ?? 'upperCase',
    icuTransform: () => this.store.config()?.transformICUToTransloco ?? true,
    env: this.#submit.env,
    dryRun: (request) => this.store.dryRunBundle(request),
  });
  /** True from submit until the server has answered. */
  readonly saving = this.model.saving;
  readonly codeMarkup = codeMarkup;
  readonly previewOpen = signal(false);
  readonly writesHintParams = computed(() => {
    const files = this.model.preview.patternFiles();
    return { examples: files.slice(0, 2).map(codeMarkup).join(', '), count: files.length };
  });

  togglePreview(): void {
    this.previewOpen.update((open) => !open);
  }

  onCancel(): void {
    this.#dialogRef.close(undefined);
  }

  onSubmit(): Promise<void> {
    return this.model.submit({ dialog: this.#dialogRef, write: this.#submit.write });
  }
}
