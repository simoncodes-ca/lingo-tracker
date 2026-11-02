import { expect, test } from './fixtures';
import { readProtectedTerms } from './fixtures/disk';

test('saves a global protected term and restores it in Settings after reload', async ({
  project,
  server,
  page,
  settingsPage,
}) => {
  const term = `Brand-${project.collectionName}`;
  await settingsPage.goto();
  await expect(settingsPage.title).toBeVisible();
  await expect(settingsPage.termsList).toBeHidden();
  await settingsPage.addProtectedTerm(term);
  await expect(settingsPage.termsList).toContainText(term);
  await settingsPage.saveButton.click();
  await expect(settingsPage.saveButton).toBeDisabled();
  // Save disables the input while the request is in flight; wait for editing to resume before reloading.
  await expect(settingsPage.newTerm).toBeEnabled();
  await page.reload();
  await expect(settingsPage.termsList).toContainText(term);
  expect(await readProtectedTerms(server.projectRoot)).toContain(term);
});
