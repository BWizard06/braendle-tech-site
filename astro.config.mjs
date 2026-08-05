import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://braendle.tech',
  integrations: [
    react(),
    sitemap({
      filter: (page) => new URL(page).pathname !== '/',
      i18n: {
        defaultLocale: 'de',
        locales: { de: 'de', en: 'en' },
      },
    }),
  ],
  i18n: {
    defaultLocale: 'de',
    locales: ['de', 'en'],
    routing: {
      prefixDefaultLocale: true,
      redirectToDefaultLocale: false,
    },
  },
  vite: {
    resolve: { dedupe: ['three'] },
  },
});
