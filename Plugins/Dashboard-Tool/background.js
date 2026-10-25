(() => {
  importScripts("warranty/background.js");
  importScripts("ringcentral.js");
  // Prevent concurrent copies from mixing recipients in the same tab.
  const pending = new Set();

  async function openDashOrder({ order }) {
    const normalized = String(order || "").trim().replace(/^#\s*/, "").toUpperCase();
    if (!/^MPC\d{4,}$/.test(normalized)) {
      throw new Error("Enter a valid MPC order number (for example MPC2636884).");
    }
    await chrome.tabs.create({
      url: `https://dash.metapcs.com/orders/${normalized}`,
      active: false,
    });
    return {};
  }

  async function prepareText({ phone }) {
    const raw = String(phone || "").trim();
    if (!/^\+?[\d()\s.-]+$/.test(raw)) throw new Error("Enter a valid 10-digit phone number.");
    let number = raw.replace(/\D/g, "");
    if (number.length === 11 && number.startsWith("1")) number = number.slice(1);
    if (number.length !== 10) throw new Error("Enter a valid 10-digit phone number.");
    const tabs = await chrome.tabs.query({ url: "https://app.ringcentral.com/*" });
    const tab = tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
    if (!tab) return { opened: false };
    if (pending.has(tab.id)) throw new Error("RingCentral is still preparing the previous number. Try again.");
    pending.add(tab.id);
    try {
      await chrome.storage.local.set({ dashboardPhoneAction: { state: "pending", message: "Preparing RingCentral New text..." } });
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: dashboardFillRingCentralRecipient,
        args: [number],
      });
      const result = results[0]?.result;
      if (!result?.ok) throw new Error(result?.error || "RingCentral did not respond. The number is still copied.");
      await chrome.storage.local.set({ dashboardPhoneAction: { state: "ready", message: "Number copied; RingCentral New text recipient ready." } });
      return { opened: true };
    } catch (error) {
      await chrome.storage.local.set({ dashboardPhoneAction: { state: "error", message: error.message } });
      throw error;
    } finally {
      pending.delete(tab.id);
    }
  }

  const handlers = {
    dashboardOpenOrder: openDashOrder,
    dashboardPrepareText: prepareText,
  };
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    const handler = Object.hasOwn(handlers, message?.type) && handlers[message.type];
    if (!handler) return false;
    if (sender.id !== chrome.runtime.id) {
      respond({ ok: false, error: "Dashboard actions must come from this extension." });
      return false;
    }
    Promise.resolve()
      .then(() => handler(message.payload || {}))
      .then((result) => respond({ ok: true, ...result }))
      .catch((error) => respond({ ok: false, error: error.message }));
    return true;
  });
})();
