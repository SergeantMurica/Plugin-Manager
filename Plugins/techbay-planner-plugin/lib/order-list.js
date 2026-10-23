import { EDITABLE_FIELDS, NOTE_FIELDS, ORDERS_KEY, LISTS_KEY, editOrder, listContext, mergeList, mergeOrder, orderContext, ordersForList, pendingValues } from "./orders.js";
import { fillOrder, readFrames, requestWorkMateAccess, waitForOrder } from "./workmate-client.js";

export function createOrderList(showStatus) {
  const section = document.querySelector("#order-list");
  const rows = document.querySelector("#order-rows");
  const search = document.querySelector("#order-search");
  const summary = document.querySelector("#list-summary");
  const listSelect = document.querySelector("#saved-list-select");
  const listName = document.querySelector("#saved-list-name");
  let orders = {};
  let lists = {};
  let selectedId = "";
  let activeTab;
  let writeQueue = Promise.resolve();

  function setView(tab) {
    const isOrder = Boolean(orderContext(tab?.url)?.number);
    section.hidden = isOrder;
    document.querySelector("#order-workspace").hidden = !isOrder;
    document.querySelector("#reset-button").hidden = !isOrder;
  }

  function persist() {
    // Serialize writes so rapid edits cannot overwrite a newer local snapshot.
    const snapshot = structuredClone({
      [ORDERS_KEY]: orders,
      [LISTS_KEY]: { lists, selectedId },
    });
    const save = writeQueue.then(() =>
      chrome.storage.local.set(snapshot),
    );
    writeQueue = save.catch((error) => showStatus(`Local save failed: ${error.message}`, "error"));
    return save;
  }

  async function edit(url, field, value) {
    orders[url] = editOrder(
      orders[url], field, value,
      document.querySelector('[name="checkInInitials"]').value.trim(),
    );
    await persist();
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
      throw new Error("Edit and save a local field before filling this order.");
    const tab = await chrome.tabs.create({ url, active: false });
    showStatus(`Loading ${order.number} in a background tab...`);
    await waitForOrder(tab.id, url);
    const response = await fillOrder(tab.id, url, values, true);
    orders[url] = {
      ...orders[url],
      history: [...orders[url].history, {
        at: new Date().toISOString(),
        action: "Filled for review (not saved in Work Mate)",
        fields: Object.keys(values),
        missing: response.missing,
      }].slice(-100),
    };
    await persist();
    for (const card of rows.children) card.dispatchEvent(new Event("audit-update"));
    showStatus(
      `${order.number}: filled ${response.filled} fields in a background tab. Review and save in Work Mate.${response.missing.length ? ` Not filled: ${response.missing.join(", ")}.` : ""}`,
      response.missing.length || !response.filled ? "error" : "success",
    );
    return response;
  }

  function render() {
    listSelect.replaceChildren(
      new Option(`All saved orders (${Object.keys(orders).length})`, ""),
      ...Object.values(lists).sort((a, b) => a.name.localeCompare(b.name)).map((list) =>
        new Option(`${list.name} (${ordersForList(orders, lists, list.id).length})`, list.id),
      ),
    );
    listSelect.value = selectedId;
    listName.value = lists[selectedId]?.name || "";
    listName.disabled = !selectedId;
    document.querySelector("#rename-saved-list").disabled = !selectedId;
    document.querySelector("#open-saved-list").disabled = !selectedId;
    const query = search.value.toLowerCase().trim();
    const all = ordersForList(orders, lists, selectedId).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
    const filtered = all.filter((order) =>
      `${order.number} ${Object.values(order.columns || {}).join(" ")} ${Object.values(order.fields).join(" ")} ${Object.values(order.drafts).join(" ")}`.toLowerCase().includes(query),
    );
    summary.textContent = `${lists[selectedId]?.name || "All saved orders"}: ${filtered.length} of ${all.length} saved orders. Captures accumulate visible rows within this list; visit its other pages and pull again. Local edits are not live Work Mate updates.`;
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
      title.textContent = "Daily update (local draft)";
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
        button("Save local draft", async () => {
          await edit(order.url, "dailyUpdate", daily.value);
          showStatus(`${order.number}: Daily update saved locally.`, "success");
        }),
        button("Fill Daily update", async () => {
          await requestWorkMateAccess();
          await edit(order.url, "dailyUpdate", daily.value);
          await inject(order.url, "daily");
        }),
        button("Fill all local edits", async () => {
          await requestWorkMateAccess();
          await edit(order.url, "dailyUpdate", daily.value);
          await inject(order.url);
        }),
        button("Fill saved fields", async () => {
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
        history.textContent = (orders[order.url].history || []).map((entry) =>
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

  async function capture(tab = activeTab, automatic = false) {
    const context = orderContext(tab?.url);
    if (!context) {
      if (!automatic) throw new Error("Open a Shopify Work Mate list or order, then pull again.");
      return;
    }
    const frames = await readFrames(tab.id);
    const currentTab = await chrome.tabs.get(tab.id);
    if ((!context.number && currentTab.url !== tab.url) ||
        orderContext(currentTab.url)?.url !== context.url ||
        orderContext(currentTab.url)?.listUrl !== context.listUrl) {
      if (!automatic) throw new Error("The active page changed while reading. Pull again.");
      return;
    }
    if (context.number) {
      const frame = frames.sort((a, b) => b.fieldCount - a.fieldCount)[0];
      if (!frame?.fieldCount) {
        if (!automatic) throw new Error("No order fields found. Wait for Work Mate to load and pull again.");
        return;
      }
      orders[context.url] = mergeOrder(orders[context.url], {
        url: context.url, number: context.number, fields: frame.fields,
      });
    } else {
      const entries = frames.flatMap((frame) => frame.orders);
      if (!entries.length && !frames.some((frame) => frame.listDetected)) {
        if (!automatic) throw new Error("No visible work-order rows found. Wait for the list to load and pull again.");
        return;
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
      lists[list.id] = mergeList(lists[list.id], list, entries.map((entry) =>
        `${context.listUrl.replace(/\/$/, "")}/${encodeURIComponent(entry.number)}`,
      ), name);
      selectedId = list.id;
    }
    await persist();
    render();
    if (!automatic) showStatus("Captured locally. Existing local edits were kept.", "success");
  }

  search.addEventListener("input", render);
  listSelect.addEventListener("change", () => {
    selectedId = listSelect.value;
    render();
    persist().catch((error) => showStatus(error.message, "error"));
  });
  document.querySelector("#rename-saved-list").addEventListener("click", async () => {
    const name = listName.value.trim();
    if (!selectedId || !name) {
      showStatus("Select a saved list and enter its name.", "error");
      return;
    }
    lists[selectedId].name = name;
    try {
      await persist();
      render();
    } catch (error) {
      showStatus(error.message, "error");
    }
  });
  document.querySelector("#open-saved-list").addEventListener("click", () => {
    if (lists[selectedId])
      chrome.tabs.create({ url: lists[selectedId].sourceUrl })
        .catch((error) => showStatus(error.message, "error"));
  });
  document.querySelector("#pull-orders").addEventListener("click", async () => {
    try {
      await requestWorkMateAccess();
      await capture();
    } catch (error) {
      showStatus(error.message, "error");
    }
  });
  document.querySelector("#fill-daily-updates").addEventListener("click", async (event) => {
    const targets = ordersForList(orders, lists, selectedId).filter((order) =>
      Object.hasOwn(order.drafts, "dailyUpdate"),
    );
    if (!targets.length) {
      showStatus("No saved Daily update drafts. Edit a Daily update first.", "error");
      return;
    }
    if (!window.confirm(`Fill ${targets.length} Daily update drafts from "${lists[selectedId]?.name || "All saved orders"}" in new background tabs? Search text does not limit this batch. You must review and save each order in Work Mate.`)) return;
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
      const stored = await chrome.storage.local.get([ORDERS_KEY, LISTS_KEY]);
      orders = stored[ORDERS_KEY] || {};
      lists = stored[LISTS_KEY]?.lists || {};
      selectedId = stored[LISTS_KEY]?.selectedId || "";
      if (!lists[selectedId]) selectedId = "";
      render();
    },
    async follow(tab) {
      activeTab = tab;
      const context = orderContext(tab?.url);
      setView(tab);
      if (context) await capture(tab, true);
    },
  };
}
