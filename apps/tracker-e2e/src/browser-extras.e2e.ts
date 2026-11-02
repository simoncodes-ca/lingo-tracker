import { expect, test } from './fixtures';
import { readEntries, readMeta } from './fixtures/disk';

test('adds a resource comment and restores it in the editor after reload', async ({
  project,
  browserPage,
  translationEditor,
  page,
}) => {
  await project.addCollection();
  await project.addResource({ key: 'greeting', baseValue: 'Hello' });
  await browserPage.goto(project.collectionName);
  await browserPage.edit('greeting');
  await translationEditor.comment.fill('Welcome message on the home page');
  await translationEditor.save();
  await expect(translationEditor.dialog).toBeHidden();
  expect(await readEntries(project.translationsFolder)).toMatchObject({
    greeting: { source: 'Hello', comment: 'Welcome message on the home page' },
  });
  await page.reload();
  await browserPage.edit('greeting');
  await expect(translationEditor.comment).toHaveValue('Welcome message on the home page');
});

test('adds a resource tag in the editor and persists it on disk', async ({
  project,
  browserPage,
  translationEditor,
  page,
}) => {
  await project.addCollection();
  await project.addResource({ key: 'greeting', baseValue: 'Hello', comment: 'Home page greeting' });
  await browserPage.goto(project.collectionName);
  await browserPage.edit('greeting');
  await translationEditor.addTag('home-ui');
  await translationEditor.save();
  await expect(translationEditor.dialog).toBeHidden();
  expect(await readEntries(project.translationsFolder)).toMatchObject({
    greeting: { source: 'Hello', tags: ['home-ui'] },
  });
  await page.reload();
  await browserPage.edit('greeting');
  await expect(translationEditor.tag('home-ui')).toBeVisible();
});

test('blocks a duplicate key with a visible error and leaves resource files unchanged', async ({
  project,
  browserPage,
  translationEditor,
}) => {
  await project.addCollection();
  await project.addResource({ key: 'greeting', baseValue: 'Hello' });
  const entries = await readEntries(project.translationsFolder);
  const meta = await readMeta(project.translationsFolder);
  await browserPage.goto(project.collectionName);
  await expect(browserPage.row('greeting')).toBeVisible();
  await browserPage.addButton.click();
  await translationEditor.key.fill('greeting');
  await translationEditor.baseValue.fill('Replacement');
  await translationEditor.comment.fill('Must not be stored');
  await expect(translationEditor.collisionError).toContainText('greeting already exists in this folder.');
  await translationEditor.createButton.click();
  await expect(translationEditor.conflictDialog).toBeVisible();
  await expect(translationEditor.conflictDialog).toContainText('The translation key "greeting" already exists');
  await translationEditor.chooseDifferentKey();
  await expect(translationEditor.conflictDialog).toBeHidden();
  await expect(translationEditor.collisionError).toContainText('greeting already exists in this folder.');
  expect(await readEntries(project.translationsFolder)).toEqual(entries);
  expect(await readMeta(project.translationsFolder)).toEqual(meta);
  await expect(translationEditor.dialog).toBeVisible();
});

test('rejects a base value with a braced placeholder and leaves resource files unchanged', async ({
  project,
  browserPage,
  translationEditor,
}) => {
  await project.addCollection();
  await project.addResource({ key: 'greeting', baseValue: 'Hello', comment: 'Home page greeting' });
  const entries = await readEntries(project.translationsFolder);
  const meta = await readMeta(project.translationsFolder);
  await browserPage.goto(project.collectionName);
  await browserPage.edit('greeting');
  const fixErrors = translationEditor.dialog
    .getByRole('alert')
    .filter({ hasText: 'Fix the highlighted fields before saving' });
  await translationEditor.baseValue.fill('Hello {{{name}}}');
  await expect(fixErrors).toBeHidden();
  await translationEditor.save();
  await expect(fixErrors).toBeVisible();
  await expect(
    translationEditor.dialog.getByRole('alert').filter({
      hasText: 'is inside literal braces and would lose a brace on save.',
    }),
  ).toBeVisible();
  await expect(translationEditor.baseValue).toHaveAttribute('aria-invalid', 'true');
  await expect(translationEditor.dialog).toBeVisible();
  expect(await readEntries(project.translationsFolder)).toEqual(entries);
  expect(await readMeta(project.translationsFolder)).toEqual(meta);
});

