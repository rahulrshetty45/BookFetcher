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
      progress: 'Initializing automation...',
      result: null,
      error: null,
      url: previewUrl || '',
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
    // Update status to show we're connecting
    global.automationStatusStore.set(automationId, {
      ...global.automationStatusStore.get(automationId),
      progress: 'Connecting to automation backend...'
    })

    // Call the Python backend automation endpoint with retry logic
    const backendUrl = `http://localhost:${process.env.BACKEND_PORT || 5001}/start-automation`
    
    let lastError: Error | null = null
    let response: Response | null = null
    
    // Retry connection up to 5 times with increasing delay
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        console.log(`🔄 Attempting to connect to backend (attempt ${attempt}/5)...`)
        
        response = await fetch(backendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            automation_id: automationId,
            ...params
          }),
          // Add timeout
          signal: AbortSignal.timeout(10000) // 10 second timeout
        })

        if (response.ok) {
          console.log('✅ Successfully connected to backend')
          break
        } else {
          throw new Error(`Backend responded with status ${response.status}`)
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        console.log(`❌ Backend connection attempt ${attempt} failed:`, lastError.message)
        
        if (attempt < 5) {
          // Wait before retrying (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000)
          console.log(`⏳ Waiting ${delay}ms before retry...`)
          await new Promise(resolve => setTimeout(resolve, delay))
          
          // Update status to show retry
          global.automationStatusStore.set(automationId, {
            ...global.automationStatusStore.get(automationId),
            progress: `Retrying connection to backend (attempt ${attempt + 1}/5)...`
          })
        }
      }
    }

    if (!response || !response.ok) {
      throw lastError || new Error('Failed to connect to backend after all retries')
    }

    const result = await response.json()
    
    // Update status with success
    global.automationStatusStore.set(automationId, {
      status: 'running',
      progress: 'Automation started successfully',
      result: null,
      error: null,
      url: params.previewUrl || '',
      screenshot: ''
    })

    console.log(`✅ Automation ${automationId} started successfully`)

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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
} 