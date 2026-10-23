import {
  optionalToolsByDevice,
  plannerOptionsByDevice,
  serviceTypeLabels,
  serviceTypesByDevice,
} from "./lib/template-data.js";
import { DEFAULT_THEME, THEMES } from "./lib/themes.js";
import { orderContext } from "./lib/orders.js";
import { createOrderList } from "./lib/order-list.js";
import { fillOrder, requestWorkMateAccess } from "./lib/workmate-client.js";

const DRAFT_KEY = "techbay-work-order-draft-v1";
const NOTES_KEY = "techbay-work-order-notes-v1";
const THEME_KEY = "techbay-tool-theme";
const INITIALS_KEY = "techbay-technician-initials";
const form = document.querySelector("#order-form");
const status = document.querySelector("#status");
const orderNumber = document.querySelector("#order-number");
const connection = document.querySelector("#connection");
const submitLabel = document.querySelector("#submit-label");
const initialsInput = document.querySelector('[name="checkInInitials"]');
const themeSelect = document.querySelector("#theme-select");
const notesSelect = document.querySelector("#note-select");
themeSelect.replaceChildren(
  ...THEMES.map((theme) => new Option(theme.name, theme.id)),
);
const serviceOption = document.querySelector("#service-option");
const optionalTool = document.querySelector("#optional-tool");
const selectedOptionsNode = document.querySelector("#selected-options");
const selectedToolsNode = document.querySelector("#selected-tools");
const planResponsesNode = document.querySelector("#plan-responses");
let activeDictation;
const selectedOptions = new Set();
const selectedTools = new Set();
const planResponses = {};
const checkInFieldNames = new Set([
  "device",
  "priority",
  "makeModel",
  "serial",
  "pin",
  "checkInInitials",
  "workDate",
  "esd",
  "reimage",
  "backup",
  "issues",
  "techNotes",
  "solutions",
  "callbackNotes",
  "s2s",
  "image",
  "dailyUpdate",
]);
let activeTabId;
let activeOrderNumber = "";
let activeOrderUrl = "";
let tabRefreshVersion = 0;
let draftSaveTimer;
const notes = {};
const noteOrder = [];
let activeNoteId = "";
const orderList = createOrderList(showStatus);

function todayLabel() {
  const date = new Date();
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function showStatus(message, kind = "") {
  status.textContent = message;
  status.className = `status ${kind}`.trim();
}

function updateSubmitLabel(tabName) {
  submitLabel.textContent =
    tabName === "service" ? "Copy Tech Notes" : "Fill Check-in and append note";
}

function getOrderNumber(url = "") {
  const context = orderContext(url);
  return context?.isNew ? "New work order" : context?.number || "";
}

function applyTheme(themeId) {
  const palette =
    THEMES.find((item) => item.id === themeId) ||
    THEMES.find((item) => item.id === DEFAULT_THEME);
  const theme = palette.id;
  document.documentElement.dataset.theme = theme;
  for (const [token, value] of Object.entries(palette)) {
    if (["id", "name", "onAccent"].includes(token)) continue;
    document.documentElement.style.setProperty(
      token === "text" ? "--ink" : token === "accent" ? "--acid" : `--${token}`,
      value,
    );
  }
  document.documentElement.style.setProperty("--on-accent", palette.onAccent);
  document.documentElement.style.setProperty(
    "--control",
    "color-mix(in srgb, var(--bg), var(--panel) 55%)",
  );
  themeSelect.value = theme;
  chrome.storage.local.set({ [THEME_KEY]: theme });
}

function currentPlannerDevice() {
  return form.elements.device.value === "Laptop" ? "laptop" : "desktop";
}

function updateServiceTypeOptions() {
  const serviceType = form.elements.serviceType;
  const availableTypes = serviceTypesByDevice[currentPlannerDevice()];
  const selectedType = availableTypes.includes(serviceType.value)
    ? serviceType.value
    : availableTypes[0];

  serviceType.replaceChildren(
    ...availableTypes.map((type) => new Option(serviceTypeLabels[type], type)),
  );
  serviceType.value = selectedType;
}

function currentServiceType() {
  return form.elements.serviceType.value;
}

function activePlans() {
  return plannerOptionsByDevice[currentPlannerDevice()][currentServiceType()];
}

function activeTools() {
  return optionalToolsByDevice[currentPlannerDevice()].filter((tool) =>
    tool.serviceTypes.includes(currentServiceType()),
  );
}

function addChoiceChip(container, item, set, onRemove) {
  const button = document.createElement("button");
  button.className = "choice-chip";
  button.type = "button";
  button.textContent = `${item.label} ×`;
  button.setAttribute("aria-label", `Remove ${item.label}`);
  button.addEventListener("click", () => onRemove(item.id));
  container.append(button);
  set.add(item.id);
}

const LISTENING_MESSAGE = 'Listening... say "pause" or "end".';
const PAUSED_MESSAGE = 'Paused. Say "unpause" to continue.';

// Common mis-hearings of shop jargon; extend as new ones show up.
const VOICE_CORRECTIONS = [
  [
    /\b(women'?s|woman'?s|win\s?(?:age|edge)|why\s?image|wimmage)\b/gi,
    "wimage",
  ],
];

function applyVoiceCorrections(text) {
  return VOICE_CORRECTIONS.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    text,
  );
}

