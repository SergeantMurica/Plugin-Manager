(() => {
importScripts("warranty/config.js");

const CFG = self.WARRANTY_CONFIG;
const AUTH_KEY = "wtAuth";
const CACHE_KEY = "wtContacts";
const PRIVATE_KEY = "wtPrivate"; // customer name / phone / email / price: stored only on this device
const KNOWN_KEY = "wtKnownContacts";
const PRIVATE_FIELDS = ["phone", "email", "customer", "systemPrice", "watercooled", "custom", "systems"];
const PRICING_FIELDS = ["systemPrice", "watercooled", "custom", "systems"];
const DAY_MS = 24 * 60 * 60 * 1000;
const AUTO_ARCHIVE_MS = 30 * DAY_MS;
const ARCHIVE_RETENTION_MS = 60 * DAY_MS;
const AUTO_ARCHIVE_STATUSES = new Set(["texted", "called", "emailed"]);
const STATUSES = [
  "texted",
  "called",
  "emailed",
  "agreed",
  "declined",
  "paid",
  "none",
  "wrong_number_error",
  "already_has",
  "not_contacted",
];
const STATUS_LABEL = {
  texted: "Texted",
  called: "Called",
  emailed: "Emailed",
  agreed: "Agreed",
  declined: "Declined",
  none: "No answer",
  paid: "Paid",
  wrong_number_error: "Wrong number/error",
  already_has: "Already Has",
  not_contacted: "Not contacted",
};
// A/B text-script variants (ids match lib/scripts.js).
// Keep in sync with lib/scripts.js. Retired ids (v7) stay out so they are never assigned.
const VARIANT_IDS = ["v1", "v2", "v3", "v4", "v5", "v6", "v8", "v9", "v10"];
const randomVariant = () =>
  VARIANT_IDS[Math.floor(Math.random() * VARIANT_IDS.length)];
// Refresh older caches to load retention timestamps and reconcile deleted records.
const CACHE_VERSION = 6;
const CONFLICT_CODES = ["ALREADY_EXISTS", "FAILED_PRECONDITION"];

const DOCS = () =>
  `https://firestore.googleapis.com/v1/projects/${CFG.projectId}/databases/(default)/documents/${CFG.collection}`;

const orderKey = (s) =>
  String(s || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

// ---------- auth ----------
async function getAuth() {
  return (await chrome.storage.local.get(AUTH_KEY))[AUTH_KEY] || null;
}
const setAuth = (a) => chrome.storage.local.set({ [AUTH_KEY]: a });

function authError(json) {
  const code = json?.error?.message || "AUTH_FAILED";
  const map = {
    EMAIL_EXISTS: "That email already has an account. Sign in instead.",
    EMAIL_NOT_FOUND: "No account for that email.",
    INVALID_PASSWORD: "Wrong password.",
    INVALID_LOGIN_CREDENTIALS: "Wrong email or password.",
    OPERATION_NOT_ALLOWED: "Email/password sign-in is disabled in Firebase.",
  };
  const key = Object.keys(map).find((k) => code.startsWith(k));
  if (code.startsWith("WEAK_PASSWORD"))
    return "Password must be at least 6 characters.";
  return key ? map[key] : code;
}

async function identity(endpoint, body) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${CFG.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const json = await res.json();
  if (!res.ok) throw new Error(authError(json));
  return json;
}

function toAuth(j, fallbackName) {
  return {
    uid: j.localId,
    email: j.email,
    name: j.displayName || fallbackName || j.email.split("@")[0],
    idToken: j.idToken,
    refreshToken: j.refreshToken,
    expiresAt: Date.now() + Number(j.expiresIn || 3600) * 1000,
  };
}

async function signIn({ email, password }) {
  const j = await identity("signInWithPassword", {
    email,
    password,
    returnSecureToken: true,
  });
  await setAuth(toAuth(j));
  await refreshContacts();
}

async function signUp({ email, password, name }) {
  let j = await identity("signUp", {
    email,
    password,
    returnSecureToken: true,
  });
  j = await identity("update", {
    idToken: j.idToken,
    displayName: name,
    returnSecureToken: true,
  }).then((u) => ({ ...j, ...u, localId: j.localId, email: j.email }));
  await setAuth(toAuth(j, name));
  await refreshContacts();
}

async function signOut() {
  await localWrite(async () => {
    const stored = await chrome.storage.local.get([CACHE_KEY, KNOWN_KEY]);
    const previous = Array.isArray(stored[KNOWN_KEY]) ? stored[KNOWN_KEY] : [];
    const known = new Set([...previous, ...Object.keys(stored[CACHE_KEY]?.items || {})]);
    if (known.size) await chrome.storage.local.set({ [KNOWN_KEY]: [...known] });
    await chrome.storage.local.remove([AUTH_KEY, CACHE_KEY, SYNC_KEY, FULL_SYNC_KEY]);
  });
}

async function validToken() {
  const a = await getAuth();
  if (!a) throw new Error("Not signed in.");
  if (a.expiresAt - 60000 > Date.now()) return a.idToken;
  const res = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${CFG.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: a.refreshToken,
      }),
    },
  );
  const j = await res.json();
  if (!res.ok) {
    await signOut();
    throw new Error("Session expired. Sign in again.");
  }
  await setAuth({
    ...a,
    idToken: j.id_token,
    refreshToken: j.refresh_token,
    expiresAt: Date.now() + Number(j.expires_in || 3600) * 1000,
  });
  return j.id_token;
}

