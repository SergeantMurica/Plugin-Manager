import {
  STAGE_TITLE,
  fallbackVariant,
  randomVariant,
  stageFor,
  variantById,
  variantStats,
} from "./lib/scripts.js";
import * as backup from "./lib/backup.js";

const unified = !!document.getElementById("dashboardWorkspace");
const dashboard = unified || new URLSearchParams(location.search).has("dashboard")
  ? await import("../actions.js")
  : null;

const CACHE_KEY = "wtContacts";
const AUTH_KEY = "wtAuth";
const DRAFT_KEY = "wtDraft";
const PRIVATE_KEY = "wtPrivate";
let dashLeads = {};
const STATUSES = [
  "texted",
  "agreed",
  "declined",
  "paid",
  "none",
  "wrong_number_error",
  "already_has",
];
const STATUS_LABEL = {
  texted: "Texted",
  agreed: "Agreed",
  declined: "Declined",
  none: "No answer",
  paid: "Paid",
  wrong_number_error: "Wrong number/error",
  already_has: "Already Has",
};

const TAB_LABEL = { none: "No answer", wrong_number_error: "Wrong #" };

const $ = (id) => document.getElementById(id);
const els = {
  authView: $("authView"),
  mainView: $("mainView"),
  authForm: $("authForm"),
  authName: $("authName"),
  nameField: $("nameField"),
  authEmail: $("authEmail"),
  authPass: $("authPass"),
  authError: $("authError"),
  authToggle: $("authToggle"),
  authSubmit: $("authSubmit"),
  signOut: $("signOut"),
  scrub: $("scrub"),
  import: $("import"),
  backup: $("backup"),
  importFile: $("importFile"),
  form: $("form"),
  phone: $("phone"),
  email: $("email"),
  order: $("order"),
  name: $("name"),
  systemPrice: $("systemPrice"),
  watercooled: $("watercooled"),
  hint: $("hint"),
  error: $("error"),
  clear: $("clear"),
  tabs: $("tabs"),
  search: $("search"),
  list: $("list"),
  empty: $("empty"),
  count: $("count"),
  export: $("export"),
  total: $("total"),
  copyScript: $("copyScript"),
  scriptHint: $("scriptHint"),
  statsToggle: $("statsToggle"),
  stats: $("stats"),
};

// ---------- text script ----------
const PRICES = {
  2: [
    [2500, 180],
    [4500, 240],
    [12000, 320],
  ],
  3: [
    [2500, 240],
    [4500, 320],
    [12000, 480],
  ],
};
const WATERCOOLED_PRICES = { 2: 499, 3: 799 };
const MAX_PRICED_TOTAL = 12000;
const MANAGER_NOTE = "{manager to calculate}";
const priceFor = (years, total) =>
  total > MAX_PRICED_TOTAL
    ? null
    : PRICES[years].find(([max]) => total <= max)[1];
const priceText = (years, total) => {
  const p = priceFor(years, total);
  return p === null ? MANAGER_NOTE : `$${p}`;
};