// Only a whole utterance counts, so "front end" in a note is never a command.
function parseVoiceCommand(transcript) {
  const spoken = transcript
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (spoken === "end") return "end";
  if (spoken === "pause") return "pause";
  if (["unpause", "un pause", "on pause", "resume"].includes(spoken))
    return "unpause";
  return "";
}

function addDictationControl(container, textarea) {
  const controls = document.createElement("div");
  controls.className = "voice-controls";
  const button = document.createElement("button");
  button.className = "voice-button";
  button.type = "button";
  button.textContent = "Start dictation";
  button.setAttribute("aria-pressed", "false");
  const message = document.createElement("span");
  message.className = "voice-message";
  message.setAttribute("aria-live", "polite");
  controls.append(button, message);
  container.append(controls);

  button.addEventListener("click", async () => {
    if (activeDictation?.button === button) {
      activeDictation.stop();
      return;
    }

    activeDictation?.stop();
    const Recognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      message.textContent = "Voice input is not supported in this browser.";
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      message.textContent = "Microphone access is unavailable in this context.";
      return;
    }

    button.disabled = true;
    button.textContent = "Requesting microphone...";
    message.textContent = "Allow microphone access in Chrome to continue.";
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      audioStream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      const errorName = error instanceof Error ? error.name : "";
      message.textContent =
        errorName === "NotAllowedError" || errorName === "SecurityError"
          ? "Microphone permission denied. Allow access for the extension in Chrome."
          : errorName === "NotFoundError"
            ? "No microphone found. Check your input device."
            : `Could not access the microphone${errorName ? `: ${errorName}` : "."}`;
      button.disabled = false;
      button.textContent = "Start dictation";
      return;
    }
    button.disabled = false;

    let paused = false;
    let stopped = false;
    let pendingTranscript = "";
    let recognition;
    const session = {
      button,
      stop() {
        stopped = true;
        recognition?.stop();
      },
    };

    const appendText = (text) => {
      textarea.value = `${textarea.value}${textarea.value ? "\n" : ""}${text}`;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    };

    const startRecognition = () => {
      recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.maxAlternatives = 5;

      recognition.onresult = (event) => {
        let interim = "";
        for (const result of Array.from(event.results).slice(
          event.resultIndex,
        )) {
          let text = result[0].transcript.trim();
          if (!text) continue;
          if (!result.isFinal) {
            interim = applyVoiceCorrections(text);
            continue;
          }

          // Prefer an alternative containing a known term over the top guess.
          const alternatives = Array.from(
            { length: Math.min(result.length, 5) },
            (_, i) => result[i].transcript.trim(),
          ).filter(Boolean);
          text = applyVoiceCorrections(
            alternatives.find((alt) => /wimage/i.test(alt)) ?? text,
          );

          pendingTranscript = "";
          const command = parseVoiceCommand(text);
          if (command === "end") {
            message.textContent = "Dictation ended.";
            session.stop();
            return;
          }
          if (command === "pause") {
            paused = true;
            message.textContent = PAUSED_MESSAGE;
            continue;
          }
          if (command === "unpause") {
            paused = false;
            message.textContent = LISTENING_MESSAGE;
            continue;
          }
          if (!paused) {
            appendText(text);
            message.textContent = "Text added to note.";
          }
        }

        if (interim && !paused) {
          pendingTranscript = interim;
          message.textContent = `Hearing: ${interim}`;
        }
      };

      recognition.onerror = (event) => {
        // Silence timeouts are expected; onend restarts the session.
        if (event.error === "no-speech" || event.error === "aborted") return;
        const errorMessages = {
          "not-allowed":
            "Microphone permission denied. Check Chrome site settings.",
          "service-not-allowed":
            "Chrome blocked the speech recognition service.",
          "audio-capture": "No microphone detected. Check your input device.",
          network: "Speech service network error. Check your connection.",
        };
        stopped = true;
        message.textContent =
          errorMessages[event.error] ||
          `Speech recognition error: ${event.error}`;
      };

      recognition.onend = () => {
        if (
          pendingTranscript &&
          !paused &&
          !parseVoiceCommand(pendingTranscript)
        )
          appendText(pendingTranscript);
        pendingTranscript = "";

        if (!stopped) {
          try {
            startRecognition();
            return;
          } catch {
            message.textContent = "Dictation stopped unexpectedly.";
          }
        }

        button.textContent = "Start dictation";
        button.setAttribute("aria-pressed", "false");
        if (activeDictation === session) activeDictation = undefined;
      };

      recognition.start();
    };

    message.textContent = LISTENING_MESSAGE;
    button.textContent = "Stop dictation";
    button.setAttribute("aria-pressed", "true");
    activeDictation = session;
    try {
      startRecognition();
    } catch {
      message.textContent = "Could not start voice input.";
      button.textContent = "Start dictation";
      button.setAttribute("aria-pressed", "false");
      activeDictation = undefined;
    }
  });
}

