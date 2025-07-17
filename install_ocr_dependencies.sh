#!/bin/bash

echo "🔧 Installing OCR dependencies for BookFetcher..."

# Check if we're on macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "📱 Detected macOS - installing with Homebrew..."
    
    # Check if Homebrew is installed
    if ! command -v brew &> /dev/null; then
        echo "❌ Homebrew not found. Please install Homebrew first:"
        echo "   /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        exit 1
    fi
    
    # Install Tesseract OCR
    echo "📦 Installing Tesseract OCR engine..."
    brew install tesseract
    
    echo "✅ Tesseract OCR installed successfully!"
    
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "🐧 Detected Linux - installing with apt..."
    
    # Update package list
    sudo apt update
    
    # Install Tesseract OCR
    echo "📦 Installing Tesseract OCR engine..."
    sudo apt install -y tesseract-ocr tesseract-ocr-eng
    
    echo "✅ Tesseract OCR installed successfully!"
    
else
    echo "❌ Unsupported operating system: $OSTYPE"
    echo "Please install Tesseract OCR manually:"
    echo "  - Windows: Download from https://github.com/UB-Mannheim/tesseract/wiki"
    echo "  - Linux: sudo apt install tesseract-ocr"
    echo "  - macOS: brew install tesseract"
    exit 1
fi

echo ""
echo "🐍 Installing Python dependencies..."
pip install pytesseract Pillow openai python-dotenv

echo ""
echo "✅ All OCR dependencies installed successfully!"
echo ""
echo "🔑 Don't forget to set your OpenAI API key in .env file:"
echo "   OPENAI_API_KEY=your_api_key_here"
echo ""
echo "🧪 Test OCR installation:"
echo "   python -c \"import pytesseract; print('OCR ready!')\"" 