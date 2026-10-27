import { sendDashMessage } from "./lib/dash.js";
import { belongsInLeadLog } from "./lib/lead-policy.js";
import {
  EMAILS,
  LEAD_TYPES,
  OBJECTIONS,
  PERSONAS,
  TEXTS,
  WORDINGS,
  callScript,
  voicemail,
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
const CLOUD_KEY = "plLeadCloud";
const REMOVED_KEY = "plLeadRemoved";
// Shared with the Warranty Upsell Tracker when both run inside Plugin Manager (same extension storage).
const WT_AUTH_KEY = "wtAuth";
const WT_CACHE_KEY = "wtContacts";
const WT_DRAFT_KEY = "wtDraft";

const STATUSES = [
  "new",
  "attempted",
  "contacted",
  "callback",
  "sold",
  "declined",
  "dead",
];
const STATUS_LABEL = {
  new: "New",
  attempted: "Attempted",
  contacted: "Contacted",
  callback: "Callback set",
  sold: "Sold",
  declined: "Declined",
  dead: "Dead lead",
};
const STEPS = [
  { id: "called", label: "Called", dash: "Called" },
  { id: "lvm", label: "LVM", dash: "LVM" },
  { id: "texted", label: "Texted", dash: "Texted" },
  { id: "emailed", label: "Emailed", dash: "Emailed" },
];
const OUTCOMES = [
  ["", "Choose an outcome"],
  ["noanswer", "No answer"],
  ["spoke", "Spoke, interested"],
  ["callback", "Callback scheduled"],
  ["sold", "Sold"],
  ["declined", "Not interested"],
  ["wrong", "Wrong number"],
];
const OUTCOME_STATUS = {
  spoke: "contacted",
  callback: "callback",
  sold: "sold",
  declined: "declined",
  wrong: "dead",
};
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
    "count",
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
    "tickDash",
    "steps",
    "cttTip",
    "scriptTabs",
    "scriptTools",
    "script",
    "outcome",
    "note",
    "noteReset",
    "noteCopy",
    "noteFill",
    "logTabs",
    "nToday",
    "nAll",
    "search",
    "list",
    "empty",
    "rep",
    "callback",
    "export",
    "clearOld",
  ].map((id) => [id, $(id)]),
);

