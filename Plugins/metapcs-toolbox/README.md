# META PC Toolbox

The META PC Toolbox side panel brings together Help Center search with one-click
copy, UPS/FedEx tracking, WorkMate service-order and Gorgias ticket lookup, plus
clickable SO-# links on the pages you already work in.

## Install (one time, ~30 seconds)

1. Open Chrome and go to `chrome://extensions`
2. Turn on **Developer mode** (toggle, top right)
3. Click **Load unpacked**
4. Select the folder `Desktop\metapcs-toolbox`
5. Pin the extension so it's always one click away (puzzle-piece icon → pin)

First launch builds the article index (36 articles, a few seconds). After that
search is instant and works offline. The index refreshes itself once a day, and
there's a **Rebuild index now** button under the gear if you publish a new article
and want it immediately.

Open it from the extension button or with **Alt+Shift+M**. Use the pin button in
the panel header to open a separate, resizable window when you need it beside
your browser.

## 1. Help Center

Type a few words. Results rank by where the match is:

- a query word in the **title** counts most
- a match in the **body** still surfaces the article, further down
- articles missing part of your query drop away sharply

So `SSD` returns *How to Test SSD Health* and *How to install or reseat an M.2 SSD*
first, with *How to use HD Tune* below (it mentions SSD once in the body).

Synonyms are built in, so `GPU reseat` finds *How to reseat your graphics card*
even though that title never says "GPU". Typos within one letter still match
(`resat` → `reseat`).

**One click on a result copies it.** The `Copy as` dropdown sets the format:

| Format | What lands on your clipboard |
|---|---|
| Clickable link *(default)* | A real hyperlink — paste into a Gorgias reply and it's already linked |
| URL only | `https://help.metapcs.com/en-US/...` |
| Title + URL | `How to Test SSD Health — https://...` |
| Markdown | `[How to Test SSD Health](https://...)` |

`Open` opens the article in a new tab. `Text` copies the whole article body.

Keyboard: `↑` `↓` to pick, `Enter` to copy, `Shift+Enter` to open.

## 2. Tracking

One box for both carriers — the number's format tells the extension who ships it:

- **UPS** — `1Z…` (18 char), `T` + 10 digits, 9-digit InfoNotice
- **FedEx** — 12 / 15 digits, `96` + 20 digits, door tags (`DT…`)

Spaces and dashes are stripped, so pasting straight from an email works.
A few 20- and 22-digit formats are genuinely used by both carriers; in that case
you get a button for each instead of a wrong guess.

## 3. WorkMate

Accepts `1145`, `#1145`, `SO-1145`, `SO-#1145`, or a full pasted WorkMate URL.

> **About the "23":** the `23` you see in every work-order URL isn't part of the
> order number — `%23` is just how a `#` is written in a URL. `SO-#1145` becomes
> `SO-%231145` and `SO-#29` becomes `SO-%2329`. The extension handles this, so
> pasting a URL back in resolves to 1145, not 231145.

The store slug (`meta-pcs`) is editable under the gear if you ever need another store.

## 4. Gorgias

Accepts `110227889`, `#110227889`, or a pasted ticket URL, and opens
`metapcs.gorgias.com/app/ticket/<id>` in a mini window or a full tab.

Pasting a URL with a query string on the end (`…/110227889?tab=messages`) still
resolves to the right ticket, and `ticket 110227889 from 2024` picks the ticket
id rather than the year.

The account subdomain (`metapcs`) is editable under the gear.

## Clickable SO numbers on pages

WorkMate renders work-order numbers as plain table cells with a JavaScript click
handler, not as links — which is exactly why middle-click and right-click offer
you nothing. There's no link for the browser to act on.

With **SO number links** on (under the gear), every SO number on the page gets a
red dotted underline and opens that work order in a new tab when you click or
middle-click it.

There are two mechanisms behind that, because one alone does not cover the real
pages:

| Where the number is | What it becomes | Gestures |
|---|---|---|
| Ordinary text (WorkMate cells, ticket body) | a real `<a href>` | left-click, middle-click, Ctrl+click, **and** the native right-click menu |
| Already inside a link (every Gorgias ticket row) | a `<span>` that opens the tab itself | left-click, middle-click, Enter |
| Inside an editable field (the Gorgias ticket subject) | a chip **beside** the field; the field itself is never touched | left-click, middle-click, right-click menu |

The third case exists because the Gorgias subject is editable — you can click it
and retype it. Injecting anything into it would mean our markup gets saved as
part of the subject the next time Gorgias writes that field. So the text is left
exactly as typed and a small `SO-#1353` chip is placed next to it instead.

The second case matters more than it sounds. Gorgias renders each ticket row as
a link, and a nested `<a>` inside a link is invalid HTML — the browser silently
splits it and breaks the row. So there the number becomes a span that opens the
tab itself and swallows the click, which also stops Gorgias from navigating the
row underneath at the same moment. Only the first case can offer the native
right-click menu, because only it has an `href` for Chrome to act on.

It also catches `SO-365` written without the `#`, and works on the Gorgias
subject line, so putting the SO number in the subject makes it clickable from
the ticket.

Two things it deliberately leaves alone: anything you can type in (the Gorgias
reply composer above all) and text already inside a link. Rewriting a composer
while someone is drafting would corrupt what they're typing.

New rows added as you scroll or filter get linked too — it watches for DOM
changes rather than only running once at page load.

