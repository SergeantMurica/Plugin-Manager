const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const source = readFileSync(join(__dirname, "sku-discount.js"), "utf8");

function setup() {
  class Element {
    constructor(text = "") {
      this.textContent = text;
      this.children = [];
      this.style = {};
    }
    append(...elements) {
      for (const element of elements) {
        element.parentElement = this;
        this.children.push(element);
      }
    }
    remove() {
      this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
      this.parentElement = null;
    }
    setAttribute() {}
  }
  const grid = new Element();
  const store = new Element("$703");
  const website = new Element("$791.00");
  const labels = ["In store price", "Website price"].map((text, i) => {
    const label = new Element(text);
    const cell = new Element();
    label.nextElementSibling = [store, website][i];
    cell.append(label, label.nextElementSibling);
    grid.append(cell);
    return label;
  });
  let refresh;
  const context = vm.createContext({
    Intl,
    location: { pathname: "/tops/sku/part" },
    document: {
      body: {},
      querySelectorAll: () => labels,
      getElementById: (id) => grid.children.find((child) => child.id === id),
      createElement: () => new Element(),
    },
    MutationObserver: class {
      constructor(callback) { refresh = callback; }
      observe() {}
    },
    requestAnimationFrame: (callback) => callback(),
    addEventListener() {},
  });
  vm.runInContext(source, context);
  const panel = () => grid.children.find((child) => child.id === "techbay-in-store-discount");
  return { context, grid, store, website, labels, refresh: () => refresh(), panel };
}

test("renders the pictured discount and rounded percentage with exact dollar savings", () => {
  const { panel } = setup();
  assert.equal(panel().children[0].textContent, "Discount for In Store");
  assert.equal(panel().children[1].textContent, "$88.00 off (11.125158%)");
  const percentage = 11.125158;
  assert.equal(Math.round(79100 * (1 - percentage / 100)), 70300);
});

test("updates prices on part switches without duplicating the panel", () => {
  const fixture = setup();
  fixture.store.textContent = "$1,234.56";
  fixture.website.textContent = "$1,500.00";
  fixture.refresh();
  fixture.refresh();
  vm.runInContext(source, fixture.context);
  assert.equal(fixture.grid.children.length, 3);
  assert.equal(fixture.panel().children[1].textContent, "$265.44 off (17.696%)");
});

test("handles zero, equal, higher and unavailable prices explicitly", () => {
  const fixture = setup();
  for (const [store, website, expected] of [
    ["$10", "$10", "$0.00 off (0%)"],
    ["$11", "$10", "$0.00 off (0%) - in-store price is higher."],
    ["$0", "$10", "$10.00 off (100%)"],
    ["$0", "$0", "Unavailable - website price must be greater than $0."],
    ["", "$10", "Unavailable - both prices are required."],
    ["$10", "-", "Unavailable - both prices are required."],
    ["$10", "$1,2", "Unavailable - both prices are required."],
    ["$10", "$20.001", "Unavailable - both prices are required."],
    ["-$10", "$20", "Unavailable - both prices are required."],
  ]) {
    fixture.store.textContent = store;
    fixture.website.textContent = website;
    fixture.refresh();
    assert.equal(fixture.panel().children[1].textContent, expected);
  }
});

test("removes stale discounts when leaving a SKU or when its price grid disappears", () => {
  const fixture = setup();
  fixture.context.location.pathname = "/tops";
  fixture.refresh();
  assert.equal(fixture.panel(), undefined);
  fixture.context.location.pathname = "/tops/sku/another";
  fixture.refresh();
  assert.ok(fixture.panel());
  fixture.labels.length = 0;
  fixture.refresh();
  assert.equal(fixture.panel(), undefined);
});
