function template(id) {
  const source = document.getElementById(id);
  if (!(source instanceof HTMLTemplateElement)) throw new Error(`Missing bundled template: ${id}`);
  return { body: source.content.cloneNode(true) };
}

function heading(text) {
  const h = document.createElement("h2");
  h.className = "section-heading";
  h.textContent = text;
  return h;
}

async function init() {
  const warranty = template("warrantyTemplate");
  const pound = template("outreachTemplate");
  const workspace = document.getElementById("dashboardWorkspace");
  workspace.append(...warranty.body.children);
  workspace.querySelector("#mainView h1").textContent = "Dashboard Tool";
  workspace.querySelector("#authView h1").textContent = "Dashboard Tool";

  const outreach = document.createElement("section");
  outreach.id = "dashboardOutreach";
  outreach.dataset.for = "financing abandoned helpdesk other";
  outreach.setAttribute("aria-label", "Dash outreach");
  outreach.append(...pound.body.children);
  // Reuse the Warranty form's inputs and controller, not a second customer draft.
  const customerRows = new Set(["customer", "phone", "email", "order", "systemPrice"]
    .map((id) => outreach.querySelector(`#${id}`).closest(".row")));
  for (const row of customerRows) row.remove();
  const leadForm = outreach.querySelector("#lead");
  const leadFields = document.createElement("div");
  leadFields.id = "lead";
  leadFields.append(...leadForm.children);
  leadForm.replaceWith(leadFields);
  const outreachHeader = outreach.querySelector(".top");
  outreachHeader.querySelector(".brand-logo-container").remove();
  outreachHeader.querySelector("h1").remove();
  outreachHeader.className = "outreach-summary";
  const openTracker = outreach.querySelector("#wtOpen");
  openTracker.textContent = "Review customer";
  openTracker.title = "Return to the shared customer form";
  outreach.querySelector("#wtLog").textContent = "Save warranty status";
  openTracker.hidden = true;
  outreach.querySelector("#readPage").hidden = true;

  const poundIds = [...outreach.querySelectorAll("[id]")];
  const poundLabels = [...outreach.querySelectorAll("label[for]")];
  const form = workspace.querySelector("#form");
  const financingRow = outreach.querySelector("#lender").closest(".row");
  form.querySelector("#email").closest(".field").after(financingRow);
  form.querySelector('button[type="submit"]').hidden = true;
  const clearFields = form.querySelector("#clear");
  clearFields.textContent = "Clear fields";
  clearFields.hidden = false;
  outreachHeader.append(clearFields);
  const saveRow = outreach.querySelector("#wtBox");
  form.append(saveRow);
  const leadTop = outreach.querySelector(".lead-top");
  form.prepend(outreachHeader, outreach.querySelector("#claim"), leadTop);
  form.append(outreach.querySelector("#error"));
  const originalPriceField = form.querySelector("#systemPrice").closest(".field");
  const priceField = document.createElement("div");
  priceField.className = "field";
  priceField.append(...originalPriceField.children);
  originalPriceField.replaceWith(priceField);
  priceField.querySelector("#systemPrice").setAttribute("aria-label", "System price");
  priceField.querySelector("#systemPrice").title = "Combined PC prices, excluding accessories. Multi-PC warranties are quoted per PC and added together.";
  const watercooled = form.querySelector(".toggle");
  watercooled.querySelector("input").setAttribute("aria-label", "Watercooled");
  priceField.querySelector("span").textContent = "Warranty pricing";
  priceField.prepend(watercooled);
  const fixedPrice = document.createElement("p");
  fixedPrice.id = "fixedWarrantyPrice";
  fixedPrice.className = "hint";
  fixedPrice.textContent = "Watercooled: 2 years $499 / 3 years $799 per PC";
  fixedPrice.hidden = true;
  priceField.append(fixedPrice);

  const scriptCard = outreach.querySelector("#script").closest(".card");
  scriptCard.classList.add("outreach-scripts");

  for (const el of poundIds) el.id = `pl-${el.id}`;
  for (const label of poundLabels) {
    label.htmlFor = `pl-${label.htmlFor}`;
  }
  const warrantyLog = workspace.querySelector("#mainView > .log");
  warrantyLog.prepend(heading("Warranty team log"));
  warrantyLog.before(outreach);

  const warrantyController = await import("./warranty/popup.js");
  await warrantyController.ready;
  const outreachController = await import("./outreach/popup.js");
  await outreachController.ready;
  workspace.inert = false;
  workspace.setAttribute("aria-busy", "false");
  document.getElementById("dashboardLoading").remove();
}

init().catch((error) => {
  document.getElementById("dashboardLoading")?.remove();
  const status = document.getElementById("dashboardError");
  status.textContent = `Dashboard couldn't start: ${error.message}. Reload the panel to try again.`;
  status.hidden = false;
  console.error("[Dashboard Tool]", error);
});
