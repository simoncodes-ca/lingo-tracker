import { type BrowserContext, expect, type TestFixture } from '@playwright/test';

export const networkGuardFixture: TestFixture<undefined, { context: BrowserContext }> = async ({ context }, use) => {
  const blocked = new Set<string>();
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      await route.continue();
    } else {
      blocked.add(url.href);
      await route.abort('blockedbyclient');
    }
  });
  try {
    await use(undefined);
  } finally {
    await context.unrouteAll({ behavior: 'wait' });
    expect([...blocked], `Blocked external requests:\n${[...blocked].join('\n')}`).toEqual([]);
  }
};
