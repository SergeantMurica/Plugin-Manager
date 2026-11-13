const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class Element {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.listeners = {};
    this.className = "";
    this.textContent = "";
  }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  append(...children) { this.children.push(...children); }
  insertAdjacentElement(_where, element) { this.nextElementSibling = element; }
  getAttribute(name) { return name === "href" ? this.href : ""; }
  hasAttribute(name) { return name === "href" && !!this.href; }
  closest() { return null; }
  getBoundingClientRect() { return { left: 10, bottom: 20 }; }
  remove() { this.removed = true; }
  get classList() { return { contains: (name) => this.className.split(" ").includes(name) }; }
  click() {
    return this.listeners.click?.({
      currentTarget: this, preventDefault() {}, stopPropagation() {},
    });
  }
}

test("Shopify badge offers called, emailed, and unclaim and returns to not contacted", async () => {
  const link = new Element("a");
  link.textContent = "MPC12345";
  link.href = "/store/test/orders/123";
  const body = new Element("body");
  const state = {
    wtAuth: { uid: "u1" },
    wtContacts: { items: {} },
  };
  const changes = [];
  const messages = [];
  const chrome = {
    runtime: {
      id: "test",
      sendMessage(message, callback) {
        messages.push(message);
        const id = "MPC12345";
        if (message.type === "upsert") {
          state.wtContacts.items[id] = {
            id, order: id, by: "Alex", uid: "u1", status: message.payload.status,
            ts: 1, updateTime: "v1",
          };
          for (const fn of changes) fn({ wtContacts: {} }, "local");
        } else if (message.type === "unclaim") {
          state.wtContacts.items[id] = { ...state.wtContacts.items[id], status: "not_contacted", hidden: true };
          for (const fn of changes) fn({ wtContacts: {} }, "local");
        }
        callback({ ok: true });
      },
    },
    storage: {
      local: {
        async get(keys) { return Object.fromEntries([].concat(keys).map((key) => [key, state[key]])); },
        async set(values) { Object.assign(state, values); },
      },
      onChanged: { addListener(fn) { changes.push(fn); } },
    },
  };
  const document = {
    body,
    visibilityState: "visible",
    querySelectorAll(selector) { return selector === '[href*="/orders/"]' ? [link] : []; },
    createElement(tag) { return new Element(tag); },
    addEventListener() {},
  };
  const context = vm.createContext({
    chrome, document, URL, location: { href: "https://admin.shopify.com/store/test/orders", pathname: "/store/test/orders" },
    innerWidth: 1000, innerHeight: 800, confirm: () => true,
    alert: (message) => { throw new Error(message); },
    MutationObserver: class { observe() {} },
    setTimeout, clearTimeout, console,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "content.js"), "utf8"), context);
  const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(setImmediate); };
  await flush();
  const badge = link.nextElementSibling;
  assert.equal(badge.textContent, "Not contacted");
  badge.click();
  let menu = body.children.at(-1);
  const labels = menu.children.map((child) => child.textContent);
  assert.ok(labels.includes("Log as Called"));
  assert.ok(labels.includes("Log as Emailed"));
  menu.children.find((child) => child.textContent === "Log as Called").click();
  await flush();
  assert.equal(badge.textContent, "Called: Alex");
  assert.equal(messages.find((message) => message.type === "upsert").payload.status, "called");
  badge.click();
  menu = body.children.at(-1);
  assert.ok(menu.children.some((child) => child.textContent === "Mark Emailed"));
  menu.children.find((child) => child.textContent === "Unclaim · Not contacted").click();
  await flush();
  assert.equal(badge.textContent, "Not contacted");
  assert.equal(messages.find((message) => message.type === "unclaim").payload.expect, "v1");
  badge.click();
  menu = body.children.at(-1);
  assert.ok(menu.children.some((child) => child.textContent === "Log as Emailed"));
});
