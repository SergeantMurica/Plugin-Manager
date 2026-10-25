// Call prompts, voicemails, texts, emails and objection handlers for Pound list leads.
// Built from META PCs training: CTT, 5 Minute Qualification, 80/20, SWAT and the Golden Warranty Pitch.
// ctx: { first, rep, callback, amount, lender, order, two, three, priceKnown, persona, variant }

export const LEAD_TYPES = {
  financing: "Financing lead",
  warranty: "Warranty before pickup or delivery",
  abandoned: "Abandoned cart",
  helpdesk: "Help Desk",
  other: "Other lead",
};

export const WORDINGS = ["Direct", "Conversational", "Brief"];
const wording = (c, ...options) => options[c.variant || 0];
const hello = (c) => wording(c,
  `Hi ${c.first}, this is ${c.rep} from META PCs.`,
  `Hey ${c.first}, ${c.rep} here with META PCs.`,
  `Hi ${c.first} - ${c.rep} at META PCs here.`,
);
const approval = (c) => `${c.lender ? `${c.lender} ` : ""}financing approval${c.amount ? ` for up to ${c.amount}` : ""}`;
const orderRef = (c) => `your order${c.order ? ` ${c.order}` : ""}`;
const reachMe = (c) => c.callback ? `Call me at ${c.callback}` : "Call me back";

// ---------- warranty pricing (same tiers as the Warranty Upsell Tracker) ----------
const PRICES = {
  2: [
    [2500, 180],
    [4500, 240],
    [12000, 320],
  ],
  3: [
    [2500, 240],
    [4500, 320],
    [12000, 480],
  ],
};
const WATERCOOLED = { 2: 499, 3: 799 };
export function warrantyPrices(systemPrice, watercooled) {
  if (watercooled) return { two: `$${WATERCOOLED[2]}`, three: `$${WATERCOOLED[3]}`, known: true };
  const total = parseFloat(String(systemPrice || "").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(total)) return { two: "{2-year price}", three: "{3-year price}", known: false };
  if (total > 12000) return { two: "{manager to calculate}", three: "{manager to calculate}", known: false };
  const pick = (y) => `$${PRICES[y].find(([max]) => total <= max)[1]}`;
  return { two: pick(2), three: pick(3), known: true };
}

// ---------- Golden Warranty Pitch: customer-type angles ----------
export const PERSONAS = [
  { id: "", name: "General" },
  {
    id: "first",
    name: "First PC",
    line: (c) => `Since this is your first custom PC, you can call us if a part fails and we'll help with the repair.`,
  },
  {
    id: "parent",
    name: "Parent buying",
    line: (c) => `Some parents add coverage for extra peace of mind. If a part fails, you can call us for help with the repair.`,
  },
  {
    id: "high",
    name: "High-end build",
    line: (c) => `On a higher-end build, replacing a part like the graphics card can be expensive. The coverage is one way to plan for that.`,
  },
  {
    id: "issues",
    name: "Past PC issues",
    line: (c) => `Since you've had PC trouble before, this coverage may help with repair costs if a part fails again.`,
  },
  {
    id: "work",
    name: "Work / school",
    line: (c) => `Since you use it for work or school, it may be helpful to have support if a part fails.`,
  },
  {
    id: "financing",
    name: "Financing",
    line: (c) =>
      `Since you're financing, you can pay for the warranty separately instead of adding it to the financed amount.`,
  },
];
const personaLine = (c) => PERSONAS.find((p) => p.id === c.persona)?.line?.(c) || "";

function goldenPitch(c) {
  return [
    {
      title: "Coverage they already have",
      say: `Your system includes a 1-year hardware warranty covering the CPU, graphics card, RAM, motherboard, storage and power supply.`,
    },
    {
      title: "Lifetime service",
      say: `You also get lifetime service and labor from our US-based team. If anything comes up, you can contact us for help.`,
    },
    {
      title: "The extension",
      say: `You can extend the hardware coverage to 2 or 3 years. The 2-year plan is ${c.two}, and the 3-year plan is ${c.three}.${personaLine(c) ? ` ${personaLine(c)}` : ""}`,
    },
    {
      title: "GPU anchor",
      say: `For comparison, replacing a graphics card can cost several hundred dollars or more. The coverage is one way to plan for repair costs.`,
    },
    {
      title: "Ask what they prefer",
      say: `Would either plan be useful for you, or would you prefer to keep the included coverage?`,
      tip: "Give them time to answer.",
    },
  ];
}