test('suggests the exact existing text and copies its key for reuse', async ({
  context,
  baseURL,
  page,
  project,
  browserPage,
  translationEditor,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL });
  await project.addCollection();
  await project.addResource({ key: 'greeting', baseValue: 'Welcome back' });
  await browserPage.goto(project.collectionName);
  await browserPage.addButton.click();
  await translationEditor.key.fill('duplicate');
  await translationEditor.baseValue.fill('Welcome back');
  await expect(translationEditor.exactMatchMessage).toHaveText(
    'The exact text already exists under greeting. Reuse that key instead of adding a duplicate.',
  );
  await translationEditor.similarValue('Welcome back').click();
  await expect(translationEditor.keyCopied).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('greeting');
  await expect(translationEditor.dialog).toBeVisible();
  await expect(translationEditor.key).toHaveValue('duplicate');
});

test('shows a completed similar lookup without an exact-match warning for different text', async ({
  project,
  browserPage,
  translationEditor,
}) => {
  await project.addCollection();
  await project.addResource({ key: 'save', baseValue: 'Save your changes' });
  await browserPage.goto(project.collectionName);
  await browserPage.addButton.click();
  await translationEditor.key.fill('saveNow');
  await translationEditor.baseValue.fill('Save your changes now');
  // A rendered result proves the debounced lookup finished; there was no prior query to leave a stale hit.
  await expect(translationEditor.similarValue('Save your changes')).toBeVisible();
  await expect(translationEditor.exactMatchMessage).toBeHidden();
});

test('shows preferred terminology advice, clears it after editing and allows saving discouraged text', async ({
  project,
  browserPage,
  translationEditor,
}) => {
  await project.addCollection();
  await project.setPreferredTerminology([{ discouraged: 'utilize', preferred: 'use' }]);
  await browserPage.goto(project.collectionName);
  await browserPage.addButton.click();
  await translationEditor.key.fill('instructions');
  await translationEditor.comment.fill('Instructions for the primary action button');
  await translationEditor.baseValue.fill('Please utilize this button');
  await expect(translationEditor.preferredTermHint).toContainText(
    'Preferred terminology: consider “use” instead of “utilize”.',
  );
  await translationEditor.baseValue.fill('Please press this button');
  // The previously visible advisory disappearing proves the new text was validated.
  await expect(translationEditor.preferredTermHint).toBeHidden();
  await translationEditor.baseValue.fill('Please utilize this button');
  await expect(translationEditor.preferredTermHint).toContainText(
    'Preferred terminology: consider “use” instead of “utilize”.',
  );
  await expect(translationEditor.createButton).toBeEnabled();
  await translationEditor.createButton.click();
  await expect(translationEditor.dialog).toBeHidden();
  await expect(browserPage.row('instructions')).toContainText('Please utilize this button');
  await expect
    .poll(() => readEntries(project.translationsFolder))
    .toMatchObject({
      instructions: { source: 'Please utilize this button' },
    });
});

test('warns about exact duplicate text but still saves it under the new key', async ({
  project,
  browserPage,
  translationEditor,
}) => {
  await project.addCollection();
  await project.addResource({ key: 'greeting', baseValue: 'Welcome back' });
  await browserPage.goto(project.collectionName);
  await browserPage.addButton.click();
  await translationEditor.key.fill('welcome');
  await translationEditor.comment.fill('Shown on the returning-user banner');
  await translationEditor.baseValue.fill('Welcome back');
  await expect(translationEditor.exactMatchMessage).toHaveText(
    'The exact text already exists under greeting. Reuse that key instead of adding a duplicate.',
  );
  await translationEditor.createButton.click();
  await expect(translationEditor.dialog).toBeHidden();
  await expect(browserPage.row('welcome')).toContainText('Welcome back');
  await expect
    .poll(() => readEntries(project.translationsFolder))
    .toMatchObject({
      greeting: { source: 'Welcome back' },
      welcome: { source: 'Welcome back', comment: 'Shown on the returning-user banner' },
    });
});
