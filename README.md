# braendle.tech

The personal website of Ben Brändle, a fullstack developer near Zurich, Switzerland.

**Live:** [braendle.tech](https://braendle.tech)

A single page in German and English with a short introduction, the technologies I work with, a
reference project, my CV and contact details. The hero is a portrait drawn out of roughly 25,000
particles: they swirl under the pointer and scatter on a click or tap before settling back.

## Tech stack

- [Astro](https://astro.build) with static output, DE/EN routing and view transitions
- [React Three Fiber](https://r3f.docs.pmnd.rs), [drei](https://drei.docs.pmnd.rs) and
  [three.js](https://threejs.org) for the particle hero, loaded as a single lazy island
- Custom GLSL shaders for the pointer field and the burst
- [Vitest](https://vitest.dev) and [Playwright](https://playwright.dev) (Chromium, WebKit, Firefox)
- Hosted on [Cloudflare Pages](https://pages.cloudflare.com)

Visitors who prefer reduced motion, or whose browser has no WebGL, see a static poster rendered
from the same particle data, so both versions look the same.

## Getting started

Requires Node 24 (see `.nvmrc`).

```bash
npm install
npm run dev
```

The site runs at `http://localhost:4321`.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Build the static site into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the unit tests |
| `npm run test:e2e` | Run the browser tests |
| `npm run typecheck` | Type-check the project |
| `npm run bake` | Render the light and dark hero posters |
| `npm run bake:og` | Render the link preview images |

## Project structure

```
src/
  components/
    islands/    HeroCanvas.tsx, the particle portrait
    sections/   Hero, Stack, Work, Contact
  lib/          particle sampling, shaders, i18n, theme
  content.ts    all texts in German and English
  layouts/      page shell, meta tags and structured data
  pages/        /de/, /en/ and the 404 page
public/         CVs, favicon, link previews, redirects
scripts/        poster and link preview rendering
tests/          unit and browser tests
```

## Deployment

Every push to `main` is built and deployed by Cloudflare Pages with the build command
`npm run build` and the output directory `dist`. `public/_redirects` sends `/` to `/de/`.
