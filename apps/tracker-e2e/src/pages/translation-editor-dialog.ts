import type { Page } from '@playwright/test';

export class TranslationEditorDialog {
  constructor(readonly page: Page) {}

  // Material's container and the template both expose dialog roles; select the inner form dialog.
  readonly dialog = this.page
    .getByRole('dialog', { name: /^(New translation|Edit translation)$/ })
    .filter({ hasNot: this.page.getByRole('dialog') });
  readonly key = this.dialog.getByRole('textbox', { name: /^Key / });
  readonly baseValue = this.dialog.getByRole('textbox', { name: 'English en Base', exact: true });
  readonly comment = this.dialog.getByRole('textbox', { name: /^Comment / });
  readonly collisionError = this.dialog.getByTestId('key-collision-error');
  readonly conflictDialog = this.page.getByRole('dialog', { name: 'Translation Key Already Exists', exact: true });
  readonly createButton = this.dialog.getByRole('button', { name: 'Create translation', exact: true });
  readonly localesDrawer = this.dialog.getByRole('group', { name: 'Other locales', exact: true });
  readonly readOnlyNotice = this.dialog.getByRole('status').filter({
    hasText: "This collection is read-only — you're viewing this resource in read-only mode.",
  });

  readonly runtimeConfirmDialog = this.page.getByRole('dialog', {
    name: "Plain Transloco can't render this",
    exact: true,
  });

  readonly exactMatchMessage = this.dialog.getByTestId('similar-exact-caption');
  readonly preferredTermHint = this.dialog.getByTestId('preferred-term-advisory');
  readonly keyCopied = this.page.getByRole('status').filter({ hasText: 'Similar resource key copied' });

  similarValue(value: string) {
    return this.dialog.getByRole('button').filter({ has: this.page.getByText(value, { exact: true }) });
  }

  readonly folderPicker = this.page.getByRole('dialog', { name: 'Folder tree', exact: true });

  async chooseFolder(name: string): Promise<void> {
    await this.dialog.getByTestId('location-pill').click();
    await this.folderPicker.getByRole('treeitem', { name: `Folder ${name}`, exact: true }).click();
    await this.folderPicker.getByTestId('use-this-folder').click();
  }

  tag(name: string) {
    return this.dialog.getByRole('button', { name: `Remove ${name}`, exact: true });
  }

  async create(key: string, baseValue: string, comment: string): Promise<void> {
    await this.key.fill(key);
    await this.baseValue.fill(baseValue);
    await this.comment.fill(comment);
    await this.dialog.getByRole('button', { name: 'Create translation', exact: true }).click();
  }

  async chooseDifferentKey(): Promise<void> {
    await this.conflictDialog.getByRole('button', { name: 'Choose Different Key', exact: true }).click();
  }

  async addTag(tag: string): Promise<void> {
    const input = this.dialog.getByRole('combobox', { name: 'Tags optional', exact: true });
    await input.fill(tag);
    await input.press('Enter');
  }

  async save(): Promise<void> {
    await this.dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  }

  async verifyTranslation(localeName: string, value: string): Promise<void> {
    await this.dialog.getByRole('button', { name: /^Other locales / }).click();
    await this.localesDrawer.getByRole('textbox', { name: `${localeName} Translation`, exact: true }).fill(value);
    await this.localesDrawer.getByRole('button', { name: 'Status', exact: true }).click();
    await this.page.getByRole('menuitem', { name: 'Verified', exact: true }).click();
    await this.localesDrawer.getByRole('button', { name: 'Done', exact: true }).click();
    await this.save();
  }
}
