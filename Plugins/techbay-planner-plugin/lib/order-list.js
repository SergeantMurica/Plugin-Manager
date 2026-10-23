import { EDITABLE_FIELDS, NOTE_FIELDS, ORDERS_KEY, LISTS_KEY, editOrder, listContext, mergeOrder, orderContext, pendingValues } from "./orders.js";
import { fillOrder, readFrames, requestWorkMateAccess, waitForOrder } from "./workmate-client.js";

export function createOrderList(showStatus) {
  const section = document.querySelector("#order-list");
  const rows = document.querySelector("#order-rows");
  const search = document.querySelector("#order-search");
  const summary = document.querySelector("#list-summary");
  let orders = {};
  let snapshotName = "";
  let activeTab;
  let captureVersion = 0;

  function setView(tab) {
    const context = orderContext(tab?.url);
    const isOrder = Boolean(context?.number || context?.isNew);
    section.hidden = isOrder;
    document.querySelector("#order-workspace").hidden = !isOrder;
    document.querySelector("#reset-button").hidden = !isOrder;
  }

  async function edit(url, field, value) {
    if (!orders[url]) throw new Error("This snapshot was cleared. Pull the current list again.");
    orders[url] = editOrder(
      orders[url], field, value,
      document.querySelector('[name="checkInInitials"]').value.trim(),
    );
  }

  function button(label, action) {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "notes-button";
    node.textContent = label;
    node.addEventListener("click", async () => {
      node.disabled = true;
      try {
        await action();
      } catch (error) {
        showStatus(error.message, "error");
      } finally {
        node.disabled = false;
      }
    });
    return node;
  }

  async function inject(url, mode = "edits") {
    const order = orders[url];
    if (!order) throw new Error("This snapshot was cleared. Pull the current list again.");
    const source = mode === "edits"
      ? order
      : { drafts: { ...order.fields, ...order.drafts } };
    const values = pendingValues(source);
    for (const field of NOTE_FIELDS) {
      if (!Object.hasOwn(order.drafts, field)) delete values[field];
    }
    if (mode === "daily") {
      for (const key of Object.keys(values)) if (key !== "dailyUpdate") delete values[key];
    }
    if (!Object.keys(values).length)
      throw new Error("Edit a field before filling this order.");
    const tab = await chrome.tabs.create({ url, active: false });
    showStatus(`Loading ${order.number} in a background tab...`);
    await waitForOrder(tab.id, url);
    const response = await fillOrder(tab.id, url, values, true);
    // A pull or tab change may discard the snapshot while the background tab loads.
    if (orders[url] === order) orders[url] = {
      ...orders[url],
      history: [...orders[url].history, {
        at: new Date().toISOString(),
        action: "Filled for review (not saved in Work Mate)",
        fields: Object.keys(values),
        missing: response.missing,
      }].slice(-100),
    };
    for (const card of rows.children) card.dispatchEvent(new Event("audit-update"));
    showStatus(
      `${order.number}: filled ${response.filled} fields in a background tab. Review and save in Work Mate.${response.missing.length ? ` Not filled: ${response.missing.join(", ")}.` : ""}`,
      response.missing.length || !response.filled ? "error" : "success",
    );
    return response;
  }

  function render() {
    const query = search.value.toLowerCase().trim();
    const all = Object.values(orders);
    const filtered = all.filter((order) =>
      `${order.number} ${Object.values(order.columns || {}).join(" ")} ${Object.values(order.fields).join(" ")} ${Object.values(order.drafts).join(" ")}`.toLowerCase().includes(query),
    );
    summary.textContent = snapshotName
      ? `${snapshotName}: ${filtered.length} of ${all.length} pulled orders. Temporary snapshot only. Pulling again replaces these rows and drafts; nothing is saved locally.`
      : "No snapshot. Click Pull visible list / order to read the current page. No automatic pulls or local order storage.";
    rows.replaceChildren();
    for (const order of filtered) {
      const card = document.createElement("article");
      card.className = "order-card";
      const heading = document.createElement("div");
      heading.className = "list-actions";
      const link = document.createElement("a");
      link.href = order.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = order.number;
      link.addEventListener("click", (event) => {
        event.preventDefault();
        chrome.tabs.create({ url: order.url }).catch((error) => showStatus(error.message, "error"));
      });
      const info = document.createElement("span");
      info.textContent = [order.fields.location || order.columns?.location, order.columns?.customer, order.columns?.status].filter(Boolean).join(" / ");
      heading.append(link, info);
      const captured = document.createElement("small");
      captured.textContent = `Captured ${new Date(order.capturedAt).toLocaleString()}`;
      const label = document.createElement("label");
      label.className = "field";
      const title = document.createElement("span");
      title.textContent = "Daily update (temporary draft)";
      const daily = document.createElement("textarea");
      daily.rows = 2;
      daily.value = order.drafts.dailyUpdate ?? order.fields.dailyUpdate ?? "";
      daily.setAttribute("aria-label", `${order.number} Daily update`);
      daily.addEventListener("change", () => {
        edit(order.url, "dailyUpdate", daily.value).catch((error) => showStatus(error.message, "error"));
      });
      label.append(title, daily);
      const actions = document.createElement("div");
      actions.className = "list-actions";
      actions.append(
        button("Keep temporary draft", async () => {
          await edit(order.url, "dailyUpdate", daily.value);
          showStatus(`${order.number}: Daily update kept only in this panel session.`, "success");
        }),
        button("Fill Daily update", async () => {
          await requestWorkMateAccess();
          await edit(order.url, "dailyUpdate", daily.value);
          await inject(order.url, "daily");
        }),
        button("Fill edited fields", async () => {
          await requestWorkMateAccess();
          await edit(order.url, "dailyUpdate", daily.value);
          await inject(order.url);
        }),
        button("Fill pulled fields", async () => {
          await requestWorkMateAccess();
          await edit(order.url, "dailyUpdate", daily.value);
          await inject(order.url, "saved");
        }),
      );
      const details = document.createElement("details");
      const detailTitle = document.createElement("summary");
      detailTitle.textContent = "Order fields and audit history";
      details.append(detailTitle);
      const columns = document.createElement("dl");
      for (const [name, value] of Object.entries(order.columns || {})) {
        const term = document.createElement("dt");
        term.textContent = name;
        const description = document.createElement("dd");
        description.textContent = value;
        columns.append(term, description);
      }
      details.append(columns);
      for (const [field, name] of Object.entries(EDITABLE_FIELDS)) {
        if (field === "dailyUpdate") continue;
        const fieldLabel = document.createElement("label");
        fieldLabel.className = "field";
        const caption = document.createElement("span");
        caption.textContent = NOTE_FIELDS.has(field)
          ? `${name}: add text (existing notes are kept)`
          : `${name}${Object.hasOwn(order.fields, field) ? "" : " (not captured)"}`;
        if (NOTE_FIELDS.has(field) && order.fields[field]) {
          const original = document.createElement("pre");
          original.className = "audit-history";
          original.textContent = `Captured ${name} (read-only):\n${order.fields[field]}`;
          details.append(original);
        }
        const input = document.createElement("textarea");
        input.rows = field === "checkInNote" ? 5 : 1;
        input.value = order.drafts[field] ?? (NOTE_FIELDS.has(field) ? "" : order.fields[field]) ?? "";
        input.addEventListener("change", () => {
          edit(order.url, field, input.value).catch((error) => showStatus(error.message, "error"));
        });
        fieldLabel.append(caption, input);
        details.append(fieldLabel);
      }
      const history = document.createElement("pre");
      history.className = "audit-history";
      const updateHistory = () => {
        history.textContent = (orders[order.url]?.history || []).map((entry) =>
          `${new Date(entry.at).toLocaleString()} ${entry.initials || ""} ${entry.action ? `${entry.action}: ${entry.fields.join(", ")}${entry.missing?.length ? `; not filled: ${entry.missing.join(", ")}` : ""}` : `${EDITABLE_FIELDS[entry.field]}: ${JSON.stringify(entry.before)} -> ${JSON.stringify(entry.after)}`}`,
        ).join("\n") || "No local edits yet.";
      };
      details.addEventListener("toggle", updateHistory);
      card.addEventListener("change", updateHistory);
      card.addEventListener("audit-update", updateHistory);
      updateHistory();
      details.append(history);
      card.append(heading, captured, label, actions, details);
      rows.append(card);
    }
  }

  async function capture(tab = activeTab) {
    const version = ++captureVersion;
    const context = orderContext(tab?.url);
    if (!context) {
      throw new Error("Open a Shopify Work Mate list or order, then pull again.");
    }
    orders = {};
    snapshotName = "";
    render();
    const frames = await readFrames(tab.id);
    const currentTab = await chrome.tabs.get(tab.id);
    if (version !== captureVersion || activeTab?.id !== tab.id ||
        (!context.number && currentTab.url !== tab.url) ||
        orderContext(currentTab.url)?.url !== context.url ||
        orderContext(currentTab.url)?.listUrl !== context.listUrl) {
      throw new Error("The active page changed while reading. Pull again.");
    }
    if (context.number || context.isNew) {
      const frame = frames.sort((a, b) => b.fieldCount - a.fieldCount)[0];
      if (!frame?.fieldCount) {
        throw new Error("No order fields found. Wait for Work Mate to load and pull again.");
      }
      orders[context.url] = mergeOrder(orders[context.url], {
        url: context.url, number: context.number || "New work order", fields: frame.fields,
      });
      snapshotName = context.number || "New work order";
    } else {
      const entries = frames.flatMap((frame) => frame.orders);
      if (!entries.length && !frames.some((frame) => frame.listDetected)) {
        throw new Error("No visible work-order rows found. Wait for the list to load and pull again.");
      }
      for (const entry of entries) {
        const url = `${context.listUrl.replace(/\/$/, "")}/${encodeURIComponent(entry.number)}`;
        orders[url] = mergeOrder(orders[url], { ...entry, url });
      }
      const list = listContext(tab.url);
      const namedFrame = frames.find((frame) => (frame.listDetected || frame.orders.length) && frame.listName);
      const locations = [...new Set(entries.map((entry) =>
        entry.fields.location || entry.columns?.location,
      ).filter(Boolean))];
      const name = namedFrame?.listName ||
        (!new URL(tab.url).searchParams.get("cf") && locations.length === 1
          ? locations[0] : list.defaultName);
      snapshotName = name;
    }
    render();
    showStatus("Pulled the current page only. This temporary snapshot replaces the previous pull.", "success");
  }

  search.addEventListener("input", render);
  document.querySelector("#pull-orders").addEventListener("click", async () => {
    try {
      await requestWorkMateAccess();
      await capture();
    } catch (error) {
      showStatus(error.message, "error");
    }
  });
  document.querySelector("#fill-daily-updates").addEventListener("click", async (event) => {
    const targets = Object.values(orders).filter((order) =>
      Object.hasOwn(order.drafts, "dailyUpdate"),
    );
    if (!targets.length) {
      showStatus("No temporary Daily update drafts. Pull the current page and edit a Daily update first.", "error");
      return;
    }
    if (!window.confirm(`Fill ${targets.length} Daily update drafts from "${snapshotName}" in new background tabs? Search text does not limit this batch. You must review and save each order in Work Mate.`)) return;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await requestWorkMateAccess();
      const failures = [];
      for (const order of targets) {
        try {
          const response = await inject(order.url, "daily");
          if (!response.filled || response.missing.length)
            failures.push(`${order.number}: ${response.missing.join(", ") || "No fields filled"}`);
        } catch (error) {
          failures.push(`${order.number}: ${error.message}`);
        }
      }
      showStatus(
        `Processed ${targets.length} Daily update drafts. Review and save each background tab in Work Mate.${failures.length ? ` Failed: ${failures.join(" / ")}` : ""}`,
        failures.length ? "error" : "success",
      );
    } catch (error) {
      showStatus(error.message, "error");
    } finally {
      button.disabled = false;
    }
  });

  return {
    capture,
    setView,
    getOrder(url) {
      return orders[url];
    },
    async initialize() {
      await chrome.storage.local.remove([ORDERS_KEY, LISTS_KEY]);
      render();
    },
    async follow(tab) {
      if (activeTab?.id !== tab?.id || activeTab?.url !== tab?.url) {
        captureVersion++;
        orders = {};
        snapshotName = "";
        render();
      }
      activeTab = tab;
      setView(tab);
    },
  };
}
