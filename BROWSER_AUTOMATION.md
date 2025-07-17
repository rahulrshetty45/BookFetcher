# 🤖 AI-Powered Browser Automation

The BookFetcher now includes **real-time AI-powered browser automation** using the `browser-use` library. This feature enables the AI to autonomously navigate Archive.org, search for books, open book readers, and extract content from multiple pages - all while you watch it happen live!

## 🌟 Features

### Real-Time AI Navigation
- **Autonomous browsing**: AI navigates Archive.org using natural language understanding
- **Live iframe display**: Watch the AI browse in real-time on the right panel  
- **Smart decision making**: AI handles dynamic content, clicks buttons, and navigates like a human
- **Progress tracking**: See each step of the automation process with status indicators

### Content Extraction
- **Multi-page extraction**: Automatically extracts content from 4 pages of books
- **Preview access**: Works with copyrighted books using Archive.org's preview system
- **Intelligent navigation**: AI finds "Read Online" buttons and navigates book readers
- **Real-time results**: Content appears as it's extracted

### Visual Interface
- **Two-column layout**: Main interface + live browser automation panel
- **Step-by-step progress**: Real-time status updates with emojis and timestamps  
- **URL bar display**: Shows current page being automated
- **Content preview**: Extracted text displayed immediately
- **Error handling**: Clear error messages and fallback options

## 🚀 Setup

### 1. Install Python Dependencies

Run the setup script to install browser automation dependencies:

```bash
chmod +x setup_browser_automation.sh
./setup_browser_automation.sh
```

This will:
- Create a Python virtual environment  
- Install `browser-use` and dependencies
- Install Playwright browsers
- Validate Python version (3.11+ required)

### 2. Environment Configuration

Ensure your `.env` file has the OpenAI API key:

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

### 3. Start the Application

```bash
npm run web
```

## 🎯 How It Works

### AI System Prompt
The browser automation uses a sophisticated system prompt that instructs the AI to:

```
1. Go to Archive.org (https://archive.org)
2. Search for the book using both title and author
3. Find the book in search results and click to open details
4. Look for "Read Online" or "View Book" button and click it
5. Navigate to page 2 (skip cover/title page)
6. Extract text content from page 2
7. Navigate to page 3 and extract text content
8. Navigate to page 4 and extract text content  
9. Navigate to page 5 and extract text content
10. Return extracted text from all 4 pages
```

### Real-Time Communication
- **Server-Sent Events**: Streams progress updates from Python to frontend
- **Progress tracking**: Each step reported with status (pending/running/completed/error)
- **URL updates**: Browser iframe follows AI navigation
- **Content streaming**: Extracted text appears immediately

### Automation Steps You'll See:

1. **🌐 Initializing browser automation** - Setting up the AI agent
2. **🔍 Starting automated search and extraction** - AI begins navigation  
3. **📖 Extracting content from book pages** - AI reads and extracts text
4. **✅ Automation completed successfully!** - Results ready

## 🔧 Technical Architecture

### Components

1. **`browser_automation.py`** - Python script using browser-use for AI automation
2. **`/api/browser-automation`** - Next.js API route for streaming communication  
3. **`BrowserAutomation.tsx`** - React component for real-time UI
4. **Server-Sent Events** - Real-time communication protocol

### Data Flow

```
User uploads image → Book identified → Browser automation triggered →
Python script launches → AI agent navigates Archive.org →
Progress streamed via SSE → Frontend updates in real-time →
Content extracted → Results displayed
```

## 🎮 Usage

1. **Upload book cover image** in the main interface
2. **Click "Show Browser Automation"** to open the live panel
3. **Watch the AI work**: See real-time navigation in the iframe
4. **Track progress**: Follow step-by-step automation status  
5. **View results**: Extracted content appears in the results panel

## 🔍 What You'll See

### Live Browser Panel
- **URL bar**: Shows current page (Archive.org, search results, book reader)
- **Real-time iframe**: Watch AI navigate exactly like a human would
- **Progress steps**: Live updates with status indicators
- **Content preview**: Extracted text displayed immediately

### Automation Intelligence
- **Smart search**: AI searches using both title and author
- **Element detection**: Finds and clicks buttons, links, navigation elements
- **Page waiting**: Waits for content to load before proceeding
- **Error recovery**: Handles failed requests and tries alternative approaches
- **Content focus**: Extracts actual book content, not just metadata

## 🛠️ Advanced Configuration

### Model Settings
The AI agent uses GPT-4o-mini for optimal balance of speed and intelligence:

```python
agent = Agent(
    task=task,
    llm=ChatOpenAI(
        model="gpt-4o-mini", 
        temperature=0.3,  # Low temperature for consistent behavior
        api_key=os.getenv('OPENAI_API_KEY')
    ),
    max_actions_per_step=5,  # Limits actions per decision cycle
    use_vision=True,  # Enables visual understanding of pages
)
```

### Customization Options
- **Different models**: Change `model` to "gpt-4" for more advanced reasoning
- **Temperature**: Adjust creativity vs consistency (0.1-1.0)
- **Action limits**: Control how many actions AI can take per step
- **Vision toggle**: Enable/disable visual page understanding

## 🚨 Troubleshooting

### Common Issues

**"browser-use package not found"**
```bash
# Ensure you've run the setup script
./setup_browser_automation.sh
```

**"Python 3.11+ required"**  
```bash
# Install Python 3.11 or newer
# macOS: brew install python@3.11
# Ubuntu: apt install python3.11
```

**"Stream connection error"**
```bash
# Check if the Python script is executable
chmod +x browser_automation.py

# Verify OpenAI API key is set
echo $OPENAI_API_KEY
```

**"Automation timeout"**
- Archive.org may be slow - this is normal
- AI will wait for pages to load completely
- Complex books may take 2-3 minutes to process

### Debug Mode
To see detailed AI decision-making, check the browser console and server logs for real-time automation steps.

## 🎯 Future Enhancements

- **Multiple browser engines**: Support for Firefox, Safari
- **Custom extraction rules**: User-defined content extraction patterns  
- **Batch processing**: Automate multiple books simultaneously
- **Smart caching**: Remember successful navigation patterns
- **Advanced error recovery**: More sophisticated fallback strategies

---

Experience the future of book content extraction with AI that browses the web just like you do! 🚀 