// ---------- call scripts (rendered as steps) ----------
function baseCallScript(type, c) {
  if (type === "financing")
    return [
      {
        title: "Opener",
        say: `Hi ${c.first}, this is ${c.rep} from META PCs. I'm calling about your approval${c.lender ? ` through ${c.lender}` : ""}${c.amount ? ` for up to ${c.amount}` : ""}. Do you have a few minutes to talk about PC options?`,
        tip: "Ask a few questions about what they need, then suggest options that fit.",
      },
      {
        title: "1 · Use case",
        say: `What will you mainly use it for: gaming, streaming, work or school?`,
        tip: "Ask which games or apps they use to help narrow down the options.",
      },
      {
        title: "2 · System & resolution",
        say: `What games do you play, and what resolution is your monitor: 1080p, 1440p or 4K? Is there a PC you had in mind?`,
      },
      {
        title: "3 · Price range",
        say: `Your approval is for up to ${c.amount || "{approved amount}"}. Would you like to stay near that amount or spend less?`,
      },
      {
        title: "4 · Payment",
        say: `We can use ${c.lender || "your financing"} for the purchase. Is that still how you'd like to pay?`,
        tip: "If they need financing, offer to help them apply while you're on the phone.",
      },
      {
        title: "Recap their needs",
        say: `So you're looking for a PC for ___, around ${c.amount || "___"}, and you'd like to pay with ${c.lender || "___"}. Did I get that right? I have a couple of options to show you.`,
      },
      {
        title: "Suggest a couple of PCs",
        say: `Based on what you told me, I'd compare the ___ for ___ with the ___ for ___. Which sounds closer to what you need?`,
        tip: "Confirm stock and specifications before recommending a system. Don't assume their preferred model is unavailable.",
      },
      {
        title: "Availability",
        say: `Let me confirm the current availability and pickup or shipping options for that system.`,
        tip: "Only mention availability if you've confirmed it. A trade-in may help with the price.",
      },
      {
        title: "Ask what they think",
        say: `What do you think of the ___ and the ___?`,
      },
      {
        title: "Warranty (financing angle)",
        say: `One more option: you can extend the hardware coverage. The 2-year plan is ${c.two}, and the 3-year plan is ${c.three}. You can pay for it separately rather than adding it to your financing. Would you like to hear more?`,
      },
    ];
  if (type === "warranty")
    return [
      {
        title: "Opener",
        say: `${hello(c)} I'm calling about ${orderRef(c)}. Before pickup or delivery, I can walk you through the optional extended hardware coverage. Do you have a minute?`,
        tip: "The extended warranty can only be added before pickup or delivery.",
      },
      ...goldenPitch(c),
      {
        title: "If they say yes",
        say: `Sure, I'll request that for you. META PCs will email an invoice to the address on your order. Please review the coverage and price before paying.`,
        tip: "Add it to the Warranty Tool so the team has the update.",
      },
    ];
  if (type === "helpdesk")
    return [
      {
        title: "Opener",
        say: `Hi ${c.first}, this is ${c.rep} from META PCs. I'm following up on your request. Is now a good time to talk?`,
      },
      {
        title: "Understand the issue",
        say: `I understand. I'd like to get this sorted out. Can I ask a couple of questions so I know what happened?`,
        tip: "If they're upset, listen first. Ask only what you need to understand the issue.",
      },
      {
        title: "Discovery",
        say: `What happened? When did it start? Have you tried anything so far?`,
      },
      {
        title: "Specific commitment",
        say: `I'll ___. I'll get back to you by ___.`,
        tip: "Be clear about what you'll do and when you'll follow up. Add it to the ticket.",
      },
      {
        title: "Confirm the next step",
        say: `Does that next step work for you? Is there anything about the issue we haven't covered?`,
      },
    ];
  if (type === "abandoned")
    return [
      {
        title: "Opener",
        say: `${hello(c)} I'm following up on the PC you left in your cart. Were you still considering it, or did something get in the way at checkout?`,
        tip: "A cart is not a placed order. Don't promise availability, a saved price, discounts or financing approval.",
      },
      { title: "Understand the hold-up", say: `Was it a question about the build, the total price, payment options or checkout itself?` },
      { title: "Check the fit", say: `What will you mainly use the PC for, and which games or apps matter most? What monitor resolution do you use?` },
      { title: "Budget and payment", say: `What budget are you aiming for? Would you like to compare builds or go over the available payment options?` },
      { title: "Help with checkout", say: `I can check the current price and availability, answer questions and help you through checkout if you're ready. What would help most?` },
      { title: "Agree on the next step", say: `Would you like me to send the details, walk through it now or follow up another day?` },
    ];
  return [
    {
      title: "Opener",
      say: `Hi ${c.first}, this is ${c.rep} from META PCs. I'm following up on the PC you were looking at. Do you have a few minutes to talk?`,
    },
    { title: "1 · Use case", say: `What are you mainly going to use it for?` },
    { title: "2 · System & resolution", say: `What games or apps do you use, and what resolution is your monitor: 1080p, 1440p or 4K?` },
    { title: "3 · Price range", say: `What price range were you hoping to stay around?` },
    { title: "4 · Payment", say: `How were you thinking of paying: card, cash or financing? If you'd like to apply for financing, I can help you with that.` },
    { title: "Recap", say: `So you're looking for a PC for ___, around ___, and you'd like to pay with ___. Did I get that right?` },
    { title: "Ask what they think", say: `What do you think of the ___?` },
  ];
}

