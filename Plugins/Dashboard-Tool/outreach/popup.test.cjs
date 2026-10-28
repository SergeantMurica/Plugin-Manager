const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const source = readFileSync(join(__dirname, "popup.js"), "utf8");
const warrantySource = readFileSync(join(__dirname, "..", "warranty", "popup.js"), "utf8");
const statuses = ["texted", "agreed", "declined", "paid", "none", "wrong_number_error", "already_has"];

function setup(items = {}) {
  const writes = [];
  let resets = 0;
  let focused = false;
  const context = vm.createContext({
    hasWarrantyTool: true,
    unified: true,
    current: { type: "warranty", order: "MPC100" },
    wtAuth: { uid: "me" },
    wtItems: items,
    warrantyStatusOrder: null,
    warrantySavedStatus: "texted",
    WT_STATUSES: statuses.map((status) => [status, status]),
    els: {
      wtStatus: { value: "texted" },
      wtHint: { dataset: {} },
      wtLog: {},
      order: { focus: () => { focused = true; } },
    },
    document: {
      getElementById: () => ({ reset: () => { resets++; } }),
    },
    orderKey: (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, ""),
    titleCase: (value) => value,
    warrantyDetails: () => ({}),
    confirm: () => true,
    showError: (message) => assert.equal(message, ""),
    syncStatus: () => {},
    send: async (action, payload) => {
      writes.push({ action, ...payload });
      return { ok: true };
    },
  });
  vm.runInContext(
    source.slice(source.indexOf("function renderWarranty()"), source.indexOf("// Everything the Warranty Tool")) +
    source.slice(source.indexOf("async function logWarranty()"), source.indexOf("// Customer accepted the warranty")),
    context,
  );
  return { context, writes, resetCount: () => resets, orderFocused: () => focused };
}

test("a successful warranty save clears the shared form and focuses the order field", async () => {
  const { context, writes, resetCount, orderFocused } = setup();
  context.els.wtStatus.value = "paid";
  assert.equal(await context.logWarranty(), true);
  assert.equal(writes[0].status, "paid");
  assert.equal(resetCount(), 1);
  assert.equal(orderFocused(), true);
});

test("a failed warranty save keeps the form and displays the error", async () => {
  const { context, resetCount, orderFocused } = setup();
  const lead = context.current;
  let error;
  context.send = async () => ({ ok: false, error: "Save failed" });
  context.showError = (message) => { error = message; };
  assert.equal(await context.logWarranty(), false);
  assert.equal(context.current, lead);
  assert.equal(error, "Save failed");
  assert.equal(resetCount(), 0);
  assert.equal(orderFocused(), false);
  assert.equal(context.els.wtLog.disabled, false);
});

test("cancelling another teammate's warranty update keeps the form", async () => {
  const { context, writes, resetCount } = setup({
    MPC100: { uid: "other", by: "Teammate" },
  });
  context.confirm = () => false;
  assert.equal(await context.logWarranty(), false);
  assert.equal(writes.length, 0);
  assert.equal(resetCount(), 0);
});

test("a completed save does not clear a different customer opened while saving", async () => {
  const { context, resetCount } = setup();
  const next = { type: "warranty", order: "MPC200" };
  context.send = async () => {
    context.current = next;
    return { ok: true };
  };
  await context.logWarranty();
  assert.equal(context.current, next);
  assert.equal(resetCount(), 0);
});

test("standalone warranty logging preserves its existing form behavior", async () => {
  const { context, resetCount } = setup();
  context.unified = false;
  await context.logWarranty();
  assert.equal(resetCount(), 0);
});

