import { sendDashMessage } from "./lib/dash.js";
import {
  EMAILS,
  LEAD_TYPES,
  TEXTS,
  WORDINGS,
  warrantyPrices,
} from "./lib/scripts.js";

const unified = !!document.getElementById("dashboardWorkspace");
const customer = unified ? await import("../customer.js") : null;
const dashboard = unified || new URLSearchParams(location.search).has("dashboard")
  ? await import("../actions.js")
  : null;

const PAGE_KEY = "plPage"; // written by content.js on Dash
const LEADS_KEY = "plLeads";
const CURRENT_KEY = "plCurrent";
const SETTINGS_KEY = "plSettings";
const REMOVED_KEY = "plLeadRemoved";
// Shared with the Warranty Upsell Tracker when both run inside Plugin Manager (same extension storage).
const WT_AUTH_KEY = "wtAuth";
const WT_CACHE_KEY = "wtContacts";
const WT_DRAFT_KEY = "wtDraft";
const SHOPIFY_PAGE_KEY = "wtShopifyPage";
let shopifyPage = null;

const WT_STATUSES = [
  ["texted", "Texted"],
  ["agreed", "Agreed"],
  ["declined", "Declined"],
  ["paid", "Paid"],
  ["none", "No answer"],
  ["wrong_number_error", "Wrong number/error"],
  ["already_has", "Already Has"],
];
const FIELDS = [
  "customer",
  "phone",
  "email",
  "order",
  "lender",
  "amount",
  "systemPrice",
];

const $ = (id) => document.getElementById(
  unified ? customer.sharedFieldIds[id] || `pl-${id}` : id,
);
const els = Object.fromEntries(
  [
    "repLabel",
    "claim",
    "lead",
    "leadId",
    "type",
    "readPage",
    "customer",
    "phone",
    "email",
    "order",
    "lender",
    "amount",
    "systemPrice",
    "watercooled",
    "wtBox",
    "wtHint",
    "wtStatus",
    "wtLog",
    "wtOpen",
    "error",
    "scriptTabs",
    "scriptTools",
    "script",
    "rep",
    "callback",
  ].map((id) => [id, $(id)]),
);

let leads = {};
let removedLeads = new Set();
let current = null; // the lead shown in the form
let page = null; // last scrape from Dash
let settings = { rep: "", callback: "" };
let wtAuth = null;
let wtItems = {};
let warrantyStatusOrder = null;
let warrantySavedStatus = "texted";
let hasWarrantyTool = false;
let scriptTab = "text";
let textId = "";
let emailId = "";

// ---------- helpers ----------
const orderKey = (s) =>
  String(s || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const digits = (s) => {
  let d = String(s || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d;
};
const prettyPhone = (s) => {
  const d = digits(s);
  return d.length === 10
    ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
    : String(s || "").trim();
};
// Dash shows some names in caps ("AUSTIN TRENGO"); scripts read better in title case.
const titleCase = (name) => {
  const s = String(name || "").trim();
  const t = s === s.toUpperCase() ? s.toLowerCase() : s;
  return t.replace(
    /(^|[\s'-])(\p{L})/gu,
    (_, sep, l) => sep + l.toLocaleUpperCase(),
  );
};
function showError(msg) {
  els.error.textContent = msg || "";
  els.error.hidden = !msg;
}
const repName = () => titleCase(settings.rep || wtAuth?.name || "");
const send = (type, payload) =>
  new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type, payload }, (r) => {
        if (chrome.runtime.lastError)
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(r || { ok: false, error: "No response." });
      });
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
async function flash(button, text, done = "Copied") {
  await navigator.clipboard.writeText(text);
  const label = button.textContent;
  button.textContent = done;
  button.classList.add("done");
  setTimeout(() => {
    button.textContent = label;
    button.classList.remove("done");
  }, 900);
}
function copyButton(text, label = "Copy", cls = "copy") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.textContent = label;
  b.title = "Click to copy";
  b.addEventListener("click", async () => {
    try {
      await flash(b, text);
      showError("");
    } catch (error) {
      showError(error.message);
    }
  });
  return b;
}

// ---------- Dash tab messaging ----------
async function dashTab(requireCurrent = false) {
  const tabs = await chrome.tabs
    .query({
      url: [
        "https://dash.metapcs.com/*",
        "https://metapcs-platform.web.app/*",
      ],
    })
    .catch(() => []);
  if (!tabs.length) return null;

  const id = current?.id;
  if (requireCurrent) {
    if (!current?.url) return null;
    return tabs.find((tab) => new URL(tab.url).pathname.split("/").includes(id)) || null;
  }
  return (
    tabs.find((t) => t.active && id && t.url?.includes(id)) ||
    tabs.find((t) => id && t.url?.includes(id)) ||
    tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0]
  );
}
async function toDash(msg) {
  const tab = await dashTab(unified && msg.type !== "plScrape");
  if (!tab)
    return {
      ok: false,
      error:
        "Open the lead on dash.metapcs.com or metapcs-platform.web.app first.",
    };
  try {
    return await sendDashMessage(tab.id, msg);
  } catch (error) {
    return {
      ok: false,
      error: `Couldn't connect to Dash. Check Plugin Manager's site access for Dash in chrome://extensions, then try again: ${error.message}`,
    };
  }
}

