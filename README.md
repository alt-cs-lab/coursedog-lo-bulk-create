# Coursedog Bulk Learning Outcomes Importer

This script reads a CSV file and auto-creates learning outcomes in Coursedog.

The CSV must include these columns:

`name`, `description`, `department`, `startTerm`, `attributeLevel`, `learningOutcomeLevel`

`name`, `description`, and `department` are required. The other columns are optional.

# Quick Install
1. Install and enable the [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Install the script by clicking this link: [coursedog-auto-create-los.js](coursedog-auto-create-los.user.js)

# Instructions

Use the exact department name as it appears in Coursedog. The importer types the value into the searchable `Departments` multiselect and selects the matching result.
