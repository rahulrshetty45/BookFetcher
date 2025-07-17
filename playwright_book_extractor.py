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
from PIL import Image
import openai
from dotenv import load_dotenv
import concurrent.futures
import time
from typing import Dict, List, Optional

# Load environment variables
load_dotenv()

# Try to import pytesseract, provide fallback if not available
try:
    import pytesseract
    TESSERACT_AVAILABLE = True
    print("✅ Tesseract OCR is available")
except ImportError as e:
    TESSERACT_AVAILABLE = False
    print(f"⚠️ Tesseract OCR not available: {e}")
    print("📝 Will proceed without OCR functionality")

# Initialize OpenAI client
openai_client = openai.OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

def extract_text_from_image(image_path: str) -> str:
    """Extract text from image using OCR with noise filtering"""
    if not TESSERACT_AVAILABLE:
        print(f"⚠️ OCR not available for {image_path}, skipping text extraction")
        return ""
    
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

async def extract_google_books_pages(preview_url: str, book_title: str, book_author: str, max_pages: int = 18):
    """
    Extract pages from Google Books preview using Playwright
    
    Args:
        preview_url: Google Books preview URL
        book_title: Title of the book
        book_author: Author of the book
        max_pages: Maximum number of pages to extract (default 18)
    """
    
    # Create screenshots directory
    screenshots_dir = os.path.abspath("temp/screenshots")
    os.makedirs(screenshots_dir, exist_ok=True)
    
    # Initialize list for parallel OCR tasks
    ocr_tasks = []
    
    print(f"PROGRESS:{json.dumps({'step_id': 'init', 'description': f'📂 Screenshots directory: {screenshots_dir}', 'status': 'completed'})}")
    print(f"PROGRESS:{json.dumps({'step_id': 'setup', 'description': f'📖 Extracting pages from: {book_title} by {book_author}', 'status': 'running'})}")
    print(f"PROGRESS:{json.dumps({'step_id': 'url', 'description': f'🔗 URL: {preview_url}', 'status': 'completed'})}")
    
    async with async_playwright() as p:
        # Launch browser in headless mode to avoid separate window
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={'width': 1400, 'height': 1180},  # Maximum viewport height for complete content capture
            device_scale_factor=2  # High DPI for better quality screenshots
        )
        page = await context.new_page()
        
        try:
            print(f"PROGRESS:{json.dumps({'step_id': 'navigation', 'description': '🌐 Navigating to Google Books preview...', 'status': 'running'})}")
            await page.goto(preview_url, wait_until='networkidle')
            
            # Wait for the page to load
            await page.wait_for_timeout(5000)
            
            # Try to close any popups or accept cookies
            try:
                close_buttons = await page.query_selector_all('button:has-text("No thanks"), button:has-text("Got it"), button:has-text("Accept"), [aria-label*="close"], .modal-close')
                for button in close_buttons[:2]:  # Close first 2 popups max
                    await button.click()
                    await page.wait_for_timeout(1000)
            except:
                pass
            
            # Send screenshot after page loads
            await send_screenshot_update(page, 'navigation', '🌐 Google Books page loaded')
            
            print(f"PROGRESS:{json.dumps({'step_id': 'navigation', 'description': '🌐 Navigation completed', 'status': 'completed'})}")
            print(f"PROGRESS:{json.dumps({'step_id': 'detection', 'description': '📚 Starting Google Books reader...', 'status': 'running'})}")
            
            # Try to activate the Google Books reader by clicking on preview elements
            try:
                # Look for preview/read buttons or cover image to start the reader
                preview_triggers = [
                    'img[src*="frontcover"]',  # Cover image
                    'button:has-text("Read")',
                    'button:has-text("Preview")',
                    'a:has-text("Read")',
                    'a:has-text("Preview")',
                    '.gb-button',
                    '[data-ved*="preview"]'
                ]
                
                reader_activated = False
                for trigger in preview_triggers:
                    elements = await page.query_selector_all(trigger)
                    if elements:
                        print(f"🖱️ Clicking to activate reader: {trigger}")
                        await elements[0].click()
                        await page.wait_for_timeout(3000)
                        reader_activated = True
                        break
                
                if reader_activated:
                    print(f"PROGRESS:{json.dumps({'step_id': 'detection', 'description': '✅ Reader activated, waiting for content...', 'status': 'running'})}")
                    await page.wait_for_timeout(3000)
                
            except Exception as e:
                print(f"⚠️ Could not activate reader: {e}")
            
            # Now try to find the actual book viewer area with better selectors
            reader_selectors = [
                '#viewer',           # Main viewer container
                '.gb-reader',        # Google Books reader
                '[role="img"]',      # Page images
                'iframe[src*="books.google"]',  # Embedded iframe
                '.reader-page',      # Page container
                '.page-content',     # Page content
                'canvas'             # Canvas elements
            ]
            
            viewer_element = None
            for selector in reader_selectors:
                elements = await page.query_selector_all(selector)
                if elements:
                    print(f"✅ Found reader element: {selector}")
                    viewer_element = elements[0]
                    break
            
            if not viewer_element:
                print("❌ Could not find book reader. Using full page approach with better navigation.")
                # Enhanced full page approach with better navigation
                for page_num in range(1, max_pages + 1):
                    print(f"PROGRESS:{json.dumps({'step_id': f'page_{page_num}', 'description': f'📄 Capturing page {page_num}...', 'status': 'running'})}")
                    
                    # Moderate zoom to fit content but maintain quality
                    await page.evaluate("document.body.style.zoom = '0.65'")
                    await page.wait_for_timeout(1000)  # Let zoom take effect
                    
                    # Scroll to ensure we capture the full content
                    await page.evaluate("window.scrollTo(0, 0)")  # Start from top
                    await page.wait_for_timeout(500)
                    
                    # Take targeted screenshot of just the book content area
                    screenshot_path = os.path.join(screenshots_dir, f"page_{page_num}.png")
                    await page.screenshot(
                        path=screenshot_path, 
                        full_page=False,  # Viewport only
                        clip={'x': 200, 'y': 80, 'width': 1000, 'height': 1080},  # Maximum height to ensure no bottom cut-off
                        type='png',  # Explicit PNG for lossless quality
                        omit_background=False  # Include background for better contrast
                    )
                    
                    # Start OCR processing immediately for this page
                    ocr_task = asyncio.create_task(extract_text_from_image_async(screenshot_path))
                    ocr_tasks.append(ocr_task)
                    print(f"🔄 Started OCR for page {page_num} in parallel...")
                    
                    # Send screenshot update
                    await send_screenshot_update(page, f'page_{page_num}', f'📄 Captured page {page_num}')

                    # Early analysis: Check every 3 pages if we can stop extraction
                    if page_num >= 3 and page_num % 3 == 0:
                        print(f"🔍 Checking if we have enough content after {page_num} pages...")
                        
                        # Wait for current OCR tasks to complete (only the ones we've started)
                        current_tasks = ocr_tasks[:page_num]  # Only tasks for pages extracted so far
                        completed_ocr = await asyncio.gather(*current_tasks, return_exceptions=True)
                        page_contents = []
                        
                        for i, result in enumerate(completed_ocr):
                            if isinstance(result, dict):
                                page_contents.append(result)
                        
                        page_contents.sort(key=lambda x: x['page_number'])
                        
                        if len(page_contents) >= 3:  # Need at least 3 pages to analyze
                            early_analysis = await analyze_book_with_gpt4(page_contents)
                            classification = early_analysis.get("classification", "unknown")
                            content_pages = early_analysis.get("content_pages", [])
                            
                            # Check if we have the required page
                            target_page = None
                            if classification == "fiction" and len(content_pages) >= 2:
                                target_page = content_pages[1]  # 2nd content page for fiction
                            elif classification == "non-fiction" and len(content_pages) >= 1:
                                target_page = content_pages[0]  # 1st content page for non-fiction
                            
                            if target_page and target_page <= page_num:
                                print(f"🎯 Early stop: Found required page {target_page} for {classification}!")
                                print(f"PROGRESS:{json.dumps({'step_id': 'early_stop', 'description': f'✅ Found target page {target_page} for {classification} - stopping extraction', 'status': 'completed'})}")
                                break  # Stop extraction early
                    
                    # Enhanced page navigation
                    if page_num < max_pages:
                        navigation_success = False
                        navigation_methods = [
                            ('Right Arrow Key', lambda: page.keyboard.press('ArrowRight')),
                            ('Page Down', lambda: page.keyboard.press('PageDown')),
                            ('Space Key', lambda: page.keyboard.press('Space')),
                        ]
                        
                        for method_name, method_func in navigation_methods:
                            try:
                                print(f"🔄 Trying navigation: {method_name}")
                                await method_func()
                                await page.wait_for_timeout(2000)
                                navigation_success = True
                                break
                            except:
                                continue
                        
                        if not navigation_success:
                            print(f"⚠️ Navigation failed for page {page_num}")
                    
                await browser.close()
                pages_extracted = max_pages  # Set pages_extracted for OCR phase
                print(f"✅ Enhanced navigation completed: {pages_extracted} pages extracted")
                # Continue to OCR analysis - don't return early
            
            # Main extraction loop with viewer element found
            print(f"PROGRESS:{json.dumps({'step_id': 'extraction', 'description': '🎯 Starting page extraction from viewer...', 'status': 'running'})}")
            
            pages_extracted = 0
            for page_num in range(1, max_pages + 1):
                try:
                    print(f"PROGRESS:{json.dumps({'step_id': f'page_{page_num}', 'description': f'📄 Extracting page {page_num}...', 'status': 'running'})}")
                    
                    # Wait for content to load
                    await page.wait_for_timeout(2000)
                    
                    # Take high-quality screenshot of the viewer area
                    screenshot_path = os.path.join(screenshots_dir, f"page_{page_num}.png")
                    
                    # Moderate zoom to fit content but maintain quality
                    await page.evaluate("document.body.style.zoom = '0.65'")
                    await page.wait_for_timeout(1000)  # Let zoom take effect
                    
                    # Scroll to ensure we capture the full content
                    await page.evaluate("window.scrollTo(0, 0)")  # Start from top
                    await page.wait_for_timeout(500)
                    
                    try:
                        # Try to screenshot just the viewer element (now zoomed out)
                        await viewer_element.screenshot(
                            path=screenshot_path,
                            type='png',  # Explicit PNG for lossless quality
                            omit_background=False  # Include background for better contrast
                        )
                        print(f"✅ Viewer screenshot saved: page_{page_num}.png")
                    except:
                        # Fallback: targeted crop for book content area
                        await page.screenshot(
                            path=screenshot_path,
                            full_page=False,  # Viewport only
                            clip={'x': 200, 'y': 80, 'width': 1000, 'height': 1080},  # Maximum height to ensure no bottom cut-off
                            type='png',  # Explicit PNG for lossless quality
                            omit_background=False  # Include background for better contrast
                        )
                        print(f"✅ Targeted screenshot saved: page_{page_num}.png")
                    
                    # Start OCR processing immediately for this page
                    ocr_task = asyncio.create_task(extract_text_from_image_async(screenshot_path))
                    ocr_tasks.append(ocr_task)
                    print(f"🔄 Started OCR for page {page_num} in parallel...")
                    
                    # Send screenshot update to UI
                    await send_screenshot_update(page, f'page_{page_num}', f'📄 Captured page {page_num}')
                    pages_extracted += 1

                    # Early analysis: Check every 3 pages if we can stop extraction
                    if page_num >= 3 and page_num % 3 == 0:
                        print(f"🔍 Checking if we have enough content after {page_num} pages...")
                        
                        # Wait for current OCR tasks to complete (only the ones we've started)
                        current_tasks = ocr_tasks[:page_num]  # Only tasks for pages extracted so far
                        completed_ocr = await asyncio.gather(*current_tasks, return_exceptions=True)
                        page_contents = []
                        
                        for i, result in enumerate(completed_ocr):
                            if isinstance(result, dict):
                                page_contents.append(result)
                        
                        page_contents.sort(key=lambda x: x['page_number'])
                        
                        if len(page_contents) >= 3:  # Need at least 3 pages to analyze
                            early_analysis = await analyze_book_with_gpt4(page_contents)
                            classification = early_analysis.get("classification", "unknown")
                            content_pages = early_analysis.get("content_pages", [])
                            
                            # Check if we have the required page
                            target_page = None
                            if classification == "fiction" and len(content_pages) >= 2:
                                target_page = content_pages[1]  # 2nd content page for fiction
                            elif classification == "non-fiction" and len(content_pages) >= 1:
                                target_page = content_pages[0]  # 1st content page for non-fiction
                            
                            if target_page and target_page <= page_num:
                                print(f"🎯 Early stop: Found required page {target_page} for {classification}!")
                                print(f"PROGRESS:{json.dumps({'step_id': 'early_stop', 'description': f'✅ Found target page {target_page} for {classification} - stopping extraction', 'status': 'completed'})}")
                                break  # Stop extraction early
                    
                    # Navigate to next page using better methods
                    if page_num < max_pages:
                        print(f"➡️ Navigating to page {page_num + 1}...")
                        
                        navigation_success = False
                        
                        # Method 1: Try Google Books specific navigation
                        next_selectors = [
                            'button[aria-label*="Next page"]',
                            'button[aria-label*="next"]',
                            '.gb-next',
                            '[title*="Next"]',
                            'button:has-text("Next")',
                            '[data-direction="next"]'
                        ]
                        
                        for selector in next_selectors:
                            next_buttons = await page.query_selector_all(selector)
                            if next_buttons:
                                try:
                                    await next_buttons[0].click()
                                    await page.wait_for_timeout(3000)  # Longer wait for page load
                                    navigation_success = True
                                    print(f"✅ Navigated using: {selector}")
                                    break
                                except:
                                    continue
                        
                        # Method 2: Keyboard navigation (most reliable for Google Books)
                        if not navigation_success:
                            keyboard_methods = [
                                ('Right Arrow', 'ArrowRight'),
                                ('Page Down', 'PageDown'),
                                ('Space', 'Space')
                            ]
                            
                            for method_name, key in keyboard_methods:
                                try:
                                    print(f"🔄 Trying {method_name} navigation...")
                                    await page.keyboard.press(key)
                                    await page.wait_for_timeout(3000)
                                    navigation_success = True
                                    print(f"✅ Navigated using {method_name}")
                                    break
                                except:
                                    continue
                        
                        if not navigation_success:
                            print(f"⚠️ All navigation methods failed for page {page_num}")
                            
                except Exception as e:
                    print(f"❌ Error processing page {page_num}: {str(e)}")
                    continue
            
            print(f"✅ Completed extraction of {pages_extracted} pages")
            
        except Exception as e:
            print(f"❌ Error during extraction: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "pages_extracted": 0
            }
        
        finally:
            await browser.close()
    
    # Check results
    screenshot_files = [f for f in os.listdir(screenshots_dir) if f.startswith("page_") and f.endswith(".png")]
    actual_pages = len(screenshot_files)
    
    # OCR Analysis Phase - Wait for any remaining OCR tasks
    print(f"PROGRESS:{json.dumps({'step_id': 'ocr_start', 'description': '🔍 Finalizing OCR analysis of extracted pages...', 'status': 'running'})}")
    
    page_contents = []
    
    # Wait for all parallel OCR tasks to complete (including any that finished early)
    print(f"PROGRESS:{json.dumps({'step_id': 'ocr_wait', 'description': f'⏳ Waiting for parallel OCR processing of {len(ocr_tasks)} pages...', 'status': 'running'})}")
    
    page_contents = []
    if ocr_tasks:
        # Gather all OCR results (some might already be completed from early analysis)
        ocr_results = await asyncio.gather(*ocr_tasks, return_exceptions=True)
        
        # Process results and handle any exceptions
        for i, result in enumerate(ocr_results):
            if isinstance(result, Exception):
                print(f"❌ OCR failed for task {i+1}: {result}")
                continue
            elif isinstance(result, dict):
                page_contents.append(result)
                page_num = result['page_number']
                text_len = result['text_length']
                print(f"✅ Page {page_num}: {text_len} chars (OCR completed)")
    
    # Sort pages by page number to ensure correct order
    page_contents.sort(key=lambda x: x['page_number'])
    
    print(f"PROGRESS:{json.dumps({'step_id': 'ocr_complete', 'description': f'✅ Parallel OCR analysis complete. Processed {len(page_contents)} pages.', 'status': 'completed'})}")
    
    # GPT-4 Analysis Phase
    selected_page = None
    gpt4_result = {"classification": "unknown", "confidence": "low"}
    
    if page_contents:
        print(f"PROGRESS:{json.dumps({'step_id': 'gpt4_start', 'description': '🤖 Analyzing all pages with GPT-4...', 'status': 'running'})}")
        
        gpt4_result = await analyze_book_with_gpt4(page_contents)
        
        classification = gpt4_result.get("classification", "unknown")
        content_pages = gpt4_result.get("content_pages", [])
        selected_page_num = gpt4_result.get("selected_page", None)
        reasoning = gpt4_result.get("reasoning", "")
        
        print(f"PROGRESS:{json.dumps({'step_id': 'gpt4_complete', 'description': f'✅ Book classified as: {classification}', 'status': 'completed'})}")
        print(f"🤖 GPT-4 Analysis:")
        print(f"   📚 Classification: {classification}")
        print(f"   📄 Content pages: {content_pages}")
        print(f"   🎯 Selected page: {selected_page_num}")
        print(f"   💭 Reasoning: {reasoning}")
        
        # Get the selected page details
        if selected_page_num and 1 <= selected_page_num <= len(page_contents):
            selected_page = page_contents[selected_page_num - 1]
            print(f"📖 Selected page {selected_page_num} with {len(selected_page['text'])} characters")
        else:
            print("⚠️ GPT-4 did not select a valid page")
    
    result = {
        "success": True,
        "pages_extracted": actual_pages,
        "screenshots_dir": screenshots_dir,
        "files": screenshot_files,
        "extracted_content": f"Successfully extracted {actual_pages} pages using Playwright automation",
        "message": f"Successfully extracted {actual_pages} pages to {screenshots_dir}",
        "gpt4_analysis": {
            "total_pages": len(page_contents),
            "classification": gpt4_result.get("classification", "unknown"),
            "content_pages": gpt4_result.get("content_pages", []),
            "selected_page_number": gpt4_result.get("selected_page", None),
            "reasoning": gpt4_result.get("reasoning", ""),
            "selected_page_content": selected_page["text"] if selected_page else None,
            "selected_page_filename": selected_page["filename"] if selected_page else None,
            "all_pages": page_contents
        }
    }
    
    # Output result for backend communication
    print(f"RESULT:{json.dumps(result)}")
    return result