// Keep each alternative aligned with the same call step and intent.
const CALL_ALTS = {
  financing: [
    (c) => [`${hello(c)} I wanted to help with your ${approval(c)}. Is now a good time to compare PC options?`, `${hello(c)} Have a minute to talk PCs and your ${approval(c)}?`],
    () => ["What would you like this PC to do for you day to day?", "Mostly gaming, work, streaming or a mix?"],
    () => ["Which games or programs matter most, and what monitor will you use? Have you picked out a build?", "Any must-run games or apps? What resolution and build are you considering?"],
    (c) => [`What budget feels comfortable${c.amount ? ` within your ${c.amount} approval` : ""}? You don't need to use the full amount.`, "What total would you like to stay under?"],
    (c) => [`Are you planning to use ${c.lender || "financing"}, or would you prefer another payment method?`, "Still planning to finance the PC?"],
    () => ["Let me check I've got it: ___ for ___, with a budget of ___ and payment through ___. Anything to change?", "So: ___ use, ___ budget, ___ payment. Sound right?"],
    () => ["I'd look at ___ and ___. Here's how each fits what you described: ___. Which would you like to explore?", "Two builds worth comparing are ___ and ___ because ___. Thoughts?"],
    () => ["Before we go further, I'll check stock and the pickup or shipping details for you.", "I'll check availability and fulfillment options first."],
    () => ["Which option feels closer to what you're after, and is anything missing?", "Which build is the better fit?"],
    (c) => [`There's also optional extended hardware coverage: 2 years for ${c.two} or 3 years for ${c.three}. It can be paid separately from financing. Want to compare the plans?`, `Interested in optional hardware coverage? Two years is ${c.two}; three is ${c.three}, payable separately.`],
  ],
  warranty: [
    (c) => [`${hello(c)} Before you receive ${orderRef(c)}, would you like to hear how the optional extended hardware coverage works?`, `${hello(c)} Have a minute to discuss optional coverage for ${orderRef(c)} before pickup or delivery?`],
    () => ["You already have a year of hardware coverage for the CPU, GPU, RAM, motherboard, storage and power supply.", "Your PC includes 1 year of hardware coverage for its covered components."],
    () => ["Lifetime service and labor from our US-based team are included too, so you can reach out when you need help.", "Lifetime service and labor from our US-based team are also included."],
    (c) => [`If you'd like longer hardware coverage, 2 years is ${c.two} and 3 years is ${c.three}.${personaLine(c) ? ` ${personaLine(c)}` : ""}`, `Optional hardware coverage: 2 years for ${c.two}, or 3 for ${c.three}.${personaLine(c) ? ` ${personaLine(c)}` : ""}`],
    () => ["A replacement graphics card can be a substantial expense. The plan is an optional way to prepare for covered repairs.", "The plan can help with covered repair costs, including a failed graphics card."],
    () => ["Does either plan feel useful for you, or would you rather keep the included coverage?", "Interested in 2 years, 3 years or the included coverage?"],
    () => ["I'll send the request so the team can email an invoice to the address on your order. Please check the terms and price before paying.", "I'll request the invoice. Review the coverage and price in the email before paying."],
  ],
  abandoned: [
    (c) => [`${hello(c)} I noticed you were looking at a PC but didn't finish checkout. Any questions I can help with?`, `${hello(c)} Still interested in the PC in your cart? Happy to help with questions or checkout.`],
    () => ["What made you pause: choosing the right build, cost, payment or a checkout problem?", "What held you up at checkout?"],
    () => ["Tell me what you'd use it for and the games or apps you care about. Do you know your monitor resolution?", "What will you run, and at what monitor resolution?"],
    () => ["Where would you like the total to land? We can look at other builds or payment options if that helps.", "Have a budget in mind? Want to compare builds or payment options?"],
    () => ["If you're still interested, I can verify today's pricing and stock, then help with the next step. Where should we start?", "Want me to check the current price and availability, or help with checkout?"],
    () => ["What works best: details by message, help right now or a check-in later?", "Send details, talk now or follow up later?"],
  ],
  helpdesk: [
    (c) => [`${hello(c)} I'm checking in on your request. Do you have a moment to go over it together?`, `${hello(c)} Is now a good time to follow up on your request?`],
    () => ["I'd like to understand what happened so we can choose the right next step. Can you walk me through it?", "Let's work out what happened and the next step."],
    () => ["When did you first notice it, what were you doing and what have you already tried?", "When did it start, and what have you tried?"],
    () => ["My next step is ___. I'll update you by ___. Is that a good way to reach you?", "I'll ___ and update you by ___."],
    () => ["Before we wrap up, have I understood the issue and the follow-up you need?", "Anything else about this issue before we finish?"],
  ],
  other: [
    (c) => [`${hello(c)} Are you still comparing PCs? I can help narrow things down if you have a minute.`, `${hello(c)} Still looking for a PC? Have a minute to chat?`],
    () => ["What would a typical day with this PC look like for you?", "What's the main use for the PC?"],
    () => ["Which games or programs will you run, and what monitor are you pairing it with?", "Which games, apps and monitor resolution?"],
    () => ["What budget would feel comfortable for you?", "What total would you like to stay under?"],
    () => ["Do you have a preferred way to pay? I can explain the available options, including how to apply for financing.", "Any preferred payment method? I can explain the options."],
    () => ["Let me make sure: ___ use, around ___ total, paying with ___. Anything I've missed?", "So: ___ use, ___ budget, ___ payment. Correct?"],
    () => ["Does the ___ fit what you're after, or should we compare something else?", "How does the ___ look to you?"],
  ],
};

