import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  // For Socket.io polling requests, proxy to backend
  const backendUrl = `http://localhost:${process.env.BACKEND_PORT || 5001}/socket.io/`
  const url = new URL(request.url)
  const searchParams = url.searchParams.toString()
  
  try {
    const response = await fetch(`${backendUrl}?${searchParams}`, {
      method: 'GET',
      headers: {
        ...Object.fromEntries(request.headers.entries()),
        'host': 'localhost:5001'
      },
    })
    
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    })
  } catch (error) {
    console.error('Socket.io proxy error:', error)
    return new Response('Socket.io proxy error', { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // For Socket.io polling POST requests
  const backendUrl = `http://localhost:${process.env.BACKEND_PORT || 5001}/socket.io/`
  const url = new URL(request.url)
  const searchParams = url.searchParams.toString()
  
  try {
    const body = await request.text()
    
    const response = await fetch(`${backendUrl}?${searchParams}`, {
      method: 'POST',
      headers: {
        ...Object.fromEntries(request.headers.entries()),
        'host': 'localhost:5001'
      },
      body: body
    })
    
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    })
  } catch (error) {
    console.error('Socket.io proxy error:', error)
    return new Response('Socket.io proxy error', { status: 500 })
  }
} 