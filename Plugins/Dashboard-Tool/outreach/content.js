// Reads the open Pound list lead on Dash and shares it with the side panel through chrome.storage.
// Dash markup isn't documented, so parsing works on visible text ("PHONE", "CUSTOMER", ...) rather
// than class names, and every field can be corrected by hand in the panel.
(() => {
  if (typeof globalThis.__poundListToolInstalled === "function") {
    try {
      globalThis.__poundListToolInstalled();
    } catch (error) {
      console.warn("Replacing the previous Dash connection:", error.message);
    }
  }

  const PAGE_KEY = "plPage";
  const alive = () => !!chrome.runtime?.id;
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const TYPE_RE = /^(financing lead|warranty before (?:it ships|pickup or delivery)|abandon(?:ed)? carts?|help ?desk)\b/i;
  const LABELS = {
    customer: "CUSTOMER",
    phone: "PHONE",
    email: "EMAIL",
    createdBy: "CREATED BY",
    claimedBy: "CLAIMED BY",
    opened: "OPENED",
  };
  const LABEL_SET = new Set(Object.values(LABELS));
  const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
  const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
  const ORDER_RE = /\bMPC\d{4,}\b/i;
  const MONEY_RE = /\$\s?([\d,]+(?:\.\d{2})?)/;

  function typeOf(title) {
    const m = TYPE_RE.exec(title || "");
    if (!m) return "other";
    const t = m[1].toLowerCase();
    if (t.startsWith("financing")) return "financing";
    if (t.startsWith("warranty")) return "warranty";
    if (t.startsWith("abandon")) return "abandoned";
    return "helpdesk";
  }

  function findTitle() {
    const heads = document.querySelectorAll("h1, h2, h3, h4, [class*='title' i]");
    // Sidebar cards also contain lead titles. Only accept a title inside a contact detail pane.
    const candidates = [...heads].filter((h) => {
      const t = clean(h.innerText);
      return t.length < 160 && TYPE_RE.test(t) && detailPane(h) !== document.body;
    });
    candidates.sort((a, b) => detailPane(a).innerText.length - detailPane(b).innerText.length);
    if (candidates.length) return candidates[0];
    // No heading matched: take the largest leaf-ish text that looks like a lead title.
    let best = null;
    let bestSize = 0;
    for (const el of document.querySelectorAll("body *")) {
      if (el.children.length > 2) continue;
      const t = clean(el.innerText);
      if (t.length > 160 || !TYPE_RE.test(t) || detailPane(el) === document.body) continue;
      const size = parseFloat(getComputedStyle(el).fontSize) || 0;
      if (!best || detailPane(el).innerText.length < detailPane(best).innerText.length ||
        (detailPane(el).innerText.length === detailPane(best).innerText.length && size > bestSize)) {
        best = el;
        bestSize = size;
      }
    }
    return best;
  }

  // The smallest ancestor of the title that also holds the contact fields = the lead detail pane.
  function detailPane(title) {
    let el = title;
    while (el && el !== document.body) {
      if (/\bphone\b/i.test(el.innerText || "") && /\bcustomer\b/i.test(el.innerText || "")) return el;
      el = el.parentElement;
    }
    return document.body;
  }

  function fieldFrom(lines, label) {
    for (let i = 0; i < lines.length; i++) {
      const up = lines[i].toUpperCase();
      if (up === label || up === `${label}:`) {
        const next = lines[i + 1] || "";
        return LABEL_SET.has(next.toUpperCase()) ? "" : next;
      }
      if (up.startsWith(`${label}:`) || up.startsWith(`${label} `)) {
        const rest = clean(lines[i].slice(label.length).replace(/^:/, ""));
        if (rest) return rest;
      }
    }
    return "";
  }

  // Approval cards can put the lender, amount, and approval date on separate lines.
  function approvalsFrom(lines) {
    const out = [];
    for (let i = 0; i < lines.length && out.length < 6; i++) {
      const money = MONEY_RE.exec(lines[i]);
      if (!money) continue;
      const approvalText = lines.slice(i, i + 3).join(" ").replace(/(\d)approved\b/gi, "$1 approved");
      if (!/\bapproved\b/i.test(approvalText)) continue;

      let lender = clean(lines[i].slice(0, money.index));
      if (!lender) {
        for (let j = i - 1; j >= 0 && j >= i - 2; j--) {
          const candidate = lines[j];
          if (/approvals?$/i.test(candidate) || MONEY_RE.test(candidate)) break;
          lender = candidate;
          break;
        }
      }
      const date = (approvalText.match(/\b(\d{4}-\d{2}-\d{2})\b/) || ["", ""])[1];
      out.push({ lender: lender.slice(0, 40), amount: money[1].replace(/,/g, ""), date });
    }
    return out;
  }

  function priceFromLines(lines, type, order) {
    if (type === "warranty") {
      if (!order) return "";
      const orderPattern = new RegExp(order.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      // Order card renders as "MPC…" / model / "T1 · $1,749.00"; skip the lead title, which also names the order.
      for (let i = 0; i < lines.length; i++) {
        if (!orderPattern.test(lines[i]) || TYPE_RE.test(lines[i])) continue;
        for (let j = i; j <= Math.min(i + 3, lines.length - 1); j++) {
          if (/warranty options|[23]-year/i.test(lines[j])) break;
          const match = MONEY_RE.exec(lines[j]);
          if (match) return match[1].replace(/,/g, "");
        }
      }
      return "";
    }

    if (type === "abandoned") {
      const section = lines.findIndex((line) => /abandoned carts?.*\bshopify\b/i.test(line));
      if (section < 0) return "";
      for (let i = section + 1; i < Math.min(section + 10, lines.length); i++) {
        const match = MONEY_RE.exec(lines[i]);
        if (match) return match[1].replace(/,/g, "");
      }
    }
    return "";
  }

  function sectionLines(lines, marker, limit) {
    const start = lines.findIndex((line) => marker.test(line));
    return start < 0 ? null : lines.slice(start, start + limit);
  }

  function scrape() {
    const body = document.body?.innerText || "";
    const leadId = (location.pathname.match(/WL-\d+/i) || [""])[0].toUpperCase();
    const claim = {
      work: Number((body.match(/work your (\d+) claimed leads?/i) || [])[1] || 0),
      now: Number((body.match(/\bNOW\s*\((\d+)\)/i) || [])[1] || 0),
      canClaim: /claim 5 leads/i.test(body),
    };
    const base = { url: location.href, leadId, claim };
    if (!leadId) return base;

    const titleEl = findTitle();
    const title = clean(titleEl?.innerText);
    if (!titleEl) return base;
    const pane = detailPane(titleEl);
    const paneText = pane.innerText || "";
    const lines = paneText.split("\n").map(clean).filter(Boolean);
    const detail = titleEl.closest(".split__detail") || document.body;
    const pageLines = (detail.innerText || "").split("\n").map(clean).filter(Boolean);
    const fields = {};
    for (const [k, label] of Object.entries(LABELS)) fields[k] = fieldFrom(lines, label);

    const parts = title.split(/\s+[—–·|-]\s+/).map(clean).filter(Boolean);
    const nameFromTitle = parts.find((p, i) => i > 0 && !ORDER_RE.test(p) && !MONEY_RE.test(p)) || "";
    const phone = (fields.phone.match(PHONE_RE) || paneText.match(PHONE_RE) || [""])[0];
    const email = (fields.email.match(EMAIL_RE) || paneText.match(EMAIL_RE) || [""])[0];
    const approvalLines = sectionLines(pageLines, /financing approvals/i, 30) || lines;
    const approvals = approvalsFrom(approvalLines);
    const type = typeOf(title);
    const order = ((title.match(ORDER_RE) || paneText.match(ORDER_RE) || [""])[0]).toUpperCase();
    const amount = approvals[0]?.amount || (type === "financing"
      ? ((title.match(MONEY_RE) || [])[1] || "").replace(/,/g, "")
      : "");

    return {
      ...base,
      type,
      title,
      customer: fields.customer || nameFromTitle,
      phone,
      email,
      createdBy: fields.createdBy,
      claimedBy: fields.claimedBy,
      opened: fields.opened,
      order,
      approvals,
      amount,
      lender: approvals[0]?.lender || "",
      systemPrice: priceFromLines(pageLines, type, order),
    };
  }

  let last = "";
  function push(force = false) {
    if (!alive()) return observer.disconnect();
    if (document.visibilityState === "hidden") return;
    let data;
    try {
      data = scrape();
    } catch {
      return;
    }
    const sig = JSON.stringify(data);
    if (!force && sig === last) return;
    last = sig;
    chrome.storage.local.set({ [PAGE_KEY]: { ...data, ts: Date.now() } }).catch(() => {});
  }

  let timer = 0;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(push, 500);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  // Switching between Dash tabs makes the visible one the lead the panel shows.
  const onVisible = () => {
    if (document.visibilityState === "visible") push(true);
  };
  const onFocus = () => push(true);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onFocus);
  push(true);

  // ---------- actions requested by the side panel ----------
  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function noteBox() {
    const visible = (el) => el.offsetParent !== null;
    const areas = [...document.querySelectorAll("textarea")].filter(visible);
    return areas.find((a) => /note|activity/i.test(`${a.placeholder} ${a.name} ${a.id} ${a.getAttribute("aria-label") || ""}`)) || areas[0] || null;
  }

  function fillNote(text) {
    const box = noteBox();
    if (!box) return false;
    const cur = box.value.trim();
    setNativeValue(box, cur ? `${cur}\n${text}` : text);
    box.focus();
    box.scrollIntoView({ block: "center", behavior: "smooth" });
    return true;
  }

  // Ticks a CTT box (Called / LVM / Texted / Emailed) on the lead if it isn't ticked yet.
  function tick(step) {
    const want = step.toLowerCase();
    for (const label of document.querySelectorAll("label")) {
      if (clean(label.innerText).toLowerCase() !== want) continue;
      const input = label.control || label.querySelector("input[type=checkbox]");
      if (input && input.type === "checkbox") {
        if (!input.checked) input.click();
        return true;
      }
    }
    for (const box of document.querySelectorAll("[role=checkbox]")) {
      const name = clean(box.getAttribute("aria-label") || box.innerText || box.parentElement?.innerText).toLowerCase();
      if (name !== want) continue;
      if (box.getAttribute("aria-checked") !== "true") box.click();
      return true;
    }
    for (const button of document.querySelectorAll("button")) {
      if (clean(button.innerText).toLowerCase() !== want) continue;
      const pressed = button.getAttribute("aria-pressed") ?? button.getAttribute("aria-checked");
      if (pressed !== null) {
        if (pressed !== "true") button.click();
        return true;
      }
      const indicator = button.querySelector("span");
      if (!indicator) continue;
      const background = getComputedStyle(indicator).backgroundColor;
      const checked = /[✓✔☑]/.test(indicator.innerText) ||
        (background !== "transparent" && background !== "rgba(0, 0, 0, 0)");
      if (!checked) button.click();
      return true;
    }
    return false;
  }

  const onMessage = (msg, _sender, respond) => {
    if (msg?.type === "plScrape") {
      push(true);
      respond({ ok: true, data: scrape() });
    } else if (msg?.type === "plFillNote") {
      respond({ ok: true, found: fillNote(String(msg.text || "")) });
    } else if (msg?.type === "plTick") {
      respond({ ok: true, found: tick(String(msg.step || "")) });
    }
    return false;
  };
  chrome.runtime.onMessage.addListener(onMessage);
  globalThis.__poundListToolInstalled = () => {
    clearTimeout(timer);
    observer.disconnect();
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onFocus);
    chrome.runtime.onMessage.removeListener(onMessage);
  };
})();