export function callScript(type, c) {
  const steps = baseCallScript(type, c);
  const alts = CALL_ALTS[type] || CALL_ALTS.other;
  return steps.map((step, i) => ({
    ...step,
    say: wording(c, step.say, ...alts[i](c)),
  }));
}

// ---------- voicemail ----------
export function voicemail(type, c) {
  const reasons = {
    financing: [`I'm following up on your ${approval(c)} and can help you compare PC options.`, "I'd be happy to help you find a PC that fits your financing and budget.", "I'm checking in about your PC financing options."],
    warranty: [`I'm calling about optional extended hardware coverage for ${orderRef(c)} before pickup or delivery.`, `Before you receive ${orderRef(c)}, I can walk you through the optional extended hardware coverage.`, `I'm following up on optional coverage for ${orderRef(c)} before pickup or delivery.`],
    abandoned: ["I'm following up on the PC you left in your cart. I can help with build questions, payment options or checkout.", "If you're still considering the PC in your cart, I'm happy to answer questions and help with the next step.", "Still considering the PC in your cart? I can help with questions or checkout."],
    helpdesk: ["I'm following up on your support request and would like to go over the next step with you.", "I'd like to check in on your request and see how we can help.", "I'm checking in on your support request."],
    other: ["I'm following up on the PC you were looking at and can help you compare options.", "If you're still looking for a PC, I'd be happy to help narrow down the choices.", "Still looking for a PC? I can help with options."],
  };
  return `${hello(c)} ${wording(c, ...(reasons[type] || reasons.other))} ${reachMe(c)} when you have a chance. Thanks!`;
}

