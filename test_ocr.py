#!/usr/bin/env python3
"""
Test script to verify OCR functionality
"""

import os
import sys
try:
    import pytesseract
    from PIL import Image
    import openai
    from dotenv import load_dotenv
    print("✅ All required libraries imported successfully!")
except ImportError as e:
    print(f"❌ Import error: {e}")
    print("Run: pip install pytesseract Pillow openai python-dotenv")
    sys.exit(1)

def test_tesseract():
    """Test if Tesseract OCR engine is properly installed"""
    try:
        version = pytesseract.get_tesseract_version()
        print(f"✅ Tesseract OCR version: {version}")
        return True
    except Exception as e:
        print(f"❌ Tesseract OCR error: {e}")
        print("Install Tesseract OCR:")
        print("  macOS: brew install tesseract")
        print("  Linux: sudo apt install tesseract-ocr")
        return False

def test_openai():
    """Test if OpenAI API key is configured"""
    load_dotenv()
    api_key = os.getenv('OPENAI_API_KEY')
    
    if not api_key or api_key == 'your_openai_api_key_here':
        print("⚠️  OpenAI API key not configured")
        print("Create .env file with: OPENAI_API_KEY=your_actual_key")
        return False
    else:
        print("✅ OpenAI API key configured")
        return True

def test_ocr_sample():
    """Test OCR on a sample if screenshots exist"""
    screenshots_dir = "temp/screenshots"
    if os.path.exists(screenshots_dir):
        png_files = [f for f in os.listdir(screenshots_dir) if f.endswith('.png')]
        if png_files:
            sample_file = os.path.join(screenshots_dir, png_files[0])
            try:
                image = Image.open(sample_file)
                text = pytesseract.image_to_string(image)
                print(f"✅ OCR test successful on {png_files[0]}")
                print(f"📄 Extracted {len(text)} characters")
                return True
            except Exception as e:
                print(f"❌ OCR test failed: {e}")
                return False
    
    print("ℹ️  No screenshots found for OCR testing")
    return True

if __name__ == "__main__":
    print("🧪 Testing OCR and AI dependencies...\n")
    
    tests = [
        ("Tesseract OCR Engine", test_tesseract),
        ("OpenAI Configuration", test_openai),
        ("OCR Sample Test", test_ocr_sample)
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"Testing {test_name}...")
        result = test_func()
        results.append(result)
        print()
    
    if all(results[:2]):  # Only check critical tests
        print("🎉 All critical tests passed! OCR system is ready.")
    else:
        print("❌ Some tests failed. Please fix the issues above.")
        sys.exit(1) 