(() => {
  if (globalThis.__techbayWorkOrderListenerInstalled) return;
  globalThis.__techbayWorkOrderListenerInstalled = true;

  const FIELD_LABELS = {
    device: ["device"],
    makeModel: ["make/model"],
    serial: ["serial"],
    pin: ["pin"],
    image: ["image"],
    s2s: ["s2s"],
    priority: ["priority"],
    dailyUpdate: ["daily update"],
    checkInNote: ["note"],
    techNotes: ["tech notes"],
    callbackNotes: ["callback notes"],
    hiddenNote: ["hidden note"],
    completedDate: ["completed date"],
    assignedStaff: ["assigned staff members", "assigned staff member(s)"],
    customerItem: ["customer item"],
    customer: ["customer"],
    location: ["location"],
    shipToCustomer: ["ship to customer"],
    taxExempt: ["tax exempt", "tax exempt?"],
  };

  const APPEND_FIELDS = new Set(["checkInNote", "techNotes", "callbackNotes", "hiddenNote"]);

  function normalize(value) {
    return value
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
      .replace(/:$/, "")
      .replace(/\s*\*$/, "");
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      getComputedStyle(element).visibility !== "hidden"
    );
  }

  function labelMatches(text, keys) {
    const normalized = normalize(text);
    const padded = ` ${normalized} `;
    return keys.some(
      (key) =>
        normalized === key ||
        normalized.startsWith(`${key} `) ||
        padded.includes(` ${key} `),
    );
  }

  function controlsFromLabel(label) {
    const result = [];
    if (label.control) result.push(label.control);
    const forId = label.getAttribute("for");
    if (forId) {
      const control = document.getElementById(forId);
      if (control) result.push(control);
    }
    const nested = label.querySelector(
      "input:not([type=hidden]), textarea, select, [contenteditable=true], [role=textbox]",
    );
    if (nested) result.push(nested);
    return result;
  }

  function accessibleText(control) {
    const labelledBy = (control.getAttribute("aria-labelledby") || "")
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent || "")
      .join(" ");
    const labels = control.labels
      ? [...control.labels].map((label) => label.textContent || "").join(" ")
      : "";
    return [
      labelledBy,
      labels,
      control.getAttribute("aria-label"),
      control.getAttribute("placeholder"),
      control.getAttribute("name"),
      control.getAttribute("data-testid"),
    ]
      .filter(Boolean)
      .join(" ");
  }

  function hasExactAccessibleLabel(control, keys) {
    const labelledBy = (control.getAttribute("aria-labelledby") || "")
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent || "");
    const labels = control.labels
      ? [...control.labels].map((label) => label.textContent || "")
      : [];
    const metadata = [
      control.getAttribute("aria-label"),
      control.getAttribute("placeholder"),
      control.getAttribute("name"),
      control.getAttribute("data-testid"),
    ];
    return [...labelledBy, ...labels, ...metadata]
      .filter(Boolean)
      .some((text) => keys.includes(normalize(text)));
  }

  function findByAdjacentLabel(keys) {
    const selectors = "label, [class], [id], [data-testid], span, p";
    const labels = [...document.querySelectorAll(selectors)].filter(
      (element) => {
        if (!isVisible(element)) return false;
        const text = normalize(element.textContent || "");
        return keys.some((key) => text === key);
      },
    );

    for (const label of labels) {
      let container = label;
      for (let depth = 0; depth < 4 && container; depth += 1) {
        const controls = [
          ...container.querySelectorAll(
            "input:not([type=hidden]):not([type=file]), textarea, select, [contenteditable=true], [role=textbox]",
          ),
        ].filter((control) => isVisible(control) && !control.disabled);
        if (controls.length === 1) return controls[0];
        container = container.parentElement;
      }
    }
    return undefined;
  }

  function findField(keys, exactOnly = false) {
    const labels = [...document.querySelectorAll("label")];
    for (const label of labels) {
      if (
        !isVisible(label) ||
        !keys.includes(normalize(label.textContent || ""))
      )
        continue;
      const control = controlsFromLabel(label).find(
        (item) => item.type !== "file" && isVisible(item),
      );
      if (control) return control;
    }

    if (!exactOnly) {
      for (const label of labels) {
        if (!isVisible(label) || !labelMatches(label.textContent || "", keys))
          continue;
        const control = controlsFromLabel(label).find(
          (item) => item.type !== "file" && isVisible(item),
        );
        if (control) return control;
      }
    }

    const candidates = [
      ...document.querySelectorAll(
        "input:not([type=hidden]):not([type=file]), textarea, select, [contenteditable=true], [role=textbox]",
      ),
    ];
    const matched = candidates.find((control) => {
      if (!isVisible(control) || control.disabled) return false;
      return exactOnly
        ? hasExactAccessibleLabel(control, keys)
        : labelMatches(accessibleText(control), keys);
    });
    return matched || findByAdjacentLabel(keys);
  }

  function dispatchValue(control, value) {
    if (control.isContentEditable || !("value" in control)) {
      control.textContent = value;
    } else {
      const prototype =
        control instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : control instanceof HTMLSelectElement
            ? HTMLSelectElement.prototype
            : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (setter) setter.call(control, value);
      else control.value = value;
    }

    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function appendValue(control, value) {
    const current =
      control.isContentEditable || !("value" in control)
        ? control.textContent
        : control.value;
    if ((current || "").includes(value.trim())) return;
    const combined = current
      ? `${current}\n\n${value}`
      : value;
    dispatchValue(control, combined);
  }

  async function setControlValue(control, value) {
    if (control instanceof HTMLInputElement && control.type === "checkbox") {
      const wanted = normalize(value);
      if (!["true", "false", "yes", "no"].includes(wanted)) return false;
      const checked = ["true", "yes"].includes(wanted);
      if (control.checked !== checked) control.click();
      return control.checked === checked;
    }
    if (control instanceof HTMLSelectElement) {
      const option = [...control.options].find((item) =>
        normalize(item.value) === normalize(value) ||
        normalize(item.textContent || "") === normalize(value),
      );
      if (!option) return false;
      dispatchValue(control, option.value);
      return control.value === option.value;
    }
    if (control instanceof HTMLInputElement && control.type === "radio") {
      const group = [
        ...document.querySelectorAll('input[type="radio"]'),
      ].filter((candidate) => candidate.name === control.name);
      const wanted = normalize(value);
      const choice = group.find((candidate) => {
        const label = candidate.labels
          ? [...candidate.labels]
              .map((item) => item.textContent || "")
              .join(" ")
          : "";
        return (
          normalize(candidate.value) === wanted ||
          normalize(label).includes(wanted)
        );
      });
      if (!choice) return false;
      choice.checked = true;
      choice.dispatchEvent(new Event("input", { bubbles: true }));
      choice.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    if (control.getAttribute("role") !== "combobox") {
      dispatchValue(control, value);
      return true;
    }

    if (
      normalize(control.value || control.textContent || "") === normalize(value)
    ) {
      return true;
    }

    control.focus();
    control.click();
    dispatchValue(control, value);
    await wait(350);

    const options = [
      ...document.querySelectorAll('[role="option"], [role="menuitem"]'),
    ].filter(isVisible);
    const wanted = normalize(value);
    const option = options.find((candidate) => {
      const text = normalize(candidate.textContent || "");
      return text === wanted;
    });

    if (option) {
      option.click();
      await wait(100);
      return true;
    }

    return false;
  }

  function visibleProductOptions() {
    return [
      ...document.querySelectorAll(
        '[role="option"], [role="menuitem"], button, li',
      ),
    ].filter(
      (element) =>
        isVisible(element) && element.getAttribute("aria-disabled") !== "true",
    );
  }

  function findProductSearch() {
    const searchables = [
      ...document.querySelectorAll(
        'input, textarea, [role="searchbox"], [role="combobox"], [contenteditable=true]',
      ),
    ];
    return searchables.find((control) => {
      if (!isVisible(control) || control.disabled) return false;
      return normalize(accessibleText(control)).includes("search products");
    });
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function readValue(control) {
    if (control instanceof HTMLInputElement && control.type === "checkbox")
      return String(control.checked);
    if (control instanceof HTMLSelectElement)
      return control.selectedOptions[0]?.textContent || "";
    return control.isContentEditable || !("value" in control)
      ? control.textContent || ""
      : control.value;
  }

  function readWorkOrder() {
    const fields = {};
    for (const [name, labels] of Object.entries(FIELD_LABELS)) {
      const control = findField(labels, true);
      if (control) fields[name] = readValue(control);
    }
    return fields;
  }

  function readOrderList() {
    const orders = [];
    let listDetected = false;
    for (const table of document.querySelectorAll('table, [role="table"], [role="grid"]')) {
      const rows = [...table.querySelectorAll('tr, [role="row"]')];
      const header = rows.find((row) =>
        [...row.querySelectorAll('th, [role="columnheader"], td')]
          .some((cell) => normalize(cell.textContent || "").replace(/[↑↓↕]/g, "").trim() === "work order"),
      );
      if (!header) continue;
      listDetected = true;
      const headers = [...header.querySelectorAll('th, [role="columnheader"], td')]
        .map((cell) => normalize(cell.textContent || "").replace(/[↑↓↕]/g, "").trim());
      const orderIndex = headers.indexOf("work order");
      for (const row of rows) {
        if (row === header || !isVisible(row)) continue;
        const cells = [...row.querySelectorAll('td, [role="cell"], [role="gridcell"]')];
        const orderCell = cells[orderIndex];
        const number = orderCell?.textContent?.match(/SO-#\d+/i)?.[0];
        if (!number) continue;
        const columns = {};
        headers.forEach((name, index) => {
          if (name && !name.includes("product") && cells[index])
            columns[name] = cells[index].textContent.trim();
        });
        const fields = {};
        for (const [name, labels] of Object.entries(FIELD_LABELS)) {
          const key = labels.find((label) => Object.hasOwn(columns, label));
          if (key) fields[name] = columns[key];
        }
        orders.push({ number, fields, columns });
      }
    }
    return { orders, listDetected };
  }

  function readListName() {
    const selected = [...document.querySelectorAll(
      '[role="tab"][aria-selected="true"], [role="tab"][data-state="active"], button[aria-pressed="true"]',
    )].find(isVisible);
    return (selected?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 100);
  }

  let dailyEditorHost;
  let dailyEditorControl;
  let positionDailyEditor = () => {};

  function findDailyUpdateField() {
    const control = findField(FIELD_LABELS.dailyUpdate);
    if (!control || control.closest('table, [role="table"], [role="grid"]'))
      return undefined;
    const isTextField =
      control instanceof HTMLTextAreaElement ||
      (control instanceof HTMLInputElement && control.type === "text") ||
      control.isContentEditable ||
      control.getAttribute("role") === "textbox";
    return isTextField && !control.disabled && !control.readOnly ? control : undefined;
  }

  function installDailyEditor() {
    const control = findDailyUpdateField();
    if (control === dailyEditorControl && dailyEditorHost?.isConnected) {
      positionDailyEditor();
      return;
    }
    dailyEditorHost?.remove();
    dailyEditorHost = undefined;
    dailyEditorControl = control;
    positionDailyEditor = () => {};
    if (!control) return;

    const host = document.createElement("div");
    host.setAttribute("data-techbay-daily-editor", "");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { position: fixed; display: block; z-index: 2147483647; color-scheme: light;
          max-width: calc(100vw - 16px); }
        :host([hidden]) { display: none !important; }
        button { font: 12px system-ui, sans-serif; padding: 3px 10px;
          border: 1px solid #2563eb; border-radius: 5px;
          background: #dbeafe; color: #1e40af; cursor: pointer; }
        button:hover { background: #bfdbfe; }
        button:disabled { opacity: .6; cursor: wait; }
        button:focus-visible {
          outline: 2px solid #1264b0; outline-offset: 2px; }
      </style>
      <button type="button" id="stamp">Update</button>`;
    document.body.append(host);
    dailyEditorHost = host;
    const stamp = shadow.querySelector("#stamp");
    positionDailyEditor = () => {
      const rect = control.getBoundingClientRect();
      host.hidden = !control.isConnected || !isVisible(control) ||
        rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth;
      if (host.hidden) return;
      host.style.left = `${Math.max(8, Math.min(rect.right - host.offsetWidth, innerWidth - host.offsetWidth - 8))}px`;
      host.style.top = `${Math.max(8, Math.min(rect.bottom + 4, innerHeight - host.offsetHeight - 8))}px`;
    };
    stamp.addEventListener("click", async (event) => {
      event.preventDefault();
      stamp.disabled = true;
      try {
        const stored = await chrome.storage.local.get("techbay-technician-initials");
        if (!stored["techbay-technician-initials"]) {
          throw new Error("Set your initials in TechBay Planner first.");
        }
        const value = globalThis.TechbayDailyUpdate.stamp(
          readValue(control),
          globalThis.TechbayDailyUpdate.today(),
          stored["techbay-technician-initials"],
        );
        if (!control.isConnected || findDailyUpdateField() !== control)
          throw new Error("The Daily update field changed. Try again on the current field.");
        if (!await setControlValue(control, value))
          throw new Error("Work Mate did not accept the Daily update.");
      } catch (error) {
        alert(`Daily update: ${error.message}`);
      } finally {
        stamp.disabled = false;
        positionDailyEditor();
      }
    });
    positionDailyEditor();
  }

  addEventListener("scroll", () => positionDailyEditor(), true);
  addEventListener("resize", () => positionDailyEditor());
  let dailyEditorTimer;
  new MutationObserver((mutations) => {
    if (mutations.every((mutation) =>
      mutation.target === dailyEditorHost || dailyEditorHost?.contains(mutation.target))) return;
    clearTimeout(dailyEditorTimer);
    dailyEditorTimer = setTimeout(installDailyEditor, 150);
  }).observe(document.documentElement, { childList: true, subtree: true });
  installDailyEditor();

  async function fillWorkOrder(values, allowEmpty = false) {
    let filled = 0;
    const missing = [];
    const fieldValues = {
      ...values,
      reimage:
        { yes: "Yes", no: "No", call: "Call Me First" }[values.reimage] ||
        values.reimage,
      backup: { yes: "Yes", no: "No" }[values.backup] || values.backup,
    };
    for (const [name, labels] of Object.entries(FIELD_LABELS)) {
      if (!Object.hasOwn(fieldValues, name)) continue;
      const value = String(fieldValues[name] ?? "");
      if (!value.trim() && (!allowEmpty || APPEND_FIELDS.has(name))) continue;

      let control = findField(labels, APPEND_FIELDS.has(name));
      let noteValue = value;
      if (!control && ["techNotes", "callbackNotes"].includes(name)) {
        control = findField(FIELD_LABELS.checkInNote, true);
        noteValue = `${name === "techNotes" ? "Tech Notes" : "Callback Notes"}:\n${value}`;
      }
      if (!control) {
        missing.push(name === "makeModel" ? "Make/Model" : name);
        continue;
      }
      if (APPEND_FIELDS.has(name)) {
        appendValue(control, noteValue);
        filled += 1;
      } else if (await setControlValue(control, value)) {
        filled += 1;
      } else {
        missing.push(
          `${name === "makeModel" ? "Make/Model" : name} option '${value}'`,
        );
      }
    }

    const controls = document.querySelectorAll(
      "input:not([type=hidden]), textarea, select, [contenteditable=true]",
    );
    const labels = document.querySelectorAll("label");
    const embeddedFrames = [...document.querySelectorAll("iframe")]
      .map((frame) => {
        try {
          const host = new URL(frame.src, location.href).host;
          return frame.title ? `${host} (${frame.title})` : host;
        } catch {
          return "";
        }
      })
      .filter(Boolean)
      .slice(0, 4);
    return {
      ok: true,
      filled,
      missing,
      context: `${location.hostname}${location.pathname}`,
      frame: window.top === window ? "top frame" : "embedded frame",
      controlCount: controls.length,
      labelCount: labels.length,
      embeddedFrames,
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "TECHBAY_READ_ORDERS") {
      const fields = readWorkOrder();
      sendResponse({ ok: true, ...readOrderList(), listName: readListName(), fields, fieldCount: Object.keys(fields).length });
      return false;
    }
    if (message?.type !== "TECHBAY_FILL_WORK_ORDER") return false;
    fillWorkOrder(message.values || {}, message.allowEmpty === true)
      .then(sendResponse)
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error.message || "Shopify field fill failed.",
        }),
      );
    return true;
  });
})();
