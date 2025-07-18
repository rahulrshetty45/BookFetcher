import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

export async function POST(request: NextRequest) {
  try {
    const { bookTitle, bookAuthor, previewUrl } = await request.json()

    if (!bookTitle || !bookAuthor) {
      return NextResponse.json(
        { error: 'Book title and author are required' },
        { status: 400 }
      )
    }

    if (!previewUrl) {
      return NextResponse.json(
        { error: 'Preview URL is required for page extraction' },
        { status: 400 }
      )
    }

    // Create a readable stream for Server-Sent Events
    const encoder = new TextEncoder()
    
    const stream = new ReadableStream({
      start(controller) {
        // Path to the new Playwright script
        const scriptPath = path.join(process.cwd(), 'playwright_book_extractor.py')
        
        // Use the Python interpreter from the virtual environment directly
        const pythonPath = path.join(process.cwd(), 'browser_env', 'bin', 'python')
        const pythonProcess = spawn(pythonPath, [scriptPath, previewUrl, bookTitle, bookAuthor], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env },
          cwd: process.cwd()
        })

        // Handle stdout data (progress updates and results)
        pythonProcess.stdout.on('data', (data) => {
          const output = data.toString().trim()
          const lines = output.split('\n')
          
          for (const line of lines) {
            if (line.startsWith('PROGRESS:')) {
              const progressData = line.replace('PROGRESS:', '')
              try {
                const progress = JSON.parse(progressData)
                const sseData = `data: ${JSON.stringify({
                  type: 'progress',
                  ...progress
                })}\n\n`
                controller.enqueue(encoder.encode(sseData))
              } catch (e) {
                console.error('Failed to parse progress data:', e)
              }
            } else if (line.startsWith('RESULT:')) {
              const resultData = line.replace('RESULT:', '')
              try {
                const result = JSON.parse(resultData)
                const sseData = `data: ${JSON.stringify({
                  type: 'result',
                  ...result
                })}\n\n`
                controller.enqueue(encoder.encode(sseData))
              } catch (e) {
                console.error('Failed to parse result data:', e)
              }
            } else if (line.startsWith('ERROR:')) {
              const errorData = line.replace('ERROR:', '')
              const sseData = `data: ${JSON.stringify({
                type: 'error',
                error: errorData
              })}\n\n`
              controller.enqueue(encoder.encode(sseData))
            }
          }
        })

        // Handle stderr data (errors)
        pythonProcess.stderr.on('data', (data) => {
          const error = data.toString().trim()
          console.error('Python script error:', error)
          const sseData = `data: ${JSON.stringify({
            type: 'error',
            error: error
          })}\n\n`
          controller.enqueue(encoder.encode(sseData))
        })

        // Handle process completion
        pythonProcess.on('close', (code) => {
          console.log(`Python script exited with code ${code}`)
          const sseData = `data: ${JSON.stringify({
            type: 'complete',
            exitCode: code
          })}\n\n`
          controller.enqueue(encoder.encode(sseData))
          controller.close()
        })

        // Handle process errors
        pythonProcess.on('error', (err) => {
          console.error('Failed to start Python script:', err)
          const sseData = `data: ${JSON.stringify({
            type: 'error',
            error: `Failed to start automation: ${err.message}`
          })}\n\n`
          controller.enqueue(encoder.encode(sseData))
          controller.close()
        })
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })

  } catch (error) {
    console.error('Browser automation API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
} 