function renderServices() {
  const plans = activePlans();
  const tools = activeTools();
  serviceOption.replaceChildren(new Option("Choose a category...", ""));
  for (const plan of plans) {
    const option = new Option(
      `${selectedOptions.has(plan.id) ? "✓ " : ""}${plan.label}`,
      plan.id,
    );
    serviceOption.append(option);
  }
  optionalTool.replaceChildren(new Option("Choose a tool...", ""));
  for (const tool of tools) {
    optionalTool.append(
      new Option(
        `${selectedTools.has(tool.id) ? "✓ " : ""}${tool.label}`,
        tool.id,
      ),
    );
  }

  selectedOptionsNode.replaceChildren();
  for (const plan of plans.filter((item) => selectedOptions.has(item.id))) {
    addChoiceChip(selectedOptionsNode, plan, selectedOptions, removePlan);
  }
  selectedToolsNode.replaceChildren();
  for (const tool of tools.filter((item) => selectedTools.has(item.id))) {
    addChoiceChip(selectedToolsNode, tool, selectedTools, removeTool);
  }
  document.querySelector("#service-count").textContent =
    `${selectedOptions.size} selected`;
  renderPlanResponses();
  updatePreviews();
}

function removePlan(id) {
  selectedOptions.delete(id);
  delete planResponses[id];
  delete planResponses[`${id}:why`];
  renderServices();
}

function removeTool(id) {
  selectedTools.delete(id);
  delete planResponses[id];
  delete planResponses[`${id}:why`];
  renderServices();
}

