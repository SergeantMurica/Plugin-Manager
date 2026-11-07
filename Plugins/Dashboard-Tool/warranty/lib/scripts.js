// A/B text scripts. Every variant uses the same data, only the tone changes.
// Each variant has four stages: the first pitch, a soft follow-up after a decline,
// a follow-up after no answer, and the acceptance reply that points to the emailed invoice.
// ctx: { first, rep, two, three, build }
// Keep plan prices; describe optional hardware coverage without "extended warranty" phrasing.

const INVOICE = () =>
  `META PCs will email an invoice to the email address on your order. Please review the coverage and price on the invoice before paying. If it doesn't arrive, reply here and I'll check on it.`;

export const VARIANTS = [
  {
    id: "v1",
    name: "Control",
    pitch: (c) => `Hi ${c.first}! This is ${c.rep} from META PCs. Thanks again for your order.

Your build includes a 1-year hardware warranty and lifetime phone & email support. Optional hardware coverage is available for covered repairs or replacements through our US-based team:

• 2 years – ${c.two}
• 3 years – ${c.three}

Plans can only be added before pickup or delivery. Would you like to review either option?`,
    overcome: (c) => `Understood, ${c.first}. Your included coverage stays in place. If you'd like to revisit the optional plans before pickup or delivery, the 2-year is ${c.two}. Happy to answer any questions.`,
    nudge: (c) => `Hi ${c.first}, ${c.rep} from META PCs. Any questions about the optional hardware coverage for your build? The 2-year plan is ${c.two} and the 3-year is ${c.three}, available before pickup or delivery.`,
    accept: (c) => `Thanks, ${c.first}! I'll request the plan you chose. ${INVOICE(c)}`,
  },
  {
    id: "v2",
    name: "Golden pitch",
    pitch: (c) => `Hi ${c.first}, ${c.rep} from META PCs here! Thanks again for your order.

Your build comes with 1-year hardware coverage plus lifetime phone & email support. If you'd like longer hardware coverage, here are the optional plans:

• 2-year – ${c.two}
• 3-year – ${c.three}

Plans can only be added before pickup or delivery. Would either be useful for you, or would you prefer the included coverage?`,
    overcome: (c) => `Totally fair, ${c.first}. The extra coverage is optional. If you'd like to compare the terms before pickup or delivery, I'm happy to help; otherwise we'll keep the included coverage.`,
    nudge: (c) => `Hi ${c.first}, ${c.rep} from META PCs again. Have you had a chance to review the optional hardware plans? Any questions about the 2-year or 3-year coverage before pickup or delivery?`,
    accept: (c) => `Thanks, ${c.first}! I'll send the request for your selected plan. ${INVOICE(c)}`,
  },
  {
    id: "v3",
    name: "Friendly",
    pitch: (c) => `Hey ${c.first}! 👋 It's ${c.rep} over at META PCs. Thanks for ordering with us!

Before pickup or delivery, you can choose optional hardware coverage for covered repairs or replacements through our US team:

• 2 years – ${c.two}
• 3 years – ${c.three}

Want to hear more about either plan? Keeping the included coverage is fine too.`,
    overcome: (c) => `No worries at all, ${c.first}! We'll stick with the included coverage. If you change your mind before pickup or delivery, just reply. Enjoy the new setup! 🎮`,
    nudge: (c) => `Hey ${c.first}! ${c.rep} at META PCs. Just checking whether you have any questions about the optional 2-year or 3-year hardware plans before pickup or delivery.`,
    accept: (c) => `Sounds good, ${c.first}! I'll request that plan for you. ${INVOICE(c)}`,
  },
  {
    id: "v4",
    name: "Concise",
    pitch: (c) => `Hi ${c.first}, ${c.rep} from META PCs. Optional hardware coverage is available before pickup or delivery:

• 2 yr – ${c.two}
• 3 yr – ${c.three}

Interested in either plan?`,
    overcome: (c) => `Understood, ${c.first}. We'll keep the included coverage. Reply before pickup or delivery if you'd like to revisit the options.`,
    nudge: (c) => `Hi ${c.first}, ${c.rep} from META PCs. Any questions about optional hardware coverage? 2 yr – ${c.two}; 3 yr – ${c.three}. Available before pickup or delivery.`,
    accept: (c) => `Thanks, ${c.first}! I'll request your selected plan. ${INVOICE(c)}`,
  },
  {
    id: "v5",
    name: "Investment",
    pitch: (c) => `Hi ${c.first}, this is ${c.rep} from META PCs. Since you're investing in ${c.build}, you may want to compare the hardware coverage options before pickup or delivery.

Optional hardware plans cover eligible repairs or replacements through our US-based team:

• 2 years – ${c.two}
• 3 years – ${c.three}

Would you like to compare either plan with your included coverage?`,
    overcome: (c) => `I get it, ${c.first}. The extra coverage isn't for everyone. We'll keep the included coverage, and I can answer any questions before pickup or delivery.`,
    nudge: (c) => `Hi ${c.first}, ${c.rep} from META PCs. Would it help to compare the optional 2-year and 3-year hardware plans with your included coverage before pickup or delivery?`,
    accept: (c) => `Thanks, ${c.first}! I'll request the coverage you selected. ${INVOICE(c)}`,
  },
  {
    id: "v6",
    name: "Peace of mind",
    pitch: (c) => `Hi ${c.first}! ${c.rep} from META PCs here. One quick thing before pickup or delivery.

Your build includes lifetime phone & email support. If you'd like longer hardware coverage for eligible repairs or replacements, our US team can help through these optional plans:

• 2 years – ${c.two}
• 3 years – ${c.three}

Would either plan be helpful for you?`,
    overcome: (c) => `Totally fair, ${c.first}. Your included coverage and lifetime support remain either way. Happy to answer any questions about the optional plans before pickup or delivery.`,
    nudge: (c) => `Hi ${c.first}, ${c.rep} from META PCs. Any questions about how the optional hardware plans differ from your included coverage? We can review them before pickup or delivery.`,
    accept: (c) => `Thanks, ${c.first}! I'll request the plan you chose. ${INVOICE(c)}`,
  },
  {
    id: "v8",
    name: "Tech recommendation",
    pitch: (c) => `Hi ${c.first}, it's ${c.rep} at META PCs. Before pickup or delivery, I can walk you through the optional hardware coverage for your gaming PC.

The plans cover eligible repairs or replacements for the CPU, GPU, RAM, motherboard, storage and PSU through our US team:

• 2 years – ${c.two}
• 3 years – ${c.three}

Would you like to review the terms for either plan?`,
    overcome: (c) => `Fair enough, ${c.first}. You can keep the included coverage. If you'd like to compare the covered components or repair terms before pickup or delivery, I'm happy to help.`,
    nudge: (c) => `Hi ${c.first}, ${c.rep} at META PCs. Any questions about the components or repairs covered by the optional 2-year and 3-year hardware plans? They can be added before pickup or delivery.`,
    accept: (c) => `Sounds good, ${c.first}! I'll request your chosen plan. ${INVOICE(c)}`,
  },
  {
    id: "v9",
    name: "Consultative",
    pitch: (c) => `Hi ${c.first}, ${c.rep} from META PCs! Quick question before pickup or delivery: how long are you planning to run this build?

If you plan to keep it for a while, these optional hardware plans provide longer coverage for eligible repairs or replacements through our US team:

• 2 years – ${c.two}
• 3 years – ${c.three}

Would either fit your plans, or would you prefer to keep the included coverage?`,
    overcome: (c) => `Makes sense, ${c.first}. We'll stay with the included coverage. If you'd like to revisit the optional plans before pickup or delivery, just let me know.`,
    nudge: (c) => `Hi ${c.first}, ${c.rep} from META PCs. Would it help to compare the optional 2-year and 3-year hardware plans with how long you expect to keep this build? Happy to help before pickup or delivery.`,
    accept: (c) => `Thanks, ${c.first}! I'll request the plan you chose. ${INVOICE(c)}`,
  },
  {
    id: "v10",
    name: "Concierge",
    pitch: (c) => `Good day ${c.first}, this is ${c.rep} with META PCs. Thank you again for your order.

Before pickup or delivery, you can choose optional hardware coverage for eligible repairs or replacements through our US-based team:

• 2-year coverage – ${c.two}
• 3-year coverage – ${c.three}

Please let me know if you'd like to review either plan or keep your included coverage.`,
    overcome: (c) => `Understood, ${c.first}, and thank you for letting me know. Please note that coverage can only be added before pickup or delivery, so should you change your mind, simply reply before then and I'll take care of it. Otherwise, we hope you thoroughly enjoy your new system.`,
    nudge: (c) => `Hello ${c.first}, ${c.rep} with META PCs. Please let me know if you have questions about the optional 2-year or 3-year hardware coverage before pickup or delivery.`,
    accept: (c) => `Thank you, ${c.first}. I'll request your selected coverage. ${INVOICE(c)}`,
  },
];