// Per-PC prices read from the Shopify order ("1149,1299"); "manual" or blank means use systemPrice.
const pcPrices = (systems) =>
  String(systems || "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);

function scriptContext(customer, systemPrice, watercooled = false, systems = "") {
  const total = parseFloat(String(systemPrice).replace(/[^0-9.]/g, ""));
  const known = Number.isFinite(total);
  const pcs = pcPrices(systems);
  // Each PC gets its own warranty, so a multi-PC order is quoted as the sum of per-PC prices.
  const multiTier = (years) => {
    const each = pcs.map((p) => (watercooled ? WATERCOOLED_PRICES[years] : priceFor(years, p)));
    if (each.includes(null)) return MANAGER_NOTE;
    const who = pcs.length === 2 ? "both PCs" : `all ${pcs.length} PCs`;
    return `$${each.reduce((s, p) => s + p, 0).toLocaleString()} for ${who}`;
  };
  const tier = (years) =>
    pcs.length > 1
      ? multiTier(years)
      : watercooled
        ? `$${WATERCOOLED_PRICES[years]}`
        : known
          ? priceText(years, total)
          : `{${years} year}`;
  const first = String(customer || "")
    .trim()
    .split(/\s+/)[0];
  return {
    first: first || "there",
    rep: capitalizeName(auth?.name) || "{Employee Name}",
    two: tier(2),
    three: tier(3),
    build:
      pcs.length > 1
        ? `a $${Math.round(pcs.reduce((s, p) => s + p, 0)).toLocaleString()} order`
        : known
          ? `a $${Math.round(total).toLocaleString()} build`
          : "your build",
  };
}

// Copies the script for the order's current stage: pitch, declined / no-answer follow-up, or invoice reply.
async function copyScript(e, button, stage = stageFor(e.status), save = true) {
  const variant =
    variantById(e.variant) ||
    (e.status === "texted" ? randomVariant() : fallbackVariant(e.id));
  const ctx = scriptContext(e.customer, e.systemPrice, e.watercooled === "yes", e.systems);
  await navigator.clipboard.writeText(variant[stage](ctx));
  const label = button.textContent;
  button.textContent = "✓";
  setTimeout(() => {
    button.textContent = label;
  }, 900);
  // Only orders still awaiting a reply get a newly assigned variant, so stats aren't skewed.
  const assign = !e.variant && e.status === "texted";
  const followUp =
    (stage === "overcome" && !e.overcome) || (stage === "nudge" && !e.nudged);
  if (save && (assign || followUp)) {
    const r = await send("markScript", {
      id: e.id,
      variant: assign ? variant.id : "",
      overcome: stage === "overcome",
      nudged: stage === "nudge",
    });
    if (!r.ok) showError(els.error, r.error);
  }
}

let auth = null;
let entries = []; // every record, including hidden ones (used for duplicate checks)
const listed = () => entries.filter((e) => !e.hidden);
let ownerFilter = "all";
let statusFilter = null;
let signUpMode = false;
let editing = false;

// ---------- helpers ----------
const send = (type, payload) =>
  new Promise((resolve) =>
    chrome.runtime.sendMessage({ type, payload }, (r) =>
      resolve(r || { ok: false, error: "No response." }),
    ),
  );
const orderKey = (s) =>
  String(s || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const digits = (s) => {
  let d = (s || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d;
};
const prettyPhone = (s) => {
  const d = digits(s);
  return d.length === 10
    ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
    : (s || "").trim();
};
const capitalizeName = (name) =>
  String(name || "").replace(/(^|[\s'-])(\p{L})/gu, (_, separator, letter) =>
    separator + letter.toLocaleUpperCase(),
  );
const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
function showError(el, msg) {
  el.textContent = msg;
  el.hidden = !msg;
}

// ---------- auth view ----------
function setMode(signUp) {
  signUpMode = signUp;
  els.nameField.hidden = !signUp;
  els.authSubmit.textContent = signUp ? "Create account" : "Sign in";
  els.authToggle.textContent = signUp ? "I have an account" : "Create account";
  els.authPass.autocomplete = signUp ? "new-password" : "current-password";
  showError(els.authError, "");
}
els.authToggle.addEventListener("click", () => setMode(!signUpMode));
els.authForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const email = els.authEmail.value.trim();
  const password = els.authPass.value;
  const name = capitalizeName(els.authName.value.trim());
  els.authName.value = name;
  if (!email || !password || (signUpMode && !name)) {
    showError(
      els.authError,
      signUpMode
        ? "Enter your name, email and password."
        : "Enter your email and password.",
    );
    return;
  }
  els.authSubmit.disabled = true;
  const r = await send(signUpMode ? "signUp" : "signIn", {
    email,
    password,
    name,
  });
  els.authSubmit.disabled = false;
  if (!r.ok) showError(els.authError, r.error);
});
els.signOut.addEventListener("click", () => send("signOut"));
els.scrub.addEventListener("click", async () => {
  if (
    !confirm(
      "Permanently delete all customer names, phone numbers and prices from Firestore? Export a CSV first and make sure teammates have their own copies; this cannot be undone.",
    )
  )
    return;
  els.scrub.disabled = true;
  const r = await send("scrub");
  els.scrub.disabled = false;
  alert(r.ok ? "Firestore scrubbed." : `Scrub failed: ${r.error}`);
});
els.authName.addEventListener("blur", () => {
  els.authName.value = capitalizeName(els.authName.value);
});

// ---------- state ----------
async function load() {
  const d = await chrome.storage.local.get([AUTH_KEY, CACHE_KEY, ...(unified ? ["plLeads"] : [])]);
  if (unified) dashLeads = d.plLeads || {};
  auth = d[AUTH_KEY] || null;
  if (auth?.name) {
    const name = capitalizeName(auth.name);
    if (auth.name !== name) {
      auth = { ...auth, name };
      await chrome.storage.local.set({ [AUTH_KEY]: auth });
    }
  }
  entries = Object.values(d[CACHE_KEY]?.items || {});
  els.authView.hidden = !!auth;
  els.mainView.hidden = !auth;
  if (auth) {
    els.scrub.hidden = auth.email?.toLowerCase() !== "alexander@metapcs.com";
    els.signOut.textContent = `${auth.name} (sign out)`;
    updateHint();
    if (!editing) render();
  }
}
chrome.storage.onChanged.addListener((c, area) => {
  if (area === "local" && (c[AUTH_KEY] || c[CACHE_KEY] || (unified && c.plLeads))) load();
});

// ---------- draft ----------
function saveDraft() {
  const draft = {
    phone: els.phone.value,
    email: els.email.value,
    order: els.order.value,
    name: els.name.value,
    systemPrice: els.systemPrice.value,
    watercooled: els.watercooled.checked,
  };
  const hasAny =
    draft.phone ||
    draft.email ||
    draft.order ||
    draft.name ||
    draft.systemPrice ||
    draft.watercooled;
  els.clear.hidden = !unified && !hasAny;
  if (hasAny) chrome.storage.local.set({ [DRAFT_KEY]: draft });
  else chrome.storage.local.remove(DRAFT_KEY);
}

// ---------- duplicate check ----------
function findDuplicates() {
  const p = digits(els.phone.value);
  const k = orderKey(els.order.value);
  return {
    byPhone:
      p.length >= 7
        ? entries.find((e) => digits(e.phone) === p && e.id !== k)
        : null,
    byOrder: k ? entries.find((e) => e.id === k) : null,
  };
}
function updateHint() {
  const { byPhone, byOrder } = findDuplicates();
  els.order.classList.toggle("flag", !!byOrder);
  els.phone.classList.toggle("flag", !!byPhone);
  const msgs = [];
  if (byOrder)
    msgs.push(
      `${capitalizeName(byOrder.by)} already contacted this order on ${fmtDate(byOrder.ts)}.`,
    );
  if (byPhone)
    msgs.push(
      `${capitalizeName(byPhone.by)} contacted this number (${byPhone.order}) on ${fmtDate(byPhone.ts)}.`,
    );
  els.hint.textContent = msgs.join(" ");
  els.hint.hidden = msgs.length === 0;
}

// ---------- render ----------
function renderTabs() {
  const visible = listed();
  const mine = visible.filter((e) => e.uid === auth?.uid);
  const counts = { all: visible.length, mine: mine.length };
  // Status counts follow the All / Me filter so they add up to the selected total.
  const scope = ownerFilter === "mine" ? mine : visible;
  for (const s of STATUSES)
    counts[s] = scope.filter((e) => e.status === s).length;
  const tab = (key, label, full = label, selected = false) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tab";
    b.dataset.status = key;
    b.title = full;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(selected));
    b.setAttribute("aria-label", `${full} (${counts[key]})`);
    const name = document.createElement("span");
    name.className = "tab-name";
    name.textContent = label;
    const n = document.createElement("b");
    n.textContent = counts[key];
    b.append(name, n);
    b.addEventListener("click", () => {
      if (key === "all" || key === "mine") ownerFilter = key;
      else statusFilter = statusFilter === key ? null : key;
      render();
    });
    return b;
  };
  const main = document.createElement("div");
  main.className = "tabs-main";
  main.append(
    tab("all", "All", "All", ownerFilter === "all"),
    tab("mine", "Me", "Me", ownerFilter === "mine"),
  );
  const grid = document.createElement("div");
  grid.className = "tabs-status";
  for (const s of STATUSES)
    grid.append(
      tab(
        s,
        TAB_LABEL[s] || STATUS_LABEL[s],
        STATUS_LABEL[s],
        statusFilter === s,
      ),
    );
  els.tabs.replaceChildren(main, grid);
}

function copyButton(text, label, phone = false) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "copy";
  b.textContent = label;
  b.title = phone && dashboard ? "Copy number and prepare a text if RingCentral is open" : "Click to copy";
  b.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text);
      if (phone && dashboard) await dashboard.prepareText(text);
      showError(els.error, "");
    } catch (error) {
      showError(els.error, error.message);
      return;
    }
    b.classList.add("done");
    b.textContent = "Copied";
    setTimeout(() => {
      b.classList.remove("done");
      b.textContent = label;
    }, 900);
  });
  return b;
}

