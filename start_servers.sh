#!/bin/bash

echo "🚀 Starting BookFetcher Servers"
echo "=================================="

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  Warning: .env file not found. Please create one with OPENAI_API_KEY"
    echo "You can copy from .env.example if available"
fi

# Function to cleanup on exit
cleanup() {
    echo "🛑 Shutting down servers..."
    kill $(jobs -p) 2>/dev/null
    exit
}

# Setup signal handling
trap cleanup SIGINT SIGTERM

echo "📡 Starting Python Backend Server (Flask + SocketIO)..."
echo "   - Book identification with GPT-4 Vision"
echo "   - Browser automation with browser-use"
echo "   - WebSocket communication for real-time updates"
echo ""

# Start Python backend in background
source browser_env/bin/activate && python backend.py &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 3

echo "🌐 Starting Next.js Frontend Server..."
echo "   - Web interface for book cover upload"
echo "   - Real-time browser automation viewer"
echo "   - WebSocket client for Python backend"
echo ""

# Start Next.js frontend in background  
npm run web &
FRONTEND_PID=$!

echo "✅ Both servers are starting..."
echo ""
echo "📋 Server Information:"
echo "   🐍 Python Backend:  http://localhost:5000"
echo "   ⚛️  Next.js Frontend: http://localhost:3000"
echo ""
echo "🔧 Architecture:"
echo "   Frontend (TypeScript/React) ↔ WebSocket ↔ Backend (Python/Flask)"
echo ""
echo "📖 How to use:"
echo "   1. Open http://localhost:3000 in your browser"
echo "   2. Upload a book cover image"
echo "   3. Watch AI identify the book and automatically:"
echo "      - Navigate to Archive.org"
echo "      - Search for the book"
echo "      - Find highest-rated version"
echo "      - Open book reader"
echo "      - Extract content from 4 pages"
echo ""
echo "💡 Press Ctrl+C to stop both servers"
echo ""

# Wait for both background processes
wait 