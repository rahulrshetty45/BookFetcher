'use client'

import React, { useEffect, useRef, useState } from 'react'
import io from 'socket.io-client'
import { getApiUrl, getSocketUrl } from '../lib/config'

interface BrowserAutomationProps {
  isVisible: boolean
  onClose: () => void
  bookTitle: string
  bookAuthor: string
  genre?: string
  previewUrl?: string
  onAutomationComplete?: (result: any) => void
}

interface SelectedPageContent {
  content: string
  page_number: number
  classification: string
  reasoning: string
}

export default function BrowserAutomation({
  isVisible,
  onClose,
  bookTitle,
  bookAuthor,
  genre,
  previewUrl,
  onAutomationComplete
}: BrowserAutomationProps) {
  const [socket, setSocket] = useState<any>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [currentUrl, setCurrentUrl] = useState<string>('')
  const [currentScreenshot, setCurrentScreenshot] = useState<string>('')
  const [extractedContent, setExtractedContent] = useState<string[]>([])
  const [isAutomating, setIsAutomating] = useState(false)
  const [hasStartedAutomation, setHasStartedAutomation] = useState(false)
  const [automationResult, setAutomationResult] = useState<any>(null)
  const [selectedPageContent, setSelectedPageContent] = useState<SelectedPageContent | null>(null)

  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!isVisible) return

    // Initialize socket connection
    const newSocket = io(getSocketUrl(), {
      transports: ['polling', 'websocket'],
      upgrade: true,
      rememberUpgrade: true,
      timeout: 20000,
      forceNew: true
    })

    setSocket(newSocket)

    newSocket.on('connect', () => {
      console.log('✅ Connected to Python backend')
      setIsConnected(true)
    })

    newSocket.on('disconnect', () => {
      console.log('❌ Disconnected from Python backend')
      setIsConnected(false)
    })

    newSocket.on('automation_progress', handleProgressEvent)
    newSocket.on('automation_complete', handleCompletionEvent)
    newSocket.on('automation_error', handleErrorEvent)

    return () => {
      newSocket.disconnect()
    }
  }, [isVisible])

  useEffect(() => {
    if (socket && isConnected && previewUrl && !hasStartedAutomation) {
      console.log('🚀 Starting automation with preview URL:', previewUrl)
      setHasStartedAutomation(true)
      setIsAutomating(true)
      
      socket.emit('start_automation', {
        bookTitle: bookTitle,
        bookAuthor: bookAuthor,
        genre: genre || 'Unknown',
        previewUrl: previewUrl
      })
    }
  }, [socket, isConnected, previewUrl, bookTitle, bookAuthor, genre, hasStartedAutomation])

  const handleProgressEvent = (event: any) => {
    console.log('📈 Progress event:', event)
    
    // Update current URL
    if (event.url) {
      setCurrentUrl(event.url)
    }
    
    // Update screenshot state
    if (event.screenshot) {
      setCurrentScreenshot(event.screenshot)
    }
  }

  const handleCompletionEvent = (event: any) => {
    const result = event.result || event
    setAutomationResult(result)
    
    // Process GPT-4 analysis results
    if (result.gpt4_analysis) {
      const analysis = result.gpt4_analysis
      if (analysis.selected_page_content && analysis.selected_page_number) {
        setSelectedPageContent({
          content: analysis.selected_page_content,
          page_number: analysis.selected_page_number,
          classification: analysis.classification || 'unknown',
          reasoning: analysis.reasoning || ''
        })
        
        // Set the selected page image for display in left panel
        const selectedPageImage = getApiUrl(`screenshot/${analysis.selected_page_filename}`)
        setExtractedContent([`Selected Page ${analysis.selected_page_number} (${analysis.classification})`])
        
        // Add image data to result for parent
        result.selectedPageImage = selectedPageImage
        result.selectedPageInfo = {
          pageNumber: analysis.selected_page_number,
          classification: analysis.classification,
          reasoning: analysis.reasoning,
          filename: analysis.selected_page_filename
        }
      }
    } else if (result.extracted_content) {
      // Fallback for old format
      setExtractedContent([result.extracted_content])
    }
    
    if (onAutomationComplete) {
      onAutomationComplete(result)
    }
    
    setIsAutomating(false)
  }

  const handleErrorEvent = (event: any) => {
    console.error('❌ Automation error:', event)
    setIsAutomating(false)
  }

  if (!isVisible) return null

  return (
    <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
      {/* Browser Automation Window */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* Simple Header */}
        <div className="bg-gray-100 px-4 py-3 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">
              🤖 Content Extraction
            </h3>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className={`text-sm ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>

        {/* Browser View */}
        <div className="h-96 bg-gray-50 flex items-center justify-center">
          {currentScreenshot ? (
            <img
              src={currentScreenshot}
              alt="Live Browser Automation"
              className="w-full h-full object-contain"
              style={{ maxWidth: '100%', maxHeight: '100%' }}
            />
          ) : isAutomating ? (
            <div className="text-center text-gray-500 p-8">
              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                </div>
                <div className="w-16 h-16 mx-auto"></div>
              </div>
              <div className="space-y-2">
                <p className="text-lg font-medium text-gray-700">🔍 Analyzing Content</p>
                <p className="text-sm text-gray-500">AI is extracting the best pages for you</p>
                <div className="flex items-center justify-center space-x-1 mt-4">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          ) : !hasStartedAutomation && isConnected ? (
            <div className="text-center text-gray-500 p-8">
              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center justify-center">
                                     <div className="w-12 h-12 border-4 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
                </div>
                <div className="w-12 h-12 mx-auto"></div>
              </div>
              <div className="space-y-2">
                <p className="text-lg font-medium text-gray-700">🚀 Initializing AI Browser</p>
                <p className="text-sm text-gray-500">Setting up automation environment...</p>
                <div className="flex items-center justify-center space-x-1 mt-4">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '200ms' }}></div>
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '400ms' }}></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500 p-8">
              <div className="text-5xl mb-4">📚</div>
              <p className="text-lg font-medium text-gray-700">Ready to Extract</p>
              <p className="text-sm text-gray-500 mt-2">AI will analyze your book automatically</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
} 