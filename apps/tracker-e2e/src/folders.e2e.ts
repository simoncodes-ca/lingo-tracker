import { join } from 'node:path';
import { expect, test } from './fixtures';
import { directoryExists } from './fixtures/disk';

test('creates a folder from the tree and persists its directory', async ({ project, browserPage, page }) => {
  await project.addCollection();
  await browserPage.goto(project.collectionName);
  await browserPage.createFolder('new-folder');
  await expect(browserPage.folder('new-folder')).toBeVisible();
  await expect.poll(() => directoryExists(join(project.translationsFolder, 'new-folder'))).toBe(true);
  await page.reload();
  await expect(browserPage.folder('new-folder')).toBeVisible();
});

test('deletes a populated folder after confirmation and removes its directory', async ({ project, browserPage }) => {
  await project.addCollection();
  await project.addResource({ key: 'obsolete.greeting', baseValue: 'Hello' });
  await project.addResource({ key: 'keep.greeting', baseValue: 'Keep' });
  await browserPage.goto(project.collectionName);
  await expect(browserPage.folder('obsolete')).toBeVisible();
  await browserPage.openDeleteFolder('obsolete');
  await expect(browserPage.deleteFolderDialog).toBeVisible();
  await expect(browserPage.deleteFolderDialog).toContainText('Delete "obsolete" and all its contents?');
  await browserPage.deleteFolderDialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(browserPage.deleteFolderDialog).toBeHidden();
  await expect(browserPage.folder('obsolete')).toBeHidden();
  await expect.poll(() => directoryExists(join(project.translationsFolder, 'obsolete'))).toBe(false);
  await expect(browserPage.folder('keep')).toBeVisible();
});
