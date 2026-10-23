import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../content.js", import.meta.url), "utf8");

function fixture(initial, listName = "") {
  class Control {
    constructor(value) {
      this.currentValue = value;
      this.textContent = value;
      this.type = "textarea";
      this.labels = [];
      this.disabled = false;
    }
    get value() { return this.currentValue; }
    set value(value) { this.currentValue = value; }
    getAttribute() { return ""; }
    getBoundingClientRect() { return { width: 100, height: 30 }; }
    dispatchEvent() {}
  }
  class Textarea extends Control {
    get value() { return this.currentValue; }
    set value(value) { this.currentValue = value; }
  }
  class Input extends Control {}
  class Select extends Control {}
  const fields = Object.fromEntries(
    Object.entries(initial).map(([name, value]) => [name, new Textarea(value)]),
  );
  const labels = Object.entries(fields).map(([textContent, control]) => {
    const label = {
      textContent,
      control,
      parentElement: null,
      getAttribute: () => "",
      querySelector: () => null,
      getBoundingClientRect: () => ({ width: 100, height: 20 }),
    };
    control.labels.push(label);
    return label;
  });
  let listener;
  const window = {};
  window.top = window;
  vm.runInNewContext(source, {
    window,
    location: { hostname: "app.workmatepos.co", pathname: "/orders/296" },
    HTMLTextAreaElement: Textarea,
    HTMLInputElement: Input,
    HTMLSelectElement: Select,
    Event,
    setTimeout,
    getComputedStyle: () => ({ visibility: "visible" }),
    document: {
      getElementById: () => null,
      querySelectorAll(selector) {
        if (selector === "label" || selector.startsWith("label,")) return labels;
        if (selector === "iframe" || selector.startsWith("table,")) return [];
        if (selector.startsWith('[role="tab"]')) return listName ? [{
          textContent: listName,
          getBoundingClientRect: () => ({ width: 100, height: 20 }),
        }] : [];
        return Object.values(fields);
      },
    },
    chrome: {
      runtime: { onMessage: { addListener: (handler) => { listener = handler; } } },
    },
  });
  return {
    fields,
    read: () => new Promise((resolve) =>
      listener({ type: "TECHBAY_READ_ORDERS" }, {}, resolve),
    ),
    send: (values, allowEmpty = true) => new Promise((resolve) =>
      listener({ type: "TECHBAY_FILL_WORK_ORDER", values, allowEmpty }, {}, resolve),
    ),
  };
}

test("captures the selected Work Mate list tab name", async () => {
  const { read } = fixture({}, " Phoenix \n ");
  const response = await read();
  assert.equal(response.listName, "Phoenix");
  assert.equal(response.listDetected, false);
  assert.deepEqual(Array.from(response.orders), []);
});

test("main Note is append-only even when non-note text fields may be cleared", async () => {
  const original = "Tech Notes:\nPrior repair\n\nCallback Notes:\nPrior call \n ";
  const { fields, send } = fixture({ Note: original, "Daily update": "Old" });
  const result = await send({ checkInNote: "New entry", dailyUpdate: "" });
  assert.equal(result.filled, 2);
  assert.equal(fields.Note.value, `${original}\n\nNew entry`);
  assert.equal(fields["Daily update"].value, "");
  await send({ checkInNote: "" });
  assert.equal(fields.Note.value, `${original}\n\nNew entry`);
});

test("Tech Notes and Callback Notes append to their own controls without deleting history", async () => {
  const { fields, send } = fixture({
    "Tech Notes": "Prior diagnostic",
    "Callback Notes": "Prior customer call",
    "Hidden note": "Existing private note",
  });
  const result = await send({
    techNotes: "New repair",
    callbackNotes: "New customer call",
    hiddenNote: "Additional private note",
  });
  assert.equal(result.filled, 3);
  assert.equal(fields["Tech Notes"].value, "Prior diagnostic\n\nNew repair");
  assert.equal(fields["Callback Notes"].value, "Prior customer call\n\nNew customer call");
  assert.equal(fields["Hidden note"].value, "Existing private note\n\nAdditional private note");
});

test("section additions fall back to the shared Note without overwriting its old sections", async () => {
  const original = "Tech Notes:\nOld repair\n\nCallback Notes:\nOld call";
  const { fields, send } = fixture({ Note: original });
  const result = await send({ techNotes: "New repair", callbackNotes: "New call" });
  assert.equal(result.filled, 2);
  assert.equal(fields.Note.value, `${original}\n\nTech Notes:\nNew repair\n\nCallback Notes:\nNew call`);
  await send({ techNotes: "New repair", callbackNotes: "New call" });
  assert.equal(fields.Note.value, `${original}\n\nTech Notes:\nNew repair\n\nCallback Notes:\nNew call`);
});

test("filling a captured Note again never replaces newer text already on the page", async () => {
  const captured = "Original notes";
  const current = `${captured}\n\nNewer Work Mate callback`;
  const { fields, send } = fixture({ Note: current });
  await send({ checkInNote: captured });
  assert.equal(fields.Note.value, current);
});
