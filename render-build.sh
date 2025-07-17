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
pip install -r requirements_backend.txt

# Install Playwright with chromium browser
echo "🌐 Installing Playwright browser..."
playwright install chromium

# Install additional system dependencies that Playwright might need
echo "📚 Installing system dependencies..."
playwright install-deps chromium

echo "✅ Build completed successfully!" 