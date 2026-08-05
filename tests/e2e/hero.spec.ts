import { expect, test, type Locator, type Page } from '@playwright/test';
import { inkSpread } from './spread';

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

  const canvasBox = (await page.locator('[data-hero-canvas]').boundingBox())!;
  const clip = {
    x: Math.max(0, canvasBox.x),
    y: Math.max(0, canvasBox.y),
    width: Math.min(canvasBox.width, 420 - Math.max(0, canvasBox.x)),
    height: Math.min(canvasBox.height, 900 - Math.max(0, canvasBox.y)),
  };
  const box = (await page.locator('.hero__frame').boundingBox())!;
  const away = { x: 5, y: 880 };

  await page.mouse.move(away.x, away.y);
  await page.waitForTimeout(800);
  const rest = await inkSpread(await page.screenshot({ clip }));

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(away.x, away.y);
  const started = Date.now();

  const sampleAt = async (ms: number): Promise<number> => {
    const wait = ms - (Date.now() - started);
    if (wait > 0) await page.waitForTimeout(wait);
    return inkSpread(await page.screenshot({ clip }));
  };

  const early = await sampleAt(300);
  const peak = await sampleAt(1000);
  const held = await sampleAt(1250);
  const settled = await sampleAt(2200);

  const grow = (value: number) => value - rest;

  expect(grow(peak), 'the field should be wide open by the end of the drift').toBeGreaterThan(0.08);
  expect(grow(early), 'early on the field should be nowhere near open').toBeLessThan(
    grow(peak) * 0.6,
  );
  expect(grow(held), 'the field should still be open through the hold').toBeGreaterThan(
    grow(peak) * 0.85,
  );
  expect(grow(settled), 'the field should be home again').toBeLessThan(0.02);
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