async function api(url, options = {}) {
  const token = await validToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    const err = new Error(
      j?.error?.message || `Request failed (${res.status})`,
    );
    err.code = j?.error?.status || "";
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

// ---------- firestore ----------
function decode(doc) {
  const f = doc.fields || {};
  const s = (k) => f[k]?.stringValue || "";
  const status = s("status");
  return {
    id: doc.name.split("/").pop(),
    order: s("order"),
    phone: s("phone"),
    email: s("email"),
    customer: s("customer"),
    systemPrice: s("systemPrice"),
    note: s("note"),
    status: STATUSES.includes(status) ? status : "texted",
    statusValid: STATUSES.includes(status),
    by: s("by"),
    uid: s("uid"),
    hidden: f.hidden?.booleanValue === true,
    variant: VARIANT_IDS.includes(s("variant")) ? s("variant") : "",
    overcome: f.overcome?.booleanValue === true,
    nudged: f.nudged?.booleanValue === true,
    ts: Number(f.ts?.integerValue || 0),
    statusSince: Number(f.statusSince?.integerValue || 0),
    archivedAt: Number(f.archivedAt?.integerValue || 0),
    retentionUpdatedAt: Number(f.retentionUpdatedAt?.integerValue || 0),
    updatedAt: Number(f.updatedAt?.integerValue || 0),
    updateTime: doc.updateTime || "",
  };
}

function encode(c) {
  const str = (v) => ({ stringValue: String(v || "") });
  return {
    fields: {
      order: str(c.order),
      note: str(c.note),
      status: str(c.status),
      by: str(c.by),
      uid: str(c.uid),
      hidden: { booleanValue: !!c.hidden },
      variant: str(c.variant),
      overcome: { booleanValue: !!c.overcome },
      nudged: { booleanValue: !!c.nudged },
      ts: { integerValue: String(c.ts) },
      statusSince: { integerValue: String(c.statusSince || 0) },
      archivedAt: { integerValue: String(c.archivedAt || 0) },
      retentionUpdatedAt: { integerValue: String(c.retentionUpdatedAt || 0) },
      updatedAt: { integerValue: String(c.updatedAt || Date.now()) },
    },
  };
}

const SHARED_FIELDS = [
  "order",
  "note",
  "status",
  "by",
  "uid",
  "hidden",
  "variant",
  "overcome",
  "nudged",
  "ts",
  "statusSince",
  "archivedAt",
  "updatedAt",
  "retentionUpdatedAt",
];

// updateMask keeps legacy phone/customer/price in Firestore untouched until the admin scrubs them.
// expect: null = document must not exist yet; string = server updateTime we last saw.
// Firestore rejects the write if the precondition fails, so a stale view can't overwrite a teammate.
async function writeDoc(contact, { fields = SHARED_FIELDS, expect } = {}) {
  const writeFields = fields.includes("updatedAt") && !fields.includes("retentionUpdatedAt")
    ? [...fields, "retentionUpdatedAt"] : fields;
  const q = new URLSearchParams();
  writeFields.forEach((f) => q.append("updateMask.fieldPaths", f));
  if (expect === null) q.set("currentDocument.exists", "false");
  else if (expect) q.set("currentDocument.updateTime", expect);
  const all = encode({ ...contact, retentionUpdatedAt: contact.updatedAt }).fields;
  const doc = await api(`${DOCS()}/${encodeURIComponent(contact.id)}?${q}`, {
    method: "PATCH",
    body: JSON.stringify({
      fields: Object.fromEntries(writeFields.map((f) => [f, all[f]])),
    }),
  });
  return doc?.updateTime || "";
}

async function fetchOne(id) {
  const [c] = await mergePrivate([
    decode(await api(`${DOCS()}/${encodeURIComponent(id)}`)),
  ]);
  await patchCache((items) => {
    items[id] = c;
  });
  return c;
}

async function conflictError(cur, a) {
  const label = STATUS_LABEL[cur.status] || cur.status;
  const msg =
    cur.uid === a.uid
      ? `${cur.order} changed since this page loaded (now ${label}). Try again.`
      : `${cur.order} was already taken by ${cur.by} (${label}). Your change was not saved.`;
  return new Error(msg);
}

async function getPrivate() {
  return (await chrome.storage.local.get(PRIVATE_KEY))[PRIVATE_KEY] || {};
}

// Chrome storage has no atomic read/modify/write. Serialize only local writes;
// independent order requests and Firestore saves still run concurrently.
let localWrites = Promise.resolve();
function localWrite(update) {
  const result = localWrites.then(update);
  localWrites = result.then(() => undefined, () => undefined);
  return result;
}

// Only fields present in data are overwritten, so callers that don't know them keep the saved values.
async function savePrivate(id, data, { requireContact = false } = {}) {
  return localWrite(async () => {
    if (requireContact) {
      const cache = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY];
      if (!cache?.items?.[id]) throw new Error("Order no longer exists. Refresh and try again.");
    }
    const priv = await getPrivate();
    const next = { ...priv[id] };
    for (const f of PRIVATE_FIELDS)
      if (data[f] !== undefined) next[f] = String(data[f] || "").trim();
    priv[id] = next;
    await chrome.storage.local.set({ [PRIVATE_KEY]: priv });
    return next;
  });
}

