# Work Mate Assistant

Chrome Manifest V3 extension for managing a Shopify Admin Work Mate work order from the browser toolbar. The popup includes check-in, device-specific service plans, technician responses, callback notes, and the shared Techbay tool themes.

## Install for local use

1. Open `chrome://extensions` in Chrome or a Chromium-based browser.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select this `techbay-planner-plugin` folder.
4. Open a Shopify Admin Work Mate URL such as `/apps/work-mate/work-orders/SO-%231774`, then open the extension from the toolbar.

## Use

Use **Check in** for device details and check-in notes, and **Choose this service** for technician service plans.

The `/apps/work-mate/work-orders/new` page also opens the check-in assistant before an order number exists. Fill the check-in details, click **Fill Check-in and append note**, then review the page, choose the customer/location, and create the order in Work Mate. The extension never clicks Create or Save. Entering the new-order route starts a fresh assistant note rather than reusing the previous customer's new-order draft.

## Pull-only work order list and Daily updates

- The assistant follows the active browser tab to choose its view, but **never automatically pulls or stores order/list data**. An individual Work Mate order shows the check-in/service assistant; other pages show the temporary list.
- Open the desired Work Mate location/filter tab and click **Pull visible list / order**. Grant embedded Work Mate access when prompted. The pull reads only the rows currently on the page and replaces the previous snapshot, including its temporary edits and audit history. It never accumulates orders from other pages or locations.
- Switching browser tabs or changing the active page URL clears the snapshot until you pull again. Same-page loading/focus events do not trigger another pull. Closing/reloading the panel discards snapshots. Old captured orders, saved lists, list drafts, and list audit histories from previous versions are removed from extension storage on startup; check-in/service notes, initials, and theme settings are kept.
- The snapshot heading uses the selected Work Mate tab name when available, otherwise its location/filter ID. To work on another location, select that tab in Work Mate and pull it. There is no saved-location dropdown or persistent captured order list.
- **Pull current order fields into this note** explicitly reads available labeled general/custom fields into the check-in form. Check-in/service notes still save separately per order URL; the original Work Mate Note is not parsed or replaced. **Show pulled list** shows the temporary snapshot. **Follow active tab** returns to the view appropriate for the active page.
- Search pulled orders and edit **Daily updates**. Changes are kept in memory when the field loses focus or you click **Keep temporary draft**. Other labeled fields can be edited under **Order fields and audit history**. None of these list edits or audit entries are written to local storage.
- Click an order number to open it in a **new tab**.
- **Fill Daily update** fills its temporary draft (or pulled value) in a new background order tab. **Fill edited fields** fills only edited fields. **Fill pulled fields** fills pulled non-note fields with temporary edits applied. A snapshot may be older than the current order; review before saving. Empty edits clear non-note text fields. Products are never included.
- **All notes are append-only.** Pulled Note, Tech Notes, Callback Notes, and Hidden note text is read-only in the list; editing boxes accept only additions. Filling pulled fields does not replay note history. Where Work Mate keeps Tech Notes/Callback Notes inside the main Note, new entries are appended there with their heading. Existing text, including trailing whitespace, is retained; empty additions never clear notes.
- **Fill Daily update drafts in this list** processes only edited Daily updates in the current snapshot. Search text does not further limit the batch. Confirmation shows the snapshot name and count. It opens one background tab per order, reports failures separately, and requires manual review/save in each tab.
- Injection **never clicks Save**. Open the background order tab, review values, and save in Work Mate yourself. Missing fields/options are reported explicitly. Temporary audit history holds the last 100 edits/fills per order until the snapshot is cleared.

## Validation

Run `node --test Plugins\techbay-planner-plugin\tests\orders.test.mjs Plugins\techbay-planner-plugin\tests\content.test.mjs Plugins\techbay-planner-plugin\tests\snapshot.test.mjs` from the repository root. Tests cover routes, injection, preserving notes, pull-only behavior, replacement snapshots, stale response rejection, and deletion of old captures without deleting saved technician notes.

After updating, reload **Plugin Manager** at `chrome://extensions` (or **Work Mate Assistant** if loaded standalone), close/reopen the side panel, and select **Work Mate Assistant**. The footer should read **Work Mate Assistant 1.1 / Pull-only lists**. If that label is missing, the panel is running previous files.
