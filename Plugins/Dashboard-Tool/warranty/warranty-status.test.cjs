const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const DAY = 24 * 60 * 60 * 1000;

function harness() {
  let now = Date.now();
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const storage = {
    wtAuth: { uid: "u1", name: "Alex", idToken: "test", expiresAt: now + 1000 * DAY },
  };
  const docs = new Map();
  let version = 0;
  let messageHandler;
  let alarmHandler;
  let requestHook;
  let storageGetHook;
  let deleteFailure = false;
  const alarms = [];
  const installed = [];
  const noopEvent = { addListener() {} };
  const chrome = {
    storage: { local: {
      async get(keys) {
        if (storageGetHook) await storageGetHook(keys);
        return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((key) => [key, storage[key]]));
      },
      async set(values) { Object.assign(storage, values); },
      async remove(keys) { for (const key of [].concat(keys)) delete storage[key]; },
    } },
    runtime: {
      onMessage: { addListener(fn) { messageHandler = fn; } },
      onInstalled: { addListener(fn) { installed.push(fn); } },
      onStartup: noopEvent,
    },
    alarms: {
      onAlarm: { addListener(fn) { alarmHandler = fn; } },
      create(name, options) { alarms.push({ name, ...options }); },
    },
    idle: { async queryState() { return "idle"; } },
    sidePanel: { setPanelBehavior() {} },
  };
  const response = (ok, data, status = 200) => ({ ok, status, async json() { return data; } });
  const fetch = async (input, options = {}) => {
    const url = new URL(input);
    const id = decodeURIComponent(url.pathname.split("/").pop());
    if (requestHook) await requestHook(url, options);
    if (options.method === "POST" && url.pathname.endsWith(":runQuery")) {
      const since = Number(JSON.parse(options.body).structuredQuery.where.fieldFilter.value.integerValue);
      return response(true, [...docs.values()]
        .filter((document) => Number(document.fields.updatedAt?.integerValue || 0) > since)
        .map((document) => ({ document })));
    }
    if (!options.method && id === "warrantyContacts")
      return response(true, { documents: [...docs.values()] });
    if (options.method === "PATCH" || options.method === "DELETE") {
      const current = docs.get(id);
      if (options.method === "DELETE" && deleteFailure)
        return response(false, { error: { status: "PERMISSION_DENIED", message: "Delete denied" } }, 403);
      if (url.searchParams.has("currentDocument.updateTime") && !current)
        return response(false, { error: { status: "NOT_FOUND", message: "Missing document" } }, 404);
      if ((url.searchParams.get("currentDocument.exists") === "false" && current) ||
          (url.searchParams.has("currentDocument.updateTime") &&
            url.searchParams.get("currentDocument.updateTime") !== current?.updateTime)) {
        return response(false, { error: { status: "FAILED_PRECONDITION", message: "stale" } }, 412);
      }
      if (options.method === "DELETE") {
        docs.delete(id);
        return response(true, null, 204);
      }
      const fields = { ...current?.fields, ...JSON.parse(options.body).fields };
      const doc = { name: `${url.origin}${url.pathname}`, fields, updateTime: `v${String(++version).padStart(6, "0")}` };
      docs.set(id, doc);
      return response(true, doc);
    }
    if (!options.method && docs.has(id)) return response(true, docs.get(id));
    if (!options.method) return response(false, { error: { status: "NOT_FOUND", message: "Missing document" } }, 404);
    throw new Error(`Unexpected request: ${options.method} ${url.pathname}`);
  };
  const context = vm.createContext({ chrome, fetch, URL, URLSearchParams, console, Date: Clock });
  context.self = context;
  context.importScripts = (file) => {
    if (file === "warranty/config.js") {
      context.WARRANTY_CONFIG = { projectId: "test", collection: "warrantyContacts", pollSeconds: 300 };
    } else {
      vm.runInContext(fs.readFileSync(path.join(__dirname, "lib", "leads.js"), "utf8"), context);
    }
  };
  vm.runInContext(fs.readFileSync(path.join(__dirname, "background.js"), "utf8"), context);
  const send = (type, payload, sender = {}) => new Promise((resolve) => messageHandler({ type, payload }, sender, resolve));
  return {
    send, storage, docs, alarms,
    now: () => now,
    advance: (ms) => { now += ms; },
    onRequest: (fn) => { requestHook = fn; },
    onStorageGet: (fn) => { storageGetHook = fn; },
    denyDeletes: () => { deleteFailure = true; },
    install: () => installed.forEach((fn) => fn()),
    alarm: (name) => alarmHandler({ name }),
  };
}

