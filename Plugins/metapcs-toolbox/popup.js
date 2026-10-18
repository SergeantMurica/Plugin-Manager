import { prepare, search, snippet, highlight, escapeHtml } from './lib/search.js';
import { detect, trackingUrl, CARRIERS } from './lib/carriers.js';
import { parseSO, soUrl, soLabel, DEFAULT_STORE } from './lib/workmate.js';
import { THEMES, DEFAULT_THEME, isTheme } from './lib/themes.js';
import {
  parseTicket, ticketUrl, ticketLabel, DEFAULT_SUBDOMAIN,
} from './lib/gorgias.js';

const $ = (id) => document.getElementById(id);

/* Every tool can be switched off in settings, so roles that only need one or
 * two of them don't carry tabs they'll never open. */
const TOOLS = [
  { id: 'help', label: 'Help Center' },
  { id: 'ship', label: 'Tracking' },
  { id: 'wm', label: 'WorkMate' },
  { id: 'gorgias', label: 'Gorgias' },
];

const DEFAULTS = {
  lastTab: 'help',
  copyFormat: 'rich',
  store: DEFAULT_STORE,
  gorgiasSubdomain: DEFAULT_SUBDOMAIN,
  wmMini: true,
  shMini: true,
  gorgiasMini: true,
  soLinks: true,
  soBadge: true,
  theme: DEFAULT_THEME,
  tools: { help: true, ship: true, wm: true, gorgias: true },
};

/* Shopify admin needs real width; carrier tracking pages go responsive at ~480. */
const MINI_SIZE = {
  ship: { width: 480, height: 820 },
  wm: { width: 1180, height: 880 },
  gorgias: { width: 1150, height: 880 },
};

/*
 * "Pinning" opens this page as a detached window when a movable, resizable
 * view is more useful than the browser side panel.
 */
const IS_PINNED = new URLSearchParams(location.search).get('pinned') === '1';
const PINNED_SIZE = { width: 440, height: 660 };

const RECENT_LIMIT = 8;

let settings = { ...DEFAULTS };
let docs = [];
let indexMeta = { builtAt: 0, count: 0 };
let hits = [];
let selected = -1;
let recentShip = [];
let recentSO = [];
let recentTickets = [];

init();

async function init() {
  const stored = await chrome.storage.local.get([
    'settings', 'hcIndex', 'recentTracking', 'recentSO', 'recentTickets',
    'pinnedWindowId',
  ]);

  // Already pinned somewhere? Hand off to that window instead of showing a
  // second copy. Done before any rendering so nothing flashes on screen.
  if (!IS_PINNED && stored.pinnedWindowId !== undefined) {
    if (await focusPinnedWindow(stored.pinnedWindowId)) {
      window.close();
      return;
    }
  }

  if (IS_PINNED) {
    document.documentElement.classList.add('pinned');
    document.body.classList.add('pinned');
    const pin = $('btn-pin');
    pin.classList.add('is-active');
    pin.title = 'Unpin — close this window';
  }

  // `tools` is merged one level deeper so a settings blob saved before a new
  // tool existed still gets that tool switched on rather than undefined.
  settings = {
    ...DEFAULTS,
    ...(stored.settings || {}),
    tools: { ...DEFAULTS.tools, ...((stored.settings || {}).tools || {}) },
  };

  recentShip = stored.recentTracking || [];
  recentSO = stored.recentSO || [];
  recentTickets = stored.recentTickets || [];
  loadIndex(stored.hcIndex);

  // theme-init.js already applied this from localStorage; re-apply so the two
  // stores agree if settings were changed from another window.
  applyTheme(settings.theme);

  $('hc-format').value = settings.copyFormat;
  $('set-store').value = settings.store;
  $('set-gorgias').value = settings.gorgiasSubdomain;
  $('set-wm-mini').checked = settings.wmMini;
  $('set-gg-mini').checked = settings.gorgiasMini;
  $('set-sh-mini').checked = settings.shMini;
  $('set-so-links').checked = settings.soLinks !== false;
  $('set-so-badge').checked = settings.soBadge !== false;

  wireEvents();
  applyToolVisibility();
  renderThemes();
  renderToolToggles();
  renderHelp();
  renderShip();
  renderWorkmate();
  renderGorgias();
  renderRecents();
  renderStatus();
  switchTab(firstEnabledIfHidden(settings.lastTab));

  // Builds on first run, and refreshes quietly once a day. Skipped entirely
  // when the Help Center tool is switched off — no point crawling for a tab
  // that isn't there.
  if (settings.tools.help !== false) {
    chrome.runtime.sendMessage({ type: 'ENSURE_INDEX' }).catch(() => {});
  }
}

