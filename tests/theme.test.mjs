import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../theme.js", import.meta.url), "utf8");

function storage(initial = {}) {
  const data = structuredClone(initial);
  const listeners = [];
  const writes = [];
  return {
    data, writes,
    api: {
      local: {
        async get() { return structuredClone(data); },
        async set(values) {
          writes.push(values);
          const changes = {};
          for (const [key, value] of Object.entries(values)) {
            changes[key] = { oldValue: data[key], newValue: value };
            data[key] = value;
          }
          for (const listener of listeners) listener(changes, "local");
        },
      },
      onChanged: { addListener(fn) { listeners.push(fn); } },
    },
  };
}

function view(store) {
  const properties = {};
  const root = { dataset: {}, style: { setProperty(key, value) { properties[key] = value; } } };
  const picker = {};
  const context = vm.createContext({
    chrome: { storage: store.api },
    document: { documentElement: root, getElementById: () => picker, addEventListener() {} },
    console,
  });
  vm.runInContext(source, context);
  return { theme: context.PluginManagerTheme, root, properties, picker };
}

test("manager theme applies to every loaded view, future views, and the picker", async () => {
  const store = storage({ "pm.theme": "meta" });
  const views = Array.from({ length: 4 }, () => view(store));
  await Promise.all(views.map((item) => item.theme.ready));
  await views[0].theme.select("white");
  for (const item of views) {
    assert.equal(item.root.dataset.theme, "white");
    assert.equal(item.root.style.colorScheme, "light");
    assert.equal(item.properties["--bg"], "#f3f3f1");
    assert.equal(item.properties["--surface"], item.properties["--panel"]);
    assert.equal(item.properties["--ink"], item.properties["--text"]);
    assert.equal(item.properties["--acid"], item.properties["--accent"]);
    assert.equal(item.picker.value, "white");
  }
  const reopened = view(store);
  await reopened.theme.ready;
  assert.equal(reopened.root.dataset.theme, "white");
  assert.deepEqual(Object.keys(store.writes[0]), ["pm.theme"]);
});

test("legacy preferences migrate once and cannot override the manager choice", async () => {
  const store = storage({ "warranty-tool-theme": "gta", "techbay-tool-theme": "white" });
  const first = view(store);
  await first.theme.ready;
  assert.equal(store.data["pm.theme"], "gta");
  await first.theme.select("fallout");
  const next = view(store);
  await next.theme.ready;
  assert.equal(next.root.dataset.theme, "fallout");
});

test("Toolbox palettes migrate and all palettes define complete shared tokens", async () => {
  const store = storage({ settings: { theme: "midnight" } });
  const item = view(store);
  await item.theme.ready;
  assert.equal(item.root.dataset.theme, "midnight");
  for (const theme of item.theme.themes) {
    await item.theme.select(theme.id);
    for (const token of ["--bg", "--panel", "--text", "--dim", "--on-accent", "--ok", "--acid"]) {
      assert.ok(item.properties[token], `${theme.id}: ${token}`);
    }
  }
  await assert.rejects(item.theme.select("missing"), /Unknown Plugin Manager theme/);
});

test("only Plugin Manager has a theme picker; all active plugins load the shared theme", async () => {
  for (const folder of ["Dashboard-Tool", "metapcs-toolbox", "techbay-planner-plugin"]) {
    const html = await readFile(new URL(`../Plugins/${folder}/popup.html`, import.meta.url), "utf8");
    assert.match(html, /src="\.\.\/\.\.\/theme.js"/);
    assert.doesNotMatch(html, /<select[^>]*(?:theme-select|Color theme)|id="set-themes"/);
  }
  const html = await readFile(new URL("../panel.html", import.meta.url), "utf8");
  assert.match(html, /id="pm-theme"/);
  assert.match(html, /<button[^>]*popovertarget="pm-settings"/);
  assert.match(html, /<section[^>]*id="pm-settings"[^>]*popover/);
  assert.match(html, /id="pm-reload"/);
  assert.ok(html.indexOf("</header>") < html.indexOf('id="pm-settings"'));
});
