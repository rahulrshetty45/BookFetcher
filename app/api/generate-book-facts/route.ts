import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    // Get the request data
    const requestData = await request.json()
    
    // Forward to Python backend
    const backendUrl = `http://localhost:${process.env.BACKEND_PORT || 5001}/generate-book-facts`
    
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
    console.error('Generate book facts proxy error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate book facts' },
      { status: 500 }
    )
  }
} 