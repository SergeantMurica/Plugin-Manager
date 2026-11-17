(() => {
  if (globalThis.__techbaySkuDiscountInstalled) return;
  globalThis.__techbaySkuDiscountInstalled = true;

  const ID = "techbay-in-store-discount";
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });
  const percent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });

  function parseCents(text) {
    const value = text.trim().replace(/^\$\s*/, "");
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) return null;
    const [whole, fraction = ""] = value.replace(/,/g, "").split(".");
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    return Number.isSafeInteger(cents) ? cents : null;
  }

  function discountText(store, website) {
    if (store === null || website === null) {
      return "Unavailable - both prices are required.";
    }
    if (website === 0) return "Unavailable - website price must be greater than $0.";
    if (store > website) return "$0.00 off (0%) - in-store price is higher.";
    const difference = website - store;
    return `${money.format(difference / 100)} off (${percent.format(difference / website * 100)}%)`;
  }

  function findPrice(label) {
    return [...document.querySelectorAll("main div")].find(
      (element) =>
        !element.children.length &&
        element.textContent.trim().toLowerCase() === label,
    );
  }

  function update() {
    const existing = document.getElementById(ID);
    if (!location.pathname.startsWith("/tops/sku/")) {
      existing?.remove();
      return;
    }

    const storeLabel = findPrice("in store price");
    const websiteLabel = findPrice("website price");
    const grid = storeLabel?.parentElement?.parentElement;
    if (!grid || websiteLabel?.parentElement?.parentElement !== grid) {
      existing?.remove();
      return;
    }

    let panel = existing;
    if (panel && panel.parentElement !== grid) {
      panel.remove();
      panel = null;
    }
    if (!panel) {
      panel = document.createElement("div");
      panel.id = ID;
      const label = document.createElement("div");
      label.textContent = "Discount for In Store";
      label.style.cssText = "font-size: var(--fs-xs); color: var(--text-3); margin-bottom: 2px;";
      const value = document.createElement("div");
      value.style.cssText = "font-size: var(--fs-md); font-weight: 600; color: var(--text-1);";
      value.setAttribute("role", "status");
      const help = document.createElement("div");
      help.textContent = "Per item. Percentage rounded; use the dollar discount for an exact match.";
      help.style.cssText = "font-size: var(--fs-xs); color: var(--text-3); margin-top: 2px;";
      panel.append(label, value, help);
      grid.append(panel);
    }

    const text = discountText(
      parseCents(storeLabel.nextElementSibling?.textContent || ""),
      parseCents(websiteLabel.nextElementSibling?.textContent || ""),
    );
    if (panel.children[1].textContent !== text) panel.children[1].textContent = text;
  }

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      update();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  // Dash navigates client-side, so injection must start even outside the SKU route.
  addEventListener("popstate", update);
  update();
})();
