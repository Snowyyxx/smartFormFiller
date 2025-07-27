// options.js
document.addEventListener("DOMContentLoaded", () => {
  // Tell PDF.js where its worker is
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    chrome.runtime.getURL("pdf.worker.min.js");

  const pdfInput   = document.getElementById("pdfInput");
  const statusEl   = document.getElementById("status");
  const previewEl  = document.getElementById("preview");
  const clearBtn   = document.getElementById("clearBtn");
  const testFillBtn= document.getElementById("testFillBtn");

  // Display stored resumeRaw (or placeholder)
  async function showPreview() {
    const { resumeRaw } = await chrome.storage.local.get("resumeRaw");
    if (resumeRaw) {
      statusEl.textContent = "✅ Resume text stored.";
      // show first 500 chars
      previewEl.textContent =
        resumeRaw.slice(0, 500) +
        (resumeRaw.length > 500 ? "\n…[truncated]" : "");
    } else {
      statusEl.textContent = "📄 No resume stored.";
      previewEl.textContent = "(no data)";
    }
  }

  showPreview();

  // When user selects a PDF, read its text and store it
  pdfInput.addEventListener("change", async () => {
    const file = pdfInput.files[0];
    if (!file) return;
    statusEl.textContent = "⏳ Reading PDF…";
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let text = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(" ") + "\n";
      }
      await chrome.storage.local.set({ resumeRaw: text });
      statusEl.textContent = "✅ Resume text stored.";
      showPreview();
    } catch (err) {
      console.error("PDF read error:", err);
      statusEl.textContent = "❌ Failed to read PDF.";
    }
  });

  // Clear the stored resume text
  clearBtn.addEventListener("click", async () => {
    await chrome.storage.local.remove("resumeRaw");
    statusEl.textContent = "📄 Cleared.";
    showPreview();
  });

  // Trigger form‑filling in content.js
  testFillBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      chrome.tabs.sendMessage(tabs[0].id, { action: "fillForm" });
    });
  });
});