async def extract_text_from_image_async(image_path: str) -> dict:
    """Extract text from image using OCR with noise filtering - async version"""
    # Extract page number from filename
    filename = os.path.basename(image_path)
    page_num = int(filename.split('_')[1].split('.')[0])
    
    if not TESSERACT_AVAILABLE:
        print(f"⚠️ OCR not available for {image_path}, returning empty text")
        return {
            "page_number": page_num,
            "filename": filename,
            "text": "",
            "text_length": 0
        }
    
    loop = asyncio.get_event_loop()
    
    def run_ocr():
        try:
            image = Image.open(image_path)
            text = pytesseract.image_to_string(image)
            cleaned_text = clean_ocr_text(text)
            return cleaned_text.strip()
        except Exception as e:
            print(f"OCR error for {image_path}: {e}")
            return ""
    
    # Run OCR in thread pool to avoid blocking
    with concurrent.futures.ThreadPoolExecutor() as executor:
        text = await loop.run_in_executor(executor, run_ocr)
    
    return {
        "page_number": page_num,
        "filename": filename,
        "text": text,
        "text_length": len(text)
    }

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
    # The backend looks for RESULT: line, so avoid extra output
    if not any('backend.py' in arg for arg in sys.argv):
        print("\n" + "="*50)
        print("EXTRACTION RESULT:")
        print(json.dumps(result, indent=2))

if __name__ == "__main__":
    asyncio.run(main()) 