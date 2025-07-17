#!/bin/bash

echo "🤖 Setting up Browser Automation with browser-use..."

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null
then
    echo "❌ Python 3 is required but not installed. Please install Python 3.11 or newer."
    exit 1
fi

# Check Python version
PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
REQUIRED_VERSION="3.11"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$PYTHON_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo "❌ Python $REQUIRED_VERSION or newer is required. You have Python $PYTHON_VERSION."
    exit 1
fi

echo "✅ Python $PYTHON_VERSION found"

# Create virtual environment if it doesn't exist
if [ ! -d "browser_env" ]; then
    echo "📦 Creating Python virtual environment..."
    python3 -m venv browser_env
fi

# Activate virtual environment
echo "🔄 Activating virtual environment..."
source browser_env/bin/activate

# Upgrade pip
echo "⬆️  Upgrading pip..."
pip install --upgrade pip

# Install dependencies
echo "📥 Installing browser automation dependencies..."
pip install -r requirements_browser.txt

# Install playwright browsers
echo "🌐 Installing Playwright browsers..."
playwright install chromium --with-deps

echo ""
echo "✅ Browser automation setup complete!"
echo ""
echo "To use browser automation:"
echo "1. Make sure your .env file has OPENAI_API_KEY set"
echo "2. Start the web interface: npm run web"
echo "3. Upload a book cover image"
echo "4. Enable browser automation to see real-time AI navigation"
echo ""
echo "The AI will automatically:"
echo "• Navigate to Archive.org"  
echo "• Search for your book"
echo "• Open the book reader"
echo "• Extract content from 4 pages"
echo "• Display results in real-time"
echo "" 