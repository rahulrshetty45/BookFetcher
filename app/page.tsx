'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import BrowserAutomation from '../components/BrowserAutomation'
import GoogleBooksViewer from '../components/GoogleBooksViewer'
import CopyrightPopup from '../components/CopyrightPopup'
import { getApiUrl } from '../lib/config'

interface BookInfo {
  title: string
  author: string
  genre: string
  text: string
  source: string
  confidence: number
  pageType: string
  selectedPageImage?: string
  selectedPageInfo?: {
    pageNumber: number
    classification: string
    reasoning: string
    filename: string
  }
}

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BookInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showBrowser, setShowBrowser] = useState(false)
  const [showGoogleBooks, setShowGoogleBooks] = useState(false)
  const [extractionMethod, setExtractionMethod] = useState<'google-books' | 'browser-automation'>('google-books')
  const [extractionProgress, setExtractionProgress] = useState<Array<{step: string, description: string, status: string}>>([])
  const [googleBooksPreviewUrl, setGoogleBooksPreviewUrl] = useState<string | null>(null)
  const [showCopyrightPopup, setShowCopyrightPopup] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file)
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
      setError(null)
      setResult(null)
      setShowBrowser(false)
      setShowGoogleBooks(false)
      setExtractionProgress([])
    } else {
      setError('Please select a valid image file')
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const files = (e.dataTransfer as DataTransfer).files
    const file = files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = e.target as HTMLInputElement
    const file = target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const generateBookFactsSync = async (title: string, author: string, genre: string): Promise<string> => {
    try {
      const response = await fetch(getApiUrl('generate-book-facts'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, author, genre }),
      })

      if (response.ok) {
        const data = await response.json()
        const facts = data.facts || []
        
        // Format facts as engaging text
        const factsText = facts.map((fact: any, index: number) => 
          `${fact.icon} ${fact.text}`
        ).join('\n\n')
        
        return factsText || 'Analyzing book content...'
      }
    } catch (error) {
      console.log('Failed to generate book facts:', error)
    }
    
    return 'Preparing content analysis...'
  }

  const extractContent = async () => {
    if (!selectedFile) return

    setLoading(true)
    setError(null)
    setShowCopyrightPopup(false)
    setExtractionProgress([])

    try {
      // Use Python backend with GPT-4 Vision to identify book from image
      const reader = new FileReader()
      const imageDataUrl = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(selectedFile)
      })

      const response = await fetch(getApiUrl('identify-book'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: imageDataUrl }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to identify book from cover image')
      }

      const bookData = await response.json() as { title: string; author: string; genre: string; description: string }
      
      // Generate fun facts first, then set result with facts already loaded
      const factsText = await generateBookFactsSync(bookData.title, bookData.author, bookData.genre)
      
      // Set basic book info with facts already loaded
      setResult({
        title: bookData.title,
        author: bookData.author,
        genre: bookData.genre || 'Unknown',
        text: factsText || 'Preparing content analysis...',
        source: 'Book Analysis',
        confidence: 90,
        pageType: 'second-page'
      })

      // Reset any previous state before starting new extraction
      setShowCopyrightPopup(false)
      setGoogleBooksPreviewUrl(null)
      
      // Start chosen extraction method
      console.log('🔍 Extraction method:', extractionMethod)
      if (extractionMethod === 'google-books') {
        console.log('📖 Setting showGoogleBooks to true')
        setShowGoogleBooks(true)
        console.log('🤖 Browser automation will start when preview URL is found')
        setShowBrowser(true)
      } else {
        console.log('🤖 Setting showBrowser to true')
        setShowBrowser(true)
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleBooksProgress = (step: string, description: string, status: 'running' | 'completed' | 'error') => {
    // Check if this is a copyright error
    if (status === 'error' && description.includes('copyrighted')) {
      setShowCopyrightPopup(true)
      setShowGoogleBooks(false) // Hide the Google Books viewer
      return
    }

    setExtractionProgress(prev => {
      const newProgress = [...prev]
      const existingIndex = newProgress.findIndex(p => p.step === step)
      
      if (existingIndex >= 0) {
        newProgress[existingIndex] = { step, description, status }
      } else {
        newProgress.push({ step, description, status })
      }
      
      return newProgress
    })
  }

  const handleGoogleBooksContent = (content: string) => {
    setResult(prev => prev ? {
      ...prev,
      text: content,
              source: 'Preview Content API',
      confidence: 95
    } : null)
  }

  const reset = () => {
    setSelectedFile(null)
    setPreviewUrl(null)
    setResult(null)
    setError(null)
    setLoading(false)
    setShowBrowser(false)
    setShowGoogleBooks(false)
    setShowCopyrightPopup(false)
    setGoogleBooksPreviewUrl(null)
    setExtractionProgress([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Debug logging
  console.log('🔍 Render debug - showBrowser:', showBrowser, 'showGoogleBooks:', showGoogleBooks)
  
  return (
    <div className="flex h-screen">
      {/* Left Side - Main Interface */}
      <div className={`${showBrowser || showGoogleBooks ? 'w-1/2' : 'w-full'} transition-all duration-500 overflow-y-auto`}>
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Book Content Extraction
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Upload a book cover image and extract content using advanced browser automation. The system automatically finds preview links for live content extraction.
            </p>
          </div>



          {/* Upload Section */}
          <div className="card p-8 mb-8">
            <div 
              className="upload-area text-center"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileInput}
                className="hidden"
              />
              
              {previewUrl ? (
                <div className="space-y-4">
                  <div className="relative mx-auto w-48 h-64">
                    <Image
                      src={previewUrl}
                      alt="Book cover preview"
                      fill
                      className="object-cover rounded-lg border border-gray-200"
                    />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-2">{selectedFile?.name}</p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        reset()
                      }}
                      className="btn-secondary text-sm"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-12">
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400 mb-4"
                    stroke="currentColor"
                    fill="none"
                    viewBox="0 0 48 48"
                  >
                    <path
                      d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <p className="text-lg text-gray-600 mb-2">
                    Drag and drop your book cover image here
                  </p>
                  <p className="text-sm text-gray-500 mb-4">
                    or click to browse files
                  </p>
                  <button className="btn-secondary">
                    Choose File
                  </button>
                </div>
              )}
            </div>

            {selectedFile && !loading && !result && (
              <div className="mt-6 text-center">
                <button
                  onClick={extractContent}
                  className="btn-primary px-8 py-3 text-base"
                >
                  📖 Start Extraction
                </button>
              </div>
            )}

            {loading && (
              <div className="mt-6 text-center">
                <div className="inline-flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-gray-600">Processing book cover...</span>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-6 p-4 border border-red-200 rounded-lg bg-red-50">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}
          </div>

          {/* Results Section */}
          {result && (
            <div className="card p-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-6">
                📖 Extracted Book Content
              </h2>
              
              <div className="grid grid-cols-1 gap-6 mb-8">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Book Information</h3>
                  <div className="space-y-3">
                    <div>
                      <span className="text-sm font-medium text-gray-500">Title:</span>
                      <p className="text-gray-900">{result.title}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Author:</span>
                      <p className="text-gray-900">{result.author}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Genre:</span>
                      <p className="text-gray-900">{result.genre}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Source:</span>
                      <p className="text-gray-900">{result.source}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Confidence:</span>
                      <p className="text-gray-900">{result.confidence}%</p>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    {result.selectedPageImage ? 'Selected Content' : 'Extracted Content'}
                  </h3>
                  <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                    {result.selectedPageImage ? (
                      <div className="space-y-4">
                        <div className="text-center">
                          <img 
                            src={result.selectedPageImage} 
                            alt={`Selected Page ${result.selectedPageInfo?.pageNumber}`}
                            className="max-w-full h-auto border border-gray-300 rounded-lg shadow-md"
                          />
                        </div>
                        <div className="text-sm text-gray-600 space-y-2">
                          <p><strong>Page:</strong> {result.selectedPageInfo?.pageNumber}</p>
                          <p><strong>Classification:</strong> {result.selectedPageInfo?.classification}</p>
                          <p><strong>Reasoning:</strong> {result.selectedPageInfo?.reasoning}</p>
                        </div>
                      </div>
                    ) : (
                      <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono leading-relaxed">
                        {result.text}
                      </pre>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-center">
                <button
                  onClick={reset}
                  className="btn-secondary"
                >
                  Extract Another Book
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Side Panels */}
      {(showBrowser || showGoogleBooks) && (
        <div className="w-1/2 border-l border-gray-200 bg-gray-50 overflow-y-auto">
          <div className="p-6">
            {/* Browser Automation Panel */}
            {showBrowser && (
              <BrowserAutomation
                key={`browser-${result?.title}-${result?.author}`} // Force remount on new book
                isVisible={showBrowser}
                onClose={() => setShowBrowser(false)}
                bookTitle={result?.title || ''}
                bookAuthor={result?.author || ''}
                genre={result?.genre}
                previewUrl={googleBooksPreviewUrl || undefined}
                onAutomationComplete={(automationResult) => {
                  console.log('🤖 Browser automation completed:', automationResult)
                  
                  // Check for GPT-4 analysis results first
                  if (automationResult.success && automationResult.gpt4_analysis?.selected_page_content) {
                    const analysis = automationResult.gpt4_analysis
                    
                    // Update the result with GPT-4 selected content
                    setResult(prev => prev ? {
                      ...prev,
                      text: analysis.selected_page_content,
                                              genre: `${analysis.classification}`,
                      source: `Page ${analysis.selected_page_number} - ${analysis.reasoning}`,
                      confidence: 95
                    } : null)
                  } else if (automationResult.success && automationResult.extracted_content) {
                    // Fallback for old format
                    setResult(prev => prev ? {
                      ...prev,
                      text: automationResult.extracted_content,
                      genre: 'Extracted via AI Browser Automation',
                      source: googleBooksPreviewUrl ? 'Browser Automation + Preview URL' : 'Browser Automation + Archive.org',
                      confidence: 90
                    } : null)
                  }
                }}
              />
            )}

            {/* Google Books Viewer Panel */}
            {showGoogleBooks && (
              <GoogleBooksViewer
                key={`${result?.title}-${result?.author}`} // Force remount on new book
                isVisible={showGoogleBooks}
                onClose={() => setShowGoogleBooks(false)}
                bookTitle={result?.title || ''}
                bookAuthor={result?.author || ''}
                genre={result?.genre || ''}
                onProgress={(step: string, description: string, status: 'running' | 'completed' | 'error') => handleGoogleBooksProgress(step, description, status)}
                onContentExtracted={(content: string) => handleGoogleBooksContent(content)}
                onPreviewUrlFound={(previewUrl: string) => {
                  console.log('📖 Google Books preview URL found:', previewUrl)
                  setGoogleBooksPreviewUrl(previewUrl)
                  // Automatically start browser automation with the preview URL
                  if (extractionMethod === 'google-books') {
                    console.log('🤖 Starting browser automation with Google Books preview URL')
                    setShowBrowser(true)
                  }
                }}
              />
            )}
          </div>
        </div>
      )}
      
      {/* Copyright Popup */}
      <CopyrightPopup
        isVisible={showCopyrightPopup}
        onClose={() => setShowCopyrightPopup(false)}
        bookTitle={result?.title || ''}
        bookAuthor={result?.author || ''}
      />
    </div>
  )
} 