#!/usr/bin/env python3
"""
Python backend server for BookFetcher.
Handles book identification and browser automation.
"""

import asyncio
import base64
import json
import os
import sys
from datetime import datetime
from urllib.parse import quote
from io import BytesIO
import tempfile
import requests
import threading
import time

from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
# Socket.io removed - using HTTP polling instead
from dotenv import load_dotenv
import openai
from openai import OpenAI
from PIL import Image
# PyPDF2 import removed - no longer using PDF extraction

# Load environment variables
load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = 'bookfetcher_secret_key'

# Configure CORS for both development and production
cors_origins = [
    "http://localhost:3000",
    "http://localhost:10000", 
    "https://bookfetcher.onrender.com"
]

CORS(app, origins=cors_origins)

# In-memory storage for automation status (use Redis in production)
automation_status = {}
automation_lock = threading.Lock()

# Initialize OpenAI client
openai.api_key = os.getenv('OPENAI_API_KEY')

@app.route('/', methods=['GET', 'HEAD'])
def root():
    """Root endpoint for Render health checks."""
    return jsonify({"status": "BookFetcher Backend API", "version": "1.0.0"})

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({"status": "healthy", "timestamp": datetime.now().isoformat()})

@app.route('/screenshot/<filename>')
def serve_screenshot(filename):
    """Serve screenshot images from the temp/screenshots directory"""
    try:
        screenshots_dir = os.path.join('temp', 'screenshots')
        return send_from_directory(screenshots_dir, filename)
    except Exception as e:
        print(f"❌ Error serving screenshot {filename}: {e}")
        return jsonify({'error': 'Screenshot not found'}), 404

@app.route('/identify-book', methods=['POST'])
def identify_book():
    """Identify book from uploaded cover image using GPT-4 Vision."""
    try:
        data = request.get_json()
        
        if not data or 'image' not in data:
            return jsonify({"error": "No image provided"}), 400
            
        # Extract base64 image data
        image_data = data['image']
        if image_data.startswith('data:image'):
            # Remove data:image/jpeg;base64, prefix
            image_data = image_data.split(',')[1]
        
        # Validate image
        try:
            image_bytes = base64.b64decode(image_data)
            image = Image.open(BytesIO(image_bytes))
            print(f"📖 Image loaded: {image.size}, format: {image.format}")
        except Exception as e:
            return jsonify({"error": f"Invalid image data: {str(e)}"}), 400
        
        # Call GPT-4 Vision API
        response = openai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": """First, carefully examine this image to determine if it shows a clear book cover.

VALIDATION CRITERIA:
- Must show a book cover (front of a book)
- Title text must be clearly visible and readable
- Author name should be visible (if present)
- Image should not be blurry, upside down, or heavily obscured
- Should not be a random object, person, screenshot, or non-book image

If this image does NOT meet these criteria, return:
{
    "error": "not_a_book_cover",
    "message": "This doesn't appear to be a clear book cover. Please retake the photo with a clear view of the book's front cover."
}

If this IS a clear book cover, extract the book information and return:
{
    "title": "exact book title",
    "author": "author name", 
    "genre": "primary genre",
    "description": "brief description of what you see on the cover"
}

