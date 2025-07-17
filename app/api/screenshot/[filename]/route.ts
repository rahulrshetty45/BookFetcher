import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  try {
    const { filename } = params
    
    // Forward to Python backend
    const backendUrl = `http://localhost:${process.env.BACKEND_PORT || 5001}/screenshot/${filename}`
    
    const response = await fetch(backendUrl, {
      method: 'GET',
    })
    
    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`)
    }
    
    // Get the image data and forward it
    const imageBuffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'image/png'
    
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    })
    
  } catch (error) {
    console.error('Screenshot proxy error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Screenshot not found' },
      { status: 404 }
    )
  }
} 