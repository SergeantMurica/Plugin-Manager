(() => {
  if (globalThis.__warrantyTrackerInstalled) return;
  globalThis.__warrantyTrackerInstalled = true;

  const CACHE_KEY = "wtContacts";
  const AUTH_KEY = "wtAuth";
  const PAGE_KEY = "wtShopifyPage";
  const PULL_KEY = "wtShopifyPull";
  const LABEL = {
    texted: "Texted",
    agreed: "Agreed",
    declined: "Declined",
    none: "No answer",
    paid: "Paid",
    wrong_number_error: "Wrong number/error",
    already_has: "Already Has",
  };
  const ORDER_TEXT = /^#?[A-Za-z]{0,6}\d{3,}$/;

  let items = {};
  let signedIn = false;
  let myUid = "";
  let menu = null;
  const enrichSent = new Set();
  const badgeTargets = new WeakMap();
  const pending = new Set();
  let lastPage = "";

  const orderKey = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  // After the extension is reloaded, orphaned content scripts lose chrome.* access and throw.
  const alive = () => !!chrome.runtime?.id;
  const RELOAD_MESSAGE = "The Warranty Upsell Tracker extension was reloaded or disconnected. Reload this Shopify page and try again.";
  const send = (type, payload) =>
    new Promise((resolve) => {
      if (!alive()) return resolve({ ok: false, error: RELOAD_MESSAGE });
      try {
        chrome.runtime.sendMessage({ type, payload }, (r) => {
          const error = chrome.runtime.lastError;
          if (error) {
            resolve({ ok: false, error: `${RELOAD_MESSAGE}\n${error.message}` });
            return;
          }
          resolve(r || { ok: false, error: "The Warranty Upsell Tracker did not respond. Reload this Shopify page and try again." });
        });
      } catch (error) {
        resolve({ ok: false, error: `${RELOAD_MESSAGE}\n${error.message}` });
      }
    });

  function orderTargets() {
    const found = [];
    for (const a of document.querySelectorAll('[href*="/orders/"]')) {
      if (!/\/orders\/\d+/.test(a.getAttribute("href") || "")) continue;
      const text = a.textContent.trim();
      if (ORDER_TEXT.test(text)) found.push({ el: a, order: text });
    }
    if (/\/orders\/\d+/.test(location.pathname)) {
      const h1 = [...document.querySelectorAll("h1")].find((h) => ORDER_TEXT.test(h.textContent.trim()));
      if (h1) found.push({ el: h1, order: h1.textContent.trim() });
      else {
        const page = document.querySelector("s-internal-page[heading]");
        const order = page?.getAttribute("heading")?.trim() || "";
        if (ORDER_TEXT.test(order)) found.push({ el: page, order });
      }
    }
    return found;
  }

  function badgeFor(el) {
    if (el.tagName === "S-INTERNAL-PAGE") return el.querySelector('[slot="accessory"] .wt-badge');
    const next = el.nextElementSibling;
    return next && next.classList.contains("wt-badge") ? next : null;
  }

  function paint() {
    if (location.href !== lastPage) {
      enrichSent.clear();
      lastPage = location.href;
    }
    for (const { el, order } of orderTargets()) {
      const id = orderKey(order);
      const c = items[id];
      let b = badgeFor(el);
      if (!b) {
        b = document.createElement("span");
        b.className = "wt-badge";
        b.addEventListener("click", onBadgeClick);
        if (el.tagName === "S-INTERNAL-PAGE") {
          let accessory = el.querySelector('[slot="accessory"]');
          if (!accessory) {
            accessory = document.createElement("div");
            accessory.slot = "accessory";
            el.prepend(accessory);
          }
          accessory.append(b);
        } else el.insertAdjacentElement("afterend", b);
      }
      badgeTargets.set(b, el);
      const state = c ? c.status : "new";
      const text = pending.has(id) ? "Saving..." : !signedIn ? "Warranty: sign in" : c ? `${LABEL[c.status] || c.status}: ${c.by}` : "Not contacted";
      if (b.dataset.state !== state) b.dataset.state = state;
      if (b.dataset.order !== order) b.dataset.order = order;
      if (b.textContent !== text) b.textContent = text;
      b.title = pending.has(id)
        ? "Saving this order. Other orders remain available."
        : c ? `${c.by} · ${new Date(c.ts).toLocaleString()}${c.note ? "\n" + c.note : ""}`
          : "Click to log. You can log other orders while this one loads.";
      if (signedIn && !el.hasAttribute("href")) enrichFromPage(order);
    }
  }

  const tidyName = (s) =>
    String(s || "").trim().replace(/\s+/g, " ").replace(/(^|[\s'-])(\p{L})/gu, (_, sep, l) => sep + l.toLocaleUpperCase());

  // Orders list: read the Customer column of the row the badge sits in.
  function rowCustomer(el) {
    const row = el.closest("tr");
    const heads = row?.closest("table")?.querySelectorAll("thead th");
    if (!heads) return "";
    const i = [...heads].findIndex((h) => h.textContent.trim().toLowerCase() === "customer");
    const name = i < 0 ? "" : row.cells[i]?.textContent.trim() || "";
    return /no customer/i.test(name) ? "" : tidyName(name);
  }

  const root = () => document.querySelector("main") || document.body;
  const PHONE = /(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/;
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
  // Line item: "SKU\nRTS/SHADEv3\n\nUnit price|Sale price\n$1,714.02 ... ×\n1". The first amount is
  // what the customer paid per unit (a sale's original price comes after it).
  const PC_LINE = /\bSKU\s*\n\s*((?:(?:RTS|CONFIG)\/\S+|CUSTOM\/PC))\s*\n(?:(?!\bSKU\b)[^$])*?\$\s?([\d,]+(?:\.\d+)?)(?:(?!\bSKU\b)[^\u00d7])*?\u00d7\s*(\d+)/gi;

  // Every PC on the order, one entry per unit: RTS/* is a ready-to-ship build, CONFIG/* a custom
  // build (CONFIG/WC = watercooled); CUSTOM/PC is also a system.
  function orderSystems() {
    const text = root().innerText || "";
    // The summary card renders after the line items, so wait for it to avoid reading half an order.
    if (!/\nSubtotal\s*\n/.test(text)) return null;
    const pcs = [];
    for (const [, sku, price, qty] of text.matchAll(PC_LINE)) {
      const amount = Number(price.replace(/,/g, ""));
      for (let i = 0; i < Number(qty); i++) pcs.push({ sku: sku.toUpperCase(), amount });
    }
    return pcs;
  }

  // Order detail page: customer name, phone, email and the PCs on the order.
  function scrapeOrderPage() {
    // Shopify renders these as <s-internal-link>, not <a>, so match any element with the href.
    const link = [...root().querySelectorAll('[href*="/customers/"]')].find((a) =>
      /\p{L}/u.test(a.textContent) && !/^(?:view(?: customer)?|customer)$/i.test(a.textContent.trim()),
    );
    const customer = tidyName(link?.textContent);
    // Climb from the customer link into the sidebar card that also holds the shipping address.
    let card = link;
    const cardText = () => (card?.innerText || "").replace(UUID, " ");
    for (let i = 0; i < 8 && card && !PHONE.test(cardText()); i++) card = card.parentElement;
    const tel = (root().querySelector('[href^="tel:"]')?.getAttribute("href") || "").replace(/^tel:/, "");
    const phone = tel || (card ? cardText().match(PHONE)?.[0] : "") || "";
    const mailto = root().querySelector('[href^="mailto:"]')?.getAttribute("href") || "";
    let addr = mailto.replace(/^mailto:/, "").split("?")[0];
    try { addr = decodeURIComponent(addr); } catch {}
    let email = (addr.match(EMAIL) || [""])[0];
    for (let n = link, i = 0; !email && n && i < 6; i++, n = n.parentElement) email = (n.innerText || "").match(EMAIL)?.[0] || "";
    const data = { customer, phone: phone.trim(), email };
    const pcs = orderSystems();
    if (pcs?.length) {
      data.systems = pcs.map((p) => p.amount).join(",");
      data.systemPrice = String(Math.round(pcs.reduce((s, p) => s + p.amount, 0) * 100) / 100);
      data.watercooled = pcs.some((p) => p.sku === "CONFIG/WC") ? "yes" : "";
    }
    return data;
  }

  async function enrichFromPage(order) {
    const id = orderKey(order);
    const c = items[id];
    if (!c || c.uid !== myUid) return;
    const data = scrapeOrderPage();
    if (!Object.values(data).some(Boolean)) return;
    const url = location.href;
    const sig = JSON.stringify([url, id, data]);
    if (enrichSent.has(sig)) return;
    enrichSent.add(sig);
    try {
      const result = await send("enrich", { order, ...data });
      if (!result.ok) throw new Error(result.error || "Could not save Shopify order details.");
      if (location.href !== url) return;
      const details = { ...data };
      for (const field of ["customer", "phone", "email"]) {
        if (c[field]) details[field] = c[field];
      }
      if (c.systems) {
        details.systems = c.systems;
        details.systemPrice = c.systemPrice;
        details.watercooled = c.watercooled || "";
      }
      const selected = (await chrome.storage.local.get(PULL_KEY))[PULL_KEY];
      // Background pulls finish out of order. Save every record, but don't replace the
      // latest selected customer's form with a slower, earlier pull.
      if (document.visibilityState === "visible" || !selected || orderKey(selected.order) === id)
        await chrome.storage.local.set({ [PAGE_KEY]: { order, url, ...details } });
    } catch (error) {
      enrichSent.delete(sig);
      console.error("[Dashboard Tool] Shopify order details were not saved:", error);
    }
  }

  function closeMenu() {
    menu?.remove();
    menu = null;
  }

  async function act(order, status, el, seen) {
    closeMenu();
    const id = orderKey(order);
    if (pending.has(id)) return;
    pending.add(id);
    paint();
    try {
      const payload = { order, status, expect: seen ? seen.updateTime || "" : null };
      const fromList = el.hasAttribute("href");
      const first = !seen;
      if (first && fromList) {
        const customer = rowCustomer(el);
        if (customer) payload.customer = customer;
      } else if (first) {
        Object.assign(payload, scrapeOrderPage());
      }
      let opening;
      if (first && fromList) {
        await chrome.storage.local.set({ [PULL_KEY]: { order } });
        opening = send("openOrder", { url: new URL(el.getAttribute("href"), location.href).href });
      }
      // Load Shopify while Firestore saves the status, rather than paying both delays in sequence.
      const [r, opened] = await Promise.all([send("upsert", payload), opening]);
      if (!r.ok) return alert(r.error || "Could not save.");
      if (opened && !opened.ok)
        alert(opened.error || "Status saved, but the order could not be opened to read customer details.");
      if (!fromList) {
        items[id] = { ...seen, ...payload, uid: seen?.uid || myUid };
        await enrichFromPage(order);
      }
    } catch (error) {
      alert(`Could not pull ${order}: ${error.message}`);
    } finally {
      pending.delete(id);
      paint();
    }
  }

  function onBadgeClick(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    if (!alive()) {
      closeMenu();
      alert(RELOAD_MESSAGE);
      return;
    }
    if (!signedIn) {
      alert("Open the Warranty Upsell Tracker popup and sign in first.");
      return;
    }
    closeMenu();
    const badge = ev.currentTarget;
    const order = badge.dataset.order;
    const target = badgeTargets.get(badge);
    const c = items[orderKey(order)];
    menu = document.createElement("div");
    menu.className = "wt-menu";
    const title = document.createElement("div");
    title.className = "wt-menu-title";
    title.textContent = c ? `${order} — ${c.by}` : order;
    menu.append(title);
    const add = (label, fn) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
      menu.append(b);
    };
    for (const s of Object.keys(LABEL)) {
      if (!c || c.status !== s) add(c ? `Mark ${LABEL[s]}` : `Log as ${LABEL[s]}`, () => act(order, s, target, c));
    }
    document.body.append(menu);
    const r = badge.getBoundingClientRect();
    menu.style.top = `${Math.min(r.bottom + 4, innerHeight - menu.offsetHeight - 8)}px`;
    menu.style.left = `${Math.min(r.left, innerWidth - menu.offsetWidth - 8)}px`;
  }

  document.addEventListener("click", (e) => { if (menu && !menu.contains(e.target)) closeMenu(); }, true);

  let timer = 0;
  let lastPaint = 0;
  let wake = null;
  let woken = false;
  const run = () => {
    clearTimeout(timer);
    timer = 0;
    woken = false;
    lastPaint = Date.now();
    paint();
  };
  // Throttle rather than debounce: ongoing Shopify mutations must not postpone a ready order forever.
  // Pulled orders load in background tabs, where Chrome clamps timers to >= 1 s; a message task
  // isn't clamped, so there it paints at most every 50 ms and the timer only catches the last burst.
  const schedule = () => {
    if (woken) return;
    if (document.visibilityState === "hidden" && Date.now() - lastPaint >= 50) {
      if (!wake) {
        const channel = new MessageChannel();
        channel.port1.onmessage = run;
        wake = channel.port2;
      }
      woken = true;
      wake.postMessage(0);
      return;
    }
    if (!timer) timer = setTimeout(run, 50);
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["heading"] });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      enrichSent.clear();
      paint();
    }
  });

  async function load() {
    if (!alive()) return;
    const d = await chrome.storage.local.get([CACHE_KEY, AUTH_KEY]).catch(() => null);
    if (!d) return;
    items = d[CACHE_KEY]?.items || {};
    signedIn = !!d[AUTH_KEY];
    myUid = d[AUTH_KEY]?.uid || "";
    paint();
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes[CACHE_KEY] || changes[AUTH_KEY])) load();
  });

  load();
  send("refresh");
})();
