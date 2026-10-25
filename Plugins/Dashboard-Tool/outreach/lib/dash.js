export async function sendDashMessage(tabId, message, api = chrome) {
  try {
    return await api.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (!/receiving end does not exist|could not establish connection/i.test(error.message)) throw error;
    const tab = await api.tabs.get(tabId);
    if (!/^https:\/\/(?:dash\.metapcs\.com|metapcs-platform\.web\.app)\//.test(tab.url || "")) {
      throw new Error("The selected tab is no longer a Dash page.");
    }
    const path = new URL("../content.js", import.meta.url).pathname.replace(/^\//, "");
    await api.scripting.executeScript({ target: { tabId }, files: [path] });
    return api.tabs.sendMessage(tabId, message);
  }
}
