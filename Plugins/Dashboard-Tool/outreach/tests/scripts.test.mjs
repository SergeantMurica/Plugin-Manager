import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../lib/scripts.js", import.meta.url), "utf8");
const { LEAD_TYPES, WORDINGS, TEXTS, EMAILS, OBJECTIONS, callScript, voicemail, warrantyPrices } =
  await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const contentSource = await readFile(new URL("../content.js", import.meta.url), "utf8");
const context = {
  first: "Ron",
  rep: "Alex",
  callback: "(602) 555-0123",
  lender: "Example lender",
  amount: "$1,417.20",
  order: "MPC263592",
  two: "$240",
  three: "$320",
  priceKnown: true,
  persona: "",
};

for (const type of Object.keys(LEAD_TYPES)) {
  test(`${type}: every prompt has three distinct, personalized wordings`, () => {
    const versions = WORDINGS.map((_, variant) => ({ ...context, variant }));
    const calls = versions.map((c) => callScript(type, c));
    assert.ok(calls[0].length > 0);
    for (const [i, step] of calls[0].entries()) {
      const variants = calls.map((steps) => steps[i].say);
      assert.equal(new Set(variants).size, WORDINGS.length, step.title);
      for (const steps of calls) assert.equal(steps[i].title, step.title);
    }
    const groups = [
      versions.map((c) => voicemail(type, c)),
      ...TEXTS[type].map((t) => versions.map((c) => t.body(c))),
      ...EMAILS[type].flatMap((m) => [
        versions.map((c) => m.subject(c)),
        versions.map((c) => m.body(c)),
      ]),
      ...OBJECTIONS[type].map((o) => versions.map((c) => o.a(c))),
    ];
    for (const strings of groups) {
      assert.equal(new Set(strings).size, WORDINGS.length);
      for (const text of strings) {
        assert.equal(typeof text, "string");
        assert.ok(text.trim().length > 0);
        assert.doesNotMatch(text, /undefined|null|\[object Object\]/);
      }
    }
    for (const c of versions) {
      assert.match(callScript(type, c)[0].say, /Ron/);
      assert.match(voicemail(type, c), /Alex/);
      assert.match(voicemail(type, c), /\(602\) 555-0123/);
      for (const t of TEXTS[type]) {
        assert.match(t.body(c), /Ron/);
        assert.match(t.body(c), /Alex/);
      }
      for (const m of EMAILS[type]) {
        assert.match(m.body(c), /Ron/);
        assert.match(m.body(c), /Alex/);
      }
    }
  });
}

test("cart scripts never treat a cart as an order, approval or warranty lead", () => {
  for (const variant of WORDINGS.keys()) {
    const c = { ...context, variant };
    const messages = [
      ...callScript("abandoned", c).map((s) => s.say),
      voicemail("abandoned", c),
      ...TEXTS.abandoned.map((t) => t.body(c)),
      ...EMAILS.abandoned.flatMap((m) => [m.subject(c), m.body(c)]),
      ...OBJECTIONS.abandoned.map((o) => o.a(c)),
    ];
    for (const message of messages) {
      assert.doesNotMatch(message, /MPC263592|\$240|\$320|your order|your .*approval|ready to ship|in stock/i);
    }
  }
});

test("missing details and unknown lead types retain usable fallback scripts", () => {
  for (const variant of WORDINGS.keys()) {
    const c = { ...context, callback: "", order: "", lender: "", amount: "", variant };
    assert.equal(voicemail("unrecognized", c), voicemail("other", c));
    assert.deepEqual(callScript("unrecognized", c), callScript("other", c));
    assert.doesNotMatch(voicemail("financing", c), /undefined|this number|text me here|up to \./);
    assert.doesNotMatch(voicemail("warranty", c), /MPC263592/);
  }
});

test("warranty prices and persona details survive wording changes", () => {
  assert.deepEqual(warrantyPrices(3150, false), { two: "$240", three: "$320", known: true });
  assert.deepEqual(warrantyPrices("", true), { two: "$499", three: "$799", known: true });
  assert.equal(warrantyPrices("", false).known, false);
  assert.equal(warrantyPrices(12001, false).known, false);
  for (const variant of WORDINGS.keys()) {
    const steps = callScript("warranty", { ...context, persona: "work", variant });
    const extension = steps.find((step) => step.title === "The extension").say;
    assert.match(extension, /\$240/);
    assert.match(extension, /\$320/);
    assert.match(extension, /work or school/);
  }
});

function scrapeTitle(titleText, installations = 1, sidebarTitle = "") {
  let result;
  const listeners = new Set();
  let observing = 0;
  const paneText = `${titleText}\nCUSTOMER\nRon Pohl\nPHONE\n(216) 571-4875\nEMAIL\nron@example.com\nCREATED BY\nAbandoned cart`;
  const body = { innerText: paneText };
  const pane = { innerText: paneText, parentElement: body };
  const heading = { innerText: titleText, parentElement: pane };
  const container = { innerText: `${sidebarTitle}\n${paneText}`, parentElement: body };
  pane.parentElement = container;
  const sidebar = { innerText: sidebarTitle, parentElement: container };
  const sandbox = {
    chrome: {
      runtime: { id: "test", onMessage: {
        addListener(fn) { listeners.add(fn); },
        removeListener(fn) { listeners.delete(fn); },
      } },
      storage: { local: { set(data) { result = data.plPage; return Promise.resolve(); } } },
    },
    document: {
      body,
      querySelectorAll: (selector) => selector.startsWith("h1") ? [...(sidebarTitle ? [sidebar] : []), heading] : [],
      addEventListener() {},
      removeEventListener() {},
    },
    location: { pathname: "/pound/item/WL-4352", href: "https://dash.metapcs.com/pound/item/WL-4352" },
    window: { addEventListener() {}, removeEventListener() {} },
    MutationObserver: class { observe() { observing++; } disconnect() { observing--; } },
    setTimeout,
    clearTimeout,
  };
  const context = vm.createContext(sandbox);
  for (let i = 0; i < installations; i++) vm.runInContext(contentSource, context);
  assert.equal(listeners.size, 1);
  assert.equal(observing, 1);
  return result;
}

test("Dash reconnection replaces old observers and listeners instead of duplicating them", () => {
  assert.equal(scrapeTitle("Financing lead — Ron Pohl", 3).leadId, "WL-4352");
});

test("Dash detail title wins over a different lead title in the sidebar", () => {
  const page = scrapeTitle("Warranty before it ships · Ron Pohl · MPC2636688", 1, "Financing lead — Someone Else");
  assert.equal(page.type, "warranty");
  assert.equal(page.customer, "Ron Pohl");
  assert.equal(page.order, "MPC2636688");
});

for (const [title, type] of [
  ["Abandoned cart — Ron Pohl", "abandoned"],
  ["Abandoned Cart - Ron Pohl", "abandoned"],
  ["Abandon cart — Ron Pohl", "abandoned"],
  ["Financing lead — Ron Pohl", "financing"],
  ["Warranty before it ships — Ron Pohl", "warranty"],
  ["Warranty before pickup or delivery — Ron Pohl", "warranty"],
  ["Help Desk — Ron Pohl", "helpdesk"],
]) {
  test(`Dash scraping: ${title}`, () => {
    const page = scrapeTitle(title);
    assert.equal(page.type, type);
    assert.equal(page.leadId, "WL-4352");
    assert.equal(page.customer, "Ron Pohl");
    assert.equal(page.phone, "(216) 571-4875");
    assert.equal(page.email, "ron@example.com");
    assert.equal(page.order, "");
  });
}
