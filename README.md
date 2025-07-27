# 🤖 Smart Resume Form Filler

An intelligent Chrome extension that automatically fills Google Forms using your resume data and AI.

## ✨ Features

### Enhanced Form Field Support
- **Text Fields**: Regular text inputs and textareas
- **Radio Buttons**: Single-choice questions with smart matching
- **Checkboxes**: Multiple-choice selections 
- **Dropdowns**: Select menus with fuzzy matching
- **Date Fields**: Automatic date format conversion
- **Special Fields**: Email, phone, and URL detection
- **Semantic Matching**: AI-powered answer matching (Yes/No, education levels, etc.)

### Smart Resume Processing
- **PDF Upload**: Extract text from PDF resumes
- **Content Analysis**: Word count, character analysis, contact detection
- **Preview**: View processed resume text before use
- **Validation**: Ensure resume quality for better form filling

### User Experience
- **Modern UI**: Clean, intuitive interface
- **Real-time Feedback**: Progress indicators and status updates
- **Error Handling**: Retry logic and helpful error messages
- **Debug Mode**: Advanced logging for troubleshooting
- **Statistics**: Track filling success rate

## 🚀 How to Use

### 1. API Configuration (REQUIRED)
1. **Edit `config.js`**: Open the file and replace `"YOUR_API_KEY_HERE"` with your actual OpenRouter API key
2. **Get API Key**: Visit [OpenRouter.ai](https://openrouter.ai/keys) to create an account and get your API key
3. **Save**: Save the config.js file after adding your key

### 2. Install Extension

1. **Load Extension in Chrome**
   - Open Chrome → Extensions → Developer Mode ON
   - Click "Load unpacked" → Select this extension folder
   - Pin the extension to your toolbar

2. **Upload Your Resume**
   - Click the extension icon → "Settings & Upload Resume"  
   - Select your PDF resume file
   - Wait for processing and verification

3. **Fill Forms Automatically**
   - Open any Google Form
   - Click the extension icon → "Fill Current Form"
   - Watch as fields get filled automatically!

## 🔧 Technical Features

### Advanced Field Detection
```javascript
function detectFieldType(item) {
  // Detects various input types including Google Forms specific elements
  // Supports: text, textarea, radio, checkbox, dropdown, date, email, url, phone
}
```

### Intelligent Matching Algorithm
- **Exact Match**: Direct string comparison
- **Fuzzy Match**: Partial string matching
- **Semantic Match**: Context-aware matching (e.g., "Bachelor's" → "Undergraduate")
- **Normalized Comparison**: Case-insensitive, special character removal

### Enhanced Error Handling
- **API Retry Logic**: Exponential backoff for failed requests
- **Validation**: Input validation and error recovery
- **User Feedback**: Clear error messages and suggestions

### Form Field Types Supported

| Field Type | Detection Method | Filling Strategy |
|------------|------------------|------------------|
| Text Input | `input[type="text"]` | Direct value assignment |
| Textarea | `textarea` | Multi-line text support |
| Radio Button | `input[type="radio"]` | Label matching + click |
| Checkbox | `input[type="checkbox"]` | Multi-select support |
| Dropdown | `[role="listbox"]` | Option matching + click |
| Date | `input[type="date"]` | Format conversion |
| Email | `input[type="email"]` | Email extraction |
| Phone | `input[type="tel"]` | Phone number extraction |

## 🎯 AI Integration

### OpenRouter API
- **Model**: Google Gemini 2.5 Flash Lite
- **Temperature**: 0.0 (deterministic responses)
- **Context-Aware**: Field type specific prompting
- **JSON Response**: Structured data for reliable parsing

### Smart Prompting
```javascript
const systemPrompt = `
Guidelines for different field types:
- text/textarea: Provide detailed, relevant text from the resume
- radio: Choose ONE option that best matches
- checkbox: Provide comma-separated values for multiple selections
- dropdown: Provide a single value that would likely appear in a dropdown
- date: Provide dates in YYYY-MM-DD format when possible
`;
```

## 🔍 Debug Features

- **Field Type Detection**: See how each form field is classified
- **API Request/Response**: Monitor LLM communication
- **Matching Logic**: Track answer-to-option matching
- **Fill Statistics**: Count successful vs failed field fills

## 📊 Performance Improvements

- **Retry Logic**: 3 attempts with exponential backoff
- **Field Validation**: Pre-fill validation to prevent errors
- **Progress Tracking**: Real-time updates during processing
- **Memory Efficient**: Optimized PDF processing

## 🛠️ Development

### File Structure
```
extension/
├── config.js             # 🔑 API Configuration (EDIT THIS FIRST!)
├── manifest.json         # Extension configuration
├── background.js         # Service worker
├── content.js           # Form filling logic (enhanced)
├── popup.html/js        # Extension popup UI
├── options.html/js      # Settings page
├── pdf.min.js          # PDF processing library
├── pdf.worker.min.js   # PDF worker
├── api-test.html       # API testing page
└── test-api.js         # API testing script
```

### Key Enhancements Made
1. **Better Field Detection**: Enhanced detection for Google Forms elements
2. **Improved Matching**: Semantic matching for common form patterns
3. **Error Resilience**: Retry logic and better error handling
4. **User Experience**: Modern UI with real-time feedback
5. **Debug Support**: Comprehensive logging and debugging tools

## 🔒 Security & Privacy

- **Local Storage**: Resume data stored locally in Chrome
- **API Security**: Secure HTTPS connections to OpenRouter
- **No Data Persistence**: No server-side data storage
- **User Control**: Complete control over data and usage

## 🐛 Troubleshooting

### Common Issues
1. **"No Resume Uploaded"**: Upload a PDF resume in Settings
2. **"Please open a Google Form first"**: Navigate to a Google Form page
3. **API Errors**: Check internet connection and try again
4. **Form Not Filling**: Enable Debug Mode to see detailed logs

### Debug Mode
Enable debug mode in Settings to see:
- Field detection results
- API request/response data
- Matching algorithm decisions
- Fill success/failure reasons

## 📈 Future Enhancements

- [ ] Support for more form platforms (TypeForm, JotForm, etc.)
- [ ] Custom field mapping rules
- [ ] Multiple resume profiles
- [ ] Form template recognition
- [ ] Offline AI processing
- [ ] Advanced analytics dashboard

---

**Note**: This extension uses AI to intelligently fill forms. Always review filled information before submitting important forms.
