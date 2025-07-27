// config.js - Centralized API Configuration
// ===========================================
// 🔑 API CONFIGURATION
// ===========================================

/**
 * SETUP INSTRUCTIONS:
 * 
 * 1. Get your OpenRouter API key:
 *    - Go to https://openrouter.ai/
 *    - Sign up/Login to your account
 *    - Go to "Keys" section
 *    - Create a new API key
 * 
 * 2. Replace "YOUR_API_KEY_HERE" below with your actual API key
 * 
 * 3. Save this file
 * 
 * 4. Reload your extension in Chrome
 * 
 * That's it! All parts of the extension will now use your API key.
 */

const API_CONFIG = {
  // 🔑 REPLACE THIS WITH YOUR ACTUAL OPENROUTER API KEY
  API_KEY: "YOUR_API_KEY_HERE",
  
  // 🌐 API Settings (you can modify these if needed)
  BASE_URL: "https://openrouter.ai/api/v1/chat/completions",
  MODEL: "google/gemini-2.5-flash-lite",
  DEFAULT_TEMPERATURE: 0.0,
  
  // 📝 Request Headers
  HEADERS: {
    "Content-Type": "application/json",
    "HTTP-Referer": window.location?.origin || "chrome-extension://",
    "X-Title": "Smart Resume Form Filler"
  },
  
  // ⚙️ Advanced Settings
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // milliseconds
  MAX_TOKENS: 500
};

// 🔍 Validation function
function validateAPIKey() {
  if (!API_CONFIG.API_KEY || API_CONFIG.API_KEY === "YOUR_API_KEY_HERE") {
    console.error("❌ API Key not configured! Please edit config.js");
    return false;
  }
  
  if (!API_CONFIG.API_KEY.startsWith("sk-or-v1-")) {
    console.warn("⚠️ API Key format seems incorrect. OpenRouter keys should start with 'sk-or-v1-'");
  }
  
  return true;
}

// 📡 Helper function to get authorization header
function getAuthHeader() {
  return `Bearer ${API_CONFIG.API_KEY}`;
}

// 🌐 Helper function to get complete headers
function getHeaders() {
  return {
    ...API_CONFIG.HEADERS,
    "Authorization": getAuthHeader()
  };
}

// 📤 Export configuration for use in other files
if (typeof module !== 'undefined' && module.exports) {
  // Node.js environment
  module.exports = { API_CONFIG, validateAPIKey, getAuthHeader, getHeaders };
} else {
  // Browser environment - make available globally
  window.API_CONFIG = API_CONFIG;
  window.validateAPIKey = validateAPIKey;
  window.getAuthHeader = getAuthHeader;
  window.getHeaders = getHeaders;
}

// 🚀 Auto-validate on load
if (typeof window !== 'undefined') {
  // Only validate in browser environment, not during module loading
  setTimeout(() => {
    if (!validateAPIKey()) {
      console.log(`
🔧 SETUP REQUIRED:
1. Open: config.js
2. Replace: "YOUR_API_KEY_HERE" with your actual OpenRouter API key
3. Save the file
4. Reload the extension

Get your API key at: https://openrouter.ai/keys
      `);
    } else {
      console.log("✅ API Configuration loaded successfully!");
    }
  }, 100);
}
