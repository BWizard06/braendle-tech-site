import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locale } from './i18n';

const FILES: Record<Locale, string> = {
  de: '/cv-ben-braendle.pdf',
  en: '/cv-ben-braendle-en.pdf',
};

export function cvHref(locale: Locale): string {
  const wanted = FILES[locale];
  return existsSync(resolve(process.cwd(), `public${wanted}`)) ? wanted : FILES.de;
}
