/**
 * Theme persistence. Client-safe — no node builtins.
 *
 * The theme lives on `<html data-theme>`; every colour token in globals.css
 * hangs off that attribute, so flipping it re-skins the app with no React work.
 * `THEME_BOOT_SCRIPT` runs before paint in the document head so a reload never
 * flashes the wrong palette.
 */

export const THEMES = ['dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_KEY = 'karkhana:theme';

export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t!=='dark'&&t!=='light'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='dark'}`;

export function readTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  const attr = document.documentElement.dataset.theme;
  return attr === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* private mode — the boot script falls back to the OS preference */
  }
}
