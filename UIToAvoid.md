# 100 UI/UX Signs AI Probably Designed It

A practical review checklist for spotting generic, low-context, or
AI-generated UI/UX decisions before they reach production.

Use this to improve design quality, not to bully the robot. The robot is
already doing its best.

---

## 1. Generic Visual Design

| # | Warning Sign | Why It Feels AI-Generated | Better Approach |
|---|---|---|---|
| 1 | Everything uses purple gradients | It is the default “modern startup” look. | Use colors based on brand, audience, and purpose. |
| 2 | Excessive glassmorphism | Blur, transparency, and floating cards appear everywhere. | Use glass effects only when they improve hierarchy. |
| 3 | Every section is a rounded card | The interface becomes a wall of containers. | Use spacing, typography, and dividers before adding cards. |
| 4 | All corners use the same large radius | It looks copied from a generic component library. | Use radius intentionally based on content and hierarchy. |
| 5 | The interface looks like a SaaS landing page | Even internal dashboards look like marketing sites. | Match the visual style to the actual product purpose. |
| 6 | Too many gradients | Gradients compete with content and actions. | Reserve gradients for selective emphasis. |
| 7 | Every button is bright and colorful | Nothing has visual priority. | Use one clear primary action per context. |
| 8 | Icons have random styles | Some are outlined, some filled, some are emojis. | Use one consistent icon set and style. |
| 9 | Decorative blobs appear for no reason | The page is visually busy without adding meaning. | Remove decoration that does not support the brand or content. |
| 10 | Stock illustrations are unrelated to the product | The art looks nice but explains nothing. | Use illustrations that support the actual user task. |

---

## 2. Typography Problems

| # | Warning Sign | Why It Feels AI-Generated | Better Approach |
|---|---|---|---|
| 11 | Every heading is huge and bold | It imitates popular marketing pages. | Create a clear, restrained type scale. |
| 12 | Too many font sizes | The page lacks visual rhythm. | Limit typography to a defined scale. |
| 13 | Too many font weights | Every line tries to be important. | Use weight to establish hierarchy, not decoration. |
| 14 | Generic font pairing | Examples include Inter with another default sans-serif. | Choose typography that fits the product personality. |
| 15 | Low-contrast text | It looks subtle but is hard to read. | Meet accessibility contrast requirements. |
| 16 | Long paragraphs with no structure | Information is technically present but hard to scan. | Use headings, bullets, summaries, and whitespace. |
| 17 | Center-aligned body text | It is harder to read beyond a few lines. | Left-align body copy in left-to-right languages. |
| 18 | All text is title case | It feels overly polished and unnatural. | Match capitalization to the product voice. |
| 19 | Random capitalization rules | Labels vary between `Save Changes`, `save changes`, and `SAVE`. | Establish consistent content guidelines. |
| 20 | Text wraps awkwardly on mobile | The layout was designed only for desktop. | Test real content at narrow viewport widths. |

---

## 3. Layout and Spacing Issues

| # | Warning Sign | Why It Feels AI-Generated | Better Approach |
|---|---|---|---|
| 21 | Every page uses the same hero layout | Title, subtitle, two buttons, and image repeat endlessly. | Design layouts around task and content needs. |
| 22 | Too much empty space | The page feels unfinished rather than intentional. | Use whitespace to separate related information meaningfully. |
| 23 | Not enough empty space | Cards, text, and buttons feel crowded. | Use consistent spacing tokens. |
| 24 | Perfectly symmetrical layout everywhere | Real tasks rarely need perfect symmetry. | Let hierarchy and content determine layout. |
| 25 | Important actions are below the fold | Users must scroll before knowing what to do. | Keep primary actions visible when possible. |
| 26 | Sidebars take too much space | Content becomes cramped on normal laptops. | Make navigation compact, collapsible, or responsive. |
| 27 | Cards have inconsistent heights for no reason | It creates a messy grid. | Use consistent layouts when comparing similar items. |
| 28 | Desktop layout is simply squeezed onto mobile | Elements become tiny and crowded. | Redesign information hierarchy for smaller screens. |
| 29 | The page has no visual grouping | Users cannot tell what belongs together. | Group related fields and actions through spacing and headings. |
| 30 | Everything is centered | It looks like a landing page, not a functional app. | Use alignment that supports scanning and workflows. |

---

## 4. Buttons and Calls to Action

