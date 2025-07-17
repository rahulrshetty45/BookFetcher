#!/bin/bash

echo "🚀 Building BookFetcher for Render"
echo "=================================="

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

# Install Playwright with chromium browser
echo "🌐 Installing Playwright browser..."
if command -v python3 &> /dev/null; then
    python3 -m playwright install chromium
    python3 -m playwright install-deps chromium
else
    python -m playwright install chromium
    python -m playwright install-deps chromium
fi

echo "✅ Build completed successfully!" 