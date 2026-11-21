// BibTeX bibliography and in-text citations for the LaTeX theme.
// This file is named as bib-citation.js intentionally, to avoid confusion with
// the well-known citation.js library.
//
// Load it beside markdeep2.min.js, configure the database once at the top of
// the document, and put a <bib-list> element where the reference list belongs:
//
//   <script>window.citationConfig = { bibFile: "./reference.bib" };</script>
//   <script src="./bib-citation.js" defer></script>
//
//   ...
//
//   <bib-list></bib-list>
//
// <bib-list src="other.bib"></bib-list> overrides the configured file.
// In-text citations are written as <bib-cite>smith2024, jones2023</bib-cite>;
// the legacy <span class="citation" data-cite="a,b"> form still works.

(function () {
    "use strict";

    const DEFAULT_BIB_FILE = "./reference.bib";

    // Element attribute first, then the document-wide configuration.
    function bibFileFor(element) {
        return element.getAttribute("src") ||
            (window.citationConfig && window.citationConfig.bibFile) ||
            DEFAULT_BIB_FILE;
    }

    async function loadBibliography(bibliography, bibFile) {
        const styleSelect = document.getElementById("citation-style");

        // 1. Load Citation.js and its BibTeX/CSL plugins
        const { Cite } = await import("https://esm.sh/@citation-js/core");
        await import("https://esm.sh/@citation-js/plugin-bibtex");
        await import("https://esm.sh/@citation-js/plugin-csl");

        // 2. Read and parse the BibTeX file
        const response = await fetch(bibFile);
        if (!response.ok) {
            throw new Error("Cannot load " + bibFile);
        }
        const bibtex = await response.text();
        const cite = new Cite(bibtex);

        // 3. Render bibliography and citations
        function renderCitations() {
            // A style fallback to Vancouver. Currently only consider the builtin 
            // `apa` and `vancouver` styles (in en-US).
            const style = styleSelect ? styleSelect.value : "vancouver";
            const template = style === "apa" ? "apa" : "vancouver";

            // Number every key by its first appearance in the document. The
            // map also tells us which entries are actually cited: keys that
            // never appear stay out of it.
            const knownIds = new Set(cite.data.map(entry => entry.id));
            const actualNumberMap = Object.create(null);
            let actualCiteCount = 1;
            const citationElements = [...document.querySelectorAll(".citation")];
            const citationKeys = citationElements.map(element => {
                // Trim and split the citation keys.
                const keys = (element.dataset.cite || "")
                    .split(",")
                    .map(key => key.trim())
                    .filter(Boolean);
                // Only count the first appearance of each key.
                keys.forEach(key => {
                    if (knownIds.has(key) && !(key in actualNumberMap)) {
                        actualNumberMap[key] = actualCiteCount;  // Store the 1st appearance.
                        actualCiteCount += 1;                    // Increment the count.
                    }
                });
                return keys;
            });

            // Vancouver keeps the first-appearance order. APA is sorted by
            // key here; its CSL style sorts the reference list by author.
            const citedKeys = Object.keys(actualNumberMap);
            const orderedKeys = style === "vancouver"
                ? citedKeys.slice().sort(
                    (a, b) => actualNumberMap[a] - actualNumberMap[b])
                : citedKeys.slice().sort();
            const citationOrder = new Map(orderedKeys.map((key, index) => [key, index]));
            cite.sort((a, b) => {
                const aOrder = citationOrder.has(a.id) ? citationOrder.get(a.id) : Infinity;
                const bOrder = citationOrder.has(b.id) ? citationOrder.get(b.id) : Infinity;
                return aOrder === bOrder ? 0 : aOrder - bOrder;
            }, false);

            // Render only the cited entries. Passing them in first-appearance
            // order also makes Vancouver label them 1..N.
            // Details of the options below can be found in
            // https://citation.js.org/api/0.3/tutorial-output_formats.html
            bibliography.innerHTML = cite.format("bibliography", {
                format: "html",
                template: template,
                lang: "en-US",
                entry: orderedKeys  // Render only the cited entries.
            });

            // Update all in-text citations
            citationElements.forEach((element, index) => {
                const keys = citationKeys[index];
                if (style === "vancouver") {
                    // Lookup the actual appearance order.
                    const numbers = keys.map(key => actualNumberMap[key]);
                    if (numbers.some(number => !number)) {
                        element.textContent = "[Unknown reference]";
                    } else {
                        element.textContent =
                            "[" + [...new Set(numbers)].join(", ") + "]";
                    }
                } else {
                    // Render the APA citation.
                    element.textContent = cite.format("citation", {
                        template: "apa",
                        lang: "en-US",
                        entry: keys
                    });
                }
            });
        }

        // Initial rendering
        renderCitations();
        // Re-render when the citation style changes
        if (styleSelect) {
            styleSelect.addEventListener("change", renderCitations);
        }
    }

    class BibListElement extends HTMLElement {
        async connectedCallback() {
            if (this.initialized) {
                return;
            }
            this.initialized = true;
            const bibFile = bibFileFor(this);
            try {
                await loadBibliography(this, bibFile);
            } catch (error) {
                console.error("bib-citation.js error:", error);
                this.textContent =
                    "Unable to load references. Please check " + bibFile + ".";
            }
        }
    }

    // <bib-cite>smith2024, jones2023</bib-cite> keeps the keys readable in the
    // source; it becomes a normal .citation element for the renderer below.
    // Whitespace, commas and semicolons all separate keys, so a long list can
    // be wrapped over several lines.
    class BibCiteElement extends HTMLElement {
        connectedCallback() {
            if (this.classList.contains("citation")) {
                return;
            }
            const keys = (this.textContent || "")
                .split(/[\s,;]+/)
                .filter(Boolean);
            this.textContent = "";
            if (keys.length === 0) {
                return;
            }
            this.dataset.cite = keys.join(",");
            this.classList.add("citation");
        }
    }

    customElements.define("bib-list", BibListElement);
    customElements.define("bib-cite", BibCiteElement);
})();