// ---------- context for scripts ----------
function ctx() {
  const l = current || {};
  const first = titleCase(l.customer).split(/\s+/)[0];
  const w = warrantyPrices(l.systemPrice, l.watercooled, l.systems);
  return {
    first: first || "there",
    rep: repName() || "{your name}",
    callback: prettyPhone(settings.callback),
    lender: (l.lender || "").trim(),
    order: (l.order || "").trim().toUpperCase(),
    two: w.two,
    three: w.three,
    priceKnown: w.known,
  };
}

// ---------- leads ----------
function blankLead(id) {
  return {
    id,
    type: "other",
    customer: "",
    phone: "",
    email: "",
    order: "",
    lender: "",
    amount: "",
    systemPrice: "",
    watercooled: false,
    url: "",
    ts: Date.now(),
    updatedAt: Date.now(),
  };
}

const fromPage = (p, overwrite) =>
  mergeScrape(leads[p.leadId] || blankLead(p.leadId), p, overwrite);

function mergeScrape(lead, p, overwrite) {
  const l = { ...lead };
  const scraped = {
    customer: titleCase(p.customer),
    phone: prettyPhone(p.phone),
    email: p.email,
    order: p.order,
    lender: p.lender,
    amount: p.amount,
    systemPrice: p.systemPrice,
  };
  for (const [k, v] of Object.entries(scraped))
    if (v && (overwrite || !l[k])) l[k] = v;
  if (p.type) l.type = p.type;
  l.claimedBy = p.claimedBy || "";
  l.url = p.url || l.url;
  l.approvals = p.approvals || l.approvals || [];
  return l;
}

let saveTimer = 0;
function save(now = false) {
  if (!current) return;
  current.updatedAt = Date.now();
  leads[current.id] = current;
  clearTimeout(saveTimer);
  const currentId = current.id;
  const write = async () => {
    saveTimer = 0;
    try {
      await chrome.storage.local.set({ [LEADS_KEY]: leads, [CURRENT_KEY]: currentId });
    } catch (error) {
      showError(`Couldn't save the lead: ${error.message}`);
    }
  };
  if (now) write();
  else saveTimer = setTimeout(write, 300);
}

function show(lead, explicit = false, automatic = false) {
  if (unified && lead && removedLeads.has(lead.id)) return false;
  if (unified && lead && !automatic && customer.draftConflicts(customer.readCustomer(), lead)) {
    if (!explicit) {
      showError("A Dash lead is available. Your customer draft was kept; clear the fields and reopen the lead on Dash to load it.");
      return false;
    }
    if (!confirm("Replace the shared customer form with this Dash lead? Your saved Warranty records will not change.")) return false;
  }
  current = lead;
  textId = "";
  emailId = "";
  warrantyStatusOrder = null;
  if (unified) els.wtStatus.value = "texted";
  showError("");
  fillForm();
  renderAll();
  return true;
}

function fillForm() {
  const l = current;
  els.leadId.textContent = unified && l?.id.startsWith("WT-")
    ? "Manual customer"
    : l ? l.id : "No lead open";
  for (const f of FIELDS) {
    if (!unified || l || !customer.sharedFieldIds[f]) els[f].value = l?.[f] || "";
  }
  if (!unified || l) els.watercooled.checked = !!l?.watercooled;
  els.type.value = l?.type || "other";
  for (const el of els.lead.querySelectorAll("input, select, button")) {
    if (el !== els.readPage) el.disabled = !l;
  }
  if (unified) els.type.disabled = !l;
  applyTypeVisibility();
  if (unified && l) customer.customerChanged();
}

