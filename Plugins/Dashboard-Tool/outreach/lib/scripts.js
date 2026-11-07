// Text and email templates for Dash outreach.
// ctx: { first, rep, callback, lender, order, two, three, variant }

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
// Keep approval amounts out of outreach copy; discuss the customer's preferred budget instead.
const approval = (c) => `${c.lender ? `${c.lender} ` : ""}financing approval`;
const orderRef = (c) => `your order${c.order ? ` ${c.order}` : ""}`;

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
export function warrantyPrices(systemPrice, watercooled, systems = "") {
  const pcs = String(systems).split(",").map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (pcs.length > 1) {
    const quotes = pcs.map((price) => warrantyPrices(price, watercooled));
    if (quotes.some((quote) => !quote.known))
      return { two: "{manager to calculate}", three: "{manager to calculate}", known: false };
    const total = (key) => quotes.reduce((sum, quote) => sum + Number(quote[key].slice(1)), 0);
    const who = pcs.length === 2 ? "both PCs" : `all ${pcs.length} PCs`;
    return { two: `$${total("two")} for ${who}`, three: `$${total("three")} for ${who}`, known: true };
  }
  if (watercooled) return { two: `$${WATERCOOLED[2]}`, three: `$${WATERCOOLED[3]}`, known: true };
  const total = parseFloat(String(systemPrice || "").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(total)) return { two: "{2-year price}", three: "{3-year price}", known: false };
  if (total > 12000) return { two: "{manager to calculate}", three: "{manager to calculate}", known: false };
  const pick = (y) => `$${PRICES[y].find(([max]) => total <= max)[1]}`;
  return { two: pick(2), three: pick(3), known: true };
}

