// Configuration for API endpoints
const isDevelopment = process.env.NODE_ENV === 'development'
const isClient = typeof window !== 'undefined'

// In production on Railway, both frontend and backend run on the same domain
// In development, backend runs on localhost:5000
export const API_BASE_URL = isDevelopment 
  ? 'http://localhost:5000'
  : (isClient ? window.location.origin : '')

export const SOCKET_URL = isDevelopment
  ? 'http://localhost:5000'
  : (isClient ? window.location.origin : '')

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