function applyTypeVisibility() {
  const type = current?.type || "other";
  for (const el of document.querySelectorAll("[data-for]")) {
    el.hidden = !el.dataset.for.split(" ").includes(type);
  }
  if (type === "warranty") els.wtBox.hidden = !hasWarrantyTool;
}

// ---------- rendering ----------
function renderAll() {
  renderHeader();
  renderWarranty();
  renderScriptTabs();
  renderScript();
}

function renderHeader() {
  els.repLabel.textContent = repName() || "set your name ↓";
}



// ---------- warranty tool link ----------
function renderWarranty() {
  if (!hasWarrantyTool || current?.type !== "warranty") return;
  const key = orderKey(current.order);
  const e = key ? wtItems[key] : null;
  let msg = "";
  let tone = "idle";
  if (!wtAuth)
    msg =
      unified
        ? "Sign in above to log this order for the Warranty team."
        : "Sign in on the Warranty Upsell Tracker tab to log this order for the team.";
  else if (!key)
    msg = "Add the MPC order number to check and log it in the Warranty Tool.";
  else if (e && !e.hidden) {
    const label = WT_STATUSES.find(([v]) => v === e.status)?.[1] || e.status;
    const when = new Date(e.ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    if (e.uid === wtAuth.uid) {
      msg = `You logged this in the Warranty Tool on ${when}: ${label}.`;
      tone = "ok";
    } else {
      msg = `${titleCase(e.by)} already worked ${e.order} on ${when} (${label}). Check the log before contacting them.`;
      tone = "warn";
    }
  } else
    msg = `${key} isn't in the Warranty Tool yet. Log it after texting so nobody contacts them twice.`;
  els.wtHint.textContent = msg;
  els.wtHint.dataset.tone = tone;
  els.wtHint.hidden = !msg;
  const savedStatus = e && !e.hidden ? e.status : "texted";
  // Refresh saved statuses without replacing an unsaved dropdown choice.
  if (key !== warrantyStatusOrder || els.wtStatus.value === warrantySavedStatus)
    els.wtStatus.value = savedStatus;
  warrantyStatusOrder = key;
  warrantySavedStatus = savedStatus;
  els.wtLog.disabled = !wtAuth || !key;
  els.wtLog.textContent = unified
    ? "Save warranty status"
    : e && !e.hidden ? "Update Warranty Tool" : "Log in Warranty Tool";
}

// Everything the Warranty Tool keeps for an order. Blank fields are left out so they
// never wipe details already saved there (e.g. scraped from Shopify).
function warrantyDetails() {
  const l = current || {};
  const d = {
    phone: l.phone ? prettyPhone(l.phone) : "",
    email: String(l.email || "").trim(),
    customer: titleCase(l.customer),
    systemPrice: String(l.systemPrice || "").replace(/[^0-9.]/g, ""),
    watercooled: l.watercooled ? "yes" : "",
    systems: l.systems || "",
  };
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v));
}

async function logWarranty() {
  if (!current || current.type !== "warranty") {
    showError("Only warranty leads can be saved in the Warranty team log.");
    return false;
  }
  const key = orderKey(current?.order);
  if (!key) return false;
  const e = wtItems[key];
  if (
    e &&
    !e.hidden &&
    e.uid !== wtAuth?.uid &&
    !confirm(
      `${titleCase(e.by)} already contacted this order. Change its status? It stays under ${titleCase(e.by)}'s name.`,
    )
  )
    return false;
  const savedLead = current;
  els.wtLog.disabled = true;
  const r = await send("upsert", {
    ...warrantyDetails(),
    order: current.order.trim().toUpperCase(),
    status: els.wtStatus.value,
    expect: e ? e.updateTime || "" : null,
  });
  els.wtLog.disabled = false;
  showError(r.ok ? "" : r.error);
  if (r.ok && unified) {
    if (current === savedLead) {
      document.getElementById("form").reset();
      els.order.focus();
    }
  }
  return r.ok;
}

// Warranty and outreach now share the same form.
async function openWarranty() {
  els.order.scrollIntoView({ block: "center", behavior: "smooth" });
  els.order.focus();
}

