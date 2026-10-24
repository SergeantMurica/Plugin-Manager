/*
 * Theme catalogue.
 *
 * The colours themselves live in popup.css — each theme is a
 * `:root[data-theme="id"]` block. What lives here is the list used to build the
 * picker, plus the three colours each swatch previews. Keep the swatch colours
 * in step with the CSS if you retune a palette.
 *
 * META Red is the default and is declared on bare `:root`, so the popup paints
 * correctly even before any JavaScript runs.
 */

export const DEFAULT_THEME = 'meta-red';

export const THEMES = [
  { id: 'meta-red',  name: 'META Red',  bg: '#111213', panel: '#1b1d1f', accent: '#d32f2f' },
  { id: 'volt',      name: 'Lime',      bg: '#0a0b08', panel: '#1c1f16', accent: '#c8ff00' },
  { id: 'midnight',  name: 'Blue',      bg: '#0f1216', panel: '#1c212a', accent: '#5b9dff' },
  { id: 'hot-pink',  name: 'Pink',      bg: '#12080e', panel: '#26141e', accent: '#ff4d9d' },
  { id: 'ember',     name: 'Orange',    bg: '#120d07', panel: '#241b11', accent: '#ff8c1a' },
  { id: 'emerald',   name: 'Green',     bg: '#06110c', panel: '#13241a', accent: '#2fd18a' },
  { id: 'violet',    name: 'Purple',    bg: '#0e0a16', panel: '#1f172c', accent: '#a06bff' },
  { id: 'arctic',    name: 'Teal',      bg: '#071216', panel: '#12262e', accent: '#34c6e0' },
  { id: 'daylight',  name: 'Light',     bg: '#f4f5f7', panel: '#ffffff', accent: '#d11414' },
];

export function isTheme(id) {
  return THEMES.some((t) => t.id === id);
}