function loadIndex(hcIndex) {
  if (hcIndex && Array.isArray(hcIndex.articles)) {
    docs = prepare(hcIndex.articles);
    indexMeta = { builtAt: hcIndex.builtAt || 0, count: hcIndex.articles.length };
  } else {
    docs = [];
    indexMeta = { builtAt: 0, count: 0 };
  }
}

/* ─────────────────────────── events ─────────────────────────── */

function wireEvents() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  $('btn-settings').addEventListener('click', () => {
    const showing = !$('panel-settings').hidden;
    switchTab(showing ? (settings.lastTab || 'help') : 'settings');
  });

  $('btn-pin').addEventListener('click', togglePin);

  // Help Center
  $('hc-input').addEventListener('input', renderHelp);
  $('hc-input').addEventListener('keydown', onHelpKeys);
  $('hc-clear').addEventListener('click', () => {
    $('hc-input').value = '';
    renderHelp();
    $('hc-input').focus();
  });
  $('hc-format').addEventListener('change', (e) => {
    settings.copyFormat = e.target.value;
    saveSettings();
  });

  // Tracking
  $('sh-input').addEventListener('input', renderShip);
  $('sh-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = $('sh-actions').querySelector('button');
      if (first) first.click();
    }
  });
  $('sh-paste').addEventListener('click', pasteTracking);
  $('sh-clear-recent').addEventListener('click', () => {
    recentShip = [];
    chrome.storage.local.set({ recentTracking: [] });
    renderRecents();
  });

  // WorkMate
  $('wm-input').addEventListener('input', renderWorkmate);
  $('wm-input').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    openSO(e.shiftKey ? !settings.wmMini : settings.wmMini);
  });
  $('wm-mini').addEventListener('click', () => openSO(true));
  $('wm-full').addEventListener('click', () => openSO(false));
  $('wm-clear-recent').addEventListener('click', () => {
    recentSO = [];
    chrome.storage.local.set({ recentSO: [] });
    renderRecents();
  });

  // Gorgias
  $('gg-input').addEventListener('input', renderGorgias);
  $('gg-input').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    openTicket(e.shiftKey ? !settings.gorgiasMini : settings.gorgiasMini);
  });
  $('gg-mini').addEventListener('click', () => openTicket(true));
  $('gg-full').addEventListener('click', () => openTicket(false));
  $('gg-clear-recent').addEventListener('click', () => {
    recentTickets = [];
    chrome.storage.local.set({ recentTickets: [] });
    renderRecents();
  });

  // Settings
  $('set-rebuild').addEventListener('click', rebuildIndex);
  $('set-store').addEventListener('change', (e) => {
    settings.store = (e.target.value || '').trim() || DEFAULT_STORE;
    e.target.value = settings.store;
    saveSettings();
    renderWorkmate();
  });
  $('set-gorgias').addEventListener('change', (e) => {
    settings.gorgiasSubdomain = (e.target.value || '').trim() || DEFAULT_SUBDOMAIN;
    e.target.value = settings.gorgiasSubdomain;
    saveSettings();
    renderGorgias();
  });
  $('set-wm-mini').addEventListener('change', (e) => {
    settings.wmMini = e.target.checked;
    saveSettings();
  });
  $('set-gg-mini').addEventListener('change', (e) => {
    settings.gorgiasMini = e.target.checked;
    saveSettings();
  });
  $('set-so-links').addEventListener('change', (e) => {
    settings.soLinks = e.target.checked;
    saveSettings();
    renderSites();
  });
  $('set-so-badge').addEventListener('change', (e) => {
    settings.soBadge = e.target.checked;
    saveSettings();
  });
  $('set-sh-mini').addEventListener('change', (e) => {
    settings.shMini = e.target.checked;
    saveSettings();
    renderShip();
  });

  document.addEventListener('keydown', onGlobalKeys);

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === 'INDEX_PROGRESS') {
      renderStatus(`Indexing articles… ${msg.done}/${msg.total}`);
    } else if (msg.type === 'INDEX_DONE') {
      chrome.storage.local.get('hcIndex').then(({ hcIndex }) => {
        loadIndex(hcIndex);
        renderHelp();
        renderStatus(`Indexed ${msg.count} articles`, 'ok');
        setTimeout(renderStatus, 2500);
      });
    } else if (msg.type === 'INDEX_ERROR') {
      renderStatus(`Index failed: ${msg.error}`, 'warn');
    }
  });
}