// Fills blank customer details (scraped from the Shopify order page) without touching typed-in values.
async function enrich({ order, ...data }) {
  const id = orderKey(order);
  if (!id) return 0;
  const add = await localWrite(async () => {
    const cache = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY];
    if (!cache?.items?.[id]) throw new Error("Order no longer exists. Refresh and try again.");
    const priv = await getPrivate();
    const cur = priv[id] || {};
    const next = {};
    // Orders scraped before custom-build pricing get their per-PC SKU types filled once.
    const legacyScrape = cur.systems && cur.systems !== "manual" && !("custom" in cur) && data.systems;
    for (const f of PRIVATE_FIELDS) {
      if (cur.systems && PRICING_FIELDS.includes(f) && !legacyScrape) continue;
      const v = String(data[f] || "").trim();
      if (v && (!cur[f] || (legacyScrape && f === "systems"))) next[f] = v;
    }
    // Per-PC prices replace the old subtotal only on the first successful scrape.
    // "manual" keeps subsequent scrapes from overwriting a hand-edited price/flag.
    if (next.systems) {
      next.systemPrice = String(data.systemPrice || "").trim();
      next.watercooled = data.watercooled === "yes" ? "yes" : "";
      next.custom = data.custom === "yes" ? "yes" : "";
    }
    if (Object.keys(next).length) {
      priv[id] = { ...cur, ...next };
      await chrome.storage.local.set({ [PRIVATE_KEY]: priv });
    }
    return next;
  });
  const n = Object.keys(add).length;
  if (!n) return 0;
  await patchCache((items) => {
    if (items[id]) Object.assign(items[id], add);
  });
  return n;
}

// Overlays this device's local customer data onto records from Firestore.
async function mergePrivate(list) {
  const priv = await getPrivate();
  return list.map((c) => ({
    ...c,
    phone: "",
    email: "",
    customer: "",
    systemPrice: "",
    watercooled: "",
    custom: "",
    systems: "",
    ...priv[c.id],
  }));
}

