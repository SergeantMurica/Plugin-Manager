import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const loadModule = async (file) => {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
};
const { editOrder, listContext, mergeList, mergeOrder, orderContext, ordersForList, pendingValues } = await loadModule("../lib/orders.js");
const url = "https://admin.shopify.com/store/meta-pcs/apps/work-mate/work-orders/SO-%23296";

test("recognizes list and order routes, including filters and encoded hashes", () => {
  assert.equal(orderContext(url).number, "SO-#296");
  assert.equal(orderContext(`${url}?view=test`).url, url);
  assert.equal(orderContext("https://admin.shopify.com/store/meta-pcs/apps/work-mate/work-orders?status=Done").number, "");
  for (const invalid of [
    "https://evil.example/store/meta-pcs/apps/work-mate/work-orders/SO-%23296",
    "https://admin.shopify.com/store/meta-pcs/apps/work-mate/work-orders/invalid",
    "https://admin.shopify.com/store/meta-pcs/apps/work-mate/work-orders/%XX",
    "https://admin.shopify.com/store/meta-pcs/orders/296",
    "",
  ]) assert.equal(orderContext(invalid), null);
});

test("new work order route is a form, not a list or a fabricated order number", () => {
  const newUrl = `${orderContext(url).listUrl}/new`;
  const context = orderContext(`${newUrl}?source=list`);
  assert.equal(context.isNew, true);
  assert.equal(context.number, "");
  assert.equal(context.url, newUrl);
  assert.equal(listContext(newUrl), null);
});

test("all supplied filtered and unfiltered Shopify list URLs select list mode", () => {
  const urls = [
    "https://admin.shopify.com/store/meta-pcs/apps/work-mate/work-orders?q=&st=In+Progress%2CCreated%2CDone%2CIn+Transit%2CReceived%2CSpecial+Order%2CPending+Customer&as=ACTIVE&sm=&asm=&cf=&lc=82837504069&su=&pv=&sort=status&order=descending&inc_dd=&po=&spo=&to=&ps=&fs=",
    "https://admin.shopify.com/store/meta-pcs/apps/work-mate/work-orders?q=&st=Created%2CDone%2CIn+Progress%2CReceived%2CIn+Transit%2CSpecial+Order%2CPending+Customer&as=ACTIVE&sm=&asm=&cf=%7B%22k%22%3A%22National%22%252C%22v%22%3A%22Yes%22%252C%22i%22%3Atrue%7D%2C%7B%22k%22%3A%22Device%22%252C%22v%22%3A%22Watercooled%22%252C%22i%22%3Atrue%7D&lc=82837438533&su=&pv=&sort=createdAt&order=ascending&inc_dd=&po=&spo=&to=&ps=&fs=",
    "https://admin.shopify.com/store/meta-pcs/apps/work-mate/work-orders",
  ];
  for (const value of urls) {
    const context = orderContext(value);
    assert.ok(context);
    assert.equal(context.number, "");
    assert.equal(context.url, "");
    assert.equal(context.listUrl, urls[2]);
  }
});

test("locations and filtered lists stay separate while sorting and pagination share membership", () => {
  const base = orderContext(url).listUrl;
  const phoenix = listContext(`${base}?lc=101&st=Created,Done&sort=status&page=1&q=`);
  const sameList = listContext(`${base}?page=2&st=Done,Created&lc=101&sort=createdAt&order=ascending`);
  assert.equal(phoenix.id, sameList.id);
  assert.notEqual(phoenix.id, listContext(`${base}?lc=102&st=Created,Done`).id);
  assert.notEqual(phoenix.id, listContext(`${base}?lc=101&st=Created,Done&cf=National`).id);
  assert.notEqual(phoenix.id, listContext(`${base}?lc=101&st=Created`).id);
  assert.notEqual(phoenix.id, listContext(`${base}?lc=101&st=Created,Done&q=customer`).id);
  assert.notEqual(phoenix.id, listContext(`${base.replace("meta-pcs", "other-store")}?lc=101&st=Created,Done`).id);
  assert.equal(listContext(url), null);
});

test("saved list membership accumulates pages and retains custom names and original source filters", () => {
  const context = listContext(`${orderContext(url).listUrl}?lc=101&cf=National`);
  const first = mergeList(undefined, context, [url], "National");
  const nextUrl = url.replace("296", "297");
  const renamed = { ...first, name: "National repairs" };
  const next = mergeList(renamed, context, [url, nextUrl], "National");
  assert.equal(next.name, "National repairs");
  assert.deepEqual(next.orderUrls, [url, nextUrl]);
  assert.equal(next.sourceUrl, context.sourceUrl);
  assert.equal(mergeList(undefined, context, [], "").name, context.defaultName);
});

