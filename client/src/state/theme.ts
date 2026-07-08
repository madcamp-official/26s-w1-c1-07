/**
 * Theme state — runtime swap of the whole-site design theme (design-lab's 6 concepts) + localStorage persistence.
 * (Owned by the architect — source of truth for the theme system. Never touches game logic/coordinates → crossplay invariant.)
 *
 * Behavior: setting the data-theme attribute on <html> makes the themes/<id>.css
 *       `:root[data-theme="<id>"]` block wholesale re-define theme.css's token contract (:root),
 *       so the entire screen is instantly reskinned (color/font/shape/effects). Games run on the pure
 *       @madcade/shared core, so even when two people on different themes play together, judgment/coordinates are identical.
 *
 * Usage:
 *   initTheme();                 // once at main.tsx boot — instantly apply the saved theme to <html> (prevents FOUC)
 *   const t = useTheme();        // subscribe to the current theme in a React component (ThemeShop)
 *   setTheme('neo-brutal');      // instant swap + save (modal button)
 *   getTheme();                  // snapshot for non-React code (canvas game palette)
 */
import { createStore, useStore } from './store';

/** Selectable theme ids — the 6 from design-lab/ideas/*. neon-coinop = default shell (theme.css :root). */
export const THEME_IDS = [
  'neon-coinop',
  'neo-brutal',
  'clay-toy',
  'broadcast-arena',
  'obsidian',
  'pico8',
] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = 'neon-coinop';

/** Meta for modal card display (label/description/preview swatch). The real color/shape source of truth is themes/<id>.css. */
export interface ThemeMeta {
  id: ThemeId;
  /** Display name */
  name: string;
  /** One-line description */
  tagline: string;
  /** Card preview swatch [bg, accent, p1, p2] */
  swatch: [string, string, string, string];
}

export const THEMES: readonly ThemeMeta[] = [
  {
    id: 'neon-coinop',
    name: 'Neon Coin-op',
    tagline: '80s arcade · synthwave · CRT scanlines',
    swatch: ['#0d0221', '#fdf500', '#05d9e8', '#ff2a6d'],
  },
  {
    id: 'neo-brutal',
    name: 'Neo Brutal',
    tagline: 'cream paper · hard shadow · uppercase',
    swatch: ['#fdf6e3', '#ff5c00', '#2b5bff', '#ff2e88'],
  },
  {
    id: 'clay-toy',
    name: 'Clay Toy',
    tagline: 'squishy clay · pastel · soft volume',
    swatch: ['#fff1e6', '#ff8a5c', '#ff6e8a', '#3fc49e'],
  },
  {
    id: 'broadcast-arena',
    name: 'Broadcast Arena',
    tagline: 'esports broadcast graphics · lower-third · ticker',
    swatch: ['#eef2f7', '#0b2f6b', '#0b63e5', '#e0323e'],
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    tagline: 'dark minimal · thin neon · corner-cut',
    swatch: ['#0a0c10', '#00f0ff', '#00f0ff', '#ff3358'],
  },
  {
    id: 'pico8',
    name: 'PICO-8',
    tagline: '16-color pixels · dot texture · 8-bit',
    swatch: ['#1d2b53', '#ffa300', '#29adff', '#ff004d'],
  },
] as const;

interface ThemeState {
  current: ThemeId;
}

const LS_KEY = 'madpump:theme';

function isThemeId(v: unknown): v is ThemeId {
  return typeof v === 'string' && (THEME_IDS as readonly string[]).includes(v);
}

/** Load the saved theme from localStorage — falls back to the default theme if missing or corrupt. (audio/engine.ts pattern) */
function loadTheme(): ThemeId {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
    if (raw) {
      const p = JSON.parse(raw) as { current?: unknown };
      if (isThemeId(p.current)) return p.current;
    }
  } catch {
    /* ignore — fall back to default if corrupt/blocked */
  }
  return DEFAULT_THEME;
}

function saveTheme(id: ThemeId): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LS_KEY, JSON.stringify({ current: id }));
  } catch {
    /* ignore */
  }
}

/** Setting <html data-theme> = reskin trigger (pure CSS re-cascade, no reload). */
function applyTheme(id: ThemeId): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', id);
  }
}

export const themeStore = createStore<ThemeState>({ current: loadTheme() });

/**
 * Once at boot — instantly (synchronously, before paint) apply the saved theme to <html> to prevent FOUC.
 * Call it before createRoot().render in main.tsx (no StrictMode double-call/useEffect delay).
 * Even if index.html's inline script already set data-theme, re-confirm it to stay in sync with the store.
 */
export function initTheme(): void {
  applyTheme(themeStore.get().current);
}

/** Instantly swap the theme + save + notify subscribers (modal re-render). */
export function setTheme(id: ThemeId): void {
  if (!isThemeId(id) || id === themeStore.get().current) {
    // Re-confirm data-theme even for the same theme (it may have drifted externally)
    applyTheme(id);
    return;
  }
  saveTheme(id);
  applyTheme(id);
  themeStore.set({ current: id });
}

/** React hook — subscribe to the current theme */
export function useTheme(): ThemeId {
  return useStore(themeStore).current;
}

/** Non-React snapshot — canvas game palette selection, etc. */
export function getTheme(): ThemeId {
  return themeStore.get().current;
}
