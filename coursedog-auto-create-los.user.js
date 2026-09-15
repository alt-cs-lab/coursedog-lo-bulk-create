// ==UserScript==
// @name         Coursedog Learning Outcome Importer
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Import Learning Outcomes from CSV and save as draft
// @match        https://app.coursedog.com/*
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.6.1/papaparse.min.js
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = "cd_learning_outcome_queue";
    const TOTAL_KEY = "cd_learning_outcome_total";
    const CURRENT_ROW_KEY = "cd_learning_outcome_current";
    const SOURCE_KEY = "cd_learning_outcome_source";
    const REQUIRED_COLUMNS = ["name", "description", "department"];
    let progressActionPending = false;
    let autoCreateInProgress = false;

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    function setInput(element, value) {

        const prototype =
              element.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;

        const setter =
              Object.getOwnPropertyDescriptor(
                  prototype,
                  "value"
              ).set;

        setter.call(element, value);

        element.dispatchEvent(
            new Event("input", { bubbles: true })
        );

        element.dispatchEvent(
            new Event("change", { bubbles: true })
        );

        element.dispatchEvent(
            new Event("blur", { bubbles: true })
        );
    }

    function setSearchInput(element, value) {

        const setter =
            Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value"
            ).set;

        setter.call(element, value);

        element.dispatchEvent(
            new Event("input", { bubbles: true })
        );
    }

    function normalizeText(value) {
        return String(value ?? "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function getVisibleDepartmentOptions() {
        return [...document.querySelectorAll(
            ".multiselect__option, [role=\"option\"]"
        )]
            .filter(option => {
                const style = getComputedStyle(option);
                return style.display !== "none" &&
                    style.visibility !== "hidden";
            });
    }

    function parseCSV(text) {

        const result = Papa.parse(text, {
            header: true,
            skipEmptyLines: true,
            transformHeader: header => header.trim()
        });

        if (result.errors.length) {
            console.error(result.errors);
            throw new Error(
                "CSV parsing errors detected."
            );
        }

        const missingColumns = REQUIRED_COLUMNS.filter(
            column => !result.meta.fields?.includes(column)
        );

        if (missingColumns.length) {
            throw new Error(
                `CSV is missing required columns: ${missingColumns.join(", ")}`
            );
        }

        result.data.forEach((row, index) => {
            const missingValues = REQUIRED_COLUMNS.filter(
                column => !String(row[column] ?? "").trim()
            );

            if (missingValues.length) {
                throw new Error(
                    `CSV row ${index + 2} is missing: ${missingValues.join(", ")}`
                );
            }
        });

        return result.data;
    }

     async function selectOption(
    labelText,
     optionText
    ) {

        const field =
              [...document.querySelectorAll(
                  ".field-wrapper"
              )]
        .find(el =>
              el.textContent.includes(
            labelText
        )
             );

        if (!field) {
            throw new Error(
                `Missing field ${labelText}`
            );
        }

        const multiselect =
              field.querySelector(
                  ".multiselect"
              );

        if (!multiselect) {
            throw new Error(
                `No multiselect for ${labelText}`
            );
        }

        multiselect.click();

        await sleep(500);

        const options =
              [...document.querySelectorAll(
                  ".multiselect__option"
              )];

        console.log(
            options.map(o => o.textContent.trim())
        );
        const option =
              options.find(o =>
                           o.textContent.trim() === optionText
                          );

        option?.click();

        if (!option) {

            console.error(
                "Available options:",
                options.map(
                    x => x.textContent.trim()
                )
            );

            throw new Error(
                `Could not find option "${optionText}" for "${labelText}"`
            );
        }

        option.click();

        await sleep(500);
    }

    async function selectDepartment(departmentName) {

        departmentName = String(departmentName ?? "").trim();

        const field =
            [...document.querySelectorAll(
                ".field-wrapper"
            )]
            .find(el =>
                el.textContent.includes("Departments")
            );

        if (!field) {
            throw new Error(
                "Missing field Departments"
            );
        }

        const multiselect =
            field.querySelector(".multiselect");

        if (!multiselect) {
            throw new Error(
                "No multiselect for Departments"
            );
        }

        multiselect.click();

        let searchInput;

        for (let attempt = 0; attempt < 10; attempt++) {
            searchInput =
                field.querySelector(".multiselect__input");

            if (searchInput) {
                break;
            }

            await sleep(100);
        }

        if (!searchInput) {
            throw new Error(
                "Department search input not found"
            );
        }

        searchInput.focus();
        searchInput.click();
        setSearchInput(searchInput, departmentName);
        searchInput.dispatchEvent(
            new KeyboardEvent("keyup", {
                bubbles: true,
                key: departmentName.slice(-1)
            })
        );
        searchInput.dispatchEvent(
            new Event("change", { bubbles: true })
        );

        let options = [];

        for (let attempt = 0; attempt < 20; attempt++) {
            options = getVisibleDepartmentOptions();

            if (options.some(option =>
                normalizeText(option.textContent) ===
                normalizeText(departmentName)
            )) {
                break;
            }

            await sleep(250);
        }

        const option = options.find(candidate =>
            normalizeText(candidate.textContent) ===
            normalizeText(departmentName)
        );

        if (!option) {
            console.error(
                "Available department options:",
                options.map(candidate => candidate.textContent.trim())
            );

            throw new Error(
                `Could not find department "${departmentName}"`
            );
        }

        option.click();
        await sleep(500);
    }

    async function fillForm(row) {

        console.debug(row);
        const name =
              document.querySelector(
                  'input[data-test="name"]'
              );

        const description =
              document.querySelector(
                  'textarea[data-test="description"]'
              );

        if (!name) {
            throw new Error(
                "Name field not found"
            );
        }

        if (!description) {
            throw new Error(
                "Description field not found"
            );
        }
        console.debug(`Set name ${row.name}`);
        setInput(name, row.name);

        await sleep(100);
        console.debug(`Set desc ${row.description}`);
        setInput(
            description,
            row.description
        );

        await sleep(100);
        console.debug(`Set department ${row.department}`);
        await selectDepartment(row.department);

        await sleep(100);
        console.debug(`Set start ${row.startTerm}`);
        if (row.startTerm) {
            await selectOption(
                "Effective Start Term",
                row.startTerm
            );
        }
        console.debug(`Set attr ${row.attributeLevel}`);
        if (row.attributeLevel) {
            await selectOption(
                "Attribute Level",
                row.attributeLevel
            );
        }
        console.debug(`Set OL ${row.learningOutcomeLevel}`);
        if (row.learningOutcomeLevel) {
            await selectOption(
                "Learning Outcome Level",
                row.learningOutcomeLevel
            );
        }

        await sleep(100);
    }

    async function saveDraft() {

        const saveButton =
              document.querySelector(
                  '[data-test="save-actions-bar-save"]'
              );

        if (!saveButton) {
            throw new Error(
                "Save button not found"
            );
        }

        if (saveButton.disabled) {
            throw new Error(
                "Save button is disabled. Required fields may still be invalid."
            );
        }

        saveButton.click();

        console.log(
            "Draft save initiated."
        );

        await sleep(1000);
    }

    function createProgressModal() {

        let overlay =
            document.getElementById(
                "cd-import-overlay"
            );

        if (overlay) {

            overlay.style.display = "flex";

            return overlay;
        }
        overlay =
            document.createElement(
            "div"
        );

        overlay.id =
            "cd-import-overlay";

        overlay.style.cssText = `
            position:fixed;
            inset:0;
            background:rgba(0,0,0,.50);
            display:flex;
            justify-content:center;
            align-items:center;
            z-index:999999;
        `;

        overlay.innerHTML = `
            <div style="
                background:white;
                width:600px;
                max-width:90%;
                border-radius:8px;
                padding:24px;
                box-shadow:0 10px 30px rgba(0,0,0,.3);
            ">

                <h3 style="margin-top:0">
                    Learning Outcome Import
                </h3>

                <div id="cd-progress-text">
                    Waiting...
                </div>

                <div style="
                    margin-top:12px;
                    height:18px;
                    background:#eee;
                    border-radius:10px;
                    overflow:hidden;
                ">
                    <div id="cd-progress-bar"
                        style="
                            width:0%;
                            height:100%;
                            background:#0d6efd;
                            transition:width .3s;
                        ">
                    </div>
                </div>

                <div id="cd-status"
                    style="
                        margin-top:16px;
                        min-height:60px;
                    ">
                </div>

                <div style="
                    display:flex;
                    justify-content:flex-end;
                    gap:10px;
                    margin-top:20px;
                ">

                    <button id="cd-skip-btn">
                        Skip
                    </button>

                    <button id="cd-cancel-btn"
                        style="
                            background:#dc3545;
                            color:white;
                            border:none;
                            padding:8px 14px;
                            border-radius:4px;
                        ">
                        Cancel Import
                    </button>

                    <button id="cd-continue-btn"
                        style="
                            background:#198754;
                            color:white;
                            border:none;
                            padding:8px 14px;
                            border-radius:4px;
                        ">
                        Continue
                    </button>

                    <button id="cd-close-btn"
                        style="
                            background:#6c757d;
                            color:white;
                            border:none;
                            padding:8px 14px;
                            border-radius:4px;
                        "
                        type="button">
                        Close
                    </button>

                </div>

            </div>
        `;

        overlay.querySelector(
            "#cd-close-btn"
        ).onclick = () => {
            overlay.style.display = "none";
        };

        document.body.appendChild(
            overlay
        );

        return overlay;
    }

    function updateProgressModal(
    current,
     total,
     rowName,
     status
    ) {

        const percent =
              Math.round(
                  (current / total) * 100
              );

        document.getElementById(
            "cd-progress-text"
        ).innerHTML = `
            <strong>${current}</strong>
            of
            <strong>${total}</strong>

            <br><br>

            ${escapeHtml(rowName)}
        `;

        document.getElementById(
            "cd-progress-bar"
        ).style.width =
            `${percent}%`;

        document.getElementById(
            "cd-status"
        ).textContent =
            status.replaceAll(/<br\s*\/?>/gi, "\n");
    }

    function waitForUserAction() {

    progressActionPending = true;

    return new Promise(resolve => {

        document.getElementById(
            "cd-continue-btn"
        ).onclick = () =>
            resolveProgressAction(resolve, "continue");

        document.getElementById(
            "cd-skip-btn"
        ).onclick = () =>
            resolveProgressAction(resolve, "skip");

        document.getElementById(
            "cd-cancel-btn"
        ).onclick = () =>
            resolveProgressAction(resolve, "cancel");

    });
}

    function resolveProgressAction(resolve, action) {
        progressActionPending = false;
        resolve(action);
    }

    function continueToNextProposal() {
        localStorage.removeItem(CURRENT_ROW_KEY);

        sessionStorage.setItem(
            "cd_auto_new_proposal",
            "true"
        );

        window.location.href =
            "https://app.coursedog.com/#/cm/learningOutcomes";
    }

    function updateNextRowProgress(remaining, total) {
        const nextRow = remaining[0];

        if (!nextRow) {
            document.getElementById(
                "cd-status"
            ).textContent = "No rows remain.";
            return;
        }

        updateProgressModal(
            total - remaining.length,
            total,
            nextRow.name,
            "Preparing next row..."
        );
    }

    function syncProgressToForm() {

        const nameInput =
            document.querySelector(
                'input[data-test="name"]'
            );

        const formName =
            nameInput?.value.trim();

        if (!formName) {
            return {
                matched: false,
                message: "No learning outcome name is present in the form."
            };
        }

        const data =
            JSON.parse(
                localStorage.getItem(STORAGE_KEY) || "[]"
            );

        const source =
            JSON.parse(
                localStorage.getItem(SOURCE_KEY) || "[]"
            );

        const sourceIndex = source.findIndex(
            row => String(row.name ?? "").trim() === formName
        );

        if (sourceIndex !== -1) {
            const row = source[sourceIndex];
            const remaining = source.slice(sourceIndex + 1);

            localStorage.setItem(
                CURRENT_ROW_KEY,
                JSON.stringify(row)
            );

            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(remaining)
            );

            return {
                matched: true,
                row,
                remaining
            };
        }

        let currentRow = null;
        const currentRowText =
            localStorage.getItem(CURRENT_ROW_KEY);

        if (currentRowText) {
            currentRow = JSON.parse(currentRowText);
        }

        if (
            currentRow &&
            String(currentRow.name ?? "").trim() === formName
        ) {
            return {
                matched: true,
                row: currentRow,
                remaining: data
            };
        }

        const rowIndex = data.findIndex(
            row => String(row.name ?? "").trim() === formName
        );

        if (rowIndex === -1) {
            return {
                matched: false,
                message: `No queued row matches "${formName}".`
            };
        }

        const row = data[rowIndex];
        const remaining = data.slice(rowIndex + 1);

        localStorage.setItem(
            CURRENT_ROW_KEY,
            JSON.stringify(row)
        );

        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(remaining)
        );

        return {
            matched: true,
            row,
            remaining
        };
    }

    function addShowProgressButton() {

    if (
        document.getElementById(
            "cd-show-progress-btn"
        )
    ) {
        console.log("oops");
        return;
    }

    const btn =
        document.createElement("button");

    btn.id =
        "cd-show-progress-btn";

    btn.textContent =
        "Show Import Progress";

    btn.style.cssText = `
        position:fixed;
        top:50px;
        right:10px;
        z-index:999998;
        padding:10px;
        background:#198754;
        border:none;
        border-radius:5px;
        color:white;
        cursor:pointer;
    `;

    btn.onclick = () => {

        const overlay = createProgressModal();
        overlay.style.display = "flex";

        try {
            const progress = syncProgressToForm();
            const total = parseInt(
                localStorage.getItem(TOTAL_KEY),
                10
            );

            if (progress.matched && Number.isFinite(total)) {
                const completed =
                    total - progress.remaining.length;

                updateProgressModal(
                    completed,
                    total,
                    progress.row.name,
                    `Progress matched to the form. Remaining: ${progress.remaining.length}`
                );

                if (!progressActionPending) {
                    waitForUserAction().then(action => {
                        if (action === "continue") {
                            updateNextRowProgress(
                                progress.remaining,
                                total
                            );
                            continueToNextProposal();
                            return;
                        }

                        if (action === "skip") {
                            updateNextRowProgress(
                                progress.remaining,
                                total
                            );
                            continueToNextProposal();
                            return;
                        }

                        localStorage.removeItem(STORAGE_KEY);
                        localStorage.removeItem(TOTAL_KEY);
                        localStorage.removeItem(SOURCE_KEY);
                        localStorage.removeItem(CURRENT_ROW_KEY);

                        document.getElementById(
                            "cd-status"
                        ).textContent = "Import cancelled.";
                    });
                }
            } else {
                document.getElementById(
                    "cd-status"
                ).textContent = progress.message;
            }
        } catch (err) {
            document.getElementById(
                "cd-status"
            ).textContent = err.message;
        }
    };

    document.body.appendChild(
        btn
    );
}
    async function processQueue() {

        const data =
              JSON.parse(
                  localStorage.getItem(
                      STORAGE_KEY
                  ) || "[]"
              );

        if (!data.length) {
            return;
        }

        let row =
    JSON.parse(
        localStorage.getItem(
            CURRENT_ROW_KEY
        )
    );

if (!row) {

    row = data.shift();

    localStorage.setItem(
        CURRENT_ROW_KEY,
        JSON.stringify(row)
    );
}

        console.log(
            `Processing: ${row.name}`
        );

        try {

            await fillForm(row);

            await saveDraft();

            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(data)
            );

            localStorage.removeItem(CURRENT_ROW_KEY);

            const total =
                  parseInt(
                      localStorage.getItem(
                          TOTAL_KEY
                      )
                  );

            const completed =
                  total - data.length;

            console.log(`Total completed${completed}`);
            createProgressModal();

            updateProgressModal(
                completed,
                total,
                row.name,
                `
                    ✅ Saved successfully

                    <br><br>

                    Remaining:
                    ${data.length}
                `
            );

            if (!data.length) {

                localStorage.removeItem(
                    STORAGE_KEY
                );

                localStorage.removeItem(
                    TOTAL_KEY
                );

                localStorage.removeItem(SOURCE_KEY);

                localStorage.removeItem(CURRENT_ROW_KEY);

                document.getElementById(
                    "cd-status"
                ).innerHTML = `
                    ✅ Import Complete

                    <br><br>

                    All learning outcomes
                    have been processed.
                `;

                document.getElementById(
                    "cd-continue-btn"
                ).style.display =
                    "none";

                document.getElementById(
                    "cd-skip-btn"
                ).style.display =
                    "none";

                document.getElementById(
                    "cd-cancel-btn"
                ).textContent =
                    "Close";

                document.getElementById(
                    "cd-cancel-btn"
                ).onclick = () =>
                document
                    .getElementById(
                    "cd-import-overlay"
                )
                    ?.remove();

                return;
            }

            const action =
                  await waitForUserAction();

            if (action === "cancel") {

                localStorage.removeItem(
                    STORAGE_KEY
                );

                localStorage.removeItem(
                    TOTAL_KEY
                );

                localStorage.removeItem(SOURCE_KEY);

                localStorage.removeItem(CURRENT_ROW_KEY);

                updateProgressModal(
                    completed,
                    total,
                    row.name,
                    "❌ Import cancelled."
                );

                return;
            }

            if (action === "continue") {

                updateNextRowProgress(
                    data,
                    total
                );
                continueToNextProposal();

                return;
            }

            if (action === "skip") {

                localStorage.removeItem(CURRENT_ROW_KEY);
                sessionStorage.setItem(
                    "cd_auto_new_proposal",
                    "true"
                );
                window.location.href =
                    "https://app.coursedog.com/#/cm/learningOutcomes";
            }


        } catch (err) {

            console.error(err);

            createProgressModal();

            document.getElementById(
                "cd-status"
            ).innerHTML = `
                ❌ Error

                <br><br>

                ${escapeHtml(err.message)}
            `;
        }
    }

    function addImportButton() {

        if (
            document.getElementById(
                "cd-import-button"
            )
        ) {
            return;
        }

        const btn =
              document.createElement(
                  "button"
              );

        btn.id =
            "cd-import-button";

        btn.innerText =
            "Import LO CSV";

        Object.assign(
            btn.style,
            {
                position: "fixed",
                top: "10px",
                right: "10px",
                zIndex: 999999,
                padding: "10px",
                background: "#0066cc",
                color: "white",
                border: "none",
                borderRadius: "5px",
                cursor: "pointer"
            }
        );

        btn.onclick = () => {

            const input =
                  document.createElement(
                      "input"
                  );

            input.type = "file";
            input.accept = ".csv";

            input.onchange =
                async e => {

                try {

                const file =
                      e.target.files[0];

                if (!file) {
                    return;
                }

                const text =
                      await file.text();

                const data =
                      parseCSV(text);

                console.log(
                    `Loaded ${data.length} learning outcomes`
                );

                localStorage.setItem(
                    STORAGE_KEY,
                    JSON.stringify(data)
                );

                localStorage.setItem(
                    SOURCE_KEY,
                    JSON.stringify(data)
                );

                localStorage.removeItem(CURRENT_ROW_KEY);

                localStorage.setItem(
                    TOTAL_KEY,
                    data.length
                );

                processQueue();
                } catch (err) {
                    console.error(err);
                    createProgressModal();
                    document.getElementById(
                        "cd-status"
                    ).textContent = err.message;
                }
            };

            input.click();
        };

        document.body.appendChild(
            btn
        );
    }

    async function autoCreateNewProposalImpl() {

        if (
            sessionStorage.getItem(
                "cd_auto_new_proposal"
            ) !== "true"
        ) {
            console.debug("no auto-create");
            return;
        }

        console.log(
            "Creating next proposal..."
        );

        //
        // Step 1
        // Click Propose New Learning Outcome
        //
        for (let i = 0; i < 30; i++) {

            const proposeButton =
                  [...document.querySelectorAll(
                      "button"
                  )]
            .find(btn =>
                  btn.textContent.includes(
                "Propose New Learning Outcome"
            )
                 );

            if (proposeButton) {

                console.log(
                    "Found propose button"
                );

                proposeButton.click();

                break;
            }

            await sleep(1000);
        }

        //
        // Step 2
        // Wait for modal
        //
        let modal;

        for (let i = 0; i < 20; i++) {

            modal =
                [...document.querySelectorAll(
                    ".modal-content"
                )]
                .find(m =>
                      m.textContent.includes(
                "Select proposal form"
            )
                     );

            if (modal) {
                break;
            }

            await sleep(500);
        }

        if (!modal) {

            console.error(
                "Proposal modal not found"
            );

            return;
        }

        //
        // Step 3
        // Open form selector
        //
        const selectButton =
              modal.querySelector(
                  ".multiselect__select"
              );

        selectButton.click();

        await sleep(1000);

        //
        // Step 4
        // Choose Learning Outcomes New
        //
        const formOption =
              [...document.querySelectorAll(
                  '[aria-label="Learning Outcomes New"]'
              )]
        .find(el =>
              el.textContent.includes(
            "Learning Outcomes New"
        )
             );

        if (!formOption) {

            console.error(
                "Learning Outcomes New option not found"
            );

            return;
        }

        formOption.click();

        await sleep(1000);

        //
        // Step 5
        // Wait for Submit button to enable
        //
        let submitButton;

        for (let i = 0; i < 20; i++) {

            submitButton =
                [...modal.querySelectorAll(
                    "button"
                )]
                .find(btn =>
                      btn.textContent.trim() ===
                      "Submit"
                     );

            if (
                submitButton &&
                !submitButton.disabled
            ) {
                break;
            }

            await sleep(500);
        }

        if (
            !submitButton ||
            submitButton.disabled
        ) {

            console.error(
                "Submit button never enabled"
            );

            return;
        }

        //
        // Step 6
        // Submit
        //
        submitButton.click();

        console.log(
            "Submitted new LO proposal"
        );

        sessionStorage.removeItem(
            "cd_auto_new_proposal"
        );

        //
        // Step 7
        // Wait for form page
        //
        await sleep(4000);

        if (
            localStorage.getItem(
                STORAGE_KEY
            )
        ) {

            console.log(
                "Resuming import..."
            );

            processQueue();
        }
    }

    async function autoCreateNewProposal() {
        if (autoCreateInProgress) {
            return;
        }

        autoCreateInProgress = true;

        try {
            await autoCreateNewProposalImpl();
        } finally {
            autoCreateInProgress = false;
        }
    }

    addImportButton();
    addShowProgressButton();
    autoCreateNewProposal();
    window.addEventListener(
        "hashchange",
        () => autoCreateNewProposal()
    );

    if (
        localStorage.getItem(STORAGE_KEY) &&
        document.querySelector('input[data-test="name"]')
    ) {
        processQueue();
    }



})();