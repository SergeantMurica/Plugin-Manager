const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function harness() {
  const storage = {
    wtAuth: { uid: "u1", name: "Alex", idToken: "test", expiresAt: Date.now() + 3600000 },
  };
  const docs = new Map();
  let version = 0;
  let messageHandler;
  const noopEvent = { addListener() {} };
  const chrome = {
    storage: { local: {
      async get(keys) {
        return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((key) => [key, storage[key]]));
      },
      async set(values) { Object.assign(storage, values); },
      async remove(keys) { for (const key of [].concat(keys)) delete storage[key]; },
    } },
    runtime: {
      onMessage: { addListener(fn) { messageHandler = fn; } },
      onInstalled: noopEvent,
      onStartup: noopEvent,
    },
    alarms: { onAlarm: noopEvent, create() {} },
    sidePanel: { setPanelBehavior() {} },
  };
  const response = (ok, data, status = 200) => ({ ok, status, async json() { return data; } });
  const fetch = async (input, options = {}) => {
    const url = new URL(input);
    const id = decodeURIComponent(url.pathname.split("/").pop());
    if (options.method === "POST" && url.pathname.endsWith(":runQuery"))
      return response(true, [...docs.values()].map((document) => ({ document })));
    if (!options.method && id === "warrantyContacts")
      return response(true, { documents: [...docs.values()] });
    if (options.method === "PATCH") {
      const current = docs.get(id);
      if ((url.searchParams.get("currentDocument.exists") === "false" && current) ||
          (url.searchParams.has("currentDocument.updateTime") &&
            url.searchParams.get("currentDocument.updateTime") !== current?.updateTime)) {
        return response(false, { error: { status: "FAILED_PRECONDITION", message: "stale" } }, 412);
      }
      const fields = { ...current?.fields, ...JSON.parse(options.body).fields };
      const doc = { name: `${url.origin}${url.pathname}`, fields, updateTime: `v${++version}` };
      docs.set(id, doc);
      return response(true, doc);
    }
    if (!options.method && docs.has(id)) return response(true, docs.get(id));
    throw new Error(`Unexpected request: ${options.method || "GET"} ${url.pathname}`);
  };
  const context = vm.createContext({ chrome, fetch, URL, URLSearchParams, console });
  context.self = context;
  context.importScripts = (file) => {
    if (file === "warranty/config.js") {
      context.WARRANTY_CONFIG = { projectId: "test", collection: "warrantyContacts", pollSeconds: 300 };
    } else {
      vm.runInContext(fs.readFileSync(path.join(__dirname, "lib", "leads.js"), "utf8"), context);
    }
  };
  vm.runInContext(fs.readFileSync(path.join(__dirname, "background.js"), "utf8"), context);
  const send = (type, payload) => new Promise((resolve) => messageHandler({ type, payload }, {}, resolve));
  return { send, storage, docs };
}

test("called and emailed persist, unclaim syncs as not contacted, and another user can reclaim", async () => {
  const { send, storage, docs } = harness();
  let result = await send("upsert", { order: "MPC12345", status: "called", expect: null });
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
  result = await send("upsert", { order: record.order, status: "called", expect: record.updateTime });
  assert.equal(result.ok, true, result.error);
  assert.equal(storage.wtContacts.items.MPC12345.uid, "u2");
  assert.equal(storage.wtContacts.items.MPC12345.hidden, false);
});

test("unclaim rejects other users and stale versions without modifying the record", async () => {
  const { send, storage, docs } = harness();
  await send("upsert", { order: "MPC12345", status: "called", expect: null });
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
  await send("upsert", { order: "MPC12345", status: "emailed", expect: null });
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
