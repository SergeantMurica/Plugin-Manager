# Work Mate Assistant

Chrome Manifest V3 extension for managing a Shopify Admin Work Mate work order from the browser toolbar. The popup includes check-in, device-specific service plans, technician responses, callback notes, and the shared Techbay tool themes.

## Install for local use

1. Open `chrome://extensions` in Chrome or a Chromium-based browser.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select this `techbay-planner-plugin` folder.
4. Open a Shopify Admin Work Mate URL such as `/apps/work-mate/work-orders/SO-%231774`, then open the extension from the toolbar.

## Use

Use **Check in** for device details and check-in notes, and **Choose this service** for technician service plans.

## Local work order list and Daily updates

- The assistant follows the active browser tab. An individual Work Mate order shows the check-in/service assistant; any other page shows the locally saved order list.
- Open a Work Mate list and click **Pull visible list / order**. Grant embedded Work Mate access when prompted. Visible rows and their displayed columns are saved in `chrome.storage.local`; visit other locations, filters, or pages and pull again to collect those rows. This does not fetch unvisited pages.
- **Location / saved list** keeps each captured location/filter combination separate. Switching Work Mate tabs and pulling creates/selects that saved view. Sorting and pagination remain part of the same view; location, status, search, and custom filters distinguish views. Names come from the selected Work Mate tab when available, otherwise the captured location or filter ID. Use **Rename list** to give any view a friendly name and **Open source list** to reopen its original filtered URL in a new tab.
- Saved views accumulate captured rows across pages, not a live synchronized roster: orders previously captured remain until extension storage is cleared. An order can belong to multiple views, but its edits and audit history are shared. **All saved orders** includes older captures that have not yet been assigned to a view; pull each Work Mate tab again to group those orders without losing drafts. Saved view names, memberships, and selection survive closing the panel.
- Opening an order captures the available labeled general/custom fields, including notes, without products. Check-in notes are kept separately for each order URL; existing unassigned notes remain in the notes selector. Use **Pull current order fields into this note** to populate check-in fields from the page. This does not parse or replace the original Note. Use **Show saved list** to view all captured fields or pull the current order again. **Follow active tab** returns to automatic mode.
- Search saved orders, edit each **Daily update**, and click **Save local draft**. Other labeled fields can be edited under **Order fields and audit history**; changes are saved locally when the field loses focus. Local drafts survive closing the panel and browser restarts, and later captures do not overwrite them.
- Click an order number to open it in a **new tab**.
- **Fill Daily update** opens the selected order in a background tab and fills its local Daily update draft (or captured value). **Fill all local edits** fills only edited fields. **Fill saved fields** fills captured non-note fields with local edits applied, so you can inject a pulled snapshot without editing it first. A captured snapshot may be older than the current order; review before saving. Empty edits clear non-note text fields. Products are never included.
- **All notes are append-only.** Captured Note, Tech Notes, Callback Notes, and Hidden note text is read-only in the list. Their editing boxes accept only new text to append. Filling saved fields does not replay captured note history. Where Work Mate keeps Tech Notes/Callback Notes inside the main Note, new entries are appended there with their section heading. Existing text (including trailing whitespace) is retained, and an empty addition never clears a note.
- **Fill Daily update drafts in this list** processes only saved Daily update drafts belonging to the selected location/list (or all orders if **All saved orders** is selected). Search text does not further limit the batch; confirmation shows the selected list and number of orders. It opens one background tab per order, reports failures separately, and still requires manual review/save in each tab.
- Injection **never clicks Save**. Open the background order tab, review the filled values, and save in Work Mate yourself. Missing fields/options are reported explicitly. Filling is logged as **not saved in Work Mate**, and local drafts remain available for retry.
- Audit history keeps the last 100 local revisions/injection attempts per order, with timestamps and technician initials for edits. Captured data, including notes and PINs, stays in this browser profile (not Chrome Sync); it is not encrypted by this extension. Clearing extension storage or uninstalling removes it.

## Validation

Run `node --test Plugins\techbay-planner-plugin\tests\orders.test.mjs Plugins\techbay-planner-plugin\tests\content.test.mjs` from the Plugin Manager repository root. The tests cover all three supplied list URLs, store isolation, local merge/audit behavior, empty edits, frame-targeted injection, and preserving existing Tech Notes/Callback Notes. Reload the extension after changing files.

After updating, reload **Plugin Manager** at `chrome://extensions` (or **Work Mate Assistant** if loaded standalone), close and reopen the side panel, and select **Work Mate Assistant**. The footer should read **Work Mate Assistant 1.1 / Local lists**. If that label is missing, the panel is still running the previous files. Filter parameters do not affect list-mode detection.