function closeEdit() {
  render();
}

function render() {
  editing = false;
  const q = els.search.value.trim().toLowerCase();
  const qd = digits(q);
  const visible = listed();
  const shown = visible
    .filter((e) => ownerFilter === "all" || e.uid === auth?.uid)
    .filter((e) => !statusFilter || e.status === statusFilter)
    .filter(
      (e) =>
        !q ||
        (qd && digits(e.phone).includes(qd)) ||
        e.order.toLowerCase().includes(q) ||
        e.customer.toLowerCase().includes(q) ||
        (e.email || "").toLowerCase().includes(q) ||
        e.by.toLowerCase().includes(q),
    )
    .sort((a, b) => b.ts - a.ts);

  els.count.textContent = `${visible.length} logged`;
  renderTabs();
  if (!els.stats.hidden) renderStats();
  els.list.replaceChildren();
  els.empty.hidden = shown.length > 0;
  els.empty.textContent = visible.length
    ? "No matches."
    : "Nothing logged yet. Log the first order above.";

  let lastDay = null;
  for (const e of shown) {
    const day = dayLabel(e.ts);
    if (day !== lastDay) {
      const h = document.createElement("div");
      h.className = "day";
      h.textContent = day;
      els.list.append(h);
      lastDay = day;
    }

    const row = document.createElement("div");
    row.className = "item";

    const title = dashboard
      ? dashboard.orderButton(e.order, (message) => showError(els.error, message))
      : document.createElement("div");
    title.classList.add("phone");
    title.textContent = e.order;

    const meta = document.createElement("div");
    meta.className = "meta";
    const by = document.createElement("span");
    by.className = "by";
    by.textContent = capitalizeName(e.by);
    meta.append(by);
    if (e.customer) {
      const s = document.createElement("span");
      s.textContent = e.customer;
      meta.append(s);
    }
    if (e.systemPrice) {
      const price = document.createElement("span");
      const pcs = pcPrices(e.systems);
      price.textContent = `$${Number(e.systemPrice).toLocaleString()}`;
      if (pcs.length > 1) {
        price.textContent += ` · ${pcs.length} PCs`;
        price.title = pcs.map((p) => `$${p.toLocaleString()}`).join(" + ");
      }
      meta.append(price);
    }
    if (e.watercooled === "yes") {
      const wc = document.createElement("span");
      wc.className = "tag";
      wc.textContent = "Watercooled";
      meta.append(wc);
    }
    if (e.phone) meta.append(copyButton(e.phone, prettyPhone(e.phone), true));
    if (e.email) meta.append(copyButton(e.email, e.email));
    const t = document.createElement("span");
    t.textContent = fmtTime(e.ts);
    meta.append(t);

    const side = document.createElement("div");
    side.className = "side";
    if (unified) {
      const lead = Object.values(dashLeads).find((lead) =>
        lead.type === "warranty" && orderKey(lead.order) === orderKey(e.order) &&
        /^https:\/\/(?:dash\.metapcs\.com|metapcs-platform\.web\.app)\//.test(lead.url || ""));
      const open = document.createElement("button");
      open.type = "button";
      open.className = "del";
      open.textContent = "\u2197";
      open.title = lead ? "Open warranty lead on Dash" : "Open warranty order on Dash";
      open.setAttribute("aria-label", `${open.title}: ${e.order}`);
      open.addEventListener("click", async () => {
        try {
          if (lead) await chrome.tabs.create({ url: lead.url });
          else await dashboard.prepareOrder(e.order);
        } catch (error) {
          showError(els.error, error.message);
        }
      });
      side.append(open);
    }

    const chip = document.createElement("select");
    chip.className = "chip";
    chip.dataset.status = e.status;
    chip.title = "Change status";
    chip.setAttribute("aria-label", `Status for ${e.order}`);
    for (const s of STATUSES) {
      const o = document.createElement("option");
      o.value = s;
      o.textContent = STATUS_LABEL[s];
      o.selected = s === e.status;
      chip.append(o);
    }
    chip.addEventListener("change", async () => {
      const stage = stageFor(chip.value);
      // Copy the follow-up while the change event still counts as a user gesture.
      if (stage !== "pitch")
        copyScript({ ...e, status: chip.value }, script, stage, false).catch(
          () => {},
        );
      const r = await send("upsert", {
        ...e,
        overcome: e.overcome || stage === "overcome",
        nudged: e.nudged || stage === "nudge",
        status: chip.value,
        expect: e.updateTime || "",
      });
      if (!r.ok) {
        showError(els.error, r.error);
        chip.value = e.status;
      }
    });

    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.textContent = "×";
    del.title = "Remove";
    del.setAttribute("aria-label", `Remove ${e.order}`);
    del.addEventListener("click", async () => {
      if (
        !confirm(
          `Remove ${e.order} from the list? It stays on record so the order still shows as contacted on Shopify.`,
        )
      )
        return;
      const r = await send("remove", { id: e.id });
      if (!r.ok) showError(els.error, r.error);
    });

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "del";
    edit.textContent = "✎";
    edit.title = "Edit customer, phone, email and system price";
    edit.setAttribute("aria-label", `Edit details for ${e.order}`);
    edit.addEventListener("click", () => {
      const form = document.createElement("div");
      form.className = "edit-row";
      const nameIn = document.createElement("input");
      nameIn.type = "text";
      nameIn.placeholder = "Customer name";
      nameIn.value = e.customer;
      nameIn.addEventListener("blur", () => {
        nameIn.value = capitalizeName(nameIn.value);
      });
      const phoneIn = document.createElement("input");
      phoneIn.type = "tel";
      phoneIn.placeholder = "Phone";
      phoneIn.value = e.phone;
      const emailIn = document.createElement("input");
      emailIn.type = "email";
      emailIn.placeholder = "Email";
      emailIn.value = e.email || "";
      const priceIn = document.createElement("input");
      priceIn.type = "number";
      priceIn.min = "0";
      priceIn.step = "0.01";
      priceIn.inputMode = "decimal";
      priceIn.placeholder = "System price";
      priceIn.value = e.systemPrice || "";
      const wcLabel = document.createElement("label");
      wcLabel.className = "toggle";
      wcLabel.title = "Watercooled pricing: 2-yr $499 · 3-yr $799";
      const wcIn = document.createElement("input");
      wcIn.type = "checkbox";
      wcIn.checked = e.watercooled === "yes";
      wcLabel.append(wcIn, "Watercooled");
      const save = document.createElement("button");
      save.type = "button";
      save.className = "primary";
      save.textContent = "Save";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "ghost";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", closeEdit);
      const submit = async () => {
        save.disabled = true;
        const wc = wcIn.checked ? "yes" : "";
        // A hand-typed price/flag replaces the per-PC breakdown and stops the order page re-filling it.
        const changed =
          priceIn.value !== (e.systemPrice || "") || wc !== (e.watercooled === "yes" ? "yes" : "");
        const r = await send("updateDetails", {
          id: e.id,
          customer: capitalizeName(nameIn.value.trim()),
          phone: phoneIn.value.trim() ? prettyPhone(phoneIn.value) : "",
          email: emailIn.value.trim(),
          systemPrice: priceIn.value,
          watercooled: wc,
          ...(changed ? { systems: "manual" } : {}),
        });
        if (!r.ok) {
          save.disabled = false;
          showError(els.error, r.error);
          return;
        }
        closeEdit();
      };
      save.addEventListener("click", submit);
      for (const i of [nameIn, phoneIn, emailIn, priceIn]) {
        i.addEventListener("keydown", (k) => {
          if (k.key === "Enter") submit();
          else if (k.key === "Escape") closeEdit();
        });
      }
      form.append(nameIn, phoneIn, emailIn, priceIn, wcLabel, save, cancel);
      row.append(form);
      edit.disabled = true;
      editing = true;
      (e.customer ? phoneIn : nameIn).focus();
    });

    const script = document.createElement("button");
    script.type = "button";
    script.className = "del";
    script.textContent = "✉";
    const stage = stageFor(e.status);
    const v = variantById(e.variant);
    script.title = `${STAGE_TITLE[stage]}${v ? ` · tone: ${v.name}` : ""}`;
    script.dataset.stage = stage;
    script.setAttribute("aria-label", `${STAGE_TITLE[stage]} for ${e.order}`);
    script.addEventListener("click", () => copyScript(e, script));

    side.append(chip, script, edit, del);
    row.append(title, meta, side);
    els.list.append(row);
  }
}

// ---------- A/B stats ----------
const pct = (x) => (x === null ? "–" : `${Math.round(x * 100)}%`);
function renderStats() {
  const rows = variantStats(entries);
  const best = Math.max(...rows.filter((r) => r.won + r.lost >= 5).map((r) => r.rate));
  const table = document.createElement("table");
  table.className = "stats-table";
  const head = table.createTHead().insertRow();
  for (const [h, t] of [
    ["Tone", ""],
    ["Sent", "Orders texted with this script"],
    ["Won", "Agreed + Paid"],
    ["Lost", "Declined + No answer"],
    ["Win", "Won / (Won + Lost)"],
    ["Saves", "Won after the declined follow-up / declined follow-ups sent"],
    ["Revived", "Won after the no-answer follow-up / no-answer follow-ups sent"],
  ]) {
    const th = document.createElement("th");
    th.textContent = h;
    th.title = t;
    head.append(th);
  }
  const body = table.createTBody();
  for (const r of rows) {
    const tr = body.insertRow();
    if (r.rate !== null && r.rate === best) tr.className = "best";
    for (const v of [
      `${r.n}. ${r.name}`,
      r.sent,
      r.won,
      r.lost,
      pct(r.rate),
      r.followUps ? `${r.saves}/${r.followUps}` : "–",
      r.nudges ? `${r.revived}/${r.nudges}` : "–",
    ])
      tr.insertCell().textContent = v;
  }
  const t = rows.reduce(
    (a, r) => ({ won: a.won + r.won, lost: a.lost + r.lost }),
    { won: 0, lost: 0 },
  );
  const note = document.createElement("p");
  note.className = "stats-note";
  note.textContent = `Team total: ${t.won} won · ${t.lost} lost · ${pct(t.won + t.lost ? t.won / (t.won + t.lost) : null)} win rate. Best tone is highlighted once it has 5+ results.`;
  els.stats.replaceChildren(table, note);
}
els.statsToggle.addEventListener("click", () => {
  els.stats.hidden = !els.stats.hidden;
  els.statsToggle.textContent = els.stats.hidden ? "A/B stats" : "Hide stats";
  if (!els.stats.hidden) renderStats();
});

// ---------- events ----------
for (const input of [
  els.phone,
  els.email,
  els.order,
  els.name,
  els.systemPrice,
  els.watercooled,
]) {
  input.addEventListener("input", () => {
    showError(els.error, "");
    updateHint();
    saveDraft();
  });
}
els.name.addEventListener("blur", () => {
  els.name.value = capitalizeName(els.name.value);
  saveDraft();
});
els.search.addEventListener("input", render);

els.clear.addEventListener("click", () => {
  els.form.reset();
  els.order.focus();
});

els.form.addEventListener("reset", () => {
  queueMicrotask(() => {
    showError(els.error, "");
    updateHint();
    saveDraft();
  });
});

els.form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (unified) {
    document.dispatchEvent(new Event("dashboard:save-warranty"));
    return;
  }
  if (!orderKey(els.order.value)) {
    showError(els.error, "Enter the order number.");
    els.order.focus();
    return;
  }
  const { byOrder } = findDuplicates();
  if (
    byOrder &&
    !confirm(
      byOrder.hidden
        ? `${capitalizeName(byOrder.by)} contacted this order before but removed it. Take it over as yours?`
        : `${capitalizeName(byOrder.by)} already contacted this order. Mark it Texted? It stays under ${capitalizeName(byOrder.by)}'s name.`,
    )
  )
    return;

  const r = await send("upsert", {
    order: els.order.value.trim(),
    phone: els.phone.value.trim() ? prettyPhone(els.phone.value) : "",
    email: els.email.value.trim(),
    customer: capitalizeName(els.name.value.trim()),
    systemPrice: els.systemPrice.value.trim(),
    watercooled: els.watercooled.checked ? "yes" : "",
    status: "texted",
    expect: byOrder ? byOrder.updateTime || "" : null,
  });
  if (!r.ok) {
    showError(els.error, r.error);
    return;
  }
  els.form.reset();
  saveDraft();
  updateHint();
  ownerFilter = "all";
  statusFilter = null;
  els.order.focus();
});

