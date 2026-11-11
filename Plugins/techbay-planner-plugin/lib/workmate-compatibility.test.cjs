const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const plugins = path.resolve(__dirname, "../..");
const toolbox = path.join(plugins, "metapcs-toolbox");
const host = "https://workmate.apps.prod.teifi.dev";
const loadModule = (file) => import(`data:text/javascript;base64,${Buffer.from(fs.readFileSync(file, "utf8")).toString("base64")}`);

test("both plugins declare optional access and content scripts for both Work Mate hosts", () => {
  for (const plugin of ["metapcs-toolbox", "techbay-planner-plugin"]) {
    const manifest = JSON.parse(fs.readFileSync(path.join(plugins, plugin, "manifest.json")));
    assert.ok(manifest.optional_host_permissions.includes(`${host}/*`));
    const script = manifest.content_scripts.find((entry) => entry.js.some((file) => /(?:^|\/)(?:content|linkify)\.js$/.test(file)));
    assert.ok(script.matches.includes(`${host}/*`));
    assert.ok(script.matches.some((match) => match.includes("workmatepos.co")));
    assert.equal(script.all_frames, true);
  }
});

test("Work Mate permission requests include the new and legacy hosts and report denial", async () => {
  const source = fs.readFileSync(path.join(__dirname, "workmate-client.js"), "utf8");
  const context = {
    chrome: { permissions: { request: async ({ origins }) => {
      assert.deepEqual(Array.from(origins), ["https://app.workmatepos.co/*", `${host}/*`]);
      return true;
    } } },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf("export async function requestWorkMateAccess"), source.indexOf("export async function readFrames")).replace("export ", ""), context);
  await context.requestWorkMateAccess();
  context.chrome.permissions.request = async () => false;
  await assert.rejects(context.requestWorkMateAccess(), /Allow access to workmate\.apps\.prod\.teifi\.dev/);
});

test("Toolbox site registration resolves real files in standalone and Plugin Manager layouts", async () => {
  const source = fs.readFileSync(path.join(toolbox, "popup.js"), "utf8");
  const section = source.slice(source.indexOf("const BUILT_IN_SITES"), source.indexOf("async function disableSite"));
  for (const base of ["", "Plugins/metapcs-toolbox/"]) {
    let registration;
    const context = {
      URL,
      chrome: {
        permissions: { request: async () => true },
        scripting: {
          unregisterContentScripts: async () => {},
          registerContentScripts: async ([script]) => { registration = script; },
        },
      },
      toast: (message) => assert.doesNotMatch(message, /Could not enable/),
      renderSites: () => {},
    };
    vm.createContext(context);
    vm.runInContext(section.replace("import.meta.url", JSON.stringify(`chrome-extension://test/${base}popup.js`)), context);
    await context.enableSite(host);
    assert.deepEqual(Array.from(registration.matches), [`${host}/*`]);
    assert.equal(registration.allFrames, true);
    for (const file of [...registration.js, ...registration.css]) {
      assert.ok(file.startsWith(`${base}content/`));
      const root = base ? path.resolve(plugins, "..") : toolbox;
      assert.ok(fs.existsSync(path.join(root, file)), file);
    }
    assert.equal(vm.runInContext(`WORKMATE_SITES.includes("${host}")`, context), true);
  }
});

test("Toolbox links retain the confirmed Shopify order route and encoded hash", async () => {
  const urls = await loadModule(path.join(toolbox, "lib/workmate.js"));
  const orders = await loadModule(path.join(__dirname, "orders.js"));
  const url = "https://admin.shopify.com/store/meta-pcs/apps/work-mate/work-orders/SO-%231221";
  assert.equal(urls.soUrl(urls.parseSO("SO-#1221")), url);
  assert.equal(orders.orderContext(url).number, "SO-#1221");
  assert.equal(orders.orderContext(url).url, url);
});

test("overlapping static and dynamic registrations only install Toolbox once", () => {
  const source = fs.readFileSync(path.join(toolbox, "content/linkify.js"), "utf8");
  const context = vm.createContext({ __metapcsSoLinkifierInstalled: true });
  assert.doesNotThrow(() => vm.runInContext(source, context));
});
