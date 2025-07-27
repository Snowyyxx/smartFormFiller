// popup.js
document.addEventListener("DOMContentLoaded", () => {
  const settingsBtn = document.getElementById("settingsBtn");
  const fillBtn     = document.getElementById("fillBtn");

  // 1) Open the Options page in a new tab
  settingsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // 2) Send the fillForm message to any docs.google.com/forms tab
  fillBtn.addEventListener("click", () => {
    chrome.tabs.query({ url: "*://docs.google.com/forms/*" }, tabs => {
      if (!tabs.length) {
        alert("❌ Open a Google Form before clicking Fill Form.");
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, { action: "fillForm" });
    });
  });
});