// Merges phone/email/customer/price rows (e.g. from a CSV export) into local storage only.
async function importPrivate({ rows }) {
  const count = await localWrite(async () => {
    const priv = await getPrivate();
    let count = 0;
    for (const r of rows || []) {
      const id = orderKey(r.order);
      if (!id) continue;
      const next = { ...priv[id] };
      for (const f of PRIVATE_FIELDS) {
        const v = String(r[f] || "").trim();
        if (v) next[f] = v;
      }
      priv[id] = next;
      count++;
    }
    await chrome.storage.local.set({ [PRIVATE_KEY]: priv });
    return count;
  });
  await patchCache();
  return count;
}

const SYNC_KEY = "wtSyncAt";
const FULL_SYNC_KEY = "wtFullSyncAt";
const SYNC_OVERLAP_MS = 2 * 60 * 1000; // tolerate clock skew between teammates
const MIN_REFRESH_MS = 60 * 1000;
const FULL_REFRESH_MS = DAY_MS;
let inflight = null;

async function fullFetch() {
  const all = [];
  let pageToken = "";
  do {
    const q = new URLSearchParams({ pageSize: "300" });
    if (pageToken) q.set("pageToken", pageToken);
    const j = await api(`${DOCS()}?${q}`);
    for (const d of j.documents || []) all.push(decode(d));
    pageToken = j.nextPageToken || "";
  } while (pageToken);
  return Object.fromEntries((await mergePrivate(all)).map((c) => [c.id, c]));
}

async function changedSince(since) {
  const parent = DOCS().replace(/\/[^/]+$/, "");
  const res = await api(`${parent}:runQuery`, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: CFG.collection }],
        where: {
          fieldFilter: {
            field: { fieldPath: "updatedAt" },
            op: "GREATER_THAN",
            value: { integerValue: String(since) },
          },
        },
      },
    }),
  });
  return mergePrivate(
    (res || []).filter((r) => r.document).map((r) => decode(r.document)),
  );
}

// Incremental: after the first full load, only documents changed since the last sync are read.
async function doRefresh(force) {
  const store = await chrome.storage.local.get([CACHE_KEY, SYNC_KEY, FULL_SYNC_KEY]);
  const syncedAt = store[SYNC_KEY] || 0;
  const cached = store[CACHE_KEY];
  if (!force && cached && Date.now() - syncedAt < MIN_REFRESH_MS) return;
  const startedAt = Date.now();
  const initialVersions = Object.fromEntries(
    Object.entries(cached?.items || {}).map(([id, record]) => [id, record.updateTime]),
  );
  const expiredArchive = Object.values(cached?.items || {}).some((record) =>
    record.statusValid !== false && record.hidden && record.status !== "not_contacted" && record.status !== "paid" &&
    record.archivedAt > 0 && startedAt - record.archivedAt >= ARCHIVE_RETENTION_MS,
  );
  const full = !cached || !syncedAt || cached.v !== CACHE_VERSION ||
    startedAt - (store[FULL_SYNC_KEY] || 0) >= FULL_REFRESH_MS || expiredArchive;
  if (full) {
    await saveRefresh(Object.values(await fullFetch()), startedAt, true, initialVersions);
  } else {
    const changed = await changedSince(syncedAt - SYNC_OVERLAP_MS);
    await saveRefresh(changed, startedAt, false, initialVersions);
  }
  await applyRetention(startedAt);
}

function saveRefresh(records, startedAt, full, initialVersions) {
  return localWrite(async () => {
    const stored = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY];
    const current = stored?.items || {};
    const items = full
      ? Object.fromEntries(Object.entries(current).filter(([id, c]) =>
        !Object.hasOwn(initialVersions, id) || initialVersions[id] !== c.updateTime))
      : { ...current };
    for (const record of records) {
      const saved = current[record.id];
      if (Object.hasOwn(initialVersions, record.id) && !saved) continue;
      const locallyChanged = saved && (!Object.hasOwn(initialVersions, record.id) ||
        initialVersions[record.id] !== saved.updateTime);
      items[record.id] = saved && (locallyChanged || saved.updateTime > record.updateTime)
        ? saved : record;
    }
    const priv = await getPrivate();
    const known = full ? (await chrome.storage.local.get(KNOWN_KEY))[KNOWN_KEY] : [];
    const knownIds = Array.isArray(known) ? known : [];
    let privateChanged = false;
    if (full) {
      for (const id of new Set([...Object.keys(current), ...knownIds])) {
        if (!items[id] && Object.hasOwn(priv, id)) {
          delete priv[id];
          privateChanged = true;
        }
      }
    }
    for (const id of Object.keys(items))
      if (priv[id]) Object.assign(items[id], priv[id]);
    const update = { [SYNC_KEY]: startedAt };
    if (full) {
      update[FULL_SYNC_KEY] = startedAt;
      if (knownIds.length) update[KNOWN_KEY] = [];
    }
    if (privateChanged) update[PRIVATE_KEY] = priv;
    if (full || JSON.stringify(items) !== JSON.stringify(current))
      update[CACHE_KEY] = { items, fetchedAt: startedAt, v: CACHE_VERSION };
    await chrome.storage.local.set(update);
  });
}

