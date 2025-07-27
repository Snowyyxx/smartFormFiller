// popup.js
document.addEventListener("DOMContentLoaded", () => {
  const settingsBtn = document.getElementById("settingsBtn");
  const fillBtn     = document.getElementById("fillBtn");
  const statusEl    = document.getElementById("status");

  // Check if resume is stored and update UI
  chrome.storage.local.get("resumeRaw").then(({ resumeRaw }) => {
    if (!resumeRaw) {
      fillBtn.disabled = true;
      fillBtn.innerHTML = '<span class="icon">❌</span><span>No Resume Uploaded</span>';
      statusEl.textContent = "Please upload your resume first";
      statusEl.style.background = "rgba(244, 67, 54, 0.2)";
    } else {
      statusEl.textContent = "Resume loaded - ready to fill forms!";
      statusEl.style.background = "rgba(76, 175, 80, 0.2)";
    }
  });

  // 1) Open the Options page in a new tab
  settingsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // 2) Send the fillForm message to any docs.google.com/forms tab
  fillBtn.addEventListener("click", async () => {
    if (fillBtn.disabled) return;
    
    fillBtn.disabled = true;
    fillBtn.innerHTML = '<span class="icon">⏳</span><span>Processing...</span>';
    statusEl.textContent = "Analyzing form and filling fields...";
    
    try {
      const tabs = await chrome.tabs.query({ url: "*://docs.google.com/forms/*" });
      if (!tabs.length) {
        statusEl.textContent = "❌ Please open a Google Form first";
        statusEl.style.background = "rgba(244, 67, 54, 0.2)";
        setTimeout(() => {
          fillBtn.innerHTML = '<span class="icon">✨</span><span>Fill Current Form</span>';
          fillBtn.disabled = false;
          statusEl.textContent = "Ready to fill forms!";
          statusEl.style.background = "rgba(255, 255, 255, 0.1)";
        }, 3000);
        return;
      }
      
      // Check if resume exists
      const { resumeRaw } = await chrome.storage.local.get("resumeRaw");
      if (!resumeRaw) {
        statusEl.textContent = "❌ Please upload your resume first";
        statusEl.style.background = "rgba(244, 67, 54, 0.2)";
        chrome.runtime.openOptionsPage();
        setTimeout(() => {
          fillBtn.innerHTML = '<span class="icon">✨</span><span>Fill Current Form</span>';
          fillBtn.disabled = false;
        }, 2000);
        return;
      }
      
      await chrome.tabs.sendMessage(tabs[0].id, { action: "fillForm" });
      fillBtn.innerHTML = '<span class="icon">✅</span><span>Form Filled!</span>';
      statusEl.textContent = "✅ Form filled successfully!";
      statusEl.style.background = "rgba(76, 175, 80, 0.2)";
      
      setTimeout(() => {
        fillBtn.innerHTML = '<span class="icon">✨</span><span>Fill Current Form</span>';
        fillBtn.disabled = false;
        statusEl.textContent = "Ready to fill more forms!";
        statusEl.style.background = "rgba(255, 255, 255, 0.1)";
      }, 3000);
      
    } catch (error) {
      console.error("Error filling form:", error);
      fillBtn.innerHTML = '<span class="icon">❌</span><span>Error Occurred</span>';
      statusEl.textContent = "❌ Error: Check Google Form page";
      statusEl.style.background = "rgba(244, 67, 54, 0.2)";
      
      setTimeout(() => {
        fillBtn.innerHTML = '<span class="icon">✨</span><span>Fill Current Form</span>';
        fillBtn.disabled = false;
        statusEl.textContent = "Ready to try again!";
        statusEl.style.background = "rgba(255, 255, 255, 0.1)";
      }, 3000);
    }
  });
});