// ---------- texts (CTT: text to get past scam filters and get them on a call) ----------
export const TEXTS = {
  financing: [
    {
      id: "intro",
      name: "After a call",
      body: (c) =>
        `${hello(c)} ${wording(c,
          `I'm reaching out about your ${approval(c)}. Would you like help choosing a PC, or is there a good time for a quick call?`,
          `Want a hand finding a PC that fits your ${approval(c)}? Tell me what you'll use it for and I can narrow down some options.`,
          `Want to compare PCs for your ${approval(c)}? Reply here or let me know a good time to call.`,
        )}`,
    },
    {
      id: "use",
      name: "Ask what they need",
      body: (c) =>
        `${hello(c)} ${wording(c,
          "What will you mainly use the PC for? Send me your games or apps, budget and monitor resolution if you know it, and I can suggest a few builds.",
          "Let's find a good fit. What do you play or work on, and what monitor will you use? A budget helps me narrow it down too.",
          "Which games or apps, monitor resolution and budget should I keep in mind for your PC?",
        )}`,
    },
    {
      id: "follow",
      name: "Follow-up",
      body: (c) =>
        `${hello(c)} ${wording(c,
          "Following up on your PC search. Would a few recommendations help, or would you prefer a call?",
          "How's the PC search going? Happy to compare builds or answer questions about the payment options.",
          "Still comparing PCs? I can send options or set up a quick call.",
        )}`,
    },
    {
      id: "last",
      name: "Final follow-up",
      body: (c) =>
        `${hello(c)} ${wording(c,
          "I'll leave the next step with you. If you'd still like help choosing a PC or reviewing financing options, reply here. If plans changed, no problem.",
          "No pressure if now isn't the right time. If you want to revisit a PC later, just reply and I'll help with the options.",
          "I'll leave it with you for now. Reply whenever you'd like help with a PC.",
        )}`,
    },
  ],
  warranty: [
    {
      id: "call",
      name: "Ask for a call",
      body: (c) =>
        `${hello(c)} ${wording(c,
          `I'm reaching out about optional extended hardware coverage for ${orderRef(c)} before pickup or delivery. Would you prefer the details here or a quick call?`,
          `Before you receive ${orderRef(c)}, would you like to compare the optional warranty plans? I can explain them here or by phone.`,
          `Want details on optional hardware coverage for ${orderRef(c)} before pickup or delivery?`,
        )}`,
    },
    {
      id: "pitch",
      name: "Warranty details",
      body: (c) =>
        `${hello(c)} ${wording(c, `Thanks again for your order.

Your build includes a 1-year hardware warranty, plus lifetime service and labor. You can extend the hardware coverage:

• 2-year: ${c.two}
• 3-year: ${c.three}

The extended coverage can only be added before pickup or delivery. Would you like more information about either plan?`,
          `If you'd like longer hardware coverage for ${orderRef(c)}, the 2-year plan is ${c.two} and the 3-year plan is ${c.three}. Your included coverage is 1 year of hardware warranty plus lifetime service and labor. The extension is optional and must be added before pickup or delivery. Want to compare the plans?`,
          `Optional hardware coverage for ${orderRef(c)}: 2 years for ${c.two}, or 3 for ${c.three}. Your included 1-year hardware warranty and lifetime service and labor remain either way. Add extended coverage before pickup or delivery. Interested in either plan?`,
        )}`,
    },
    {
      id: "nudge",
      name: "Follow-up",
      body: (c) =>
        `${hello(c)} ${wording(c,
          `Following up on optional coverage for ${orderRef(c)}: 2 years for ${c.two} or 3 for ${c.three}, available before pickup or delivery. Any questions I can answer?`,
          `Have you had a chance to consider the warranty options? It's ${c.two} for 2 years or ${c.three} for 3. They can only be added before pickup or delivery, and keeping the included coverage is fine too.`,
          `Any questions about extending the hardware coverage? Two years: ${c.two}; three: ${c.three}. Optional, before pickup or delivery.`,
        )}`,
    },
  ],
  abandoned: [
    {
      id: "call",
      name: "Cart check-in",
      body: (c) => `${hello(c)} ${wording(c,
        "I'm following up on the PC you left in your cart. Any questions about the build, payment options or checkout that I can help with?",
        "Still thinking about the PC in your cart? If something held you up, I'm happy to help you work through it.",
        "Still interested in the PC in your cart? Happy to help with questions or checkout.",
      )}`,
    },
    {
      id: "fit",
      name: "Help choose a build",
      body: (c) => `${hello(c)} ${wording(c,
        "If you're not sure the PC in your cart is the right fit, send me your games or apps, monitor resolution and budget. I can help compare builds.",
        "Want a second opinion on the build you picked? Tell me what you'll use it for and what you'd like to spend, and we can compare options.",
        "Want help comparing builds? Send your main games or apps, monitor resolution and budget.",
      )}`,
    },
    {
      id: "checkout",
      name: "Checkout help",
      body: (c) => `${hello(c)} ${wording(c,
        "Did you run into a problem at checkout? Let me know what happened and I can help with the next step. Please don't send card or payment details by text.",
        "If checkout gave you trouble, tell me where you got stuck. I can help check the next step; keep card and payment details out of messages.",
        "Checkout trouble? Tell me where it stopped, without sending card or payment details, and I'll help.",
      )}`,
    },
    {
      id: "follow",
      name: "Follow-up",
      body: (c) => `${hello(c)} ${wording(c,
        "Checking back on your PC search. Would you like help revisiting your cart, comparing builds or reviewing payment options?",
        "How's the PC search going? If you're still considering that build, I can check the current price and availability for you.",
        "Still considering a PC? I can check current pricing and stock or help compare options.",
      )}`,
    },
    {
      id: "last",
      name: "Final follow-up",
      body: (c) => `${hello(c)} ${wording(c,
        "I'll leave the next step with you. If you'd like to revisit your cart or compare another PC, reply here and I'll help. If plans changed, no problem.",
        "No worries if now isn't the right time for a PC. Whenever you're ready to look again, reply here and we can pick it back up.",
        "I'll leave it with you for now. Reply if you'd like help revisiting your cart.",
      )}`,
    },
  ],
  helpdesk: [
    {
      id: "call",
      name: "Ask for a call",
      body: (c) =>
        `${hello(c)} ${wording(c,
          "I'm following up on your support request. What's a good time and number to reach you so we can go over the next step?",
          "I'd like to check in on your request. Would you prefer to share an update here or arrange a call?",
          "Following up on your request. What time and number work best for a call?",
        )}`,
    },
    {
      id: "follow",
      name: "Follow-up",
      body: (c) => `${hello(c)} ${wording(c,
        "Do you still need help with your request? Send a quick update or a good time to call, and we can plan the next step.",
        "Checking in to see how things are going. If the issue is still happening, let me know what's changed and when we can talk.",
        "Still need help? Reply with an update or a good time to call.",
      )}`,
    },
  ],
  other: [
    {
      id: "call",
      name: "Ask for a call",
      body: (c) =>
        `${hello(c)} ${wording(c,
          "I'm following up on the PC you were looking at. Would a few recommendations help, or is there a good time to call?",
          "Are you still comparing PCs? Tell me what you're after and I can help narrow down the choices.",
          "Still looking for a PC? I can send options or arrange a quick call.",
        )}`,
    },
    {
      id: "follow",
      name: "Follow-up",
      body: (c) => `${hello(c)} ${wording(c,
        "Checking in on your PC search. Send your main games or apps and budget, and I can suggest a few options.",
        "How's the search going? Happy to compare builds if you let me know your budget and what you'll use the PC for.",
        "Want a few PC suggestions? Send your budget and main games or apps.",
      )}`,
    },
  ],
};

// ---------- emails ----------
const SIGN = (c) => `\n\nThanks,\n${c.rep}\nMETA PCs${c.callback ? `\n${c.callback}` : ""}`;
const emailBody = (c, ...bodies) => `${hello(c)}\n\n${wording(c, ...bodies)}${SIGN(c)}`;
export const EMAILS = {
  financing: [
    {
      id: "intro",
      name: "Approval follow-up",
      subject: (c) => wording(c, `PC options for your ${c.lender ? `${c.lender} ` : ""}approval${c.amount ? ` (${c.amount})` : ""}`, "Let's find a PC that fits your needs", "Help with your PC options"),
      body: (c) =>
        emailBody(c, `I'm following up on your ${approval(c)}.

If you'd like help comparing PCs, reply with:

• What you'll mainly use it for (gaming, streaming, work/school)
• The games or apps you use and your monitor resolution (1080p, 1440p or 4K)
• The best number and time to reach you

I'll help narrow down the options and confirm current availability.`,
          `Want a hand choosing a PC for your ${approval(c)}? Tell me what you'll use it for, your budget and your monitor resolution if you know it. I'll help compare builds. If a call is easier, send a good number and time to reach you.`,
          `Would you like PC suggestions for your ${approval(c)}? Reply with your main games or apps, budget and monitor resolution. Or send a good time and number for a call.`),
    },
    {
      id: "options",
      name: "PC recommendations",
      subject: (c) => wording(c, "Two PC options to compare", "Which build feels like a better fit?", "Your PC comparison"),
      body: (c) =>
        emailBody(c, `Based on what you told me, here are two systems to consider:

1. ___: ___ (good for ___ at ___)
2. ___: ___

I'll confirm current stock, pricing and payment details before you decide.

Do either of these look like a good fit?`,
          `These are the two builds I'd compare for your needs:\n\n1. ___ - ___\n2. ___ - ___\n\nThe main trade-off is ___. Which matters more to you? I can verify current pricing, availability and payment details for your preferred option.`,
          `Two builds to compare:\n\n1. ___: ___\n2. ___: ___\n\nWhich do you prefer? I'll verify pricing, stock and payment details before you decide.`),
    },
  ],
  warranty: [
    {
      id: "pitch",
      name: "Warranty before pickup or delivery",
      subject: (c) => wording(c, `Optional warranty for your PC${c.order ? ` (${c.order})` : ""}`, `Coverage options for ${orderRef(c)}`, "A quick look at optional hardware coverage"),
      body: (c) =>
        emailBody(c, `Before pickup or delivery, you have the option to extend the hardware coverage for ${orderRef(c)}.

Your system already includes:
• 1-year hardware warranty (CPU, graphics card, RAM, motherboard, storage and power supply)
• Lifetime service and labor from our US-based team

You can extend the hardware coverage:
• 2-year: ${c.two}
• 3-year: ${c.three}

The extended coverage can only be added before pickup or delivery. Reply if you'd like more information or want to add a plan.`,
          `Would you like a little extra hardware coverage for ${orderRef(c)}?\n\nYour PC already includes a 1-year hardware warranty and lifetime service and labor from our US-based team. The optional extension is ${c.two} for 2 years or ${c.three} for 3 years.\n\nIt can only be added before pickup or delivery. Happy to explain either plan, and keeping the included coverage is fine too.`,
          `Optional hardware coverage for ${orderRef(c)}:\n\n2 years: ${c.two}\n3 years: ${c.three}\n\nYour included coverage is a 1-year hardware warranty plus lifetime service and labor. Extended coverage must be added before pickup or delivery. Reply with any questions or the plan you'd like to review.`),
    },
  ],
  abandoned: [
    {
      id: "cart",
      name: "Cart check-in",
      subject: (c) => wording(c, "Need a hand with the PC in your cart?", "Any questions about your PC build?", "Help with your META PCs cart"),
      body: (c) => emailBody(c,
        "I'm following up on the PC you left in your cart. If you have questions about the build, payment options or checkout, I'm happy to help.\n\nReply with what held you up, or send a good time and number for a call. I can check the current price and availability before you decide.",
        "Still thinking about that PC? If you're weighing up the build or ran into a checkout issue, let me know where you got stuck. We can compare options or walk through the next step together.\n\nIf a call is easier, send a good time and number to reach you. I'll verify current pricing and stock rather than assume the cart is unchanged.",
        "Still interested in the PC in your cart? Reply with any build or checkout questions, or a good time and number for a call. I can confirm current pricing and availability."),
    },
    {
      id: "fit",
      name: "Compare builds",
      subject: (c) => wording(c, "Let's check the right PC for you", "Want a second opinion on your build?", "Help comparing PCs"),
      body: (c) => emailBody(c,
        "If you're not sure the PC in your cart is the right fit, send me:\n\n- Your main games or apps\n- Your monitor resolution, if known\n- Your budget\n\nI can help compare builds and check current pricing and availability.",
        "Choosing a PC can take some research. Tell me what you'll play or work on, which monitor you use and what you'd like to spend. I'll help compare the build you picked with other options, with current pricing and availability checked before you decide.",
        "Want help comparing builds? Reply with your main games or apps, monitor resolution and budget. I'll help narrow it down and verify current prices and stock."),
    },
    {
      id: "follow",
      name: "Follow-up",
      subject: (c) => wording(c, "Checking in on your PC search", "Still considering a META PC?", "Here if you need PC help"),
      body: (c) => emailBody(c,
        "Checking back to see whether you'd like help revisiting your cart. I can answer questions, compare builds or help with checkout.\n\nIf your plans changed, no problem. I'll leave the next step with you.",
        "How's the PC search going? If you're still interested, we can pick up where you left off and check today's options. If now isn't the right time, no worries - reply whenever you're ready.",
        "Still considering a PC? Reply if you'd like help with your cart or another build. If plans changed, no problem."),
    },
  ],
  helpdesk: [
    {
      id: "follow",
      name: "Follow-up",
      subject: (c) => wording(c, "Following up on your META PCs request", "Let's plan the next step on your request", "META PCs support check-in"),
      body: (c) =>
        emailBody(c,
          "I'm following up on your support request. Please reply with a brief update on the issue and the best number and time to reach you so we can work out the next step.",
          "I'd like to check how things are going with your request. Is the issue still happening, and has anything changed? Send an update or a good time and number for a call, and we can go over it together.",
          "Do you still need help with your request? Reply with an update and a good time and number for a call."),
    },
  ],
  other: [
    {
      id: "follow",
      name: "Follow-up",
      subject: (c) => wording(c, `${c.first}, still looking for a new PC?`, "Want a hand comparing PCs?", "Help with your PC search"),
      body: (c) =>
        emailBody(c,
          "I'm following up on the PC you were looking at. Reply with your main games or apps, budget and monitor resolution if you know it, and I can suggest a few options. If you'd prefer a call, send a good time and number to reach you.",
          "How's the PC search going? If you'd like a second opinion, tell me what you'll use it for and what you'd like to spend. Happy to compare builds by email or find a time to talk.",
          "Still comparing PCs? Send your main games or apps and budget, or a good time and number for a call. I'll help narrow down the options."),
    },
  ],
};