function refreshContacts(force = false) {
  inflight ||= doRefresh(force).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function patchCache(fn = () => {}) {
  return localWrite(async () => {
    const cur = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY] || { items: {} };
    fn(cur.items);
    const priv = await getPrivate();
    for (const id of Object.keys(cur.items))
      if (priv[id]) Object.assign(cur.items[id], priv[id]);
    await chrome.storage.local.set({ [CACHE_KEY]: cur });
  });
}

async function forgetContact(id, expect) {
  await localWrite(async () => {
    const cache = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY];
    if (!cache?.items?.[id] || cache.items[id].updateTime !== expect) return;
    delete cache.items[id];
    const priv = await getPrivate();
    delete priv[id];
    await chrome.storage.local.set({ [CACHE_KEY]: cache, [PRIVATE_KEY]: priv });
  });
}

async function freshForChange(id, expect) {
  try {
    return await fetchOne(id);
  } catch (error) {
    if (error.code !== "NOT_FOUND") throw error;
    await forgetContact(id, expect);
    throw new Error("This tracker entry no longer exists. Refresh and claim it again from Dash if needed.");
  }
}

async function conditionalPatch(cur, changes, fields) {
  if (!cur.updateTime) throw new Error("Cannot verify this order's latest version. Refresh and try again.");
  const contact = { ...cur, ...changes, retentionUpdatedAt: changes.updatedAt };
  contact.updateTime = await writeDoc(contact, { fields, expect: cur.updateTime });
  await patchCache((items) => {
    if (items[cur.id]?.updateTime === cur.updateTime) items[cur.id] = contact;
  });
}

const validTime = (value) => Number.isSafeInteger(value) && value > 0;
const retentionTracked = (cur) => validTime(cur.updatedAt) && cur.retentionUpdatedAt === cur.updatedAt;

function statusStart(cur, now) {
  if (validTime(cur.statusSince) && retentionTracked(cur))
    return cur.statusSince;
  return validTime(cur.updatedAt) ? cur.updatedAt : now;
}

async function applyRetention(now) {
  const items = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY]?.items || {};
  for (const cur of Object.values(items)) {
    if (cur.statusValid === false) {
      console.warn("[Dashboard Tool] Skipping retention for an unsupported warranty status:", cur.id);
      continue;
    }
    if (cur.status === "not_contacted") continue;
    const statusSince = statusStart(cur, now);
    let changes;
    let fields;
    let remove = false;
    if (cur.hidden && cur.status === "paid") {
      changes = { hidden: false, archivedAt: 0, statusSince, updatedAt: now };
      fields = ["hidden", "archivedAt", "statusSince", "updatedAt"];
    } else if (cur.hidden && (!validTime(cur.archivedAt) || !retentionTracked(cur))) {
      // Older clients cannot maintain archive dates; give those records a fresh grace period.
      changes = { archivedAt: now, statusSince, updatedAt: now };
      fields = ["archivedAt", "statusSince", "updatedAt"];
    } else if (cur.hidden && now - cur.archivedAt >= ARCHIVE_RETENTION_MS) {
      remove = true;
    } else if (!cur.hidden && AUTO_ARCHIVE_STATUSES.has(cur.status) &&
      now - statusSince >= AUTO_ARCHIVE_MS) {
      changes = { hidden: true, archivedAt: now, statusSince, updatedAt: now };
      fields = ["hidden", "archivedAt", "statusSince", "updatedAt"];
    } else if (!cur.hidden && AUTO_ARCHIVE_STATUSES.has(cur.status) &&
      !cur.statusSince && !cur.updatedAt) {
      changes = { statusSince: now, updatedAt: now };
      fields = ["statusSince", "updatedAt"];
    } else {
      continue;
    }
    try {
      if (remove) {
        if (!cur.updateTime) throw new Error("Cannot verify an archived order's latest version.");
        const q = new URLSearchParams({ "currentDocument.updateTime": cur.updateTime });
        await api(`${DOCS()}/${encodeURIComponent(cur.id)}?${q}`, { method: "DELETE" });
        await forgetContact(cur.id, cur.updateTime);
      } else {
        await conditionalPatch(cur, changes, fields);
      }
    } catch (error) {
      if (!CONFLICT_CODES.includes(error.code) && error.code !== "NOT_FOUND") throw error;
      try {
        await fetchOne(cur.id);
      } catch (freshError) {
        if (freshError.code !== "NOT_FOUND") throw freshError;
        await forgetContact(cur.id, cur.updateTime);
      }
    }
  }
}

