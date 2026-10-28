const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const { pathToFileURL } = require("node:url");
const vm = require("node:vm");

const source = readFileSync(join(__dirname, "background.js"), "utf8");
const origins = ["https://dash.metapcs.com", "https://metapcs-platform.web.app"];
const patterns = origins.map((origin) => `${origin}/*`);

function setup(tabs = [], queryError = null) {
  const created = [];
  let handler;
  const context = vm.createContext({
    URL,
    importScripts() {},
    dashboardFillRingCentralRecipient() {},
    chrome: {
      tabs: {
        query: async (query) => {
          assert.deepEqual(Array.from(query.url), patterns);
          if (queryError) throw queryError;
          return tabs;
        },
        create: async (options) => { created.push(options); },
      },
      runtime: {
        id: "extension",
        onMessage: { addListener: (listener) => { handler = listener; } },
      },
    },
  });
  vm.runInContext(source, context);
  return {
    created,
    open: (order) => new Promise((resolve) => {
      assert.equal(handler(
        { type: "dashboardOpenOrder", payload: { order } },
        { id: "extension" },
        resolve,
      ), true);
    }),
  };
}

for (const origin of origins) {
  test(`opening an order uses the existing Dash tab's origin: ${origin}`, async () => {
    const { open, created } = setup([{ url: `${origin}/leads`, active: true }]);
    const result = await open(" #mpc2636884 ");
    assert.equal(result.ok, true);
    assert.equal(created[0].url, `${origin}/orders/MPC2636884`);
    assert.equal(created[0].active, false);
  });
}

test("the active Dash tab takes priority over a recently accessed inactive tab", async () => {
  const { open, created } = setup([
    { url: `${origins[0]}/orders`, lastAccessed: 200 },
    { url: `${origins[1]}/leads`, active: true, lastAccessed: 100 },
  ]);
  await open("MPC2636884");
  assert.equal(created[0].url, `${origins[1]}/orders/MPC2636884`);
});

test("the most recently accessed Dash tab is used when neither is active", async () => {
  const { open, created } = setup([
    { url: `${origins[0]}/orders`, lastAccessed: 100 },
    { url: `${origins[1]}/leads`, lastAccessed: 200 },
  ]);
  await open("MPC2636884");
  assert.equal(created[0].url, `${origins[1]}/orders/MPC2636884`);
});

test("opening an order without a Dash tab keeps the primary URL as the default", async () => {
  const { open, created } = setup();
  await open("MPC2636884");
  assert.equal(created[0].url, `${origins[0]}/orders/MPC2636884`);
});

test("invalid orders do not open a tab", async () => {
  const { open, created } = setup();
  const result = await open("invalid");
  assert.equal(result.ok, false);
  assert.match(result.error, /valid MPC order number/);
  assert.equal(created.length, 0);
});

test("Dash tab lookup failures are reported without opening the wrong site", async () => {
  const context = setup([], new Error("Tab lookup failed"));
  const result = await context.open("MPC2636884");
  assert.equal(result.ok, false);
  assert.equal(result.error, "Tab lookup failed");
  assert.equal(context.created.length, 0);
});

for (const origin of origins) {
  test(`Dash messaging reconnects its content script on ${origin}`, async () => {
    const { sendDashMessage } = await import(pathToFileURL(join(__dirname, "outreach", "lib", "dash.js")).href);
    const message = { type: "plScrape" };
    let attempts = 0;
    let injected = false;
    const response = await sendDashMessage(42, message, {
      tabs: {
        sendMessage: async (tabId, payload) => {
          assert.equal(tabId, 42);
          assert.equal(payload, message);
          if (!attempts++) throw new Error("Could not establish connection. Receiving end does not exist.");
          return { ok: true };
        },
        get: async () => ({ url: `${origin}/leads/WL-100` }),
      },
      scripting: {
        executeScript: async (options) => {
          assert.equal(options.target.tabId, 42);
          assert.equal(options.files.length, 1);
          assert.match(options.files[0], /(?:^|\/)Plugins\/Dashboard-Tool\/outreach\/content\.js$/);
          injected = true;
        },
      },
    });
    assert.equal(response.ok, true);
    assert.equal(injected, true);
    assert.equal(attempts, 2);
  });
}

test("all plugin and generated manifest permissions and scripts support both Dash origins", () => {
  const root = join(__dirname, "..", "..");
  const plugins = join(root, "Plugins");
  const manifests = [
    join(root, "manifest.json"),
    join(root, "manifest.base.json"),
    ...readdirSync(plugins).map((plugin) => join(plugins, plugin, "manifest.json")),
  ];
  for (const file of manifests) {
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    const lists = [
      manifest.host_permissions,
      manifest.optional_host_permissions,
      ...(manifest.content_scripts || []).map((script) => script.matches),
    ];
    for (const list of lists.filter(Boolean)) {
      if (list.includes(patterns[0])) {
        assert.ok(list.includes(patterns[1]), `${file} must support the alternate Dash origin`);
      }
    }
  }
});