function onGlobalKeys(e) {
  // Ctrl+N walks the visible tabs, so the numbers stay correct no matter which
  // tools are switched off.
  if ((e.ctrlKey || e.metaKey) && /^[1-9]$/.test(e.key)) {
    const target = enabledTools()[Number(e.key) - 1];
    if (target) {
      e.preventDefault();
      switchTab(target.id);
    }
    return;
  }

  if (e.key === 'Escape') {
    const active = document.activeElement;
    if (active && active.value) {
      active.value = '';
      active.dispatchEvent(new Event('input'));
      e.preventDefault();
    } else if (!IS_PINNED) {
      // when pinned, Escape shouldn't throw away the window you just parked
      window.close();
    }
  }
}

/* ─────────────────────────────── pin ────────────────────────── */

async function focusPinnedWindow(windowId) {
  try {
    await chrome.windows.update(windowId, { focused: true, drawAttention: true });
    return true;
  } catch {
    // window is gone (closed, or Chrome restarted) — forget it
    await chrome.storage.local.remove('pinnedWindowId');
    return false;
  }
}

async function togglePin() {
  if (IS_PINNED) {
    await chrome.storage.local.remove('pinnedWindowId');
    window.close();
    return;
  }

  const width = PINNED_SIZE.width;
  const height = Math.min(PINNED_SIZE.height, Math.max(460, (screen.availHeight || 800) - 90));

  // park it against the right edge of the screen so it sits beside the browser
  // rather than behind it
  const left = Math.max(0, (screen.availWidth || 1280) - width - 24);

  const win = await chrome.windows.create({
    url: chrome.runtime.getURL('popup.html?pinned=1'),
    type: 'popup',
    width,
    height,
    left,
    top: 80,
    focused: true,
  });

  await chrome.storage.local.set({ pinnedWindowId: win.id });
  window.close();
}

function onHelpKeys(e) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!hits.length) return;
    e.preventDefault();
    selected = e.key === 'ArrowDown'
      ? Math.min(hits.length - 1, selected + 1)
      : Math.max(0, selected - 1);
    paintSelection();
    return;
  }

  if (e.key === 'Enter' && selected >= 0 && hits[selected]) {
    e.preventDefault();
    const doc = hits[selected].doc;
    if (e.shiftKey || e.ctrlKey || e.metaKey) openTab(doc.url);
    else copyArticle(doc);
  }
}

function switchTab(tab) {
  const target = tab === 'settings' ? tab : firstEnabledIfHidden(tab);

  document.querySelectorAll('.tab').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.tab === target);
  });

  for (const name of [...TOOLS.map((t) => t.id), 'settings']) {
    const panel = $(`panel-${name}`);
    if (panel) panel.hidden = name !== target;
  }

  $('btn-settings').classList.toggle('is-active', target === 'settings');

  if (target !== 'settings') {
    settings.lastTab = target;
    saveSettings();
  } else {
    renderSettings();
  }

  const focusTarget = {
    help: 'hc-input', ship: 'sh-input', wm: 'wm-input', gorgias: 'gg-input',
  }[target];
  if (focusTarget) setTimeout(() => $(focusTarget).focus(), 0);
}