els.export.addEventListener("click", () => {
  const exported = listed();
  if (!exported.length) return;
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [
    [
      "Order",
      "Phone",
      "Email",
      "Customer",
      "System price",
      "Watercooled",
      "Status",
      "Script tone",
      "Declined follow-up sent",
      "No-answer follow-up sent",
      "Contacted by",
      "Date",
    ],
  ].concat(
    exported.map((e) => [
      e.order,
      e.phone,
      e.email || "",
      e.customer,
      e.systemPrice,
      e.watercooled === "yes" ? "Yes" : "",
      STATUS_LABEL[e.status],
      variantById(e.variant)?.name || "",
      e.overcome ? "Yes" : "",
      e.nudged ? "Yes" : "",
      capitalizeName(e.by),
      new Date(e.ts).toISOString(),
    ]),
  );
  const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], {
    type: "text/csv",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "warranty-contacts.csv";
  a.click();
  URL.revokeObjectURL(a.href);
});

// ---------- import ----------
function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

els.import.addEventListener("click", () => els.importFile.click());
els.importFile.addEventListener("change", async () => {
  const file = els.importFile.files[0];
  els.importFile.value = "";
  if (!file) return;
  const text = (await file.text()).replace(/^\uFEFF/, "");
  let rows;
  if (/\.json$/i.test(file.name) || /^\s*\{/.test(text)) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return alert("That backup file isn't valid JSON.");
    }
    if (!data?.private || typeof data.private !== "object")
      return alert("That file isn't a Warranty Tool backup.");
    rows = Object.entries(data.private).map(([order, v]) => ({ ...v, order }));
  } else {
    const [head = [], ...body] = parseCsv(text);
    const col = (name) => head.findIndex((h) => h.trim().toLowerCase() === name);
    const idx = { order: col("order"), phone: col("phone"), email: col("email"), customer: col("customer"), systemPrice: col("system price"), watercooled: col("watercooled") };
    if (idx.order < 0) return alert("CSV needs an Order column.");
    const cell = (r, i) => (i < 0 ? "" : r[i]);
    rows = body.map((r) => ({
      order: r[idx.order],
      phone: cell(r, idx.phone),
      email: cell(r, idx.email),
      customer: cell(r, idx.customer),
      systemPrice: cell(r, idx.systemPrice),
      watercooled: /^(y|yes|true|1)$/i.test(String(cell(r, idx.watercooled) || "").trim()) ? "yes" : "",
    }));
  }
  const r = await send("importPrivate", { rows });
  alert(r.ok ? `Imported ${r.count} rows to this device.` : `Import failed: ${r.error}`);
});

