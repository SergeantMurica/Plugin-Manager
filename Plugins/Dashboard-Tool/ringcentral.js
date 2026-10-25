// Runs in RingCentral's isolated world; only prepares the recipient, never a message or Send.
async function dashboardFillRingCentralRecipient(number) {
  const visible = (el) => {
    if (!el || !el.getClientRects().length || el.closest("[aria-hidden='true'], [inert]")) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  };
  const findButton = (pattern) => [...document.querySelectorAll("button, [role='button'], [role='tab'], a")]
    .find((el) => visible(el) && !el.disabled &&
      [el.getAttribute("aria-label"), el.getAttribute("title"), el.innerText]
        .some((label) => label && pattern.test(label.trim())));
  const recipient = () => [...document.querySelectorAll("input")]
    .find((el) => visible(el) && !el.disabled && !el.readOnly &&
      /enter names or phone numbers/i.test(el.placeholder || el.getAttribute("aria-label") || ""));
  const waitFor = async (find) => {
    const end = Date.now() + 8000;
    do {
      const el = find();
      if (el) return el;
      await new Promise((resolve) => setTimeout(resolve, 150));
    } while (Date.now() < end);
    return null;
  };
  const newText = /\b(new text|compose text|new sms)\b/i;
  const existingDialog = [...document.querySelectorAll("[role='dialog'], [aria-modal='true']")]
    .find((el) => visible(el) && /^new text$/i.test(
      el.querySelector("h1, h2")?.textContent?.trim() || el.getAttribute("aria-label") || "",
    ));
  if (existingDialog?.querySelector("[class*='chip' i]")) {
    return { ok: false, error: "RingCentral already has selected recipients. Start an empty New text before copying another number." };
  }
  const ready = await waitFor(() => recipient() || findButton(newText) || findButton(/^text$/i));
  if (!ready) {
    return { ok: false, error: "RingCentral is not ready. Wait for it to finish loading and sign in, then copy the number again." };
  }
  let input = recipient();
  if (existingDialog && !input) {
    return { ok: false, error: "A New text draft is already open. Finish or cancel it before copying another number." };
  }
  if (!input) {
    let button = findButton(newText);
    if (!button) {
      const textTab = findButton(/^text$/i);
      if (textTab) textTab.click();
      button = await waitFor(() => findButton(newText));
    }
    if (!button) return { ok: false, error: "Couldn't find RingCentral's New text button. Open Text, then New text and copy the number again." };
    button.click();
    input = await waitFor(recipient);
    // The opening animation can replace the first recipient input.
    if (input) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      input = recipient();
    }
  }
  if (!input) return { ok: false, error: "Couldn't find RingCentral's recipient field. The number is copied; paste it into New text." };
  const existing = input.value.replace(/\D/g, "");
  if (input.value.trim() && existing !== number && existing !== `1${number}`) {
    return { ok: false, error: "RingCentral already has a recipient draft. Clear or finish it before copying another number." };
  }
  const dialog = input.closest("[role='dialog'], [aria-modal='true']") || input.closest("form");
  if (!dialog) {
    return { ok: false, error: "Couldn't safely identify RingCentral's New text dialog. Paste the copied number into the recipient field." };
  }
  if (dialog.querySelector("[data-testid*='chip' i], [class*='chip' i], [role='listitem'], [aria-label*='remove recipient' i]")) {
    return { ok: false, error: "RingCentral already has selected recipients. Start an empty New text before copying another number." };
  }
  input.focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, number);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 150));
  if (input.value.replace(/\D/g, "") !== number) {
    const chips = [...dialog.querySelectorAll("[class*='chip' i]")];
    const selected = chips.map((chip) => (chip.textContent || "").replace(/\D/g, "")).filter(Boolean);
    if (selected.length && selected.every((digits) => digits === number || digits === `1${number}`)) {
      return { ok: true };
    }
    return { ok: false, error: "RingCentral did not keep the recipient. Paste the copied number into New text." };
  }
  return { ok: true };
}
