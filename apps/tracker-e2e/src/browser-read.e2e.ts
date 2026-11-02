import { join } from 'node:path';
import { expect, test } from './fixtures';
import { readEntries, readMeta } from './fixtures/disk';

test('navigates nested folders and shows only resources in the selected folder', async ({ project, browserPage }) => {
  await project.addCollection();
  await project.addResource({ key: 'common.buttons.ok', baseValue: 'OK' });
  await project.addResource({ key: 'common.buttons.cancel', baseValue: 'Cancel' });
  await project.addResource({ key: 'home.title', baseValue: 'Home' });
  await browserPage.goto(project.collectionName);
  await expect(browserPage.rows).toHaveCount(3);
  await browserPage.folder('common').press('ArrowRight');
  await browserPage.folder('buttons').click();
  await expect(browserPage.folder('buttons')).toHaveAttribute('aria-selected', 'true');
  await expect(browserPage.rows).toHaveCount(2);
  await expect(browserPage.row('common.buttons.ok')).toBeVisible();
  await expect(browserPage.row('common.buttons.cancel')).toBeVisible();
  await expect(browserPage.row('home.title')).toBeHidden();
  await browserPage.folder('home').click();
  await expect(browserPage.rows).toHaveCount(1);
  await expect(browserPage.row('home.title')).toBeVisible();
  await expect(browserPage.row('common.buttons.ok')).toBeHidden();
  await expect(browserPage.row('common.buttons.cancel')).toBeHidden();
});

test('does not search below three characters and searches at and above the minimum', async ({
  project,
  browserPage,
  page,
}) => {
  await project.addCollection();
  await project.addResource({ key: 'actions.save', baseValue: 'Save draft' });
  await project.addResource({ key: 'actions.cancel', baseValue: 'Cancel' });
  await browserPage.goto(project.collectionName);
  await expect(browserPage.rows).toHaveCount(2);
  const queries: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/resources/search')) queries.push(url.searchParams.get('query') ?? '');
  });
  await page.clock.install();
  await browserPage.search.fill('sa');
  // Advance past the component's 300 ms debounce to exercise the minimum-length branch.
  await page.clock.runFor(400);
  await expect(browserPage.rows).toHaveCount(2);
  await expect(browserPage.clearSearch).toBeHidden();
  expect(queries).toEqual([]);
  await browserPage.search.fill('sav');
  await page.clock.runFor(400);
  await expect(browserPage.rows).toHaveCount(1);
  await expect(browserPage.row('actions.save')).toBeVisible();
  await expect(browserPage.row('actions.cancel')).toBeHidden();
  await expect(browserPage.clearSearch).toBeVisible();
  await browserPage.search.fill('draft');
  await page.clock.runFor(400);
  await expect.poll(() => queries).toEqual(['sav', 'draft']);
  await expect(browserPage.rows).toHaveCount(1);
  await expect(browserPage.row('actions.save')).toBeVisible();
  await expect(browserPage.row('actions.cancel')).toBeHidden();
});

test('filters resources by the selected French Canadian translation status', async ({ project, browserPage }) => {
  await project.addCollection();
  await project.addResource({
    key: 'actions.save',
    baseValue: 'Save',
    translations: [{ locale: 'fr-ca', value: 'Enregistrer', status: 'translated' }],
  });
  await project.addResource({
    key: 'actions.cancel',
    baseValue: 'Cancel',
    translations: [{ locale: 'fr-ca', value: 'Annuler', status: 'new' }],
  });
  await browserPage.goto(project.collectionName);
  await expect(browserPage.rows).toHaveCount(2);
  await browserPage.selectLocale('fr-ca');
  await browserPage.statusFilter('Translated').click();
  await expect(browserPage.statusFilter('Translated')).toHaveAttribute('aria-pressed', 'true');
  await expect(browserPage.rows).toHaveCount(1);
  await expect(browserPage.row('actions.save')).toBeVisible();
  await expect(browserPage.row('actions.cancel')).toBeHidden();
  await browserPage.statusFilter('Translated').click();
  await browserPage.statusFilter('New').click();
  await expect(browserPage.statusFilter('New')).toHaveAttribute('aria-pressed', 'true');
  await expect(browserPage.rows).toHaveCount(1);
  await expect(browserPage.row('actions.cancel')).toBeVisible();
  await expect(browserPage.row('actions.save')).toBeHidden();
});

test('opens a seeded read-only collection with mutation controls unavailable and resource files unchanged', async ({
  project,
  browserPage,
  translationEditor,
  page,
}) => {
  await project.addCollection();
  await project.addResource({
    key: 'source.greeting',
    baseValue: 'Hello',
    translations: [{ locale: 'fr-ca', value: 'Bonjour', status: 'verified' }],
  });
  await project.addResource({ key: 'other.keep', baseValue: 'Keep' });
  await project.updateCollection({ translationsFolder: project.translationsFolder, readOnly: true });
  const source = join(project.translationsFolder, 'source');
  const other = join(project.translationsFolder, 'other');
  const entries = await readEntries(source);
  const meta = await readMeta(source);
  const otherEntries = await readEntries(other);
  const otherMeta = await readMeta(other);
  await browserPage.goto(project.collectionName);
  await expect(browserPage.row('source.greeting')).toBeVisible();
  await expect(browserPage.addButton).toBeDisabled();
  await expect(browserPage.addFolderButton).toBeDisabled();
  for (const folder of ['source', 'other']) {
    await expect(
      browserPage.folder(folder).getByRole('button', { name: `Delete folder ${folder}`, exact: true }),
    ).toBeDisabled();
  }
  await browserPage.folder('source').click();
  await expect(browserPage.rows).toHaveCount(1);
  const mutations: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/'))
      mutations.push(request.url());
  });
  await browserPage.moveResource('source.greeting', 'other');
  // Reloading forces a server round trip, so a move sent by the drag would have landed by now.
  await page.reload();
  await browserPage.folder('source').click();
  await expect(browserPage.row('source.greeting')).toBeVisible();
  expect(mutations).toEqual([]);
  expect(await readEntries(source)).toEqual(entries);
  expect(await readMeta(source)).toEqual(meta);
  expect(await readEntries(other)).toEqual(otherEntries);
  expect(await readMeta(other)).toEqual(otherMeta);
  await expect(
    browserPage.row('source.greeting').getByRole('button', { name: 'Edit translation', exact: true }),
  ).toBeHidden();
  await expect(browserPage.row('source.greeting').getByTestId('resource-drag-handle')).toHaveAttribute(
    'aria-label',
    "This collection is read-only. Its resources can't be modified.",
  );
  await browserPage.row('source.greeting').getByRole('button', { name: 'More actions', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Delete translation', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await browserPage.row('source.greeting').getByRole('button', { name: 'View', exact: true }).click();
  await expect(translationEditor.readOnlyNotice).toContainText(
    "This collection is read-only — you're viewing this resource in read-only mode.",
  );
  await expect(translationEditor.baseValue).toBeDisabled();
  await expect(translationEditor.comment).toBeDisabled();
  await expect(translationEditor.dialog.getByTestId('location-pill')).toBeDisabled();
  await expect(translationEditor.dialog.getByTestId('submit')).toBeHidden();
  expect(await readEntries(source)).toEqual(entries);
  expect(await readEntries(other)).toEqual(otherEntries);
  expect(await readMeta(source)).toEqual(meta);
  expect(await readMeta(other)).toEqual(otherMeta);
});
