import { expect, test } from '@playwright/test';

const LOCALES = ['de', 'en'] as const;

async function meta(page: import('@playwright/test').Page, selector: string): Promise<string> {
  return page.locator(selector).first().getAttribute('content').then((value) => value ?? '');
}

test('robots.txt points at a sitemap that exists', async ({ page, request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);

  const body = await robots.text();
  const line = body.split('\n').find((l) => l.toLowerCase().startsWith('sitemap:'));
  expect(line, 'robots.txt should name a sitemap').toBeDefined();

  const url = line!.slice('sitemap:'.length).trim();
  const sitemap = await request.get(new URL(url).pathname);
  expect(sitemap.status(), `${url} should be served`).toBe(200);
  expect(await sitemap.text()).toContain('<loc>');
  await page.close();
});

test('the sitemap lists both locales and not the redirect', async ({ request }) => {
  const index = await request.get('/sitemap-index.xml');
  const child = (await index.text()).match(/<loc>([^<]+)<\/loc>/)?.[1];
  expect(child).toBeDefined();

  const body = await (await request.get(new URL(child!).pathname)).text();
  const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);

  expect(locs.some((l) => l.endsWith('/de/'))).toBe(true);
  expect(locs.some((l) => l.endsWith('/en/'))).toBe(true);
  expect(
    locs.some((l) => new URL(l).pathname === '/'),
    'the noindexed redirect must stay out of the sitemap',
  ).toBe(false);
});

test('an unknown path answers 404, not 200', async ({ request }) => {
  const response = await request.get('/zzz-does-not-exist-1234', { maxRedirects: 0 });
  expect(response.status(), 'a soft 404 would make every typo look like a real page').toBe(404);
  expect(await response.text()).toContain('404');
});

test('the root is redirected by a _redirects rule, not by a meta refresh', async ({ request }) => {
  const rules = await request.get('/_redirects');
  expect(rules.status(), '_redirects must reach the deployment').toBe(200);

  const body = await rules.text();
  const root = body
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('/ ') || line.startsWith('/\t'));

  expect(root, 'the root needs a redirect rule; a static build cannot emit one').toBeDefined();
  expect(root).toContain('/de/');
  expect(root, 'social crawlers do not follow meta refresh').toMatch(/\b30[128]\b/);
});

for (const locale of LOCALES) {
  test(`/${locale}/ carries a complete link preview`, async ({ page, request }) => {
    await page.goto(`/${locale}/`);

    const canonical = await page.locator('link[rel=canonical]').getAttribute('href');
    expect(canonical).toContain(`/${locale}/`);
    expect(await meta(page, 'meta[property="og:url"]')).toBe(canonical);

    for (const selector of [
      'meta[property="og:title"]',
      'meta[property="og:description"]',
      'meta[property="og:type"]',
      'meta[property="og:image:alt"]',
      'meta[name="twitter:card"]',
    ]) {
      expect(await meta(page, selector), `${selector} should be filled`).not.toBe('');
    }

    const image = await meta(page, 'meta[property="og:image"]');
    expect(image).toContain(`og-${locale}.png`);

    const response = await request.get(new URL(image).pathname);
    expect(response.status(), `${image} should be served`).toBe(200);
    expect(response.headers()['content-type']).toContain('image');
  });

  test(`/${locale}/ describes a person in structured data`, async ({ page }) => {
    await page.goto(`/${locale}/`);
    const raw = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(raw, 'the page should carry JSON-LD').toBeTruthy();

    const data = JSON.parse(raw!) as Record<string, unknown>;
    expect(data['@type']).toBe('Person');
    expect(data.name).toBe('Ben Brändle');
    expect(String(data.url)).toContain(`/${locale}/`);
  });
}
