import type { ThemeName } from './hero/palette';

export const THEME_STORAGE_KEY = 'braendle-theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function systemTheme(): ThemeName {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

export function storedTheme(): ThemeName | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export function resolveTheme(): ThemeName {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'light' || explicit === 'dark') return explicit;
  return systemTheme();
}

export function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage unavailable */
  }
  document.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
}

export function onThemeChange(handler: (theme: ThemeName) => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  const fromSystem = () => {
    if (!document.documentElement.dataset.theme) handler(systemTheme());
  };
  const fromToggle = () => handler(resolveTheme());

  media.addEventListener('change', fromSystem);
  document.addEventListener('themechange', fromToggle);
  return () => {
    media.removeEventListener('change', fromSystem);
    document.removeEventListener('themechange', fromToggle);
  };
}