test("only a Dash Pound list lead in the side panel can start or retake a claim", async () => {
  const { send, storage } = harness();
  const shopify = { tab: { id: 1, url: "https://admin.shopify.com/store/test/orders/1" } };
  let result = await send("upsert", { order: "MPC12345", status: "called", expect: null });
  assert.equal(result.ok, false);
  assert.match(result.error, /Pound list lead on Dash/);
  result = await send("upsert", { order: "MPC12345", status: "called", lead: "WL-1", expect: null }, shopify);
  assert.equal(result.ok, false);
  assert.equal(storage.wtContacts, undefined);
  result = await send("upsert", { order: "MPC12345", status: "called", lead: "WL-1", expect: null });
  assert.equal(result.ok, true, result.error);
  let record = storage.wtContacts.items.MPC12345;
  result = await send("upsert", { order: "MPC12345", status: "emailed", expect: record.updateTime }, shopify);
  assert.equal(result.ok, true, result.error);
  record = storage.wtContacts.items.MPC12345;
  assert.equal(record.status, "emailed");
  await send("unclaim", { id: record.id, expect: record.updateTime });
  record = storage.wtContacts.items.MPC12345;
  result = await send("upsert", { order: "MPC12345", status: "called", expect: record.updateTime }, shopify);
  assert.equal(result.ok, false);
  assert.match(result.error, /Pound list lead on Dash/);
  assert.equal(storage.wtContacts.items.MPC12345.status, "not_contacted");
});

test("called and emailed persist, unclaim syncs as not contacted, and another user can reclaim", async () => {
  const { send, storage, docs } = harness();
  let result = await send("upsert", { order: "MPC12345", status: "called", lead: "WL-1", expect: null });
  assert.equal(result.ok, true, result.error);
  assert.equal(storage.wtContacts.items.MPC12345.status, "called");
  let record = storage.wtContacts.items.MPC12345;
  result = await send("upsert", { order: "MPC12345", status: "emailed", expect: record.updateTime });
  assert.equal(result.ok, true, result.error);
  record = storage.wtContacts.items.MPC12345;
  assert.equal(record.status, "emailed");
  result = await send("unclaim", { id: record.id, expect: record.updateTime });
  assert.equal(result.ok, true, result.error);
  record = storage.wtContacts.items.MPC12345;
  assert.equal(record.status, "not_contacted");
  assert.equal(record.hidden, true);
  assert.equal(docs.get(record.id).fields.status.stringValue, "not_contacted");
  storage.wtAuth = { ...storage.wtAuth, uid: "u2", name: "Sam" };
  result = await send("upsert", { order: record.order, status: "called", lead: "WL-2", expect: record.updateTime });
  assert.equal(result.ok, true, result.error);
  assert.equal(storage.wtContacts.items.MPC12345.uid, "u2");
  assert.equal(storage.wtContacts.items.MPC12345.hidden, false);
});

test("unclaim rejects other users and stale versions without modifying the record", async () => {
  const { send, storage, docs } = harness();
  await send("upsert", { order: "MPC12345", status: "called", lead: "WL-1", expect: null });
  const original = storage.wtContacts.items.MPC12345;
  storage.wtAuth = { ...storage.wtAuth, uid: "u2", name: "Sam" };
  let result = await send("unclaim", { id: original.id, expect: original.updateTime });
  assert.equal(result.ok, false);
  assert.match(result.error, /only .* can unclaim/i);
  storage.wtAuth = { ...storage.wtAuth, uid: "u1", name: "Alex" };
  const updated = docs.get(original.id);
  docs.set(original.id, { ...updated, updateTime: "newer" });
  result = await send("unclaim", { id: original.id, expect: original.updateTime });
  assert.equal(result.ok, false);
  assert.match(result.error, /changed since/i);
  assert.equal(docs.get(original.id).fields.status.stringValue, "called");
});

