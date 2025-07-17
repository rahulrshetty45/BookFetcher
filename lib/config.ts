// Configuration for API endpoints
const isDevelopment = process.env.NODE_ENV === 'development'
const isClient = typeof window !== 'undefined'

// In production on Render, backend runs on port 5001, frontend on main port
// In development, backend runs on localhost:5000
export const API_BASE_URL = isDevelopment 
  ? 'http://localhost:5000'
  : (isClient ? `${window.location.protocol}//${window.location.hostname}:5001` : 'http://localhost:5001')

export const SOCKET_URL = isDevelopment
  ? 'http://localhost:5000'
  : (isClient ? `${window.location.protocol}//${window.location.hostname}:5001` : 'http://localhost:5001')

// Helper function to get full API URL
export const getApiUrl = (endpoint: string) => {
  // Remove leading slash if present
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint
  return `${API_BASE_URL}/${cleanEndpoint}`
}

// Helper function to get socket URL
export const getSocketUrl = () => {
  return SOCKET_URL
} 