| # | Warning Sign | Why It Feels AI-Generated | Better Approach |
|---|---|---|---|
| 31 | Every action is a filled primary button | No action has priority. | Use primary, secondary, tertiary, and destructive styles. |
| 32 | Buttons say “Click Here” | The label does not explain the result. | Use clear labels such as “Create project” or “Download invoice.” |
| 33 | Buttons say “Submit” everywhere | It is technically accurate but vague. | Name the action users are taking. |
| 34 | Multiple primary buttons compete | Users do not know which action matters most. | Choose one primary action per screen or section. |
| 35 | Destructive actions look harmless | Delete buttons look identical to Save buttons. | Use clear destructive styling and confirmation where needed. |
| 36 | Buttons have inconsistent sizes | The interface feels assembled from unrelated pieces. | Define shared button sizes and use them consistently. |
| 37 | Icon-only buttons have no labels | Users guess what an icon means. | Include tooltips and accessible labels. |
| 38 | Button labels use hype language | Examples include “Unlock Magic” and “Supercharge Now.” | Prefer direct, useful language. |
| 39 | Disabled buttons do not explain why | Users have no idea what they need to do next. | Provide helper text or validation feedback. |
| 40 | Buttons trigger slow actions with no feedback | Users click repeatedly. | Show loading states, progress, or immediate acknowledgement. |

---

## 5. Forms That Feel Generated

| # | Warning Sign | Why It Feels AI-Generated | Better Approach |
|---|---|---|---|
| 41 | Every form field has a placeholder and label saying the same thing | It adds clutter without helping. | Use labels for persistent meaning and placeholders for examples. |
| 42 | Placeholder text disappears as the only label | Users forget what the field was for. | Always provide visible labels. |
| 43 | Required fields are marked inconsistently | Some use `*`, some say required, some say nothing. | Establish one clear required-field pattern. |
| 44 | Validation only happens after submit | Users discover every problem at once. | Validate at helpful moments while avoiding premature errors. |
| 45 | Error messages say only “Invalid input” | Users cannot fix the problem. | Explain what is wrong and how to correct it. |
| 46 | Forms ask for unnecessary information | It feels like a generic onboarding template. | Request only data needed for the current task. |
| 47 | Password rules appear only after failure | Users waste time guessing requirements. | Show password requirements before submission. |
| 48 | Date inputs assume one country’s format | Dates become ambiguous for global users. | Use localized formats or date pickers with clear labels. |
| 49 | Dropdowns are used for two choices | It adds needless interaction. | Use radio buttons, toggles, or segmented controls when appropriate. |
| 50 | The form resets after one validation error | User effort disappears. | Preserve entered values and highlight invalid fields. |

---

## 6. Empty, Loading, and Error States

| # | Warning Sign | Why It Feels AI-Generated | Better Approach |
|---|---|---|---|
| 51 | Empty states only say “No data” | It provides no explanation or next step. | Explain why it is empty and what users can do. |
| 52 | Empty states use unrelated illustrations | A cartoon astronaut does not help users create their first invoice. | Use relevant visuals or remove them. |
| 53 | Errors say “Something went wrong” | The message is too generic to be useful. | Provide a human-readable explanation and recovery action. |
| 54 | Errors blame the user | Messages feel hostile, such as “You entered invalid data.” | Use neutral, supportive wording. |
| 55 | No loading state exists | The product feels broken during network requests. | Use skeletons, spinners, or inline loading feedback. |
| 56 | Spinners appear with no context | Users do not know what is loading or how long it may take. | Pair loading indicators with meaningful status text. |
| 57 | Loading causes the layout to jump | Content shifts after data arrives. | Reserve space with skeletons or stable dimensions. |
| 58 | Retry buttons are missing | Temporary network failures become dead ends. | Offer retry actions when safe and useful. |
| 59 | Success feedback is too subtle | Users do not know whether an action completed. | Provide clear confirmations for important actions. |
| 60 | Success messages stay forever | Old notifications clutter the interface. | Auto-dismiss noncritical notices after a reasonable time. |

---

## 7. Navigation and Information Architecture

| # | Warning Sign | Why It Feels AI-Generated | Better Approach |
|---|---|---|---|
| 61 | Navigation includes every possible page | Users see too many choices at once. | Group content and prioritize common tasks. |
| 62 | Labels are vague | Examples include “Workspace,” “Hub,” and “Center.” | Use labels users already understand. |
| 63 | The same destination has multiple names | “Projects,” “Work,” and “My Tasks” lead to overlapping areas. | Use consistent language across the product. |
| 64 | Breadcrumbs are included everywhere | They add noise on simple navigation paths. | Use breadcrumbs only when hierarchy is deep or useful. |
| 65 | Tabs are used for unrelated pages | They become a miniature navigation system. | Use tabs for related views within one context. |
| 66 | The active navigation state is unclear | Users cannot tell where they are. | Make active sections visually obvious. |
| 67 | Important settings are buried | Users must dig through menus for frequent actions. | Place common actions near the workflows that need them. |
| 68 | Navigation changes between pages | Users lose their mental map. | Keep major navigation stable across the app. |
| 69 | Search is added without useful filtering | It returns a noisy wall of results. | Add ranking, filters, categories, and helpful empty states. |
| 70 | Mobile navigation is an afterthought | Desktop menus collapse into unusable hamburger chaos. | Design mobile navigation as its own user flow. |

---

## 8. Accessibility Warning Signs

