export const sharedFieldIds = {
  customer: "name",
  phone: "phone",
  email: "email",
  order: "order",
  systemPrice: "systemPrice",
  watercooled: "watercooled",
  custom: "custom",
};

const CHECKBOXES = ["watercooled", "custom"];

export function makeBuildOptionsExclusive(watercooled, custom) {
  for (const [selected, other] of [[watercooled, custom], [custom, watercooled]]) {
    selected.addEventListener("change", () => {
      if (selected.checked) other.checked = false;
    });
  }
}

export function draftConflicts(draft, lead) {
  const normalize = (key, value) => {
    const text = String(value || "").trim();
    if (key === "phone") return text.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
    if (key === "order") return text.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return text.toLocaleLowerCase();
  };
  return Object.keys(sharedFieldIds).some((key) => {
    if (CHECKBOXES.includes(key)) return !!draft[key] && !lead[key];
    const value = normalize(key, draft[key]);
    return value && value !== normalize(key, lead[key]);
  });
}

export function readCustomer() {
  return Object.fromEntries(Object.entries(sharedFieldIds).map(([key, id]) => {
    const field = document.getElementById(id);
    return [key, CHECKBOXES.includes(key) ? field.checked : field.value];
  }));
}

export function customerChanged() {
  document.dispatchEvent(new Event("dashboard:customer-changed"));
}