// ---------- objections ----------
const WARRANTY_OBJECTIONS = [
  {
    q: "I don't need it",
    a: (c) => wording(c, `Absolutely, it's optional. You can keep the included coverage. If you want to compare, I can explain what's covered before pickup or delivery.`, "No problem. Your included coverage stays in place either way. Any questions before we wrap up?", "Understood. We'll stick with the included coverage."),
  },
  {
    q: "Let me think about it",
    a: (c) => wording(c, "Of course. Any questions about the cost or coverage I can clear up? Extended coverage can only be added before pickup or delivery.", "Take your time. Happy to explain the plans if that helps; just keep in mind they must be added before pickup or delivery.", "Sure. Any questions? It can only be added before pickup or delivery."),
  },
  {
    q: "Too expensive",
    a: (c) => wording(c, `I understand. The 2-year plan is ${c.two}, but the extension isn't right for everyone. Want to compare it with the included coverage?`, `That makes sense. We can review what ${c.two} covers for 2 years, or you can keep the included warranty.`, "Understood. You can keep the included coverage; the extension is optional."),
  },
  {
    q: "My parts already have warranties",
    a: (c) => wording(c, "That's right. Manufacturer coverage is another option. I can help compare its terms with coverage through META PCs if that would help.", "Good point. The terms and service process can differ. Let's check the specific coverage rather than assume they're the same.", "Yes. Want to compare the terms and service process?"),
  },
  {
    q: "I fix PCs myself",
    a: (c) => wording(c, "That makes sense. You may prefer to handle repairs yourself. I can go over what the plan covers if you'd like to compare.", "Totally fair. The plan is optional; we can compare it with handling repairs yourself if that's useful.", "Understood. No pressure to add coverage."),
  },
  {
    q: "I've never had an issue",
    a: (c) => wording(c, `Glad to hear it. This is optional protection for covered failures, not a prediction of problems. Want to review the 2-year plan at ${c.two}?`, "That's great. You can keep the included coverage, or we can compare the extended plans if you'd like.", "That's good. Would you like to compare coverage or keep what's included?"),
  },
];

