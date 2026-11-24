# Warranty contact tracking

A warranty order can only be claimed from the side panel while its Pound list
lead is open and claimed on Dash (`dash.metapcs.com` or
`metapcs-platform.web.app`). Shopify badges still show every order, but they
can only change the status of an order that is already claimed; a **Not
contacted** order has no logging options there. The background worker enforces
this, so a Shopify page can never start a claim.

Once an order is claimed, click its Shopify badge to change its status,
including **Called** and **Emailed**. The warranty team log also offers these
statuses in each order's status menu. An archived tracker entry remains claimed:
changing its status on Shopify or Dash restores it to the active log without
changing its owner.

The order's owner can choose **Unclaim · Not contacted** in either menu. This
removes the order from the team log and shows **Not contacted** on Shopify;
another teammate can then claim it under their own name from its Dash lead.
Unclaiming is distinct from archiving with the × button. Archived orders remain
marked as contacted on Shopify and can be found under **Archived** in the team
log. Use **Restore** to return an entry to the active log and restart its status
timer.

Unclaimed orders remain as hidden shared records so incremental synchronization
can update other devices; they are not included in the archive.

## Warranty pricing

Choose either **Watercooled** or **Custom build**; leave both off for a normal
ready-to-ship (RTS) PC. Choosing one turns the other off. A manual selection is
kept when the Shopify order is read again. Custom build plans are $180 for two
years and $270 for three years per PC. Watercooled plans remain $499 and $799.

## Retention

- **Texted**, **Called**, and **Emailed** entries are archived after 30 days in
  their current status. Changing between these statuses restarts the timer;
  saving the same status does not. Other statuses are not automatically archived.
- An archived tracker entry is permanently deleted after 60 days unless it is
  restored or its status is updated. The archive shows its deletion date.
- The warranty tracker's **Paid** status is never archived or automatically
  deleted, and the archive button is unavailable for it. Previously hidden
  Paid entries are restored. This is separate from Shopify's payment status.
- The first updated extension to see an older archive without a reliable archive
  date starts a fresh 60-day grace period. Changes from older extension versions
  can also restart a timer conservatively, so all teammates should update.

Deletion removes the shared tracker entry and its cached, device-local customer
details as devices synchronize. It does **not** delete the Shopify order or
copies in drafts, exported files, or backups. Records with unsupported statuses
are excluded from automatic retention. Checks run while Chrome is open and a
user is signed in, including an hourly check while idle; anything due while
everyone is offline is processed at the next check. Firestore rules must allow
the signed-in user to update `statusSince`, `archivedAt`, and
`retentionUpdatedAt` and to delete tracker documents. Sync errors are reported
in the panel and background errors are logged.

Run the warranty tests from the repository root:

```powershell
node --test Plugins\Dashboard-Tool\warranty\warranty-status.test.cjs Plugins\Dashboard-Tool\warranty\shopify-status.test.cjs Plugins\Dashboard-Tool\warranty\team-log-status.test.cjs
```
