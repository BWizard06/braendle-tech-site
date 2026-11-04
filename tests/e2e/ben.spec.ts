import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebGL motion checks use the configured Chromium software renderer.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('all exported clips can be selected and scrubbed without rendering errors', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/de/ben/');
  await expect(page.locator('[data-studio-status="ready"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-clip]')).toHaveCount(22);
  await expect(page.getByRole('button', { name: 'Animation abspielen', exact: true })).toBeVisible();
  const names = await page.locator('[data-clip]').evaluateAll(elements => elements.map(e => e.getAttribute('data-clip')!));
  for (const name of names) {
    await page.locator(`[data-clip="${name}"]`).click();
    await expect(page.locator('[data-active-clip]')).toHaveAttribute('data-active-clip', name);
    const slider = page.locator('#ben-timeline');
    const duration = Number(await slider.getAttribute('max'));
    expect(duration).toBeGreaterThan(0);
    await slider.fill(String(Number((duration / 2).toFixed(2))));
    await expect(page.getByRole('button', { name: 'Animation abspielen', exact: true })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('playback advances, pauses, repeats and visibly changes the character', async ({ page }) => {
  await page.goto('/de/ben/');
  await expect(page.locator('[data-studio-status="ready"]')).toBeVisible();
  await page.locator('[data-clip="greet_04"]').click();
  await page.locator('#ben-timeline').fill('0');
  const before = await page.locator('.ben-stage__canvas').screenshot();
  await page.locator('#ben-timeline').fill('1.4');
  const after = await page.locator('.ben-stage__canvas').screenshot();
  expect(before.equals(after)).toBe(false);
  await page.getByLabel('Wiederholen', { exact: true }).check();
  await page.getByRole('button', { name: 'Animation neu starten', exact: true }).click();
  await expect.poll(async () => Number(await page.locator('#ben-timeline').inputValue())).toBeGreaterThan(0.1);
  await page.getByRole('button', { name: 'Animation pausieren', exact: true }).click();
  const paused = await page.locator('#ben-timeline').inputValue();
  await page.waitForTimeout(300);
  expect(await page.locator('#ben-timeline').inputValue()).toBe(paused);
  await page.getByLabel('Tempo', { exact: true }).selectOption('2');
  await page.locator('#ben-timeline').fill('2.7');
  await page.getByRole('button', { name: 'Animation abspielen', exact: true }).click();
  await page.waitForTimeout(400);
  await expect(page.getByRole('button', { name: 'Animation pausieren', exact: true })).toBeVisible();
  expect(Number(await page.locator('#ben-timeline').inputValue())).toBeLessThan(2.7);
});

test('filters, camera controls, mobile layout and English route work', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/de/ben/');
  await expect(page.locator('[data-studio-status="ready"]')).toBeVisible();
  await page.locator('[data-clip="press-up"]').click();
  await expect(page.locator('[data-active-clip]')).toHaveAttribute('data-active-clip', 'press-up');
  const stage = await page.locator('.ben-stage').boundingBox();
  expect(stage!.y).toBeGreaterThanOrEqual(-1);
  expect(stage!.y + stage!.height).toBeLessThan(812);
  await page.getByRole('button', { name: 'Gesten', exact: true }).click();
  await expect(page.locator('[data-clip="bow"]')).toBeVisible();
  await expect(page.locator('[data-clip="flip"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Alle', exact: true }).click();
  await page.getByRole('searchbox').fill('Verbeugung');
  await expect(page.locator('[data-clip]')).toHaveCount(1);
  await page.getByRole('searchbox').fill('xyz-not-a-clip');
  await expect(page.getByText('Keine passende Bewegung gefunden.')).toBeVisible();
  await page.getByRole('button', { name: 'Nahansicht', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Nahansicht', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Skelett zeigen', { exact: true }).check();
  await page.getByLabel('Auf der Stelle', { exact: true }).uncheck();
  const sizes = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(sizes.page).toBeLessThanOrEqual(sizes.viewport);
  await page.getByRole('link', { name: 'View in English', exact: true }).click();
  await expect(page).toHaveURL(/\/en\/ben\/?$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ben, in motion.');
  await expect(page.locator('[data-studio-status="ready"]')).toBeVisible();
  await expect(page.locator('[data-clip]')).toHaveCount(22);
});

test('failed model download offers a working retry', async ({ page }) => {
  let fail = true;
  await page.route('**/models/ben-animated.glb', route => fail ? route.abort() : route.continue());
  await page.goto('/de/ben/');
  await expect(page.getByRole('alert')).toContainText('Die 3D-Ansicht konnte nicht geladen werden.');
  fail = false;
  await page.getByRole('button', { name: 'Noch einmal versuchen', exact: true }).click();
  await expect(page.locator('[data-studio-status="ready"]')).toBeVisible();
  await expect(page.locator('.ben-stage__canvas canvas')).toHaveCount(1);
});
