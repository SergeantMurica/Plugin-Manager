(() => {
  if (globalThis.__dashboardRunNotesInstalled) return;
  globalThis.__dashboardRunNotesInstalled = true;
  const model = globalThis.dashboardRunNotes;
  const PREFIX = "dashboard-run-notes-v1:";
  let mounted;
  let write = Promise.resolve();

  function readRuns(frame) {
    const visit = frame.querySelector('[data-myruns="visit"]');
    if (!visit) {
      const table = frame.querySelector('table[aria-label="Runs"]');
      if (!table) throw new Error("Open Runs to load the work orders, then open Work order notes again.");
      const headers = [...table.querySelectorAll("th")].map((cell) => model.clean(cell.textContent));
      if (headers.join("|") !== "When|Store|Bench|SO#|MPC|Test|Result|Took") {
        throw new Error("The Runs table format changed. Notes were not generated.");
      }
      const runs = [...table.querySelectorAll("tbody tr")].map((row) =>
        model.fromCells([...row.querySelectorAll("td")].map((cell) => cell.textContent))).filter(Boolean);
      const initials = /You log in at\s+\S+\s+as\s+([a-z0-9]+)/i.exec(frame.textContent)?.[1] || "";
      return { runs, initials };
    }

    const order = /^SO#\s*(\d+)/.exec(visit.querySelector("h2")?.textContent || "")?.[1];
    if (!order) throw new Error("Could not identify this work order. Notes were not generated.");
    const events = [...visit.querySelectorAll("li")].filter((item) => item.querySelector(":scope > div")?.textContent.startsWith("data:"));
    const testEvents = events.filter((item) => /^(test-end|scan)$/.test(item.querySelector(":scope > [data-kit='chip']")?.textContent || ""));
    const runs = [...visit.querySelectorAll("li")].filter((item) => item.querySelector(":scope > button")).map((item) => {
      const test = model.clean(item.querySelector("button").textContent);
      const result = [...item.children].find((child) => child.matches("[data-kit='chip']") && model.resultPattern.test(model.clean(child.textContent)))?.textContent;
      if (!result) throw new Error(`Could not read the result for ${test}. Review it on Dash.`);
      const when = model.clean(item.lastElementChild?.textContent).split(" · ")[0];
      const eventIndex = testEvents.findIndex((entry) => {
        const text = [...entry.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join("").trim();
        return text.startsWith(`${test}:`) && model.clean(entry.firstElementChild?.textContent) === when;
      });
      const event = eventIndex < 0 ? null : testEvents.splice(eventIndex, 1)[0];
      const data = event ? model.eventData(event.querySelector(":scope > div").textContent) : {};
      for (const field of ["failures", "warnings", "stages"]) {
        if (data[field] !== undefined && (!Array.isArray(data[field]) || data[field].some((value) => typeof value !== "string"))) {
          throw new Error(`Could not read ${field} for ${test}. Review it on Dash.`);
        }
      }
      return {
        order, test, when, result,
        duration: model.duration(data.started, data.ended),
        fault: !!item.querySelector('[data-myruns="fault"]'),
        failures: data.failures, warnings: data.warnings, stages: data.stages,
        started: data.started, ended: data.ended,
      };
    });
    const initials = /(?:^|·)\s*tech\s+([^·]+)/.exec(visit.querySelector('[data-myruns="visit-line"]')?.textContent || "")?.[1]?.trim() || "";
    return { runs, order, initials };
  }

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function mount(frame, nav) {
    const tab = element("button", "Work order notes", "ui-btn ui-btn--ghost");
    tab.type = "button";
    tab.setAttribute("aria-expanded", "false");
    tab.setAttribute("aria-controls", "dashboard-run-notes");
    nav.insertBefore(tab, nav.lastElementChild);
    const panel = element("section", "", "dashboard-run-notes");
    panel.id = "dashboard-run-notes";
    panel.hidden = true;
    panel.setAttribute("aria-label", "Work order notes");
    const title = element("h2", "Work order notes");
    const hint = element("p", "Customer-ready summaries from loaded runs. Search an SO# for its full history. Review before copying; regenerate after changes.");
    const status = element("p");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const searchForm = element("form", "", "run-notes-search");
    searchForm.setAttribute("role", "search");
    searchForm.setAttribute("aria-label", "Find work-order notes");
    const searchLabel = element("label", "Search SO#");
    const searchRow = element("div", "", "run-notes-search-row");
    const search = element("input");
    search.type = "search";
    search.inputMode = "numeric";
    search.placeholder = "2190 or SO# 2190";
    search.setAttribute("list", "run-notes-orders");
    const suggestions = element("datalist");
    suggestions.id = "run-notes-orders";
    const openOrder = element("button", "Open SO#", "ui-btn ui-btn--primary");
    openOrder.type = "submit";
    searchLabel.append(search);
    searchRow.append(searchLabel, openOrder);
    searchForm.append(searchRow, suggestions);
    const fields = element("div", "", "run-notes-fields");
    function field(label, control) {
      const wrapper = element("label", label);
      wrapper.append(control);
      fields.append(wrapper);
      return control;
    }
    const order = field("Work order (SO#)", element("select"));
    const date = field("Note date", element("input"));
    date.type = "date";
    const today = new Date();
    date.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const initials = field("Technician initials", element("input"));
    initials.maxLength = 12;
    const runList = element("fieldset");
    runList.append(element("legend", "Include runs"));
    const dateSelection = element("label", "Select runs by test date");
    const testDate = element("select");
    dateSelection.append(testDate);
    const peaksTitle = element("h3", "QC maximum readings");
    const peaksHint = element("p", "Maximum recorded values across selected runs and per run. Values may come from different stages. Open the SO# visit for full readings.");
    const peaks = element("div", "", "run-notes-peaks");
    peaks.setAttribute("aria-live", "polite");
    const preview = element("textarea");
    preview.rows = 15;
    preview.spellcheck = false;
    const previewLabel = element("label", "Editable work-order notes");
    previewLabel.className = "run-notes-preview";
    previewLabel.append(preview);
    const actions = element("div", "", "run-notes-actions");
    const generate = element("button", "Regenerate notes", "ui-btn ui-btn--ghost");
    const copy = element("button", "Copy notes", "ui-btn ui-btn--primary");
    generate.type = copy.type = "button";
    actions.append(generate, copy);
    const toolbar = element("div", "", "run-notes-toolbar");
    toolbar.append(searchForm, fields);
    const layout = element("div", "", "run-notes-layout");
    const selection = element("div", "", "run-notes-selection");
    selection.append(dateSelection, runList, peaksTitle, peaksHint, peaks);
    const editor = element("div", "", "run-notes-editor");
    editor.append(actions, previewLabel);
    layout.append(selection, editor);
    panel.append(title, hint, toolbar, status, layout);
    nav.after(panel);
    let source;
    let activeOrder = "";
    let loading = false;
    const message = (text, error = false) => {
      status.textContent = text;
      status.setAttribute("role", error ? "alert" : "status");
      status.dataset.error = String(error);
    };
    const key = () => `${PREFIX}${location.origin}:${activeOrder}`;

    function save() {
      if (loading || !activeOrder) return write;
      const draftKey = key();
      const draft = { date: date.value, initials: initials.value, preview: preview.value };
      write = write.then(() => chrome.storage.local.set({ [draftKey]: draft }))
        .catch((error) => message(`Draft could not be saved: ${error.message}`, true));
      return write;
    }

    searchForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const path = model.orderSearchPath(search.value);
        openOrder.disabled = true;
        await save();
        location.assign(new URL(path, location.origin).href);
        if (location.pathname === path.split("#")[0]) {
          if (!panel.hidden) close();
          tab.click();
        }
      } catch (error) {
        message(error.message, true);
        search.focus();
      } finally {
        openOrder.disabled = false;
      }
    });

    function regenerate() {
      preview.value = model.generate({
        order: activeOrder, date: date.value, initials: initials.value,
        runs: [...runList.querySelectorAll("input:checked")].map((input) => source.runs[Number(input.value)]),
      });
      message("Notes generated. Review the preview before copying. Changes to run selection or fields require Regenerate notes.");
      save();
    }

    function updatePeaks() {
      const selected = [...runList.querySelectorAll("input:checked")].map((input) => source.runs[Number(input.value)]);
      peaks.replaceChildren();
      if (!selected.length) {
        peaks.textContent = "Select runs to see maximum readings.";
        return;
      }
      const total = element("p");
      total.append(element("strong", "Selected runs"), document.createElement("br"),
        document.createTextNode(model.formatPeaks(model.peakReadings(selected.flatMap((run) => run.stages || [])))));
      peaks.append(total);
      const missing = selected.filter((run) => {
        const readings = model.peakReadings(run.stages);
        return !Object.keys(readings.cpu).length && !Object.keys(readings.gpu).length;
      }).length;
      if (missing) peaks.append(element("p", `${missing} of ${selected.length} selected run(s) have no recorded CPU or GPU readings. Maxima include available readings only.`));
      for (const run of selected) {
        const item = element("p");
        item.append(element("strong", `${run.when} - ${run.test}`), document.createElement("br"),
          document.createTextNode(model.formatPeaks(model.peakReadings(run.stages))));
        peaks.append(item);
      }
    }

    async function selectOrder() {
      await save();
      activeOrder = order.value;
      loading = true;
      order.disabled = generate.disabled = copy.disabled = true;
      fields.inert = selection.inert = previewLabel.inert = true;
      panel.setAttribute("aria-busy", "true");
      runList.replaceChildren(element("legend", "Include runs"));
      const dates = [...new Set(source.runs.filter((run) => run.order === activeOrder).map(model.runDate).filter(Boolean))];
      testDate.replaceChildren();
      const allDates = element("option", "All dates");
      allDates.value = "";
      testDate.append(allDates);
      for (const value of dates) {
        const option = element("option", value);
        option.value = value;
        testDate.append(option);
      }
      source.runs.forEach((run, index) => {
        if (run.order !== activeOrder) return;
        const label = element("label");
        const checkbox = element("input");
        checkbox.type = "checkbox";
        checkbox.value = String(index);
        checkbox.checked = true;
        checkbox.addEventListener("change", () => {
          updatePeaks();
          message("Run selection changed. Regenerate notes to update the preview.");
        });
        label.append(checkbox, document.createTextNode(`${run.when} - ${run.test}: ${model.resultLabel(run.result)}${run.duration && run.duration !== "—" ? ` (${run.duration})` : ""}${run.fault ? " - FAULT ON RECORD" : ""}`));
        runList.append(label);
      });
      updatePeaks();
      try {
        const draft = (await chrome.storage.local.get(key()))[key()];
        preview.value = draft?.preview || "";
        initials.value = draft?.initials || source.initials;
        date.value = draft?.date || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        loading = false;
        generate.disabled = copy.disabled = false;
        if (draft) message("Saved draft restored. Regenerate to include current run data; this replaces preview edits.");
        else if (initials.value && source.runs.some((run) => run.order === activeOrder)) regenerate();
        else message("Enter your initials and select runs, then generate notes.");
      } catch (error) {
        activeOrder = "";
        preview.value = "";
        generate.disabled = copy.disabled = true;
        message(`Could not load notes: ${error.message}. Close and reopen this tab to retry.`, true);
      } finally {
        loading = false;
        order.disabled = false;
        fields.inert = selection.inert = previewLabel.inert = false;
        panel.setAttribute("aria-busy", "false");
      }
    }

    order.addEventListener("change", () => { selectOrder().catch((error) => message(error.message, true)); });
    testDate.addEventListener("change", () => {
      for (const checkbox of runList.querySelectorAll("input[type='checkbox']")) {
        checkbox.checked = !testDate.value || model.runDate(source.runs[Number(checkbox.value)]) === testDate.value;
      }
      updatePeaks();
      message("Run selection changed. Regenerate notes to update the preview.");
    });
    for (const input of [date, initials, preview]) input.addEventListener("input", () => {
      message(input === preview ? "Preview edited. Copy notes copies this exact text." : "Fields changed. Regenerate notes to update the preview.");
      save();
    });
    generate.addEventListener("click", () => {
      if (preview.value && !globalThis.confirm("Replace the preview with regenerated notes? Manual preview edits will be replaced.")) return;
      try { regenerate(); } catch (error) { message(error.message, true); }
    });
    copy.addEventListener("click", async () => {
      try {
        if (!preview.value.trim()) throw new Error("Generate or enter notes before copying.");
        await navigator.clipboard.writeText(preview.value);
        message("Notes copied. Paste them into the work order; nothing was submitted automatically.");
        await save();
      } catch (error) {
        message(`Could not copy notes: ${error.message}. You can select the preview and copy it manually.`, true);
      }
    });
    function close() {
      panel.hidden = true;
      frame.removeAttribute("data-run-notes-open");
      tab.setAttribute("aria-expanded", "false");
      save();
    }
    nav.addEventListener("click", (event) => {
      if (event.target.closest("button") !== tab) close();
    });
    tab.addEventListener("click", async () => {
      if (!panel.hidden) { close(); return; }
      if (mounted?.tab === tab) mounted.autoOpened = true;
      try {
        source = readRuns(frame);
        source.runs = model.sortRuns(source.runs);
        const orders = [...new Set([source.order, ...source.runs.map((run) => run.order)].filter(Boolean))];
        if (!orders.length) throw new Error("No work-order runs are loaded on this page yet.");
        order.replaceChildren(...orders.map((value) => {
          const option = element("option", `SO# ${value}`);
          option.value = value;
          return option;
        }));
        suggestions.replaceChildren(...orders.map((value) => {
          const option = element("option");
          option.value = value;
          return option;
        }));
        panel.hidden = false;
        frame.setAttribute("data-run-notes-open", "");
        tab.setAttribute("aria-expanded", "true");
        await selectOrder();
      } catch (error) {
        await save();
        activeOrder = "";
        order.replaceChildren();
        runList.replaceChildren(element("legend", "Include runs"));
        testDate.replaceChildren();
        peaks.replaceChildren();
        preview.value = "";
        panel.hidden = false;
        tab.setAttribute("aria-expanded", "true");
        message(error.message, true);
        generate.disabled = copy.disabled = true;
      }
    });
    return { frame, tab, panel, close, path: location.pathname };
  }

  function sync() {
    const frame = /^\/my-runs(?:\/|$)/.test(location.pathname) && document.querySelector("[data-myruns-frame]");
    const nav = frame?.querySelector('.modnav[aria-label="My runs"]');
    if (mounted && (mounted.frame !== frame || !mounted.tab.isConnected || mounted.path !== location.pathname)) {
      mounted.close();
      mounted.tab.remove();
      mounted.panel.remove();
      mounted = null;
    }
    if (frame && nav && !mounted) mounted = mount(frame, nav);
    if (mounted && !mounted.autoOpened && location.hash === "#work-order-notes" &&
        frame.querySelector('[data-myruns="visit"] h2')) {
      mounted.autoOpened = true;
      mounted.tab.click();
    }
  }
  const observer = new MutationObserver(sync);
  observer.observe(document.body, { childList: true, subtree: true });
  sync();
})();
