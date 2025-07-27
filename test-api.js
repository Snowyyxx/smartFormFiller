// API Key Test Script
// Copy and paste this into your browser console to test the API key
// NOTE: Make sure config.js is loaded first

async function testOpenRouterAPI() {
  console.log("🧪 Testing OpenRouter API...");
  
  // Check if config is loaded
  if (typeof API_CONFIG === 'undefined') {
    console.error("❌ Config not loaded! Make sure config.js is included first.");
    return;
  }
  
  // Validate API key
  if (!validateAPIKey()) {
    console.error("❌ API Key not configured! Please edit config.js");
    return;
  }
  
  try {
    const response = await fetch(API_CONFIG.BASE_URL, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        model: API_CONFIG.MODEL,
        messages: [
          { 
            role: "system", 
            content: "You are a helpful assistant. Respond with 'API test successful' and the current date." 
          },
          { 
            role: "user", 
            content: "Test API connection - please confirm this is working" 
          }
        ],
        temperature: 0.1,
        max_tokens: 100
      })
    });
    
    console.log("📡 Response Status:", response.status, response.statusText);
    
    const data = await response.json();
    console.log("📄 Full Response:", data);
    
    if (response.ok) {
      if (data.choices && data.choices[0] && data.choices[0].message) {
        console.log("✅ API Test SUCCESSFUL!");
        console.log("🤖 AI Response:", data.choices[0].message.content);
        console.log("💰 Usage:", data.usage);
        return {
          success: true,
          message: data.choices[0].message.content,
          usage: data.usage
        };
      } else {
        console.log("⚠️ Unexpected response format:", data);
        return { success: false, error: "Unexpected response format" };
      }
    } else {
      console.log("❌ API Test FAILED!");
      console.log("Error details:", data);
      
      // Common error explanations
      if (response.status === 401) {
        console.log("🔑 Error: Invalid API key - check your OpenRouter API key");
      } else if (response.status === 403) {
        console.log("🚫 Error: Access forbidden - check your account permissions");
      } else if (response.status === 429) {
        console.log("⏱️ Error: Rate limited - too many requests");
      } else if (response.status === 500) {
        console.log("🔧 Error: Server error - try again later");
      }
      
      return { 
        success: false, 
        error: data.error?.message || `HTTP ${response.status}`,
        status: response.status 
      };
    }
    
  } catch (error) {
    console.log("❌ Network/Connection Error:", error.message);
    return { success: false, error: error.message };
  }
}

// Run the test
console.log("🚀 Starting API test...");
testOpenRouterAPI().then(result => {
  console.log("🏁 Test completed:", result);
  if (result.success) {
    console.log("🎉 Your API key is working correctly!");
  } else {
    console.log("🔧 Please fix the API key issue:", result.error);
  }
});

// You can also run: testOpenRouterAPI()
