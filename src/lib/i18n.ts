export const LOCALES = ['de', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'de';

export type Localized = { de: string; en: string };

export const isLocale = (v: string): v is Locale => (LOCALES as readonly string[]).includes(v);

export const otherLocale = (l: Locale): Locale => (l === 'de' ? 'en' : 'de');

export const pick = (field: Localized, locale: Locale): string =>
  locale === 'en' && field.en ? field.en : field.de;
