# Coursedog Bulk Learning Outcomes Importer

Tampermonkey userscript for creating Coursedog learning outcome drafts from a CSV file.

## Install

1. Install and enable [Tampermonkey](https://www.tampermonkey.net/).
2. Open the userscript: [coursedog-auto-create-los.user.js](https://github.com/alt-cs-lab/raw/refs/heads/main/coursedog-lo-bulk-create/coursedog-auto-create-los.user.js).
3. In Tampermonkey, choose **Install** and confirm the script is enabled.
4. Open Coursedog at `https://app.coursedog.com/` and navigate to Learning Outcomes.

The install link points to the actual `.user.js` filename. If the file opens as source code instead of an install page, copy its contents into a new Tampermonkey script and save it.

Note: Once done with the script, you can toggle it off through tampermonkey or uninstall entirely to hide the import buttons (they can cover other elements on the page when doing other tasks in coursedog).

## CSV Format

The first row must contain these headers:

```csv
name,description,department,startTerm,attributeLevel,learningOutcomeLevel
```

Required columns:

- `name`
- `description`
- `department`

Optional columns:

- `startTerm`
- `attributeLevel`
- `learningOutcomeLevel`

Use the exact department name as it appears in Coursedog. The importer searches the `Departments` multiselect and selects the matching result. Surrounding quotes around a value are removed before it is entered.

## Import Workflow

1. Open the Learning Outcomes page in Coursedog.
2. Click **Import LO CSV**.
3. Select the CSV file.
4. Review the populated form and click **Continue** to create the next proposal.
5. Use **Show Import Progress** to reconcile progress with the learning outcome currently displayed in the form.
6. Use **Skip** to discard the current queued row, **Cancel Import** to clear the queue, or **Close** to hide the progress modal without changing import state.

The script saves each learning outcome as a draft and keeps the queue in browser `localStorage`, allowing the import to resume after navigation or a page refresh.

## Troubleshooting

- Keep the Coursedog tab open while an import is running.
- If a department cannot be found, verify its spelling and capitalization against the Coursedog department list.
- Do not start a second import while one is already queued; selecting a new CSV replaces the existing queue.
- If the script does not appear, confirm Tampermonkey is enabled for `app.coursedog.com` and reload the page.
