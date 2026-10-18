/*
 * Makes every "SO-#1145" on the page open in a new tab.
 *
 * Two different mechanisms, because one alone does not cover the real pages:
 *
 *   1. Where the number sits in ordinary text, it becomes a real <a href>.
 *      The browser then gives middle-click, Ctrl+click and the right-click
 *      menu for free.
 *
 *   2. Where the number is already inside a link — every Gorgias ticket row and
 *      the ticket header are anchors — a nested <a> is invalid HTML and the
 *      browser silently splits it, breaking the row. So there it becomes a
 *      <span> that opens the tab itself and swallows the click, stopping
 *      Gorgias from navigating the row underneath at the same time.
 *
 * Both look identical and both open in a new tab. Only case 1 can offer the
 * native right-click menu, because only case 1 has an href for Chrome to act on.
 */

(() => {
  const LINK_CLASS = 'mpt-so-link';   // real anchor
  const HOT_CLASS = 'mpt-so-hot';     // span fallback, used inside anchors
  const CHIP_CLASS = 'mpt-so-chip';   // sits beside an editable field
  const SO_PATTERN = /\bSO-#?(\d{1,7})\b/g;
  const DEFAULT_STORE = 'meta-pcs';

  // Never rewrite inside these: editable areas would corrupt what the user is
  // typing (Gorgias' reply composer above all).
  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT',
    'SELECT', 'OPTION', 'CODE', 'PRE', 'SVG',
  ]);

  let enabled = true;
  let showBadge = true;
  let store = DEFAULT_STORE;
  let observer = null;
  const pending = new Set();
  let flushTimer = null;
  let announced = false;

  /* ─────────────────────────── linkifying ─────────────────────────── */

  function isSkipped(element) {
    for (let el = element; el; el = el.parentElement) {
      if (SKIP_TAGS.has(el.tagName)) return true;
      if (el.isContentEditable) return true;
      if (el.classList
        && (el.classList.contains(LINK_CLASS) || el.classList.contains(HOT_CLASS))) {
        return true;
      }
    }
    return false;
  }

  function insideAnchor(element) {
    for (let el = element; el; el = el.parentElement) {
      if (el.tagName === 'A') return true;
    }
    return false;
  }

  function soUrl(number) {
    return 'https://admin.shopify.com/store/' + store
      + '/apps/work-mate/work-orders/SO-%23' + number;
  }

  function makeNode(label, number, inAnchor) {
    const url = soUrl(number);
    const title = 'Open SO-#' + number + ' in a new tab';

    // Plain text: a genuine link, so Chrome handles every gesture natively.
    if (!inAnchor) {
      const a = document.createElement('a');
      a.className = LINK_CLASS;
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = label;
      a.title = title;
      a.dataset.mptSo = number;

      // The row underneath usually has its own click handler; without this a
      // left-click would open the tab AND navigate the page behind it.
      const swallow = (e) => e.stopPropagation();
      a.addEventListener('click', swallow);
      a.addEventListener('mousedown', swallow);
      a.addEventListener('mouseup', swallow);
      a.addEventListener('auxclick', swallow);
      return a;
    }

    // Already inside a link: open the tab ourselves and stop the host app from
    // acting on the same click.
    const span = document.createElement('span');
    span.className = HOT_CLASS;
    span.textContent = label;
    span.title = title;
    span.dataset.mptSo = number;
    span.setAttribute('role', 'link');
    span.setAttribute('tabindex', '0');

    const open = (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.open(url, '_blank', 'noopener');
    };

    span.addEventListener('click', open);
    span.addEventListener('auxclick', (e) => { if (e.button === 1) open(e); });
    span.addEventListener('mousedown', (e) => {
      if (e.button === 1) e.preventDefault(); // suppress middle-click autoscroll
      e.stopPropagation();
    });
    span.addEventListener('mouseup', (e) => e.stopPropagation());
    span.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') open(e);
    });

    return span;
  }

  function replaceInTextNode(node) {
    const text = node.nodeValue;
    const inAnchor = insideAnchor(node.parentElement);
    SO_PATTERN.lastIndex = 0;

    let match;
    let last = 0;
    let fragment = null;

    while ((match = SO_PATTERN.exec(text)) !== null) {
      if (!fragment) fragment = document.createDocumentFragment();
      if (match.index > last) {
        fragment.appendChild(document.createTextNode(text.slice(last, match.index)));
      }
      fragment.appendChild(makeNode(match[0], match[1], inAnchor));
      last = match.index + match[0].length;
    }

    if (!fragment) return;
    if (last < text.length) fragment.appendChild(document.createTextNode(text.slice(last)));
    if (node.parentNode) node.parentNode.replaceChild(fragment, node);
  }

  function linkifyRoot(root) {
    if (!root || !root.isConnected) return;

    if (root.nodeType === Node.TEXT_NODE) {
      if (root.parentElement && !isSkipped(root.parentElement)) replaceInTextNode(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const value = node.nodeValue;
        if (!value || value.length < 4) return NodeFilter.FILTER_REJECT;
        if (value.indexOf('SO-') === -1) return NodeFilter.FILTER_REJECT;
        if (!node.parentElement || isSkipped(node.parentElement)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    // Collect first: replacing nodes while walking invalidates the walker.
    const targets = [];
    let node;
    while ((node = walker.nextNode()) !== null) targets.push(node);
    for (const target of targets) replaceInTextNode(target);

    chipEditables(root);
  }

  /* ─────────────────── editable fields (chip beside) ─────────────── */

  /*
   * The Gorgias ticket subject is an editable field — you can click it and
   * retype it. We must not inject anything *into* it: the moment Gorgias saved
   * that field, our markup would be saved as part of the subject.
   *
   * So for editable fields we leave the text completely alone and put a small
   * clickable chip immediately after the field instead.
   */
  function editableText(host) {
    if (host.tagName === 'INPUT' || host.tagName === 'TEXTAREA') return host.value || '';
    return host.textContent || '';
  }

  function clearChips(host) {
    if (!host.dataset.mptChips) return;
    delete host.dataset.mptChips;

    let sibling = host.nextSibling;
    while (sibling) {
      const next = sibling.nextSibling;
      if (sibling.nodeType === Node.ELEMENT_NODE
        && sibling.classList.contains(CHIP_CLASS)) {
        sibling.remove();
      } else {
        break;
      }
      sibling = next;
    }
  }

  function makeChip(number, host) {
    const chip = makeNode('SO-#' + number, number, insideAnchor(host.parentElement));
    chip.classList.add(CHIP_CLASS);
    chip.setAttribute('contenteditable', 'false');
    return chip;
  }

  function chipEditables(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;

    const selector = '[contenteditable=""],[contenteditable="true"],input,textarea';
    const hosts = [];
    if (typeof root.matches === 'function' && root.matches(selector)) hosts.push(root);
    for (const el of root.querySelectorAll(selector)) hosts.push(el);

    for (const host of hosts) {
      // If the field itself sits inside an editable region, a sibling chip
      // would land inside that region too — skip rather than risk it.
      if (host.parentElement && host.parentElement.isContentEditable) continue;

      const raw = editableText(host);
      if (raw.indexOf('SO-') === -1) {
        clearChips(host);
        continue;
      }

      const numbers = [];
      SO_PATTERN.lastIndex = 0;
      let match;
      while ((match = SO_PATTERN.exec(raw)) !== null) {
        if (!numbers.includes(match[1])) numbers.push(match[1]);
      }

      if (!numbers.length) {
        clearChips(host);
        continue;
      }

      // Skip the rebuild when the same numbers are already chipped, so typing
      // in the field does not churn the DOM on every keystroke.
      const key = numbers.join(',');
      if (host.dataset.mptChips === key) continue;

      clearChips(host);
      host.dataset.mptChips = key;

      let after = host;
      for (const number of numbers) {
        const chip = makeChip(number, host);
        if (after.parentNode) after.parentNode.insertBefore(chip, after.nextSibling);
        after = chip;
      }
    }
  }

  function markedCount() {
    return document.querySelectorAll('.' + LINK_CLASS + ', .' + HOT_CLASS).length;
  }

  /* ───────────────────────── diagnostic badge ─────────────────────── */

  /*
   * A small corner readout, because otherwise "it isn't working" has three
   * indistinguishable causes: the script never ran, it ran but matched nothing,
   * or it matched but the styling is invisible. The badge separates them:
   *
   *   no badge at all  -> the content script is not running on this page
   *   "MPT 0 SO"       -> running, but nothing matched in the DOM
   *   "MPT 14 SO"      -> working; the numbers are live
   *
   * Off switch lives in Settings. Click the badge to hide it for the session.
   */
  const BADGE_ID = 'mpt-diagnostic-badge';
  let badgeDismissed = false;

  // Shown in the top frame, and in any frame big enough to be the app itself
  // (WorkMate runs in one) — but not in tracking pixels and tiny widgets.
  function badgeAllowed() {
    if (window.top === window) return true;
    return window.innerWidth > 400 && window.innerHeight > 300;
  }

  function paintBadge() {
    if (!badgeAllowed()) return;
    if (!document.documentElement) return;

    const existing = document.getElementById(BADGE_ID);

    if (!showBadge || !enabled || badgeDismissed) {
      if (existing) existing.remove();
      return;
    }

    const count = markedCount();
    let el = existing;

    if (!el) {
      el = document.createElement('div');
      el.id = BADGE_ID;
      el.title = 'META PC Toolbox diagnostic — click to hide, or turn it off in Settings';
      el.addEventListener('click', () => { badgeDismissed = true; el.remove(); });
      // Appended outside <body> so a host-app re-render cannot wipe it, and so
      // the text walker (which starts at <body>) never sees its own badge.
      document.documentElement.appendChild(el);
    }

    // On the Shopify admin shell itself, finding nothing is expected — the work
    // orders live in the embedded frame. Say so rather than reporting a bare 0.
    const onAdminShell = window.top === window
      && /(^|\.)admin\.shopify\.com$/.test(location.hostname);

    el.textContent = (count === 0 && onAdminShell)
      ? 'MPT · WorkMate frame not enabled'
      : 'MPT ' + count + ' SO';
    el.dataset.mptCount = String(count);
  }

  function unlinkify() {
    // Chips are additions rather than wrappers, so they are deleted outright.
    for (const chip of document.querySelectorAll('.' + CHIP_CLASS)) chip.remove();
    for (const host of document.querySelectorAll('[data-mpt-chips]')) {
      delete host.dataset.mptChips;
    }

    for (const el of document.querySelectorAll('.' + LINK_CLASS + ', .' + HOT_CLASS)) {
      el.replaceWith(document.createTextNode(el.textContent));
    }
    if (document.body) document.body.normalize();
  }

  /* ──────────────────────────── observing ─────────────────────────── */

  function scheduleFlush() {
    if (flushTimer !== null) return;
    flushTimer = setTimeout(flush, 200);
  }

  function flush() {
    flushTimer = null;
    const roots = [...pending];
    pending.clear();
    if (!enabled || !roots.length) return;

    // Our own insertions are mutations too — stop listening while we edit.
    stopObserving();
    for (const root of roots) linkifyRoot(root);
    reportFrames();
    paintBadge();
    startObserving();
  }

  function onMutations(records) {
    if (!enabled) return;

    for (const record of records) {
      if (record.type === 'characterData') {
        if (record.target.parentElement) pending.add(record.target.parentElement);
        continue;
      }
      for (const added of record.addedNodes) {
        if (added.nodeType === Node.ELEMENT_NODE) pending.add(added);
        else if (added.nodeType === Node.TEXT_NODE && added.parentElement) {
          pending.add(added.parentElement);
        }
      }
    }

    if (pending.size) scheduleFlush();
  }

  function startObserving() {
    if (!document.body) return;
    if (!observer) observer = new MutationObserver(onMutations);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function stopObserving() {
    if (observer) observer.disconnect();
  }

  /* ───────────────────── embedded-frame discovery ─────────────────── */

  /*
   * WorkMate is a Shopify embedded app, so its table lives in a cross-origin
   * iframe rather than in the admin.shopify.com document — a content script
   * matched only to admin.shopify.com never sees it.
   *
   * We cannot read into that frame, but the parent page can read an iframe's
   * src *attribute*, which is enough to learn the origin. We record what we see
   * so Settings can offer to enable it in one click.
   */
  let lastReport = 0;

  function scheduleFrameScans() {
    if (window.top !== window) return;
    // Shopify injects the app iframe after the page settles; re-scan so
    // detection is not a race against that.
    for (const delay of [1000, 3000, 8000, 20000]) setTimeout(reportFrames, delay);
  }

  function reportFrames() {
    if (window.top !== window) return;
    if (Date.now() - lastReport < 900) return;
    lastReport = Date.now();

    const origins = new Set();
    for (const frame of document.querySelectorAll('iframe')) {
      const src = frame.src || frame.getAttribute('src') || '';
      if (src.indexOf('https://') !== 0) continue;
      try {
        const { origin } = new URL(src);
        if (origin !== location.origin) origins.add(origin);
      } catch {
        /* malformed src — ignore */
      }
    }
    if (!origins.size) return;

    // After an extension reload this script is orphaned and chrome.* throws synchronously.
    if (!chrome.runtime?.id) return;
    try {
      chrome.storage.local.get('seenFrames').then(({ seenFrames }) => {
        const known = seenFrames || [];
        const merged = [...new Set([...known, ...origins])].slice(0, 20);
        if (merged.length !== known.length) chrome.storage.local.set({ seenFrames: merged });
      }).catch(() => { /* extension context torn down */ });
    } catch { /* extension context invalidated */ }
  }

  /* ─────────────────────────────── boot ───────────────────────────── */

  function apply(on) {
    const was = enabled;
    enabled = on;

    if (!on) {
      stopObserving();
      if (was) unlinkify();
      paintBadge();
      return;
    }

    linkifyRoot(document.body);
    reportFrames();
    scheduleFrameScans();
    paintBadge();
    startObserving();

    // One line per page load, so "is it even running?" is answerable from the
    // page console without any extension-devtools digging.
    if (!announced) {
      announced = true;
      console.info(
        '[META PC Toolbox] SO linkifier running on ' + location.host
        + ' — ' + markedCount() + ' SO number(s) found so far',
      );
    }
  }

  function readSettings() {
    if (!chrome.runtime?.id) return Promise.reject(new Error('context invalidated'));
    return chrome.storage.local.get('settings').then(({ settings }) => {
      const s = settings || {};
      store = (s.store || DEFAULT_STORE).trim() || DEFAULT_STORE;
      showBadge = s.soBadge !== false;
      return s.soLinks !== false;
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;

    const s = changes.settings.newValue || {};
    const nextStore = (s.store || DEFAULT_STORE).trim() || DEFAULT_STORE;
    const nextEnabled = s.soLinks !== false;
    const nextBadge = s.soBadge !== false;

    if (nextBadge !== showBadge) {
      showBadge = nextBadge;
      badgeDismissed = false;
      paintBadge();
    }

    if (nextStore !== store) {
      // URLs are baked in at creation, so rebuild them under the new store
      store = nextStore;
      if (enabled) {
        unlinkify();
        linkifyRoot(document.body);
      }
    }
    if (nextEnabled !== enabled) apply(nextEnabled);
  });

  function boot() {
    readSettings().then(apply).catch(() => {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  // Exposed only for the offline test harness; harmless in the page.
  window.__mptLinkify = {
    linkifyRoot, unlinkify, apply, markedCount, LINK_CLASS, HOT_CLASS, SO_PATTERN,
  };
})();