test("incremental refresh propagates an unclaim from another device", async () => {
  const { send, storage, docs } = harness();
  await send("upsert", { order: "MPC12345", status: "emailed", lead: "WL-1", expect: null });
  let result = await send("refresh", { force: true });
  assert.equal(result.ok, true, result.error);
  const original = docs.get("MPC12345");
  docs.set("MPC12345", {
    ...original,
    updateTime: "v999",
    fields: {
      ...original.fields,
      status: { stringValue: "not_contacted" },
      hidden: { booleanValue: true },
      updatedAt: { integerValue: String(Date.now()) },
    },
  });
  result = await send("refresh", { force: true });
  assert.equal(result.ok, true, result.error);
  assert.equal(storage.wtContacts.items.MPC12345.status, "not_contacted");
  assert.equal(storage.wtContacts.items.MPC12345.hidden, true);
});

async function logContact(h, order, status, details = {}) {
  const result = await h.send("upsert", { order, status, lead: "WL-1", expect: null, ...details });
  assert.equal(result.ok, true, result.error);
}

async function refresh(h) {
  const result = await h.send("refresh", { force: true });
  assert.equal(result.ok, true, result.error);
}

test("explicit build-type changes replace old flags while status-only updates preserve them", async () => {
  const h = harness();
  await logContact(h, "MPC12345", "called", { watercooled: "yes", custom: "yes", systemPrice: "4000" });
  const update = (details) => h.send("upsert", {
    order: "MPC12345", status: "called", expect: h.storage.wtContacts.items.MPC12345.updateTime, ...details,
  });
  assert.equal((await update({})).ok, true);
  assert.equal(h.storage.wtPrivate.MPC12345.watercooled, "yes");
  assert.equal(h.storage.wtPrivate.MPC12345.custom, "yes");

  for (const [watercooled, custom] of [["", "yes"], ["yes", ""], ["", ""]]) {
    const result = await update({ replaceBuildType: true, watercooled, custom, systems: "manual" });
    assert.equal(result.ok, true, result.error);
    assert.equal(h.storage.wtPrivate.MPC12345.watercooled, watercooled);
    assert.equal(h.storage.wtPrivate.MPC12345.custom, custom);
  }
  const before = h.storage.wtContacts.items.MPC12345.updateTime;
  const invalid = await update({ replaceBuildType: true, watercooled: "yes", custom: "yes" });
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /either Watercooled or Custom/);
  assert.equal(h.storage.wtContacts.items.MPC12345.updateTime, before);
});

test("archives 30 days after the latest status change and deletes after 60 days in the archive", async () => {
  const h = harness();
  await logContact(h, "MPC12345", "texted", { customer: "Customer", phone: "5551234567" });
  await refresh(h);
  h.advance(29 * DAY);
  let record = h.storage.wtContacts.items.MPC12345;
  const result = await h.send("upsert", { order: record.order, status: "called", expect: record.updateTime });
  assert.equal(result.ok, true, result.error);
  assert.equal(h.storage.wtContacts.items.MPC12345.statusSince, h.now());

  h.advance(30 * DAY - 1);
  await refresh(h);
  assert.equal(h.storage.wtContacts.items.MPC12345.hidden, false);
  h.advance(1);
  await refresh(h);
  record = h.storage.wtContacts.items.MPC12345;
  assert.equal(record.hidden, true);
  assert.equal(record.archivedAt, h.now());

  h.advance(60 * DAY - 1);
  await refresh(h);
  assert.ok(h.docs.has(record.id));
  h.advance(1);
  await refresh(h);
  assert.equal(h.docs.has(record.id), false);
  assert.equal(h.storage.wtContacts.items[record.id], undefined);
  assert.equal(h.storage.wtPrivate[record.id], undefined);
});

