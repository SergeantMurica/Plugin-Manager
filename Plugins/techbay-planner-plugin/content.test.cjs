const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const source = readFileSync(join(__dirname, "content.js"), "utf8");
const finder = source.slice(
  source.indexOf("  function findDailyUpdateField()"),
  source.indexOf("  function installDailyEditor()"),
);
class Input {
  constructor(type = "text", inTable = false) {
    this.type = type;
    this.inTable = inTable;
  }
  closest() { return this.inTable ? {} : null; }
  getAttribute() { return null; }
}
class Textarea extends Input {}

function find(control) {
  const context = vm.createContext({
    FIELD_LABELS: { dailyUpdate: ["daily update"] },
    findField: () => control,
    HTMLInputElement: Input,
    HTMLTextAreaElement: Textarea,
  });
  vm.runInContext(finder, context);
  return context.findDailyUpdateField();
}

test("does not attach Update to a list checkbox or other non-text control", () => {
  assert.equal(find(new Input("checkbox")), undefined);
  assert.equal(find(new Input("search")), undefined);
  assert.equal(find(new Input("text", true)), undefined);
  assert.equal(find(new Textarea("text", true)), undefined);
  assert.equal(find(undefined), undefined);
});

test("attaches Update only to editable daily note text fields", () => {
  for (const control of [new Input(), new Textarea()]) {
    assert.equal(find(control), control);
    control.readOnly = true;
    assert.equal(find(control), undefined);
    control.readOnly = false;
    control.disabled = true;
    assert.equal(find(control), undefined);
  }
});