// ---------- scripts ----------
const TABS = [
  ["text", "Text"],
  ["email", "Email"],
];
function renderScriptTabs() {
  els.scriptTabs.replaceChildren(
    ...TABS.map(([id, label]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tab";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(scriptTab === id));
      const s = document.createElement("span");
      s.className = "tab-name";
      s.textContent = label;
      b.append(s);
      b.addEventListener("click", () => {
        scriptTab = id;
        renderScriptTabs();
        renderScript();
      });
      return b;
    }),
  );
}

function select(options, value, onChange, label) {
  const s = document.createElement("select");
  s.className = "chip";
  s.setAttribute("aria-label", label);
  for (const [v, t] of options) s.append(new Option(t, v));
  s.value = value;
  s.addEventListener("change", () => onChange(s.value));
  return s;
}

function msgBlock(text, cls = "msg") {
  const p = document.createElement("pre");
  p.className = cls;
  p.textContent = text;
  return p;
}

function wordingKey(id = "") {
  return `${current?.type || "other"}:${scriptTab}:${id}`;
}

function scriptContext(key) {
  return { ...ctx(), variant: current?.wordings?.[key] ?? 0 };
}

function setWordings(keys, variant) {
  if (!current) return;
  current.wordings = { ...current.wordings };
  for (const key of keys) {
    const old = current.wordings[key] ?? 0;
    current.wordings[key] =
      variant ??
      (old + 1 + Math.floor(Math.random() * (WORDINGS.length - 1))) %
        WORDINGS.length;
  }
  save(true);
  renderScript();
}

function anotherWording(keys, label = "Try another") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "ghost small";
  b.textContent = label;
  b.title = "Use different wording without changing the purpose";
  b.disabled = !current;
  b.addEventListener("click", () => setWordings(keys));
  return b;
}

function wordingControls(keys) {
  const variants = keys.map((key) => scriptContext(key).variant);
  const mixed = new Set(variants).size > 1;
  const options = WORDINGS.map((label, i) => [String(i), label]);
  if (mixed) options.unshift(["", "Mixed wording"]);
  const picker = select(
    options,
    mixed ? "" : String(variants[0]),
    (value) => {
      if (value !== "") setWordings(keys, Number(value));
    },
    "Message wording",
  );
  picker.disabled = !current;
  return [picker, anotherWording(keys)];
}

