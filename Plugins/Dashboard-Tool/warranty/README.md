# Warranty contact tracking

On Shopify, click the warranty badge next to an order to log or change its
status, including **Called** and **Emailed**. The warranty team log also offers
these statuses in each order's status menu.

The order's owner can choose **Unclaim · Not contacted** in either menu. This
removes the order from the team log and shows **Not contacted** on Shopify;
another teammate can then log it under their own name. Unclaiming is distinct
from removing an order from the list with the × button, which keeps it marked
as contacted on Shopify.

Unclaimed orders remain as hidden shared records so incremental synchronization
can update other devices. Teammates need the updated extension to recognize
the Called, Emailed, and Not contacted statuses.

Run the warranty tests from the repository root:

```powershell
node --test Plugins\Dashboard-Tool\warranty\warranty-status.test.cjs Plugins\Dashboard-Tool\warranty\shopify-status.test.cjs Plugins\Dashboard-Tool\warranty\team-log-status.test.cjs
```
