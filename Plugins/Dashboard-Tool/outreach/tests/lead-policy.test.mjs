import assert from "node:assert/strict";
import test from "node:test";
import { belongsInLeadLog } from "../lib/lead-policy.js";

test("looking at an unclaimed lead never makes it logged work", () => {
  assert.equal(belongsInLeadLog({ type: "financing", status: "new", steps: {}, claimedBy: "" }), false);
});

test("Dash ownership alone is not outreach activity", () => {
  assert.equal(belongsInLeadLog({ type: "financing", status: "new", steps: {}, claimedBy: "Someone Else" }), false);
});

test("only non-warranty active work enters Lead log", () => {
  assert.equal(belongsInLeadLog({ type: "financing", status: "new", steps: { called: 100 } }), true);
  assert.equal(belongsInLeadLog({ type: "abandoned", status: "callback", steps: {} }), true);
  assert.equal(belongsInLeadLog({ type: "warranty", status: "contacted", steps: { called: 100 } }), false);
  assert.equal(belongsInLeadLog({ type: "financing", status: "dead", steps: { called: 100 } }), false);
  assert.equal(belongsInLeadLog(undefined), false);
});
