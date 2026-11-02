import type { Page } from '@playwright/test';
import type { ImportStrategyDto } from '@simoncodes-ca/data-transfer';

export class ImportDialog {
  constructor(readonly page: Page) {}

  readonly dialog = this.page
    .getByRole('dialog', { name: 'Import translations', exact: true })
    .filter({ hasNot: this.page.getByRole('dialog') });
  readonly uploadButton = this.dialog.getByRole('button', { name: 'Upload files…', exact: true });
  readonly submitButton = this.dialog.getByTestId('submit');

  strategy(name: ImportStrategyDto) {
    return this.dialog.getByTestId(`strategy-${name}`);
  }

  async chooseStrategy(strategy: ImportStrategyDto): Promise<void> {
    await this.dialog.getByTestId('rail-strategy').click();
    // The native radio is visually hidden behind its card, so select it from the keyboard.
    await this.strategy(strategy).press('Space');
  }

  async keepStatusFromFile(): Promise<void> {
    await this.dialog.getByTestId('rail-options').click();
    // Advanced starts open for every strategy except Migration.
    const advanced = this.dialog.getByTestId('advanced-toggle');
    if ((await advanced.getAttribute('aria-expanded')) !== 'true') await advanced.click();
    await this.dialog.getByRole('switch', { name: 'Keep status from file', exact: true }).click();
  }

  async upload(path: string): Promise<void> {
    await this.dialog.getByTestId('upload-input').setInputFiles(path);
  }
}
