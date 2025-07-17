import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    // Get the request data
    const requestData = await request.json()
    
    // Forward to Python backend - using the identify-book endpoint
    const backendUrl = `http://localhost:${process.env.BACKEND_PORT || 5001}/identify-book`
    
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData)
    })
    
    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`)
    }
    
    const data = await response.json()
    return NextResponse.json(data)
    
  } catch (error) {
    console.error('Search for book proxy error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to search for book' },
      { status: 500 }
    )
  }
} 