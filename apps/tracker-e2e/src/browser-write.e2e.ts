import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { readEntries, readMeta } from './fixtures/disk';

test('adds a resource through the editor and persists values and checksums', async ({
  project,
  browserPage,
  translationEditor,
}) => {
  await project.addCollection();
  await browserPage.goto(project.collectionName);
  await browserPage.addButton.click();
  await translationEditor.create('common.buttons.ok', 'Continue', 'Primary action button');
  await expect(translationEditor.dialog).toBeHidden();
  await expect(browserPage.row('common.buttons.ok')).toBeVisible();
  await expect(browserPage.row('common.buttons.ok')).toContainText('Continue');
  const folder = join(project.translationsFolder, 'common', 'buttons');
  expect(await readEntries(folder)).toMatchObject({ ok: { source: 'Continue' } });
  // Core's calculateChecksum hashes the stored value directly; this plain text needs no ICU conversion.
  const checksum = createHash('md5').update('Continue').digest('hex');
  expect(await readMeta(folder)).toMatchObject({
    ok: {
      en: { checksum },
      'fr-ca': { baseChecksum: checksum, checksum: expect.stringMatching(/^[a-f0-9]{32}$/) },
    },
  });
});

test('editing the base value makes an existing French Canadian translation stale', async ({
  project,
  browserPage,
  translationEditor,
}) => {
  await project.addCollection();
  await project.addResource({
    key: 'common.buttons.ok',
    baseValue: 'Continue',
    comment: 'Primary action button',
    translations: [{ locale: 'fr-ca', value: 'Continuer', status: 'translated' }],
  });
  await browserPage.goto(project.collectionName);
  await browserPage.selectLocale('fr-ca');
  await expect(
    browserPage.row('common.buttons.ok').getByRole('button', { name: /Translation status:.*translated/i }),
  ).toBeVisible();
  await browserPage.edit('common.buttons.ok');
  await translationEditor.baseValue.fill('Proceed');
  await translationEditor.save();
  await expect(translationEditor.dialog).toBeHidden();
  await expect(
    browserPage.row('common.buttons.ok').getByRole('button', { name: /Translation status:.*stale/i }),
  ).toBeVisible();
  const folder = join(project.translationsFolder, 'common', 'buttons');
  expect(await readEntries(folder)).toMatchObject({ ok: { source: 'Proceed', 'fr-ca': 'Continuer' } });
  expect(await readMeta(folder)).toMatchObject({ ok: { 'fr-ca': { status: 'stale' } } });
});

test('edits a translation and marks it verified in the editor and on disk', async ({
  project,
  browserPage,
  translationEditor,
}) => {
  await project.addCollection();
  await project.addResource({
    key: 'common.buttons.ok',
    baseValue: 'Continue',
    comment: 'Primary action button',
    translations: [{ locale: 'fr-ca', value: 'Continuer', status: 'translated' }],
  });
  await browserPage.goto(project.collectionName);
  await browserPage.selectLocale('fr-ca');
  await browserPage.edit('common.buttons.ok');
  await translationEditor.verifyTranslation('Canadian French', 'Poursuivre');
  await expect(translationEditor.dialog).toBeHidden();
  await expect(browserPage.row('common.buttons.ok')).toContainText('Poursuivre');
  await expect(
    browserPage.row('common.buttons.ok').getByRole('button', { name: /Translation status:.*verified/i }),
  ).toBeVisible();
  const folder = join(project.translationsFolder, 'common', 'buttons');
  expect(await readEntries(folder)).toMatchObject({ ok: { 'fr-ca': 'Poursuivre' } });
  expect(await readMeta(folder)).toMatchObject({ ok: { 'fr-ca': { status: 'verified' } } });
});

test('deletes a resource after confirmation and removes its entry and metadata', async ({ project, browserPage }) => {
  await project.addCollection();
  await project.addResource({ key: 'common.buttons.ok', baseValue: 'Continue' });
  // Keep the folder populated so both JSON files remain available to verify removal.
  await project.addResource({ key: 'common.buttons.cancel', baseValue: 'Cancel' });
  await browserPage.goto(project.collectionName);
  await expect(browserPage.row('common.buttons.ok')).toBeVisible();
  await browserPage.delete('common.buttons.ok');
  await expect(browserPage.deleteDialog).toBeHidden();
  await expect(browserPage.row('common.buttons.ok')).toBeHidden();
  await expect(browserPage.row('common.buttons.cancel')).toBeVisible();
  const folder = join(project.translationsFolder, 'common', 'buttons');
  const entries = await readEntries(folder);
  expect(entries).not.toHaveProperty('ok');
  expect(entries).toHaveProperty('cancel');
  const meta = await readMeta(folder);
  expect(meta).not.toHaveProperty('ok');
  expect(meta).toHaveProperty('cancel');
});

test('confirms before saving a plural that plain Transloco cannot render', async ({
  project,
  browserPage,
  translationEditor,
}) => {
  await project.addCollection();
  await project.setRuntime('transloco');
  await browserPage.goto(project.collectionName);
  await browserPage.addButton.click();
  await translationEditor.key.fill('common.items');
  await translationEditor.baseValue.fill('{count, plural, one {# item} other {# items}}');
  await translationEditor.comment.fill('Item count');
  await translationEditor.dialog.getByRole('button', { name: 'Create translation', exact: true }).click();

  const confirmation = translationEditor.runtimeConfirmDialog;
  await expect(confirmation).toContainText('English: plural');
  await confirmation.getByRole('button', { name: 'Go back and edit', exact: true }).click();
  await expect(confirmation).toBeHidden();
  await expect(translationEditor.baseValue).toBeFocused();
  const folder = join(project.translationsFolder, 'common');
  await expect(readEntries(folder)).rejects.toThrow();

  await translationEditor.dialog.getByRole('button', { name: 'Create translation', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Save anyway', exact: true }).click();
  await expect(translationEditor.dialog).toBeHidden();
  expect(await readEntries(folder)).toMatchObject({
    items: { source: '{count, plural, one {# item} other {# items}}' },
  });
});