### WorkMate needs one extra click to enable

Gorgias works the moment you reload the extension. WorkMate does not, and the
reason is worth knowing: it's a Shopify **embedded** app, so although the address
bar says `admin.shopify.com`, the actual work-orders table is served from the
vendor's own domain inside an iframe. A content script allowed on
`admin.shopify.com` cannot see inside it.

Rather than hardcode a guess at that domain, the extension detects it. Open
Shopify admin, then open the toolbox gear — under **SO number links** you'll see
the frame it spotted (something like `app.workmatepos.co`) with an **Enable**
button. Click it, approve Chrome's permission prompt, reload the WorkMate tab,
and the numbers become links.

That prompt is Chrome asking whether to let the extension read that one domain.
Nothing is enabled behind your back, and **Turn off** revokes it again.

## Showing and hiding tools

Under the gear, **Tools** has a checkbox per tool. Unchecking one removes its tab
from the bar entirely — so someone whose role only touches tickets can run with
just Gorgias, and nobody carries tabs they'll never open.

- At least one tool must stay enabled; the last one can't be switched off.
- `Ctrl+1`–`4` renumber to whatever is visible, so the shortcuts stay correct.
- If the tool you had open gets hidden, the toolbox falls back to the first
  visible one.
- Turning off Help Center also stops the article crawl — no point indexing for a
  tab that isn't there.

Settings are per-install, so each person sets their own.

## Themes

Nine palettes under the gear, applied instantly. **META Red** is the default —
black / red / white, sampled from metapcs.com.

| Theme | |
|---|---|
| **META Red** *(default)* | The main site's palette — near-black panels, `#e02020` red |
| **Volt** | Black with the `#c8ff00` lime that also appears on metapcs.com |
| **Midnight** | The original blue build, kept as an option |
| **Hot Pink** | `#ff4d9d` on deep plum |
| **Ember** | Warm orange on brown-black |
| **Emerald** | Green on near-black |
| **Violet** | Purple on deep indigo |
| **Arctic** | Cyan on dark slate |
| **Daylight** | Light mode — the same red/white identity, inverted for bright rooms |

The logo stays META red in every theme; it's a logo, not an accent.

Your choice is saved in `chrome.storage` and mirrored into `localStorage`, which
`theme-init.js` reads in `<head>` before the popup paints — so switching themes
never causes a flash of the previous palette on open.

Every colour in `popup.css` is a token, so adding a tenth theme means one
`:root[data-theme="..."]` block plus one line in `lib/themes.js`.

## Pinning

The pin button (top right, left of the gear) opens the toolbox as its own
movable, resizable window. Close that window to return to the side panel.

The side panel stays available as you switch tabs. Use the separate window when
you want to position or resize the toolbox independently.

It parks against the right edge of your screen so it sits *beside* the browser
rather than behind it. Chrome has no always-on-top API, so if you drag it on top
of the browser window it will fall behind when you click the browser — keep it
off to the side and it stays visible.

While a pinned window is open, clicking the toolbar icon (or Alt+Shift+M) focuses
it instead of opening a second copy.

## A note on "mini window"

UPS, FedEx and Shopify all send `X-Frame-Options` / `frame-ancestors` headers that
forbid their pages being embedded inside another page. No extension can iframe them
into the side panel — that's enforced by the carriers' servers, not by Chrome.

So **mini window** means a small, separate Chrome window (sized like a phone for
tracking, wider for Shopify admin) that opens beside your current tab and leaves it
untouched. **Full tab** opens normally. You can set the default for each tool under
the gear.

If you want the ETA rendered *inside* the side panel with no second window at all, that
needs official carrier APIs — a UPS developer account and a FedEx developer account,
each giving OAuth credentials. That's a real option, it just requires those accounts
first.

## Files

```
manifest.json      extension config, permissions, Alt+Shift+M shortcut
background.js      crawls help.metapcs.com and caches the article index
theme-init.js      applies the saved theme before first paint
popup.html/css/js  the three-tab dashboard
lib/search.js      relevance ranking, snippets, highlighting
lib/carriers.js    UPS/FedEx number detection + tracking URLs
lib/workmate.js    SO number parsing + URL building
lib/gorgias.js     ticket id parsing + URL building
content/linkify.js turns SO-#numbers on pages into real links
content/linkify.css styling for those injected links
lib/themes.js      theme catalogue for the picker
icons/             the META PC mark, drawn crisp at 16/32/48/128
```

The extension reads `help.metapcs.com` to build the article index, and runs the
SO linkifier on Shopify admin and Gorgias. It reads no other site unless you
explicitly enable one under **SO number links**.

### If it looks like nothing is happening

Settings has **Show diagnostic badge**, on by default. It puts a small red pill
in the bottom-left corner of Shopify admin and Gorgias:

| What you see | What it means |
|---|---|
| No badge at all | The content script is not running on that page — an extension or site-access problem, not a matching problem |
| `MPT 0 SO` | It is running, but nothing in the DOM matched |
| `MPT 14 SO` | Working — those numbers are live |

Click the badge to hide it on that page, or switch it off in Settings once
things are working.

If there is no badge, check `chrome://extensions` -> **META PC Toolbox** ->
**Details** -> **Site access**. If that is set to "On click", Chrome blocks the
content script until you click the extension icon; set it to **On all sites**.
