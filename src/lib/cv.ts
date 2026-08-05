import type { Locale } from './i18n';

const FILES: Record<Locale, string> = {
  de: '/cv-ben-braendle.pdf',
  en: '/cv-ben-braendle-en.pdf',
};

export function cvHref(locale: Locale): string {
  return FILES[locale];
}
