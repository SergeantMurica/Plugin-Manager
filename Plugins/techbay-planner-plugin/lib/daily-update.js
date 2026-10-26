(() => {
  if (globalThis.TechbayDailyUpdate) return;

  function today() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function stamp(text, date, initials) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    const parsed = match && new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (!match || parsed.getFullYear() !== Number(match[1]) ||
        parsed.getMonth() + 1 !== Number(match[2]) || parsed.getDate() !== Number(match[3]))
      throw new Error("Choose a valid Daily update date.");
    initials = initials.trim();
    if (!initials || initials.length > 4 || /\s/.test(initials))
      throw new Error("Enter technician initials (1-4 characters, without spaces).");
    const body = text.replace(
      /^\s*(?:\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}-\d{2}-\d{2})(?:[ \t]+\S{1,4})?(?:[ \t]*[-\u2013\u2014][ \t]*|[ \t]*(?=\r?\n|$))/i,
      "",
    ).trimStart();
    const header = `${Number(match[2])}/${Number(match[3])} ${initials}`;
    return body ? `${header} - ${body}` : header;
  }

  globalThis.TechbayDailyUpdate = { today, stamp };
})();
