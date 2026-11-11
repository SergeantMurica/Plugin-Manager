const { test } = require("node:test");
const assert = require("node:assert/strict");
const model = require("./notes-model.js");

const base = {
  order: "2295", date: "2026-11-01", initials: "ac",
  runs: [
    { test: "Meta Mark (40 min)", result: "fail", duration: "12 min", when: "Nov 1, 7:00 PM", failures: ["GPU errors"] },
    { test: "Cooling check (~2 min)", result: "FAULT ON RECORD pass, warnings", duration: "2 min", fault: true, warnings: ["Fan speed low"], not_tested: ["Pump"] },
  ],
};

test("generates accurate dated notes without inferring work or planned runtime", () => {
  const text = model.generate(base);
  assert.match(text, /^11\/1 AC\n-Meta Mark/);
  assert.doesNotMatch(text, /SO#|2295/);
  assert.match(text, /Meta Mark \(40 min\): FAILED\n/);
  assert.doesNotMatch(text, /actual duration:|Nov 1, 7:00 PM|12 min/);
  assert.match(text, /Failure: GPU errors/);
  assert.match(text, /PASSED WITH WARNINGS/);
  assert.doesNotMatch(text, /Fault on record; a passing run does not clear an existing fault\./);
  assert.match(text, /Warning: Fan speed was lower than expected\./);
  assert.doesNotMatch(text, /Not tested:|Pump/);
  assert.doesNotMatch(text, /Updated BIOS|RFP|Booted|PASSED; actual duration: 40 min/);
});

test("omits actual duration and run timestamp from customer notes", () => {
  const text = model.generate({
    ...base,
    runs: [{ test: "Network & ports (~15 s)", result: "pass", duration: "16 s", when: "Nov 1, 7:14 PM" }],
  });
  assert.equal(text, "11/1 AC\n-Network & ports (~15 s): PASSED");
});

test("retains non-pass results but omits attention banners and obsolete additional work", () => {
  const text = model.generate({
    ...base, runs: ["inconclusive", "interrupted", "stopped", "running", "new-status"].map((result) => ({ test: "Stress", result })),
    alerts: ["Fault still open", "Fault still open"], manual: "-Updated BIOS\n\nQC checklist completed",
  });
  for (const result of ["INCONCLUSIVE", "INTERRUPTED", "STOPPED", "RUNNING", "NEW-STATUS"]) assert.match(text, new RegExp(result));
  assert.doesNotMatch(text, /ATTENTION|Fault still open/);
  assert.doesNotMatch(text, /Updated BIOS|QC checklist completed/);
});

test("deduplicates repeated details within a run without hiding separate tests", () => {
  const run = { test: "GPU stress", result: "fail", warnings: ["PCIe link slow", "PCIe link slow"], failures: ["GPU errors", "GPU errors"] };
  const text = model.generate({ ...base, runs: [run, run] });
  assert.equal((text.match(/GPU stress: FAILED/g) || []).length, 2);
  assert.equal((text.match(/Warning: A hardware connection was running below its rated speed\./g) || []).length, 2);
  assert.equal((text.match(/Failure: GPU errors/g) || []).length, 2);
});

test("turns customer examples into concise warnings without technical advice or untested items", () => {
  const text = model.generate({
    ...base,
    runs: [{
      test: "Meta Mark", result: "pass, warnings",
      warnings: [
        "CPU cooler is weak for this load (0.39 °C/W at 154 W): a healthy liquid cooler reads about 0.20 °C/W. Check the pump (speed, noise), the mount and paste, and the radiator fans",
        "during the run: a program crashed 1 time(s) during the run (segfault) (crashes on core 4 (CPU 3))",
        "during the run: a program crashed 2 time(s) during the run (segfault)",
      ],
      not_tested: ["Retest 1: no core flagged: did not run", "motherboard ports (USB, LAN, audio, Wi-Fi): not exercised by this test", "the PSU on its own: only loaded through the CPU + GPU stages"],
    }],
    alerts: ["Fault on record", "Not done yet"],
  });
  assert.equal(text, "11/1 AC\n-Meta Mark: PASSED WITH WARNINGS\n  Warning: Processor cooling was below expectations under heavy load.\n  Warning: An application crashed during testing.");
  assert.doesNotMatch(text, /Not tested|ATTENTION|segfault|core 4|0\.39|154 W|pump|PSU/);
});

test("unknown warning details are omitted without changing the recorded result", () => {
  const warning = "unrecognized diagnostic: register 0x1234; rerun with options";
  assert.equal(model.customerWarning(warning), "");
  const text = model.generate({
    ...base,
    runs: [{ test: "Meta Mark", result: "pass, warnings", warnings: [warning] }],
  });
  assert.equal(text, "11/1 AC\n-Meta Mark: PASSED WITH WARNINGS");
  assert.doesNotMatch(text, /technician review|Warning:|register|0x1234/);
  assert.equal(model.customerWarning(""), "");
  assert.equal(model.customerWarning("no fan sped up under load (fans on a hub the board can't read)"), "A fan speed increase could not be confirmed during testing.");
  assert.equal(model.customerWarning("3 blue screen(s) in the last 6 months"), "Previous Windows crashes were found in the system history.");
});

test("validates note requirements", () => {
  for (const changes of [{ order: "" }, { date: "" }, { initials: " " }, { runs: [] }]) {
    assert.throws(() => model.generate({ ...base, ...changes }));
  }
  assert.throws(() => model.generate({ ...base, runs: [], manual: "Inspected system" }), /Select at least one run/);
});

test("SO# search accepts numeric and prefixed orders, including orders not loaded yet", () => {
  for (const value of ["2190", "SO# 2190", "so 2190", "#2190", "  SO #2190  "]) {
    assert.equal(model.orderSearchPath(value), "/my-runs/visit/2190#work-order-notes");
  }
  assert.equal(model.orderSearchPath("990003"), "/my-runs/visit/990003#work-order-notes");
  for (const value of ["", "MPC2190", "2190/other", "../2190", "https://example.com", "2190?x=1", "-2190"]) {
    assert.throws(() => model.orderSearchPath(value), /Enter a numeric SO#/);
  }
});

test("orders runs oldest to newest regardless of source order without mutating input", () => {
  const runs = [
    { test: "Meta Mark", when: "Oct 29, 2:46 PM", result: "pass" },
    { test: "Cooling", when: "Oct 29, 11:32 AM", result: "pass" },
    { test: "Network", when: "Oct 29, 11:20 AM", result: "pass" },
    { test: "Drives", when: "Oct 29, 10:53 AM", result: "pass" },
    { test: "Scan", when: "Oct 29, 10:47 AM", result: "fail" },
    { test: "Previous day", when: "Oct 28, 11:59 PM", result: "pass" },
  ];
  const expected = ["Previous day", "Scan", "Drives", "Network", "Cooling", "Meta Mark"];
  assert.deepEqual(model.sortRuns(runs).map((run) => run.test), expected);
  const text = model.generate({ ...base, runs });
  assert.deepEqual(text.split("\n").slice(1).map((line) => line.slice(1).split(":")[0]), expected);
  assert.equal(runs[0].test, "Meta Mark");
});

test("keeps equal timestamps stable and places undated runs last", () => {
  const runs = [
    { test: "Undated" },
    { test: "First", when: "Nov 1, 1:00 PM" },
    { test: "Second", when: "Nov 1, 1:00 PM" },
    { test: "Unrecognized date", when: "unknown" },
  ];
  assert.deepEqual(model.sortRuns(runs).map((run) => run.test), ["First", "Second", "Undated", "Unrecognized date"]);
});

test("reads only valid table work orders and preserves measured duration", () => {
  assert.equal(model.fromCells(["Nov 1", "peoria", "xubuntu", "—", "MPC1234", "Scan", "pass", "—"]), null);
  const run = model.fromCells(["Nov 1", "peoria", "xubuntu", "2295", "—", "Scan", "FAULT ON RECORD pass", "16 s"]);
  assert.equal(run.order, "2295");
  assert.equal(run.duration, "16 s");
  assert.equal(run.fault, true);
});

test("parses event data and computes actual elapsed time, not an estimate", () => {
  assert.deepEqual(model.eventData('data: {"warnings":["A"],"nested":{"x":1}} · station: bench'), { warnings: ["A"], nested: { x: 1 } });
  assert.throws(() => model.eventData("unknown"));
  assert.throws(() => model.eventData("data: {bad}"));
  assert.equal(model.duration("2026-11-01 18:55:32", "2026-11-01 19:10:55"), "15 min 23 s");
  assert.equal(model.duration("2026-11-01 23:59:55", "2026-11-02 00:00:11"), "16 s");
  assert.equal(model.duration("", ""), "");
  assert.equal(model.duration("2026-11-02", "2026-11-01"), "");
});

test("finds independent CPU and GPU maximum readings across stages and selected runs", () => {
  const stages = [
    "CPU: Linpack: pass (2 min · CPU peak 90 °C, 289 W, 4.28 GHz avg (4.93 peak) · RAM used up to 84%)",
    "CPU: Extreme: pass (2 min · CPU peak 93 °C, 291 W, 4.78 GHz avg (4.88 peak))",
    "Core cycling: pass (2 min · CPU peak 82 °C, 85 W, 3.35 GHz peak)",
    "Power transients: pass (49 s · CPU peak 90 °C, 254 W, 3.89 GHz avg (4.60 peak) · GPU peak 75 °C, 284 W, 2865 MHz · GPU fans peak 2,137 rpm)",
    "GPU: full load: pass (2 min · GPU peak 76 °C, 285 W, 2895 MHz · GPU fans peak 2,444 rpm)",
    "Video engines: pass (4 s)",
  ];
  assert.deepEqual(model.peakReadings(stages), {
    cpu: { temperature: 93, watts: 291, mhz: 4930 },
    gpu: { temperature: 76, watts: 285, mhz: 2895 },
  });
  assert.equal(model.formatPeaks(model.peakReadings(stages)),
    "CPU: 93 °C, 291 W, 4930 MHz\nGPU: 76 °C, 285 W, 2895 MHz");
  assert.deepEqual(model.peakReadings(stages.slice(0, 3)).gpu, {});
});

test("does not mistake average frequency or fan speed for a peak, or invent missing readings", () => {
  const readings = model.peakReadings([
    "CPU: pass (CPU peak 70 °C, 100 W, 4.25 GHz avg · GPU fans peak 3,000 rpm)",
    "GPU: pass (GPU peak 55 °C · GPU fans peak 2,000 rpm)",
  ]);
  assert.deepEqual(readings, { cpu: { temperature: 70, watts: 100 }, gpu: { temperature: 55 } });
  assert.equal(model.formatPeaks(readings),
    "CPU: 70 °C, 100 W, frequency not recorded\nGPU: 55 °C, power not recorded, frequency not recorded");
  assert.equal(model.formatPeaks(model.peakReadings()),
    "CPU: temperature not recorded, power not recorded, frequency not recorded\nGPU: temperature not recorded, power not recorded, frequency not recorded");
});

test("uses recorded test dates and falls back to the date displayed in the runs table", () => {
  assert.equal(model.runDate({ ended: "2026-11-09 00:01:00", started: "2026-11-08 23:59:00", when: "Nov 9, 12:01 AM" }), "2026-11-09");
  assert.equal(model.runDate({ started: "2026-11-08 23:59:00" }), "2026-11-08");
  assert.equal(model.runDate({ when: "Nov 9, 4:57 PM" }), "Nov 9");
  assert.equal(model.runDate({ when: "unknown" }), "");
});
