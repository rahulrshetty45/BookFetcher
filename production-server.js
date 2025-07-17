#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

const PORT = process.env.PORT || 3000;
const BACKEND_PORT = process.env.BACKEND_PORT || 5000;

console.log('🚀 Starting BookFetcher Production Server');
console.log('=========================================');

// Function to cleanup on exit
const cleanup = () => {
    console.log('🛑 Shutting down servers...');
    process.exit();
};

// Setup signal handling
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Start Python backend
console.log('📡 Starting Python Backend Server...');
const backendProcess = spawn('python3', ['backend.py'], {
    env: {
        ...process.env,
        FLASK_PORT: BACKEND_PORT,
        PYTHONUNBUFFERED: '1'
    },
    stdio: 'inherit',
    cwd: process.cwd()
});

backendProcess.on('error', (err) => {
    console.error('❌ Backend server error:', err);
});

// Wait a moment for backend to start
setTimeout(() => {
    console.log('🌐 Starting Next.js Frontend Server...');
    
    // Start Next.js frontend
    const frontendProcess = spawn('npm', ['run', 'start:web'], {
        env: {
            ...process.env,
            PORT: PORT
        },
        stdio: 'inherit'
    });

    frontendProcess.on('error', (err) => {
        console.error('❌ Frontend server error:', err);
    });

    console.log(`✅ Servers started successfully!`);
    console.log(`📋 Server Information:`);
    console.log(`   🐍 Python Backend:  Port ${BACKEND_PORT}`);
    console.log(`   ⚛️  Next.js Frontend: Port ${PORT}`);
    
}, 3000); 