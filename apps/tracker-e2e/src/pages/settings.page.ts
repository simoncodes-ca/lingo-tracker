import type { Page } from '@playwright/test';

export class SettingsPage {
  constructor(readonly page: Page) {}

  readonly title = this.page.getByRole('heading', { name: 'Settings', exact: true });
  readonly protectedTerms = this.page.getByRole('region', { name: 'Global Protected Terms', exact: true });
  readonly newTerm = this.protectedTerms.getByRole('textbox', { name: 'New protected term', exact: true });
  readonly termsList = this.protectedTerms.getByRole('list', { name: 'Protected terms', exact: true });
  readonly saveButton = this.page.getByRole('button', { name: 'Save', exact: true });

  async addProtectedTerm(term: string): Promise<void> {
    await this.newTerm.fill(term);
    await this.protectedTerms.getByRole('button', { name: 'Add', exact: true }).click();
  }

  async goto(): Promise<void> {
    await this.page.goto('/settings');
  }
}