export const variantById = (id) => VARIANTS.find((v) => v.id === id) || null;

export const randomVariant = () =>
  VARIANTS[Math.floor(Math.random() * VARIANTS.length)];

// Stable pick for orders logged before A/B testing, so repeat copies keep one tone.
export function fallbackVariant(key) {
  let h = 0;
  for (const ch of String(key || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return VARIANTS[h % VARIANTS.length];
}

export const STAGE_FOR_STATUS = {
  declined: "overcome",
  none: "nudge",
  agreed: "accept",
};
export const stageFor = (status) => STAGE_FOR_STATUS[status] || "pitch";
export const STAGE_TITLE = {
  pitch: "Copy warranty pitch",
  overcome: "Copy soft follow-up (declined)",
  nudge: "Copy follow-up (no answer)",
  accept: "Copy invoice instructions (agreed)",
};

const WON = ["agreed", "paid"];
const LOST = ["declined", "none"];

// Win rate = (agreed + paid) / (agreed + paid + declined + no answer). Other statuses are pending/excluded.
export function variantStats(records) {
  const rows = VARIANTS.map((v, i) => ({
    id: v.id,
    n: i + 1,
    name: v.name,
    sent: 0,
    won: 0,
    lost: 0,
    followUps: 0,
    saves: 0,
    nudges: 0,
    revived: 0,
  }));
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  for (const e of records) {
    const r = byId[e.variant];
    if (!r || e.hidden) continue;
    r.sent++;
    if (WON.includes(e.status)) r.won++;
    if (LOST.includes(e.status)) r.lost++;
    if (e.overcome) {
      r.followUps++;
      if (WON.includes(e.status)) r.saves++;
    }
    if (e.nudged) {
      r.nudges++;
      if (WON.includes(e.status)) r.revived++;
    }
  }
  for (const r of rows) {
    const decided = r.won + r.lost;
    r.rate = decided ? r.won / decided : null;
  }
  return rows;
}
