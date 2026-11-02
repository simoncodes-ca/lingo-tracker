import { join } from 'node:path';
import type { APIRequestContext, APIResponse } from '@playwright/test';
import { expect, test } from '../fixtures';
import { DEMO_COLLECTION, DEMO_LOCALES, demoEntries, staleEdits, toCreateDto } from './demo-collection';

const imagesFolder = join(__dirname, '../../../../docs/images');
const collectionUrl = `/api/collections/${DEMO_COLLECTION}`;

async function ok(response: APIResponse): Promise<void> {
  if (!response.ok())
    throw new Error(`Seed request failed: ${response.status()} ${response.url()}\n${await response.text()}`);
}

async function seedDemoCollection(request: APIRequestContext): Promise<void> {
  await ok(
    await request.post('/api/collections', {
      data: {
        name: DEMO_COLLECTION,
        collection: {
          translationsFolder: `translations/${DEMO_COLLECTION}`,
          baseLocale: 'en',
          locales: [...DEMO_LOCALES],
        },
      },
    }),
  );
  for (const entry of demoEntries) {
    await ok(await request.post(`${collectionUrl}/resources`, { data: toCreateDto(entry) }));
  }
  // Editing the base value is what makes a translation genuinely stale.
  for (const edit of staleEdits) {
    await ok(await request.patch(`${collectionUrl}/resources`, { data: edit }));
  }
}

test.describe.configure({ mode: 'serial' });

test('translation browser screenshots', async ({ request, page, browserPage, appHeader }) => {
  // The list has no sort-field control, but the Browser restores `sortField` from its saved view preferences.
  // Sorting by status puts the stale and new rows first.
  await page.addInitScript(
    ([key, prefs]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, prefs);
    },
    [`lingo-tracker:view-prefs:${DEMO_COLLECTION}`, JSON.stringify({ sortField: 'status', sortDirection: 'asc' })],
  );
  await seedDemoCollection(request);
  await browserPage.goto(DEMO_COLLECTION);
  await browserPage.folder('checkout').click();
  await expect(browserPage.folder('checkout')).toHaveAttribute('aria-selected', 'true');
  await browserPage.selectLocale('fr-ca');
  await expect(browserPage.row('checkout.title')).toBeVisible();
  await expect(browserPage.row('checkout.shipping.estimate')).toBeVisible();
  await expect(
    browserPage
      .row('checkout.shipping.estimate')
      .getByRole('button', { name: /Translation status:.*stale/i })
      .first(),
  ).toBeVisible();

  for (const theme of ['Light', 'Dark'] as const) {
    await appHeader.setTheme(theme);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme.toLowerCase());
    // Drop the focus ring and any tooltip the menus left behind.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.mouse.move(0, 0);
    await expect(page.getByText(/^Full — detailed view/)).toBeHidden();
    // Crop the Tracker's footer bar out of the viewport.
    const footer = await page.getByRole('contentinfo').boundingBox();
    const viewport = page.viewportSize();
    if (!footer || !viewport) throw new Error('Footer or viewport size is not available');
    await page.screenshot({
      path: join(imagesFolder, `translation-browser-${theme.toLowerCase()}.png`),
      clip: { x: 0, y: 0, width: viewport.width, height: footer.y },
      // Finish ripples and transitions the theme menu left running.
      animations: 'disabled',
    });
  }
});
