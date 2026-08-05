import { expect, test } from '@playwright/test';

const NARROW = [320, 360, 375, 414, 768];

test('never scrolls sideways on narrow viewports', async ({ page }) => {
  for (const width of NARROW) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/de/');
    await page.waitForTimeout(400);

    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      view: document.documentElement.clientWidth,
    }));

    expect(overflow.doc, `document overflows at ${width}px`).toBeLessThanOrEqual(overflow.view);
    expect(overflow.body, `body overflows at ${width}px`).toBeLessThanOrEqual(overflow.view);
  }
});

test('the hero column is centred on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/de/');
  await page.waitForTimeout(400);

  const frame = (await page.locator('.hero__frame').boundingBox())!;
  const centre = frame.x + frame.width / 2;
  expect(Math.abs(centre - 375 / 2)).toBeLessThan(2);
});

test('the language switch keeps the reading position', async ({ page }) => {
  await page.goto('/de/');
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    const work = document.getElementById('work')!;
    window.scrollTo({ top: work.offsetTop + 120, behavior: 'instant' });
  });
  await page.waitForTimeout(200);

  const before = await page.evaluate(() => {
    (window as unknown as { __kept?: number }).__kept = 42;
    return window.scrollY - document.getElementById('work')!.offsetTop;
  });

  await page.locator('[data-lang-switch]').click();
  await page.waitForURL('**/en/');
  await page.waitForTimeout(900);

  const after = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    delta: window.scrollY - document.getElementById('work')!.offsetTop,
    scrollY: window.scrollY,
    kept: (window as unknown as { __kept?: number }).__kept,
  }));

  expect(after.lang).toBe('en');
  expect(after.scrollY).toBeGreaterThan(200);
  expect(Math.abs(after.delta - before)).toBeLessThan(80);
  expect(after.kept, 'the swap should not be a full page load').toBe(42);
});

test('the language switch never lands on the hero first', async ({ page }) => {
  await page.goto('/de/');
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo({ top: document.getElementById('work')!.offsetTop + 120, behavior: 'instant' });
    const seen: number[] = [];
    (window as unknown as { __seen: number[] }).__seen = seen;
    const tick = () => {
      seen.push(window.scrollY);
      requestAnimationFrame(tick);
    };
    tick();
  });
  await page.waitForTimeout(200);

  await page.locator('[data-lang-switch]').click();
  await page.waitForURL('**/en/');
  await page.waitForTimeout(1200);

  const low = await page.evaluate(() => {
    const seen = (window as unknown as { __seen: number[] }).__seen;
    return Math.min(...seen.slice(2));
  });

  expect(low, 'the reader should never be thrown near the top').toBeGreaterThan(200);
});

test('the CV link opens in the browser rather than downloading', async ({ page }) => {
  await page.goto('/de/');
  const links = page.locator('a[href$=".pdf"]');
  await expect(links.first()).toBeVisible();

  const count = await links.count();
  for (let i = 0; i < count; i++) {
    await expect(links.nth(i)).not.toHaveAttribute('download', /.*/);
    await expect(links.nth(i)).toHaveAttribute('target', '_blank');
  }
});

test('every locale links to a CV that actually exists', async ({ page, request }) => {
  for (const locale of ['de', 'en']) {
    await page.goto(`/${locale}/`);
    const hrefs = await page.locator('a[href$=".pdf"]').evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLAnchorElement).getAttribute('href')!),
    );

    expect(hrefs.length).toBeGreaterThan(0);
    expect(new Set(hrefs).size, `${locale} should link one CV everywhere`).toBe(1);

    const response = await request.get(hrefs[0]!);
    expect(response.status(), `${hrefs[0]} should be served`).toBe(200);
    expect(response.headers()['content-type']).toContain('pdf');
  }
});

test('the footer line sits on one baseline, or stacks flush left', async ({ page }) => {
  for (const width of [320, 360, 375, 414, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/de/');
    await page.waitForTimeout(300);

    const rows = await page.locator('.contact__foot > *').evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { top: Math.round(rect.top), left: Math.round(rect.left) };
      }),
    );

    expect(rows.length).toBe(2);
    const sameRow = Math.abs(rows[0]!.top - rows[1]!.top) < 2;
    if (sameRow) continue;

    expect(rows[0]!.left, `stacked footer must be flush left at ${width}px`).toBe(rows[1]!.left);
  }
});

test('the footer stays on one line on a normal phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/de/');
  await page.waitForTimeout(300);

  const tops = await page.locator('.contact__foot > *').evaluateAll((nodes) =>
    nodes.map((node) => Math.round(node.getBoundingClientRect().top)),
  );

  expect(Math.abs(tops[0]! - tops[1]!)).toBeLessThan(2);
});

test('the theme toggle flips and flips back', async ({ page }) => {
  await page.goto('/de/');
  await page.waitForTimeout(400);

  const theme = () => page.evaluate(() => document.documentElement.dataset.theme ?? null);
  const toggle = page.locator('[data-theme-toggle]');

  await toggle.click();
  await page.waitForTimeout(200);
  const first = await theme();
  expect(first === 'light' || first === 'dark').toBe(true);

  await toggle.click();
  await page.waitForTimeout(200);
  const second = await theme();
  expect(second, 'a second click must undo the first').not.toBe(first);

  await toggle.click();
  await page.waitForTimeout(200);
  expect(await theme()).toBe(first);
});

test('the chosen theme survives a language switch', async ({ page }) => {
  await page.goto('/de/');
  await page.waitForTimeout(400);

  await page.locator('[data-theme-toggle]').click();
  await page.waitForTimeout(200);
  const chosen = await page.evaluate(() => document.documentElement.dataset.theme);

  await page.locator('[data-lang-switch]').click();
  await page.waitForURL('**/en/');
  await page.waitForTimeout(600);

  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(chosen);

  await page.locator('[data-lang-switch]').click();
  await page.waitForURL('**/de/');
  await page.waitForTimeout(600);

  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(chosen);
});