/* ──────────────────────── tool visibility ───────────────────── */

function enabledTools() {
  return TOOLS.filter((tool) => settings.tools[tool.id] !== false);
}

/* Falls back to the first visible tool when the requested one is switched off
 * (or is a stale id from an older build). */
function firstEnabledIfHidden(tab) {
  const enabled = enabledTools();
  if (!enabled.length) return 'help';
  return enabled.some((tool) => tool.id === tab) ? tab : enabled[0].id;
}

function applyToolVisibility() {
  for (const tool of TOOLS) {
    const btn = document.querySelector(`.tab[data-tab="${tool.id}"]`);
    if (btn) btn.hidden = settings.tools[tool.id] === false;
  }
}

function renderToolToggles() {
  const box = $('set-tools');
  box.innerHTML = '';

  for (const tool of TOOLS) {
    const label = document.createElement('label');
    label.className = 'check';

    const box_ = document.createElement('input');
    box_.type = 'checkbox';
    box_.checked = settings.tools[tool.id] !== false;

    box_.addEventListener('change', () => {
      // count before mutating, so the last remaining tool can't be turned off
      if (!box_.checked && enabledTools().length <= 1) {
        box_.checked = true;
        toast('Keep at least one tool enabled');
        return;
      }

      settings.tools[tool.id] = box_.checked;
      if (!box_.checked && settings.lastTab === tool.id) {
        settings.lastTab = firstEnabledIfHidden(tool.id);
      }

      saveSettings();
      applyToolVisibility();
    });

    label.append(box_, document.createTextNode(` ${tool.label}`));
    box.appendChild(label);
  }
}

function saveSettings() {
  chrome.storage.local.set({ settings });
}

/* ───────────────────────── help center ──────────────────────── */

function renderHelp() {
  const query = $('hc-input').value;
  $('hc-clear').hidden = !query;

  const results = $('hc-results');
  const meta = $('hc-meta');

  if (!docs.length) {
    hits = [];
    selected = -1;
    meta.textContent = '';
    results.innerHTML = `<div class="empty">
      No articles cached yet.<br>Building the index now &mdash; this takes a few seconds.
    </div>`;
    return;
  }

  if (!query.trim()) {
    hits = [];
    selected = -1;
    meta.textContent = `${indexMeta.count} articles`;
    results.innerHTML = `<div class="empty">
      Type to search all <b>${indexMeta.count}</b> Help Center articles.<br><br>
      Titles rank first, but body text counts too &mdash;<br>
      searching <b>SSD</b> also finds <b>How to use HD Tune</b>.<br><br>
      <span class="kbd">&uarr;</span> <span class="kbd">&darr;</span> pick
      &nbsp;<span class="kbd">Enter</span> copy
      &nbsp;<span class="kbd">Shift</span>+<span class="kbd">Enter</span> open
    </div>`;
    return;
  }

  hits = search(docs, query);
  selected = hits.length ? 0 : -1;
  meta.textContent = hits.length ? `${hits.length} match${hits.length === 1 ? '' : 'es'}` : '';

  if (!hits.length) {
    results.innerHTML = `<div class="empty">
      Nothing matched <b>${escapeHtml(query)}</b>.<br>Try a shorter or more general word.
    </div>`;
    return;
  }

  results.innerHTML = '';
  hits.forEach((hit, i) => results.appendChild(resultRow(hit.doc, query, i)));
  paintSelection();
}

