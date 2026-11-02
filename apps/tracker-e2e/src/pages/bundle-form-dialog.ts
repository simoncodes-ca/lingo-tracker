import type { Page } from '@playwright/test';

export class BundleFormDialog {
  constructor(readonly page: Page) {}

  readonly dialog = this.page
    .getByRole('dialog', { name: /^(New bundle|Edit bundle)$/ })
    .filter({ hasNot: this.page.getByRole('dialog') });

  readonly matchingRules = this.dialog
    .getByRole('radiogroup', { name: 'Entries', exact: true })
    .getByRole('radio', { name: 'Only matching rules', exact: true });
  readonly preview = this.dialog.getByTestId('preview-column');
  readonly dryRun = this.preview.getByTestId('dry-run');
  readonly exampleKey = this.preview.getByTestId('example-key');

  async setSelectionRule(pattern: string, tag?: string): Promise<void> {
    await this.dialog.getByTestId('rail-coll-0').click();
    await this.matchingRules.click();
    await this.dialog.getByTestId('add-rule').click();
    await this.dialog.getByRole('textbox', { name: 'Key pattern', exact: true }).fill(pattern);
    if (tag) {
      const tags = this.dialog.getByRole('textbox', { name: 'Tags', exact: true });
      await tags.fill(tag);
      await tags.press('Enter');
    }
  }

  async fillOutput(name: string, outputFolder: string): Promise<void> {
    await this.dialog.getByTestId('rail-output').click();
    await this.dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
    await this.dialog.getByRole('textbox', { name: 'Output folder', exact: true }).fill(outputFolder);
    await this.dialog.getByRole('textbox', { name: 'File name pattern', exact: true }).fill('{locale}');
  }

  async submit(): Promise<void> {
    await this.dialog.getByRole('button', { name: 'Create bundle', exact: true }).click();
  }

  async edit(outputFolder: string, pattern: string): Promise<void> {
    await this.dialog.getByTestId('rail-output').click();
    await this.dialog.getByRole('textbox', { name: 'Output folder', exact: true }).fill(outputFolder);
    await this.dialog.getByRole('textbox', { name: 'File name pattern', exact: true }).fill(pattern);
    await this.dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  }

  async create(name: string, outputFolder: string): Promise<void> {
    await this.dialog.getByTestId('rail-output').click();
    await this.dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
    await this.dialog.getByRole('textbox', { name: 'Output folder', exact: true }).fill(outputFolder);
    await this.dialog.getByRole('textbox', { name: 'File name pattern', exact: true }).fill('{locale}');
    await this.dialog.getByRole('button', { name: 'Create bundle', exact: true }).click();
  }
}
