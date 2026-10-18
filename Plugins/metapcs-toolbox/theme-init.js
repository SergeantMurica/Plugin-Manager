/*
 * Runs in <head>, before the body paints, so switching themes never shows a
 * flash of the previous palette when the popup opens.
 *
 * chrome.storage.local is the source of truth for settings, but it's async —
 * too late to affect the first paint. The chosen theme id is therefore mirrored
 * into localStorage purely as a synchronous read cache. If it's missing or
 * unreadable we simply leave the default (META Red) that popup.css declares
 * on :root.
 */
(function () {
  try {
    var saved = localStorage.getItem('toolbox-theme');
    if (saved) document.documentElement.dataset.theme = saved;
  } catch (e) {
    /* storage disabled — default theme still applies */
  }
})();