test("overlapping lists share order drafts and bulk selection is scoped to the chosen list", () => {
  const base = orderContext(url).listUrl;
  const phoenix = listContext(`${base}?lc=101`);
  const national = listContext(`${base}?lc=101&cf=National`);
  const otherUrl = url.replace("296", "297");
  const orders = {
    [url]: editOrder(mergeOrder(undefined, { url, fields: {} }), "dailyUpdate", "Shared draft"),
    [otherUrl]: editOrder(mergeOrder(undefined, { url: otherUrl, fields: {} }), "dailyUpdate", "Other draft"),
  };
  const lists = {
    [phoenix.id]: mergeList(undefined, phoenix, [url, otherUrl], "Phoenix"),
    [national.id]: mergeList(undefined, national, [url], "National"),
  };
  assert.equal(ordersForList(orders, lists, "").length, 2);
  assert.equal(ordersForList(orders, lists, phoenix.id).length, 2);
  const selected = ordersForList(orders, lists, national.id);
  assert.deepEqual(selected.map((order) => order.url), [url]);
  assert.equal(selected[0].drafts.dailyUpdate, "Shared draft");
  assert.equal(ordersForList(orders, lists, "missing-list").length, 0);
});

test("recapture merges observed fields without destroying draft edits or detail-only fields", () => {
  const original = mergeOrder(undefined, {
    number: "SO-#296", url, fields: { dailyUpdate: "Old", serial: "123" },
  }, "2026-10-23T01:00:00Z");
  const edited = editOrder(original, "dailyUpdate", "Waiting on customer", "AC");
  const captured = mergeOrder(edited, { fields: { dailyUpdate: "Live value" } });
  assert.equal(captured.fields.serial, "123");
  assert.equal(captured.fields.dailyUpdate, "Live value");
  assert.equal(captured.drafts.dailyUpdate, "Waiting on customer");
  assert.deepEqual(pendingValues(captured), { dailyUpdate: "Waiting on customer" });
  assert.equal(captured.history[0].before, "Old");
  assert.equal(captured.history[0].initials, "AC");
});

test("empty edits remain injectable and audit stores bounded revisions, not no-op changes", () => {
  let order = mergeOrder(undefined, { number: "SO-#296", url, fields: { dailyUpdate: "Old" } });
  order = editOrder(order, "dailyUpdate", "");
  assert.deepEqual(pendingValues(order), { dailyUpdate: "" });
  assert.equal(editOrder(order, "dailyUpdate", ""), order);
  for (let index = 0; index < 110; index++)
    order = editOrder(order, "dailyUpdate", String(index));
  assert.equal(order.history.length, 100);
  assert.equal(order.history.at(-1).after, "109");
  assert.throws(() => editOrder(order, "products", "Do not fill"));
  assert.throws(() => editOrder(order, "toString", "Do not fill"));
  assert.deepEqual(pendingValues({ drafts: { dailyUpdate: "", products: "Ignored" } }), { dailyUpdate: "" });
});

test("same order number stays isolated across Shopify stores", () => {
  const other = url.replace("meta-pcs", "other-store");
  const orders = {
    [url]: mergeOrder(undefined, { url, fields: { dailyUpdate: "A" } }),
    [other]: mergeOrder(undefined, { url: other, fields: { dailyUpdate: "B" } }),
  };
  assert.equal(Object.keys(orders).length, 2);
  assert.equal(orders[other].fields.dailyUpdate, "B");
});

const orderSource = await readFile(new URL("../lib/orders.js", import.meta.url), "utf8");
const orderImport = `data:text/javascript;base64,${Buffer.from(orderSource).toString("base64")}`;
const clientSource = (await readFile(new URL("../lib/workmate-client.js", import.meta.url), "utf8"))
  .replace('"./orders.js"', JSON.stringify(orderImport))
  .replaceAll("import.meta.url", JSON.stringify("chrome-extension://test/Plugins/techbay-planner-plugin/lib/workmate-client.js"));
const client = await import(`data:text/javascript;base64,${Buffer.from(clientSource).toString("base64")}`);