test("same-status saves do not reset the timer; paid and other outcomes stay active", async () => {
  const h = harness();
  await logContact(h, "MPC10001", "texted");
  await logContact(h, "MPC10002", "emailed");
  const outcomes = ["agreed", "declined", "none", "wrong_number_error", "already_has", "paid"];
  for (let i = 0; i < outcomes.length; i++)
    await logContact(h, `MPC2000${i}`, outcomes[i]);
  const initial = h.storage.wtContacts.items.MPC10001.statusSince;
  const paid = h.storage.wtContacts.items.MPC20005;
  const refused = await h.send("remove", { id: paid.id, expect: paid.updateTime });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /paid.*cannot be archived/i);

  h.advance(15 * DAY);
  const current = h.storage.wtContacts.items.MPC10001;
  const saved = await h.send("upsert", { order: current.order, status: "texted", expect: current.updateTime });
  assert.equal(saved.ok, true, saved.error);
  assert.equal(h.storage.wtContacts.items.MPC10001.statusSince, initial);
  h.advance(15 * DAY);
  await refresh(h);
  assert.equal(h.storage.wtContacts.items.MPC10001.hidden, true);
  assert.equal(h.storage.wtContacts.items.MPC10002.hidden, true);
  for (let i = 0; i < outcomes.length; i++)
    assert.equal(h.storage.wtContacts.items[`MPC2000${i}`].hidden, false, outcomes[i]);

  h.advance(60 * DAY);
  await refresh(h);
  assert.ok(h.docs.has(paid.id));
  assert.equal(h.storage.wtContacts.items[paid.id].status, "paid");
  assert.equal(h.storage.wtContacts.items[paid.id].hidden, false);
});

test("an archived claim can be updated from Shopify without transferring ownership", async () => {
  const h = harness();
  await logContact(h, "MPC12345", "none");
  const original = h.storage.wtContacts.items.MPC12345;
  let result = await h.send("remove", { id: original.id, expect: original.updateTime });
  assert.equal(result.ok, true, result.error);
  const archived = h.storage.wtContacts.items.MPC12345;
  assert.equal(archived.hidden, true);
  h.storage.wtAuth = { ...h.storage.wtAuth, uid: "u2", name: "Sam" };
  result = await h.send("upsert", {
    order: archived.order, status: "called", expect: archived.updateTime,
  }, { tab: { id: 1, url: "https://admin.shopify.com/store/test/orders/1" } });
  assert.equal(result.ok, true, result.error);
  const restored = h.storage.wtContacts.items.MPC12345;
  assert.equal(restored.uid, "u1");
  assert.equal(restored.by, "Alex");
  assert.equal(restored.ts, original.ts);
  assert.equal(restored.hidden, false);
  assert.equal(restored.archivedAt, 0);
  assert.equal(restored.status, "called");
});

test("restoring an archived entry cancels deletion and starts a fresh status window", async () => {
  const h = harness();
  await logContact(h, "MPC12345", "texted");
  h.advance(30 * DAY);
  await refresh(h);
  const archived = h.storage.wtContacts.items.MPC12345;
  h.advance(59 * DAY);
  const result = await h.send("restore", { id: archived.id, expect: archived.updateTime });
  assert.equal(result.ok, true, result.error);
  assert.equal(h.storage.wtContacts.items[archived.id].archivedAt, 0);
  h.advance(30 * DAY - 1);
  await refresh(h);
  assert.equal(h.storage.wtContacts.items[archived.id].hidden, false);
  h.advance(1);
  await refresh(h);
  assert.equal(h.storage.wtContacts.items[archived.id].hidden, true);
  assert.equal(h.storage.wtContacts.items[archived.id].archivedAt, h.now());
  assert.ok(h.docs.has(archived.id));
});

test("legacy archives get a full grace period, while hidden paid entries are restored", async () => {
  const h = harness();
  await logContact(h, "MPC10001", "none");
  await logContact(h, "MPC10002", "paid");
  await logContact(h, "MPC10003", "called");
  const unclaimed = h.storage.wtContacts.items.MPC10003;
  assert.equal((await h.send("unclaim", { id: unclaimed.id, expect: unclaimed.updateTime })).ok, true);
  h.advance(100 * DAY);
  for (const id of ["MPC10001", "MPC10002"]) {
    const doc = h.docs.get(id);
    const fields = { ...doc.fields, hidden: { booleanValue: true }, updatedAt: { integerValue: String(h.now() - 100 * DAY) } };
    if (id === "MPC10001") delete fields.archivedAt;
    else fields.archivedAt = { integerValue: String(h.now() - 100 * DAY) };
    h.docs.set(id, { ...doc, fields, updateTime: `z${id}` });
  }
  await refresh(h);
  assert.equal(h.storage.wtContacts.items.MPC10001.archivedAt, h.now());
  assert.equal(h.storage.wtContacts.items.MPC10002.hidden, false);
  assert.equal(h.storage.wtContacts.items.MPC10002.archivedAt, 0);
  assert.equal(h.storage.wtContacts.items.MPC10003.status, "not_contacted");
  h.advance(60 * DAY - 1);
  await refresh(h);
  assert.ok(h.docs.has("MPC10001"));
  h.advance(1);
  await refresh(h);
  assert.equal(h.docs.has("MPC10001"), false);
  assert.ok(h.docs.has("MPC10002"));
  assert.ok(h.docs.has("MPC10003"));
});

