const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class Element {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.listeners = {};
    this.classList = { add() {} };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  addEventListener(type, fn) { this.listeners[type] = fn; }
}

test("team log offers called, emailed, and owner-only unclaim actions", async () => {
  const source = fs.readFileSync(path.join(__dirname, "popup.js"), "utf8");
  const statuses = source.slice(source.indexOf("const STATUSES ="), source.indexOf("const TAB_LABEL ="));
  const render = source.slice(source.indexOf("function render() {"), source.indexOf("// ---------- A/B stats ----------"));
  const messages = [];
  const record = {
    id: "MPC12345", order: "MPC12345", status: "texted", uid: "u1", by: "Alex",
    phone: "", customer: "", ts: 1, updateTime: "v1",
  };
  const els = {
    search: { value: "" }, count: {}, stats: { hidden: true },
    list: new Element(), empty: {}, error: {},
  };
  const context = vm.createContext({
    document: { createElement: () => new Element() },
    els, auth: { uid: "u1" }, ownerFilter: "all", statusFilter: null, showArchived: false,
    listed: () => [record], archived: () => [], digits: () => "", renderTabs() {}, dayLabel: () => "Today",
    dashboard: null, unified: false, capitalizeName: (s) => s, fmtTime: () => "12:00",
    stageFor: () => "pitch", variantById: () => null, STAGE_TITLE: { pitch: "Copy" }, pcList: () => [],
    confirm: () => true,
    send: async (type, payload) => { messages.push({ type, payload }); return { ok: true }; },
  });
  vm.runInContext(`${statuses}\n${render}\nrender();`, context);
  const row = els.list.children.find((child) => child.className === "item");
  const chip = row.children[2].children.find((child) => child.dataset.status);
  assert.ok(chip.children.some((option) => option.value === "called"));
  assert.ok(chip.children.some((option) => option.value === "emailed"));
  assert.ok(chip.children.some((option) => option.value === "not_contacted"));
  chip.value = "called";
  await chip.listeners.change();
  assert.equal(messages.at(-1).payload.status, "called");
  chip.value = "emailed";
  await chip.listeners.change();
  assert.equal(messages.at(-1).payload.status, "emailed");
  chip.value = "not_contacted";
  await chip.listeners.change();
  assert.equal(messages.at(-1).type, "unclaim");
  assert.equal(messages.at(-1).payload.expect, "v1");
  context.auth = { uid: "u2" };
  vm.runInContext("render()", context);
  const otherRow = els.list.children.find((child) => child.className === "item");
  const otherChip = otherRow.children[2].children.find((child) => child.dataset.status);
  assert.ok(!otherChip.children.some((option) => option.value === "not_contacted"));
});

