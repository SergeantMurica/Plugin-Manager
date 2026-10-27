const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const context = vm.createContext({});
vm.runInContext(readFileSync(join(__dirname, "daily-update.js"), "utf8"), context);
const { stamp } = context.TechbayDailyUpdate;

test("replaces only the existing date and initials, preserving the note", () => {
  for (const header of ["10/26 AC", "10/26/2026 AC", "2026-10-26 AC"]) {
    const body = "Reinstall Windows on the new SSD - keep files\nSecond line remains.";
    assert.equal(stamp(`${header} - ${body}`, "2026-10-27", "JS"), `10/27 JS - ${body}`);
  }
});

test("stamping repeatedly does not duplicate the header", () => {
  const first = stamp("10/26 AC - Reinstall Windows on the new SSD", "2026-10-27", "AC");
  assert.equal(stamp(first, "2026-10-27", "AC"), first);
});

test("adds a header to unstamped and empty notes", () => {
  assert.equal(stamp("Reinstall Windows", "2026-10-27", "AC"), "10/27 AC - Reinstall Windows");
  assert.equal(stamp("", "2026-10-27", "AC"), "10/27 AC");
});

test("invalid dates and missing initials are explicit errors", () => {
  assert.throws(() => stamp("Note", "2026-02-30", "AC"), /valid Daily update date/);
  assert.throws(() => stamp("Note", "2026-10-27", ""), /technician initials/);
});