// ---------- backup file ----------
// Customer details never leave this device, so mirror them to a file the user controls.
let backupHandle = null;
let backupOk = false;
let backupAt = 0;
let backupTimer = 0;

async function backupData() {
  const d = await chrome.storage.local.get([PRIVATE_KEY, CACHE_KEY]);
  const items = Object.values(d[CACHE_KEY]?.items || {});
  return {
    app: "warranty-upsell-tracker",
    version: 1,
    savedAt: new Date().toISOString(),
    savedBy: auth?.email || "",
    private: d[PRIVATE_KEY] || {},
    contacts: items
      .filter((e) => !e.hidden)
      .map((e) => ({
        order: e.order,
        status: STATUS_LABEL[e.status] || e.status,
        contactedBy: capitalizeName(e.by),
        date: e.ts ? new Date(e.ts).toISOString() : "",
        customer: e.customer || "",
        phone: e.phone || "",
        email: e.email || "",
        systemPrice: e.systemPrice || "",
        watercooled: e.watercooled === "yes",
      })),
  };
}

function renderBackup() {
  const b = els.backup;
  b.classList.remove("warn");
  if (!backup.supported) {
    b.textContent = "Download backup";
    b.title = "Save a copy of your customer details as a file. Restore it later with Import.";
  } else if (!backupHandle) {
    b.textContent = "Backup file";
    b.title = "Pick a file on this computer that stays updated with your customer details";
  } else if (!backupOk) {
    b.textContent = "Reconnect backup";
    b.title = `Click to allow saving to ${backupHandle.name} again`;
    b.classList.add("warn");
  } else {
    b.textContent = backupAt ? `Backed up ${fmtTime(backupAt)}` : "Backup on";
    b.title = `Saving to ${backupHandle.name}. Click to choose a different file.`;
  }
}

