import { expect, test } from '@playwright/test';
import { TRICKS } from '../../src/lib/companion/gestures';

const BEN = '[data-companion]';
// Ben's canvas lives in the page (or in a sticky dock), not inside [data-companion].
const CANVAS = 'canvas[data-ben-canvas]';

test('loads the model and leaves page controls usable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/de/');
  await expect(page.locator(`${BEN}[data-ready]`)).toBeVisible({ timeout: 15000 });
  await expect(page.locator(CANVAS)).toHaveCount(1);
  await expect(page.locator(BEN)).toHaveAttribute('data-action', 'idle', { timeout: 10000 });
  await page.locator('#start').getByRole('link', { name: 'Nachricht schreiben' }).click();
  await expect(page).toHaveURL(/#kontakt$/);
  expect(errors).toEqual([]);
});

test('a quiet scroll cue at the bottom of the hero leads to the technologies', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/de/');
  const cue = page.locator('#start .hero__scroll');
  await expect(cue).toBeVisible();
  await expect(cue).toHaveText('Scroll');
  await expect(cue).toHaveAttribute('href', '#stack');
  await expect(page.getByRole('link', { name: 'Zu den Technologien scrollen' })).toBeVisible();
  // Centred horizontally, below everything else in the hero.
  const [box, hero, frame] = await Promise.all([cue.boundingBox(), page.locator('#start').boundingBox(), page.locator('.hero__frame').boundingBox()]);
  expect(Math.abs(box!.x + box!.width / 2 - (hero!.x + hero!.width / 2))).toBeLessThan(2);
  expect(box!.y).toBeGreaterThan(frame!.y + frame!.height);
  expect(hero!.y + hero!.height - (box!.y + box!.height)).toBeLessThan(60);
  // The removed invitation, buttons and status line stay gone.
  for (const gone of ['Los geht’s', 'Zurückwinken', 'Weiter entdecken', 'Begleiter ausblenden', 'Lass uns zusammen meine Website erkunden.', 'Ich begleite dich beim Entdecken.']) {
    await expect(page.locator('#start').getByText(gone)).toHaveCount(0);
  }
});

test('the 3D link sits quietly under the welcome in the hero', async ({ page }) => {
  await page.goto('/de/');
  const welcome = page.locator('#start .hero__welcome');
  const link = page.locator('#start').getByRole('link', { name: 'Ben in 3D entdecken' });
  await expect(welcome).toHaveText('Hi, ich bin Ben.');
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute('href', '/de/ben/');
  await expect(link).toHaveAttribute('data-astro-reload', '');
  const [above, below] = await Promise.all([welcome.boundingBox(), link.boundingBox()]);
  expect(below!.y).toBeGreaterThanOrEqual(above!.y + above!.height - 1);
  expect(below!.y - (above!.y + above!.height)).toBeLessThan(24);
});

test('feet stay planted while Ben stands idle', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/de/');
  await expect(page.locator(`${BEN}[data-ready]`)).toBeVisible({ timeout: 15000 });
  await expect(page.locator(BEN)).toHaveAttribute('data-action', 'idle', { timeout: 15000 });
  // Let the greeting-to-idle cross-fade settle, then sample a whole 6 s idle loop.
  await page.waitForTimeout(1000);
  const ground = await page.evaluate(async () => {
    const values: number[] = [];
    const start = performance.now();
    while (performance.now() - start < 6200) {
      await new Promise(requestAnimationFrame);
      const node = document.querySelector<HTMLElement>('[data-companion]')!;
      if (node.dataset.action === 'idle') values.push(Number(node.dataset.ground));
    }
    return values;
  });
  expect(ground.length).toBeGreaterThan(20);
  expect(Math.max(...ground) - Math.min(...ground)).toBeLessThan(1);
});