Return ONLY the JSON object, nothing else."""
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_data}"
                            }
                        }
                    ]
                }
            ],
            max_tokens=300,
            temperature=0.1
        )
        
        # Parse GPT-4 response
        gpt_response = response.choices[0].message.content.strip()
        print(f"🤖 GPT-4 response: {gpt_response}")
        
        # Try to parse as JSON (handle markdown-wrapped JSON)
        try:
            # Remove markdown wrapper if present
            if gpt_response.startswith('```json'):
                gpt_response = gpt_response.replace('```json', '').replace('```', '').strip()
            elif gpt_response.startswith('```'):
                gpt_response = gpt_response.replace('```', '').strip()
            
            book_info = json.loads(gpt_response)
            
            # Check if GPT-4 determined this is not a book cover
            if 'error' in book_info and book_info['error'] == 'not_a_book_cover':
                print(f"❌ GPT-4 validation failed: {book_info.get('message', 'Not a clear book cover')}")
                return jsonify({
                    "error": book_info.get('message', 'This doesn\'t appear to be a clear book cover. Please retake the photo with a clear view of the book\'s front cover.')
                }), 400
            
            # Validate required fields for valid book covers
            required_fields = ['title', 'author', 'genre', 'description']
            for field in required_fields:
                if field not in book_info:
                    book_info[field] = "Unknown"
            
            print(f"✅ Book identified: {book_info['title']} by {book_info['author']}")
            return jsonify(book_info)
            
        except json.JSONDecodeError:
            # If JSON parsing fails, try to extract info manually
            print("⚠️ JSON parsing failed, attempting manual extraction")
            return jsonify({
                "title": "Unknown Title",
                "author": "Unknown Author", 
                "genre": "Unknown",
                "description": gpt_response[:200]
            })
        
    except Exception as e:
        print(f"❌ Error identifying book: {str(e)}")
        return jsonify({"error": f"Failed to identify book: {str(e)}"}), 500

@app.route('/generate-book-facts', methods=['POST'])
def generate_book_facts():
    """Generate interesting facts about the identified book."""
    try:
        data = request.get_json()
        title = data.get('title', '')
        author = data.get('author', '')
        genre = data.get('genre', '')
        
        if not title or not author:
            return jsonify({'error': 'Title and author are required'}), 400
            
        print(f"📚 Generating fun facts for: {title} by {author}")
        
        response = openai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": f"""Generate 6 interesting and engaging fun facts about the book "{title}" by {author}. 

Focus on:
- Fascinating behind-the-scenes details about the writing process
- Interesting real-world inspirations or influences  
- Notable awards, records, or cultural impact
- Fun trivia that readers would find entertaining
- Unique aspects that make this book special

Return as a JSON array of objects with "icon" (single emoji) and "text" fields.
Keep each fact concise but engaging (1-2 sentences max).

