import type { Page } from '@playwright/test';

export class CollectionsPage {
  constructor(readonly page: Page) {}

  readonly createDialog = this.page.getByRole('dialog', { name: 'Create Collection', exact: true });
  readonly editDialog = this.page.getByRole('dialog', { name: 'Edit Collection', exact: true });
  readonly deleteDialog = this.page.getByRole('dialog', { name: 'Delete Collection', exact: true });
  readonly removeLocalesDialog = this.page.getByRole('dialog', { name: 'Remove Locales?', exact: true });
  readonly editAction = this.page.getByRole('menuitem', { name: 'Edit', exact: true });
  readonly deleteAction = this.page.getByRole('menuitem', { name: 'Delete', exact: true });
  readonly importAction = this.page.getByTestId('card-import');
  readonly title = this.page.getByTestId('collections-title');

  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  collection(name: string) {
    return this.page.getByRole('heading', { name, level: 3, exact: true });
  }

  card(name: string) {
    return this.page.getByTestId(`collection-card-${name}`);
  }

  async openActions(name: string): Promise<void> {
    await this.card(name).getByRole('button', { name: 'More actions for collection', exact: true }).click();
  }

  localeChip(locale: string) {
    return this.editDialog
      .getByRole('list', { name: 'Locales', exact: true })
      .getByRole('listitem')
      .filter({ has: this.page.getByText(locale, { exact: true }) });
  }

  async openEdit(name: string): Promise<void> {
    await this.openActions(name);
    await this.editAction.click();
  }

  async openExport(name: string): Promise<void> {
    await this.openActions(name);
    await this.page.getByRole('menuitem', { name: 'Export…', exact: true }).click();
  }

  async openImport(name: string): Promise<void> {
    await this.openActions(name);
    await this.importAction.click();
  }

  async create(name: string, translationsFolder: string): Promise<void> {
    await this.page.getByRole('button', { name: /^(Create your first collection|Add collection)$/ }).click();
    await this.createDialog.getByRole('textbox', { name: 'Collection name', exact: true }).fill(name);
    await this.createDialog.getByRole('textbox', { name: 'Translations folder', exact: true }).fill(translationsFolder);
    await this.createDialog.getByRole('button', { name: 'Create Collection', exact: true }).click();
  }

  async removeLocale(name: string, locale: string): Promise<void> {
    await this.openActions(name);
    await this.editAction.click();
    await this.editDialog.getByRole('button', { name: `Remove locale ${locale}`, exact: true }).click();
    await this.editDialog.getByRole('button', { name: 'Save', exact: true }).click();
  }

  async addLocale(name: string, locale: string): Promise<void> {
    await this.openActions(name);
    await this.editAction.click();
    const input = this.editDialog.getByRole('textbox', { name: 'Add Locale', exact: true });
    await input.fill(locale);
    await input.press('Enter');
    await this.editDialog.getByRole('button', { name: 'Save', exact: true }).click();
  }

  async delete(name: string): Promise<void> {
    await this.openActions(name);
    await this.deleteAction.click();
    await this.deleteDialog.getByRole('button', { name: 'Delete', exact: true }).click();
  }
}