test('Ben never hops when switching between standing clips', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/de/');
  await expect(page.locator(`${BEN}[data-ready]`)).toBeVisible({ timeout: 15000 });
  // Entrance → greeting → idle: two clip changes while standing.
  const ground = await page.evaluate(async () => {
    const values: number[] = [];
    const start = performance.now();
    while (performance.now() - start < 8000) {
      await new Promise(requestAnimationFrame);
      const value = Number(document.querySelector<HTMLElement>('[data-companion]')!.dataset.ground);
      if (Number.isFinite(value)) values.push(value);
    }
    return values;
  });
  // Clip changes may glide by a couple of pixels; the old per-frame tracking spiked 7–10 px.
  expect(Math.max(...ground) - Math.min(...ground)).toBeLessThan(4);
});

test('gaze changes the rendered portrait', async ({ page }) => {
  await page.goto('/de/');
  await expect(page.locator(`${BEN}[data-ready]`)).toBeVisible({ timeout: 15000 });
  await expect(page.locator(BEN)).toHaveAttribute('data-action', 'idle', { timeout: 10000 });
  await page.mouse.move(30, 150);
  await page.waitForTimeout(700);
  const left = await page.locator(CANVAS).screenshot();
  await page.mouse.move(1200, 150);
  await page.waitForTimeout(700);
  const right = await page.locator(CANVAS).screenshot();
  expect(left.equals(right)).toBe(false);
});

test('Ben turns his head towards the cursor', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/de/');
  await expect(page.locator(BEN)).toHaveAttribute('data-action', 'idle', { timeout: 20000 });
  const box = (await page.locator('[data-ben-bounds]').boundingBox())!;
  const headY = box.y + box.height * .12, headX = box.x + box.width / 2;
  const look = async (x: number) => {
    await page.mouse.move(x, headY, { steps: 4 });
    await page.waitForTimeout(1200);
    return Number(await page.locator(BEN).getAttribute('data-look'));
  };
  // Positive is towards the viewer's right.
  expect(await look(headX - 500)).toBeLessThan(-20);
  expect(await look(headX + 380)).toBeGreaterThan(20);
  expect(Math.abs(await look(headX))).toBeLessThan(5);
});

test('scrolling visits both stations and returns to the hero without extra canvases', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/de/');
  await expect(page.locator(`${BEN}[data-ready]`)).toBeVisible({ timeout: 15000 });
  for (const [index, selector] of [[1, '#stack'], [2, '#work']] as const) {
    await page.evaluate(selector => {
      const y = document.querySelector(selector)!.getBoundingClientRect().top + scrollY;
      window.scrollTo({ top: y - innerHeight * .4, behavior: 'instant' });
    }, selector);
    // Ben first finishes materialising (2.6 s), then beams to the station.
    await expect(page.locator(BEN)).toHaveAttribute('data-station', String(index), { timeout: 10000 });
    await expect(page.locator(BEN)).toHaveAttribute('data-travel', 'false');
    const collision = await page.evaluate(() => {
      const ben = document.querySelector('[data-ben-bounds]')!.getBoundingClientRect();
      return [...document.querySelectorAll('a,button')].filter(e => {
        const r = e.getBoundingClientRect();
        return r.width && r.height && r.top < ben.bottom && r.bottom > ben.top && r.left < ben.right && r.right > ben.left;
      }).map(e => e.textContent);
    });
    expect(collision).toEqual([]);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(page.locator(BEN)).toHaveAttribute('data-station', '0');
  await expect(page.locator(CANVAS)).toHaveCount(1);
});

test('reduced motion never downloads or mounts the 3D model', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const models: string[] = [];
  page.on('request', r => { if (r.url().endsWith('.glb')) models.push(r.url()); });
  await page.goto('/de/');
  await expect(page.locator('[data-ben-poster]')).toBeVisible();
  await expect(page.locator(CANVAS)).toHaveCount(0);
  expect(models).toEqual([]);
});

test('a failed model request retains the portrait and working project links', async ({ page }) => {
  await page.route('**/ben-hero.glb', route => route.abort());
  await page.goto('/de/');
  await expect(page.locator(BEN)).toHaveAttribute('data-fallback', 'true', { timeout: 15000 });
  await expect(page.locator('[data-ben-poster]')).toHaveCSS('opacity', '1');
  await expect(page.getByRole('heading', { name: 'Persönliche Projekte', exact: true })).toBeVisible();
});

