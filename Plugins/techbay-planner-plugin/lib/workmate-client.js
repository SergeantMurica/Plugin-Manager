import { orderContext } from "./orders.js";

const contentFile = decodeURIComponent(
  new URL("../content.js", import.meta.url).pathname,
).replace(/^\/+/, "");

export async function requestWorkMateAccess() {
  if (!await chrome.permissions.request({ origins: ["https://app.workmatepos.co/*"] }))
    throw new Error("Allow access to app.workmatepos.co to read or fill the embedded Work Mate page.");
}

export async function readFrames(tabId) {
  const frames = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: [contentFile],
  });
  const attempts = await Promise.allSettled(frames.map(async ({ frameId }) => ({
    frameId,
    ...await chrome.tabs.sendMessage(tabId, { type: "TECHBAY_READ_ORDERS" }, { frameId }),
  })));
  const responses = attempts
    .filter((attempt) => attempt.status === "fulfilled" && attempt.value.ok)
    .map((attempt) => attempt.value);
  if (!responses.length)
    throw new Error("Could not reach Work Mate. Reload Shopify and check embedded-page access.");
  return responses;
}

export async function fillOrder(tabId, url, values, allowEmpty = false) {
  const expected = orderContext(url);
  const tab = await chrome.tabs.get(tabId);
  if (!(expected?.number || expected?.isNew) || orderContext(tab.url)?.url !== expected.url)
    throw new Error("The target tab is no longer on the selected work order.");
  const frames = await readFrames(tabId);
  const frame = frames.sort((a, b) => b.fieldCount - a.fieldCount)[0];
  if (!frame?.fieldCount)
    throw new Error("Work order fields are not ready. Open the order and try again.");
  const current = await chrome.tabs.get(tabId);
  if (orderContext(current.url)?.url !== expected.url)
    throw new Error("The work order changed before injection. Nothing was filled.");
  const response = await chrome.tabs.sendMessage(tabId, {
    type: "TECHBAY_FILL_WORK_ORDER", values, allowEmpty,
  }, { frameId: frame.frameId });
  if (!response?.ok) throw new Error(response?.error || "Work Mate did not respond.");
  return response;
}

export async function waitForOrder(tabId, url) {
  const deadline = Date.now() + 25000;
  let lastError;
  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId);
    if (orderContext(tab.pendingUrl || tab.url)?.url !== orderContext(url)?.url)
      throw new Error("The background tab navigated away from the selected order.");
    if (tab.status === "complete") {
      try {
        const frames = await readFrames(tabId);
        if (frames.some((frame) => Object.hasOwn(frame.fields, "dailyUpdate"))) return;
      } catch (error) {
        lastError = error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Work Mate did not finish loading. The tab was left open; retry there.${lastError ? ` ${lastError.message}` : ""}`);
}
