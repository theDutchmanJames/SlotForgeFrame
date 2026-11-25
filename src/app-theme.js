// App theme, the same as the other SlotForge apps (Circuit's App theme, as in Foundry):
// eight presets and your own colours. Saved under Circuit's key, so apps
// opened as files on this computer share it; a link from another app can
// bring its theme along (?sfTheme=…&sfColors=…).

export const THEMES = Object.freeze([
  ['dark', 'Dark'],
  ['light', 'Light'],
  ['midnight', 'Midnight blue'],
  ['forest', 'Forest green'],
  ['sunset', 'Sunset orange'],
  ['violet', 'Violet'],
  ['carbon', 'Carbon and yellow'],
  ['ocean', 'Ocean (light)'],
  ['custom', 'Custom (your own colours)'],
]);
export const COLORS = Object.freeze([
  ['bg', 'Background', 'The page and the 3D view'],
  ['panel', 'Panels', 'The header, cards and dialogs'],
  ['ink', 'Text', 'Headings and normal text'],
  ['muted', 'Quiet text', 'Labels, hints and inactive tabs'],
  ['line', 'Lines', 'Borders and dividers'],
  ['accent', 'Accent', 'Main buttons, selections and active tabs'],
]);
// Each preset's six colours, as in Circuit's slotforge-reference.css.
export const PALETTES = Object.freeze({
  dark: { bg: '#171b21', panel: '#222831', ink: '#e8e6e1', muted: '#98a0ab', line: '#343b47', accent: '#e5484d' },
  light: { bg: '#f1efea', panel: '#ffffff', ink: '#1d2229', muted: '#656c76', line: '#d9d6cf', accent: '#c92424' },
  midnight: { bg: '#0e1624', panel: '#16233a', ink: '#e6edf7', muted: '#8fa3bf', line: '#2a3b57', accent: '#4c9aff' },
  forest: { bg: '#121a16', panel: '#1b2721', ink: '#e5efe8', muted: '#93a89b', line: '#2f4137', accent: '#3ecf8e' },
  sunset: { bg: '#1c1512', panel: '#2a1f1a', ink: '#f3e8e0', muted: '#b49a8a', line: '#46352c', accent: '#ff7a3d' },
  violet: { bg: '#17131f', panel: '#221c2e', ink: '#ece6f5', muted: '#a094b5', line: '#3a3150', accent: '#a46bff' },
  carbon: { bg: '#121212', panel: '#1e1e1e', ink: '#eaeaea', muted: '#9a9a9a', line: '#333333', accent: '#ffd400' },
  ocean: { bg: '#e8f1f6', panel: '#ffffff', ink: '#12232e', muted: '#5a7080', line: '#c9d9e3', accent: '#0d70b0' },
});
export const DEFAULT = PALETTES.dark;
export const STORAGE_KEY = 'slotforge.appearance.v1';
// The light/dark choice on its own, as Foundry keeps it ('light' or 'dark').
const LEGACY_KEY = 'chassis.theme';

export const validTheme = (value) => THEMES.some(([key]) => key === value);

export function hex(value) {
  if (typeof value !== 'string') return '';
  const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(value.trim());
  if (!match) return '';
  const digits = match[1].toLowerCase();
  return '#' + (digits.length === 3 ? [...digits].map((c) => c + c).join('') : digits);
}
export function colors(value) {
  return Object.fromEntries(COLORS.map(([key]) => [key, hex(value?.[key]) || DEFAULT[key]]));
}
export function read(value) {
  if (typeof value === 'string') {
    if (validTheme(value)) return { theme: value, customColors: null };
    try {
      value = JSON.parse(value);
    } catch {
      return { theme: 'dark', customColors: null };
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return { theme: 'dark', customColors: null };
  return {
    theme: validTheme(value.theme) ? value.theme : 'dark',
    customColors:
      value.customColors && typeof value.customColors === 'object' && !Array.isArray(value.customColors)
        ? colors(value.customColors)
        : null,
  };
}
const luminance = (value) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(value.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
export const isLight = (value) => luminance(hex(value) || DEFAULT.panel) > 0.35;
export const onAccent = (value) =>
  ratio(hex(value) || DEFAULT.accent, '#ffffff') >= 3.7 ? '#ffffff' : '#000000';
export function problems(value) {
  const c = colors(value),
    out = [];
  if (Math.min(ratio(c.ink, c.bg), ratio(c.ink, c.panel)) < 3)
    out.push('Text is too close to the background or panels. Choose more contrasting colours.');
  if (Math.min(ratio(c.muted, c.bg), ratio(c.muted, c.panel)) < 2)
    out.push('Quiet text may be hard to read against the background or panels.');
  if (ratio(c.accent, c.bg) < 2)
    out.push('The accent is close to the background, so selected items may be hard to see.');
  return out;
}
export function fromURL(url) {
  const theme = url.searchParams.get('sfTheme');
  if (!validTheme(theme)) return null;
  const raw = url.searchParams.get('sfColors');
  if (raw === null) return theme === 'custom' ? null : { theme };
  const parts = raw.split(',');
  if (parts.length !== COLORS.length || parts.some((part) => !hex('#' + part)))
    return theme === 'custom' ? null : { theme };
  return { theme, customColors: Object.fromEntries(COLORS.map(([key], i) => [key, hex('#' + parts[i])])) };
}
export const themeName = (theme) => THEMES.find(([key]) => key === theme)?.[1] ?? 'Dark';
// The colours a tile or "start from" uses: a preset's, or your own.
export const paletteOf = (state, theme = state.theme) =>
  theme === 'custom' ? colors(state.customColors) : PALETTES[theme] ?? DEFAULT;
export const toneOf = (state) =>
  (state.theme === 'custom' ? isLight(colors(state.customColors).panel) : ['light', 'ocean'].includes(state.theme))
    ? 'light'
    : 'dark';

export function loadTheme(location = globalThis.location) {
  let state = read(null);
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    state = read(saved ?? localStorage.getItem(LEGACY_KEY));
  } catch {
    /* Storage can be blocked; the default theme applies. */
  }
  try {
    const incoming = location && fromURL(new URL(location.href));
    if (incoming) state = read({ ...state, ...incoming });
  } catch {
    /* Not a URL this page can read. */
  }
  return state;
}
export function saveTheme(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(LEGACY_KEY, toneOf(state));
    return true;
  } catch {
    return false;
  }
}
// Sets the theme on <html>: a preset by name, your own colours inline.
export function applyThemeState(state, root = document.documentElement) {
  root.dataset.theme = state.theme;
  const custom = state.theme === 'custom',
    c = colors(state.customColors);
  for (const [key] of COLORS) root.style.setProperty('--' + key, custom ? c[key] : '');
  root.style.setProperty('--on-accent', custom ? onAccent(c.accent) : '');
  root.dataset.tone = toneOf(state);
}