test('on a phone Ben follows through the page at a smaller size', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/de/');
  await expect(page.locator(BEN)).toHaveAttribute('data-action', 'idle', { timeout: 20000 });
  const heroHeight = (await page.locator('[data-ben-bounds]').boundingBox())!.height;
  const visit = async (selector: string, station: string) => {
    await page.evaluate(selector => window.scrollTo({
      top: document.querySelector(selector)!.getBoundingClientRect().top + scrollY - innerHeight * .55, behavior: 'instant',
    }), selector);
    await expect(page.locator(BEN)).toHaveAttribute('data-station', station, { timeout: 10000 });
    await expect(page.locator(BEN)).toHaveAttribute('data-travel', 'false', { timeout: 10000 });
    return (await page.locator('[data-ben-bounds]').boundingBox())!;
  };
  // After the hero he is much smaller, stands inside the viewport and never widens the page.
  for (const [selector, station] of [['#stack', '1'], ['#project-corelation .work__bullets', '2'], ['#project-lacuna .work__lead', '2'], ['[data-contact-form]', '3']] as const) {
    const box = await visit(selector, station);
    expect(box.height).toBeLessThan(heroHeight * .5);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('entrance materialises Ben at his hero station instead of walking in', async ({ page }) => {
  await page.setViewportSize({width:1280,height:900});
  await page.goto('/de/');
  await expect(page.locator(`${BEN}[data-ready]`)).toBeVisible({timeout:15000});
  const samples=await page.evaluate(async()=>{
    const rows:Array<{action:string;x:number;size:string;label:string}>=[];
    const start=performance.now();
    while(performance.now()-start<2500){
      await new Promise(requestAnimationFrame);
      const b=document.querySelector<HTMLElement>('[data-companion]')!;
      const canvas=document.querySelector<HTMLCanvasElement>('canvas[data-ben-canvas]')!;
      const title=document.querySelector('#hero-name')!;
      rows.push({action:b.dataset.action??'',x:document.querySelector('[data-ben-bounds]')!.getBoundingClientRect().x,size:`${canvas.width}x${canvas.height}`,label:title.getAttribute('aria-label')??title.textContent??''});
    }
    return rows;
  });
  const spawning=samples.filter(s=>s.action==='spawn');
  expect(spawning.length).toBeGreaterThan(5);
  const xs=spawning.map(s=>s.x);
  expect(Math.max(...xs)-Math.min(...xs)).toBeLessThan(1);
  expect(Math.min(...xs)).toBeGreaterThan(650);
  expect(new Set(samples.map(s=>s.size)).size).toBe(1);
  // The title decodes visually, but its accessible name never changes.
  expect(samples.every(s=>s.label==='Ben Brändle')).toBe(true);
  await expect(page.locator(BEN)).not.toHaveAttribute('data-action','spawn',{timeout:10000});
  await expect(page.locator('#hero-name')).toHaveText('Ben Brändle');
  await expect(page.locator('#hero-name')).not.toHaveAttribute('aria-label');
  // The canvas is sized to Ben (with room for the beams), not to the whole viewport.
  const [size, ben] = await Promise.all([page.locator(CANVAS).boundingBox(), page.locator('[data-ben-bounds]').boundingBox()]);
  expect(size!.width).toBeLessThan(1280);
  expect(size!.x).toBeLessThanOrEqual(ben!.x);
  expect(size!.x + size!.width).toBeGreaterThanOrEqual(ben!.x + ben!.width);
  expect(size!.y).toBeLessThanOrEqual(ben!.y);
  expect(size!.y + size!.height).toBeGreaterThanOrEqual(ben!.y + ben!.height);
});

test('every visit plays the full entrance and decodes the title again', async ({ page }) => {
  await page.goto('/de/');
  await expect(page.locator(BEN)).toHaveAttribute('data-action', 'idle', { timeout: 20000 });
  await page.reload();
  await expect(page.locator(`${BEN}[data-ready]`)).toBeVisible({ timeout: 15000 });
  const frames = await page.evaluate(async () => {
    const rows: Array<{ t: number; action: string; decoding: boolean }> = [];
    const start = performance.now();
    while (performance.now() - start < 3500) {
      await new Promise(requestAnimationFrame);
      rows.push({
        t: performance.now() - start,
        action: document.querySelector<HTMLElement>('[data-companion]')!.dataset.action ?? '',
        decoding: document.querySelector('#hero-name')!.hasAttribute('aria-label'),
      });
    }
    return rows;
  });
  const spawn = frames.filter(f => f.action === 'spawn');
  expect(spawn.at(-1)!.t - spawn[0]!.t).toBeGreaterThan(2000);
  expect(frames.some(f => f.decoding)).toBe(true);
});

test('scrolling through the technologies keeps Ben on a visible row', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/de/');
  await expect(page.locator(BEN)).toHaveAttribute('data-action', 'idle', { timeout: 20000 });
  // Rest the pointer where the rows will pass by, then wheel down until the third row is mid-screen.
  await page.mouse.move(640, 450);
  const distance = await page.evaluate(() => document.querySelectorAll('[data-ben-row]')[2]!.getBoundingClientRect().top - innerHeight * .45);
  for (let done = 0; done < distance; done += 120) { await page.mouse.wheel(0, Math.min(120, distance - done)); await page.waitForTimeout(60); }
  // He follows the list down instead of staying on the section's top rule out of sight.
  await expect.poll(() => page.evaluate(() => {
    const ben = document.querySelector<HTMLElement>('[data-companion]')!;
    const row = Number(ben.dataset.row);
    if (ben.dataset.station !== '1' || ben.dataset.action !== 'idle' || row < 1) return `station ${ben.dataset.station}, row ${row}, ${ben.dataset.action}`;
    const feet = document.querySelector('[data-ben-bounds]')!.getBoundingClientRect().bottom;
    const rule = document.querySelectorAll('[data-ben-row]')[row]!.getBoundingClientRect().bottom;
    return Math.abs(feet - rule) < 2 && feet > 165 && feet < innerHeight ? 'on a visible row' : `feet ${feet}, rule ${rule}`;
  }), { timeout: 10000 }).toBe('on a visible row');
});

test('hovering a technology row lets Ben hop up to it, one row at a time and feet on the rules', async ({ page }) => {
  await page.setViewportSize({width:1280,height:900});
  await page.goto('/de/');
  await expect(page.locator(`${BEN}[data-ready]`)).toBeVisible({timeout:15000});
  const rows = page.locator('#stack [data-ben-row]');
  await page.evaluate(() => window.scrollTo({
    top: document.querySelector('#stack')!.getBoundingClientRect().top + scrollY - 40,
    behavior: 'instant',
  }));
  await expect(page.locator(BEN)).toHaveAttribute('data-station', '1', {timeout:10000});
  await expect(page.locator(BEN)).toHaveAttribute('data-action', 'idle', {timeout:10000});
  // Every row has faded in; Ben stands on one of the lower ones.
  await expect(rows.nth(4)).toHaveAttribute('data-reveal', 'shown');
  const start = Number(await page.locator(BEN).getAttribute('data-row'));
  expect(start).toBeGreaterThanOrEqual(2);
  // Hovers right after a scroll are ignored (rows scrolling under a resting pointer).
  await page.waitForTimeout(400);
  const first = (await rows.nth(0).boundingBox())!;
  const trace = page.evaluate(async () => {
    const node = document.querySelector<HTMLElement>('[data-companion]')!;
    const seen: Array<{ action: string; row: number; ground: number }> = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 4500) {
      await new Promise(requestAnimationFrame);
      seen.push({ action: node.dataset.action ?? '', row: Number(node.dataset.row), ground: Number(node.dataset.ground) });
    }
    return seen;
  });
  await page.mouse.move(first.x + 60, first.y + 30, {steps:3});
  const frames = await trace;
  // Row numbers only ever step by one, and every row on the way is visited.
  const visited = frames.map(f => f.row).filter((row, i, all) => row !== all[i - 1]);
  expect(visited[0]).toBe(start);
  expect(visited.at(-1)).toBe(0);
  for (let i = 1; i < visited.length; i++) expect(Math.abs(visited[i]! - visited[i - 1]!)).toBe(1);
  expect(frames.some(f => f.action === 'hop')).toBe(true);
  // The ground offset stays put: the arc lifts Ben, the clip never drops him below a rule.
  const grounds = frames.map(f => f.ground);
  expect(Math.max(...grounds) - Math.min(...grounds)).toBeLessThan(4);
  const offset = await page.evaluate(() => Math.abs(document.querySelector('[data-ben-bounds]')!.getBoundingClientRect().bottom
    - document.querySelectorAll('[data-ben-row]')[0]!.getBoundingClientRect().bottom));
  expect(offset).toBeLessThan(2);
  await expect(page.locator('[data-ben-bubble]')).toHaveText('Alles, was man im Browser sieht und anklickt.');
  await expect(page.locator('#stack a, #stack button, #stack [tabindex], #stack [aria-pressed]')).toHaveCount(0);
  await expect(page.locator('.stack__item').filter({hasText:'TypeScript'})).toHaveCSS('cursor', 'default');
});

