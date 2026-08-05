export const LOCALES = ['de', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'de';

export type Localized = { de: string; en: string };

export const isLocale = (v: string): v is Locale => (LOCALES as readonly string[]).includes(v);

export const otherLocale = (l: Locale): Locale => (l === 'de' ? 'en' : 'de');

export const pick = (field: Localized, locale: Locale): string =>
  locale === 'en' && field.en ? field.en : field.de;

const BIRTH_DATE = new Date('2006-07-26T00:00:00Z');

export function ageInYears(on: Date): number {
  let age = on.getUTCFullYear() - BIRTH_DATE.getUTCFullYear();
  const beforeBirthday =
    on.getUTCMonth() < BIRTH_DATE.getUTCMonth() ||
    (on.getUTCMonth() === BIRTH_DATE.getUTCMonth() && on.getUTCDate() < BIRTH_DATE.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}
