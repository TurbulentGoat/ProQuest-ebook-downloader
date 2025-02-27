// ==UserScript==
// @name         ProQuest ebook downloader
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Auto-save each page as you scroll and export all saved pages (in order) as a PDF.
// @match        *://*/*
// @grant        none
// @author       TG
// ==/UserScript==

(function() {
    'use strict';

    // Global storage for pages.
    // Key: page number (extracted from container id), Value: dataURL of the page image.
    let savedPages = {};

    // Helper: Convert an image element to a data URL via canvas.
    async function getDataUrl(img) {
        return new Promise((resolve, reject) => {
            try {
                // Wait until the image is fully loaded.
                if (!img.complete) {
                    img.onload = () => processImage();
                    img.onerror = reject;
                } else {
                    processImage();
                }
                function processImage() {
                    const canvas = document.createElement("canvas");
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL("image/jpeg"));
                }
            } catch (err) {
                reject(err);
            }
        });
    }

    // Process a page container if it hasn't been saved yet.
    async function processContainer(container) {
        // Extract page number from container id (e.g., "mainPageContainer_1").
        let parts = container.id.split("_");
        if (parts.length < 2) return;
        let pageNum = parseInt(parts[1], 10);
        if (savedPages[pageNum]) return; // Already saved

        // Find the image inside the container.
        let img = container.querySelector("img.mainViewerImg");
        if (!img) return;

        console.log(`Saving page ${pageNum}...`);
        try {
            let dataUrl = await getDataUrl(img);
            savedPages[pageNum] = dataUrl;
            console.log(`Page ${pageNum} saved.`);
        } catch (err) {
            console.error(`Error saving page ${pageNum}:`, err);
        }
    }

    // Use IntersectionObserver to watch page containers.
    let observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                processContainer(entry.target);
            }
        });
    }, { threshold: 0.5 }); // Trigger when 50% visible

    // Observe existing and future page containers.
    function observePageContainers() {
        // Observe any existing page containers.
        let containers = document.querySelectorAll("div[id^='mainPageContainer_']");
        containers.forEach(container => observer.observe(container));

        // In case new containers are added dynamically, use a MutationObserver.
        let mo = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.id && node.id.startsWith("mainPageContainer_")) {
                            observer.observe(node);
                        }
                        let nested = node.querySelectorAll("div[id^='mainPageContainer_']");
                        nested.forEach(el => observer.observe(el));
                    }
                });
            });
        });
        mo.observe(document.body, { childList: true, subtree: true });
    }

    observePageContainers();

    // Create the export button.
    var exportBtn = document.createElement("button");
    exportBtn.textContent = "Export PDF";
    exportBtn.style.position = "fixed";
    exportBtn.style.top = "10px";
    exportBtn.style.right = "10px";
    exportBtn.style.zIndex = "10000";
    exportBtn.style.padding = "10px 15px";
    exportBtn.style.backgroundColor = "#007BFF";
    exportBtn.style.color = "#fff";
    exportBtn.style.border = "none";
    exportBtn.style.borderRadius = "5px";
    exportBtn.style.cursor = "pointer";
    document.body.appendChild(exportBtn);

    // Dynamically load jsPDF library.
    function loadScript(url) {
        return new Promise((resolve, reject) => {
            let script = document.createElement("script");
            script.src = url;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // When export button is clicked, generate the PDF.
    exportBtn.addEventListener("click", async function() {
        exportBtn.disabled = true;
        exportBtn.textContent = "Exporting PDF...";

        // Brief delay to allow any last page to process.
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Collect saved pages and sort them by page number.
        let pages = Object.keys(savedPages)
            .map(n => parseInt(n, 10))
            .sort((a, b) => a - b)
            .map(num => savedPages[num]);

        if (pages.length === 0) {
            alert("No pages saved yet!");
            exportBtn.disabled = false;
            exportBtn.textContent = "Export PDF";
            return;
        }

        // Use the dimensions of the first page for the PDF.
        let tempImg = new Image();
        tempImg.src = pages[0];
        await new Promise(resolve => { tempImg.onload = resolve; });
        let pageWidth = tempImg.naturalWidth;
        let pageHeight = tempImg.naturalHeight;

        // Load jsPDF and create the PDF.
        loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js").then(async () => {
            const { jsPDF } = window.jspdf;
            let pdf = new jsPDF({
                orientation: (pageWidth > pageHeight) ? "landscape" : "portrait",
                unit: "px",
                format: [pageWidth, pageHeight]
            });

            // Add each saved page as a new PDF page.
            for (let i = 0; i < pages.length; i++) {
                if (i > 0) {
                    pdf.addPage([pageWidth, pageHeight], (pageWidth > pageHeight ? "landscape" : "portrait"));
                }
                pdf.addImage(pages[i], 'JPEG', 0, 0, pageWidth, pageHeight);
            }

            pdf.save("ebook.pdf");
            exportBtn.disabled = false;
            exportBtn.textContent = "Export PDF";
        }).catch(err => {
            console.error("Error loading jsPDF:", err);
            exportBtn.disabled = false;
            exportBtn.textContent = "Export PDF";
        });
    });
})();
