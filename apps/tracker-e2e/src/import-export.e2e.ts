import { readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { readEntries, readMeta, readOutput } from './fixtures/disk';

test('exports a collection through the dialog and writes its seeded resources to JSON', async ({
  project,
  collectionsPage,
  exportDialog,
  page,
}) => {
  await project.addCollection();
  await project.addResource({
    key: 'common.greeting',
    baseValue: 'Hello',
    translations: [{ locale: 'fr-ca', value: 'Bonjour', status: 'new' }],
  });
  await project.addResource({
    key: 'common.farewell',
    baseValue: 'Goodbye',
    translations: [{ locale: 'fr-ca', value: 'Au revoir', status: 'new' }],
  });
  const output = join(project.artifactsFolder, 'export');
  await collectionsPage.goto();
  await collectionsPage.openExport(project.collectionName);
  await exportDialog.exportJson(output);
  await expect(exportDialog.dialog).toBeHidden();
  await expect(page.getByTestId('export-strip')).toContainText('Exported');
  await expect
    .poll(() => readOutput(join(output, 'fr-ca.json')))
    .toEqual({
      common: { greeting: 'Bonjour', farewell: 'Au revoir' },
    });
  expect(await readdir(output)).toEqual(['fr-ca.json']);
});

test('uploads and imports translations through the dialog and persists values and statuses', async ({
  project,
  collectionsPage,
  importDialog,
  page,
}, testInfo) => {
  const folder = join(project.artifactsFolder, 'import');
  await project.addCollection({ importFolder: folder });
  await project.addResource({ key: 'common.greeting', baseValue: 'Hello' });
  const input = testInfo.outputPath('fr-ca.json');
  try {
    await writeFile(input, JSON.stringify({ 'common.greeting': { value: 'Bonjour', baseValue: 'Hello' } }));
    await collectionsPage.goto();
    await collectionsPage.openImport(project.collectionName);
    await expect(importDialog.uploadButton).toBeEnabled();
    await importDialog.upload(input);
    await expect(importDialog.dialog.getByTestId('file-row-fr-ca.json').getByRole('checkbox')).toBeChecked();
    await importDialog.submitButton.click();
    await expect(importDialog.dialog).toBeHidden();
    await expect(page.getByTestId('import-strip')).toContainText('Imported');
    const resourceFolder = join(project.translationsFolder, 'common');
    expect(await readEntries(resourceFolder)).toMatchObject({ greeting: { source: 'Hello', 'fr-ca': 'Bonjour' } });
    expect(await readMeta(resourceFolder)).toMatchObject({ greeting: { 'fr-ca': { status: 'translated' } } });
  } finally {
    await rm(input, { force: true });
  }
});

for (const { strategy, status } of [
  { strategy: 'translation-service', status: 'translated' },
  { strategy: 'verification', status: 'verified' },
  { strategy: 'migration', status: 'translated' },
  { strategy: 'update', status: 'verified' },
] as const) {
  test(`imports conflicting translations with the ${strategy} strategy and stores ${status} status`, async ({
    project,
    collectionsPage,
    importDialog,
    page,
  }, testInfo) => {
    await project.addCollection({ importFolder: join(project.artifactsFolder, 'import') });
    await project.addResource({
      key: 'common.greeting',
      baseValue: 'Hello',
      translations: [{ locale: 'fr-ca', value: 'Bonjour', status: strategy === 'update' ? 'verified' : 'new' }],
    });
    const input = testInfo.outputPath('fr-ca.json');
    try {
      await writeFile(
        input,
        JSON.stringify({ 'common.greeting': { value: 'Salut', baseValue: 'Hello', status: 'verified' } }),
      );
      await collectionsPage.goto();
      await collectionsPage.openImport(project.collectionName);
      await importDialog.upload(input);
      await expect(importDialog.dialog.getByTestId('file-row-fr-ca.json').getByRole('checkbox')).toBeChecked();
      await importDialog.chooseStrategy(strategy);
      await expect(importDialog.strategy(strategy)).toBeChecked();
      await importDialog.submitButton.click();
      await expect(importDialog.dialog).toBeHidden();
      await expect(page.getByTestId('import-strip')).toContainText('Imported');
      const folder = join(project.translationsFolder, 'common');
      expect(await readEntries(folder)).toMatchObject({ greeting: { source: 'Hello', 'fr-ca': 'Salut' } });
      expect(await readMeta(folder)).toMatchObject({ greeting: { 'fr-ca': { status } } });
    } finally {
      await rm(input, { force: true });
    }
  });
}

test('keeps the status from the file when Keep status from file is on', async ({
  project,
  collectionsPage,
  importDialog,
  page,
}, testInfo) => {
  await project.addCollection({ importFolder: join(project.artifactsFolder, 'import') });
  await project.addResource({
    key: 'common.greeting',
    baseValue: 'Hello',
    translations: [{ locale: 'fr-ca', value: 'Bonjour', status: 'new' }],
  });
  const input = testInfo.outputPath('fr-ca.json');
  try {
    await writeFile(
      input,
      JSON.stringify({ 'common.greeting': { value: 'Salut', baseValue: 'Hello', status: 'verified' } }),
    );
    await collectionsPage.goto();
    await collectionsPage.openImport(project.collectionName);
    await importDialog.upload(input);
    await expect(importDialog.dialog.getByTestId('file-row-fr-ca.json').getByRole('checkbox')).toBeChecked();
    await importDialog.keepStatusFromFile();
    await expect(importDialog.dialog.getByRole('switch', { name: 'Keep status from file', exact: true })).toBeChecked();
    await importDialog.submitButton.click();
    await expect(importDialog.dialog).toBeHidden();
    await expect(page.getByTestId('import-strip')).toContainText('Imported');
    const folder = join(project.translationsFolder, 'common');
    expect(await readEntries(folder)).toMatchObject({ greeting: { 'fr-ca': 'Salut' } });
    expect(await readMeta(folder)).toMatchObject({ greeting: { 'fr-ca': { status: 'verified' } } });
  } finally {
    await rm(input, { force: true });
  }
});

test('imports a changed base value with Migration and marks existing translations stale', async ({
  project,
  collectionsPage,
  importDialog,
  page,
}, testInfo) => {
  await project.addCollection({ importFolder: join(project.artifactsFolder, 'import') });
  await project.addResource({
    key: 'common.greeting',
    baseValue: 'Hello',
    translations: [{ locale: 'fr-ca', value: 'Bonjour', status: 'verified' }],
  });
  const input = testInfo.outputPath('en.json');
  try {
    await writeFile(input, JSON.stringify({ 'common.greeting': 'Welcome' }));
    await collectionsPage.goto();
    await collectionsPage.openImport(project.collectionName);
    await importDialog.chooseStrategy('migration');
    await expect(importDialog.strategy('migration')).toBeChecked();
    await importDialog.dialog.getByTestId('rail-source').click();
    await importDialog.upload(input);
    await expect(importDialog.dialog.getByTestId('file-row-en.json').getByRole('checkbox')).toBeChecked();
    await importDialog.submitButton.click();
    await expect(importDialog.dialog).toBeHidden();
    await expect(page.getByTestId('import-strip')).toContainText('Imported');
    const folder = join(project.translationsFolder, 'common');
    expect(await readEntries(folder)).toMatchObject({ greeting: { source: 'Welcome', 'fr-ca': 'Bonjour' } });
    expect(await readMeta(folder)).toMatchObject({ greeting: { 'fr-ca': { status: 'stale' } } });
  } finally {
    await rm(input, { force: true });
  }
});