test("probes frames but injects only into the order frame, with correct manager-relative content script", async () => {
  const sent = [];
  globalThis.chrome = {
    tabs: {
      get: async () => ({ url }),
      sendMessage: async (id, message, { frameId }) => {
        sent.push({ id, message, frameId });
        if (message.type === "TECHBAY_READ_ORDERS")
          return { ok: true, fields: frameId ? { dailyUpdate: "Old" } : {}, fieldCount: frameId ? 9 : 0 };
        return { ok: true, filled: 1, missing: [] };
      },
    },
    scripting: {
      executeScript: async (options) => {
        assert.deepEqual(options.files, ["Plugins/techbay-planner-plugin/content.js"]);
        return [{ frameId: 0 }, { frameId: 4 }];
      },
    },
  };
  const response = await client.fillOrder(12, url, { dailyUpdate: "" }, true);
  assert.equal(response.filled, 1);
  const writes = sent.filter(({ message }) => message.type === "TECHBAY_FILL_WORK_ORDER");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].frameId, 4);
  assert.equal(writes[0].message.allowEmpty, true);
});

test("note drafts contain additions, not editable copies of captured note history", () => {
  const original = mergeOrder(undefined, {
    url, fields: { checkInNote: "Tech Notes:\nOld repair\nCallback Notes:\nOld call" },
  });
  const edited = editOrder(original, "checkInNote", "New callback");
  assert.equal(edited.history[0].before, "");
  assert.equal(edited.fields.checkInNote, original.fields.checkInNote);
  assert.deepEqual(pendingValues(edited), { checkInNote: "New callback" });
});

test("check-in injection supports unsaved new orders and targets only the form frame", async () => {
  const newUrl = `${orderContext(url).listUrl}/new`;
  const writes = [];
  globalThis.chrome.tabs.get = async () => ({ url: newUrl });
  globalThis.chrome.tabs.sendMessage = async (_id, message, { frameId }) => {
    if (message.type === "TECHBAY_READ_ORDERS")
      return { ok: true, fieldCount: frameId === 4 ? 4 : 0, fields: {} };
    writes.push({ frameId, message });
    return { ok: true, filled: 2, missing: [] };
  };
  const result = await client.fillOrder(12, newUrl, { device: "Laptop", checkInNote: "New check-in" });
  assert.equal(result.filled, 2);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].frameId, 4);
  assert.equal(writes[0].message.values.checkInNote, "New check-in");
});

test("rejects navigation before injection and never fills a list page", async () => {
  globalThis.chrome.tabs.get = async () => ({ url: url.replace("296", "297") });
  await assert.rejects(client.fillOrder(12, url, { dailyUpdate: "Wrong order" }), /no longer/);
  await assert.rejects(client.fillOrder(12, orderContext(url).listUrl, {}), /no longer/);
});

test("rechecks the target route after probing frames before writing", async () => {
  let reads = 0;
  let writes = 0;
  globalThis.chrome.tabs.get = async () => ({ url: ++reads === 1 ? url : url.replace("296", "297") });
  globalThis.chrome.tabs.sendMessage = async (_id, message) => {
    if (message.type === "TECHBAY_FILL_WORK_ORDER") writes++;
    return { ok: true, fieldCount: 1, fields: { dailyUpdate: "Old" } };
  };
  await assert.rejects(client.fillOrder(12, url, { dailyUpdate: "Changed" }), /changed before injection/);
  assert.equal(writes, 0);
});

test("missing form fields and failed frame access produce explicit errors", async () => {
  globalThis.chrome.tabs.get = async () => ({ url });
  globalThis.chrome.tabs.sendMessage = async () => ({ ok: true, fieldCount: 0, fields: {} });
  await assert.rejects(client.fillOrder(12, url, { dailyUpdate: "Changed" }), /fields are not ready/);
  globalThis.chrome.tabs.sendMessage = async () => { throw new Error("Frame unavailable"); };
  await assert.rejects(client.fillOrder(12, url, { dailyUpdate: "Changed" }), /Could not reach Work Mate/);
});

test("denied embedded access is reported instead of proceeding", async () => {
  globalThis.chrome.permissions = { request: async () => false };
  await assert.rejects(client.requestWorkMateAccess(), /Allow access/);
});

test("script path resolution preserves standalone loading and decodes plugin folder names", async () => {
  const source = await readFile(new URL("../lib/workmate-client.js", import.meta.url), "utf8");
  for (const [moduleUrl, expected] of [
    ["chrome-extension://test/lib/workmate-client.js", "content.js"],
    ["chrome-extension://test/Plugins/Work%20Mate/lib/workmate-client.js", "Plugins/Work Mate/content.js"],
  ]) {
    const moduleSource = source
      .replace('"./orders.js"', JSON.stringify(orderImport))
      .replaceAll("import.meta.url", JSON.stringify(moduleUrl));
    const module = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`);
    globalThis.chrome.scripting.executeScript = async (options) => {
      assert.deepEqual(options.files, [expected]);
      return [{ frameId: 0 }];
    };
    globalThis.chrome.tabs.sendMessage = async () => ({ ok: true, fieldCount: 0, fields: {} });
    await module.readFrames(12);
  }
});