test("Clear fields resets customer and financing fields, drafts, pricing and the open lead without deleting logs", async () => {
  const { context } = setup();
  const listeners = {};
  const stored = { wtDraft: { order: "MPC100" }, plCurrent: "WL-1", plLeads: { "WL-1": { order: "MPC100" } } };
  const savedLog = stored.plLeads;
  const form = {
    addEventListener(type, callback) {
      (listeners[type] ||= []).push(callback);
    },
    reset() {
      for (const callback of listeners.reset) callback();
      for (const id of ["phone", "email", "order", "name", "systemPrice", "lender", "amount"])
        context.els[id].value = "";
      context.els.watercooled.checked = false;
    },
  };
  Object.assign(context.els, {
    form,
    clear: { addEventListener: (type, callback) => { listeners.clear = callback; } },
    phone: { value: "5551234567" },
    email: { value: "customer@example.com" },
    order: { value: "MPC100", focus() {} },
    name: { value: "Customer" },
    systemPrice: { value: "3150", disabled: true },
    watercooled: { checked: true },
    lender: { value: "Lender" },
    amount: { value: "1000" },
  });
  Object.assign(context, {
    queueMicrotask,
    DRAFT_KEY: "wtDraft",
    CURRENT_KEY: "plCurrent",
    chrome: { storage: { local: {
      set: async (data) => Object.assign(stored, data),
      remove: async (key) => { delete stored[key]; },
    } } },
    updateHint: () => {},
    save: () => {},
    show: (lead) => { context.current = lead; },
    customer: { customerChanged: () => {
      context.els.systemPrice.disabled = context.els.watercooled.checked;
    } },
    document: { getElementById: () => form },
    showError: () => {},
  });
  vm.runInContext(
    warrantySource.slice(warrantySource.indexOf("function saveDraft()"), warrantySource.indexOf("// ---------- duplicate check")) +
    warrantySource.slice(warrantySource.indexOf('els.clear.addEventListener("click"'), warrantySource.indexOf('els.form.addEventListener("submit"')) +
    source.slice(source.indexOf('  document.getElementById("form").addEventListener("reset"'), source.indexOf('els.watercooled.addEventListener("change"')).trimEnd().slice(0, -1),
    context,
  );
  listeners.clear();
  await new Promise((resolve) => setImmediate(resolve));
  for (const id of ["phone", "email", "order", "name", "systemPrice", "lender", "amount"])
    assert.equal(context.els[id].value, "");
  assert.equal(context.els.watercooled.checked, false);
  assert.equal(context.els.systemPrice.disabled, false);
  assert.equal(context.els.clear.hidden, false);
  assert.equal(context.current, null);
  assert.equal(stored.wtDraft, undefined);
  assert.equal(stored.plCurrent, undefined);
  assert.equal(stored.plLeads, savedLog);
});

for (const status of statuses) {
  test(`saving uses the ${status} dropdown choice after form refreshes`, async () => {
    const { context, writes } = setup({
      MPC100: { status: "declined", uid: "me", ts: Date.now() },
    });
    context.renderWarranty();
    assert.equal(context.els.wtStatus.value, "declined");
    context.els.wtStatus.value = status;
    context.renderWarranty();
    context.renderWarranty();
    await context.logWarranty();
    assert.equal(writes.length, 1);
    assert.equal(writes[0].status, status);
  });
}

test("a new or hidden order defaults to Texted, not the previous order's status", () => {
  const { context } = setup({
    MPC100: { status: "declined", uid: "me", ts: Date.now() },
    MPC200: { status: "paid", hidden: true },
  });
  context.renderWarranty();
  for (const order of ["MPC200", "MPC300"]) {
    context.current.order = order;
    context.renderWarranty();
    assert.equal(context.els.wtStatus.value, "texted");
    context.els.wtStatus.value = "declined";
  }
});

test("cache refreshes update an untouched dropdown but preserve a pending choice", () => {
  const entry = { status: "texted", uid: "me", ts: Date.now() };
  const { context } = setup({ MPC100: entry });
  context.renderWarranty();
  entry.status = "agreed";
  context.renderWarranty();
  assert.equal(context.els.wtStatus.value, "agreed");
  context.els.wtStatus.value = "paid";
  entry.status = "declined";
  context.renderWarranty();
  assert.equal(context.els.wtStatus.value, "paid");
});

test("every Team Log tab is read-only and cannot change the saved dropdown status", async () => {
  const { context, writes } = setup();
  const buttons = [];
  context.document = {
    ...context.document,
    createElement: () => ({
      dataset: {},
      setAttribute() {},
      append() {},
      addEventListener(event, callback) {
        assert.equal(event, "click");
        buttons.push(callback);
      },
    }),
  };
  Object.assign(context, {
    listed: () => [],
    auth: context.wtAuth,
    ownerFilter: "all",
    statusFilter: null,
    STATUSES: statuses,
    STATUS_LABEL: Object.fromEntries(statuses.map((status) => [status, status])),
    TAB_LABEL: {},
    render: () => context.renderWarranty(),
  });
  context.els.tabs = { replaceChildren() {} };
  vm.runInContext(
    warrantySource.slice(warrantySource.indexOf("function renderTabs()"), warrantySource.indexOf("function copyButton(")),
    context,
  );
  context.renderWarranty();
  context.els.wtStatus.value = "agreed";
  context.renderTabs();
  assert.equal(buttons.length, statuses.length + 2);
  for (const click of buttons) {
    click();
    assert.equal(context.els.wtStatus.value, "agreed");
    assert.equal(writes.length, 0);
    await context.logWarranty();
    assert.equal(writes.pop().status, "agreed");
  }
});
