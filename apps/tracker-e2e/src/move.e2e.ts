import { join } from 'node:path';
import { expect, test } from './fixtures';
import { directoryExists, readEntries, readMeta } from './fixtures/disk';

test('moves a resource by dragging and preserves its values and metadata in the destination folder', async ({
  project,
  browserPage,
}) => {
  await project.addCollection();
  await project.addResource({
    key: 'source.greeting',
    baseValue: 'Hello',
    comment: 'Welcome message',
    translations: [{ locale: 'fr-ca', value: 'Bonjour', status: 'verified' }],
  });
  await project.addResource({ key: 'source.keep', baseValue: 'Keep' });
  await project.addResource({ key: 'destination.keep', baseValue: 'Destination' });
  const source = join(project.translationsFolder, 'source');
  const destination = join(project.translationsFolder, 'destination');
  const entry = (await readEntries(source)).greeting;
  const meta = (await readMeta(source)).greeting;
  await browserPage.goto(project.collectionName);
  await expect(browserPage.row('source.greeting')).toBeVisible();
  await browserPage.moveResource('source.greeting', 'destination');
  await expect.poll(async () => (await readEntries(destination)).greeting).toEqual(entry);
  await expect.poll(async () => (await readMeta(destination)).greeting).toEqual(meta);
  await expect.poll(() => readEntries(source)).not.toHaveProperty('greeting');
  await expect.poll(() => readMeta(source)).not.toHaveProperty('greeting');
  await browserPage.folder('destination').click();
  await expect(browserPage.row('destination.greeting')).toContainText('Hello');
  await browserPage.folder('source').click();
  await expect(browserPage.row('source.keep')).toBeVisible();
  await expect(browserPage.row('source.greeting')).toBeHidden();
});

test('moves a folder under another folder after confirmation and relocates its files', async ({
  project,
  browserPage,
}) => {
  await project.addCollection();
  await project.addResource({ key: 'source.greeting', baseValue: 'Hello' });
  await project.addResource({ key: 'destination.keep', baseValue: 'Keep' });
  const source = join(project.translationsFolder, 'source');
  const destination = join(project.translationsFolder, 'destination', 'source');
  const entries = await readEntries(source);
  const meta = await readMeta(source);
  await browserPage.goto(project.collectionName);
  await expect(browserPage.folder('source')).toBeVisible();
  await browserPage.moveFolder('source', 'destination');
  await expect(browserPage.moveFolderDialog).toBeVisible();
  await expect(browserPage.moveFolderDialog).toContainText(
    'Move folder "source" and all its contents to "destination"?',
  );
  await browserPage.moveFolderDialog.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(browserPage.moveFolderDialog).toBeHidden();
  await expect.poll(() => directoryExists(source)).toBe(false);
  await expect.poll(() => readEntries(destination)).toEqual(entries);
  await expect.poll(() => readMeta(destination)).toEqual(meta);
  await browserPage.folder('destination').press('ArrowRight');
  await expect(browserPage.folder('source')).toHaveCount(1);
  await browserPage.folder('source').click();
  await expect(browserPage.row('destination.source.greeting')).toBeVisible();
});

test('moves a resource through the editor folder picker and preserves its values and metadata', async ({
  project,
  browserPage,
  translationEditor,
}) => {
  await project.addCollection();
  await project.addResource({
    key: 'source.greeting',
    baseValue: 'Hello',
    comment: 'Welcome message',
    translations: [{ locale: 'fr-ca', value: 'Bonjour', status: 'verified' }],
  });
  await project.addResource({ key: 'source.keep', baseValue: 'Keep' });
  await project.addResource({ key: 'destination.keep', baseValue: 'Destination' });
  const source = join(project.translationsFolder, 'source');
  const destination = join(project.translationsFolder, 'destination');
  const entry = (await readEntries(source)).greeting;
  const meta = (await readMeta(source)).greeting;
  await browserPage.goto(project.collectionName);
  await browserPage.edit('source.greeting');
  await translationEditor.chooseFolder('destination');
  await expect(translationEditor.folderPicker).toBeHidden();
  await expect(translationEditor.dialog.getByTestId('location-pill')).toContainText('destination');
  await translationEditor.save();
  await expect(translationEditor.dialog).toBeHidden();
  await expect.poll(async () => (await readEntries(destination)).greeting).toEqual(entry);
  await expect.poll(async () => (await readMeta(destination)).greeting).toEqual(meta);
  await expect.poll(() => readEntries(source)).not.toHaveProperty('greeting');
  await expect.poll(() => readMeta(source)).not.toHaveProperty('greeting');
  await browserPage.folder('destination').click();
  await expect(browserPage.row('destination.greeting')).toContainText('Hello');
  await browserPage.folder('source').click();
  await expect(browserPage.row('source.keep')).toBeVisible();
  await expect(browserPage.row('source.greeting')).toBeHidden();
});
