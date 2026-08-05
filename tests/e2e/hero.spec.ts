import { expect, test, type Locator, type Page } from '@playwright/test';
import { inkCoverage } from './spread';

const VISUAL = '[data-hero-visual]';
const CANVAS = '[data-hero-canvas] canvas';

async function shot(target: Locator): Promise<Buffer> {
  return target.screenshot({ animations: 'disabled' });
}

function distance(a: Buffer, b: Buffer): number {
  if (a.length !== b.length) return 1;
  let changed = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) changed++;
  }
  return changed / a.length;
}

function differs(a: Buffer, b: Buffer): boolean {
  return distance(a, b) > 0.001;
}

async function heroReady(page: Page): Promise<Locator> {
  await page.goto('/de/');
  await expect(page.locator(`${VISUAL}[data-hero-ready="true"]`)).toBeVisible({ timeout: 15_000 });
  return page.locator('.hero__frame');
}

test('the island is not skipped under normal conditions', async ({ page }) => {
  await page.goto('/de/');
  await page.waitForTimeout(2000);
  const skip = await page.locator(VISUAL).getAttribute('data-hero-skip');
  expect(skip).toBeNull();
});

test('the island mounts and draws a first frame', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await heroReady(page);

  const size = await page.locator(CANVAS).evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    return { width: canvas.width, height: canvas.height };
  });

  expect(size.width).toBeGreaterThan(300);
  expect(size.height).toBeGreaterThan(300);
  expect(errors).toEqual([]);
});

test('the field reacts to the pointer', async ({ page }) => {
  const frame = await heroReady(page);
  const box = (await frame.boundingBox())!;

  await page.mouse.move(box.x - 200, box.y + box.height / 2);
  await page.waitForTimeout(700);
  const idle = await shot(frame);

  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45);
  await page.waitForTimeout(120);
  await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.45);
  await page.waitForTimeout(400);
  const hovered = await shot(frame);

  expect(differs(idle, hovered)).toBe(true);
});

test('clicking bursts the field and it springs back', async ({ page }) => {
  const frame = await heroReady(page);
  const box = (await frame.boundingBox())!;
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  await page.mouse.move(box.x - 200, box.y + box.height / 2);
  await page.waitForTimeout(700);
  const before = await shot(frame);

  await page.mouse.click(centre.x, centre.y);
  await page.waitForTimeout(150);
  const during = await shot(frame);

  expect(differs(before, during)).toBe(true);

  await page.mouse.move(box.x - 200, box.y + box.height / 2);
  await page.waitForTimeout(2500);
  const after = await shot(frame);

  expect(differs(during, after)).toBe(true);
});

test('the burst drifts out slowly, holds, then snaps back', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await heroReady(page);

  const box = (await page.locator('.hero__frame').boundingBox())!;
  const clip = {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
  const away = { x: 5, y: 880 };

  await page.mouse.move(away.x, away.y);
  await page.waitForTimeout(800);
  const rest = await inkCoverage(await page.screenshot({ clip }));

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(away.x, away.y);
  const started = Date.now();

  const series: Array<{ at: number; value: number }> = [];
  while (Date.now() - started < 2400) {
    const at = Date.now() - started;
    series.push({ at, value: await inkCoverage(await page.screenshot({ clip })) });
  }

  const peak = Math.max(...series.map((s) => s.value));
  const amplitude = peak - rest;
  expect(amplitude, 'the click should visibly open the field').toBeGreaterThan(0.08);

  const openLevel = rest + amplitude * 0.75;
  const homeLevel = rest + amplitude * 0.15;
  const open = series.filter((s) => s.value >= openLevel);
  expect(open.length, 'the field should reach its open state').toBeGreaterThan(0);

  const openedAt = open[0]!.at;
  const closedAt = open[open.length - 1]!.at;
  const home = series.find((s) => s.at > closedAt && s.value <= homeLevel);
  expect(home, 'the field should come back on its own').toBeDefined();

  expect(openedAt, 'opening must not be instant').toBeGreaterThan(250);
  expect(closedAt - openedAt, 'the field should dwell while it is open').toBeGreaterThan(300);
  expect(
    home!.at - closedAt,
    'the way back must be clearly quicker than the way out',
  ).toBeLessThan(openedAt * 0.9);
});

test('the field is perfectly still on a desktop until the pointer arrives', async ({ page }) => {
  const frame = await heroReady(page);
  const box = (await frame.boundingBox())!;

  await page.mouse.move(box.x + box.width + 320, box.y + box.height / 2);
  await page.waitForTimeout(1400);

  const first = await shot(frame);
  await page.waitForTimeout(700);
  const second = await shot(frame);
  await page.waitForTimeout(700);
  const third = await shot(frame);

  expect(differs(first, second), 'the resting field must not drift').toBe(false);
  expect(differs(second, third), 'the resting field must not drift').toBe(false);
});

test('a touch tap bursts the field', async ({ browser }) => {
  const context = await browser.newContext({
    ...(await import('@playwright/test')).devices['iPhone 13'],
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const frame = await heroReady(page);

  await page.waitForTimeout(900);
  const before = await shot(frame);

  const box = (await frame.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(180);
  const during = await shot(frame);

  expect(differs(before, during)).toBe(true);
  await context.close();
});

test('reduced motion keeps the poster and never mounts the island', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/de/');
  await page.waitForTimeout(1500);

  await expect(page.locator(CANVAS)).toHaveCount(0);
  await expect(page.locator('.hero__poster')).toBeVisible();
  await context.close();
});
