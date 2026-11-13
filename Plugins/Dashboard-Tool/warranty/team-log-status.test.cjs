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
    els, auth: { uid: "u1" }, ownerFilter: "all", statusFilter: null,
    listed: () => [record], digits: () => "", renderTabs() {}, dayLabel: () => "Today",
    dashboard: null, unified: false, capitalizeName: (s) => s, fmtTime: () => "12:00",
    stageFor: () => "pitch", variantById: () => null, STAGE_TITLE: { pitch: "Copy" },
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
