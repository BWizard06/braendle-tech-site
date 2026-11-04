# braendle.tech

My personal portfolio as a fullstack developer near Zurich, Switzerland.

**[Visit braendle.tech](https://braendle.tech)**

The site introduces my work in German and English, with customer projects, personal projects,
the technologies I use, downloadable CVs and a contact form. An animated 3D companion adds a
little personality as visitors explore the page.

## Features

- Static pages at `/de/` and `/en/`, with light and dark themes.
- A Three.js companion that responds to the pointer, moves between sections and plays gestures.
  Mobile navigation skips distant intermediate stops, hides speech bubbles while scrolling
  and pauses the companion while the on-screen keyboard is open.
- Rendering through `requestAnimationFrame`, with a 30 fps budget for quiet mobile states and
  up to 60 fps during movements. Rendering pauses when the companion is offscreen or the tab
  is hidden. Reduced-motion preferences skip the companion model download; a static poster
  also provides a fallback when WebGL or model loading is unavailable.
- An optional 3D playground at `/de/ben/` and `/en/ben/`, with orbit controls and 22 selectable
  animations. Its larger model loads separately from the portfolio companion.
- A contact endpoint built with Cloudflare Pages Functions and Resend, including validation,
  a honeypot and a per-IP rate limit backed by Cloudflare KV.

## Stack

Astro, TypeScript, Three.js and React for the 3D playground. Fonts are served locally.
Vitest covers the application logic; Playwright covers browser behaviour across Chromium,
WebKit and Firefox. The site is hosted on Cloudflare Pages.

## Local development

Use Node 24, as specified in `.nvmrc` and `mise.toml`.

```bash
npm ci
npm run dev -- --background
```

The development site normally runs at `http://localhost:4321`. Use `npm run dev -- status`
to check the running server and `npm run dev -- stop` to stop it.

| Command | Purpose |
| --- | --- |
| `npm run build` | Build the static site into `dist/` |
| `npm run preview` | Preview the static production build |
| `npm run typecheck` | Check Astro and TypeScript sources |
| `npm test` | Run unit tests |
| `npm run test:e2e` | Build the site and run browser tests |
| `npm run bake:og` | Generate the German and English link preview images |

Before running browser tests for the first time, install the Playwright browsers:

```bash
npx playwright install
```

## Contact form

Astro's development and preview servers serve the site but do not execute Cloudflare Pages
Functions. To run the contact endpoint locally, create a private `.dev.vars` file in the
project root with `RESEND_API_KEY`, `CONTACT_TO` and, optionally, `CONTACT_FROM`. Use your own
test credentials and a sender verified in Resend. Then run:

```bash
npm run build
npx wrangler pages dev dist --kv CONTACT_RATE_LIMIT
```

Wrangler supplies the local KV namespace. Submitting the form in this setup sends through
the configured Resend account. Unit and browser tests use mocked delivery instead.

## Project structure

```text
src/
  components/       Page sections, companion markup and the React playground
  lib/companion/    Positioning, animation, holograms and rendering lifecycle
  lib/avatar/       Playground model player and animation catalogue
  lib/contact/      Form validation, rate limiting and email delivery
  content.ts        Portfolio content in German and English
  layouts/          Shared page shell and metadata
  pages/            Localised portfolio, playground and error pages
  styles/           Shared and playground styles
functions/api/      Cloudflare Pages contact endpoint
public/             Web models, poster, project previews, CVs and metadata
scripts/            Link preview image generation
tests/              Unit and browser tests
```

Private references, Blender working files, local tooling settings and generated test output
are excluded from Git. The repository includes the exported assets required by the website.

## Deployment

The Cloudflare Pages Git integration builds and deploys pushes to `main` using `npm run build`
and the output directory `dist`. Pages also compiles `functions/api/contact.ts` as the
`/api/contact` endpoint. `public/_redirects` sends `/` to `/de/`.

Configure the following in the Cloudflare Pages project:

| Setting | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Secret for sending contact messages through Resend |
| `CONTACT_TO` | Recipient address |
| `CONTACT_FROM` | Optional verified sender; defaults to `braendle.tech <website@braendle.tech>` |
| `CONTACT_RATE_LIMIT` | KV namespace binding for the contact rate limit |

Production and preview environments have separate configuration. Set each environment's
secrets, recipient and KV binding explicitly; use a test recipient for previews. The endpoint
returns an unavailable response if its required configuration is missing. Keep credentials in
Cloudflare or the ignored local `.dev.vars` file, never in source control.