const DASH_CLAIM_REQUIRED =
  "Start this claim from its claimed Pound list lead on Dash (dash.metapcs.com or metapcs-platform.web.app). Shopify and the team log can only update orders that are already claimed.";

async function upsert(input, sender) {
  const a = await getAuth();
  if (!a) throw new Error("Not signed in.");
  const id = orderKey(input.order);
  if (!id) throw new Error("Order number is required.");
  if (input.replaceBuildType === true &&
      (!["", "yes"].includes(input.watercooled) || !["", "yes"].includes(input.custom) ||
       (input.watercooled === "yes" && input.custom === "yes")))
    throw new Error("Choose either Watercooled or Custom build, or leave both off for RTS.");
  if (input.status !== undefined && (!STATUSES.includes(input.status) || input.status === "not_contacted"))
    throw new Error("Choose a valid contact status.");
  const status = input.status || "texted";
  const cached = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY]
    ?.items?.[id];
  // Callers pass what the user was looking at; fall back to the cache when they don't.
  let expect =
    input.expect !== undefined
      ? input.expect
      : cached
        ? cached.updateTime
        : null;
  // The record the precondition guarantees we're replacing (null = brand new order).
  let prev = expect === null ? null : cached;
  if (expect !== null && (!expect || cached?.updateTime !== expect)) {
    // Cached before updateTime was tracked, or the cache moved on: compare against the live doc.
    const fresh = await freshForChange(id, cached?.updateTime);
    const stale = expect
      ? fresh.updateTime !== expect
      : cached && (fresh.status !== cached.status || fresh.uid !== cached.uid);
    if (stale) throw await conflictError(fresh, a);
    prev = fresh;
    expect = fresh.updateTime;
  }
  // New or unclaimed orders can only be claimed from the side panel with a Dash Pound list lead open.
  const claimed = prev && prev.status !== "not_contacted";
  if (!claimed && (sender?.tab || !/^WL-\d+$/.test(input.lead || "")))
    throw new Error(DASH_CLAIM_REQUIRED);
  const now = Date.now();
  // Archiving does not release a claim or transfer ownership.
  const owner = claimed
    ? prev
    : { by: a.name, uid: a.uid, ts: now, note: "", variant: "", overcome: false, nudged: false };
  // New contacts get a random script variant; existing ones keep theirs so outcomes stay attributed.
  const variant = VARIANT_IDS.includes(owner.variant)
    ? owner.variant
    : VARIANT_IDS.includes(input.variant)
      ? input.variant
      : status === "texted"
        ? randomVariant()
        : "";
  const contact = {
    id,
    order: String(input.order).trim(),
    note: input.note ?? owner.note ?? "",
    status,
    statusValid: true,
    variant,
    overcome: !!(input.overcome ?? owner.overcome),
    nudged: !!(input.nudged ?? owner.nudged),
    by: owner.by,
    uid: owner.uid,
    ts: owner.ts,
    hidden: false,
    statusSince: !claimed || prev.status !== status || prev.hidden
      ? now : statusStart(prev, now),
    archivedAt: 0,
    retentionUpdatedAt: now,
    updatedAt: now,
  };
  try {
    contact.updateTime = await writeDoc(contact, { expect });
  } catch (e) {
    if (!CONFLICT_CODES.includes(e.code) && e.code !== "NOT_FOUND") throw e;
    throw await conflictError(await freshForChange(id, cached?.updateTime), a);
  }
  // Blank unknown fields keep saved values; an explicit build-type change can clear them.
  const known = Object.fromEntries(
    PRIVATE_FIELDS.filter((f) => String(input[f] ?? "").trim()).map((f) => [f, input[f]]),
  );
  if (input.replaceBuildType === true) {
    known.watercooled = input.watercooled;
    known.custom = input.custom;
  }
  const priv = await savePrivate(id, known);
  const full = {
    phone: "",
    email: "",
    customer: "",
    systemPrice: "",
    watercooled: "",
    custom: "",
    systems: "",
    ...priv,
    ...contact,
  };
  await patchCache((items) => {
    items[id] = full;
  });
}

