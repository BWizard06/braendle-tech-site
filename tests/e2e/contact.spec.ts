import { expect, test, type Page } from '@playwright/test';

const BEN = '[data-companion]';
const FORM = '[data-contact-form]';

async function fill(page: Page) {
  await page.locator(`${FORM} input[name="name"]`).fill('Anna Muster');
  await page.locator(`${FORM} input[name="email"]`).fill('anna@example.ch');
  await page.locator(`${FORM} textarea[name="message"]`).fill('Hallo Ben, ich hätte ein spannendes Projekt.');
}

test('Ben waits at the contact form and bows once a message is sent', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const posted: unknown[] = [];
  await page.route('**/api/contact', async (route) => {
    posted.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.goto('/de/');
  await expect(page.locator(BEN)).toHaveAttribute('data-action', 'idle', { timeout: 20000 });
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  // At the end of the page Ben beams to the contact station on the footer rule.
  await expect(page.locator(BEN)).toHaveAttribute('data-station', '3', { timeout: 10000 });
  const offset = await page.evaluate(() => {
    const feet = document.querySelector('[data-ben-bounds]')!.getBoundingClientRect().bottom;
    return Math.abs(feet - document.querySelector('.contact__foot')!.getBoundingClientRect().top);
  });
  expect(offset).toBeLessThan(2);
  await fill(page);
  await page.getByRole('button', { name: 'Nachricht senden' }).click();
  await expect(page.locator('[data-contact-status]')).toHaveText('Danke! Deine Nachricht ist angekommen, ich melde mich bald.');
  await expect(page.locator(BEN)).toHaveAttribute('data-action', 'bow', { timeout: 5000 });
  await expect(page.locator(BEN)).toHaveAttribute('data-action', 'idle', { timeout: 8000 });
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({ name: 'Anna Muster', email: 'anna@example.ch', locale: 'de', website: '' });
  await expect(page.locator(`${FORM} textarea`)).toHaveValue('');
});

test('a rate-limited message explains when to try again', async ({ page }) => {
  await page.route('**/api/contact', (route) => route.fulfill({
    status: 429, contentType: 'application/json', body: '{"ok":false,"error":"rate_limited","retryAfter":1740}',
  }));
  await page.goto('/en/');
  await page.locator(FORM).scrollIntoViewIfNeeded();
  await page.locator(`${FORM} input[name="name"]`).fill('Anna');
  await page.locator(`${FORM} input[name="email"]`).fill('anna@example.ch');
  await page.locator(`${FORM} textarea`).fill('Hello Ben, quick question about your work.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('[data-contact-status]')).toContainText('Try again in 29 min');
  // The visitor's text stays, so nothing is lost.
  await expect(page.locator(`${FORM} textarea`)).toHaveValue('Hello Ben, quick question about your work.');
});

test('the browser checks required fields before anything is sent', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/contact', (route) => { requests++; return route.abort(); });
  await page.goto('/de/');
  await page.locator(FORM).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Nachricht senden' }).click();
  expect(await page.locator(`${FORM} input[name="name"]`).evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  expect(requests).toBe(0);
  await expect(page.getByRole('textbox', { name: 'E-Mail' })).toHaveAttribute('type', 'email');
  await expect(page.getByRole('textbox', { name: 'Nachricht' })).toBeVisible();
});

test('the contact form fits a phone, with a small Ben beside it', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/de/');
  await page.locator(FORM).scrollIntoViewIfNeeded();
  const box = (await page.locator(FORM).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(15);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('a[href="#kontakt"]').first()).toHaveText('Nachricht schreiben');
  // Next to the form (without scrolling to the very end) Ben is there, small, and touches no
  // field or button.
  await expect(page.locator(BEN)).toHaveAttribute('data-station', '3', { timeout: 20000 });
  await expect(page.locator(BEN)).toHaveAttribute('data-travel', 'false', { timeout: 10000 });
  const station = (await page.locator('[data-ben-bounds]').boundingBox())!;
  expect(station.height).toBeLessThan(110);
  expect(station.x + station.width).toBeLessThanOrEqual(375);
  expect(station.y + station.height).toBeLessThanOrEqual(800 + 1);
  for (const control of await page.locator(`${FORM} input:not([type="hidden"]):not([name="website"]), ${FORM} textarea, ${FORM} button`).all()) {
    const r = (await control.boundingBox())!;
    const overlaps = r.x < station.x + station.width && r.x + r.width > station.x && r.y < station.y + station.height && r.y + r.height > station.y;
    expect(overlaps, `Ben overlaps ${await control.getAttribute('name') ?? 'the button'}`).toBe(false);
  }
});
