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
    overcome: (c) => `Totally understand, ${c.first}. One thing worth knowing first: a lot of companies only pay out what you paid at purchase, not what the part costs when it fails. People end up with half the cost of a new GPU, RAM or SSD and a PC that won't boot. Our plans cover eligible repairs or replacements through our US-based team. The 3-year is ${c.three} and can only be added before pickup or delivery. Happy to answer any questions.`,
    nudge: (c) => `Hi ${c.first}, ${c.rep} from META PCs. Quick heads-up: optional hardware coverage for your build can only be added before pickup or delivery. 2 years is ${c.two}, 3 years is ${c.three}. Want me to set one up?`,
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
    overcome: (c) => `Totally fair, ${c.first}. Just so you have the full picture: many warranties only refund what the part cost at purchase, so when a GPU or SSD dies years later, people get maybe half of what a replacement costs and a PC that's a brick until they cover the rest. Our coverage handles eligible repairs or replacements through our US team instead. 3 years is ${c.three}, available until pickup or delivery. Want me to add it?`,
    nudge: (c) => `Hi ${c.first}, ${c.rep} from META PCs again. Your build is almost ready, and this is the last window to add longer hardware coverage: ${c.two} for 2 years or ${c.three} for 3. Want me to add one, or keep the included coverage?`,
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
    overcome: (c) => `No worries, ${c.first}! One quick tip before you decide ?? A lot of companies only pay back what you originally paid, not what a new GPU, RAM or SSD costs when it fails. Folks end up with half the money and a PC that won't turn on. Ours covers eligible repairs or replacements through our US team. 3 years is ${c.three}, and it has to be added before pickup or delivery. Just reply if you want it! ??`,
    nudge: (c) => `Hey ${c.first}! ${c.rep} at META PCs ?? Your new rig is almost ready! Last call to add extra hardware coverage: ${c.two} for 2 years or ${c.three} for 3. Want me to add one before pickup or delivery?`,
    accept: (c) => `Sounds good, ${c.first}! I'll request that plan for you. ${INVOICE(c)}`,
  },
  {
    id: "v4",
    name: "Concise",
    pitch: (c) => `Hi ${c.first}, ${c.rep} from META PCs. Optional hardware coverage is available before pickup or delivery:

• 2 yr – ${c.two}
• 3 yr – ${c.three}

Interested in either plan?`,
    overcome: (c) => `Understood, ${c.first}. Worth knowing: many warranties only pay what you paid at purchase, not today's replacement cost, which can leave you short on a GPU, RAM or SSD. Ours covers eligible repairs or replacements. 3 yr ? ${c.three}, available until pickup or delivery.`,
    nudge: (c) => `Hi ${c.first}, ${c.rep} from META PCs. Last chance for extra hardware coverage before pickup or delivery: 2 yr ? ${c.two}; 3 yr ? ${c.three}. Want one added?`,
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
    overcome: (c) => `I get it, ${c.first}. One thing to factor in: a lot of companies only pay out what you paid at purchase, not what the part costs at the time of the claim. People end up with half the cost of a new GPU, RAM or SSD and a system that won't run. Our plans cover eligible repairs or replacements through our US-based team, so ${c.build} stays protected. 3 years is ${c.three}, available until pickup or delivery.`,
    nudge: (c) => `Hi ${c.first}, ${c.rep} from META PCs. You've put real money into ${c.build}. For ${c.three}, 3 years of hardware coverage keeps it protected, or ${c.two} for 2 years. It can only be added before pickup or delivery. Want me to add it?`,
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
    overcome: (c) => `Totally fair, ${c.first}. Just one thing so there are no surprises later: many warranties only pay what the part cost when you bought it, so a failed GPU, RAM or SSD can leave you covering half the replacement and stuck with a PC that won't boot. Ours covers eligible repairs or replacements through our US team. 3 years is ${c.three}, available until pickup or delivery. Happy to answer any questions.`,
    nudge: (c) => `Hi ${c.first}, ${c.rep} from META PCs. Before your build heads out, want to lock in extra peace of mind? 2 years of hardware coverage is ${c.two}, 3 years is ${c.three}. It can only be added before pickup or delivery.`,
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
    overcome: (c) => `Fair enough, ${c.first}. A tech tip before you decide: many warranties only reimburse the original purchase price, not what a replacement GPU, RAM or SSD costs when it fails. That often covers about half, and the PC is down until you pay the rest. Our plans cover eligible repairs or replacements for the CPU, GPU, RAM, motherboard, storage and PSU through our US team. 3 years is ${c.three}, available until pickup or delivery.`,
    nudge: (c) => `Hi ${c.first}, ${c.rep} at META PCs. GPUs, SSDs and PSUs are the parts most likely to need service down the road. Want them covered? 2 years is ${c.two}, 3 years is ${c.three}, available before pickup or delivery.`,
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
    overcome: (c) => `Makes sense, ${c.first}. One question worth asking about any warranty: does it pay what you paid, or what the part costs when it fails? A lot of companies only pay the original price, so people get half the cost of a new GPU, RAM or SSD and a system that won't run. Ours covers eligible repairs or replacements through our US team. 3 years is ${c.three}, available until pickup or delivery.`,
    nudge: (c) => `Hi ${c.first}, ${c.rep} from META PCs. If you plan to keep this build for a few years, the 3-year hardware plan (${c.three}) covers most of that time. 2 years is ${c.two}. Either can be added before pickup or delivery. Want one?`,
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
    overcome: (c) => `Understood, ${c.first}, and thank you for letting me know. One consideration before you decide: many companies only pay out the original purchase price, not the cost of the part at the time of the claim. Customers are often left with half the cost of a new GPU, RAM or SSD and a system that won't operate. Our coverage provides eligible repairs or replacements through our US-based team. The 3-year plan is ${c.three} and can only be added before pickup or delivery. Simply reply and I'll take care of it.`,
    nudge: (c) => `Hello ${c.first}, ${c.rep} with META PCs. A courtesy reminder that optional hardware coverage can only be added before pickup or delivery: 2 years for ${c.two} or 3 years for ${c.three}. Please let me know if you'd like either plan added.`,
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
