// options.js
document.addEventListener("DOMContentLoaded", () => {
  // Tell PDF.js where its worker is
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    chrome.runtime.getURL("pdf.worker.min.js");

  const pdfInput    = document.getElementById("pdfInput");
  const statusEl    = document.getElementById("status");
  const previewEl   = document.getElementById("preview");
  const clearBtn    = document.getElementById("clearBtn");
  const testFillBtn = document.getElementById("testFillBtn");
  const testApiBtn  = document.getElementById("testApiBtn");
  const debugBtn    = document.getElementById("debugBtn");
  
  // Stats elements
  const wordCountEl = document.getElementById("wordCount");
  const charCountEl = document.getElementById("charCount");
  const emailCountEl = document.getElementById("emailCount");
  const phoneCountEl = document.getElementById("phoneCount");

  let debugMode = false;

  // Display stored resumeRaw and analyze it
  async function showPreview() {
    const { resumeRaw } = await chrome.storage.local.get("resumeRaw");
    if (resumeRaw) {
      statusEl.textContent = "✅ Resume text stored and ready to use!";
      statusEl.className = "status-success";
      
      // Show preview
      previewEl.textContent =
        resumeRaw.slice(0, 1000) +
        (resumeRaw.length > 1000 ? "\n…[truncated]" : "");
      
      // Analyze resume content
      analyzeResume(resumeRaw);
      
      // Enable test button
      testFillBtn.disabled = false;
    } else {
      statusEl.textContent = "📄 No resume stored. Please upload a PDF file.";
      statusEl.className = "status-info";
      previewEl.textContent = "(no data)";
      
      // Reset stats
      wordCountEl.textContent = "0";
      charCountEl.textContent = "0";
      emailCountEl.textContent = "0";
      phoneCountEl.textContent = "0";
      
      // Disable test button
      testFillBtn.disabled = true;
    }
  }

  // Analyze resume content and update stats
  function analyzeResume(text) {
    // Word count
    const words = text.trim().split(/\s+/).filter(word => word.length > 0);
    wordCountEl.textContent = words.length.toLocaleString();
    
    // Character count
    charCountEl.textContent = text.length.toLocaleString();
    
    // Email detection
    const emailMatches = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g);
    emailCountEl.textContent = emailMatches ? emailMatches.length : "0";
    
    // Phone detection
    const phoneMatches = text.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g);
    phoneCountEl.textContent = phoneMatches ? phoneMatches.length : "0";
  }

  showPreview();

  // When user selects a PDF, read its text and store it
  pdfInput.addEventListener("change", async () => {
    const file = pdfInput.files[0];
    if (!file) return;
    
    statusEl.textContent = "⏳ Reading PDF... Please wait.";
    statusEl.className = "status-info";
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let text = "";
      
      // Process each page
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(" ");
        text += pageText + "\n";
        
        // Update progress
        statusEl.textContent = `⏳ Processing page ${i}/${pdf.numPages}...`;
      }
      
      // Clean up the text
      text = text
        .replace(/\s+/g, " ")  // Normalize whitespace
        .replace(/([.!?])\s*([A-Z])/g, "$1 $2")  // Ensure proper sentence spacing
        .trim();
      
      await chrome.storage.local.set({ resumeRaw: text });
      statusEl.textContent = `✅ Resume processed successfully! (${text.length} characters)`;
      statusEl.className = "status-success";
      showPreview();
      
    } catch (err) {
      console.error("PDF read error:", err);
      statusEl.textContent = "❌ Failed to read PDF. Please try a different file.";
      statusEl.className = "status-error";
    }
  });

  // Clear the stored resume text
  clearBtn.addEventListener("click", async () => {
    if (confirm("Are you sure you want to clear your stored resume?")) {
      await chrome.storage.local.remove("resumeRaw");
      statusEl.textContent = "📄 Resume cleared.";
      statusEl.className = "status-info";
      showPreview();
      pdfInput.value = ""; // Clear file input
    }
  });

  // Toggle debug mode
  debugBtn.addEventListener("click", () => {
    debugMode = !debugMode;
    debugBtn.textContent = debugMode ? "🐛 Debug: ON" : "🐛 Debug Mode";
    debugBtn.style.backgroundColor = debugMode ? "#ff9800" : "#6c757d";
    
    // Store debug preference
    chrome.storage.local.set({ debugMode });
  });

  // Load debug mode preference
  chrome.storage.local.get("debugMode").then(({ debugMode: savedDebugMode }) => {
    if (savedDebugMode) {
      debugMode = true;
      debugBtn.textContent = "🐛 Debug: ON";
      debugBtn.style.backgroundColor = "#ff9800";
    }
  });

  // Test API connection
  testApiBtn.addEventListener("click", async () => {
    // ✅ Validate API configuration first
    if (!validateAPIKey()) {
      statusEl.textContent = "❌ API Key not configured! Please edit config.js and add your OpenRouter API key.";
      statusEl.className = "status-error";
      return;
    }
    
    testApiBtn.disabled = true;
    testApiBtn.textContent = "⏳ Testing API...";
    
    try {
      const response = await fetch(API_CONFIG.BASE_URL, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          model: API_CONFIG.MODEL,
          messages: [
            { role: "system", content: "You are a helpful assistant. Respond with a simple 'API test successful' message." },
            { role: "user", content: "Test API connection" }
          ],
          temperature: API_CONFIG.DEFAULT_TEMPERATURE,
          max_tokens: 50
        })
      });
      
      const data = await response.json();
      console.log("API Test Response:", data);
      
      if (response.ok && data.choices && data.choices[0]) {
        statusEl.textContent = "✅ API connection successful! Ready to fill forms.";
        statusEl.className = "status-success";
        testApiBtn.textContent = "✅ API Working!";
        
        // Show API response details
        const apiResponse = data.choices[0].message.content;
        console.log("API Response Content:", apiResponse);
        
        setTimeout(() => {
          testApiBtn.textContent = "🌐 Test API Connection";
          testApiBtn.disabled = false;
        }, 3000);
        
      } else {
        throw new Error(data.error?.message || `HTTP ${response.status}: ${response.statusText}`);
      }
      
    } catch (error) {
      console.error("API Test Error:", error);
      statusEl.textContent = `❌ API Error: ${error.message}`;
      statusEl.className = "status-error";
      testApiBtn.textContent = "❌ API Failed";
      
      // Provide specific error guidance
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        statusEl.textContent = "❌ API Key Invalid - Please check your OpenRouter API key";
      } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
        statusEl.textContent = "❌ API Access Denied - Check your OpenRouter account permissions";
      } else if (error.message.includes('429')) {
        statusEl.textContent = "❌ API Rate Limited - Too many requests, try again later";
      } else if (error.message.includes('Network')) {
        statusEl.textContent = "❌ Network Error - Check your internet connection";
      }
      
      setTimeout(() => {
        testApiBtn.textContent = "🌐 Test API Connection";
        testApiBtn.disabled = false;
      }, 5000);
    }
  });

  // Trigger form‑filling in content.js
  testFillBtn.addEventListener("click", async () => {
    testFillBtn.disabled = true;
    testFillBtn.textContent = "⏳ Processing...";
    
    try {
      const tabs = await chrome.tabs.query({ url: "*://docs.google.com/forms/*" });
      if (!tabs.length) {
        alert("❌ Please open a Google Form in another tab first.");
        return;
      }
      
      await chrome.tabs.sendMessage(tabs[0].id, { action: "fillForm", debugMode });
      testFillBtn.textContent = "✅ Form filled!";
      
      setTimeout(() => {
        testFillBtn.textContent = "🧪 Test Fill Current Form";
        testFillBtn.disabled = false;
      }, 2000);
      
    } catch (error) {
      console.error("Test fill error:", error);
      alert("❌ Error: Make sure you have a Google Form open and try again.");
      testFillBtn.textContent = "🧪 Test Fill Current Form";
      testFillBtn.disabled = false;
    }
  });
});