function resultRow(doc, query, index) {
  const row = document.createElement('button');
  row.className = 'result';
  row.type = 'button';
  row.dataset.index = String(index);

  const top = document.createElement('div');
  top.className = 'result-top';

  const title = document.createElement('div');
  title.className = 'result-title';
  title.innerHTML = highlight(doc.title, query);

  const actions = document.createElement('div');
  actions.className = 'result-actions';

  const openBtn = document.createElement('button');
  openBtn.className = 'mini-btn';
  openBtn.type = 'button';
  openBtn.textContent = 'Open';
  openBtn.title = 'Open the article in a new tab';
  openBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openTab(doc.url);
  });

  const textBtn = document.createElement('button');
  textBtn.className = 'mini-btn';
  textBtn.type = 'button';
  textBtn.textContent = 'Text';
  textBtn.title = 'Copy the full article text';
  textBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    writeText(doc.text || '').then((ok) => toast(ok ? 'Article text copied' : 'Copy failed'));
  });

  actions.append(openBtn, textBtn);
  top.append(title, actions);

  const sub = document.createElement('div');
  sub.className = 'result-sub';
  if (doc.category) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = doc.category;
    sub.appendChild(chip);
  }

  const snip = document.createElement('div');
  snip.className = 'snippet';
  snip.innerHTML = highlight(snippet(doc, query), query);

  row.append(top);
  if (doc.category) row.append(sub);
  row.append(snip);

  row.addEventListener('click', () => {
    selected = index;
    paintSelection();
    copyArticle(doc);
  });

  return row;
}

function paintSelection() {
  const rows = $('hc-results').querySelectorAll('.result');
  rows.forEach((row, i) => row.classList.toggle('is-sel', i === selected));
  if (selected >= 0 && rows[selected]) {
    rows[selected].scrollIntoView({ block: 'nearest' });
  }
}

async function copyArticle(doc) {
  const format = settings.copyFormat;
  let ok = false;
  let label = 'Link copied';

  if (format === 'url') {
    ok = await writeText(doc.url);
  } else if (format === 'title-url') {
    ok = await writeText(`${doc.title} — ${doc.url}`);
    label = 'Title + URL copied';
  } else if (format === 'markdown') {
    ok = await writeText(`[${doc.title}](${doc.url})`);
    label = 'Markdown copied';
  } else {
    const html = `<a href="${escapeHtml(doc.url)}">${escapeHtml(doc.title)}</a>`;
    ok = await writeRich(html, doc.url);
    label = 'Clickable link copied';
  }

  toast(ok ? label : 'Copy failed');
}

async function writeText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function writeRich(html, plain) {
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      }),
    ]);
    return true;
  } catch {
    return writeText(plain);
  }
}

/* ─────────────────────────── tracking ───────────────────────── */

function renderShip() {
  const info = detect($('sh-input').value);
  const detected = $('sh-detect');
  const actions = $('sh-actions');
  actions.innerHTML = '';

  if (info.empty) {
    detected.className = 'detect dim';
    detected.textContent = 'Carrier is detected automatically from the number.';
    return;
  }

  detected.className = 'detect';

  if (info.confident) {
    const carrier = CARRIERS[info.carriers[0]];
    detected.innerHTML =
      `<span class="carrier-tag ${carrier.id}">${carrier.name}</span>`
      + `<span class="dim">${escapeHtml(info.label)} &middot; ${escapeHtml(info.number)}</span>`;

    actions.append(
      actionButton(`Track in mini window`, 'btn primary', () => openTracking(carrier.id, info.number, true)),
      actionButton('Open in tab', 'btn', () => openTracking(carrier.id, info.number, false)),
    );
    return;
  }

  detected.innerHTML = info.label === 'Unrecognised format'
    ? `<span class="dim">Not a familiar UPS or FedEx format &mdash; pick a carrier to try.</span>`
    : `<span class="dim">${escapeHtml(info.label)} is used by both carriers &mdash; pick one.</span>`;

  for (const id of info.carriers) {
    const carrier = CARRIERS[id];
    actions.append(actionButton(
      `Track with ${carrier.name}`,
      `btn ${carrier.id}`,
      () => openTracking(carrier.id, info.number, settings.shMini),
    ));
  }
}

function actionButton(label, className, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

async function openTracking(carrierId, number, mini) {
  const url = trackingUrl(carrierId, number);
  if (!url) return;

  await pushRecent('recentTracking', { value: number, carrier: carrierId });
  if (mini) await openMini(url, MINI_SIZE.ship);
  else await openTab(url);
}

async function pasteTracking() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) {
      toast('Clipboard is empty');
      return;
    }
    $('sh-input').value = text.trim();
    renderShip();
    $('sh-input').focus();
  } catch {
    toast('Chrome blocked clipboard read');
  }
}