| # | Warning Sign | Why It Feels AI-Generated | Better Approach |
|---|---|---|---|
| 71 | Color is the only status indicator | Red and green alone exclude many users. | Pair color with labels, icons, patterns, or text. |
| 72 | Focus states are removed | Keyboard users cannot see where they are. | Keep visible, high-contrast focus indicators. |
| 73 | Clickable cards are not keyboard accessible | Mouse users can interact, keyboard users cannot. | Use semantic buttons and links. |
| 74 | Icons have no accessible names | Screen readers announce meaningless controls. | Add descriptive labels and `aria-label` values when needed. |
| 75 | Text contrast is too low | The design is trendy but difficult to read. | Test contrast against WCAG guidance. |
| 76 | Tiny click targets | Users miss buttons, especially on touch devices. | Use adequately sized targets with spacing around them. |
| 77 | Animations cannot be reduced | Motion-sensitive users may feel uncomfortable. | Respect reduced-motion preferences. |
| 78 | Forms do not announce errors | Screen reader users may not know what failed. | Connect errors to inputs with accessible semantics. |
| 79 | Heading order is visual only | Font size replaces semantic structure. | Use proper heading levels in logical order. |
| 80 | Modals trap or lose keyboard focus | Users cannot close or navigate the dialog properly. | Manage focus correctly when opening and closing modals. |

---

## 9. Content and Microcopy Problems

| # | Warning Sign | Why It Feels AI-Generated | Better Approach |
|---|---|---|---|
| 81 | Copy sounds overly polished but says little | “Transform your workflow with effortless innovation.” | Write specific language about actual user value. |
| 82 | Every heading uses buzzwords | Words like seamless, powerful, revolutionary, and next-level appear often. | Use plain language and concrete outcomes. |
| 83 | The product speaks like a motivational poster | Tone is too enthusiastic for normal tasks. | Match tone to the user’s situation. |
| 84 | Tooltips explain obvious things | “Save button: saves your changes.” | Use tooltips for unfamiliar concepts or consequences. |
| 85 | Confirmation dialogs are vague | “Are you sure?” does not explain what happens. | Name the action and its consequences. |
| 86 | Error text is technical jargon | Users see messages like `ERR_AUTH_401`. | Translate technical failures into useful language. |
| 87 | Every screen has too much helper text | The interface becomes a manual instead of a tool. | Show help progressively when it is needed. |
| 88 | Labels use internal company language | Users do not understand internal terms or acronyms. | Use language from user research and real workflows. |
| 89 | Marketing promises are too broad | Claims like “Save hours every day” lack credibility. | Make claims specific and supportable. |
| 90 | Tone changes randomly | One page is formal, another is playful, another is robotic. | Create and follow a product voice guide. |

---

## 10. Missing Product Context

| # | Warning Sign | Why It Feels AI-Generated | Better Approach |
|---|---|---|---|
| 91 | The design solves a generic version of the problem | It works in a demo but not in real workflows. | Start with user goals, constraints, and real examples. |
| 92 | No consideration for user roles | Admins, managers, and regular users see the same interface. | Tailor workflows and permissions by user role. |
| 93 | No consideration for user frequency | A daily workflow is designed like a once-a-year setup flow. | Optimize frequent tasks for speed and repetition. |
| 94 | No bulk actions for repeated work | Users must edit one item at a time. | Add batch selection and bulk actions where appropriate. |
| 95 | No undo for risky common actions | A mistaken click has permanent consequences. | Provide undo or recovery paths when feasible. |
| 96 | Tables are beautiful but not useful | They lack sorting, filtering, exporting, or row actions. | Design data views around real decision-making tasks. |
| 97 | Dashboards show vanity metrics | The page is full of charts but does not help users act. | Prioritize actionable metrics and next steps. |
| 98 | Onboarding is generic | It asks users to “explore the dashboard” with no guidance. | Guide users toward their first meaningful outcome. |
| 99 | The design ignores real data volume | It looks fine with five records and fails with five thousand. | Test with realistic content lengths and data sizes. |
| 100 | Every screen looks polished but no workflow is complete | The UI has style, but users cannot finish important tasks. | Validate full end-to-end user journeys before launch. |

---

# Quick Review Checklist

Before doing UI or UX design:

- [ ] Does this design match the product, users, and real workflow?
- [ ] Is there one obvious primary action on each screen?
- [ ] Can users understand errors and recover from them?
- [ ] Does the experience work on mobile, desktop, and keyboard-only navigation?
- [ ] Are loading, empty, success, and error states designed?
- [ ] Are forms clear, forgiving, and accessible?
- [ ] Does the interface use consistent language, spacing, colors, and controls?
- [ ] Is the copy specific instead of filled with buzzwords?
- [ ] Does the design work with realistic content and data volume?
- [ ] Can a real user complete the main task without guessing?

---

# Final Rule

> If the design looks polished but does not reflect real users, real data, and
> real workflows, it is decoration, not UX.
