(() => {
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const resultPattern = /^(pass(?:, warnings)?|fail|inconclusive|interrupted|stopped|running|warn|warning|cancelled|canceled|pending|queued)$/i;

  function resultLabel(value) {
    const result = clean(value).replace(/^FAULT ON RECORD\s*/i, "");
    const labels = {
      pass: "PASSED", "pass, warnings": "PASSED WITH WARNINGS",
      fail: "FAILED", warn: "WARNINGS", warning: "WARNINGS",
    };
    return labels[result.toLowerCase()] || result.toUpperCase() || "RESULT UNKNOWN";
  }

  function duration(started, ended) {
    const start = Date.parse(String(started || "").replace(" ", "T"));
    const end = Date.parse(String(ended || "").replace(" ", "T"));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "";
    const seconds = Math.round((end - start) / 1000);
    return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min${seconds % 60 ? ` ${seconds % 60} s` : ""}`;
  }

  function fromCells(cells) {
    if (cells.length !== 8 || !/^\d+$/.test(clean(cells[3]))) return null;
    return {
      order: clean(cells[3]), when: clean(cells[0]), bench: clean(cells[2]),
      test: clean(cells[5]), result: clean(cells[6]), duration: clean(cells[7]),
      fault: /FAULT ON RECORD/i.test(cells[6]),
    };
  }

  function eventData(text) {
    const match = /^data:\s*(\{.*\})(?:\s*·\s*station:.*)?$/s.exec(clean(text));
    if (!match) throw new Error("Run event data format changed. Review the run on Dash before copying notes.");
    return JSON.parse(match[1]);
  }

  function sortRuns(runs) {
    return runs.map((run) => ({ run, time: Date.parse(run.when || "") }))
      .sort((a, b) => {
        if (!Number.isFinite(a.time)) return Number.isFinite(b.time) ? 1 : 0;
        if (!Number.isFinite(b.time)) return -1;
        return a.time - b.time;
      })
      .map(({ run }) => run);
  }

  function runDate(run) {
    const recorded = /^(\d{4}-\d{2}-\d{2})/.exec(run.ended || run.started || "");
    if (recorded) return recorded[1];
    const displayed = clean(run.when).replace(/,\s*\d{1,2}:\d{2}\s*(?:AM|PM).*$/i, "").trim();
    return displayed && displayed !== clean(run.when) ? displayed : "";
  }

  function peakReadings(stages) {
    const peaks = { cpu: {}, gpu: {} };
    const update = (component, metric, value) => {
      if (Number.isFinite(value)) peaks[component][metric] = Math.max(peaks[component][metric] ?? -Infinity, value);
    };
    for (const stage of stages || []) {
      for (const match of stage.matchAll(/\b(CPU|GPU) peak\s+([^·]*)/gi)) {
        const component = match[1].toLowerCase();
        const reading = match[2];
        const temperature = /(\d+(?:\.\d+)?)\s*°C\b/i.exec(reading);
        const watts = /(\d+(?:\.\d+)?)\s*W\b/i.exec(reading);
        const averageWithPeak = /(\d+(?:\.\d+)?)\s*(GHz|MHz)\s+avg\s*\(\s*(\d+(?:\.\d+)?)\s*peak\s*\)/i.exec(reading);
        const peakFrequency = /(\d+(?:\.\d+)?)\s*(GHz|MHz)(?:\s+peak)?\b/i.exec(reading);
        if (temperature) update(component, "temperature", Number(temperature[1]));
        if (watts) update(component, "watts", Number(watts[1]));
        if (averageWithPeak) {
          update(component, "mhz", Number(averageWithPeak[3]) * (averageWithPeak[2].toLowerCase() === "ghz" ? 1000 : 1));
        } else if (peakFrequency && !/\bavg\b/i.test(reading)) {
          update(component, "mhz", Number(peakFrequency[1]) * (peakFrequency[2].toLowerCase() === "ghz" ? 1000 : 1));
        }
      }
    }
    return peaks;
  }

  function formatPeaks(peaks) {
    return ["cpu", "gpu"].map((component) => {
      const { temperature, watts, mhz } = peaks[component];
      return `${component.toUpperCase()}: ${temperature === undefined ? "temperature not recorded" : `${temperature} °C`}, ${watts === undefined ? "power not recorded" : `${watts} W`}, ${mhz === undefined ? "frequency not recorded" : `${mhz} MHz`}`;
    }).join("\n");
  }

  function customerWarning(value) {
    const text = clean(value);
    if (!text) return "";
    if (/CPU cooler is weak/i.test(text)) return "Processor cooling was below expectations under heavy load.";
    if (/program crashed|segfault/i.test(text)) return "An application crashed during testing.";
    if (/blue screen/i.test(text)) return "Previous Windows crashes were found in the system history.";
    if (/driver hang|recovered hang|driver resets?|driver.*(?:timed out|stopped responding)/i.test(text)) {
      return "Windows recorded a driver issue.";
    }
    if (/PCIe.*(?:link|slow)/i.test(text)) return "A hardware connection was running below its rated speed.";
    if (/no fan sped up/i.test(text)) return "A fan speed increase could not be confirmed during testing.";
    if (/fan speed low/i.test(text)) return "Fan speed was lower than expected.";
    if (/thermal thrott|temperature.*(?:high|limit)|overheat/i.test(text)) return "High temperatures were reported during testing.";
    if (/\b(?:SSD|drive|disk|storage)\b.*(?:health|wear|SMART)/i.test(text)) return "A storage health warning was reported.";
    if (/\b(?:RAM|memory)\b.*(?:speed|profile|XMP|EXPO)/i.test(text)) return "A memory speed or settings warning was reported.";
    return "";
  }

  function orderSearchPath(value) {
    const order = /^(?:SO\s*#?\s*|#\s*)?(\d+)$/i.exec(String(value || "").trim())?.[1];
    if (!order) throw new Error("Enter a numeric SO# (for example 2190 or SO# 2190).");
    return `/my-runs/visit/${order}#work-order-notes`;
  }

  function generate({ order, date, initials, runs }) {
    if (!/^\d+$/.test(order || "")) throw new Error("Select a work order.");
    const parsedDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
    if (!parsedDate) throw new Error("Enter a note date.");
    if (!clean(initials)) throw new Error("Enter your technician initials.");
    if (!runs.length) throw new Error("Select at least one run.");
    const lines = [
      `${Number(parsedDate[2])}/${Number(parsedDate[3])} ${clean(initials).toUpperCase()}`,
    ];
    for (const run of sortRuns(runs)) {
      lines.push(`-${run.test}: ${resultLabel(run.result)}`);
      for (const value of new Set((run.failures || []).map(clean).filter(Boolean))) lines.push(`  Failure: ${value}`);
      for (const value of new Set((run.warnings || []).map(customerWarning).filter(Boolean))) lines.push(`  Warning: ${value}`);
    }
    return lines.join("\n");
  }

  const model = { clean, resultPattern, resultLabel, duration, fromCells, eventData, sortRuns, runDate, peakReadings, formatPeaks, customerWarning, orderSearchPath, generate };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  else globalThis.dashboardRunNotes = model;
})();
