#!/usr/bin/env python3
"""
Simplified Playwright-based book page extractor for Google Books preview pages.
"""

import asyncio
import os
import sys
import json
from datetime import datetime
from playwright.async_api import async_playwright

async def extract_google_books_pages(preview_url: str, book_title: str, book_author: str, max_pages: int = 5) -> dict:
    """Extract pages from Google Books preview using Playwright"""
    try:
        print(f"PROGRESS:{json.dumps({'step_id': 'init', 'description': f'Starting automation for: {book_title}', 'status': 'running'})}")
        
        # Check if running in production environment
        is_production = os.getenv('NODE_ENV') == 'production'
        browser_path = os.getenv('PLAYWRIGHT_BROWSERS_PATH', '/opt/render/project/.playwright')
        
        print(f"Environment: {'production' if is_production else 'development'}")
        print(f"Browser path: {browser_path}")
        
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
                
                print(f"PROGRESS:{json.dumps({'step_id': 'browser_launch', 'description': 'Launching browser...', 'status': 'running'})}")
                
                browser = await p.chromium.launch(**launch_options)
                print("Browser launched successfully")
                
                page = await browser.new_page()
                print("New page created")
                
                # Set viewport and user agent
                await page.set_viewport_size({"width": 1280, "height": 720})
                
            except Exception as browser_error:
                error_msg = f"Browser launch failed: {str(browser_error)}"
                print(f"ERROR:{error_msg}")
                return {
                    "success": False,
                    "error": error_msg,
                    "pages_extracted": 0
                }

            # Create screenshots directory
            timestamp = int(datetime.now().timestamp())
            screenshots_dir = os.path.join('temp', 'screenshots', f'book_{timestamp}')
            os.makedirs(screenshots_dir, exist_ok=True)
            
            print(f"PROGRESS:{json.dumps({'step_id': 'setup', 'description': f'Extracting pages from: {book_title}', 'status': 'running'})}")
            
            try:
                print(f"PROGRESS:{json.dumps({'step_id': 'navigation', 'description': 'Navigating to Google Books preview...', 'status': 'running'})}")
                await page.goto(preview_url, wait_until='networkidle')
                
                # Wait for the page to load
                await page.wait_for_timeout(5000)
                
                print(f"PROGRESS:{json.dumps({'step_id': 'navigation', 'description': 'Navigation completed', 'status': 'completed'})}")
                
            except Exception as navigation_error:
                error_msg = f"Navigation failed: {str(navigation_error)}"
                print(f"ERROR:{error_msg}")
                return {
                    "success": False,
                    "error": error_msg,
                    "pages_extracted": 0
                }

            # Simple page extraction
            pages_extracted = 0
            
            print("Starting simple page extraction...")
            for page_num in range(1, min(max_pages + 1, 6)):  # Limit to 5 pages for safety
                progress_msg = f"Capturing page {page_num}..."
                print(f"PROGRESS:{json.dumps({'step_id': f'page_{page_num}', 'description': progress_msg, 'status': 'running'})}")
                
                # Take screenshot
                screenshot_filename = f"page_{page_num:03d}.png"
                screenshot_path = os.path.join(screenshots_dir, screenshot_filename)
                
                try:
                    await page.screenshot(path=screenshot_path, full_page=True)
                    print(f"Screenshot saved: {screenshot_filename}")
                    pages_extracted += 1
                    
                    # Simple navigation for next page
                    if page_num < 5:
                        await page.keyboard.press("ArrowRight")
                        await page.wait_for_timeout(3000)
                        
                except Exception as e:
                    print(f"Error processing page {page_num}: {str(e)}")
                    break
                    
            print(f"Completed extraction of {pages_extracted} pages")
            
            try:
                await browser.close()
            except:
                pass
    
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
        print("\n" + "="*50)
        print("EXTRACTION RESULT:")
        print(json.dumps(result, indent=2))

if __name__ == "__main__":
    asyncio.run(main()) 