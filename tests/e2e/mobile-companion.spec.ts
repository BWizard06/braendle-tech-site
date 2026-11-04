import { expect, test, type Page } from '@playwright/test';
import { TRICKS } from '../../src/lib/companion/gestures';

// A narrow desktop window does not exercise pointer:coarse or the mobile render budget.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 3 });
const BEN = '[data-companion]';
const CANVAS = 'canvas[data-ben-canvas]';
const idle = (page: Page) => expect(page.locator(BEN)).toHaveAttribute('data-action', 'idle', { timeout: 15000 });
async function open(page: Page) {
  await page.goto('/de/');
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
  await idle(page);
}
async function row(page: Page, index: number) {
  await page.locator('[data-ben-row]').nth(index).evaluate(node => window.scrollTo({
    top: node.getBoundingClientRect().bottom + scrollY - innerHeight * .6, behavior: 'instant',
  }));
  await expect(page.locator(BEN)).toHaveAttribute('data-row', String(index));
  await idle(page);
}
async function project(page: Page) {
  await page.locator('#project-kati-schepis .work__lead').evaluate(node => window.scrollTo({
    top: node.getBoundingClientRect().top + scrollY - innerHeight * .3, behavior: 'instant',
  }));
  await expect(page.locator(BEN)).toHaveAttribute('data-station', '2', { timeout: 10000 });
  await idle(page);
}

test('a touch swipe skips obsolete rows, while a neighbouring row still gets a hop', async ({ page }) => {
  await open(page);
  await row(page, 0);
  const last = await page.locator('[data-ben-row]').count() - 1;
  const seen = await page.evaluate(async last => {
    const ben = document.querySelector<HTMLElement>('[data-companion]')!;
    const target = document.querySelectorAll('[data-ben-row]')[last]!.getBoundingClientRect().bottom + scrollY - innerHeight * .6;
    const from = scrollY;
    for (let i = 1; i <= 20; i++) {
      window.scrollTo({ top: from + (target - from) * i / 20, behavior: 'instant' });
      await new Promise(resolve => setTimeout(resolve, 16));
    }
    const rows: number[] = [], start = performance.now();
    while (performance.now() - start < 2000) {
      await new Promise(requestAnimationFrame);
      rows.push(Number(ben.dataset.row));
    }
    return [...new Set(rows)];
  }, last);
  expect(seen.every(value => value === 0 || value === last)).toBe(true);
  await expect(page.locator(BEN)).toHaveAttribute('data-row', String(last));
  await idle(page);
  await page.locator('[data-ben-row]').nth(last - 1).evaluate(node => window.scrollTo({
    top: node.getBoundingClientRect().bottom + scrollY - innerHeight * .6, behavior: 'instant',
  }));
  await expect(page.locator(BEN)).toHaveAttribute('data-action', 'hop');
  await idle(page);
  const offset = await page.evaluate(index => Math.abs(document.querySelector('[data-ben-bounds]')!.getBoundingClientRect().bottom
    - document.querySelectorAll('[data-ben-row]')[index]!.getBoundingClientRect().bottom), last - 1);
  expect(offset).toBeLessThan(2);
});

test('scrolling hides speech bubbles and tapping Ben still plays a trick', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  await project(page);
  await expect(page.locator('[data-ben-bubble]')).toHaveAttribute('data-show', 'true');
  const bubbles = await page.evaluate(async () => {
    const bubble = document.querySelector<HTMLElement>('[data-ben-bubble]')!, visible: string[] = [];
    for (let i = 0; i < 10; i++) {
      window.scrollBy({ top: 4, behavior: 'instant' });
      await new Promise(resolve => setTimeout(resolve, 50));
      visible.push(bubble.dataset.show!);
    }
    return visible;
  });
  expect(bubbles.every(value => value === 'false')).toBe(true);
  await idle(page);
  await page.locator('[data-ben-bounds]').tap();
  await expect(page.locator(BEN)).toHaveAttribute('data-action', new RegExp(`^(${TRICKS.join('|')})$`), { timeout: 7000 });
  await expect(page.locator(CANVAS)).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('toolbar height changes keep the reading target stable and resize switches render budgets', async ({ page }) => {
  await open(page);
  await row(page, 0);
  const ratio = () => page.locator(CANVAS).evaluate(canvas => (canvas as HTMLCanvasElement).width / canvas.getBoundingClientRect().width);
  expect(await ratio()).toBeCloseTo(1.25, 1);
  await page.setViewportSize({ width: 390, height: 760 });
  await page.waitForTimeout(1000);
  await expect(page.locator(BEN)).toHaveAttribute('data-row', '0');
  await idle(page);
  for (const [width, height, dpr] of [[1280, 900, 1.5], [390, 844, 1.25]]) {
    await page.setViewportSize({ width: width!, height: height! });
    await expect.poll(ratio).toBeCloseTo(dpr!, 1);
    await expect(page.locator(CANVAS)).toHaveCount(1);
  }
});

test('the companion clears the form while the visual viewport is occupied by a keyboard', async ({ page }) => {
  await open(page);
  const field = page.locator('[data-contact-form] input:not([type="hidden"]):not([tabindex="-1"])').first();
  await field.evaluate(node => (node as HTMLElement).focus({ preventScroll: true }));
  await page.locator('#kontakt').evaluate(node => window.scrollTo({ top: node.getBoundingClientRect().top + scrollY, behavior: 'instant' }));
  await expect(page.locator(BEN)).toHaveAttribute('data-station', '3', { timeout: 10000 });
  // Model a visual viewport resize without relying on a headless OS keyboard.
  await page.evaluate(() => {
    Object.defineProperty(visualViewport!, 'height', { configurable: true, value: 400 });
    visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(page.locator('[data-ben-body]')).toHaveCSS('visibility', 'hidden');
  await expect(page.locator('[data-ben-bubble]')).toHaveAttribute('data-show', 'false');
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await expect(page.locator('[data-ben-body]')).toHaveCSS('visibility', 'hidden');
  await page.evaluate(() => {
    Reflect.deleteProperty(visualViewport!, 'height');
    visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(page.locator('[data-ben-body]')).toHaveCSS('visibility', 'visible');
  await expect(page.locator(CANVAS)).toHaveCount(1);
});
