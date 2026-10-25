// Plugin Manager owns the palette and shared preference for all extension views.

(() => {
const DEFAULT_THEME = "meta";

const THEMES = [
  // ---------- store ----------
  {
    id: "meta",
    name: "META Red",
    bg: "#111213",
    panel: "#1b1d1f",
    line: "#393b3e",
    text: "#f5f5f5",
    muted: "#b0b2b4",
    accent: "#e53935",
    accentText: "#ff6b6b",
    onAccent: "#000000",
    secondary: "#762536",
    orange: "#ff715b",
    ok: "#4fd69a",
    warn: "#f7bd55",
    bad: "#ff8a7a",
  },
  {
    id: "nightreaper",
    name: "Nightreaper",
    bg: "#070a08",
    panel: "#111712",
    line: "#392b2b",
    text: "#eff8ed",
    muted: "#a5b6a8",
    accent: "#b7f52a",
    accentText: "#c4f75a",
    onAccent: "#10170a",
    secondary: "#25b96f",
    orange: "#e46b75",
    ok: "#3fd98a",
    warn: "#ffcb57",
    bad: "#ff8a94",
  },
  {
    id: "black",
    name: "Black",
    bg: "#000000",
    panel: "#0d0d0d",
    line: "#2e2e2e",
    text: "#ffffff",
    muted: "#a6a6a6",
    accent: "#f2f2f2",
    accentText: "#ffffff",
    onAccent: "#111111",
    secondary: "#777777",
    orange: "#b7b7b7",
    ok: "#5fe39a",
    warn: "#ffcc66",
    bad: "#ff8a80",
  },

  // ---------- games ----------
  {
    // Vault-Tec blue & yellow, Pip-Boy green for good karma.
    id: "fallout",
    name: "Vault-Tec",
    bg: "#07122a",
    panel: "#0f2149",
    line: "#2b4479",
    text: "#eef3ff",
    muted: "#adbde0",
    accent: "#ffd23f",
    accentText: "#ffd23f",
    onAccent: "#0b1a36",
    secondary: "#2c5aa0",
    orange: "#ff9f1c",
    ok: "#5cff8a",
    warn: "#ffaa55",
    bad: "#ff8577",
  },
  {
    // Amber Pip-Boy glow over the Mojave.
    id: "new-vegas",
    name: "New Vegas",
    bg: "#110b04",
    panel: "#1d1408",
    line: "#4a3714",
    text: "#fbe9cc",
    muted: "#cfac74",
    accent: "#ffb642",
    accentText: "#ffc15e",
    onAccent: "#1a1003",
    secondary: "#8c2f1b",
    orange: "#d9822b",
    ok: "#a6e57f",
    warn: "#f0dd6a",
    bad: "#ff8466",
  },
  
  
];

function isTheme(id) {
  return THEMES.some((t) => t.id === id);
}

const KEY = "pm.theme";
function apply(id) {
  const p = THEMES.find((theme) => theme.id === id) || THEMES[0];
  const root = document.documentElement;
  root.dataset.theme = p.id;
  root.style.colorScheme = p.light ? "light" : "dark";
  const values = {
    bg: p.bg, surface: p.panel, panel: p.panel, line: p.line,
    fg: p.text, ink: p.text, text: p.text, muted: p.muted, dim: p.muted,
    placeholder: p.muted, accent: p.accent, acid: p.accent,
    "accent-ink": p.onAccent, "on-accent": p.onAccent,
    secondary: p.secondary, orange: p.orange,
    ok: p.ok, warn: p.warn, bad: p.bad, danger: p.bad, idle: p.muted,
    "muted-hover": p.text, "mark-fg": p.text, "on-ok": p.bg,
    control: `color-mix(in srgb, ${p.bg}, ${p.panel} 55%)`,
    "surface-hover": `color-mix(in srgb, ${p.text} 6%, ${p.panel})`,
    "surface-active": `color-mix(in srgb, ${p.accent} 14%, ${p.panel})`,
    "panel-2": `color-mix(in srgb, ${p.text} 5%, ${p.panel})`,
    "line-hover": p.muted, "accent-hover": p.accentText,
    "accent-dark": p.accent, "scroll": p.line, "scroll-hover": p.muted,
    "accent-border": `color-mix(in srgb, ${p.accent} 45%, transparent)`,
    "mark-bg": `color-mix(in srgb, ${p.accent} 24%, ${p.panel})`,
  };
  for (const key of ["accent", "ok", "warn", "bad", "idle"]) {
    values[`${key}-soft`] = `color-mix(in srgb, ${values[key]} 18%, ${p.panel})`;
  }
  for (const [key, value] of Object.entries(values)) root.style.setProperty(`--${key}`, value);
  const picker = document.getElementById("pm-theme");
  if (picker) picker.value = p.id;
  return p.id;
}

async function select(id) {
  if (!isTheme(id)) throw new Error(`Unknown Plugin Manager theme: ${id}`);
  await chrome.storage.local.set({ [KEY]: id });
  apply(id);
}

const ready = chrome.storage.local.get([KEY, "warranty-tool-theme", "techbay-tool-theme", "settings"])
  .then(async (stored) => {
    const toolbox = stored.settings?.theme;
    const legacy = stored["warranty-tool-theme"] || stored["techbay-tool-theme"] ||
      ({ "meta-red": "meta", daylight: "white", "hot-pink": "hyperbeast", ember: "phoenix" })[toolbox] ||
      (isTheme(toolbox) ? toolbox : DEFAULT_THEME);
    const id = apply(stored[KEY] || legacy || DEFAULT_THEME);
    if (!stored[KEY]) await chrome.storage.local.set({ [KEY]: id });
    return id;
  });
ready.catch((error) => {
  console.error("[Plugin Manager] Theme loading failed:", error);
  document.addEventListener("DOMContentLoaded", () => {
    const status = document.createElement("p");
    status.setAttribute("role", "alert");
    status.textContent = `Theme could not be loaded: ${error.message}`;
    document.body.prepend(status);
  }, { once: true });
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[KEY]) apply(changes[KEY].newValue);
});
globalThis.PluginManagerTheme = { themes: THEMES, ready, select };
})();