Example format:
[
  {{"icon": "✍️", "text": "The author wrote this while traveling across 12 countries."}},
  {{"icon": "🏆", "text": "Won the Hugo Award and sold over 10 million copies worldwide."}}
]"""
                }
            ],
            max_tokens=800,
            temperature=0.3
        )
        
        content = response.choices[0].message.content.strip()
        print(f"📝 Generated facts: {content[:200]}...")
        
        # Parse JSON response
        try:
            # Remove markdown wrapper if present
            if content.startswith('```json'):
                content = content.replace('```json', '').replace('```', '').strip()
            elif content.startswith('```'):
                content = content.replace('```', '').strip()
            
            facts = json.loads(content)
            
            return jsonify({
                'success': True,
                'facts': facts
            })
            
        except json.JSONDecodeError as e:
            print(f"❌ JSON parsing failed: {e}")
            # Return fallback facts
            return jsonify({
                'success': True,
                'facts': [
                    {"icon": "📚", "text": f"'{title}' is a beloved {genre.lower()} novel by {author}."},
                    {"icon": "✨", "text": "This book has captivated readers around the world with its compelling narrative."},
                    {"icon": "🎭", "text": "The story features complex characters and intricate plot development."},
                    {"icon": "🌟", "text": "Critics and readers alike have praised this work for its literary merit."}
                ]
            })
        
    except Exception as e:
        print(f"❌ Error generating book facts: {e}")
        return jsonify({'error': f'Failed to generate facts: {str(e)}'}), 500

@app.route('/start-automation', methods=['POST'])
def start_automation():
    """Start browser automation and return automation ID."""
    try:
        data = request.get_json()
        automation_id = data.get('automation_id')
        book_title = data.get('bookTitle', '')
        book_author = data.get('bookAuthor', '')
        genre = data.get('genre', 'Unknown')
        preview_url = data.get('previewUrl', '')
        
        if not automation_id:
            return jsonify({'error': 'automation_id is required'}), 400
        
        if not book_title or not book_author:
            return jsonify({'error': 'Book title and author are required'}), 400
        
        if not preview_url:
            return jsonify({'error': 'Preview URL is required'}), 400
        
        # Initialize automation status
        with automation_lock:
            automation_status[automation_id] = {
                'status': 'running',
                'progress': None,
                'result': None,
                'error': None,
                'url': preview_url,
                'screenshot': '',
                'started_at': datetime.now().isoformat()
            }
        
        print(f"🚀 Starting automation for: {book_title} by {book_author} with preview URL: {preview_url}")
        
        # Start automation in background thread
        thread = threading.Thread(
            target=run_browser_automation_http,
            args=(automation_id, book_title, book_author, preview_url)
        )
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'automation_id': automation_id,
            'status': 'started',
            'message': f'Automation started for {book_title} by {book_author}'
        })
        
    except Exception as e:
        print(f"❌ Error starting automation: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/automation-status/<automation_id>', methods=['GET'])
def get_automation_status(automation_id):
    """Get current automation status."""
    try:
        with automation_lock:
            status = automation_status.get(automation_id)
        
        if not status:
            return jsonify({'error': 'Automation not found'}), 404
        
        return jsonify(status)
        
    except Exception as e:
        print(f"❌ Error getting automation status: {str(e)}")
        return jsonify({'error': str(e)}), 500

def run_browser_automation_http(automation_id: str, book_title: str, book_author: str, preview_url: str):
    """Run Playwright automation and update status."""
    import subprocess
    import os
    
    try:
        # Update status
        with automation_lock:
            automation_status[automation_id].update({
                'status': 'running',
                'progress': f'📖 Starting Playwright automation for: {book_title}',
                'url': preview_url
            })
        
        # Run the Playwright script
        script_path = os.path.join(os.getcwd(), 'playwright_book_extractor.py')
        # Use system python3 instead of virtual environment
        python_path = 'python3'
        
        # Run the Playwright script with timeout
        process = subprocess.Popen(
            [python_path, script_path, preview_url, book_title, book_author],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            universal_newlines=True
        )
        
        # Read output in real-time and update status
        result = None
        while True:
            output = process.stdout.readline()
            if output == '' and process.poll() is not None:
                break
            if output:
                line = output.strip()
                if line.startswith('PROGRESS:'):
                    try:
                        progress_data = json.loads(line.replace('PROGRESS:', ''))
                        with automation_lock:
                            automation_status[automation_id].update({
                                'progress': progress_data.get('description', ''),
                                'url': progress_data.get('url', preview_url)
                            })
                        if 'screenshot' in progress_data:
                            with automation_lock:
                                automation_status[automation_id]['screenshot'] = progress_data['screenshot']
                    except:
                        pass
                elif line.startswith('RESULT:'):
                    try:
                        result_text = line.replace('RESULT:', '')
                        result = json.loads(result_text)
                        print(f"✅ Captured GPT-4 analysis result: {len(result_text)} characters")
                    except Exception as e:
                        print(f"❌ Failed to parse RESULT line: {e}")
                        pass
        
        # Wait for process to complete
        stdout, stderr = process.communicate()
        
        if process.returncode == 0:
            # Automation completed successfully
            with automation_lock:
                automation_status[automation_id].update({
                    'status': 'completed',
                    'result': result,
                    'completed_at': datetime.now().isoformat()
                })
            print(f"✅ Playwright automation completed successfully")
        else:
            error_msg = stderr or "Unknown error occurred"
            with automation_lock:
                automation_status[automation_id].update({
                    'status': 'error',
                    'error': f'Playwright automation failed: {error_msg}',
                    'failed_at': datetime.now().isoformat()
                })
        
    except Exception as e:
        print(f"❌ Automation error: {str(e)}")
        with automation_lock:
            automation_status[automation_id].update({
                'status': 'error',
                'error': str(e),
                'failed_at': datetime.now().isoformat()
            })

# @socketio.on('start_automation')  # Commented out - now using HTTP endpoints
def handle_automation_old(data):
    """Handle browser automation request via WebSocket."""
    try:
        book_title = data.get('bookTitle', '')
        book_author = data.get('bookAuthor', '')
        preview_url = data.get('previewUrl', '')
        
        if not book_title or not book_author:
            emit('automation_error', {'error': 'Book title and author are required'})
            return
        
        if preview_url:
            print(f"🚀 Starting automation for: {book_title} by {book_author} with preview URL: {preview_url}")
        else:
            print(f"🚀 Starting automation for: {book_title} by {book_author} (fallback to Archive.org)")
        
        # Run automation in background
        socketio.start_background_task(run_browser_automation, book_title, book_author, preview_url)
        
    except Exception as e:
        print(f"❌ Error starting automation: {str(e)}")
        emit('automation_error', {'error': str(e)})

def run_browser_automation(book_title: str, book_author: str, preview_url: str = None):
    """Run Playwright automation and emit progress updates."""
    import subprocess
    import asyncio
    import sys
    import os
    
    try:
        if not preview_url:
            socketio.emit('automation_error', {'error': 'Preview URL is required for Playwright automation'})
            return
        
        # Emit initial progress
        socketio.emit('automation_progress', {
            'step_id': 'step1',
            'description': f'📖 Starting Playwright automation for: {book_title}',
            'status': 'running',
            'url': preview_url,
            'timestamp': datetime.now().isoformat()
        })
        
        # Run the Playwright script
        script_path = os.path.join(os.getcwd(), 'playwright_book_extractor.py')
        # Use system python3 instead of virtual environment  
        python_path = 'python3'
        
        try:
            # Run the Playwright script with timeout
            process = subprocess.Popen(
                [python_path, script_path, preview_url, book_title, book_author],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                universal_newlines=True
            )
            
            # Read output in real-time and emit progress
            result = None
            while True:
                output = process.stdout.readline()
                if output == '' and process.poll() is not None:
                    break
                if output:
                    line = output.strip()
                    if line.startswith('PROGRESS:'):
                        try:
                            progress_data = json.loads(line.replace('PROGRESS:', ''))
                            emit_data = {
                                'step_id': progress_data.get('step_id', 'unknown'),
                                'description': progress_data.get('description', ''),
                                'status': progress_data.get('status', 'running'),
                                'timestamp': datetime.now().isoformat()
                            }
                            # Include screenshot if present
                            if 'screenshot' in progress_data:
                                emit_data['screenshot'] = progress_data['screenshot']
                            
                            socketio.emit('automation_progress', emit_data)
                        except:
                            pass
                    elif line.startswith('RESULT:'):
                        try:
                            result_text = line.replace('RESULT:', '')
                            result = json.loads(result_text)
                            print(f"✅ Captured GPT-4 analysis result: {len(result_text)} characters")
                        except Exception as e:
                            print(f"❌ Failed to parse RESULT line: {e}")
                            print(f"Raw line: {repr(line)}")
                            pass
            
            # Wait for process to complete
            stdout, stderr = process.communicate()
            
            if process.returncode == 0:
                # Playwright automation completed successfully
                emit_data = {
                    'timestamp': datetime.now().isoformat()
                }
                if result:
                    emit_data['result'] = result
                
                socketio.emit('automation_complete', emit_data)
                print(f"✅ Playwright automation completed successfully")
            else:
                error_msg = stderr or "Unknown error occurred"
                socketio.emit('automation_error', {
                    'error': f'Playwright automation failed: {error_msg}',
                    'timestamp': datetime.now().isoformat()
                })
                
        except Exception as e:
            print(f"❌ Failed to run Playwright script: {str(e)}")
            socketio.emit('automation_error', {
                'error': f'Failed to start Playwright automation: {str(e)}',
                'timestamp': datetime.now().isoformat()
            })
        
    except Exception as e:
        print(f"❌ Automation error: {str(e)}")
        socketio.emit('automation_error', {
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        })

async def run_automation_async(book_title: str, book_author: str, target_url: str, preview_url: str = None):
    """Async function to run browser automation with simplified, robust approach."""
    try:
        from browser_use import Agent
        from browser_use.llm import ChatOpenAI
        
        # Emit navigation progress
        socketio.emit('automation_progress', {
            'step_id': 'step2', 
            'description': f'🔍 Initializing browser automation',
            'status': 'running',
            'url': target_url,
            'timestamp': datetime.now().isoformat()
        })
        
        # Create task based on whether we have a preview URL
        if preview_url:
            # Google Books preview task
            simple_task = f"""
            Go to {target_url} to view the Google Books preview for "{book_title}" by {book_author}.
            
            GOAL: Extract ALL readable text from the Google Books preview pages, then STOP.
            
            Steps:
            1. Navigate to the Google Books preview URL
            2. Wait for the Google Books preview to load completely
            3. Look for the book reader interface with pages
            4. Extract text from the first available page: Read ALL visible text content - every word, paragraph, and line you can see
            5. Navigate to the next page using page controls or arrows
            6. Extract text from the next page: Read ALL visible text content - complete paragraphs and all readable text
            7. Continue this process for all available preview pages (typically 5-10 pages)
            8. If you encounter "limited preview" or "buy this book" messages, extract whatever text is visible
            9. STOP when you reach the end of the preview or find substantial content
            
            CRITICAL: 
            - Extract COMPLETE page content, not just snippets - read every word you can see
            - Include ALL paragraphs, dialogue, chapter headings, and any other text visible on each page
            - Focus on actual book content, ignore navigation buttons and UI elements
            - You have vision capabilities - read ALL the actual book text from the preview pages
            - Continue until you have extracted all available preview content
            """
        else:
            # Archive.org fallback task
            simple_task = f"""
            Go to {target_url} and find "{book_title}" by {book_author}.
            
            GOAL: Extract ALL readable text from EXACTLY 3 book pages starting from the beginning, then STOP.
            
            Steps:
            1. Navigate to the URL and find the book
            2. Click on the book to open it in the reader
            3. Make sure you're at the beginning of the book (first page/page 1)
            4. Extract text from Page 1: Read the ENTIRE book page image and extract ALL visible text content - every word, paragraph, and line you can see
            5. Click "next page" arrow to move forward  
            6. Extract text from Page 2: Read the ENTIRE page and extract ALL visible text content - complete paragraphs and all readable text
            7. Click "next page" arrow one more time
            8. Extract text from Page 3: Read the ENTIRE page and extract ALL visible text content - every word and paragraph visible
            9. STOP - Do not continue clicking or extracting after 3 pages
            
            CRITICAL: 
            - Start from the beginning of the book (page 1), not from any previous bookmark
            - Extract COMPLETE page content, not just snippets - read every word you can see in the page images
            - Include ALL paragraphs, dialogue, chapter headings, and any other text visible on each page
            - After extracting text from 3 pages, immediately stop the task
            - Do not continue clicking "next page" or taking more actions
            - You have vision capabilities - read ALL the actual book text from the scanned page images
            """
        
        # Create browser agent with fresh session each time
        from browser_use import Agent, BrowserConfig, Browser
        import tempfile
        import uuid
        
        # Create a unique temporary profile for each session to ensure fresh start
        temp_profile_dir = tempfile.mkdtemp(prefix=f"bookfetcher_browser_{uuid.uuid4().hex[:8]}_")
        print(f"🆕 Using fresh browser profile: {temp_profile_dir}")
        
        # Configure browser to run in true headless mode with fresh profile
        browser = Browser(config=BrowserConfig(
            headless=True,  # This is the correct way to set headless
            chrome_instance_path=None,  # Use default Chrome/Chromium
            user_data_dir=temp_profile_dir,  # Fresh temporary profile each time
            new_context_config={
                'viewport': {'width': 1280, 'height': 720},
                'user_agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        ))
        
        agent = Agent(
            task=simple_task,
            llm=ChatOpenAI(
                model="gpt-4o",  # Vision-capable model to read text from book page images
                temperature=0.1  # Very low temperature for precise, focused behavior
            ),
            browser=browser,  # Pass the configured browser
            max_failures=2,  # Quick failure recovery
            max_actions_per_step=1,  # Single action per step for better control
            max_steps=9   # Limited steps: navigate(1) + click book(1) + check start(1) + extract(1) + next(1) + extract(1) + next(1) + extract(1) + stop(1)
        )

        # Create screenshot capture function with correct browser-use API
        async def capture_browser_state():
            try:
                if hasattr(agent, 'browser_session') and agent.browser_session:
                    # Use the correct browser-use API to get current page
                    current_page = await agent.browser_session.get_current_page()
                    if current_page:
                        screenshot = await current_page.screenshot()
                        screenshot_b64 = base64.b64encode(screenshot).decode('utf-8')
                        
                        print(f"📸 Screenshot captured from: {current_page.url}")
                        
                        # Emit screenshot to frontend
                        socketio.emit('browser_screenshot', {
                            'screenshot': f"data:image/png;base64,{screenshot_b64}",
                            'url': current_page.url,
                            'timestamp': datetime.now().isoformat()
                        })
                        
            except Exception as e:
                print(f"📸 Screenshot capture failed: {e}")

        # Start periodic screenshot capture and content monitoring
        screenshot_task = None
        content_monitor_task = None
        sent_content_files = set()  # Track which files we've already sent
        
        try:
            # Start screenshot task
            async def screenshot_loop():
                while True:
                    await capture_browser_state()
                    await asyncio.sleep(2)  # Screenshot every 2 seconds
            
            # Start content monitoring task
            async def content_monitor_loop():
                while True:
                    try:
                        # Check for new content files periodically
                        import glob
                        import tempfile
                        import os
                        
                        current_files = set(glob.glob("extracted_content_*.md"))
                        temp_dir = tempfile.gettempdir()
                        current_files.update(glob.glob(f"{temp_dir}/**/extracted_content_*.md", recursive=True))
                        
                        # Check for new files we haven't sent yet
                        new_files = current_files - sent_content_files
                        if new_files:
                            new_content = []
                            for file_path in new_files:
                                try:
                                    with open(file_path, 'r') as f:
                                        file_content = f.read()
                                        if file_content.strip():
                                            new_content.append(f"From {os.path.basename(file_path)}:\n{file_content}")
                                            print(f"📚 Found new content file: {file_path}")
                                    sent_content_files.add(file_path)
                                except Exception as e:
                                    print(f"Error reading new content file {file_path}: {e}")
                            
                            # Send new content immediately to frontend
                            if new_content:
                                socketio.emit('content_extracted', {
                                    'book_title': book_title,
                                    'book_author': book_author,
                                    'content_sections': new_content,
                                    'timestamp': datetime.now().isoformat()
                                })
                                print(f"📡 Sent {len(new_content)} new content sections to frontend")
                        
                    except Exception as e:
                        print(f"Error in content monitor: {e}")
                    
                    await asyncio.sleep(3)  # Check for content every 3 seconds
            
            screenshot_task = asyncio.create_task(screenshot_loop())
            content_monitor_task = asyncio.create_task(content_monitor_loop())
            
            # Run the agent with extended timeout for Archive.org navigation
            result = await asyncio.wait_for(agent.run(), timeout=300)  # 5 minute timeout
            
            # Cancel background tasks
            if screenshot_task:
                screenshot_task.cancel()
            if content_monitor_task:
                content_monitor_task.cancel()
            
            # Cleanup temporary browser profile
            try:
                import shutil
                shutil.rmtree(temp_profile_dir, ignore_errors=True)
                print(f"🧹 Cleaned up temporary browser profile: {temp_profile_dir}")
            except Exception as e:
                print(f"Warning: Could not cleanup temp profile {temp_profile_dir}: {e}")
            
            # Process and extract meaningful content from result
            extracted_content = []
            result_text = str(result) if result else ""
            
            print(f"🔍 Automation result type: {type(result)}")
            print(f"🔍 Result text preview: {result_text[:200]}...")
            
            # Try to extract any text content that was found
            if "extracted_content" in result_text.lower() or "text" in result_text.lower():
                extracted_content.append(result_text)
                print("📝 Added result text to extracted content")
            
            # Check for any saved content files in multiple locations
            import glob
            import tempfile
            import os
            
            # Search in current directory
            content_files = glob.glob("extracted_content_*.md")
            print(f"🔍 Found {len(content_files)} content files in current directory")
            
            # Also search in system temp directory where browser-use might save files
            temp_dir = tempfile.gettempdir()
            temp_content_files = glob.glob(f"{temp_dir}/**/extracted_content_*.md", recursive=True)
            content_files.extend(temp_content_files)
            print(f"🔍 Found {len(temp_content_files)} content files in temp directory: {temp_dir}")
            
            # If agent has a file system path, search there too
            try:
                if hasattr(agent, 'browser_session') and hasattr(agent.browser_session, 'temp_dir'):
                    agent_temp_files = glob.glob(f"{agent.browser_session.temp_dir}/**/extracted_content_*.md", recursive=True)
                    content_files.extend(agent_temp_files)
                    print(f"🔍 Found {len(agent_temp_files)} content files in agent temp directory")
                
                # Also check browser-use typical temp paths
                import os
                home_dir = os.path.expanduser("~")
                browser_use_temp = f"{temp_dir}/browser_use_agent_*"
                browser_use_dirs = glob.glob(browser_use_temp)
                for dir_path in browser_use_dirs:
                    dir_content_files = glob.glob(f"{dir_path}/**/extracted_content_*.md", recursive=True)
                    content_files.extend(dir_content_files)
                    print(f"🔍 Found {len(dir_content_files)} content files in browser-use dir: {dir_path}")
            except Exception as e:
                print(f"Error searching additional directories: {e}")
            
            for file_path in content_files:
                try:
                    with open(file_path, 'r') as f:
                        file_content = f.read()
                        if file_content.strip():
                            extracted_content.append(f"From {os.path.basename(file_path)}:\n{file_content}")
                            print(f"📚 Found extracted content file: {file_path}")
                    # Clean up temp files
                    os.remove(file_path)
                except Exception as e:
                    print(f"Error reading content file {file_path}: {e}")
            
            # Prepare content summary
            content_summary = "Automation completed successfully."
            if extracted_content:
                content_summary = f"Extracted {len(extracted_content)} content sections."
            
            # Emit completion with extracted content
            socketio.emit('automation_progress', {
                'step_id': 'step3', 
                'description': f'✅ {content_summary}',
                'status': 'completed',
                'extracted_content': extracted_content,
                'result': result_text,
                'timestamp': datetime.now().isoformat()
            })
            
            # Emit the extracted content separately for better frontend handling
            if extracted_content:
                socketio.emit('content_extracted', {
                    'book_title': book_title,
                    'book_author': book_author,
                    'content_sections': extracted_content,
                    'timestamp': datetime.now().isoformat()
                })
            
            return {
                'success': True,
                'content': extracted_content if extracted_content else [result_text],
                'content_summary': content_summary,
                'book_title': book_title,
                'book_author': book_author,
                'extraction_time': datetime.now().isoformat()
            }
            
        except asyncio.TimeoutError:
            if screenshot_task:
                screenshot_task.cancel()
            if content_monitor_task:
                content_monitor_task.cancel()
            
            # Cleanup temporary browser profile
            try:
                import shutil
                shutil.rmtree(temp_profile_dir, ignore_errors=True)
                print(f"🧹 Cleaned up temporary browser profile after timeout: {temp_profile_dir}")
            except:
                pass
                
            print("❌ Automation timed out after 5 minutes")
            
            # Check for any partial content that may have been extracted
            partial_content = []
            
            # Search in multiple locations for partial content
            content_files = glob.glob("extracted_content_*.md")
            temp_dir = tempfile.gettempdir()
            content_files.extend(glob.glob(f"{temp_dir}/**/extracted_content_*.md", recursive=True))
            
            for file_path in content_files:
                try:
                    with open(file_path, 'r') as f:
                        file_content = f.read()
                        if file_content.strip():
                            partial_content.append(f"Partial from {os.path.basename(file_path)}:\n{file_content}")
                            print(f"📚 Found partial content in: {file_path}")
                    os.remove(file_path)
                except:
                    pass
            
            socketio.emit('automation_progress', {
                'step_id': 'step3', 
                'description': '⏱️ Automation timed out but may have found some content',
                'status': 'timeout',
                'error': 'Timeout after 5 minutes',
                'extracted_content': partial_content,
                'timestamp': datetime.now().isoformat()
            })
            
            if partial_content:
                socketio.emit('content_extracted', {
                    'book_title': book_title,
                    'book_author': book_author,
                    'content_sections': partial_content,
                    'note': 'Partial extraction due to timeout',
                    'timestamp': datetime.now().isoformat()
                })
            
            return {
                'success': False, 
                'error': 'Automation timed out - Archive.org may be slow',
                'partial_content': partial_content,
                'book_title': book_title,
                'book_author': book_author
            }
            
        except Exception as e:
            if screenshot_task:
                screenshot_task.cancel()
            if content_monitor_task:
                content_monitor_task.cancel()
            
            # Cleanup temporary browser profile
            try:
                import shutil
                shutil.rmtree(temp_profile_dir, ignore_errors=True)
                print(f"🧹 Cleaned up temporary browser profile after error: {temp_profile_dir}")
            except:
                pass
                
            print(f"❌ Browser automation failed: {e}")
            
            # Emit error
            socketio.emit('automation_progress', {
                'step_id': 'step3', 
                'description': f'❌ Automation failed: {str(e)}',
                'status': 'error',
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            })
            
            return {
                'success': False, 
                'error': str(e),
                'book_title': book_title,
                'book_author': book_author
            }
            
    except Exception as e:
        print(f"❌ Automation setup failed: {e}")
        
        # Emit error
        socketio.emit('automation_progress', {
            'step_id': 'step3', 
            'description': f'❌ Setup failed: {str(e)}',
            'status': 'error',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        })
        
        return {
            'success': False, 
            'error': str(e),
            'book_title': book_title,
            'book_author': book_author
        }

# PDF extraction functionality removed - using Playwright automation instead

@app.route('/extract-text-from-image', methods=['POST', 'OPTIONS'])
def extract_text_from_image():
    """Extract text from a screenshot using GPT-4 Vision"""
    
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        response = jsonify({})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'POST')
        return response
    
    try:
        data = request.get_json()
        image_data = data.get('image')
        prompt = data.get('prompt', 'Extract all text from this image.')
        
        if not image_data:
            return jsonify({'error': 'No image data provided'}), 400
        
        # Remove data URL prefix if present
        if image_data.startswith('data:image/'):
            image_data = image_data.split(',')[1]
        
        print(f"📷 Processing screenshot for text extraction...")
        
        # Create OpenAI client
        client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
        
        # Use GPT-4 Vision to extract text
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{image_data}"
                            }
                        }
                    ]
                }
            ],
            max_tokens=1000,
            temperature=0.1
        )
        
        extracted_text = response.choices[0].message.content.strip()
        print(f"✅ GPT-4 Vision extracted {len(extracted_text)} characters")
        
        response = jsonify({'text': extracted_text})
        response.headers.add('Access-Control-Allow-Origin', '*')
        return response
        
    except Exception as e:
        print(f"❌ Error in text extraction: {str(e)}")
        response = jsonify({'error': str(e), 'text': ''})
        response.headers.add('Access-Control-Allow-Origin', '*')
        return response, 500

if __name__ == '__main__':
    # Get port from environment variable (Railway sets this)
    port = int(os.getenv('FLASK_PORT', 5000))
    debug_mode = os.getenv('NODE_ENV') != 'production'
    
    print("🚀 Starting BookFetcher Python Backend")
    print(f"📡 Server will be available at: http://localhost:{port}")
    print(f"🔗 WebSocket endpoint: ws://localhost:{port}")
    
    # Check for required environment variables
    if not os.getenv('OPENAI_API_KEY'):
        print("⚠️  Warning: OPENAI_API_KEY not found in environment")
    
    app.run(host='0.0.0.0', port=port, debug=debug_mode) 