let leads = {};
let removedLeads = new Set();
let cloudIds = new Set();
let syncing = false;
let current = null; // the lead shown in the form
let page = null; // last scrape from Dash
let settings = { rep: "", callback: "" };
let wtAuth = null;
let wtItems = {};
let warrantyStatusOrder = null;
let warrantySavedStatus = "texted";
let hasWarrantyTool = false;
let scriptTab = "call";
let textId = "";
let emailId = "";
let logFilter = "today";
let noteDirty = false;
const doneSay = new Set();

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
const money = (v) => {
  const n = parseFloat(String(v || "").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return "";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
};
const fmtTime = (ts) =>
  new Date(ts).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
const startOfDay = (ts) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const isToday = (ts) => !!ts && startOfDay(ts) === startOfDay(Date.now());
function dayLabel(ts) {
  const diff = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
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
const lastTouch = (l) => Math.max(0, ...Object.values(l.steps || {}));
const worked = (l) => lastTouch(l) > 0 || (l.status && l.status !== "new");
const nonWarranty = belongsInLeadLog;

function syncStatus(message) {
  if (unified) document.getElementById("pl-leadSync").textContent = message;
}

function syncFailure(message) {
  syncStatus(/permission|PERMISSION_DENIED/i.test(message)
    ? "Lead work is saved locally. A Firebase project administrator must publish Dashboard-Tool/firestore.rules for the dashboardLeads collection, then click Retry Lead sync. Signing in again or Chrome site access will not fix missing Firestore rules."
    : `Lead log is local; Firestore sync failed: ${message}`);
}

async function syncLead(lead) {
  if (!unified || !nonWarranty(lead) || !/^WL-\d+$/.test(lead.id)) return true;
  const r = await send("dashboardLeadSave", lead);
  if (r.ok) syncStatus("Lead log synced. Customer details stay on this device.");
  else syncFailure(r.error);
  return r.ok;
}

async function refreshLeadLog() {
  if (!unified || syncing) return false;
  syncing = true;
  try {
    for (const id of removedLeads) {
      if (!/^WL-\d+$/.test(id)) continue;
      const deletion = await send("dashboardLeadRemove", { id });
      if (!deletion.ok) throw new Error(deletion.error);
    }
    const r = await send("dashboardLeadRefresh");
    const stored = await chrome.storage.local.get([CLOUD_KEY, REMOVED_KEY]);
    removedLeads = new Set(stored[REMOVED_KEY] || []);
    const shared = stored[CLOUD_KEY]?.items || {};
    for (const id of cloudIds) {
      if (!shared[id] && nonWarranty(leads[id])) {
        delete leads[id];
        removedLeads.add(id);
        if (current?.id === id) {
          clearTimeout(saveTimer);
          current = null;
          document.getElementById("form").reset();
          customer.customerChanged();
          await chrome.storage.local.remove(CURRENT_KEY);
          fillForm();
        }
      }
    }
    for (const record of Object.values(shared)) {
      if (removedLeads.has(record.id)) continue;
      if (leads[record.id]?.type === "warranty") {
        const deletion = await send("dashboardLeadRemove", { id: record.id });
        if (!deletion.ok) throw new Error(deletion.error);
        continue;
      }
      const local = current?.id === record.id ? current : leads[record.id] || blankLead(record.id);
      leads[record.id] = { ...local, ...record };
      if (current?.id === record.id) {
        current = leads[record.id];
        els.type.value = current.type;
        applyTypeVisibility();
        renderSteps();
        renderWarranty();
      }
    }
    cloudIds = new Set(Object.keys(shared));
    await chrome.storage.local.set({ [LEADS_KEY]: leads, [REMOVED_KEY]: [...removedLeads] });
    renderHeader();
    renderLog();
    if (!r.ok) throw new Error(r.error);
    syncStatus("Lead log synced. Customer details stay on this device.");
    for (const lead of Object.values(leads).filter(nonWarranty)) {
      if (!shared[lead.id] && !await syncLead(lead)) return false;
    }
    return true;
  } catch (error) {
    syncFailure(error.message);
    return false;
  } finally {
    syncing = false;
  }
}

async function removeLead(id) {
  clearTimeout(saveTimer);
  removedLeads.add(id);
  delete leads[id];
  if (current?.id === id) {
    current = null;
    if (unified) {
      document.getElementById("form").reset();
      customer.customerChanged();
    }
    await chrome.storage.local.remove(CURRENT_KEY);
    fillForm();
  }
  await chrome.storage.local.set({ [LEADS_KEY]: leads, [REMOVED_KEY]: [...removedLeads] });
  renderAll();
  if (unified && /^WL-\d+$/.test(id)) {
    const r = await send("dashboardLeadRemove", { id });
    syncStatus(r.ok ? "Lead removed locally and from Firestore. Dash is unchanged." : `Lead removed locally; Firestore deletion needs retry: ${r.error}`);
  }
}

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
function copyButton(getText, label = "Copy", cls = "copy", phone = false) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.textContent = label;
  b.title = phone && dashboard ? "Copy number and prepare a text if RingCentral is open" : "Click to copy";
  b.addEventListener("click", async () => {
    try {
      const text = typeof getText === "function" ? getText() : getText;
      await flash(b, text);
      if (phone && dashboard) await dashboard.prepareText(text);
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
  const w = warrantyPrices(l.systemPrice, l.watercooled);
  return {
    first: first || "there",
    rep: repName() || "{your name}",
    callback: prettyPhone(settings.callback),
    amount: money(l.amount),
    lender: (l.lender || "").trim(),
    order: (l.order || "").trim().toUpperCase(),
    two: w.two,
    three: w.three,
    priceKnown: w.known,
    persona: l.persona || (l.type === "financing" ? "financing" : ""),
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
    persona: "",
    steps: {},
    status: "new",
    outcome: "",
    note: "",
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
function save(now = false, sync = true) {
  if (!current) return;
  current.updatedAt = Date.now();
  leads[current.id] = current;
  clearTimeout(saveTimer);
  const currentId = current.id;
  const snapshot = structuredClone(current);
  const write = async () => {
    saveTimer = 0;
    try {
      if (unified && snapshot.status === "dead") {
        await removeLead(snapshot.id);
        return;
      }
      await chrome.storage.local.set({ [LEADS_KEY]: leads, [CURRENT_KEY]: currentId });
      if (sync) await syncLead(snapshot);
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
      showError("A Dash lead is available. Your customer draft was kept; select the lead from the Lead log to replace it.");
      return false;
    }
    if (!confirm("Replace the shared customer form with this Dash lead? Your saved Warranty records will not change.")) return false;
  }
  current = lead;
  doneSay.clear();
  noteDirty = false;
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
  els.outcome.value = l?.outcome || "";
  els.note.value = l?.note || "";
  noteDirty = !!l?.note;
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
  // renderClaim();
  renderSteps();
  renderWarranty();
  renderScriptTabs();
  renderScript();
  renderNote();
  renderLog();
}

function renderHeader() {
  const today = Object.values(leads).filter((l) =>
    isToday(lastTouch(l)),
  ).length;
  els.count.textContent = `${today} worked today`;
  els.repLabel.textContent = repName() || "set your name ↓";
}



function renderSteps() {
  if (unified) {
    els.tickDash.disabled = !current?.url;
    els.tickDash.title = current?.url ? "Also mark this step on the Dash lead" : "Read a Dash lead first; manual customer steps are kept locally.";
    els.noteFill.disabled = !current?.url;
    const dropdown = document.getElementById("pl-stepSelect");
    dropdown.disabled = !current;
    dropdown.replaceChildren(new Option("Log an outreach step...", ""),
      ...STEPS.map((step) => new Option(
        `${current?.steps?.[step.id] ? "Undo" : "Mark"} ${step.label}${current?.steps?.[step.id] ? ` (${fmtTime(current.steps[step.id])})` : ""}`,
        step.id,
      )));
  }
  els.steps.replaceChildren(
    ...STEPS.map((s) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "step";
      b.disabled = !current;
      const ts = current?.steps?.[s.id];
      b.setAttribute("aria-pressed", String(!!ts));
      const small = document.createElement("small");
      small.textContent = ts ? fmtTime(ts) : "";
      b.append(s.label, small);
      b.addEventListener("click", () => toggleStep(s));
      return b;
    }),
  );
  const st = current?.steps || {};
  let tip =
    "Start with a call. If they don't answer, leave a voicemail and send a text. Add your attempts to the ticket.";
  if (st.called && !st.lvm && !st.texted)
    tip = "No answer? Leave a voicemail, then send a text.";
  else if (st.called && st.lvm && !st.texted)
    tip =
      "Send a text to follow up. Add it to the activity note so the team can see it.";
  else if (st.texted && !st.emailed && current?.email)
    tip =
      "You can email them too. Post the activity note so the team can see your attempts.";
  else if (Object.keys(st).length)
    tip =
      "Post the activity note on Dash to count this attempt toward Claim 5.";
  els.cttTip.textContent = tip;
}

async function toggleStep(s) {
  if (!current) return;
  current.steps = { ...current.steps };
  const on = !current.steps[s.id];
  if (on) current.steps[s.id] = Date.now();
  else delete current.steps[s.id];
  if (on && current.status === "new") current.status = "attempted";
  save(true);
  renderAll();
  if (on && els.tickDash.checked && !els.tickDash.disabled) {
    const r = await toDash({ type: "plTick", step: s.dash });
    if (!r?.ok) showError(r?.error || "");
    else if (!r.found)
      showError(
        `Couldn't find the "${s.dash}" box on Dash. Please check it there.`,
      );
  }
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
  els.wtLog.disabled = true;
  const r = await send("upsert", {
    ...warrantyDetails(),
    order: current.order.trim().toUpperCase(),
    status: els.wtStatus.value,
    expect: e ? e.updateTime || "" : null,
  });
  els.wtLog.disabled = false;
  showError(r.ok ? "" : r.error);
  if (r.ok && unified) syncStatus("Warranty status saved in the Warranty team log.");
  if (r.ok && unified) showError("");
  return r.ok;
}

// Customer accepted the warranty: log it as Agreed with every detail we have.
async function acceptWarranty() {
  if (!hasWarrantyTool || current?.type !== "warranty") return;
  const key = orderKey(current.order);
  if (!wtAuth)
    return showError(
      "Sign in on the Warranty Upsell Tracker tab to log this sale as Agreed.",
    );
  if (!key)
    return showError(
      "Add the MPC order number so this sale can be logged as Agreed in the Warranty Tool.",
    );
  const e = wtItems[key];
  // Paid is further along than Agreed; keep it.
  els.wtStatus.value =
    e && !e.hidden && e.status === "paid" ? "paid" : "agreed";
  if (await logWarranty()) {
    els.wtHint.textContent = `Logged ${key} as ${els.wtStatus.value === "paid" ? "Paid" : "Agreed"} in the Warranty Tool with the customer's details.`;
    els.wtHint.dataset.tone = "ok";
    els.wtHint.hidden = false;
  }
}

// Warranty and outreach now share the same form.
async function openWarranty() {
  els.order.scrollIntoView({ block: "center", behavior: "smooth" });
  els.order.focus();
}

// ---------- scripts ----------
const TABS = [
  ["call", "Call"],
  ["vm", "Voicemail"],
  ["text", "Text"],
  ["email", "Email"],
  ["obj", "Objections"],
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

  if (scriptTab === "call") {
    if (type === "warranty")
      tools.push(
        select(
          PERSONAS.map((p) => [p.id, p.name]),
          c.persona,
          (v) => {
            if (!current) return;
            current.persona = v;
            save();
            renderScript();
          },
          "Customer type",
        ),
      );
    const steps = callScript(type, c);
    tools.push(...wordingControls(steps.map((_, i) => wordingKey(i))));
    steps.forEach((_, i) => {
      const key = wordingKey(i);
      const step = callScript(type, scriptContext(key))[i];
      const box = document.createElement("div");
      box.className = "say-step";
      box.classList.toggle("done", doneSay.has(i));
      const h = document.createElement("h3");
      h.textContent = step.title;
      h.title = "Click when you've said this";
      h.style.cursor = "pointer";
      h.addEventListener("click", () => {
        doneSay.has(i) ? doneSay.delete(i) : doneSay.add(i);
        box.classList.toggle("done", doneSay.has(i));
      });
      const p = document.createElement("p");
      p.textContent = `“${step.say}”`;
      const actions = document.createElement("div");
      actions.className = "say-actions";
      actions.append(anotherWording([key]), copyButton(step.say));
      box.append(h, actions, p);
      if (step.tip) {
        const t = document.createElement("p");
        t.className = "tip";
        t.textContent = step.tip;
        box.append(t);
      }
      out.push(box);
    });
  } else if (scriptTab === "vm") {
    const key = wordingKey();
    const text = voicemail(type, scriptContext(key));
    tools.push(...wordingControls([key]));
    tools.push(copyButton(text, "Copy voicemail", "ghost small"));
    out.push(msgBlock(text));
  } else if (scriptTab === "text") {
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
  } else {
    const objections = OBJECTIONS[type] || OBJECTIONS.other;
    tools.push(...wordingControls(objections.map((_, i) => wordingKey(i))));
    for (const [i, o] of objections.entries()) {
      const key = wordingKey(i);
      const box = document.createElement("div");
      box.className = "say-step";
      const h = document.createElement("h3");
      h.textContent = `“${o.q}”`;
      const text = o.a(scriptContext(key));
      const p = document.createElement("p");
      p.textContent = text;
      const actions = document.createElement("div");
      actions.className = "say-actions";
      actions.append(anotherWording([key]), copyButton(text));
      box.append(h, actions, p);
      out.push(box);
    }
  }
  const quotesWarranty =
    type === "warranty"
      ? scriptTab !== "obj"
      : type === "financing" && (scriptTab === "call" || scriptTab === "obj");
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
    t.textContent = "Add your name in Settings to personalize the scripts.";
    out.unshift(t);
  }
  els.scriptTools.replaceChildren(...tools);
  els.script.replaceChildren(...out);
}

// ---------- activity note ----------
function buildNote() {
  const l = current;
  if (!l) return "";
  const st = l.steps || {};
  const parts = [];
  if (st.called)
    parts.push(
      l.outcome === "noanswer" || st.lvm ? "Called, no answer" : "Called",
    );
  if (st.lvm) parts.push("LVM");
  if (st.texted) parts.push("Texted");
  if (st.emailed) parts.push("Emailed");
  const when = new Date().toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const outcome = l.outcome && OUTCOMES.find(([v]) => v === l.outcome)?.[1];
  let s = `CTT ${when}: ${parts.join(", ") || "Attempted contact"}.`;
  if (outcome && l.outcome !== "noanswer") s += ` ${outcome}.`;
  if (st.lvm || st.texted || st.emailed)
    s += " Asked for a good time to call back.";
  if (l.type === "warranty" && l.order)
    s += ` Warranty offered for ${l.order.toUpperCase()}.`;
  if (l.type === "abandoned") s += " Abandoned-cart follow-up.";
  s += " Next: ___";
  return `${s}\n${repName() || "{your name}"}`;
}
function renderNote() {
  if (!noteDirty) els.note.value = buildNote();
}

// ---------- log ----------
function renderLog() {
  const all = Object.values(leads).filter((lead) => unified ? nonWarranty(lead) : worked(lead));
  const today = all.filter((l) => isToday(lastTouch(l) || l.updatedAt));
  els.nToday.textContent = today.length;
  els.nAll.textContent = all.length;
  for (const b of els.logTabs.querySelectorAll(".tab"))
    b.setAttribute("aria-selected", String(b.dataset.filter === logFilter));

  const q = els.search.value.trim().toLowerCase();
  const qd = digits(q);
  const shown = (logFilter === "today" ? today : all)
    .filter(
      (l) =>
        !q ||
        (qd && digits(l.phone).includes(qd)) ||
        [l.customer, l.order, l.id, l.lender].some((v) =>
          String(v || "")
            .toLowerCase()
            .includes(q),
        ),
    )
    .sort(
      (a, b) => (lastTouch(b) || b.updatedAt) - (lastTouch(a) || a.updatedAt),
    );

  els.list.replaceChildren();
  els.empty.hidden = shown.length > 0;
  els.empty.textContent = all.length
    ? "No matches."
    : "No leads worked yet. Viewing a Dash lead does not claim it or add it here. Log an outreach step or outcome to add it.";

  let lastDay = null;
  for (const l of shown) {
    const ts = lastTouch(l) || l.updatedAt;
    const day = dayLabel(ts);
    if (day !== lastDay) {
      const h = document.createElement("div");
      h.className = "day";
      h.textContent = day;
      els.list.append(h);
      lastDay = day;
    }
    const row = document.createElement("div");
    row.className = "item";
    row.classList.toggle("current", l.id === current?.id);

    const title = document.createElement(unified ? "button" : "div");
    if (unified) title.type = "button";
    title.className = "phone";
    if (unified) title.classList.add("link");
    title.textContent = titleCase(l.customer) || l.id;
    title.title = "Load this lead";
    title.addEventListener("click", () => {
      if (current) save(true, !!saveTimer);
      if (show({ ...l }, true)) save(true, false);
    });

    const meta = document.createElement("div");
    meta.className = "meta";
    const type = document.createElement("span");
    type.className = "by";
    type.textContent = LEAD_TYPES[l.type] || "Lead";
    const id = document.createElement("span");
    id.textContent = unified && l.id.startsWith("WT-") ? "Manual" : l.id;
    meta.append(type, id);
    if (l.order) {
      const o = dashboard
        ? dashboard.orderButton(l.order, showError)
        : document.createElement("span");
      o.textContent = l.order;
      meta.append(o);
    }
    if (l.amount) {
      const a = document.createElement("span");
      a.textContent = money(l.amount);
      meta.append(a);
    }
    if (l.phone)
      meta.append(copyButton(prettyPhone(l.phone), prettyPhone(l.phone), "copy", true));
    const dots = document.createElement("span");
    dots.className = "dots";
    dots.title = STEPS.map(
      (s) => `${s.label}: ${l.steps?.[s.id] ? fmtTime(l.steps[s.id]) : "-"}`,
    ).join("\n");
    dots.textContent = STEPS.map((s) => (l.steps?.[s.id] ? "●" : "○")).join("");
    meta.append(dots);

    const side = document.createElement("div");
    side.className = "side";
    const chip = select(
      STATUSES.map((s) => [s, STATUS_LABEL[s]]),
      l.status || "new",
      async (v) => {
        const target = l.id === current?.id ? current : leads[l.id];
        if (unified && v === "dead") {
          await removeLead(l.id);
          return;
        }
        target.status = v;
        chip.dataset.status = v;
        leads[l.id] = { ...target, updatedAt: Date.now() };
        await chrome.storage.local.set({ [LEADS_KEY]: leads });
        await syncLead(leads[l.id]);
        renderLog();
      },
      `Status for ${l.id}`,
    );
    chip.dataset.status = l.status || "new";
    side.append(chip);
    if (l.url) {
      const open = document.createElement("button");
      open.type = "button";
      open.className = "del";
      open.textContent = "↗";
      open.title = "Open on Dash";
      open.addEventListener("click", () => chrome.tabs.create({ url: l.url }));
      side.append(open);
    }
    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.textContent = "×";
    del.title = "Remove from this log";
    del.addEventListener("click", async () => {
      if (!confirm(`Remove ${l.id} from your log? (Nothing changes on Dash.)`))
        return;
      if (unified) {
        await removeLead(l.id);
        return;
      }
      delete leads[l.id];
      if (current?.id === l.id)
        current = { ...blankLead(l.id), ...l, steps: {}, status: "new" };
      chrome.storage.local.set({ [LEADS_KEY]: leads });
      renderAll();
    });
    side.append(del);
    row.append(title, meta, side);
    els.list.append(row);
  }
}

// ---------- events ----------
function ensureCustomerLead() {
  if (!unified || current) return;
  const fields = customer.readCustomer();
  if (!Object.entries(fields).some(([key, value]) => key !== "watercooled" && value.trim())) return;
  const lead = { ...blankLead(`WT-${crypto.randomUUID()}`), ...fields, type: "warranty" };
  show(lead);
}

for (const f of FIELDS) {
  els[f].addEventListener("input", () => {
    ensureCustomerLead();
    if (!current) return;
    current[f] = els[f].value;
    save();
    renderWarranty();
    renderScript();
    renderNote();
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
  document.getElementById("pl-stepSelect").addEventListener("change", (event) => {
    const step = STEPS.find((value) => value.id === event.target.value);
    if (step) toggleStep(step);
  });
  document.getElementById("pl-leadRetry").addEventListener("click", async () => {
    if (!await refreshLeadLog()) return;
    for (const lead of Object.values(leads).filter(nonWarranty)) {
      if (!await syncLead(lead)) return;
    }
  });
  document.getElementById("form").addEventListener("reset", () => {
    if (current) save(true);
    queueMicrotask(() => {
      show(null);
      chrome.storage.local.remove(CURRENT_KEY).catch((error) => showError(error.message));
    });
  });
}
els.watercooled.addEventListener("change", () => {
  ensureCustomerLead();
  if (!current) return;
  current.watercooled = els.watercooled.checked;
  save();
  renderScript();
});
els.type.addEventListener("change", () => {
  if (!current) return;
  const previousType = current.type;
  current.type = els.type.value;
  if (unified && previousType !== "warranty" && current.type === "warranty" && /^WL-\d+$/.test(current.id)) {
    send("dashboardLeadRemove", { id: current.id }).then((r) => {
      if (!r.ok) syncStatus(`Lead type changed locally; remove its old Lead entry with Retry Lead sync: ${r.error}`);
    });
  }
  textId = emailId = "";
  save();
  applyTypeVisibility();
  renderAll();
});
els.outcome.addEventListener("change", () => {
  if (!current) return;
  current.outcome = els.outcome.value;
  const st = OUTCOME_STATUS[current.outcome];
  if (st) current.status = st;
  else if (current.status === "new") current.status = "attempted";
  if (unified && current.status === "dead") {
    removeLead(current.id).catch((error) => showError(error.message));
    return;
  }
  save(true);
  renderNote();
  renderLog();
  if (current.outcome === "sold") acceptWarranty();
});
els.note.addEventListener("input", () => {
  noteDirty = true;
  if (current) {
    current.note = els.note.value;
    save();
  }
});
els.noteReset.addEventListener("click", () => {
  noteDirty = false;
  if (current) {
    current.note = "";
    save();
  }
  renderNote();
});
els.noteCopy.addEventListener("click", () =>
  flash(els.noteCopy, els.note.value).catch(() => {}),
);
els.noteFill.addEventListener("click", async () => {
  const r = await toDash({ type: "plFillNote", text: els.note.value });
  if (!r?.ok) return showError(r?.error || "Couldn't reach Dash.");
  if (!r.found)
    return showError(
      "Couldn't find the activity note box on Dash. Copy the note and paste it there.",
    );
  showError("");
  els.noteFill.textContent = "Added. Click Post on Dash.";
  setTimeout(() => (els.noteFill.textContent = "Add to Dash note"), 2200);
});
els.readPage.addEventListener("click", async () => {
  const r = await toDash({ type: "plScrape" });
  if (!r?.ok) return showError(r?.error || "Couldn't read Dash.");
  page = r.data;
  if (!page?.leadId)
    return showError("Open a lead on the Dash Pound list first.");
  if (show(fromPage(page, true), true)) save(true, false);
});
els.wtLog.addEventListener("click", logWarranty);
els.wtOpen.addEventListener("click", openWarranty);
els.search.addEventListener("input", renderLog);
for (const b of els.logTabs.querySelectorAll(".tab")) {
  b.addEventListener("click", () => {
    logFilter = b.dataset.filter;
    renderLog();
  });
}
for (const k of ["rep", "callback"]) {
  els[k].addEventListener("input", () => {
    settings[k] = els[k].value.trim();
    chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    renderHeader();
    renderScript();
    renderNote();
  });
}
els.repLabel.addEventListener("click", () => {
  const d = els.rep.closest(".settings");
  d.open = true;
  els.rep.focus();
});
els.export.addEventListener("click", () => {
  const rows = Object.values(leads).filter((lead) => unified ? nonWarranty(lead) : worked(lead));
  if (!rows.length) return;
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const iso = (ts) => (ts ? new Date(ts).toISOString() : "");
  const data = [
    [
      "Lead",
      "Type",
      "Customer",
      "Phone",
      "Email",
      "Order",
      "Lender",
      "Amount (approval/cart)",
      "Status",
      "Called",
      "LVM",
      "Texted",
      "Emailed",
      "Note",
      "Dash URL",
    ],
  ].concat(
    rows.map((l) => [
      l.id,
      LEAD_TYPES[l.type],
      l.customer,
      l.phone,
      l.email,
      l.order,
      l.lender,
      l.amount,
      STATUS_LABEL[l.status],
      iso(l.steps?.called),
      iso(l.steps?.lvm),
      iso(l.steps?.texted),
      iso(l.steps?.emailed),
      l.note,
      l.url,
    ]),
  );
  const blob = new Blob([data.map((r) => r.map(esc).join(",")).join("\n")], {
    type: "text/csv",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `poundlist-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
els.clearOld.addEventListener("click", async () => {
  if (
    !confirm(
      unified
        ? "Remove all non-warranty leads from this device and the shared Firestore Lead log? Dash and Warranty records will not change. Export a CSV first if needed."
        : "Clear every lead from your Pound List log on this device? Export a CSV first if you need it.",
    )
  )
    return;
  if (unified) {
    for (const lead of Object.values(leads).filter(nonWarranty)) await removeLead(lead.id);
    return;
  }
  leads = current
    ? {
        [current.id]: {
          ...current,
          steps: {},
          status: "new",
          outcome: "",
          note: "",
        },
      }
    : {};
  if (current) current = leads[current.id];
  chrome.storage.local.set({ [LEADS_KEY]: leads });
  fillForm();
  renderAll();
});

// New scrapes from Dash switch the panel to that lead and fill blank fields.
chrome.storage.onChanged.addListener((c, area) => {
  if (area !== "local") return;
  if (c[PAGE_KEY]) {
    page = c[PAGE_KEY].newValue || null;
    if (page?.leadId && page.leadId !== current?.id) {
      if (current) save(true, !!saveTimer);
      if (show(fromPage(page, false), false, unified)) save(true, false);
    } else if (page?.leadId && current) {
      const merged = mergeScrape(current, page, false);
      const changed =
        FIELDS.some((f) => merged[f] !== current[f]) ||
        merged.type !== current.type;
      if (changed) {
        if (!unified || !customer.draftConflicts(customer.readCustomer(), merged)) {
          current = merged;
          fillForm();
          save(false, false);
          renderAll();
        } else {
          showError(unified
            ? "Dash has updated customer details. Your edited fields were kept; review them against Dash before continuing."
            : "Dash has updated customer details. Your draft was kept; use Read page to load them.");
        }
      }
    }
    // renderClaim();
  }
  if (c[WT_AUTH_KEY] || c[WT_CACHE_KEY]) {
    wtAuth = c[WT_AUTH_KEY] ? c[WT_AUTH_KEY].newValue || null : wtAuth;
    if (c[WT_CACHE_KEY]) wtItems = c[WT_CACHE_KEY].newValue?.items || {};
    renderHeader();
    renderWarranty();
    if (unified && c[WT_AUTH_KEY] && wtAuth) refreshLeadLog();
  }
});

// ---------- init ----------
export const ready = (async () => {
  els.type.replaceChildren(
    ...Object.entries(LEAD_TYPES).map(([v, t]) => new Option(t, v)),
  );
  els.outcome.replaceChildren(...OUTCOMES.map(([v, t]) => new Option(t, v)));
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
    CLOUD_KEY,
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
  cloudIds = new Set(Object.keys(d[CLOUD_KEY]?.items || {}));

  // The standalone tool expires unworked drafts; the combined Lead log keeps all active leads.
  const weekAgo = Date.now() - 7 * 86400000;
  leads = Object.fromEntries(
    Object.entries(d[LEADS_KEY] || {}).filter(
      ([id, l]) => (!unified || (l.status !== "dead" && !removedLeads.has(id))) &&
        (unified || worked(l) || l.updatedAt > weekAgo),
    ),
  );

  hasWarrantyTool = true;

  const id = page?.leadId || d[CURRENT_KEY];
  const saved = leads[d[CURRENT_KEY]];
  if (unified && saved && !customer.draftConflicts(customer.readCustomer(), saved)) show({ ...saved });
  else if (page?.leadId) show(fromPage(page, false));
  else if (id && leads[id]) show({ ...leads[id] });
  else show(null);
  if (unified && !current) ensureCustomerLead();
  if (current) save(true, false);
  if (unified) {
    // Remove pre-existing dead entries, including their cloud metadata, without retaining history.
    for (const lead of Object.values(d[LEADS_KEY] || {}).filter((lead) => lead.status === "dead")) {
      await removeLead(lead.id);
    }
    await refreshLeadLog();
    const tabs = await chrome.tabs.query({
      active: true, lastFocusedWindow: true,
      url: ["https://dash.metapcs.com/*", "https://metapcs-platform.web.app/*"],
    });
    if (tabs[0]) {
      try {
        const r = await sendDashMessage(tabs[0].id, { type: "plScrape" });
        if (!r?.ok) throw new Error(r?.error || "Dash did not respond.");
        if (r.data?.leadId && !removedLeads.has(r.data.leadId)) {
          if (current) save(true, !!saveTimer);
          page = r.data;
          if (show(fromPage(page, false), false, true)) save(true, false);
        }
      } catch (error) {
        showError(`Automatic Dash reading failed. Check Plugin Manager's site access for Dash in chrome://extensions: ${error.message}`);
      }
    }
    const syncTimer = setInterval(() => {
      if (document.visibilityState === "visible" && wtAuth) refreshLeadLog();
    }, 60000);
    window.addEventListener("unload", () => clearInterval(syncTimer), { once: true });
  }
})();
