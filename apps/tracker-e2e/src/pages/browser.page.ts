import type { Locator, Page } from '@playwright/test';

export class BrowserPage {
  constructor(readonly page: Page) {}

  readonly folderTree = this.page.getByRole('tree');
  readonly search = this.page.getByRole('textbox', { name: 'Search translations', exact: true });
  readonly clearSearch = this.page
    .getByRole('button', { name: 'Clear Search', exact: true })
    .filter({ hasText: 'Clear Search' });
  readonly rows = this.page.getByTestId(/^resource-row-/);
  readonly addButton = this.page.getByRole('button', { name: 'Add Translation', exact: true });
  readonly deleteDialog = this.page.getByRole('dialog', { name: 'Delete Resource', exact: true });

  readonly addFolderButton = this.page.getByRole('button', { name: 'Add folder', exact: true });
  readonly deleteFolderDialog = this.page.getByRole('dialog', { name: 'Delete Folder', exact: true });
  readonly moveFolderDialog = this.page.getByRole('dialog', { name: 'Move Folder', exact: true });

  async createFolder(name: string): Promise<void> {
    await this.addFolderButton.click();
    const input = this.folderTree.getByRole('textbox');
    await input.fill(name);
    await input.press('Enter');
  }

  async openDeleteFolder(name: string): Promise<void> {
    await this.folder(name)
      .getByRole('button', { name: `Delete folder ${name}`, exact: true })
      .click();
  }

  async dragToFolder(handle: Locator, destination: string): Promise<void> {
    await handle.scrollIntoViewIfNeeded();
    await this.folder(destination).scrollIntoViewIfNeeded();
    const source = await handle.boundingBox();
    const target = await this.folder(destination).boundingBox();
    if (!source || !target) throw new Error('Drag source or destination is not visible');
    await this.page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await this.page.mouse.down();
    // Cross the CDK drag threshold before entering the destination drop list.
    await this.page.mouse.move(source.x + source.width / 2 + 12, source.y + source.height / 2, { steps: 5 });
    await this.page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 20 });
    await this.page.mouse.up();
  }

  async moveResource(key: string, destination: string): Promise<void> {
    await this.dragToFolder(this.row(key).getByTestId('resource-drag-handle'), destination);
  }

  async moveFolder(name: string, destination: string): Promise<void> {
    await this.dragToFolder(this.folder(name).getByTestId('folder-drag-handle'), destination);
  }

  async goto(collection: string): Promise<void> {
    await this.page.goto(`/browser/${encodeURIComponent(collection)}`);
  }

  folder(name: string) {
    return this.folderTree.getByRole('treeitem', { name: `Folder ${name}`, exact: true });
  }

  row(key: string) {
    return this.page.getByTestId(`resource-row-${key}`);
  }

  statusFilter(status: string) {
    return this.page.getByRole('group', { name: 'Filter by status', exact: true }).getByRole('button', {
      name: new RegExp(`^${status} \\d+$`),
    });
  }

  async selectLocale(locale: string): Promise<void> {
    await this.page.getByTestId('locale-filter-trigger').click();
    await this.page.getByRole('menuitemradio', { name: `${locale} (not selected)`, exact: true }).press('Enter');
  }

  async edit(key: string): Promise<void> {
    await this.row(key).getByRole('button', { name: 'Edit translation', exact: true }).click();
  }

  async delete(key: string): Promise<void> {
    await this.row(key).getByRole('button', { name: 'More actions', exact: true }).click();
    await this.page.getByRole('menuitem', { name: 'Delete translation', exact: true }).click();
    await this.deleteDialog.getByRole('button', { name: 'Delete', exact: true }).click();
  }
}
