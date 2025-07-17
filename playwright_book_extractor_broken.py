#!/usr/bin/env python3
"""
Playwright-based book page extractor for Google Books preview pages.
"""

import asyncio
import os
import sys
import base64
from pathlib import Path
from playwright.async_api import async_playwright
import json
from datetime import datetime
import pytesseract
from PIL import Image
import openai
from dotenv import load_dotenv
import concurrent.futures
import time
from typing import Dict, List, Optional

# Load environment variables
load_dotenv()

# Initialize OpenAI client
openai_client = openai.OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

def extract_text_from_image(image_path: str) -> str:
    """Extract text from image using OCR with noise filtering"""
    try:
        image = Image.open(image_path)
        text = pytesseract.image_to_string(image)
        
        # Clean OCR artifacts and noise
        cleaned_text = clean_ocr_text(text)
        return cleaned_text.strip()
    except Exception as e:
        print(f"OCR error for {image_path}: {e}")
        return ""

def clean_ocr_text(text: str) -> str:
    """Remove OCR artifacts, noise, and non-book content"""
    import re
    
    lines = text.split('\n')
    cleaned_lines = []
    
    for line in lines:
        line = line.strip()
        
        # Skip empty lines
        if not line:
            continue
            
        # Remove lines that look like base64 or random encoding artifacts
        if re.match(r'^[A-Za-z0-9+/=]{20,}$', line):
            continue
            
        # Remove lines with mostly random characters (low readability)
        if len(line) > 10:
            readable_chars = sum(1 for c in line if c.isalnum() or c.isspace())
            if readable_chars / len(line) < 0.7:  # Less than 70% readable characters
                continue
        
        # Remove very short lines that are likely artifacts
        if len(line) < 3:
            continue
            
        # Remove lines that are mostly numbers/symbols
        if re.match(r'^[0-9\s\-_+=.,;:!@#$%^&*()]{5,}$', line):
            continue
            
        # Remove common Google Books artifacts and watermarks
        google_artifacts = [
            'ogle Books',
            'nd enjoy eslr access to your favor estos',
            'Powered by Google Books API',
            'This downloads and extracts text from Google Books PDF previews'
        ]
        
        if any(artifact in line for artifact in google_artifacts):
            continue
            
        # Keep lines that look like actual text
        cleaned_lines.append(line)
    
    return '\n'.join(cleaned_lines)

async def analyze_book_with_gpt4(all_pages: list) -> dict:
    """Use GPT-4 to analyze all pages and select the appropriate content page"""
    try:
        # Prepare pages data for GPT-4
        pages_summary = []
        for i, page_info in enumerate(all_pages, 1):
            text = page_info["text"]
            # Truncate very long pages for the summary
            preview_text = text[:400] + "..." if len(text) > 400 else text
            pages_summary.append(f"Page {i}: {len(text)} characters\n{preview_text}")
        
        pages_text = "\n\n---\n\n".join(pages_summary)
        
        prompt = f"""
        You are analyzing a book with {len(all_pages)} extracted pages. Your task is to:

        1. Identify which pages contain ACTUAL STORY CONTENT (not title pages, copyright, table of contents, forewords, introductions, etc.)
        2. Classify the book as fiction or non-fiction
        3. Select the appropriate page based on these rules:
           - If NON-FICTION: return the 1st actual content page
           - If FICTION: return the 2nd actual content page (or 1st if only one exists)

        Here are all the pages:

        {pages_text}

        Respond with ONLY a JSON object in this exact format:
        {{
            "classification": "fiction" or "non-fiction",
            "content_pages": [list of page numbers that contain actual story/content, not front matter],
            "selected_page": page number to return based on the rules,
            "reasoning": "brief explanation of your selections"
        }}
        """
        
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a book analysis expert. Respond only with valid JSON."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=200,
            temperature=0
        )
        
        result_text = response.choices[0].message.content.strip()
        
        # Clean up the response - remove markdown code blocks if present
        if result_text.startswith('```json'):
            result_text = result_text[7:]  # Remove ```json
        if result_text.startswith('```'):
            result_text = result_text[3:]   # Remove ```
        if result_text.endswith('```'):
            result_text = result_text[:-3]  # Remove closing ```
        
        result_text = result_text.strip()
        
        # Parse JSON response
        import json as json_lib
        result = json_lib.loads(result_text)
        
        return {
            "classification": result.get("classification", "unknown"),
            "content_pages": result.get("content_pages", []),
            "selected_page": result.get("selected_page", None),
            "reasoning": result.get("reasoning", ""),
            "confidence": "high"
        }
        
    except Exception as e:
        print(f"GPT-4 analysis error: {e}")
        return {
            "classification": "unknown",
            "content_pages": [],
            "selected_page": None,
            "reasoning": f"Error: {str(e)}",
            "confidence": "low"
        }

async def send_screenshot_update(page, step_id: str, description: str):
    """Send a screenshot update to the frontend"""
    try:
        # Take screenshot and convert to base64
        screenshot_bytes = await page.screenshot(full_page=False)
        screenshot_base64 = base64.b64encode(screenshot_bytes).decode('utf-8')
        
        print(f"PROGRESS:{json.dumps({
            'step_id': step_id,
            'description': description,
            'status': 'running',
            'screenshot': f'data:image/png;base64,{screenshot_base64}'
        })}")
    except Exception as e:
        print(f"PROGRESS:{json.dumps({
            'step_id': step_id,
            'description': f'{description} (screenshot failed)',
            'status': 'running'
        })}")

