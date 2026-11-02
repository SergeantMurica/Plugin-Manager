# My runs work-order notes

The Dashboard Tool adds **Work order notes** beside Runs and Benches on both
`dash.metapcs.com/my-runs` and `metapcs-platform.web.app/my-runs`, including SO#
visit pages. Rebuild the Plugin Manager with `node build.js`, reload the extension,
and refresh open Dash pages after installing this change.

1. Open Runs or an SO# visit, then select **Work order notes**.
2. Select a loaded work order, or enter an SO# in **Search SO#** and press Enter
   or **Open SO#**. Search accepts `2190`, `SO# 2190`, or `#2190` and opens that
   visit's full history with the notes tab selected, even if it is not in the
   loaded list. Dash handles access and missing work orders. Drafts are saved
   before navigating. Enter the note date and initials and choose runs to include.
3. Make any additional edits directly in the generated notes preview.
4. Select **Regenerate notes** after changing fields or run selection. Regeneration
   replaces preview edits after confirmation.
5. Review and edit the preview, then select **Copy notes**. Paste into the work
   order yourself; this feature never submits or changes the work order.

The selected SO# groups runs and drafts but is not printed in generated notes.
On wide screens, the scrollable run list sits alongside
a larger notes editor with copy/regenerate controls above it. Smaller screens
stack these sections without horizontal scrolling.
Run selection and generated notes list tests oldest to newest by run timestamp,
with undated runs last.
Notes are customer-facing: warnings are short plain-language summaries, with
duplicate summaries combined within each run. Unrecognized warning details are
omitted without changing the recorded test result or adding a generic review notice.
Not-tested items and attention/fault banners are omitted from generated notes;
the original details remain available on Dash.
Repeated tests, failures, and inconclusive/interrupted results remain included.
Actual durations and individual run timestamps appear only in the run selection
list, not generated notes. Test names are preserved. BIOS, drivers, TechOS
boot, QC completion, and RFP are never inferred from tests.

The date, initials, and editable preview are saved in extension-local storage per
Dash origin and SO#. Close and reopen the tab to refresh the loaded run data.
Restored previews are not automatically regenerated, so edits are preserved;
regenerate to incorporate the newly loaded data. Run checkbox selections reset
to all loaded runs when reopening. Nothing is sent to an external service.

Run the model tests with `node --test Plugins/Dashboard-Tool/my-runs/notes-model.test.cjs`.
