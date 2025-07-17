#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

const PORT = process.env.PORT || 10000;
const BACKEND_PORT = 5001;

console.log('🚀 Starting BookFetcher Production Server');
console.log('=========================================');

const childProcesses = [];

// Function to cleanup on exit
const cleanup = () => {
    console.log('🛑 Shutting down servers...');
    childProcesses.forEach(proc => {
        if (proc && !proc.killed) {
            proc.kill('SIGTERM');
        }
    });
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
        PYTHONUNBUFFERED: '1',
        // Playwright browser configuration
        PLAYWRIGHT_BROWSERS_PATH: '/opt/render/project/.playwright',
        PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '0'
    },
    stdio: 'inherit',
    cwd: process.cwd()
});

backendProcess.on('error', (err) => {
    console.error('❌ Backend server error:', err);
    process.exit(1);
});

backendProcess.on('exit', (code) => {
    if (code !== 0) {
        console.error(`❌ Backend server exited with code ${code}`);
        process.exit(1);
    }
});

childProcesses.push(backendProcess);

// Wait for Python backend to fully start
console.log('⏳ Waiting for Python backend to initialize...');
setTimeout(() => {
    // Start Next.js frontend
    console.log('🌐 Starting Next.js Frontend Server...');
    const frontendProcess = spawn('npx', ['next', 'start', '--port', PORT.toString()], {
        env: {
            ...process.env,
            BACKEND_PORT: BACKEND_PORT.toString(),
            PORT: PORT.toString()
        },
        stdio: 'inherit',
        cwd: process.cwd()
    });

    frontendProcess.on('error', (err) => {
        console.error('❌ Frontend server error:', err);
        process.exit(1);
    });

    frontendProcess.on('exit', (code) => {
        if (code !== 0) {
            console.error(`❌ Frontend server exited with code ${code}`);
            process.exit(1);
        }
    });

    childProcesses.push(frontendProcess);
    
    console.log(`✅ Servers started successfully!`);
    console.log(`📋 Server Information:`);
    console.log(`   🐍 Python Backend:  Port ${BACKEND_PORT}`);
    console.log(`   ⚛️  Next.js Frontend: Port ${PORT}`);
    
}, 3000); // Wait 3 seconds for Python backend to be ready 