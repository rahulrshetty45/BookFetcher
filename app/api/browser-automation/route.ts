import { NextRequest, NextResponse } from 'next/server'

// Use global storage to share state between API routes
declare global {
  var automationStatusStore: Map<string, any>
}

if (!global.automationStatusStore) {
  global.automationStatusStore = new Map()
}

export async function POST(request: NextRequest) {
  try {
    const { bookTitle, bookAuthor, genre, previewUrl } = await request.json()
    
    // Generate unique automation ID
    const automationId = `automation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // Initialize status
    global.automationStatusStore.set(automationId, {
      status: 'running',
      progress: null,
      result: null,
      error: null,
      url: '',
      screenshot: ''
    })

    // Start automation in background
    startBackgroundAutomation(automationId, { bookTitle, bookAuthor, genre, previewUrl })

    return NextResponse.json({ 
      automation_id: automationId,
      status: 'started'
    })
  } catch (error) {
    console.error('Browser automation error:', error)
    return NextResponse.json(
      { error: 'Failed to start automation' },
      { status: 500 }
    )
  }
}

async function startBackgroundAutomation(
  automationId: string, 
  params: { bookTitle: string, bookAuthor: string, genre: string, previewUrl: string }
) {
  try {
    // Call the Python backend automation endpoint
    const backendUrl = `http://localhost:${process.env.BACKEND_PORT || 5001}/start-automation`
    
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        automation_id: automationId,
        ...params
      })
    })

    if (!response.ok) {
      throw new Error(`Backend responded with status ${response.status}`)
    }

    const result = await response.json()
    
    // Update status with final result
    global.automationStatusStore.set(automationId, {
      status: 'completed',
      progress: null,
      result: result,
      error: null,
      url: result.final_url || '',
      screenshot: result.final_screenshot || ''
    })

  } catch (error) {
    console.error('Background automation error:', error)
    global.automationStatusStore.set(automationId, {
      status: 'error',
      progress: null,
      result: null,
      error: error instanceof Error ? error.message : String(error),
      url: '',
      screenshot: ''
    })
  }
}

// Endpoint to get automation status
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const automationId = url.searchParams.get('id')
  
  if (!automationId) {
    return NextResponse.json({ error: 'Missing automation ID' }, { status: 400 })
  }

  const status = global.automationStatusStore.get(automationId)
  if (!status) {
    return NextResponse.json({ error: 'Automation not found' }, { status: 404 })
  }

  return NextResponse.json(status)
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