/* ─────────────────────────── workmate ───────────────────────── */

function renderWorkmate() {
  const number = parseSO($('wm-input').value);
  const detected = $('wm-detect');
  const ready = Boolean(number);

  $('wm-mini').disabled = !ready;
  $('wm-full').disabled = !ready;

  if (!ready) {
    detected.className = 'detect dim';
    detected.textContent = 'Accepts 1145, SO-#1145, or a pasted WorkMate URL.';
    return;
  }

  detected.className = 'detect';
  detected.innerHTML = `Opens <b>${escapeHtml(soLabel(number))}</b> `
    + `<span class="dim">in ${escapeHtml(settings.store)}</span>`;
}

async function openSO(mini) {
  const number = parseSO($('wm-input').value);
  if (!number) return;

  const url = soUrl(number, settings.store);
  await pushRecent('recentSO', { value: number });
  if (mini) await openMini(url, MINI_SIZE.wm);
  else await openTab(url);
}

/* ─────────────────────────── gorgias ────────────────────────── */

function renderGorgias() {
  const id = parseTicket($('gg-input').value);
  const detected = $('gg-detect');
  const ready = Boolean(id);

  $('gg-mini').disabled = !ready;
  $('gg-full').disabled = !ready;

  if (!ready) {
    detected.className = 'detect dim';
    detected.textContent = 'Accepts 110227889, #110227889, or a pasted ticket URL.';
    return;
  }

  detected.className = 'detect';
  detected.innerHTML = `Opens ticket <b>${escapeHtml(ticketLabel(id))}</b> `
    + `<span class="dim">on ${escapeHtml(settings.gorgiasSubdomain)}.gorgias.com</span>`;
}

async function openTicket(mini) {
  const id = parseTicket($('gg-input').value);
  if (!id) return;

  const url = ticketUrl(id, settings.gorgiasSubdomain);
  await pushRecent('recentTickets', { value: id });
  if (mini) await openMini(url, MINI_SIZE.gorgias);
  else await openTab(url);
}

/* ─────────────────────────── recents ────────────────────────── */

async function pushRecent(key, entry) {
  const current = key === 'recentTracking' ? recentShip
    : key === 'recentSO' ? recentSO
      : recentTickets;

  const next = [{ ...entry, at: Date.now() }, ...current.filter((r) => r.value !== entry.value)]
    .slice(0, RECENT_LIMIT);

  if (key === 'recentTracking') recentShip = next;
  else if (key === 'recentSO') recentSO = next;
  else recentTickets = next;

  await chrome.storage.local.set({ [key]: next });
}

function renderRecents() {
  const shipBox = $('sh-recents');
  const wmBox = $('wm-recents');
  const ggBox = $('gg-recents');

  $('sh-clear-recent').hidden = !recentShip.length;
  $('wm-clear-recent').hidden = !recentSO.length;
  $('gg-clear-recent').hidden = !recentTickets.length;

  shipBox.innerHTML = '';
  if (!recentShip.length) {
    shipBox.innerHTML = '<div class="empty small">Numbers you look up show up here.</div>';
  } else {
    for (const item of recentShip) {
      const carrier = CARRIERS[item.carrier];
      shipBox.appendChild(recentRow(
        carrier ? `<span class="carrier-tag ${carrier.id}">${carrier.name}</span>` : '',
        item.value,
        item.at,
        () => openTracking(item.carrier || 'ups', item.value, settings.shMini),
      ));
    }
  }

  wmBox.innerHTML = '';
  if (!recentSO.length) {
    wmBox.innerHTML = '<div class="empty small">Service orders you open show up here.</div>';
  } else {
    for (const item of recentSO) {
      wmBox.appendChild(recentRow('', soLabel(item.value), item.at, () => {
        $('wm-input').value = item.value;
        renderWorkmate();
        openSO(settings.wmMini);
      }));
    }
  }

  ggBox.innerHTML = '';
  if (!recentTickets.length) {
    ggBox.innerHTML = '<div class="empty small">Tickets you open show up here.</div>';
  } else {
    for (const item of recentTickets) {
      ggBox.appendChild(recentRow('', ticketLabel(item.value), item.at, () => {
        $('gg-input').value = item.value;
        renderGorgias();
        openTicket(settings.gorgiasMini);
      }));
    }
  }
}

