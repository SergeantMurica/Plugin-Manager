import assert from "node:assert/strict";
import test from "node:test";
import { sendDashMessage } from "../lib/dash.js";

function fixture(error) {
  const calls = [];
  let attempts = 0;
  const api = {
    tabs: {
      async sendMessage(id, message) {
        calls.push(["message", id, message]);
        if (++attempts === 1 && error) throw error;
        return { ok: true, data: { leadId: "WL-123" } };
      },
      async get(id) { calls.push(["tab", id]); return { url: "https://dash.metapcs.com/pound/item/WL-123" }; },
    },
    scripting: { async executeScript(options) { calls.push(["inject", options]); } },
  };
  return { api, calls };
}

test("working Dash receivers are used without injecting again", async () => {
  const f = fixture();
  assert.equal((await sendDashMessage(1, { type: "plScrape" }, f.api)).ok, true);
  assert.equal(f.calls.length, 1);
});

test("a missing Dash receiver is reinstalled before retrying the same message", async () => {
  const f = fixture(new Error("Could not establish connection. Receiving end does not exist."));
  const message = { type: "plScrape" };
  assert.equal((await sendDashMessage(1, message, f.api)).data.leadId, "WL-123");
  assert.deepEqual(f.calls.map(([name]) => name), ["message", "tab", "inject", "message"]);
  assert.equal(f.calls[2][1].target.tabId, 1);
  assert.match(f.calls[2][1].files[0], /content\.js$/);
  assert.equal(f.calls[3][2], message);
});

test("a tab that navigated away from Dash is never injected", async () => {
  const f = fixture(new Error("Receiving end does not exist."));
  f.api.tabs.get = async () => ({ url: "https://example.com/" });
  await assert.rejects(sendDashMessage(1, { type: "plScrape" }, f.api), /no longer a Dash/);
  assert.ok(!f.calls.some(([name]) => name === "inject"));
});

test("permission errors and reconnection failures are surfaced without retry loops", async () => {
  const f = fixture(new Error("Access denied"));
  await assert.rejects(sendDashMessage(1, { type: "plScrape" }, f.api), /Access denied/);
  assert.equal(f.calls.length, 1);
  const missing = fixture(new Error("Receiving end does not exist."));
  missing.api.scripting.executeScript = async () => { throw new Error("Site access denied"); };
  await assert.rejects(sendDashMessage(1, { type: "plScrape" }, missing.api), /Site access denied/);
});
