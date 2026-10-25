async function request(type, payload) {
  const response = await chrome.runtime.sendMessage({ type, payload });
  if (!response?.ok) throw new Error(response?.error || "Dashboard did not respond. Reload the extension and try again.");
  return response;
}

export const prepareText = (phone) => request("dashboardPrepareText", { phone });
export const prepareOrder = (order) => request("dashboardOpenOrder", { order });

export function orderButton(order, onError) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "link";
  button.textContent = order;
  button.title = "Open this Dash order in a background tab";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await request("dashboardOpenOrder", { order });
      onError("");
    } catch (error) {
      onError(error.message);
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

export function addPhoneCopy(field, onError) {
  const label = field.labels?.[0];
  if (label && !field.hasAttribute("aria-label")) {
    field.setAttribute("aria-label", label.textContent.replace(/\s+/g, " ").trim());
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "link";
  button.textContent = "Copy phone";
  button.title = "Copy number and prepare a text if RingCentral is open";
  const status = document.createElement("span");
  status.setAttribute("role", "status");
  const showAction = (action) => {
    if (action) status.textContent = action.message;
  };
  chrome.storage.local.get("dashboardPhoneAction").then((data) => showAction(data.dashboardPhoneAction))
    .catch((error) => onError(error.message));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.dashboardPhoneAction) showAction(changes.dashboardPhoneAction.newValue);
  });
  field.insertAdjacentElement("afterend", button);
  button.insertAdjacentElement("afterend", status);
  button.addEventListener("click", async () => {
    try {
      const phone = field.value.trim();
      if (!phone) throw new Error("Enter a phone number first.");
      await navigator.clipboard.writeText(phone);
      const result = await prepareText(phone);
      status.textContent = result.opened ? "Number copied; RingCentral recipient ready." : "Number copied. No RingCentral tab is open.";
      onError("");
    } catch (error) {
      status.textContent = error.message;
      onError(error.message);
    }
  });
}
