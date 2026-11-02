import type { Page } from '@playwright/test';

export class AppHeader {
  constructor(readonly page: Page) {}

  // These controls have translated names, so test IDs also work after switching language.
  readonly localePicker = this.page.getByTestId('locale-picker');

  readonly themeButton = this.page.getByRole('button', { name: /^Theme:/ });

  async setTheme(theme: 'Light' | 'Dark'): Promise<void> {
    await this.themeButton.click();
    const item = this.page.getByRole('menuitem', { name: theme });
    await item.click();
    await item.waitFor({ state: 'detached' });
  }

  async selectLocale(locale: string): Promise<void> {
    await this.localePicker.click();
    await this.page.getByTestId(`locale-option-${locale}`).click();
  }
}
