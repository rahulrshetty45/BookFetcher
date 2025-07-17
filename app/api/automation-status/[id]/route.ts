import { NextRequest, NextResponse } from 'next/server'

// This should match the storage used in browser-automation route
// In production, use Redis or database instead of in-memory storage
declare global {
  var automationStatusStore: Map<string, any>
}

if (!global.automationStatusStore) {
  global.automationStatusStore = new Map()
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const automationId = params.id
    
    if (!automationId) {
      return NextResponse.json({ error: 'Missing automation ID' }, { status: 400 })
    }

    // First check our local status store
    const localStatus = global.automationStatusStore.get(automationId)
    
    if (localStatus) {
      return NextResponse.json(localStatus)
    }

    // If not found locally, check the Python backend
    const backendUrl = `http://localhost:${process.env.BACKEND_PORT || 5001}/automation-status/${automationId}`
    
    try {
      const response = await fetch(backendUrl)
      
      if (response.ok) {
        const backendStatus = await response.json()
        
        // Cache the status locally
        global.automationStatusStore.set(automationId, backendStatus)
        
        return NextResponse.json(backendStatus)
      }
    } catch (backendError) {
      console.error('Backend status check failed:', backendError)
    }

    // Return default status if not found anywhere
    return NextResponse.json({
      status: 'running',
      progress: null,
      result: null,
      error: null,
      url: '',
      screenshot: ''
    })

  } catch (error) {
    console.error('Automation status error:', error)
    return NextResponse.json(
      { error: 'Failed to get automation status' },
      { status: 500 }
    )
  }
} 