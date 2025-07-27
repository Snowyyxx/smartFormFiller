// content.js

// 🔧 Wait for config to load
if (typeof API_CONFIG === 'undefined') {
  console.log('[content] Waiting for config to load...');
  // Config will be loaded via manifest.json before this script
}

chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.action !== "fillForm") return;
  console.log("[content] Fill form requested");

  // ✅ Validate API configuration
  if (!validateAPIKey()) {
    alert("❌ API Key not configured!\n\nPlease:\n1. Open config.js\n2. Add your OpenRouter API key\n3. Reload the extension");
    return;
  }

  const debugMode = msg.debugMode || false;
  if (debugMode) {
    console.log("[content] Debug mode enabled");
    console.log("[content] Current URL:", window.location.href);
    console.log("[content] User agent:", navigator.userAgent);
  }

  // 1️⃣ Load the raw resume text
  const { resumeRaw } = await chrome.storage.local.get("resumeRaw");
  if (!resumeRaw) {
    alert("❌ No resume stored. Please upload it first in Settings.");
    return;
  }

  if (debugMode) console.log("[content] Resume loaded, length:", resumeRaw.length);

  // 2️⃣ Extract & normalize all form questions with enhanced detection
  const items = Array.from(document.querySelectorAll("div[role='listitem']"))
    .map(item => {
      const qEl = item.querySelector("div[role='heading']") || 
                  item.querySelector("[data-docs-flag='true']") ||
                  item.querySelector("span[jsname]");
      if (!qEl) return null;
      
      // Take only the first line, strip trailing asterisks, trim
      const qText = qEl.innerText
        .split("\n")[0]
        .replace(/\*+$/, "")
        .trim();
      
      // Detect field type for better processing
      const fieldType = detectFieldType(item);
      
      return qText ? { question: qText, item, fieldType } : null;
    })
    .filter(x => x);
  const questions = items.map(x => x.question);
  console.log("[content] Normalized Questions:", questions);
  console.log("[content] Field types detected:", items.map(x => ({ q: x.question, type: x.fieldType })));

  // 3️⃣ Build enhanced prompts for LLM with field type context
  const systemPrompt = `
You are a JSON generator that fills forms based on resume data. Given a plain-text resume and a list of form questions with their field types, return ONLY valid JSON mapping each exact question string to an appropriate answer.

Guidelines for different field types:
- text/textarea: Provide detailed, relevant text from the resume. Be comprehensive but concise.
- radio: Choose ONE option that best matches. Use common short answers like "Yes", "No", "Bachelor's Degree", "Master's Degree", "Full Time", "Part Time", etc.
- checkbox: Provide comma-separated values for multiple selections if applicable
- dropdown: Provide a single value that would likely appear in a dropdown menu
- date: Provide dates in YYYY-MM-DD format when possible, or MM/DD/YYYY if that seems more appropriate
- email: Extract email address from resume
- phone: Extract phone number from resume  
- url: Extract website/LinkedIn URL from resume

Important rules:
1. For Yes/No questions about experience, eligibility, authorization - default to "Yes" unless clearly contradicted by resume
2. For education questions - use common degree names: "High School", "Bachelor's Degree", "Master's Degree", "PhD"
3. For employment status - use "Full Time", "Part Time", "Contract", "Student", "Unemployed"
4. For location questions - provide country/state/city as appropriate
5. For radio buttons with limited options, pick the most reasonable choice
6. Always provide an answer for every question - never leave fields empty
7. Use standard, common terminology that would appear in dropdown menus

Be concise but accurate. Prioritize common, standardized answers that are likely to match form options.
Do NOT include any markdown or code fences.
  `.trim();
  
  const questionData = items.map(x => ({ question: x.question, fieldType: x.fieldType }));
  const userPayload = JSON.stringify({ resume: resumeRaw, questions: questionData });
  console.log("[content] Enhanced Prompt ➡️", systemPrompt, userPayload);

  // 4️⃣ Call the LLM API with retry logic
  let answersMap;
  let retryCount = 0;
  const maxRetries = 3;
  
  while (retryCount <= maxRetries) {
    try {
      if (debugMode) console.log(`[content] API call attempt ${retryCount + 1}`);
      
      const response = await fetch(API_CONFIG.BASE_URL, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          model: API_CONFIG.MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: userPayload }
          ],
          temperature: API_CONFIG.DEFAULT_TEMPERATURE,
          max_tokens: API_CONFIG.MAX_TOKENS
        })
      });
      
      const payload = await response.json();
      if (debugMode) {
        console.log("[content] Response status:", response.status, response.statusText);
        console.log("[content] Response headers:", Object.fromEntries(response.headers.entries()));
        console.log("[content] Raw LLM response:", payload);
      }
      
      if (!response.ok) {
        const errorMsg = payload.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        console.error("[content] API Error Details:", {
          status: response.status,
          statusText: response.statusText,
          error: payload.error,
          fullResponse: payload
        });
        throw new Error(errorMsg);
      }

      let raw = payload.choices?.[0]?.message?.content.trim() || "{}";
      raw = raw.replace(/^```json\s*/, "").replace(/```$/, "").trim();
      if (debugMode) console.log("[content] Stripped JSON:", raw);
      
      answersMap = JSON.parse(raw);
      if (debugMode) console.log("[content] Parsed answersMap:", answersMap);
      
      // Success - break out of retry loop
      break;
      
    } catch (err) {
      retryCount++;
      console.error(`[content] LLM call attempt ${retryCount} failed:`, err);
      
      if (retryCount > maxRetries) {
        let errorMessage = `❌ Failed to get answers from LLM after ${maxRetries} attempts.\n\nError: ${err.message}`;
        
        // Provide specific guidance for common errors
        if (err.message.includes('auth') || err.message.includes('credential')) {
          errorMessage += '\n\n🔑 This appears to be an authentication issue.\nPlease check:\n- API key is correct\n- API key has proper permissions\n- Account has sufficient credits';
        } else if (err.message.includes('429')) {
          errorMessage += '\n\n⏱️ Rate limit exceeded. Please wait a moment and try again.';
        } else if (err.message.includes('network') || err.message.includes('fetch')) {
          errorMessage += '\n\n🌐 Network connection issue. Please check your internet connection.';
        }
        
        errorMessage += '\n\n💡 Try enabling Debug Mode in settings for more details.';
        
        alert(errorMessage);
        return;
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount - 1)));
    }
  }

  // 5️⃣ Fill each field with enhanced logic
  const normalize = s => s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  let filledCount = 0;
  let skippedCount = 0;
  
  for (const { question, item, fieldType } of items) {
    const answer = answersMap[question];
    if (!answer) {
      console.log(`[content] No answer for "${question}" - attempting smart fill`);
      // Try to fill with smart defaults for mandatory fields
      const smartFilled = await fillWithSmartDefaults(item, fieldType, question);
      if (smartFilled) {
        filledCount++;
        console.log(`[content] Smart-filled "${question}" with default value`);
      } else {
        skippedCount++;
      }
      continue;
    }
    
    const aNorm = normalize(answer);
    console.log(`[content] Filling [${fieldType}] "${question}" → "${answer}"`);

    try {
      let filled = false;
      
      // Enhanced field type specific handling with fallbacks
      switch (fieldType) {
        case 'text':
        case 'textarea':
          filled = await fillTextFields(item, answer);
          if (!filled) filled = await fillGenericField(item, answer, aNorm);
          break;
        case 'radio':
          filled = await fillRadioButtons(item, answer, aNorm);
          // If no match and only one radio, fill it as mandatory
          if (!filled && isMandatoryRadio(item)) {
            filled = await fillMandatoryRadio(item);
            console.log(`[content] Filled mandatory radio for "${question}"`);
          }
          break;
        case 'checkbox':
          filled = await fillCheckboxes(item, answer);
          break;
        case 'dropdown':
          filled = await fillDropdown(item, answer, aNorm);
          // Try fuzzy matching if exact match fails
          if (!filled) filled = await fillDropdownFuzzy(item, answer);
          break;
        case 'date':
          filled = await fillDateField(item, answer);
          break;
        case 'email':
        case 'url':
        case 'phone':
          filled = await fillSpecialFields(item, answer);
          if (!filled) filled = await fillTextFields(item, answer);
          break;
        default:
          // Try multiple fallback strategies
          filled = await fillGenericField(item, answer, aNorm);
          if (!filled) filled = await fillTextFields(item, answer);
          if (!filled) filled = await fillRadioButtons(item, answer, aNorm);
      }
      
      if (filled) {
        filledCount++;
        // Add a small delay between fills to ensure proper form updates
        await new Promise(r => setTimeout(r, 100));
      } else {
        skippedCount++;
        console.warn(`[content] Failed to fill "${question}" with answer "${answer}"`);
        // Log field structure for debugging
        if (debugMode) {
          console.log(`[content] Field structure for "${question}":`, {
            innerHTML: item.innerHTML.substring(0, 200),
            inputs: Array.from(item.querySelectorAll('input')).map(i => ({ type: i.type, id: i.id, name: i.name })),
            selects: Array.from(item.querySelectorAll('select')).length,
            textareas: Array.from(item.querySelectorAll('textarea')).length
          });
        }
      }
    } catch (err) {
      console.error(`[content] Error filling "${question}":`, err);
      skippedCount++;
    }
  }

  console.log(`[content] fillForm complete - filled ${filledCount}/${items.length} fields, skipped ${skippedCount}`);
  
  // Show enhanced completion message
  const successRate = Math.round((filledCount / items.length) * 100);
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 10000;
    background: ${successRate >= 80 ? '#4CAF50' : successRate >= 60 ? '#FF9800' : '#f44336'}; 
    color: white; padding: 12px 20px;
    border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.2);
    font-family: Arial, sans-serif; font-size: 14px;
  `;
  notification.innerHTML = `
    <div style="font-weight: bold;">✅ Form Filling Complete!</div>
    <div style="font-size: 12px; margin-top: 4px;">
      Filled: ${filledCount}/${items.length} (${successRate}%)
      ${skippedCount > 0 ? `• Skipped: ${skippedCount}` : ''}
    </div>
  `;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 4000);
});

// Helper function to detect field type
function detectFieldType(item) {
  // Check for specific input types
  if (item.querySelector("textarea")) return "textarea";
  if (item.querySelector("input[type='email']")) return "email";
  if (item.querySelector("input[type='url']")) return "url";
  if (item.querySelector("input[type='tel']")) return "phone";
  if (item.querySelector("input[type='date']")) return "date";
  if (item.querySelector("input[type='radio']")) return "radio";
  if (item.querySelector("input[type='checkbox']")) return "checkbox";
  if (item.querySelector("[role='listbox']") || item.querySelector("select")) return "dropdown";
  if (item.querySelector("input[type='text']") || item.querySelector("input:not([type])")) return "text";
  
  // Check for Google Forms specific patterns
  if (item.querySelector("[data-value]") && item.querySelector("span[role='radio']")) return "radio";
  if (item.querySelector("[data-answer-value]")) return "checkbox";
  if (item.querySelector("[role='option']")) return "dropdown";
  
  // Default to text
  return "text";
}

// Check if radio button is mandatory (only one option or required field)
function isMandatoryRadio(item) {
  const radios = item.querySelectorAll("input[type='radio'], [role='radio']");
  const isRequired = item.querySelector("[required]") || 
                    item.querySelector("[aria-required='true']") ||
                    item.innerText.includes('*') ||
                    item.innerText.includes('required');
  
  // If only one radio option, it's likely mandatory
  return radios.length === 1 || isRequired;
}

// Fill mandatory radio with the only available option
async function fillMandatoryRadio(item) {
  const radio = item.querySelector("input[type='radio']") || item.querySelector("[role='radio']");
  if (radio) {
    radio.click();
    await new Promise(r => setTimeout(r, 50));
    return true;
  }
  return false;
}

// Smart default filling for fields without AI answers
async function fillWithSmartDefaults(item, fieldType, question) {
  const questionLower = question.toLowerCase();
  
  // Smart defaults based on question patterns
  const smartDefaults = {
    // Yes/No questions - default to sensible answers
    yes_no: {
      patterns: ['experience', 'willing', 'available', 'authorized', 'eligible', 'interested'],
      default: 'Yes'
    },
    // Education level defaults
    education: {
      patterns: ['education', 'degree', 'qualification', 'study'],
      default: "Bachelor's Degree"
    },
    // Employment status
    employment: {
      patterns: ['employment', 'status', 'currently working'],
      default: 'Employed'
    },
    // Location/Country defaults
    location: {
      patterns: ['country', 'location', 'where', 'city', 'state'],
      default: 'United States'
    }
  };
  
  let defaultValue = null;
  for (const [key, config] of Object.entries(smartDefaults)) {
    if (config.patterns.some(pattern => questionLower.includes(pattern))) {
      defaultValue = config.default;
      break;
    }
  }
  
  if (!defaultValue) return false;
  
  switch (fieldType) {
    case 'radio':
      return await fillRadioWithValue(item, defaultValue);
    case 'dropdown':
      return await fillDropdownWithValue(item, defaultValue);
    case 'text':
    case 'textarea':
      return await fillTextFields(item, defaultValue);
    default:
      return false;
  }
}

// Fill radio button with specific value
async function fillRadioWithValue(item, value) {
  const normalize = s => s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const valueNorm = normalize(value);
  
  // Try standard radio buttons
  const radios = item.querySelectorAll("input[type='radio']");
  for (const radio of radios) {
    const label = item.querySelector(`label[for="${radio.id}"]`) ||
                 radio.closest('label') ||
                 radio.parentElement.querySelector('span');
    if (label) {
      const labelText = label.innerText || label.textContent;
      const labelNorm = normalize(labelText);
      if (labelNorm.includes(valueNorm) || valueNorm.includes(labelNorm)) {
        radio.click();
        await new Promise(r => setTimeout(r, 50));
        return true;
      }
    }
  }
  
  // Try Google Forms radio buttons
  const gFormRadios = item.querySelectorAll("[role='radio']");
  for (const radio of gFormRadios) {
    const labelText = radio.innerText || radio.textContent;
    const labelNorm = normalize(labelText);
    if (labelNorm.includes(valueNorm) || valueNorm.includes(labelNorm)) {
      radio.click();
      await new Promise(r => setTimeout(r, 50));
      return true;
    }
  }
  
  return false;
}

// Fill dropdown with specific value
async function fillDropdownWithValue(item, value) {
  const normalize = s => s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const valueNorm = normalize(value);
  
  const dropdown = item.querySelector("[role='listbox']") || item.querySelector("select");
  
  if (dropdown) {
    dropdown.click();
    await new Promise(r => setTimeout(r, 300));
    
    const options = document.querySelectorAll("[role='option']") || dropdown.querySelectorAll("option");
    
    for (const option of options) {
      const optionText = option.innerText || option.textContent || option.value;
      const optionNorm = normalize(optionText);
      
      if (optionNorm.includes(valueNorm) || valueNorm.includes(optionNorm)) {
        option.click();
        await new Promise(r => setTimeout(r, 100));
        return true;
      }
    }
    
    // Close dropdown if no match
    dropdown.click();
  }
  
  return false;
}

// Enhanced field filling functions
async function fillTextFields(item, answer) {
  const textEl = item.querySelector("textarea") || 
                 item.querySelector("input[type='text']") ||
                 item.querySelector("input:not([type])") ||
                 Array.from(item.querySelectorAll("input")).find(i =>
                   !["radio","checkbox","date","email","url","tel"].includes(i.type)
                 );
  
  if (textEl) {
    textEl.focus();
    textEl.value = answer;
    textEl.dispatchEvent(new Event("input", { bubbles: true }));
    textEl.dispatchEvent(new Event("change", { bubbles: true }));
    textEl.blur();
    return true;
  }
  return false;
}

async function fillRadioButtons(item, answer, aNorm) {
  const radios = item.querySelectorAll("input[type='radio']");
  if (radios.length) {
    // First pass: exact matching
    for (const radio of radios) {
      const label = item.querySelector(`label[for="${radio.id}"]`) ||
                   radio.closest('label') ||
                   radio.parentElement.querySelector('span');
      if (!label) continue;
      
      const labelText = label.innerText || label.textContent;
      const lNorm = normalize(labelText);
      
      if (lNorm === aNorm || isSemanticMatch(answer, labelText)) {
        radio.click();
        await new Promise(r => setTimeout(r, 50));
        return true;
      }
    }
    
    // Second pass: partial matching
    for (const radio of radios) {
      const label = item.querySelector(`label[for="${radio.id}"]`) ||
                   radio.closest('label') ||
                   radio.parentElement.querySelector('span');
      if (!label) continue;
      
      const labelText = label.innerText || label.textContent;
      const lNorm = normalize(labelText);
      
      if (aNorm.includes(lNorm) || lNorm.includes(aNorm)) {
        radio.click();
        await new Promise(r => setTimeout(r, 50));
        return true;
      }
    }
    
    // Third pass: fuzzy matching for common patterns
    for (const radio of radios) {
      const label = item.querySelector(`label[for="${radio.id}"]`) ||
                   radio.closest('label') ||
                   radio.parentElement.querySelector('span');
      if (!label) continue;
      
      const labelText = label.innerText || label.textContent;
      
      if (isFuzzyMatch(answer, labelText)) {
        radio.click();
        await new Promise(r => setTimeout(r, 50));
        return true;
      }
    }
  }
  
  // Google Forms specific radio buttons with same multi-pass approach
  const gFormRadios = item.querySelectorAll("[role='radio']");
  if (gFormRadios.length) {
    // First pass: exact matching
    for (const radio of gFormRadios) {
      const labelText = radio.innerText || radio.textContent;
      const lNorm = normalize(labelText);
      
      if (lNorm === aNorm || isSemanticMatch(answer, labelText)) {
        radio.click();
        await new Promise(r => setTimeout(r, 50));
        return true;
      }
    }
    
    // Second pass: partial matching
    for (const radio of gFormRadios) {
      const labelText = radio.innerText || radio.textContent;
      const lNorm = normalize(labelText);
      
      if (aNorm.includes(lNorm) || lNorm.includes(aNorm)) {
        radio.click();
        await new Promise(r => setTimeout(r, 50));
        return true;
      }
    }
    
    // Third pass: fuzzy matching
    for (const radio of gFormRadios) {
      const labelText = radio.innerText || radio.textContent;
      
      if (isFuzzyMatch(answer, labelText)) {
        radio.click();
        await new Promise(r => setTimeout(r, 50));
        return true;
      }
    }
  }
  
  return false;
}

async function fillCheckboxes(item, answer) {
  const parts = answer.split(/[,;]\s*/).map(s => s.trim());
  const checks = item.querySelectorAll("input[type='checkbox']");
  let filled = false;
  
  if (checks.length) {
    for (const checkbox of checks) {
      const label = item.querySelector(`label[for="${checkbox.id}"]`) ||
                   checkbox.closest('label') ||
                   checkbox.parentElement.querySelector('span');
      if (!label) continue;
      
      const labelText = label.innerText || label.textContent;
      
      for (const part of parts) {
        if (normalize(labelText).includes(normalize(part)) ||
            normalize(part).includes(normalize(labelText)) ||
            isSemanticMatch(part, labelText)) {
          if (!checkbox.checked) {
            checkbox.click();
            await new Promise(r => setTimeout(r, 50));
            filled = true;
          }
          break;
        }
      }
    }
  }
  
  // Google Forms specific checkboxes
  const gFormChecks = item.querySelectorAll("[role='checkbox']");
  if (gFormChecks.length) {
    for (const checkbox of gFormChecks) {
      const labelText = checkbox.innerText || checkbox.textContent;
      
      for (const part of parts) {
        if (normalize(labelText).includes(normalize(part)) ||
            normalize(part).includes(normalize(labelText)) ||
            isSemanticMatch(part, labelText)) {
          checkbox.click();
          await new Promise(r => setTimeout(r, 50));
          filled = true;
          break;
        }
      }
    }
  }
  
  return filled;
}

async function fillDropdown(item, answer, aNorm) {
  const dropdown = item.querySelector("[role='listbox']") || item.querySelector("select");
  
  if (dropdown) {
    dropdown.click();
    await new Promise(r => setTimeout(r, 300));
    
    // Look for options
    const options = document.querySelectorAll("[role='option']") || dropdown.querySelectorAll("option");
    
    // First pass: exact matching
    for (const option of options) {
      const optionText = option.innerText || option.textContent || option.value;
      const oNorm = normalize(optionText);
      
      if (oNorm === aNorm || isSemanticMatch(answer, optionText)) {
        option.click();
        await new Promise(r => setTimeout(r, 100));
        return true;
      }
    }
    
    // Second pass: partial matching
    for (const option of options) {
      const optionText = option.innerText || option.textContent || option.value;
      const oNorm = normalize(optionText);
      
      if (aNorm.includes(oNorm) || oNorm.includes(aNorm)) {
        option.click();
        await new Promise(r => setTimeout(r, 100));
        return true;
      }
    }
    
    // Close dropdown if no match found
    dropdown.click();
  }
  
  return false;
}

// Enhanced fuzzy dropdown filling
async function fillDropdownFuzzy(item, answer) {
  const dropdown = item.querySelector("[role='listbox']") || item.querySelector("select");
  
  if (dropdown) {
    dropdown.click();
    await new Promise(r => setTimeout(r, 300));
    
    const options = document.querySelectorAll("[role='option']") || dropdown.querySelectorAll("option");
    
    // Fuzzy matching pass
    for (const option of options) {
      const optionText = option.innerText || option.textContent || option.value;
      
      if (isFuzzyMatch(answer, optionText)) {
        option.click();
        await new Promise(r => setTimeout(r, 100));
        return true;
      }
    }
    
    // Close dropdown
    dropdown.click();
  }
  
  return false;
}

async function fillDateField(item, answer) {
  const dateEl = item.querySelector("input[type='date']");
  if (dateEl) {
    // Try to parse and format the date
    let dateValue = answer;
    
    // Handle various date formats
    const dateFormats = [
      /(\d{4})-(\d{1,2})-(\d{1,2})/,  // YYYY-MM-DD
      /(\d{1,2})\/(\d{1,2})\/(\d{4})/, // MM/DD/YYYY
      /(\d{1,2})-(\d{1,2})-(\d{4})/,  // MM-DD-YYYY
    ];
    
    for (const format of dateFormats) {
      const match = answer.match(format);
      if (match) {
        if (format === dateFormats[0]) {
          dateValue = answer; // Already in correct format
        } else {
          const [, month, day, year] = match;
          dateValue = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        break;
      }
    }
    
    dateEl.focus();
    dateEl.value = dateValue;
    dateEl.dispatchEvent(new Event("input", { bubbles: true }));
    dateEl.dispatchEvent(new Event("change", { bubbles: true }));
    dateEl.blur();
    return true;
  }
  return false;
}

async function fillSpecialFields(item, answer) {
  const specialEl = item.querySelector("input[type='email']") ||
                   item.querySelector("input[type='url']") ||
                   item.querySelector("input[type='tel']");
  
  if (specialEl) {
    specialEl.focus();
    specialEl.value = answer;
    specialEl.dispatchEvent(new Event("input", { bubbles: true }));
    specialEl.dispatchEvent(new Event("change", { bubbles: true }));
    specialEl.blur();
    return true;
  }
  return false;
}

async function fillGenericField(item, answer, aNorm) {
  // Fallback to original logic for unrecognized fields
  const textEl = item.querySelector("textarea") ||
                Array.from(item.querySelectorAll("input")).find(i =>
                  !["radio","checkbox","date"].includes(i.type)
                );
  
  if (textEl) {
    textEl.value = answer;
    textEl.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  
  // Try radio buttons
  const radios = item.querySelectorAll("input[type='radio']");
  if (radios.length) {
    for (const radio of radios) {
      const lbl = item.querySelector(`label[for="${radio.id}"]`);
      if (lbl) {
        const lNorm = normalize(lbl.innerText);
        if (lNorm === aNorm || aNorm.includes(lNorm) || lNorm.includes(aNorm)) {
          lbl.click();
          return true;
        }
      }
    }
  }
  
  return false;
}

// Helper function for semantic matching
function isSemanticMatch(answer, optionText) {
  const answerLower = answer.toLowerCase();
  const optionLower = optionText.toLowerCase();
  
  // Common semantic mappings
  const semanticMaps = {
    'yes': ['yes', 'true', 'correct', 'agree', 'accept', 'affirmative', 'definitely', 'absolutely', 'sure'],
    'no': ['no', 'false', 'incorrect', 'disagree', 'decline', 'negative', 'never', 'not really'],
    'male': ['male', 'man', 'm', 'gentleman', 'guy'],
    'female': ['female', 'woman', 'f', 'lady', 'girl'],
    'bachelor': ['bachelor', 'bs', 'ba', 'undergraduate', 'bachelors', 'college degree'],
    'master': ['master', 'ms', 'ma', 'graduate', 'masters', 'masters degree'],
    'phd': ['phd', 'doctorate', 'doctoral', 'doctor', 'ph.d'],
    'experience': ['experienced', 'yes', 'have experience', 'work experience', 'professional'],
    'no experience': ['no experience', 'entry level', 'fresher', 'beginner', 'new graduate', 'recent graduate'],
    'full time': ['full time', 'fulltime', 'full-time', 'permanent', 'regular'],
    'part time': ['part time', 'parttime', 'part-time', 'temporary', 'contract'],
    'united states': ['usa', 'us', 'america', 'united states', 'u.s.', 'u.s.a'],
    'canada': ['canada', 'ca', 'canadian'],
    'india': ['india', 'indian', 'in'],
    'authorized': ['authorized', 'eligible', 'permitted', 'allowed', 'legal']
  };
  
  for (const [key, values] of Object.entries(semanticMaps)) {
    if (values.some(v => answerLower.includes(v)) && 
        values.some(v => optionLower.includes(v))) {
      return true;
    }
  }
  
  return false;
}

// Enhanced fuzzy matching function
function isFuzzyMatch(answer, optionText) {
  const answerLower = answer.toLowerCase();
  const optionLower = optionText.toLowerCase();
  
  // Remove common words that might cause false matches
  const commonWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
  const answerWords = answerLower.split(/\s+/).filter(w => !commonWords.includes(w) && w.length > 2);
  const optionWords = optionLower.split(/\s+/).filter(w => !commonWords.includes(w) && w.length > 2);
  
  // Check if any significant words match
  for (const answerWord of answerWords) {
    for (const optionWord of optionWords) {
      // Exact word match
      if (answerWord === optionWord) return true;
      
      // Substring match for longer words
      if (answerWord.length > 3 && optionWord.length > 3) {
        if (answerWord.includes(optionWord) || optionWord.includes(answerWord)) {
          return true;
        }
      }
      
      // Levenshtein distance for similar words
      if (answerWord.length > 4 && optionWord.length > 4) {
        const distance = levenshteinDistance(answerWord, optionWord);
        const maxLength = Math.max(answerWord.length, optionWord.length);
        if (distance / maxLength < 0.3) { // 70% similarity
          return true;
        }
      }
    }
  }
  
  return false;
}

// Levenshtein distance calculator for fuzzy matching
function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

// Debug function to test API directly
async function testAPIConnection() {
  console.log("[DEBUG] Testing API connection...");
  
  try {
    const response = await fetch(API_CONFIG.BASE_URL, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        model: API_CONFIG.MODEL,
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Say 'API test successful'" }
        ],
        temperature: API_CONFIG.DEFAULT_TEMPERATURE,
        max_tokens: 20
      })
    });
    
    console.log("[DEBUG] Response status:", response.status);
    console.log("[DEBUG] Response headers:", Object.fromEntries(response.headers.entries()));
    
    const data = await response.json();
    console.log("[DEBUG] Response data:", data);
    
    if (response.ok) {
      console.log("✅ [DEBUG] API test successful!");
      return { success: true, data };
    } else {
      console.log("❌ [DEBUG] API test failed!");
      return { success: false, error: data };
    }
  } catch (error) {
    console.error("❌ [DEBUG] API test error:", error);
    return { success: false, error: error.message };
  }
}

// Make function available globally for testing
window.testAPIConnection = testAPIConnection;
