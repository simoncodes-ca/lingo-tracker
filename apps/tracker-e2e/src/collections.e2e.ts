import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { readConfig, readEntries, readMeta } from './fixtures/disk';
import type { Project } from './fixtures/project';

test('creates a collection in the dialog and persists its translations folder', async ({
  project,
  server,
  collectionsPage,
}) => {
  const name = `${project.collectionName}-ui`;
  const folder = join(project.translationsFolder, 'ui');
  await collectionsPage.goto();
  await collectionsPage.create(name, folder);
  await expect(collectionsPage.createDialog).toBeHidden();
  await expect(collectionsPage.collection(name)).toBeVisible();
  await expect
    .poll(async () => (await readConfig(server.projectRoot)).collections[name]?.translationsFolder)
    .toBe(folder);
});

test('adds a collection locale in the dialog and persists it', async ({ project, server, collectionsPage }) => {
  const name = await project.addCollection();
  await project.addResource({
    key: 'greeting',
    baseValue: 'Hello',
    translations: [{ locale: 'fr-ca', value: 'Bonjour' }],
  });
  await collectionsPage.goto();
  await collectionsPage.addLocale(name, 'de');
  await expect(collectionsPage.editDialog).toBeHidden();
  await expect(collectionsPage.card(name).getByRole('list', { name: 'Locales', exact: true })).toContainText('de');
  await expect.poll(async () => (await readConfig(server.projectRoot)).collections[name]?.locales).toContain('de');
  expect(await readEntries(project.translationsFolder)).toHaveProperty('greeting');
});

test('deletes a collection after confirmation and removes it from config', async ({
  project,
  server,
  collectionsPage,
}) => {
  const name = await project.addCollection();
  await collectionsPage.goto();
  await expect(collectionsPage.collection(name)).toBeVisible();
  await collectionsPage.delete(name);
  await expect(collectionsPage.deleteDialog).toBeHidden();
  await expect(collectionsPage.collection(name)).toBeHidden();
  await expect.poll(async () => (await readConfig(server.projectRoot)).collections).not.toHaveProperty(name);
});

test('read-only collections disable Import but keep collection Edit and Delete available', async ({
  project,
  server,
  page,
  collectionsPage,
}) => {
  const name = await project.addCollection({ readOnly: true });
  const writableName = `${project.collectionName}-writable`;
  await collectionsPage.goto();
  await collectionsPage.create(writableName, join(project.translationsFolder, 'writable'));
  await expect(collectionsPage.createDialog).toBeHidden();
  await collectionsPage.openActions(writableName);
  await expect(collectionsPage.importAction).toBeEnabled();
  await expect(collectionsPage.editAction).toBeEnabled();
  await expect(collectionsPage.deleteAction).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(collectionsPage.card(name)).toContainText(
    "This collection is read-only. Its resources can't be modified.",
  );
  await collectionsPage.openActions(name);
  await expect(collectionsPage.importAction).toBeDisabled();
  await expect(collectionsPage.editAction).toBeEnabled();
  await expect(collectionsPage.deleteAction).toBeEnabled();
  const config = await readConfig(server.projectRoot);
  expect(config.collections[name]?.readOnly).toBe(true);
  expect(config.collections[writableName]?.translationsFolder).toBe(join(project.translationsFolder, 'writable'));
});

async function seedLocales(project: Project): Promise<void> {
  await project.addCollection({ locales: ['en', 'fr-ca', 'de'] });
  await project.addResource({
    key: 'greeting',
    baseValue: 'Hello',
    translations: [
      { locale: 'fr-ca', value: 'Bonjour', status: 'verified' },
      { locale: 'de', value: 'Hallo', status: 'translated' },
    ],
  });
}

test('confirms locale removal and removes only that locale from config, values and metadata', async ({
  project,
  server,
  collectionsPage,
}) => {
  await seedLocales(project);
  await collectionsPage.goto();
  await collectionsPage.removeLocale(project.collectionName, 'fr-ca');
  await expect(collectionsPage.removeLocalesDialog).toBeVisible();
  await expect(collectionsPage.removeLocalesDialog).toContainText(
    'Removing fr-ca will permanently delete all translation data',
  );
  await collectionsPage.removeLocalesDialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(collectionsPage.removeLocalesDialog).toBeHidden();
  await expect(collectionsPage.editDialog).toBeHidden();
  await expect
    .poll(async () => (await readConfig(server.projectRoot)).collections[project.collectionName]?.locales)
    .toEqual(['en', 'de']);
  expect(await readEntries(project.translationsFolder)).toEqual({ greeting: { source: 'Hello', de: 'Hallo' } });
  const baseChecksum = createHash('md5').update('Hello').digest('hex');
  expect(await readMeta(project.translationsFolder)).toEqual({
    greeting: {
      en: { checksum: baseChecksum },
      de: {
        checksum: createHash('md5').update('Hallo').digest('hex'),
        baseChecksum,
        status: 'translated',
      },
    },
  });
});

test('cancels locale removal and keeps config, values and metadata unchanged', async ({
  project,
  server,
  collectionsPage,
}) => {
  await seedLocales(project);
  const config = (await readConfig(server.projectRoot)).collections[project.collectionName];
  const entries = await readEntries(project.translationsFolder);
  const meta = await readMeta(project.translationsFolder);
  await collectionsPage.goto();
  await collectionsPage.removeLocale(project.collectionName, 'fr-ca');
  await expect(collectionsPage.removeLocalesDialog).toBeVisible();
  await expect(collectionsPage.removeLocalesDialog).toContainText(
    'Removing fr-ca will permanently delete all translation data',
  );
  await collectionsPage.removeLocalesDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(collectionsPage.removeLocalesDialog).toBeHidden();
  await expect(collectionsPage.editDialog).toBeVisible();
  // Cancelling the confirmation keeps the removal staged until the Edit draft is discarded.
  await expect(collectionsPage.localeChip('fr-ca')).toBeHidden();
  await collectionsPage.editDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(collectionsPage.editDialog).toBeHidden();
  await collectionsPage.openEdit(project.collectionName);
  await expect(collectionsPage.localeChip('fr-ca')).toBeVisible();
  expect((await readConfig(server.projectRoot)).collections[project.collectionName]).toEqual(config);
  expect(await readEntries(project.translationsFolder)).toEqual(entries);
  expect(await readMeta(project.translationsFolder)).toEqual(meta);
});