export const OBJECTIONS = {
  financing: [
    {
      q: "I wanted a specific system",
      a: (c) => wording(c, "Let me check that model's availability first. What drew you to it: performance, price or the look? If needed, we can compare similar builds.", "Which model did you have in mind, and what stood out? I'll check it before suggesting alternatives.", "Which model? I'll check stock and any alternatives that fit."),
    },
    {
      q: "It's over my approval",
      a: (c) => wording(c, `We can compare a lower-priced build${c.amount ? ` within your ${c.amount} approval` : ""} or check whether a trade-in is an option. What budget feels comfortable?`, "Let's work back from the total you want to spend and find a build that fits. Would you like to compare a few?", "What total works for you? We can look at lower-priced builds."),
    },
    {
      q: "I need to think about it",
      a: (c) => wording(c, "Sure. Is there anything you'd like me to clarify about the PC or the payment?", "Of course. Would a comparison or a breakdown of the payment details help?", "Absolutely. Any questions before you think it over?"),
    },
    {
      q: "I'm not ready yet",
      a: (c) => wording(c, "No problem. When are you hoping to buy? If you'd like a follow-up, what's a good day and number to reach you?", "That's fine. Would you prefer I check in another day, or leave the next step with you?", "No rush. Want a follow-up later, or would you rather reach out?"),
    },
    {
      q: "I don't want the warranty (financing)",
      a: (c) => wording(c, "That's fine. The extended warranty is optional. We can focus on the PC.", "No problem at all. Let's keep working on the build and payment details.", "Understood. We'll stick with the included coverage."),
    },
  ],
  warranty: WARRANTY_OBJECTIONS,
  abandoned: [
    {
      q: "I was just browsing",
      a: (c) => wording(c, "No problem. Would a build comparison help, or would you rather reach out when you're ready?", "That's completely fine. Happy to answer a question if one comes up; no need to decide now.", "No problem. I'm here if you need help later."),
    },
    {
      q: "The total was too high",
      a: (c) => wording(c, "What total were you aiming for? We can compare lower-priced builds or review the available payment options without assuming financing approval.", "Let's start with a budget you're comfortable with and see which builds fit. What matters most for performance?", "What budget works for you? We can compare builds or payment options."),
    },
    {
      q: "Checkout didn't work",
      a: (c) => wording(c, "Where did checkout stop, and did you see an error? Please don't share card or payment details. I'll help work out the next step.", "Tell me which step caused trouble and any error message, without card or payment details. We can go from there.", "Which checkout step failed? Any error message? Please leave out payment details."),
    },
    {
      q: "Can you offer a discount?",
      a: (c) => wording(c, "I can check current pricing and any available promotions, but I can't promise a discount. What's your target budget?", "Happy to check what's currently available and compare options. I don't want to promise an offer before confirming it.", "I'll check current offers, but can't promise a discount."),
    },
    {
      q: "I already bought / I'm not interested",
      a: (c) => wording(c, "Thanks for letting me know. I'll note that you're no longer looking.", "Understood, and thanks for the update. I'll record it so the team has the context.", "Got it. I'll update the lead. Thanks for letting me know."),
    },
  ],
  helpdesk: [
    {
      q: "Customer is upset",
      a: (c) => wording(c, "I can see why that's frustrating. Let me make sure I've understood the issue. My next step is ___, and I'll update you by ___.", "I'm sorry this has been frustrating. Here's what I can do next: ___. I'll follow up by ___.", "I hear you. I'll ___ and update you by ___."),
    },
  ],
  other: [
    {
      q: "Just browsing",
      a: (c) => wording(c, "Sure. What will you mainly use it for? I can send a few options for you to compare.", "No rush. Would a few recommendations help, or would you rather reach out later?", "No problem. Want a few options to compare?"),
    },
    {
      q: "Too expensive",
      a: (c) => wording(c, "What price range are you looking for? We can compare builds and review whether financing or a trade-in might be an option.", "Let's find a total you're comfortable with. What do you most need the PC to handle?", "What budget fits? We can look at lower-priced options."),
    },
  ],
};
