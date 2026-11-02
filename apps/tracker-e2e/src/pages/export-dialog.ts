import type { Page } from '@playwright/test';

export class ExportDialog {
  constructor(readonly page: Page) {}

  readonly dialog = this.page
    .getByRole('dialog', { name: 'Export translations', exact: true })
    .filter({ hasNot: this.page.getByRole('dialog') });

  async exportJson(outputFolder: string): Promise<void> {
    await this.dialog.getByTestId('rail-format').click();
    await this.dialog.getByRole('radio', { name: 'JSON', exact: true }).click();
    await this.dialog.getByTestId('rail-output').click();
    await this.dialog.getByRole('textbox', { name: 'Output folder', exact: true }).fill(outputFolder);
    await this.dialog.getByRole('textbox', { name: 'File name pattern', exact: true }).fill('{locale}');
    await this.dialog.getByTestId('submit').click();
  }
}