function renderScript() {
  const type = current?.type || "other";
  const c = ctx();
  const tools = [];
  const out = [];

  if (scriptTab === "text") {
    const list = TEXTS[type] || TEXTS.other;
    const t = list.find((x) => x.id === textId) || list[0];
    const key = wordingKey(t.id);
    const body = t.body(scriptContext(key));
    tools.push(
      select(
        list.map((x) => [x.id, x.name]),
        t.id,
        (v) => {
          textId = v;
          renderScript();
        },
        "Text message",
      ),
    );
    tools.push(...wordingControls([key]));
    tools.push(copyButton(body, "Copy text", "ghost small"));
    out.push(msgBlock(body));
  } else if (scriptTab === "email") {
    const list = EMAILS[type] || EMAILS.other;
    const m = list.find((x) => x.id === emailId) || list[0];
    const key = wordingKey(m.id);
    const context = scriptContext(key);
    const subject = m.subject(context);
    const body = m.body(context);
    tools.push(
      select(
        list.map((x) => [x.id, x.name]),
        m.id,
        (v) => {
          emailId = v;
          renderScript();
        },
        "Email",
      ),
    );
    tools.push(...wordingControls([key]));
    tools.push(
      copyButton(subject, "Copy subject", "ghost small"),
      copyButton(body, "Copy body", "ghost small"),
    );
    if (current?.email) {
      const a = document.createElement("a");
      a.className = "ghost small";
      a.style.cssText =
        "display:inline-flex;align-items:center;text-decoration:none";
      a.href = `mailto:${encodeURIComponent(current.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      a.target = "_blank";
      a.textContent = "Open in mail ↗";
      tools.push(a);
    }
    out.push(msgBlock(subject, "msg subject"), msgBlock(body));
  }
  const quotesWarranty = type === "warranty";
  if (!c.priceKnown && quotesWarranty) {
    const t = document.createElement("p");
    t.className = "tip";
    t.textContent =
      "Add the system price (or tick Watercooled) to fill in the warranty prices.";
    out.unshift(t);
  }
  if (!repName()) {
    const t = document.createElement("p");
    t.className = "tip";
    t.textContent = "Add your name in Message settings to personalize the templates.";
    out.unshift(t);
  }
  els.scriptTools.replaceChildren(...tools);
  els.script.replaceChildren(...out);
}

// ---------- events ----------
function ensureCustomerLead() {
  if (!unified || current) return;
  const fields = customer.readCustomer();
  if (!Object.entries(fields).some(([key, value]) => key !== "watercooled" && value.trim())) return;
  const lead = { ...blankLead(`WT-${crypto.randomUUID()}`), ...fields, type: "warranty" };
  show(lead);
}

function showShopifyOrder(data) {
  if (!unified || !data?.order || !/^https:\/\/admin\.shopify\.com\/store\/[^/]+\/orders\/\d+(?:[?#]|$)/.test(data.url || "")) return;
  const sameOrder = current?.type === "warranty" && orderKey(current.order) === orderKey(data.order);
  const previous = shopifyPage;
  shopifyPage = data;
  const lead = sameOrder ? { ...current } : {
    ...blankLead(`WT-SHOPIFY-${orderKey(data.order)}`),
    type: "warranty",
    order: data.order,
    url: data.url,
  };
  for (const field of ["customer", "phone", "email", "systemPrice", "watercooled", "systems"]) {
    const value = field === "watercooled" ? data[field] === "yes" : data[field] || "";
    const old = field === "watercooled" ? previous?.[field] === "yes" : previous?.[field] || "";
    if (!sameOrder || !lead[field] || (previous?.order === data.order && lead[field] === old))
      lead[field] = value;
  }
  if (sameOrder) {
    current = lead;
    fillForm();
    renderAll();
    save(true);
  } else if (show(lead, false, true)) save(true);
}

for (const f of FIELDS) {
  els[f].addEventListener("input", () => {
    ensureCustomerLead();
    if (!current) return;
    current[f] = els[f].value;
    if (f === "systemPrice") current.systems = "manual";
    save();
    renderWarranty();
    renderScript();
  });
}
els.customer.addEventListener("blur", () => {
  if (!current) return;
  els.customer.value = current.customer = titleCase(els.customer.value);
  if (unified) customer.customerChanged();
  save();
});
els.phone.addEventListener("blur", () => {
  if (!current || !els.phone.value.trim()) return;
  els.phone.value = current.phone = prettyPhone(els.phone.value);
  if (unified) customer.customerChanged();
  save();
});
if (dashboard && !unified) dashboard.addPhoneCopy(els.phone, showError);
if (unified) {
  document.addEventListener("dashboard:save-warranty", logWarranty);
  document.getElementById("form").addEventListener("reset", () => {
    if (current) save(true);
    queueMicrotask(() => {
      show(null);
      customer.customerChanged();
      chrome.storage.local.remove(CURRENT_KEY).catch((error) => showError(error.message));
    });
  });
}
els.watercooled.addEventListener("change", () => {
  ensureCustomerLead();
  if (!current) return;
  current.watercooled = els.watercooled.checked;
  current.systems = "manual";
  save();
  renderScript();
});
els.type.addEventListener("change", () => {
  if (!current) return;
  current.type = els.type.value;
  textId = emailId = "";
  save();
  applyTypeVisibility();
  renderAll();
});
els.readPage.addEventListener("click", async () => {
  const r = await toDash({ type: "plScrape" });
  if (!r?.ok) return showError(r?.error || "Couldn't read Dash.");
  page = r.data;
  if (!page?.leadId)
    return showError("Open a lead on the Dash Pound list first.");
  if (show(fromPage(page, true), true)) save(true);
});
els.wtLog.addEventListener("click", logWarranty);
els.wtOpen.addEventListener("click", openWarranty);
for (const k of ["rep", "callback"]) {
  els[k].addEventListener("input", () => {
    settings[k] = els[k].value.trim();
    chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    renderHeader();
    renderScript();
  });
}
els.repLabel.addEventListener("click", () => {
  const d = els.rep.closest(".settings");
  d.open = true;
  els.rep.focus();
});

// New scrapes from Dash switch the panel to that lead and fill blank fields.
chrome.storage.onChanged.addListener((c, area) => {
  if (area !== "local") return;
  if (c[SHOPIFY_PAGE_KEY]) showShopifyOrder(c[SHOPIFY_PAGE_KEY].newValue);
  if (c[PAGE_KEY]) {
    page = c[PAGE_KEY].newValue || null;
    if (page?.leadId && page.leadId !== current?.id) {
      if (current) save(true);
      if (show(fromPage(page, false), false, unified)) save(true);
    } else if (page?.leadId && current) {
      const merged = mergeScrape(current, page, false);
      const changed =
        FIELDS.some((f) => merged[f] !== current[f]) ||
        merged.type !== current.type;
      if (changed) {
        if (!unified || !customer.draftConflicts(customer.readCustomer(), merged)) {
          current = merged;
          fillForm();
          save();
          renderAll();
        } else {
          showError(unified
            ? "Dash has updated customer details. Your edited fields were kept; review them against Dash before continuing."
            : "Dash has updated customer details. Your draft was kept; use Read page to load them.");
        }
      }
    }
  }
  if (c[WT_AUTH_KEY] || c[WT_CACHE_KEY]) {
    wtAuth = c[WT_AUTH_KEY] ? c[WT_AUTH_KEY].newValue || null : wtAuth;
    if (c[WT_CACHE_KEY]) wtItems = c[WT_CACHE_KEY].newValue?.items || {};
    renderHeader();
    renderWarranty();
  }
});

// ---------- init ----------
export const ready = (async () => {
  els.type.replaceChildren(
    ...Object.entries(LEAD_TYPES).map(([v, t]) => new Option(t, v)),
  );
  els.wtStatus.replaceChildren(
    ...WT_STATUSES.map(([v, t]) => new Option(t, v)),
  );

  const d = await chrome.storage.local.get([
    PAGE_KEY,
    LEADS_KEY,
    CURRENT_KEY,
    SETTINGS_KEY,
    WT_AUTH_KEY,
    WT_CACHE_KEY,
    REMOVED_KEY,
    SHOPIFY_PAGE_KEY,
  ]);
  settings = { ...settings, ...d[SETTINGS_KEY] };
  els.rep.value = settings.rep;
  els.callback.value = settings.callback;
  wtAuth = d[WT_AUTH_KEY] || null;
  wtItems = d[WT_CACHE_KEY]?.items || {};
  page = d[PAGE_KEY] || null;
  removedLeads = new Set(d[REMOVED_KEY] || []);
  if (unified) {
    for (const lead of Object.values(d[LEADS_KEY] || {})) {
      if (lead.status === "dead") removedLeads.add(lead.id);
    }
    if (removedLeads.has(d[CURRENT_KEY])) {
      document.getElementById("form").reset();
      customer.customerChanged();
    }
  }
  // Keep existing local drafts and history intact; lead tracking is handled on Dash.
  leads = d[LEADS_KEY] || {};

  hasWarrantyTool = true;

  const id = page?.leadId || d[CURRENT_KEY];
  const saved = leads[d[CURRENT_KEY]];
  if (unified && saved && !customer.draftConflicts(customer.readCustomer(), saved)) show({ ...saved });
  else if (page?.leadId) show(fromPage(page, false));
  else if (id && leads[id]) show({ ...leads[id] });
  else show(null);
  if (unified && !current) ensureCustomerLead();
  if (unified && d[SHOPIFY_PAGE_KEY]) {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true, url: "https://admin.shopify.com/*" });
    if (tabs.some((tab) => tab.url === d[SHOPIFY_PAGE_KEY].url)) showShopifyOrder(d[SHOPIFY_PAGE_KEY]);
  }
  if (current) save(true);
  if (unified) {
    const tabs = await chrome.tabs.query({
      active: true, lastFocusedWindow: true,
      url: ["https://dash.metapcs.com/*", "https://metapcs-platform.web.app/*"],
    });
    if (tabs[0]) {
      try {
        const r = await sendDashMessage(tabs[0].id, { type: "plScrape" });
        if (!r?.ok) throw new Error(r?.error || "Dash did not respond.");
        if (r.data?.leadId && !removedLeads.has(r.data.leadId)) {
          if (current) save(true);
          page = r.data;
          if (show(fromPage(page, false), false, true)) save(true);
        }
      } catch (error) {
        showError(`Automatic Dash reading failed. Check Plugin Manager's site access for Dash in chrome://extensions: ${error.message}`);
      }
    }
  }
})();