test("updates from older clients conservatively restart the affected retention clock", async () => {
  const active = harness();
  await logContact(active, "MPC12345", "texted");
  active.advance(29 * DAY);
  let doc = active.docs.get("MPC12345");
  active.docs.set("MPC12345", {
    ...doc,
    updateTime: "z-legacy",
    fields: {
      ...doc.fields,
      status: { stringValue: "called" },
      updatedAt: { integerValue: String(active.now()) },
    },
  });
  active.advance(2 * DAY);
  await refresh(active);
  assert.equal(active.storage.wtContacts.items.MPC12345.hidden, false);
  active.advance(28 * DAY);
  await refresh(active);
  assert.equal(active.storage.wtContacts.items.MPC12345.hidden, true);

  const archived = harness();
  await logContact(archived, "MPC54321", "none");
  const current = archived.storage.wtContacts.items.MPC54321;
  assert.equal((await archived.send("remove", { id: current.id, expect: current.updateTime })).ok, true);
  archived.advance(61 * DAY);
  doc = archived.docs.get("MPC54321");
  archived.docs.set("MPC54321", {
    ...doc, updateTime: "z-legacy",
    fields: { ...doc.fields, updatedAt: { integerValue: String(archived.now()) } },
  });
  await refresh(archived);
  assert.equal(archived.storage.wtContacts.items.MPC54321.archivedAt, archived.now());
  assert.ok(archived.docs.has("MPC54321"));
  archived.advance(60 * DAY);
  await refresh(archived);
  assert.equal(archived.docs.has("MPC54321"), false);
});

test("unsupported statuses are not automatically archived or deleted", async () => {
  const h = harness();
  await logContact(h, "MPC12345", "none");
  const current = h.storage.wtContacts.items.MPC12345;
  assert.equal((await h.send("remove", { id: current.id, expect: current.updateTime })).ok, true);
  h.advance(61 * DAY);
  const doc = h.docs.get("MPC12345");
  h.docs.set("MPC12345", {
    ...doc, updateTime: "z-new-status",
    fields: { ...doc.fields, status: { stringValue: "future_status" } },
  });
  await refresh(h);
  assert.ok(h.docs.has("MPC12345"));
  assert.equal(h.storage.wtContacts.items.MPC12345.statusValid, false);
});

test("concurrent payment prevents both automatic archiving and deletion", async () => {
  for (const operation of ["archive", "delete"]) {
    const h = harness();
    await logContact(h, "MPC12345", "called");
    if (operation === "delete") {
      const current = h.storage.wtContacts.items.MPC12345;
      assert.equal((await h.send("remove", { id: current.id, expect: current.updateTime })).ok, true);
    }
    h.advance((operation === "archive" ? 30 : 60) * DAY);
    h.onRequest((url, options) => {
      const isArchive = options.method === "PATCH" &&
        url.searchParams.getAll("updateMask.fieldPaths").includes("hidden");
      if (!(operation === "archive" ? isArchive : options.method === "DELETE")) return;
      h.onRequest(null);
      const doc = h.docs.get("MPC12345");
      h.docs.set("MPC12345", {
        ...doc,
        updateTime: "z-newer",
        fields: {
          ...doc.fields,
          status: { stringValue: "paid" },
          hidden: { booleanValue: false },
          archivedAt: { integerValue: "0" },
          updatedAt: { integerValue: String(h.now()) },
        },
      });
    });
    await refresh(h);
    assert.ok(h.docs.has("MPC12345"), operation);
    assert.equal(h.storage.wtContacts.items.MPC12345.status, "paid", operation);
    assert.equal(h.storage.wtContacts.items.MPC12345.hidden, false, operation);
  }
});