test('Ben ignores the cursor while he materialises and greets', async ({ page }) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/de/');
  await page.mouse.move(20, 120);
  await expect(page.locator(`${BEN}[data-ready]`)).toBeVisible({timeout:15000});
  const looks = await page.evaluate(async () => {
    const rows: Array<{action: string; look: number}> = [];
    const start = performance.now();
    while (performance.now() - start < 9000) {
      await new Promise(requestAnimationFrame);
      const node = document.querySelector<HTMLElement>('[data-companion]')!;
      rows.push({action: node.dataset.action ?? '', look: Number(node.dataset.look ?? 0)});
      if (node.dataset.action === 'idle' && rows.filter(r => r.action === 'idle').length > 90) break;
    }
    return rows;
  });
  const busy = looks.filter(r => r.action === 'spawn' || r.action === 'wave');
  expect(busy.length).toBeGreaterThan(20);
  expect(Math.max(...busy.map(r => Math.abs(r.look)))).toBeLessThan(2);
  // Afterwards his gaze eases over to the cursor on the far left (slower on a busy machine).
  await expect.poll(async () => Number(await page.locator(BEN).getAttribute('data-look')), { timeout: 10000 }).toBeLessThan(-20);
});

test('fast scrolling past several sections ends in one beam where the visitor stops', async ({ page }) => {
  await page.setViewportSize({width:1280,height:900});
  await page.goto('/de/');
  await expect(page.locator(BEN)).toHaveAttribute('data-action', 'idle', {timeout:20000});
  const actions = await page.evaluate(async () => {
    const node = document.querySelector<HTMLElement>('[data-companion]')!;
    const seen: string[] = [];
    let sampling = true;
    void (async () => { while (sampling) { await new Promise(requestAnimationFrame); seen.push(`${node.dataset.action}@${node.dataset.station}`); } })();
    const target = document.querySelector('#project-daytona')!.getBoundingClientRect().top + scrollY - 300;
    for (let y = 0; y <= target; y += 160) { window.scrollTo({top: y, behavior: 'instant'}); await new Promise(r => setTimeout(r, 70)); }
    window.scrollTo({top: target, behavior: 'instant'});
    await new Promise(r => setTimeout(r, 3000));
    sampling = false;
    return seen;
  });
  const beams = actions.filter((a, i) => a.startsWith('beam') && !actions[i - 1]?.startsWith('beam'));
  expect(beams).toHaveLength(1);
  expect(actions.at(-1)).toBe('idle@2');
});

