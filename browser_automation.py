#!/usr/bin/env python3
"""
Browser automation script using browser-use to search and extract content from Archive.org books.
"""

import asyncio
import sys
import json
import os
import base64
from datetime import datetime
from urllib.parse import quote
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

async def automate_book_extraction(book_title: str, book_author: str, preview_url: str = None, callback_url: str = None):
    """
    Use browser-use to automate book content extraction from Google Books preview.
    
    Args:
        book_title: Title of the book to search for
        book_author: Author of the book
        preview_url: Direct URL to Google Books preview page
        callback_url: Optional URL to send progress updates to
    """
    
    # Send progress update function (defined outside try block for proper scope)
    def send_progress(step_id: str, description: str, status: str, url: str = None):
        progress = {
            "step_id": step_id,
            "description": description,
            "status": status,
            "url": url,
            "timestamp": datetime.now().isoformat()
        }
        print(f"PROGRESS:{json.dumps(progress)}")
        sys.stdout.flush()
    
    try:
        # Import browser-use (will be installed separately)
        from browser_use import Agent
        from browser_use.llm import ChatOpenAI
        
        # Create screenshots directory
        screenshots_dir = os.path.abspath("temp/screenshots")
        os.makedirs(screenshots_dir, exist_ok=True)
        send_progress("screenshots", f"📂 Screenshots directory created: {screenshots_dir}", "completed")
        
        # Use the provided preview URL, or fallback to Archive.org search
        if preview_url:
            target_url = preview_url
            task = f"""
            Extract book pages from Google Books by saving page images directly using right-click.

            STEP-BY-STEP PROCESS:
            1. Navigate to {target_url}
            2. Wait for the Google Books reader to load completely
            3. For each page (1-6), do the following:
               a) Locate the book page content area (white/cream pages with text in the center)
               b) RIGHT-CLICK directly on the book page content area
               c) From the context menu, select "Save image as..." or "Save picture as..."
               d) Save the image to "{screenshots_dir}/page_X.png" (where X is page number 1,2,3,4,5,6)
               e) Click the next page arrow to go to the next page
               f) Wait for the page to load completely
               g) Repeat for up to 6 pages total

            CRITICAL INSTRUCTIONS:
            - RIGHT-CLICK on the actual book page content (the white area with text)
            - Use "Save image as..." from the context menu to save each page
            - Save images with exact names: page_1.png, page_2.png, page_3.png, etc.
            - Navigate between pages using the page navigation arrows
            - Focus only on the book content area, not the navigation or interface elements

            WHAT TO LOOK FOR:
            - White or cream-colored book pages with black text in the center of the screen
            - The main reading area where the actual book content appears
            - Text content like "A spot of light appeared..." or other story narrative

            YOUR GOAL: Save 6 high-quality images of the actual book pages using right-click save so we can process the text later.

            After saving all pages, return a summary like:
            "Successfully saved 6 pages as images to the screenshots directory."
            """
        else:
            # Fallback to Archive.org search if no preview URL provided
            encoded_title = quote(f"({book_title})")
            encoded_author = quote(f"({book_author})")
            target_url = f"https://archive.org/search?query=title%3A{encoded_title}%20AND%20creator%3A{encoded_author}"
            task = f"""
            Follow these steps to extract book content from Archive.org:

            1. Go directly to this search URL: {target_url}
            2. Look at the search results for "{book_title}" by {book_author}
            3. Find the book version with the MOST STARS (highest rating) - this will be the best quality
            4. Click on that highest-rated book to open it
            5. In the book reader, navigate through pages using arrows or page controls
            6. Extract text content from the first 4-5 pages
            7. Focus on actual book content, not title pages or table of contents

            Important: Always choose the book version with the most stars for the best quality content.
            Return the extracted text from all pages in a clear format.
            """
        
        # Initialize progress tracking
        send_progress("step1", "🌐 Initializing browser automation", "running")
        
        # Create the AI agent with OpenAI
        agent = Agent(
            task=task,
            llm=ChatOpenAI(
                model="gpt-4o", 
                temperature=0.0,  # Make it more deterministic
                api_key=os.getenv('OPENAI_API_KEY')
            ),
            # Add some configuration for better reliability
            max_actions_per_step=3,
            use_vision=True,
        )
        
        send_progress("step1", "🌐 Browser automation initialized", "completed", target_url)
        if preview_url:
            send_progress("step2", f"📖 Navigating to Google Books preview: {book_title}", "running")
        else:
            send_progress("step2", f"🔍 Navigating to Archive.org search: {book_title}", "running")
        
        # Run the agent
        result = await agent.run(max_steps=40)
        
        send_progress("step2", "🔍 Search and navigation completed", "completed")
        send_progress("step3", "📖 Content extraction completed", "completed")
        
        # Check for saved screenshots
        screenshot_files = [f for f in os.listdir(screenshots_dir) if f.startswith("page_") and f.endswith(".png")]
        screenshot_count = len(screenshot_files)
        
        if screenshot_count > 0:
            send_progress("step4", f"✅ Automation completed! {screenshot_count} screenshots saved to {screenshots_dir}", "completed")
        else:
            send_progress("step4", f"⚠️ Automation completed but no screenshots found in {screenshots_dir}", "completed")
        
        # Process the result
        extracted_content = str(result) if result else "No content could be extracted"
        
        # Output the final result
        output = {
            "success": True,
            "extracted_content": extracted_content,
            "book_title": book_title,
            "book_author": book_author,
            "target_url": target_url,
            "preview_url": preview_url,
            "timestamp": datetime.now().isoformat()
        }
        
        print(f"RESULT:{json.dumps(output)}")
        return output
        
    except ImportError:
        error_msg = "browser-use package not found. Please install it with: pip install browser-use"
        send_progress("error", f"❌ {error_msg}", "error")
        print(f"ERROR:{error_msg}")
        return {"success": False, "error": error_msg}
        
    except Exception as e:
        error_msg = f"Automation failed: {str(e)}"
        send_progress("error", f"❌ {error_msg}", "error") 
        print(f"ERROR:{error_msg}")
        return {"success": False, "error": error_msg}

async def main():
    """Main function to handle command line arguments and run automation."""
    if len(sys.argv) < 3:
        print("Usage: python browser_automation.py <book_title> <book_author> [preview_url] [callback_url]")
        sys.exit(1)
    
    book_title = sys.argv[1]
    book_author = sys.argv[2]
    preview_url = sys.argv[3] if len(sys.argv) > 3 else None
    callback_url = sys.argv[4] if len(sys.argv) > 4 else None
    
    await automate_book_extraction(book_title, book_author, preview_url, callback_url)

if __name__ == "__main__":
    asyncio.run(main()) 