// ---------- texts (clear, conversational follow-ups) ----------
export const TEXTS = {
  financing: [
    {
      id: "intro",
      name: "Initial check-in",
      body: (c) =>
        `${hello(c)} ${wording(c,
          `I'm following up on your ${approval(c)} to help with the PC side of things. What will you mainly use it for, and is there a build you've been looking at? I can compare options around a budget you're comfortable with.`,
          "Choosing a PC can get overwhelming with all the different specs. Tell me what you'll play or work on and whether a build has caught your eye. I'll help narrow down a few options and explain the differences. Where are you at in your search?",
          "I'm checking in on your PC inquiry. What games or programs do you need it to run? I can help compare builds and review payment options. Reply here, or let me know a good time for a quick call.",
        )}`,
    },
    {
      id: "use",
      name: "Ask what they need",
      body: (c) =>
        `${hello(c)} ${wording(c,
          "To recommend a good fit, I'd like to know your main games or apps, the budget you'd like to stay within, and your monitor resolution if you know it. I can explain which specs matter for your setup. What will you use it for most?",
          "Let's start with what you need the PC to do rather than just picking parts. What do you play or work on, and will you be streaming too? If you know your monitor resolution and budget, send those over and I'll help compare builds.",
          "What are your main games or apps, and what budget feels comfortable? Your monitor resolution helps too, if you know it. I'll use that to narrow down builds and explain the trade-offs.",
        )}`,
    },
    {
      id: "follow",
      name: "Follow-up",
      body: (c) =>
        `${hello(c)} ${wording(c,
          "I'm checking back on your PC search. Are you still choosing a build, or is there a question about specs or payment holding things up? Tell me where you're stuck and I can help with the next step.",
          "How's the PC search going? If you're deciding between a couple of builds, send me the ones you're considering and what matters most to you. We can compare them here, or find a good time to talk.",
          "Still looking at PC options? Send me a build you're considering or your main games and budget. I can help compare the specs and check current availability before you decide.",
        )}`,
    },
    {
      id: "last",
      name: "Final follow-up",
      body: (c) =>
        `${hello(c)} ${wording(c,
          "I'll leave the next step with you for now. If you'd like help choosing a build or understanding the payment options, reply with where you're at and we'll pick it up from there. If you're no longer looking, let me know and I'll update the lead.",
          "No worries if a new PC isn't on the list right now. If you decide to revisit it, reply with a build you like or what you need it to do and I'll help compare options. If your plans have changed, just let me know.",
          "I'll leave it with you for now. Reply if you'd like help comparing a build or reviewing payment options. If you're no longer shopping, let me know so I can update the lead.",
        )}`,
    },
    {
      id: "compare",
      name: "Compare a specific build",
      body: (c) => `${hello(c)} ${wording(c,
        "Have you found a PC you like? Send me the model and what you'll use it for. I can explain how it fits your needs, compare a similar build and check the current payment options before you decide.",
        "If a build has caught your eye, send it over along with your main games or apps. We can talk through what you're getting and where another option might make more sense. Which PC are you leaning toward?",
        "Which PC are you considering? Send the model and your main games or apps. I can help compare the specs, check availability and review payment options.",
      )}`,
    },
    {
      id: "timing",
      name: "Buying timeline",
      body: (c) => `${hello(c)} ${wording(c,
        "Are you hoping to get a PC soon, or still working out what you need? If you have a target date and budget, I can check which builds and pickup or shipping options fit. What timeline do you have in mind?",
        "When would you like to have your new PC? That helps me narrow down what to check for you, especially if you're planning around a gift, school or a setup upgrade. Let me know your timing and what you need it to run.",
        "What timeline do you have in mind for a PC? Send your target date, budget and main use, and I can check current build and pickup or shipping options.",
      )}`,
    },
  ],
  warranty: [
    {
      id: "call",
      name: "Coverage check-in",
      body: (c) =>
        `${hello(c)} ${wording(c,
          `I'm reaching out about optional hardware coverage for ${orderRef(c)} before pickup or delivery. Would you prefer the details here or a quick call?`,
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

These optional plans can only be added before pickup or delivery. Would you like more information about either plan?`,
          `If you'd like longer hardware coverage for ${orderRef(c)}, the 2-year plan is ${c.two} and the 3-year plan is ${c.three}. Your included coverage is 1 year of hardware warranty plus lifetime service and labor. The extension is optional and must be added before pickup or delivery. Want to compare the plans?`,
          `Optional hardware coverage for ${orderRef(c)}: 2 years for ${c.two}, or 3 for ${c.three}. Your included 1-year hardware warranty and lifetime service and labor remain either way. Plans can be added before pickup or delivery. Interested in either plan?`,
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
    {
      id: "included",
      name: "Included vs optional coverage",
      body: (c) => `${hello(c)} ${wording(c,
        `Your PC includes a 1-year hardware warranty plus lifetime service and labor. Optional hardware plans are ${c.two} for 2 years or ${c.three} for 3 years and can be added before pickup or delivery. Want to compare what's covered, or keep the included plan?`,
        `If you're weighing up the hardware plans for ${orderRef(c)}, I can explain how they differ from the included 1-year warranty. Two years is ${c.two}; three years is ${c.three}. Both are optional and must be added before pickup or delivery. What would you like to know?`,
        `Want to compare your included 1-year warranty with the optional hardware plans? Two years is ${c.two}, and three is ${c.three}, available before pickup or delivery. Happy to go over the terms.`,
      )}`,
    },
    {
      id: "invoice",
      name: "Selected plan / invoice",
      body: (c) => `${hello(c)} ${wording(c,
        `Thanks for choosing a hardware plan for ${orderRef(c)}. I'll request the option we discussed. META PCs will email an invoice to the address on your order. Please review the selected plan, coverage terms and price before paying. If it doesn't arrive, reply here and I'll check.`,
        "I'll request the hardware plan you selected. You'll receive an invoice by email at the address on your order. Check that the plan and price match what we discussed before paying, and let me know if you have questions or don't receive it.",
        "Thanks! I'll request your selected hardware plan. META PCs will email the invoice to the address on your order. Please review the plan, terms and price before paying; reply if it doesn't arrive.",
      )}`,
    },
  ],
  abandoned: [
    {
      id: "call",
      name: "Cart check-in",
      body: (c) => `${hello(c)} ${wording(c,
        "I'm following up on the PC you left in your cart. Was there a question about the build, the total, or checkout that made you pause? I can help compare options or work through the next step. What would be most helpful?",
        "Still thinking about the PC in your cart? If you're unsure whether it's the right fit or ran into a checkout issue, tell me what held you up. We can go over the build together and check current pricing and availability.",
        "I'm checking in on the PC in your cart. Any build or checkout questions before you decide? Tell me what made you pause and I can help with the next step.",
      )}`,
    },
    {
      id: "fit",
      name: "Help choose a build",
      body: (c) => `${hello(c)} ${wording(c,
        "If you're unsure about the PC in your cart, send me your main games or apps, monitor resolution and budget. I can explain how the build fits your setup and whether another option is worth comparing. What's most important to you?",
        "Want a second opinion on the build you picked? Tell me what you'll use it for and what you'd like to spend. We can compare performance, storage and other details so you can decide which setup makes sense for you.",
        "Want help checking whether the build in your cart fits your needs? Send your main games or apps and budget, plus your monitor resolution if known. I'll help compare the options.",
      )}`,
    },
    {
      id: "checkout",
      name: "Checkout help",
      body: (c) => `${hello(c)} ${wording(c,
        "Did you run into a problem finishing checkout? Tell me which step stopped working and whether you saw an error message. I can help figure out the next step. Please keep card numbers and other payment details out of texts.",
        "If checkout gave you trouble, let me know where you got stuck and what the page showed. We can work through it together or arrange a call if that's easier. Don't send card numbers or payment details here.",
        "Having trouble with checkout? Reply with the step that stopped and any error message, without card or payment details. I'll help work out what to try next.",
      )}`,
    },
    {
      id: "follow",
      name: "Follow-up",
      body: (c) => `${hello(c)} ${wording(c,
        "I'm checking back to see if you're still considering the PC in your cart. I can confirm current pricing and availability, compare another build, or answer checkout questions. Where are you at in the decision?",
        "How's the PC search going? If that build is still on your list, we can take another look at how it fits your needs. Let me know if it's the specs, budget or checkout you want help with.",
        "Still considering the build in your cart? I can check current pricing and stock or help compare it with another option. What's the main thing you want to sort out?",
      )}`,
    },
    {
      id: "last",
      name: "Final follow-up",
      body: (c) => `${hello(c)} ${wording(c,
        "I'll leave the next step with you for now. If you'd like to revisit your cart, compare a different PC or ask about checkout, reply here and I can help. If you already found a PC or your plans changed, let me know and I'll update the lead.",
        "No worries if now isn't the right time for a PC. If you want to take another look later, send me what you're considering and we'll check the current options together. If you're no longer shopping, just let me know.",
        "I'll leave it with you for now. Reply if you'd like help with your cart or a different build. If you've already bought a PC or stopped looking, let me know so I can update the lead.",
      )}`,
    },
    {
      id: "budget",
      name: "Find a budget fit",
      body: (c) => `${hello(c)} ${wording(c,
        "If the total in your cart wasn't where you wanted it, what budget feels comfortable? Tell me which games or apps matter most and I can help compare lower-priced builds or review the available payment options without sacrificing your main priorities.",
        "Would it help to look at a different build around your budget? Send me what you'd like to spend and what the PC needs to do. We can compare the trade-offs and check current pricing before you decide.",
        "Is the cart total the main concern? Send your preferred budget and main games or apps. I can compare other builds and explain the payment options before you decide.",
      )}`,
    },
    {
      id: "setup",
      name: "Complete the setup",
      body: (c) => `${hello(c)} ${wording(c,
        "Are you replacing just the PC, or putting together a whole setup? Let me know the monitor and accessories you already have. I can help check how the build in your cart fits and which connections or extras you'll actually need.",
        "Before you decide on the build in your cart, what monitor will you pair it with? If you're also choosing a keyboard, mouse or other gear, we can go over the setup together and keep your overall budget in mind.",
        "What monitor and accessories will you use with the PC in your cart? I can help check the setup and connections so you know what's needed before checkout.",
      )}`,
    },
  ],
  helpdesk: [
    {
      id: "call",
      name: "Ask for a call",
      body: (c) =>
        `${hello(c)} ${wording(c,
          "I'm following up on your support request so we can work out the next step. Is the issue still happening, and has anything changed since you contacted us? You can share an update here or send a good time for a call.",
          "I'd like to check how things are going with your request. Let me know what's happening now and anything you've already tried so we don't repeat steps. Would you prefer to go over it here or arrange a call?",
          "I'm checking in on your support request. Is the issue still happening? Reply with a brief update or a good time to call so we can go over the next step.",
        )}`,
    },
    {
      id: "follow",
      name: "Follow-up",
      body: (c) => `${hello(c)} ${wording(c,
        "Do you still need help with your request? Let me know whether the issue is continuing and if you've noticed any new symptoms or error messages. I can help plan the next step, or we can arrange a call to go over it.",
        "Checking back to see how things are going. If the issue is still happening, tell me what's changed and what you've tried since we last spoke. If it's resolved, let me know so I can update the request.",
        "Any update on your support request? If the issue continues, send a brief description of what's happening or a good time to call. If it's resolved, let me know so I can update the request.",
      )}`,
    },
    {
      id: "details",
      name: "Gather issue details",
      body: (c) => `${hello(c)} ${wording(c,
        "To help with your request, could you send the exact error message, when the issue started and what you were doing when it happened? If possible, include whether it happens every time or only occasionally. Please leave passwords and payment information out of messages.",
        "A little more detail will help us avoid guessing. What happens when you try to use the PC, and have you noticed a pattern? Send any error wording and what you've already tried, without passwords or payment details.",
        "Could you send the error message, when it started and what you've already tried? Let me know if it happens every time or occasionally. Please don't include passwords or payment details.",
      )}`,
    },
    {
      id: "resolved",
      name: "Check resolution",
      body: (c) => `${hello(c)} ${wording(c,
        "After the steps we discussed, is the PC behaving as expected? Let me know whether the original issue is resolved or if anything is still happening. Your update will help us decide whether more follow-up is needed.",
        "How did things go after trying the steps we went over? If the issue is still there, tell me what you're seeing now so we can plan the next step. If it's working normally, a quick confirmation would be helpful too.",
        "Did the steps we discussed resolve the issue? Reply with a quick confirmation or describe what's still happening so we can work out whether another step is needed.",
      )}`,
    },
  ],
  other: [
    {
      id: "call",
      name: "PC search check-in",
      body: (c) =>
        `${hello(c)} ${wording(c,
          "I'm following up on the PC you were looking at. What will you mainly use it for, and is there a particular build you have in mind? I can help compare the specs and find options around your budget. Would you rather chat here or have a quick call?",
          "Are you still comparing PCs? Tell me what you'll play or work on and what matters most to you, whether that's performance, size or the look of the build. I'll help narrow down the choices. What's caught your eye so far?",
          "Still looking for a PC? Send me a build you like or your main games and budget. I can help compare options and check current availability, here or on a quick call.",
        )}`,
    },
    {
      id: "follow",
      name: "Follow-up",
      body: (c) => `${hello(c)} ${wording(c,
        "I'm checking back on your PC search. Are you deciding between builds, or is there a question about specs or budget I can help with? Send me what you're considering and I'll explain the differences and check current availability.",
        "How's the search going? If you're still weighing up options, tell me your main games or apps and what you'd like to spend. We can compare a couple of builds and talk through the trade-offs. What's been hardest to decide?",
        "Still comparing builds? Send me your main games or apps, budget and any PC you're considering. I can explain the differences and help you work out the next step.",
      )}`,
    },
    {
      id: "setup",
      name: "New setup or upgrade",
      body: (c) => `${hello(c)} ${wording(c,
      "Are you moving from a console, replacing an older PC, or starting a whole new setup? Tell me what you already have and what you want to improve. That'll help me suggest a build and check how it fits your monitor and budget.",
      "What does your current setup look like, and what would you like the new PC to do better? Whether it's smoother games, streaming or work, I can help compare the specs that matter instead of adding things you don't need.",
      "Is this your first PC or an upgrade? Tell me what you use now and what you'd like to improve, plus your budget. I'll help compare builds that fit the setup.",
      )}`,
    },
    {
      id: "timing",
      name: "Plan pickup or shipping",
      body: (c) => `${hello(c)} ${wording(c,
      "Do you have a date in mind for your new PC, and would you prefer pickup or shipping? Send me the build you're considering and your timing. I can check current availability and fulfillment details before you make plans.",
      "When are you hoping to have the PC ready for your setup? If you're working around a birthday, school or a project, let me know. We can check which builds and pickup or shipping options fit that timeline.",
      "When would you like the new PC, and would you prefer pickup or shipping? Send your timeline and a build you like so I can check current availability and fulfillment details.",
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
      subject: (c) => wording(c, `PC options for your ${c.lender ? `${c.lender} ` : ""}approval`, "Let's find a PC that fits your needs", "Help with your PC options"),
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
    {
      id: "use",
      name: "Build requirements",
      subject: (c) => wording(c, "What do you need your PC to handle?", "Let's narrow down your PC options", "Your PC requirements"),
      body: (c) => emailBody(c,
        "I'd like to help find a PC that suits your needs and a budget you're comfortable with.\n\nReply with your main games or apps, whether you'll stream or do creative work, your monitor resolution if known, and any build you're considering.\n\nI'll compare the relevant specs and check current availability and payment options before you decide.",
        "Let's start with what you'll actually do on the PC. What do you play or work on, what monitor do you use, and what would you like to spend?\n\nIf a build has caught your eye, send it over. I'll help explain the trade-offs and review the available payment options.",
        "Send your main games or apps, monitor resolution, preferred budget and any build you like. I'll help compare the specs and check current stock and payment options."),
    },
    {
      id: "follow",
      name: "Decision check-in",
      subject: (c) => wording(c, "Any questions about your PC options?", "Where are you at in your PC search?", "Help with the next step"),
      body: (c) => emailBody(c,
        "I'm checking back on your PC search. Are you still comparing builds, or is there a question about performance, budget or payment I can help clarify?\n\nSend me the options you're considering and what matters most. I can explain the differences and check current pricing and availability.\n\nIf your plans have changed, let me know so I can update the lead on Dash.",
        "How's the decision going? If you're stuck between a couple of PCs, we can compare them around your games, monitor and budget.\n\nReply with what's holding things up, or a good time to talk. If you're no longer shopping, that's fine too; just let me know.",
        "Still considering a PC? Reply with the builds you're comparing or the question you'd like answered. I'll help with the next step. If plans changed, let me know."),
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

These optional plans can only be added before pickup or delivery. Reply if you'd like more information or want to add a plan.`,
          `Would you like a little extra hardware coverage for ${orderRef(c)}?\n\nYour PC already includes a 1-year hardware warranty and lifetime service and labor from our US-based team. The optional extension is ${c.two} for 2 years or ${c.three} for 3 years.\n\nIt can only be added before pickup or delivery. Happy to explain either plan, and keeping the included coverage is fine too.`,
          `Optional hardware coverage for ${orderRef(c)}:\n\n2 years: ${c.two}\n3 years: ${c.three}\n\nYour included coverage is a 1-year hardware warranty plus lifetime service and labor. Optional plans must be added before pickup or delivery. Reply with any questions or the plan you'd like to review.`),
    },
    {
      id: "compare",
      name: "Coverage comparison",
      subject: (c) => wording(c, "Included and optional hardware coverage", "Compare the hardware plans for your PC", "Your hardware coverage options"),
      body: (c) => emailBody(c,
        `Your PC already includes a 1-year hardware warranty plus lifetime service and labor.\n\nIf you'd like longer hardware coverage for ${orderRef(c)}, the optional plans are:\n- 2 years: ${c.two}\n- 3 years: ${c.three}\n\nI can walk you through covered components, repair terms and how the plans differ from your included coverage. Plans can only be added before pickup or delivery.\n\nWhat would you like to know before deciding? Keeping the included coverage is fine too.`,
        `Want to compare your included warranty with the optional hardware plans?\n\nTwo years is ${c.two}, and three years is ${c.three}. Both can only be added before pickup or delivery. Your lifetime service and labor remain either way.\n\nReply with questions about the terms or the plan you'd like to review; there's no need to add coverage if it isn't right for you.`,
        `Included: 1-year hardware warranty plus lifetime service and labor.\n\nOptional hardware plans: 2 years for ${c.two}, or 3 years for ${c.three}, available before pickup or delivery.\n\nReply if you'd like to compare the coverage and repair terms.`),
    },
    {
      id: "invoice",
      name: "Selected plan / invoice",
      subject: (c) => wording(c, "Next step for your selected hardware plan", "Reviewing your coverage invoice", "Your hardware plan request"),
      body: (c) => emailBody(c,
        `Thanks for selecting a hardware plan for ${orderRef(c)}. I'll request the option we discussed.\n\nMETA PCs will email an invoice to the address on your order. Before paying, please check that the selected plan, coverage terms and price match what we discussed.\n\nIf you don't receive the invoice or something doesn't look right, reply here and I'll check before you proceed.`,
        "I'll send the request for your chosen hardware plan. You'll receive the invoice by email at the address on your order.\n\nPlease review the plan, terms and price before paying. If the invoice hasn't arrived or you have questions, let me know so we can check it together.",
        "I'll request your selected hardware plan. META PCs will email the invoice to the address on your order.\n\nReview the plan, coverage terms and price before paying. Reply if it doesn't arrive or you need anything clarified."),
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
    {
      id: "checkout",
      name: "Checkout troubleshooting",
      subject: (c) => wording(c, "Need help finishing checkout?", "Let's work through your checkout question", "META PCs checkout help"),
      body: (c) => emailBody(c,
        "If something stopped you at checkout, reply with the step where it happened and the wording of any error message.\n\nI can help work out the next step and check current pricing and stock for the build you selected. Please don't send card numbers, passwords or other payment details by email.\n\nIf you'd prefer a call, send a good time and number to reach you.",
        "Did checkout give you trouble, or did you pause to compare the build or payment options?\n\nTell me where you got stuck so I can help with the right next step. Keep passwords and payment information out of your reply. We can also arrange a call if that's easier.",
        "Reply with the checkout step that stopped and any error wording, without passwords or payment details. I'll help work out the next step, or we can arrange a call."),
    },
    {
      id: "last",
      name: "Leave the next step with them",
      subject: (c) => wording(c, "Here if you want to revisit your PC cart", "Whenever you're ready to compare PCs", "Help with your cart when you need it"),
      body: (c) => emailBody(c,
        "I'll leave the next step with you for now. If you'd like to revisit your cart, compare a different build or get help with checkout, reply here and we'll pick it up from there.\n\nWe'll check current pricing and availability rather than assume the cart is unchanged.\n\nIf you already found a PC or you're no longer looking, let me know so I can update the lead on Dash.",
        "No worries if a new PC isn't the priority right now. If you want to look again later, send the build you're considering and what you'd use it for, and we can review the current options.\n\nIf your plans have changed, just let me know.",
        "I'll leave it with you for now. Reply if you'd like help with your cart or another build; we'll verify current pricing and stock. Let me know if you're no longer shopping."),
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
    {
      id: "details",
      name: "Gather issue details",
      subject: (c) => wording(c, "A few details to help with your support request", "Help us understand what's happening", "Details for your META PCs request"),
      body: (c) => emailBody(c,
        "To help work out the next step, please reply with:\n\n- What happens and the exact wording of any error\n- When it started and whether it happens consistently\n- What you were doing when it occurred\n- Anything you've already tried\n\nPlease leave passwords, payment details and other sensitive information out of your reply. We'll use this to avoid repeating steps or guessing at the cause.",
        "Could you describe what you're seeing now, when it started and what you've tried? The exact error wording and whether it happens every time are useful too.\n\nDon't include passwords or payment information. If a call is easier, send a good time and number to reach you.",
        "Reply with the error wording, when it started, how often it happens and what you've tried. Please don't include passwords or payment details. We can arrange a call if that's easier."),
    },
    {
      id: "resolved",
      name: "Check resolution",
      subject: (c) => wording(c, "Did the steps we discussed help?", "Checking how your PC is behaving", "Update on your support request"),
      body: (c) => emailBody(c,
        "I'm checking in after the steps we discussed. Is the original issue resolved, or are you still seeing the same behavior?\n\nIf anything remains, reply with what happens now and any new error wording so we can decide on the next step. If everything is working normally, a quick confirmation will help us update the request.",
        "How did things go after trying the steps we went over? Let me know whether the issue is gone or what you're still noticing.\n\nYour update will help us decide whether more follow-up is needed. We can arrange a call if you'd rather go over it together.",
        "Did the steps we discussed resolve the issue? Reply with a quick confirmation or describe what's still happening so we can decide whether more follow-up is needed."),
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
    {
      id: "setup",
      name: "Plan the setup",
      subject: (c) => wording(c, "Let's plan a PC around your setup", "First PC or upgrade?", "Finding a build for your needs"),
      body: (c) => emailBody(c,
        "Are you replacing an older PC, moving from a console, or starting a whole new setup?\n\nSend me your main games or apps, the monitor and accessories you already have, and a budget you're comfortable with. Let me know what you'd like the new PC to do better.\n\nI'll help compare the specs that matter and check current options without adding things you don't need.",
        "Tell me what your current setup looks like and what you want to improve. Smoother gaming, streaming and work can call for different priorities.\n\nWith your main games or apps, monitor resolution and budget, I can help compare a few builds and explain the trade-offs.",
        "Is this your first PC or an upgrade? Send your main games or apps, monitor, budget and what you'd like to improve. I'll help compare builds that fit."),
    },
    {
      id: "compare",
      name: "Compare your shortlist",
      subject: (c) => wording(c, "Need a second opinion on your PC shortlist?", "Let's compare the builds you're considering", "Help choosing between PCs"),
      body: (c) => emailBody(c,
        "If you're deciding between a few PCs, send me the models you're considering and what you'll mainly use the system for.\n\nI can explain the differences in performance, storage, size and other details around your monitor and budget. I'll check current stock and pricing before you decide.\n\nWhich part of the choice has been hardest to pin down?",
        "Have a couple of builds on your list? Send them over with your main games or apps and budget.\n\nWe'll compare what you're getting and which trade-offs matter for your setup. I can also check availability and pickup or shipping details for the option you prefer.",
        "Send the PCs on your shortlist, your main games or apps and your budget. I'll help compare the specs and check current pricing and availability before you decide."),
    },
  ],
};
