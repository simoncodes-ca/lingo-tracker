import type { Page } from '@playwright/test';

export class BundlesPage {
  constructor(readonly page: Page) {}

  readonly bundles = this.page.getByRole('complementary', { name: 'Output Bundles', exact: true });
  readonly deleteDialog = this.page.getByRole('dialog', { name: 'Delete Bundle', exact: true });

  bundle(name: string) {
    return this.bundles.getByRole('heading', { name, level: 3, exact: true });
  }

  card(name: string) {
    return this.bundles.getByTestId(`bundle-card-${name}`);
  }

  runStatus(name: string) {
    return this.card(name).getByRole('status');
  }

  async edit(name: string): Promise<void> {
    await this.card(name).getByRole('button', { name: 'More actions for bundle', exact: true }).click();
    await this.page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  }

  async openCreate(): Promise<void> {
    await this.bundles.getByRole('button', { name: /^(Create bundle|Add bundle)$/ }).click();
  }

  async delete(name: string): Promise<void> {
    await this.card(name).getByRole('button', { name: 'More actions for bundle', exact: true }).click();
    await this.page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await this.deleteDialog.getByRole('button', { name: 'Delete', exact: true }).click();
  }

  async generate(name: string): Promise<void> {
    await this.card(name)
      .getByRole('button', { name: `Generate bundle ${name}`, exact: true })
      .click();
  }
}