// Customer details live only on this device, so editing them never writes to Firestore.
async function updateDetails({
  id,
  phone,
  email,
  customer,
  systemPrice,
  watercooled,
  custom,
  systems,
}) {
  const cur = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY]?.items?.[
    id
  ];
  if (!cur) throw new Error("Order not found. Refresh and try again.");
  const priv = await savePrivate(id, {
    phone,
    email: email || "",
    customer,
    systemPrice,
    watercooled: watercooled || "",
    custom: custom || "",
    systems,
  }, { requireContact: true });
  await patchCache((items) => {
    if (!items[id]) throw new Error("Order no longer exists. Refresh and try again.");
    items[id] = { ...items[id], ...priv };
  });
}

// Records which script variant was sent and whether the declined / no-answer follow-ups went out.
// Only these fields are written, so a teammate's newer status is never reverted.
async function markScript({ id, variant, overcome, nudged }) {
  const a = await getAuth();
  if (!a) throw new Error("Not signed in.");
  let cur = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY]?.items?.[
    id
  ];
  if (!cur) throw new Error("Order not found. Refresh and try again.");
  if (!cur.updateTime) cur = await freshForChange(id, cur.updateTime);
  const fields = ["updatedAt"];
  const contact = { ...cur, updatedAt: Date.now() };
  if (VARIANT_IDS.includes(variant) && !cur.variant) {
    contact.variant = variant;
    fields.push("variant");
  }
  if (overcome && !cur.overcome) {
    contact.overcome = true;
    fields.push("overcome");
  }
  if (nudged && !cur.nudged) {
    contact.nudged = true;
    fields.push("nudged");
  }
  if (fields.length === 1) return;
  const statusSince = statusStart(cur, contact.updatedAt);
  if (cur.statusSince !== statusSince || cur.retentionUpdatedAt !== cur.updatedAt) {
    contact.statusSince = statusSince;
    fields.push("statusSince");
  }
  await saveAction(cur, contact, fields, a);
}

async function actionContact(id, expect, a) {
  const cached = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY]?.items?.[id];
  if (!cached) throw new Error("Order not found. Refresh and try again.");
  const cur = !expect || cached.updateTime !== expect
    ? await freshForChange(id, cached.updateTime) : cached;
  if (expect && cur.updateTime !== expect) throw await conflictError(cur, a);
  if (!cur.updateTime) throw new Error("Cannot verify this order's latest version. Refresh and try again.");
  return cur;
}

async function saveAction(cur, changes, fields, a) {
  try {
    await conditionalPatch(cur, changes, fields);
  } catch (error) {
    if (!CONFLICT_CODES.includes(error.code) && error.code !== "NOT_FOUND") throw error;
    throw await conflictError(await freshForChange(cur.id, cur.updateTime), a);
  }
}

async function remove({ id, expect }) {
  const a = await getAuth();
  if (!a) throw new Error("Not signed in.");
  const cur = await actionContact(id, expect, a);
  if (cur.status === "paid") throw new Error("Paid warranty entries cannot be archived.");
  if (cur.status === "not_contacted") throw new Error("Unclaimed orders cannot be archived.");
  if (cur.hidden) throw new Error("This order is already archived.");
  const now = Date.now();
  await saveAction(cur, {
    hidden: true,
    archivedAt: now,
    statusSince: statusStart(cur, now),
    updatedAt: now,
  }, ["hidden", "archivedAt", "statusSince", "updatedAt"], a);
}

