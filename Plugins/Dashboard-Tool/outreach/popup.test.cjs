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
  return { context, writes };
}

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