test('technology rows are decorative and respect reduced motion', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  const models: string[] = [];
  page.on('request', request => { if (request.url().endsWith('.glb')) models.push(request.url()); });
  await page.goto('/de/');
  await page.locator('#stack .stack__row').nth(2).hover();
  await expect(page.locator(CANVAS)).toHaveCount(0);
  await expect(page.locator('#stack button, #stack [role="button"]')).toHaveCount(0);
  await expect(page.locator('#project-daytona [data-work-link="site"]')).toHaveAttribute('href', 'https://daytona.braendle.tech/');
  expect(models).toEqual([]);
});

test('clicking Ben plays a different trick each time and he comments on it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/de/');
  await expect(page.locator(BEN)).toHaveAttribute('data-action', 'idle', { timeout: 20000 });
  const box = (await page.locator('[data-ben-bounds]').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator(BEN)).toHaveAttribute('data-gestures', 'ready', { timeout: 15000 });
  const tricks: readonly string[] = TRICKS;
  const played: string[] = [];
  for (let n = 0; n < 2; n++) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(async () => `${await page.locator(BEN).getAttribute('data-action')} (click ${n + 1})`, { timeout: 5000 })
      .toMatch(new RegExp(`^(${tricks.join('|')}) `));
    played.push((await page.locator(BEN).getAttribute('data-action'))!);
    await expect(page.locator('[data-ben-bubble]')).toHaveAttribute('data-show', 'true');
    await expect(page.locator(BEN)).toHaveAttribute('data-action', 'idle', { timeout: 10000 });
  }
  expect(played[0]).not.toBe(played[1]);
  // Ben is decorative: the click target never becomes a focusable control.
  await expect(page.locator('[data-ben-bounds]')).not.toHaveAttribute('tabindex');
});