async function restore({ id, expect }) {
  const a = await getAuth();
  if (!a) throw new Error("Not signed in.");
  const cur = await actionContact(id, expect, a);
  if (!cur.hidden || cur.status === "not_contacted")
    throw new Error("This order is not archived.");
  const now = Date.now();
  await saveAction(cur, {
    hidden: false,
    archivedAt: 0,
    statusSince: now,
    updatedAt: now,
  }, ["hidden", "archivedAt", "statusSince", "updatedAt"], a);
}

async function unclaim({ id, expect }) {
  const a = await getAuth();
  if (!a) throw new Error("Not signed in.");
  const cur = await actionContact(id, expect, a);
  if (cur.status === "not_contacted") throw new Error("This order is already unclaimed.");
  if (cur.uid !== a.uid) throw new Error(`Only ${cur.by || "the owner"} can unclaim this order.`);
  const now = Date.now();
  await saveAction(cur, {
    status: "not_contacted", hidden: true, archivedAt: 0, statusSince: now, updatedAt: now,
  }, ["status", "hidden", "archivedAt", "statusSince", "updatedAt"], a);
}

// Admin only: deletes phone/email/customer/price from every Firestore document.
async function scrub() {
  const a = await getAuth();
  if (a?.email?.toLowerCase() !== CFG.adminEmail)
    throw new Error("Not allowed.");
  const parent = DOCS().replace(/\/[^/]+$/, "");
  const writes = [];
  let pageToken = "";
  do {
    const q = new URLSearchParams({ pageSize: "300" });
    if (pageToken) q.set("pageToken", pageToken);
    const j = await api(`${DOCS()}?${q}`);
    for (const d of j.documents || []) {
      writes.push({
        update: { name: d.name, fields: {} },
        updateMask: { fieldPaths: PRIVATE_FIELDS },
      });
    }
    pageToken = j.nextPageToken || "";
  } while (pageToken);
  for (let i = 0; i < writes.length; i += 400) {
    await api(`${parent.replace(/\/documents.*/, "/documents")}:commit`, {
      method: "POST",
      body: JSON.stringify({ writes: writes.slice(i, i + 400) }),
    });
  }
}

// ---------- messaging / polling ----------
importScripts("warranty/lib/leads.js");
const dashboardLeadStore = self.createDashboardLeadStore({ api, getAuth, documents: DOCS });
const handlers = {
  dashboardLeadSave: (lead) => dashboardLeadStore.save(lead),
  dashboardLeadRemove: (lead) => dashboardLeadStore.remove(lead),
  dashboardLeadRefresh: () => dashboardLeadStore.refresh(),
  signIn,
  signUp,
  signOut,
  upsert,
  updateDetails,
  markScript,
  scrub,
  importPrivate,
  enrich,
  remove,
  restore,
  unclaim,
  refresh: (p) => refreshContacts(!!p?.force),
};

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  const fn = handlers[msg?.type];
  if (!fn) return false;
  Promise.resolve()
    .then(() => fn(msg.payload || msg, sender))
    .then((count) => respond({ ok: true, count }))
    .catch((e) => respond({ ok: false, error: e.message }));
  return true;
});

function setupAlarm() {
  chrome.alarms.create("wt-poll", {
    periodInMinutes: Math.max(0.5, CFG.pollSeconds / 60),
  });
  chrome.alarms.create("wt-retention", { periodInMinutes: 60 });
}
chrome.runtime.onInstalled.addListener(setupAlarm);
chrome.runtime.onStartup.addListener(setupAlarm);
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "wt-poll" && alarm.name !== "wt-retention") return;
  // Skip background polls while the user is away; the next page load or panel open catches up.
  if (alarm.name === "wt-poll") {
    const state = chrome.idle ? await chrome.idle.queryState(300) : "active";
    if (state !== "active") return;
  }
  if (await getAuth()) {
    try {
      await refreshContacts(true);
    } catch (error) {
      console.error("[Dashboard Tool] Warranty sync and retention failed:", error);
    }
  }
});
chrome.runtime.onInstalled.addListener(() =>
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }),
);
chrome.runtime.onStartup.addListener(() =>
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }),
);
})();
