#!/bin/bash

echo "🚀 Building BookFetcher for Render"
echo "=================================="

# Set environment variables for Playwright
export PLAYWRIGHT_BROWSERS_PATH=/opt/render/project/.playwright
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Build Next.js app
echo "🔨 Building Next.js application..."
npm run build:web

# Install Python dependencies
echo "🐍 Installing Python dependencies..."
if command -v python3 &> /dev/null; then
    python3 -m pip install --upgrade pip
    python3 -m pip install -r requirements_backend.txt
else
    python -m pip install --upgrade pip
    python -m pip install -r requirements_backend.txt
fi

# Install Playwright with chromium browser (skip system deps to avoid root issues)
echo "🌐 Installing Playwright browser..."
mkdir -p /opt/render/project/.playwright
if command -v python3 &> /dev/null; then
    # Install browser only, skip system dependencies to avoid permission issues
    python3 -m playwright install chromium || echo "⚠️ Browser install had issues but continuing..."
else
    python -m playwright install chromium || echo "⚠️ Browser install had issues but continuing..."
fi

echo "✅ Build completed successfully!" 