test("archive tab shows contacted archives, their deletion date, and restore action", async () => {
  const source = fs.readFileSync(path.join(__dirname, "popup.js"), "utf8");
  const statuses = source.slice(source.indexOf("const STATUSES ="), source.indexOf("const TAB_LABEL ="));
  const archiveTime = source.slice(source.indexOf("const archiveTime ="), source.indexOf("\nlet ownerFilter"));
  const tabs = source.slice(source.indexOf("function renderTabs() {"), source.indexOf("function copyButton("));
  const render = source.slice(source.indexOf("function render() {"), source.indexOf("// ---------- A/B stats ----------"));
  const messages = [];
  const records = [
    { id: "MPC1", order: "MPC1", status: "none", uid: "u1", by: "Alex", ts: 1, archivedAt: 100, updatedAt: 100, retentionUpdatedAt: 100, hidden: true, updateTime: "v1", customer: "", phone: "", email: "" },
    { id: "MPC2", order: "MPC2", status: "not_contacted", uid: "u1", by: "Alex", ts: 1, hidden: true, customer: "", phone: "", email: "" },
    { id: "MPC3", order: "MPC3", status: "paid", uid: "u1", by: "Alex", ts: 1, hidden: false, customer: "", phone: "", email: "" },
  ];
  const els = {
    search: { value: "" }, count: {}, stats: { hidden: true }, tabs: new Element(),
    list: new Element(), empty: {}, error: {},
  };
  const context = vm.createContext({
    document: { createElement: () => new Element() }, els, auth: { uid: "u1" },
    ownerFilter: "all", statusFilter: null, showArchived: false,
    listed: () => records.filter((record) => !record.hidden),
    archived: () => records.filter((record) => record.hidden && record.status !== "not_contacted"),
    digits: () => "", dayLabel: () => "Today", fmtDate: (value) => String(value),
    fmtTime: () => "12:00", ARCHIVE_RETENTION_MS: 60 * 24 * 60 * 60 * 1000,
    TAB_LABEL: {}, dashboard: null, unified: false, capitalizeName: (s) => s,
    stageFor: () => "pitch", variantById: () => null, STAGE_TITLE: { pitch: "Copy" }, pcList: () => [],
    send: async (type, payload) => { messages.push({ type, payload }); return { ok: true }; },
  });
  vm.runInContext(`${statuses}\n${archiveTime}\n${tabs}\n${render}\nrender();`, context);
  const active = els.list.children.find((child) => child.className === "item");
  assert.equal(active.children[0].textContent, "MPC3");
  assert.ok(!active.children[2].children.some((child) => child.title === "Archive"));
  const archiveTab = els.tabs.children[0].children.find((child) => child.dataset.status === "archived");
  assert.equal(Number(archiveTab.children[1].textContent), 1);
  archiveTab.listeners.click();
  const rows = els.list.children.filter((child) => child.className === "item");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].children[0].textContent, "MPC1");
  assert.ok(rows[0].children[1].children.some((child) =>
    child.textContent === `Archived 100 · Deletes ${100 + 60 * 24 * 60 * 60 * 1000}`));
  const restore = rows[0].children[2].children.find((child) => child.textContent === "Restore");
  await restore.listeners.click();
  assert.equal(messages.at(-1).type, "restore");
  assert.equal(messages.at(-1).payload.id, "MPC1");
  assert.equal(messages.at(-1).payload.expect, "v1");
  records[0].retentionUpdatedAt = 0;
  vm.runInContext("render()", context);
  let meta = els.list.children.find((child) => child.className === "item").children[1];
  assert.ok(meta.children.some((child) => child.textContent === "Archived · deletion date pending"));
  records[0].statusValid = false;
  vm.runInContext("render()", context);
  meta = els.list.children.find((child) => child.className === "item").children[1];
  assert.ok(meta.children.some((child) => child.textContent === "Archived · retention paused for an unsupported status"));
});

test("Dash recognizes an archived tracker claim and warns before updating another owner's entry", async () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "outreach", "popup.js"), "utf8");
  const warranty = source.slice(source.indexOf("const UNCLAIMED_ON_DASH ="), source.indexOf("// ---------- scripts ----------"));
  const messages = [];
  const confirmations = [];
  const record = {
    order: "MPC12345", status: "none", by: "Alex", uid: "u1", ts: 1, hidden: true, updateTime: "v1",
  };
  const els = { wtHint: { dataset: {} }, wtStatus: { value: "" }, wtLog: {} };
  const context = vm.createContext({
    hasWarrantyTool: true, current: { id: "WL-1", type: "warranty", order: record.order, claimedBy: "" },
    wtItems: { MPC12345: record }, wtAuth: { uid: "u2" }, els, unified: false,
    warrantyStatusOrder: "", warrantySavedStatus: "",
    WT_STATUSES: [["texted", "Texted"], ["none", "No answer"]],
    orderKey: (value) => value, titleCase: (value) => value,
    prettyPhone: (value) => value, showError() {},
    confirm: (message) => { confirmations.push(message); return true; },
    send: async (type, payload) => { messages.push({ type, payload }); return { ok: true }; },
  });
  vm.runInContext(`${warranty}\nrenderWarranty();`, context);
  assert.equal(els.wtLog.disabled, false);
  assert.equal(els.wtLog.textContent, "Update Warranty Tool");
  assert.equal(els.wtStatus.value, "none");
  assert.match(els.wtHint.textContent, /archived.*restores/i);
  assert.equal(await vm.runInContext("logWarranty()", context), true);
  assert.match(confirmations[0], /stays under Alex's name/);
  assert.equal(messages[0].type, "upsert");
  assert.equal(messages[0].payload.expect, "v1");
  record.status = "not_contacted";
  vm.runInContext("renderWarranty()", context);
  assert.equal(els.wtLog.disabled, true);
});