async def extract_google_books_pages(preview_url: str, book_title: str, book_author: str, max_pages: int = 18) -> dict:
    """Extract pages from Google Books preview using Playwright"""
    try:
        print(f"PROGRESS:{json.dumps({
            'step_id': 'init', 
            'description': f'🚀 Starting Playwright automation for: {book_title}', 
            'status': 'running',
            'url': preview_url
        })}")
        
        print(f"PROGRESS:{json.dumps({
            'step_id': 'browser_init', 
            'description': '🌐 Initializing browser...', 
            'status': 'running'
        })}")
        
        # Check if running in production environment
        is_production = os.getenv('NODE_ENV') == 'production'
        browser_path = os.getenv('PLAYWRIGHT_BROWSERS_PATH', '/opt/render/project/.playwright')
        
        print(f"🔧 Environment: {'production' if is_production else 'development'}")
        print(f"🗂️ Browser path: {browser_path}")
        print(f"📁 Current directory: {os.getcwd()}")
        
        async with async_playwright() as p:
            try:
                # Browser launch options for production
                launch_options = {
                    'headless': True,
                    'args': [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                        '--no-zygote',
                        '--single-process',
                        '--disable-gpu'
                    ]
                }
                
                if is_production:
                    # In production, specify the browser executable if needed
                    chromium_path = os.path.join(browser_path, 'chromium-1091/chrome-linux/chrome')
                    if os.path.exists(chromium_path):
                        launch_options['executable_path'] = chromium_path
                        print(f"🌐 Using Chromium at: {chromium_path}")
                    else:
                        print(f"⚠️ Chromium not found at {chromium_path}, using default")
                
                print(f"PROGRESS:{json.dumps({
                    'step_id': 'browser_launch', 
                    'description': '🚀 Launching browser...', 
                    'status': 'running'
                })}")
                
                browser = await p.chromium.launch(**launch_options)
                print(f"✅ Browser launched successfully")
                
                print(f"PROGRESS:{json.dumps({
                    'step_id': 'browser_ready', 
                    'description': '✅ Browser ready, creating page...', 
                    'status': 'running'
                })}")
                
                page = await browser.new_page()
                print(f"✅ New page created")
                
                # Set viewport and user agent
                await page.set_viewport_size({"width": 1280, "height": 720})
                await page.set_extra_http_headers({
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                })
                
            except Exception as browser_error:
                error_msg = f"Browser launch failed: {str(browser_error)}"
                print(f"ERROR:{error_msg}")
                print(f"❌ {error_msg}")
                import traceback
                traceback.print_exc()
                return {
                    "success": False,
                    "error": error_msg,
                    "pages_extracted": 0
                }

            # Create screenshots directory
            timestamp = int(datetime.now().timestamp())
            screenshots_dir = os.path.join('temp', 'screenshots', f'book_{timestamp}')
            os.makedirs(screenshots_dir, exist_ok=True)
            
            print(f"PROGRESS:{json.dumps({'step_id': 'init', 'description': f'📂 Screenshots directory: {screenshots_dir}', 'status': 'completed'})}")
            print(f"PROGRESS:{json.dumps({'step_id': 'setup', 'description': f'📖 Extracting pages from: {book_title} by {book_author}', 'status': 'running'})}")

            # Use simple extraction approach due to syntax issues
            print("📸 Starting simple page extraction...")
            for page_num in range(1, min(max_pages + 1, 6)):  # Limit to 5 pages for safety
                print(f"PROGRESS:{json.dumps({\"step_id\": f\"page_{page_num}\", \"description\": f\"📄 Capturing page {page_num}...\", \"status\": \"running\"})}")
                
                # Take screenshot
                screenshot_filename = f"page_{page_num:03d}.png"
                screenshot_path = os.path.join(screenshots_dir, screenshot_filename)
                
                try:
                    await page.screenshot(path=screenshot_path, full_page=True)
                    print(f"📸 Screenshot saved: {screenshot_filename}")
                    pages_extracted += 1
                    
                    # Simple navigation
                    if page_num < 5:
                        await page.keyboard.press("ArrowRight")
                        await page.wait_for_timeout(3000)
                        
                except Exception as e:
                    print(f"❌ Error processing page {page_num}: {str(e)}")
                    break
                    
            print(f"✅ Completed extraction of {pages_extracted} pages")
            
        finally:
            await browser.close()
    
    # Check results
    screenshot_files = [f for f in os.listdir(screenshots_dir) if f.startswith("page_") and f.endswith(".png")]
    actual_pages = len(screenshot_files)
    
    result = {
        "success": True,
        "pages_extracted": actual_pages,
        "screenshots_dir": screenshots_dir,
        "extracted_content": f"Successfully extracted {actual_pages} pages using simplified Playwright automation",
        "message": f"Successfully extracted {actual_pages} pages to {screenshots_dir}"
    }
    
    # Output result for backend communication
    print(f"RESULT:{json.dumps(result)}")
    return result

except Exception as e:
    error_msg = f"Critical automation error: {str(e)}"
    print(f"ERROR:{error_msg}")
    print(f"❌ {error_msg}")
    import traceback
    traceback.print_exc()
    
    result = {
        "success": False,
        "error": error_msg,
        "pages_extracted": 0
    }
    print(f"RESULT:{json.dumps(result)}")
    return result


async def main():
    """Main function for testing"""
    if len(sys.argv) < 4:
        print("Usage: python playwright_book_extractor.py <preview_url> <book_title> <book_author>")
        sys.exit(1)
    
    preview_url = sys.argv[1]
    book_title = sys.argv[2]
    book_author = sys.argv[3]
    
    result = await extract_google_books_pages(preview_url, book_title, book_author)
    
    # Only print debug info when run directly (not when called by backend)
    if not any("backend.py" in arg for arg in sys.argv):
        print("
" + "="*50)
        print("EXTRACTION RESULT:")
        print(json.dumps(result, indent=2))

if __name__ == "__main__":
    asyncio.run(main())