test('Ben hints in a speech bubble that he can be clicked', async ({ page }) => {
  await page.goto('/de/');
  await expect(page.locator('[data-ben-bubble]')).toHaveText('Psst … klick mich mal an!', { timeout: 20000 });
  await expect(page.locator('[data-ben-bubble]')).toHaveAttribute('data-show', 'true');
  const [bubble, ben] = await Promise.all([page.locator('[data-ben-bubble]').boundingBox(), page.locator('[data-ben-bounds]').boundingBox()]);
  // Beside his head: left of him and within his upper third.
  expect(bubble!.x + bubble!.width).toBeLessThan(ben!.x + ben!.width / 2);
  expect(bubble!.y + bubble!.height / 2).toBeLessThan(ben!.y + ben!.height / 3);
});

for (const [label, width, height] of [['desktop', 1440, 900], ['phone', 390, 844]] as const) {
  test(`${label}: Ben stays in view while a project is read and names it`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/de/');
    await expect(page.locator(BEN)).toHaveAttribute('data-action', 'idle', { timeout: 20000 });
    for (const [id, line] of [['kati-schepis', 'Website einer Feng-Shui-Beraterin.'], ['lacuna', 'Eine fiktive Villa im Tessin.']] as const) {
      // Read the middle of the project: its rule is long gone above.
      await page.evaluate(id => window.scrollTo({
        top: document.querySelector(`#project-${id} .work__lead`)!.getBoundingClientRect().top + scrollY - innerHeight * .3, behavior: 'instant',
      }), id);
      await expect(page.locator(BEN)).toHaveAttribute('data-station', '2', { timeout: 10000 });
      await expect(page.locator(BEN)).toHaveAttribute('data-action', 'idle', { timeout: 10000 });
      const box = (await page.locator('[data-ben-bounds]').boundingBox())!;
      // He stands at the bottom of the screen, fully visible.
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(Math.abs(box.y + box.height - height)).toBeLessThan(3);
      await expect(page.locator('[data-ben-bubble]')).toHaveText(line);
      // And he covers no text link or button (a full-width preview image may pass behind him).
      const hits = await page.evaluate(() => {
        const ben = document.querySelector('[data-ben-bounds]')!.getBoundingClientRect();
        return [...document.querySelectorAll('a:not(.work__preview),button')].filter(e => {
          const r = e.getBoundingClientRect();
          return r.width && r.top < ben.bottom && r.bottom > ben.top && r.left < ben.right && r.right > ben.left;
        }).map(e => e.textContent?.trim());
      });
      expect(hits).toEqual([]);
    }
  });
}
