import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { hero } from '../src/content';
import { LOCALES, pick, type Locale } from '../src/lib/i18n';

const WIDTH = 1200;
const HEIGHT = 630;
const root = process.cwd();

async function dataUri(path: string, mime: string): Promise<string> {
  const bytes = await readFile(resolve(root, path));
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

const [sans, serif, portrait] = await Promise.all([
  dataUri(
    'node_modules/@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2',
    'font/woff2',
  ),
  dataUri(
    'node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2',
    'font/woff2',
  ),
  dataUri('src/assets/hero-poster-light.png', 'image/png'),
]);

function template(locale: Locale): string {
  const line = `${pick(hero.lineBefore, locale)} <em>${pick(hero.lineAccent, locale)}</em>${pick(hero.lineAfter, locale)}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'HeroSans'; src: url('${sans}') format('woff2'); font-weight: 100 900; font-display: block; }
@font-face { font-family: 'HeroSerif'; src: url('${serif}') format('woff2'); font-style: italic; font-display: block; }
* { margin: 0; box-sizing: border-box; }
body {
  width: ${WIDTH}px; height: ${HEIGHT}px;
  display: grid; grid-template-columns: 420px 1fr; align-items: center;
  gap: 60px; padding: 0 78px;
  background: #fbfaf7; color: #141312;
  font-family: 'HeroSans'; -webkit-font-smoothing: antialiased;
}
img { width: 420px; height: 420px; object-fit: contain; }
h1 { font-size: 80px; font-weight: 600; line-height: 0.95; letter-spacing: -0.022em; }
p { margin-top: 16px; font-size: 37px; font-weight: 400; line-height: 1.16; letter-spacing: -0.022em; }
em { font-family: 'HeroSerif'; font-style: italic; font-size: 1.08em; color: #26708c; }
span { display: block; margin-top: 42px; font-size: 24px; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; color: #5a554e; }
</style></head><body>
<img src="${portrait}" alt="">
<div><h1>${hero.name}</h1><p>${line}</p><span>braendle.tech</span></div>
</body></html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });

for (const locale of LOCALES) {
  await page.setContent(template(locale), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const image = document.querySelector('img');
    return Boolean(image?.complete && image.naturalWidth > 0);
  });
  await writeFile(resolve(root, `public/og-${locale}.png`), await page.screenshot({ type: 'png' }));
  console.log(`baked public/og-${locale}.png`);
}

await browser.close();
