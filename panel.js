const tabsEl = document.getElementById("tabs");
const viewsEl = document.getElementById("views");
const KEY = "pm.lastTab";
const frames = new Map();
const tabs = new Map();

function select(id) {
  for (const [pid, tab] of tabs) {
    const on = pid === id;
    tab.setAttribute("aria-selected", on);
    const f = frames.get(pid);
    f.classList.toggle("active", on);
    if (on && !f.src) f.src = f.dataset.src; // lazy-load on first view
  }
  localStorage.setItem(KEY, id);
}

async function init() {
  const settings = document.getElementById("pm-settings");
  const reload = document.getElementById("pm-reload");
  reload.onclick = () => {
    const f = [...frames.values()].find((x) => x.classList.contains("active"));
    if (f) f.src = f.dataset.src;
  };
  const picker = document.getElementById("pm-theme");
  picker.replaceChildren(...PluginManagerTheme.themes.map((theme) => new Option(theme.name, theme.id)));
  try {
    picker.value = await PluginManagerTheme.ready;
  } catch (failure) {
    const error = document.getElementById("pm-theme-error");
    error.textContent = `Theme could not be loaded: ${failure.message}`;
    error.hidden = false;
    settings.showPopover();
  }
  picker.addEventListener("change", async () => {
    const error = document.getElementById("pm-theme-error");
    try {
      await PluginManagerTheme.select(picker.value);
      error.hidden = true;
    } catch (failure) {
      error.textContent = `Theme could not be saved: ${failure.message}`;
      error.hidden = false;
    }
  });
  let plugins = [];
  try { plugins = await (await fetch("generated/plugins.json")).json(); } catch {}
  if (!plugins.length) {
    viewsEl.innerHTML = '<div class="empty">No plugins found. Add one to <code>Plugins/</code>, run <code>node build.js</code>, then reload the extension.</div>';
    return;
  }
  for (const p of plugins) {
    const tab = document.createElement("button");
    tab.className = "tab";
    tab.role = "tab";
    tab.title = p.name + (p.version ? " v" + p.version : "");
    if (p.icon) { const i = document.createElement("img"); i.src = p.icon; i.alt = ""; tab.append(i); }
    tab.append(p.name);
    tab.onclick = () => select(p.id);
    tabsEl.append(tab);
    tabs.set(p.id, tab);

    const f = document.createElement("iframe");
    f.dataset.src = p.url;
    viewsEl.append(f);
    frames.set(p.id, f);
  }
  const last = localStorage.getItem(KEY);
  select(tabs.has(last) ? last : plugins[0].id);
}
init();
