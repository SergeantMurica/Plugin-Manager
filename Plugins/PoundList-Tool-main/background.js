// Standalone install only: open the side panel from the toolbar button.
// Inside Plugin Manager this is harmless (the host sets the same behaviour).
chrome.runtime.onInstalled.addListener(() =>
  chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }),
);
chrome.runtime.onStartup.addListener(() =>
  chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }),
);