test("full refresh removes remotely deleted entries and their local details only", async () => {
  const h = harness();
  await logContact(h, "MPC12345", "called", { customer: "Customer" });
  await refresh(h);
  h.storage.wtPrivate.UNRELATED = { customer: "Imported separately" };
  h.docs.delete("MPC12345");
  h.advance(DAY);
  await refresh(h);
  assert.equal(h.storage.wtContacts.items.MPC12345, undefined);
  assert.equal(h.storage.wtPrivate.MPC12345, undefined);
  assert.equal(h.storage.wtPrivate.UNRELATED.customer, "Imported separately");
});

test("a device signed out during deletion removes known local details after signing back in", async () => {
  const h = harness();
  await logContact(h, "MPC12345", "called", { customer: "Customer" });
  await refresh(h);
  const auth = h.storage.wtAuth;
  assert.equal((await h.send("signOut")).ok, true);
  assert.equal(h.storage.wtContacts, undefined);
  assert.ok(h.storage.wtKnownContacts.includes("MPC12345"));
  h.docs.delete("MPC12345");
  h.storage.wtAuth = auth;
  await refresh(h);
  assert.equal(h.storage.wtPrivate.MPC12345, undefined);
  assert.equal(h.storage.wtKnownContacts.length, 0);
});

test("stale script updates cannot recreate an entry deleted by another device", async () => {
  const h = harness();
  await logContact(h, "MPC12345", "called");
  h.docs.delete("MPC12345");
  const result = await h.send("markScript", { id: "MPC12345", variant: "v1" });
  assert.equal(result.ok, false);
  assert.match(result.error, /no longer exists/i);
  assert.equal(h.docs.has("MPC12345"), false);
  assert.equal(h.storage.wtContacts.items.MPC12345, undefined);
});

test("in-flight detail updates do not recreate locally deleted entries", async () => {
  const h = harness();
  await logContact(h, "MPC12345", "none", { customer: "Customer" });
  let reads = 0;
  h.onStorageGet((keys) => {
    if (keys !== "wtContacts" || ++reads !== 2) return;
    h.onStorageGet(null);
    h.docs.delete("MPC12345");
    delete h.storage.wtContacts.items.MPC12345;
    delete h.storage.wtPrivate.MPC12345;
  });
  const result = await h.send("updateDetails", { id: "MPC12345", customer: "Edited" });
  assert.equal(result.ok, false);
  assert.match(result.error, /no longer exists/i);
  assert.equal(h.storage.wtContacts.items.MPC12345, undefined);
  assert.equal(h.storage.wtPrivate.MPC12345, undefined);
  const enrich = await h.send("enrich", { order: "MPC12345", customer: "Edited" });
  assert.equal(enrich.ok, false);
  assert.equal(h.storage.wtPrivate.MPC12345, undefined);
});

test("deletion failures are reported without losing the archived entry", async () => {
  const h = harness();
  await logContact(h, "MPC12345", "none");
  const current = h.storage.wtContacts.items.MPC12345;
  assert.equal((await h.send("remove", { id: current.id, expect: current.updateTime })).ok, true);
  h.advance(60 * DAY);
  h.denyDeletes();
  const result = await h.send("refresh", { force: true });
  assert.equal(result.ok, false);
  assert.match(result.error, /Delete denied/);
  assert.ok(h.docs.has("MPC12345"));
  assert.equal(h.storage.wtContacts.items.MPC12345.hidden, true);
});

test("the hourly retention alarm runs while the user is idle", async () => {
  const h = harness();
  h.install();
  assert.equal(h.alarms.find((alarm) => alarm.name === "wt-retention").periodInMinutes, 60);
  await logContact(h, "MPC12345", "called");
  h.advance(30 * DAY);
  await h.alarm("wt-poll");
  assert.equal(h.storage.wtContacts.items.MPC12345.hidden, false);
  await h.alarm("wt-retention");
  assert.equal(h.storage.wtContacts.items.MPC12345.hidden, true);
});
