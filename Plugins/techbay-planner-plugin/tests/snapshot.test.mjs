import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const asModule = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const ordersModule = asModule(await readFile(new URL("../lib/orders.js", import.meta.url), "utf8"));
const clientModule = asModule(`
  export const readFrames = (...args) => globalThis.snapshotClient.readFrames(...args);
  export const fillOrder = async () => ({ ok: true, filled: 1, missing: [] });
  export const requestWorkMateAccess = async () => {};
  export const waitForOrder = async () => {};
`);
const source = (await readFile(new URL("../lib/order-list.js", import.meta.url), "utf8"))
  .replace('"./orders.js"', JSON.stringify(ordersModule))
  .replace('"./workmate-client.js"', JSON.stringify(clientModule));
const { createOrderList } = await import(asModule(source));
const base = "https://admin.shopify.com/store/meta-pcs/apps/work-mate/work-orders";
const orderUrl = (number) => `${base}/SO-%23${number}`;

class Element {
  children = [];
  listeners = {};
  value = "";
  textContent = "";
  hidden = false;
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  addEventListener(name, callback) { this.listeners[name] = callback; }
  dispatchEvent(event) { this.listeners[event.type]?.(event); }
}

function fixture() {
  const elements = new Map();
  globalThis.document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    },
    createElement: () => new Element(),
  };
  const storage = {
    "techbay-local-orders-v1": { old: "capture" },
    "techbay-local-order-lists-v1": { old: "list" },
    "techbay-work-order-notes-v1": { important: "Keep technician notes" },
    "techbay-tool-theme": "meta",
  };
  let reads = 0;
  let tab = { id: 1, url: `${base}?lc=101` };
  let numbers = ["296", "297"];
  let pendingRead;
  globalThis.chrome = {
    tabs: { get: async () => ({ ...tab }) },
    storage: { local: {
      remove: async (keys) => keys.forEach((key) => delete storage[key]),
      set: async () => { throw new Error("List snapshots must never write to storage"); },
      get: async () => { throw new Error("Old snapshots must not be loaded"); },
    } },
  };
  globalThis.snapshotClient = { readFrames: async () => {
    reads++;
    if (pendingRead) await pendingRead;
    return [{
      fieldCount: 0, fields: {}, listDetected: true, listName: "Current location",
      orders: numbers.map((number) => ({
        number: `SO-#${number}`, fields: { dailyUpdate: "Live update" }, columns: {},
      })),
    }];
  } };
  const list = createOrderList(() => {});
  return {
    list, elements, storage,
    get reads() { return reads; },
    follow: async () => list.follow({ ...tab }),
    navigate: (url) => { tab = { ...tab, url }; },
    setNumbers: (values) => { numbers = values; },
    delayRead: (promise) => { pendingRead = promise; },
  };
}

test("startup deletes only old captured order/list storage and never auto-pulls", async () => {
  const f = fixture();
  await f.list.initialize();
  await f.follow();
  await f.follow();
  assert.equal(f.reads, 0);
  assert.deepEqual(Object.keys(f.storage).sort(), ["techbay-tool-theme", "techbay-work-order-notes-v1"]);
  assert.equal(f.storage["techbay-work-order-notes-v1"].important, "Keep technician notes");
});

test("each explicit pull replaces rows and drafts instead of accumulating orders", async () => {
  const f = fixture();
  await f.list.initialize();
  await f.follow();
  await f.list.capture();
  assert.ok(f.list.getOrder(orderUrl("296")));
  const order = f.list.getOrder(orderUrl("297"));
  order.drafts.dailyUpdate = "Temporary edit";
  f.setNumbers(["297"]);
  await f.list.capture();
  assert.equal(f.list.getOrder(orderUrl("296")), undefined);
  assert.deepEqual(f.list.getOrder(orderUrl("297")).drafts, {});
  assert.equal(f.elements.get("#order-rows").children.length, 1);
  f.setNumbers([]);
  await f.list.capture();
  assert.equal(f.elements.get("#order-rows").children.length, 0);
});

test("same-page events keep the snapshot, changing list tabs clears it without another read", async () => {
  const f = fixture();
  await f.list.initialize();
  await f.follow();
  await f.list.capture();
  await f.follow();
  assert.ok(f.list.getOrder(orderUrl("296")));
  f.navigate(`${base}?lc=102`);
  await f.follow();
  assert.equal(f.reads, 1);
  assert.equal(f.list.getOrder(orderUrl("296")), undefined);
  assert.equal(f.elements.get("#order-rows").children.length, 0);
});

test("navigation during a pull prevents a stale response from repopulating the panel", async () => {
  const f = fixture();
  await f.list.initialize();
  await f.follow();
  let release;
  f.delayRead(new Promise((resolve) => { release = resolve; }));
  const pulling = f.list.capture();
  f.navigate(`${base}?lc=102`);
  await f.follow();
  release();
  await assert.rejects(pulling, /active page changed/);
  assert.equal(f.list.getOrder(orderUrl("296")), undefined);
});

test("a new panel instance starts empty rather than restoring the previous snapshot", async () => {
  const f = fixture();
  await f.list.initialize();
  await f.follow();
  await f.list.capture();
  const reopened = createOrderList(() => {});
  await reopened.initialize();
  assert.equal(reopened.getOrder(orderUrl("296")), undefined);
});

test("new work order displays check-in workspace without automatically reading its fields", async () => {
  const f = fixture();
  await f.list.initialize();
  f.navigate(`${base}/new`);
  await f.follow();
  assert.equal(f.elements.get("#order-list").hidden, true);
  assert.equal(f.elements.get("#order-workspace").hidden, false);
  assert.equal(f.elements.get("#reset-button").hidden, false);
  assert.equal(f.reads, 0);
});
