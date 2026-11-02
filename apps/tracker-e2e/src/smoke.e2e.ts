import { expect, test } from './fixtures';

test('opens collections without browser errors and shows a collection from disk', async ({
  page,
  project,
  collectionsPage,
}) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  const name = await project.addCollection();
  await collectionsPage.goto();

  await expect(page).toHaveURL(/\/collections$/);
  await expect(page).toHaveTitle('Collections');
  await expect(collectionsPage.collection(name)).toBeVisible();
  expect(errors, 'Browser console errors and uncaught page errors').toEqual([]);
});

test('loads its fonts and icons from the Tracker itself', async ({ page, project, collectionsPage }) => {
  await project.addCollection();
  await collectionsPage.goto();

  // The network guard fails the test on any non-localhost request, so every face here comes from the Tracker build.
  const missing = await page.evaluate(async () => {
    const faces: [family: string, weight: number][] = [
      ...[400, 500, 600, 700].map((weight): [string, number] => ['Nunito', weight]),
      ...[400, 500, 600].map((weight): [string, number] => ['IBM Plex Mono', weight]),
      ['Grechen Fuemen', 400],
      ['Material Icons', 400],
    ];
    // load() resolves with the matching faces; a missing weight would match a neighbouring one instead.
    const loaded = await Promise.all(
      faces.map(([family, weight]) => document.fonts.load(`${weight} 16px "${family}"`)),
    );
    return faces
      .filter(([, weight], index) => !loaded[index].some((face) => face.weight === String(weight)))
      .map(([family, weight]) => `${family} ${weight}`);
  });
  expect(missing, 'Font faces not loaded').toEqual([]);
});
