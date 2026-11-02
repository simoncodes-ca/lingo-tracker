import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from './fixtures';

test('switches to German and restores the translated UI after reload', async ({
  page,
  project,
  collectionsPage,
  appHeader,
}) => {
  const german: { collections: { title: string } } = JSON.parse(
    await readFile(resolve(__dirname, '../../tracker/src/assets/i18n/de.json'), 'utf8'),
  );
  await project.addCollection();
  await collectionsPage.goto();
  await expect(collectionsPage.title).toHaveText('Collections');
  expect(german.collections.title).not.toBe('Collections');
  await appHeader.selectLocale('de');
  await expect(collectionsPage.title).toHaveText(german.collections.title);
  await expect(appHeader.localePicker).toContainText('DE');
  await page.reload();
  await expect(appHeader.localePicker).toContainText('DE');
  await expect(collectionsPage.title).toHaveText(german.collections.title);
});