function recentRow(tagHtml, value, at, onClick) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'recent';
  row.innerHTML = `${tagHtml}<span class="mono">${escapeHtml(value)}</span>`
    + `<span class="when">${ago(at)}</span>`;
  row.addEventListener('click', onClick);
  return row;
}

function ago(at) {
  const seconds = Math.max(0, (Date.now() - (at || 0)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  const days = Math.floor(seconds / 86400);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

/* ─────────────────────────── windows ────────────────────────── */

async function openTab(url) {
  await chrome.tabs.create({ url, active: true });
}

async function openMini(url, size) {
  const width = Math.min(size.width, Math.max(380, (screen.availWidth || 1280) - 60));
  const height = Math.min(size.height, Math.max(420, (screen.availHeight || 800) - 60));

  try {
    const current = await chrome.windows.getCurrent();
    const left = Math.max(0, (current.left || 0) + Math.max(0, (current.width || width) - width - 30));
    const top = Math.max(0, (current.top || 0) + 80);
    await chrome.windows.create({ url, type: 'popup', width, height, left, top, focused: true });
  } catch {
    await chrome.windows.create({ url, type: 'popup', width, height, focused: true });
  }
}

/* ─────────────────────────── settings ───────────────────────── */

function renderSettings() {
  const state = $('set-index-state');
  state.textContent = indexMeta.count
    ? `${indexMeta.count} articles cached · updated ${ago(indexMeta.builtAt)}`
    : 'No articles cached yet.';
  renderThemes();
  renderToolToggles();
  renderSites();
}

/* ─────────────────────── SO-link site access ────────────────────── */

/*
 * The linkifier runs on Shopify admin and Gorgias out of the box. WorkMate is a
 * Shopify *embedded* app, though — its table is served from the vendor's own
 * domain inside an iframe, which a content script matched to admin.shopify.com
 * cannot reach.
 *
 * Rather than hardcode a guess at that domain, the content script notes the
 * iframe origins it sees on Shopify admin, and this offers them here for
 * one-click enabling. Granting is a real Chrome permission prompt, so nothing
 * is enabled behind the user's back.
 */
const BUILT_IN_SITES = ['https://admin.shopify.com', 'https://*.gorgias.com'];

function scriptIdFor(origin) {
  return `so-links-${origin.replace(/[^a-z0-9]+/gi, '-')}`;
}

async function grantedOrigins() {
  const { origins } = await chrome.permissions.getAll();
  return origins || [];
}

async function enableSite(origin) {
  const pattern = `${origin}/*`;

  const granted = await chrome.permissions.request({ origins: [pattern] });
  if (!granted) {
    toast('Permission declined');
    return;
  }

  const id = scriptIdFor(origin);
  try {
    // A previous registration survives browser restarts, so clear it first.
    await chrome.scripting.unregisterContentScripts({ ids: [id] }).catch(() => {});
    await chrome.scripting.registerContentScripts([{
      id,
      matches: [pattern],
      js: ['content/linkify.js'],
      css: ['content/linkify.css'],
      allFrames: true,
      runAt: 'document_idle',
    }]);
    toast('Enabled — reload the page');
  } catch (err) {
    toast(`Could not enable: ${err.message}`);
  }

  renderSites();
}

async function disableSite(origin) {
  const pattern = `${origin}/*`;
  await chrome.scripting.unregisterContentScripts({ ids: [scriptIdFor(origin)] }).catch(() => {});
  await chrome.permissions.remove({ origins: [pattern] }).catch(() => {});
  toast('Turned off — reload the page');
  renderSites();
}

async function renderSites() {
  const box = $('set-sites');
  if (!box) return;

  box.innerHTML = '';
  if (settings.soLinks === false) return;

  const note = document.createElement('p');
  note.className = 'site-note';
  note.textContent = 'Always on:';
  box.appendChild(note);

  for (const site of BUILT_IN_SITES) {
    const row = document.createElement('div');
    row.className = 'site-row';

    const host = document.createElement('span');
    host.className = 'site-host';
    host.textContent = site.replace('https://', '');

    const on = document.createElement('span');
    on.className = 'site-on';
    on.textContent = 'on';

    row.append(host, on);
    box.appendChild(row);
  }

  const { seenFrames } = await chrome.storage.local.get('seenFrames');
  const frames = (seenFrames || []).filter((o) => !o.includes('shopify.com'));
  if (!frames.length) return;

  const granted = await grantedOrigins();
  const isOn = (origin) => granted.some((g) => g === `${origin}/*` || g === origin);

  const extraNote = document.createElement('p');
  extraNote.className = 'site-note';
  extraNote.textContent = 'Embedded apps seen inside Shopify admin:';
  box.appendChild(extraNote);

  for (const origin of frames) {
    const row = document.createElement('div');
    row.className = 'site-row';

    const host = document.createElement('span');
    host.className = 'site-host';
    host.textContent = origin.replace('https://', '');
    host.title = origin;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mini-btn';

    if (isOn(origin)) {
      btn.textContent = 'Turn off';
      btn.addEventListener('click', () => disableSite(origin));
    } else {
      btn.textContent = 'Enable';
      btn.addEventListener('click', () => enableSite(origin));
    }

    row.append(host, btn);
    box.appendChild(row);
  }
}

function applyTheme(id) {
  const theme = isTheme(id) ? id : DEFAULT_THEME;
  document.documentElement.dataset.theme = theme;
  settings.theme = theme;

  // mirrored so theme-init.js can read it synchronously on the next open
  try {
    localStorage.setItem('toolbox-theme', theme);
  } catch {
    /* storage disabled — the popup just falls back to the default */
  }

  return theme;
}

function renderThemes() {
  const box = $('set-themes');
  box.innerHTML = '';

  for (const theme of THEMES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `swatch${theme.id === settings.theme ? ' is-on' : ''}`;
    btn.title = theme.name;

    const dot = document.createElement('span');
    dot.className = 'sw-dot';
    dot.style.setProperty('--sw-bg', theme.bg);
    dot.style.setProperty('--sw-panel', theme.panel);
    dot.style.setProperty('--sw-accent', theme.accent);

    const name = document.createElement('span');
    name.className = 'sw-name';
    name.textContent = theme.name;

    btn.append(dot, name);
    btn.addEventListener('click', () => {
      applyTheme(theme.id);
      saveSettings();
      renderThemes();
    });

    box.appendChild(btn);
  }
}

async function rebuildIndex() {
  const btn = $('set-rebuild');
  btn.disabled = true;
  btn.textContent = 'Rebuilding…';
  renderStatus('Rebuilding index…');

  try {
    const result = await chrome.runtime.sendMessage({ type: 'REBUILD_INDEX' });
    if (result && result.ok) {
      const { hcIndex } = await chrome.storage.local.get('hcIndex');
      loadIndex(hcIndex);
      renderHelp();
      renderSettings();
      renderStatus(`Indexed ${result.count} articles`, 'ok');
      toast(`${result.count} articles indexed`);
    } else {
      renderStatus(`Index failed: ${result && result.error}`, 'warn');
    }
  } catch (err) {
    renderStatus(`Index failed: ${err.message}`, 'warn');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Rebuild index now';
  }
}

/* ─────────────────────────── chrome ─────────────────────────── */

function renderStatus(text, cls = '') {
  const bar = $('status');
  if (text) {
    bar.textContent = text;
    bar.className = `status ${cls}`;
    return;
  }

  bar.className = 'status';

  // The idle status line is about the article index, so it has nothing to say
  // when the Help Center tool is switched off.
  if (settings.tools.help === false) {
    bar.textContent = '';
    return;
  }

  bar.textContent = indexMeta.count
    ? `${indexMeta.count} articles · updated ${ago(indexMeta.builtAt)}`
    : 'Building article index…';
}

let toastTimer;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 1400);
}
