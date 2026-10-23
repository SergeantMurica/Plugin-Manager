export const ORDERS_KEY = "techbay-local-orders-v1";
export const LISTS_KEY = "techbay-local-order-lists-v1";
export const EDITABLE_FIELDS = {
  device: "Device",
  makeModel: "Make/Model",
  serial: "Serial",
  pin: "PIN",
  image: "Image",
  s2s: "S2S",
  priority: "Priority",
  dailyUpdate: "Daily update",
  checkInNote: "Note",
  techNotes: "Tech Notes",
  callbackNotes: "Callback Notes",
  hiddenNote: "Hidden note",
  completedDate: "Completed date",
  assignedStaff: "Assigned staff members",
  customerItem: "Customer item",
  customer: "Customer",
  location: "Location",
  shipToCustomer: "Ship to customer",
  taxExempt: "Tax exempt",
};
export const NOTE_FIELDS = new Set([
  "checkInNote", "techNotes", "callbackNotes", "hiddenNote",
]);

export function orderContext(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.origin !== "https://admin.shopify.com") return null;
  const match = url.pathname.match(
    /^\/store\/([^/]+)\/apps\/work-mate\/work-orders(?:\/([^/]+))?\/?$/i,
  );
  if (!match) return null;
  if (!match[2]) return { listUrl: `${url.origin}${url.pathname}`, url: "", number: "" };
  let number;
  try {
    number = decodeURIComponent(match[2]);
  } catch {
    return null;
  }
  if (number.toLowerCase() === "new") return {
    listUrl: `${url.origin}/store/${match[1]}/apps/work-mate/work-orders`,
    url: `${url.origin}/store/${match[1]}/apps/work-mate/work-orders/new`,
    number: "",
    isNew: true,
  };
  if (!/^SO-#\d+$/i.test(number)) return null;
  return {
    listUrl: `${url.origin}/store/${match[1]}/apps/work-mate/work-orders`,
    url: `${url.origin}/store/${match[1]}/apps/work-mate/work-orders/${encodeURIComponent(number)}`,
    number,
  };
}

export function listContext(value) {
  const context = orderContext(value);
  if (!context || context.number || context.isNew) return null;
  const url = new URL(value);
  const ignored = new Set(["sort", "order", "page", "cursor", "after", "before", "limit", "pageSize", "page_size"]);
  const filters = [...url.searchParams]
    .filter(([key, filter]) => filter && !ignored.has(key))
    .map(([key, filter]) => [key, key === "st"
      ? filter.split(",").map((item) => item.trim()).sort().join(",")
      : filter])
    .sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv));
  const params = new URLSearchParams(filters).toString();
  return {
    id: `${context.listUrl.replace(/\/$/, "")}${params ? `?${params}` : ""}`,
    sourceUrl: value,
    defaultName: url.searchParams.get("lc")
      ? `Location ${url.searchParams.get("lc")}${url.searchParams.get("cf") ? " / custom filter" : ""}`
      : params ? "Filtered work orders" : "All work orders",
  };
}

export function mergeList(previous, context, orderUrls, name = "", now = new Date().toISOString()) {
  return {
    ...previous,
    ...context,
    name: previous?.name || name || context.defaultName,
    orderUrls: [...new Set([...(previous?.orderUrls || []), ...orderUrls])],
    capturedAt: now,
  };
}

export function ordersForList(orders, lists, selectedId) {
  if (!selectedId) return Object.values(orders);
  const members = new Set(lists[selectedId]?.orderUrls || []);
  return Object.values(orders).filter((order) => members.has(order.url));
}

export function mergeOrder(previous, incoming, now = new Date().toISOString()) {
  return {
    ...previous,
    ...incoming,
    fields: { ...previous?.fields, ...incoming.fields },
    drafts: { ...previous?.drafts },
    history: previous?.history || [],
    capturedAt: now,
  };
}

export function editOrder(order, field, value, initials = "", now = new Date().toISOString()) {
  if (!Object.hasOwn(EDITABLE_FIELDS, field)) throw new Error(`Unsupported field: ${field}`);
  const before = order.drafts?.[field] ?? (NOTE_FIELDS.has(field) ? "" : order.fields?.[field]) ?? "";
  if (before === value) return order;
  return {
    ...order,
    drafts: { ...order.drafts, [field]: value },
    history: [
      ...(order.history || []),
      { at: now, field, before, after: value, initials },
    ].slice(-100),
  };
}

export function pendingValues(order) {
  return Object.fromEntries(
    Object.entries(order.drafts || {}).filter(
      ([field]) => Object.hasOwn(EDITABLE_FIELDS, field),
    ),
  );
}