function renderPlanResponses() {
  planResponsesNode.replaceChildren();
  const plans = activePlans().filter((plan) => selectedOptions.has(plan.id));
  const tools = activeTools().filter((tool) => selectedTools.has(tool.id));
  const items = [...plans, ...tools];

  if (!Object.hasOwn(planResponses, "assumedIssues")) {
    planResponses.assumedIssues = items
      .map((item) => {
        const why = (planResponses[`${item.id}:why`] || "").trim();
        return why ? `${item.label}: ${why}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }

  if (items.length) {
    const field = document.createElement("label");
    field.className = "field assumed-issues-field";
    const title = document.createElement("span");
    title.textContent = "Assumed issue(s)";
    const textarea = document.createElement("textarea");
    textarea.rows = 3;
    textarea.value = planResponses.assumedIssues;
    textarea.placeholder = "Enter all assumed issues, one per line.";
    textarea.addEventListener("input", () => {
      planResponses.assumedIssues = textarea.value;
      saveDraft();
      updatePreviews();
    });
    field.append(title, textarea);
    addDictationControl(field, textarea);
    planResponsesNode.append(field);
  }

  if (!Object.hasOwn(planResponses, "combinedNotes")) {
    planResponses.combinedNotes = items
      .map((item) => (planResponses[item.id] || "").trim())
      .filter(Boolean)
      .join("\n");
  }

  if (items.length) {
    const label = document.createElement("div");
    label.className = "field response-field combined-response-field";
    const title = document.createElement("span");
    title.textContent = `${items.map((item) => item.label).join(", ")} · What you did and found`;
    const guide = document.createElement("details");
    guide.className = "step-guide";
    const guideSummary = document.createElement("summary");
    guideSummary.textContent = "Suggested steps";
    const guideList = document.createElement("ol");
    for (const item of items) {
      const steps = item.steps
        ? item.steps.map((step) => step.title)
        : [item.step];
      for (const step of steps) {
        const entry = document.createElement("li");
        entry.textContent = `${item.label}: ${step}`;
        guideList.append(entry);
      }
    }
    guide.append(guideSummary, guideList);
    const textarea = document.createElement("textarea");
    textarea.rows = 5;
    textarea.value = planResponses.combinedNotes;
    textarea.placeholder =
      "One line per action, past tense. Example: \nPulled RAM; \nTest RAM in; \nNo post, \nDRAM light on";
    textarea.addEventListener("input", () => {
      planResponses.combinedNotes = textarea.value;
      saveDraft();
      updatePreviews();
    });
    label.append(title, guide, textarea);
    addDictationControl(label, textarea);
    planResponsesNode.append(label);
  }
}

function checkedValue(name) {
  return form.querySelector(`input[name="${name}"]:checked`)?.value || "";
}

addDictationControl(
  form.elements.issues.closest(".field"),
  form.elements.issues,
);

function mark(value, expected) {
  return value === expected ? "X" : " ";
}

function noteHeader() {
  const date = form.elements.workDate.value.trim() || "__/__";
  const initials = initialsInput.value.trim() || "__";
  return `${date} ${initials}`;
}

function toBullets(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean)
    .map((line) => `-${line}`);
}

function formatDailyUpdate() {
  return `${noteHeader()} - Checked In`;
}

function getCheckInNote() {
  return [
    `PIN: ${form.elements.pin.value}`,
    `ESD: ${form.elements.esd.value}`,
    `Reimage/Wipe: Yes[${mark(checkedValue("reimage"), "yes")}] No[${mark(checkedValue("reimage"), "no")}] Call Me First[${mark(checkedValue("reimage"), "call")}]`,
    `Back-up: Yes[${mark(checkedValue("backup"), "yes")}] No[${mark(checkedValue("backup"), "no")}]`,
    `Initials: ${initialsInput.value}`,
    "",
    `Issue(s): ${form.elements.issues.value}`,
    "",
    "Tech Notes:",
    "",
    "Solutions:",
    "",
    "Callback Notes:",
  ].join("\n");
}

function getServiceNote() {
  const plans = activePlans().filter((plan) => selectedOptions.has(plan.id));
  const tools = activeTools().filter((tool) => selectedTools.has(tool.id));
  const items = [...plans, ...tools];
  const lines = [noteHeader()];
  const assumptions = toBullets(planResponses.assumedIssues || "");

  if (assumptions.length) {
    lines.push("", "Assumed issue(s):", ...assumptions);
  }

  if (items.length) {
    lines.push("", `${items.map((item) => item.label).join(", ")}:`);
    lines.push(...toBullets(planResponses.combinedNotes || ""));
  }
  if (lines.length === 1) lines.push("-");
  return lines.join("\n");
}

function updatePreviews() {
  document.querySelector("#checkin-preview").textContent = getCheckInNote();
  document.querySelector("#service-preview").textContent = getServiceNote();
}

function noteLabel(id, index) {
  const draft = notes[id] || {};
  const number = getOrderNumber(draft.orderUrl);
  const title = (draft.makeModel || draft.issues || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 32);
  return `${index + 1}. ${number ? `${number} / ` : ""}${title || "New note"}`;
}

function renderNoteOptions() {
  notesSelect.replaceChildren(
    ...noteOrder.map((id, index) => new Option(noteLabel(id, index), id)),
  );
  notesSelect.value = activeNoteId;
}

function collectDraft() {
  const draft = Object.fromEntries(new FormData(form).entries());
  if (notes[activeNoteId]?.orderUrl) draft.orderUrl = notes[activeNoteId].orderUrl;
  delete draft.workDate;
  for (const checkbox of form.querySelectorAll(
    'input[type="checkbox"][name]',
  )) {
    draft[checkbox.name] = checkbox.checked;
  }
  draft.selectedOptions = [...selectedOptions];
  draft.selectedTools = [...selectedTools];
  draft.planResponses = { ...planResponses };
  return draft;
}

function clearForm() {
  activeDictation?.stop();
  const initials = initialsInput.value;
  form.reset();
  initialsInput.value = initials;
  selectedOptions.clear();
  selectedTools.clear();
  for (const key of Object.keys(planResponses)) delete planResponses[key];
  form.elements.workDate.value = todayLabel();
  form.elements.esd.value = todayLabel();
  updateServiceTypeOptions();
}

function applyDraft(values = {}) {
  // Device decides which service types exist, so it must be set first.
  if (values.device !== undefined) form.elements.device.value = values.device;
  updateServiceTypeOptions();
  for (const [name, value] of Object.entries(values)) {
    if (
      [
        "selectedOptions",
        "selectedTools",
        "planResponses",
        "workDate",
        "checkInInitials",
      ].includes(name)
    )
      continue;
    const control = form.elements.namedItem(name);
    if (!control) continue;
    if (control instanceof RadioNodeList) {
      for (const radio of control)
        radio.checked = radio.value === String(value);
    } else if (control.type === "checkbox") control.checked = Boolean(value);
    else control.value = String(value);
  }
  for (const id of values.selectedOptions || []) selectedOptions.add(id);
  for (const id of values.selectedTools || []) selectedTools.add(id);
  Object.assign(planResponses, values.planResponses || {});
}

function loadNote(id) {
  activeNoteId = id;
  clearForm();
  applyDraft(notes[id]);
  updateServiceTypeOptions();
  renderServices();
  renderNoteOptions();
  saveDraft(true);
}

function saveDraft(immediate = false) {
  clearTimeout(draftSaveTimer);

  const persist = () => {
    if (!activeNoteId) return;
    notes[activeNoteId] = collectDraft();
    renderNoteOptions();

    chrome.storage.local
      .set({
        [NOTES_KEY]: { activeId: activeNoteId, order: noteOrder, notes },
        [INITIALS_KEY]: initialsInput.value,
      })
      .catch((error) => console.error("Could not save notes.", error));
  };

  if (immediate) persist();
  else draftSaveTimer = setTimeout(persist, 200);
}

async function sendFillMessage(tabId, values) {
  const tab = await chrome.tabs.get(tabId);
  if (getOrderNumber(tab.url) !== values.orderNumber)
    throw new Error("The active work order changed. Try again on the intended order.");
  return fillOrder(tabId, tab.url, values);
}

async function refreshActiveTab() {
  const version = ++tabRefreshVersion;
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (version !== tabRefreshVersion) return;
  const changedBrowserTab = activeTabId !== tab?.id;
  activeTabId = tab?.id;
  const context = orderContext(tab?.url);
  const detectedOrder = getOrderNumber(tab?.url);
  activeOrderNumber = detectedOrder;
  if ((context?.number || context?.isNew) &&
      (context.url !== activeOrderUrl || (context.isNew && changedBrowserTab)) &&
      activeNoteId) {
    saveDraft(true);
    let id = context.isNew ? "" : noteOrder.find((key) => notes[key].orderUrl === context.url);
    if (!id) {
      id = crypto.randomUUID();
      notes[id] = { orderUrl: context.url };
      noteOrder.push(id);
    }
    loadNote(id);
  }
  activeOrderUrl = context?.url || "";
  orderNumber.textContent = detectedOrder || "Pull-only work order list";
  connection.classList.remove("ready", "error");

  if (orderContext(tab?.url)) {
    connection.classList.add("ready");
    connection.setAttribute("aria-label", "Shopify Admin tab active");
    showStatus(detectedOrder
      ? context.isNew
        ? "Ready to check in a new work order. Fill fields, then review and create it in Work Mate."
        : "Ready to fill the active Work Mate order."
      : "List mode. Click Pull to read the current page without storing orders.");
  } else {
    connection.classList.add("error");
    connection.setAttribute(
      "aria-label",
      "Shopify Work Mate order not detected",
    );
    showStatus("Pull-only list mode. Open a Work Mate list and click Pull. No automatic capture.");
  }
  await orderList.follow(tab);
}

// The side panel stays open, so follow the active tab and its URL changes.
function followActiveTab() {
  refreshActiveTab().catch((error) => showStatus(error.message, "error"));
}
chrome.tabs.onActivated.addListener(followActiveTab);
chrome.tabs.onUpdated.addListener((id, info) => {
  if (id === activeTabId && (info.url || info.status === "complete")) followActiveTab();
});
chrome.windows.onFocusChanged.addListener(followActiveTab);
document.querySelector("#show-active-order").addEventListener("click", followActiveTab);
document.querySelector("#show-list").addEventListener("click", () => {
  document.querySelector("#order-list").hidden = false;
  document.querySelector("#order-workspace").hidden = true;
  document.querySelector("#reset-button").hidden = true;
});
document.querySelector("#load-order-fields").addEventListener("click", async () => {
  try {
    const url = activeOrderUrl;
    const id = activeNoteId;
    await requestWorkMateAccess();
    await orderList.capture();
    if (activeOrderUrl !== url || activeNoteId !== id)
      throw new Error("The active order or note changed while pulling. Try again.");
    const order = orderList.getOrder(url);
    if (!order) throw new Error("No fields were captured for this order.");
    applyDraft(order.fields);
    renderServices();
    updatePreviews();
    saveDraft(true);
    showStatus("Current order fields pulled into this note. Existing Shopify notes were not changed.", "success");
  } catch (error) {
    showStatus(error.message, "error");
  }
});

async function initialize() {
  // Select the view before loading drafts or attempting embedded-page capture.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  orderList.setView(tab);
  await orderList.initialize();

  const stored = await chrome.storage.local.get([
    NOTES_KEY,
    DRAFT_KEY,
    INITIALS_KEY,
  ]);
  const savedNotes = stored[NOTES_KEY];
  for (const id of savedNotes?.order || []) {
    if (!savedNotes.notes?.[id]) continue;
    notes[id] = savedNotes.notes[id];
    noteOrder.push(id);
  }
  const migratedLegacyDraft = !noteOrder.length;
  if (migratedLegacyDraft) {
    const id = crypto.randomUUID();
    notes[id] = stored[DRAFT_KEY] || {};
    noteOrder.push(id);
  }
  activeNoteId = notes[savedNotes?.activeId]
    ? savedNotes.activeId
    : noteOrder[0];
  if (typeof stored[INITIALS_KEY] === "string")
    initialsInput.value = stored[INITIALS_KEY];
  applyDraft(notes[activeNoteId]);

  if (!form.elements.workDate.value)
    form.elements.workDate.value = todayLabel();
  if (!form.elements.esd.value) form.elements.esd.value = todayLabel();
  updateServiceTypeOptions();
  renderServices();
  renderNoteOptions();
  saveDraft(true);
  if (migratedLegacyDraft) chrome.storage.local.remove(DRAFT_KEY);
  const theme = await chrome.storage.local.get(THEME_KEY);
  applyTheme(theme[THEME_KEY] || DEFAULT_THEME);
  await refreshActiveTab();
}

form.addEventListener("input", () => {
  saveDraft();
  updatePreviews();
});
form.addEventListener("change", () => {
  saveDraft(true);
  updatePreviews();
});

initialsInput.addEventListener("input", () => {
  saveDraft();
  updatePreviews();
});
initialsInput.addEventListener("change", () => saveDraft(true));
initialsInput.addEventListener("blur", () => saveDraft(true));
form.addEventListener("focusout", () => saveDraft(true));
window.addEventListener("pagehide", () => saveDraft(true));

document.querySelector("#reset-button").addEventListener("click", () => {
  if (
    !window.confirm("Clear this note and start it fresh? Other notes are kept.")
  )
    return;
  notes[activeNoteId] = { orderUrl: notes[activeNoteId]?.orderUrl };
  loadNote(activeNoteId);
  showStatus("Note cleared.", "success");
});

notesSelect.addEventListener("change", () => {
  const targetId = notesSelect.value;
  saveDraft(true);
  loadNote(targetId);
});

document.querySelector("#new-note-button").addEventListener("click", () => {
  saveDraft(true);
  const id = crypto.randomUUID();
  notes[id] = activeOrderUrl ? { orderUrl: activeOrderUrl } : {};
  noteOrder.push(id);
  loadNote(id);
  showStatus("New note started. Your other notes are saved.", "success");
});

document.querySelector("#delete-note-button").addEventListener("click", () => {
  if (!window.confirm("Delete this note? This cannot be undone.")) return;
  const index = noteOrder.indexOf(activeNoteId);
  delete notes[activeNoteId];
  noteOrder.splice(index, 1);
  if (!noteOrder.length) {
    const id = crypto.randomUUID();
    notes[id] = {};
    noteOrder.push(id);
  }
  loadNote(noteOrder[Math.min(index, noteOrder.length - 1)]);
  showStatus("Note deleted.", "success");
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => {
      const active = item === tab;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      const active = panel.id === tab.getAttribute("aria-controls");
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
    updateSubmitLabel(tab.dataset.tab);
  });
});

themeSelect.addEventListener("change", () => applyTheme(themeSelect.value));
serviceOption.addEventListener("change", () => {
  if (serviceOption.value) selectedOptions.add(serviceOption.value);
  renderServices();
});
optionalTool.addEventListener("change", () => {
  if (optionalTool.value) selectedTools.add(optionalTool.value);
  renderServices();
});
form.elements.device.addEventListener("change", () => {
  selectedOptions.clear();
  selectedTools.clear();
  for (const key of Object.keys(planResponses)) delete planResponses[key];
  updateServiceTypeOptions();
  renderServices();
});
form.elements.serviceType.addEventListener("change", () => {
  selectedOptions.clear();
  selectedTools.clear();
  for (const key of Object.keys(planResponses)) delete planResponses[key];
  renderServices();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const activeTab = document.querySelector(".tab.active")?.dataset.tab;
  if (activeTab === "service") {
    const note = getServiceNote();
    try {
      await navigator.clipboard.writeText(note);
      showStatus("Tech note copied. Paste it into WorkMate Notes.", "success");
    } catch {
      showStatus("Could not copy the note to the clipboard.", "error");
    }
    return;
  }

  if (!activeTabId || !activeOrderNumber) {
    showStatus("Select a Shopify Work Mate work-order tab first.", "error");
    return;
  }

  const formValues = Object.fromEntries(new FormData(form).entries());
  const values = { orderNumber: activeOrderNumber };
  for (const [name, value] of Object.entries(formValues)) {
    if (checkInFieldNames.has(name)) values[name] = value;
  }
  values.dailyUpdate = formatDailyUpdate();
  values.checkInNote = getCheckInNote();

  try {
    const hasWorkMateAccess = await chrome.permissions.request({
      origins: ["https://app.workmatepos.co/*"],
    });
    if (!hasWorkMateAccess) {
      showStatus(
        "Allow access to app.workmatepos.co to fill the embedded WorkMate order.",
        "error",
      );
      return;
    }

    const response = await sendFillMessage(activeTabId, values);
    if (!response?.ok)
      throw new Error(response?.error || "The Shopify page did not respond.");

    const parts = [
      `Filled ${response.filled} field${response.filled === 1 ? "" : "s"}.`,
    ];
    if (response.missing?.length)
      parts.push(`Not found: ${response.missing.join(", ")}.`);
    if (response.filled === 0 && response.context) {
      parts.push(
        `Scanned ${response.frame} ${response.context}: ${response.controlCount} controls and ${response.labelCount} labels.`,
      );
      if (response.embeddedFrames?.length) {
        parts.push(`Embedded frames: ${response.embeddedFrames.join(", ")}.`);
      }
    }
    showStatus(parts.join(" "), response.filled ? "success" : "error");
  } catch (error) {
    showStatus(
      error instanceof Error
        ? error.message
        : "Could not reach the Shopify page.",
      "error",
    );
  }
});

initialize().catch((error) =>
  showStatus(`Could not initialize Work Mate Assistant: ${error.message}`, "error"),
);
