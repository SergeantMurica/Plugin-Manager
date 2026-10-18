/*
 * Builds and caches the Help Center index.
 *
 * The help center is a Next.js app, so the article body isn't in the served
 * HTML — it lives in the __NEXT_DATA__ JSON blob. We read the sitemap for the
 * article list, pull title + body + category out of that JSON, and cache the
 * lot in chrome.storage.local. Search then runs entirely offline, which is
 * why results appear as fast as you can type.
 *
 * This runs in the service worker (not the side panel) so a rebuild survives
 * the panel being closed.
 */

const ORIGIN = 'https://help.metapcs.com';
const SITEMAP = `${ORIGIN}/sitemap.xml`;
const LOCALE_PREFIX = `${ORIGIN}/en-US/`;
const CONCURRENCY = 6;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

let building = false;

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onInstalled.addListener(() => {
  buildIndex().catch(() => {});
});

/* If the pinned window is closed by hand, forget it so the toolbar action
 * opens the side panel instead of trying to focus a dead window. */
chrome.windows.onRemoved.addListener(async (windowId) => {
  const { pinnedWindowId } = await chrome.storage.local.get('pinnedWindowId');
  if (pinnedWindowId === windowId) {
    await chrome.storage.local.remove('pinnedWindowId');
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'REBUILD_INDEX') {
    buildIndex()
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message || err) }));
    return true;
  }

  if (msg && msg.type === 'ENSURE_INDEX') {
    ensureFreshIndex()
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message || err) }));
    return true;
  }

  return false;
});

async function ensureFreshIndex() {
  const { hcIndex } = await chrome.storage.local.get('hcIndex');
  const missing = !hcIndex || !Array.isArray(hcIndex.articles) || !hcIndex.articles.length;
  const stale = hcIndex && Date.now() - (hcIndex.builtAt || 0) > STALE_AFTER_MS;

  if (missing || stale) return buildIndex();
  return { ok: true, count: hcIndex.articles.length, builtAt: hcIndex.builtAt, skipped: true };
}

function broadcast(payload) {
  chrome.runtime.sendMessage(payload).catch(() => {
    /* The side panel is closed — nothing listening, which is fine. */
  });
}

async function buildIndex() {
  if (building) return { ok: false, error: 'A rebuild is already running.' };
  building = true;

  try {
    const urls = await fetchArticleUrls();
    if (!urls.length) throw new Error('No articles found in sitemap.');

    broadcast({ type: 'INDEX_PROGRESS', done: 0, total: urls.length });

    const articles = [];
    let categoryMap = null;
    let done = 0;

    for (let i = 0; i < urls.length; i += CONCURRENCY) {
      const batch = urls.slice(i, i + CONCURRENCY);
      const settled = await Promise.allSettled(batch.map((url) => fetchArticle(url)));

      for (const outcome of settled) {
        done += 1;
        if (outcome.status !== 'fulfilled' || !outcome.value) continue;

        const { article, categories } = outcome.value;
        if (!categoryMap && categories) categoryMap = categories;
        if (article) articles.push(article);
      }

      broadcast({ type: 'INDEX_PROGRESS', done, total: urls.length });
    }

    if (!articles.length) throw new Error('Could not read any articles.');

    if (categoryMap) {
      for (const article of articles) {
        const meta = categoryMap.get(article.id);
        if (!meta) continue;
        article.category = meta.category || article.category;
        if (!article.excerpt && meta.excerpt) article.excerpt = meta.excerpt;
      }
    }

    articles.sort((a, b) => a.title.localeCompare(b.title));

    const hcIndex = { builtAt: Date.now(), count: articles.length, articles };
    await chrome.storage.local.set({ hcIndex });

    broadcast({ type: 'INDEX_DONE', count: articles.length, builtAt: hcIndex.builtAt });
    return { ok: true, count: articles.length, builtAt: hcIndex.builtAt };
  } catch (err) {
    const message = String(err && err.message || err);
    broadcast({ type: 'INDEX_ERROR', error: message });
    return { ok: false, error: message };
  } finally {
    building = false;
  }
}

async function fetchArticleUrls() {
  const res = await fetch(SITEMAP, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Sitemap returned ${res.status}`);

  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1]);

  // Keep article pages; drop category listings (/articles/...) and /contact.
  return [...new Set(
    locs.filter((url) => url.startsWith(LOCALE_PREFIX)
      && !url.includes('/en-US/articles/')
      && !url.endsWith('/contact')),
  )];
}

async function fetchArticle(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;

  const html = await res.text();
  const data = extractNextData(html);
  if (!data) return null;

  const props = data.props && data.props.pageProps;
  if (!props || !props.title) return null;

  const id = idFromUrl(url);
  const text = htmlToText(props.htmlContent || '');

  const article = {
    id,
    title: String(props.title).trim(),
    url,
    category: '',
    excerpt: '',
    text,
    updated: props.lastUpdated || '',
  };

  return { article, categories: buildCategoryMap(props.sidebarCategories) };
}

function extractNextData(html) {
  const match = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!match) return null;

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function idFromUrl(url) {
  const match = url.match(/-(\d+)\/?$/);
  return match ? match[1] : url;
}

/* Walk the sidebar tree so each article gets its category name and excerpt. */
function buildCategoryMap(categories) {
  if (!Array.isArray(categories) || !categories.length) return null;

  const map = new Map();

  const walk = (node, inheritedName) => {
    if (!node) return;
    const name = (node.title || '').trim() || inheritedName;

    for (const article of node.articles || []) {
      if (!article || !article.id) continue;
      map.set(String(article.id), {
        category: name,
        excerpt: (article.excerpt || '').trim(),
      });
    }

    for (const child of node.children || []) walk(child, name);
  };

  for (const root of categories) walk(root, '');
  return map.size ? map : null;
}

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', trade: '™', reg: '®', copy: '©',
  deg: '°', times: '×', middot: '·', bull: '•', laquo: '«', raquo: '»',
};

function decodeEntities(str) {
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+[0-9]*);/gi, (full, name) => {
      const hit = NAMED_ENTITIES[name.toLowerCase()];
      return hit === undefined ? full : hit;
    });
}

function safeCodePoint(code) {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

/* No DOMParser in a service worker, so strip tags by hand. */
function htmlToText(html) {
  const stripped = String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  return decodeEntities(stripped)
    .replace(/[ \t ]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