async function writeBackup() {
  if (!backupHandle || !(backupOk = await backup.hasAccess(backupHandle))) {
    renderBackup();
    return;
  }
  try {
    await backup.writeFile(backupHandle, await backupData());
    backupAt = Date.now();
  } catch (err) {
    backupOk = false;
    showError(els.error, `Backup file couldn't be saved: ${err.message}`);
  }
  renderBackup();
}

function scheduleBackup() {
  clearTimeout(backupTimer);
  backupTimer = setTimeout(writeBackup, 1500);
}

async function downloadBackup() {
  const blob = new Blob([JSON.stringify(await backupData(), null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `warranty-tool-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

els.backup.addEventListener("click", async () => {
  if (!backup.supported) return downloadBackup();
  try {
    if (backupHandle && !backupOk) {
      backupOk = await backup.hasAccess(backupHandle, true);
      if (backupOk) return writeBackup();
      renderBackup();
      return;
    }
    if (
      backupHandle &&
      !confirm(`Backing up to ${backupHandle.name}. Choose a different file?`)
    )
      return;
    const h = await backup.pickFile();
    await backup.setHandle(h);
    backupHandle = h;
    backupOk = true;
    await writeBackup();
  } catch (err) {
    if (err?.name !== "AbortError")
      showError(els.error, `Backup file error: ${err.message}`);
  }
});

chrome.storage.onChanged.addListener((c, area) => {
  if (area === "local" && (c[PRIVATE_KEY] || c[CACHE_KEY])) scheduleBackup();
});

if (dashboard) {
  document.body.classList.add("dashboard-view");
  dashboard.addPhoneCopy(els.phone, (message) => showError(els.error, message));
}
if (unified) {
  const pricing = () => {
    els.systemPrice.disabled = els.watercooled.checked;
    document.getElementById("fixedWarrantyPrice").hidden = !els.watercooled.checked;
  };
  document.addEventListener("dashboard:customer-changed", () => {
    updateHint();
    saveDraft();
    pricing();
  });
  els.watercooled.addEventListener("change", pricing);
  pricing();
}

// ---------- init ----------
export const ready = (async () => {
  const draft = (await chrome.storage.local.get(DRAFT_KEY))[DRAFT_KEY] || {};
  els.phone.value = draft.phone || "";
  els.email.value = draft.email || "";
  els.order.value = draft.order || "";
  els.name.value = capitalizeName(draft.name || "");
  els.systemPrice.value = draft.systemPrice || "";
  els.watercooled.checked = !!draft.watercooled;
  if (unified) els.watercooled.dispatchEvent(new Event("change"));
  els.clear.hidden = !unified && !(
    draft.phone ||
    draft.email ||
    draft.order ||
    draft.name ||
    draft.systemPrice ||
    draft.watercooled
  );
  await load();
  if (backup.supported) {
    backupHandle = await backup.getHandle();
    backupOk = await backup.hasAccess(backupHandle).catch(() => false);
    if (backupOk) scheduleBackup();
  }
  renderBackup();
  (auth ? els.order : els.authEmail).focus();
  if (auth) send("refresh");
})();
