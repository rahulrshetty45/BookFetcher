import React, { useEffect, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { getApiUrl } from '../lib/config'

interface GoogleBooksViewerProps {
  isVisible: boolean
  onClose: () => void
  bookTitle?: string
  bookAuthor?: string
  genre?: string
  onContentExtracted: (content: string) => void
  onProgress: (step: string, description: string, status: 'running' | 'completed' | 'error') => void
  onPreviewUrlFound?: (previewUrl: string) => void
}

declare global {
  interface Window {
    google: {
      books: {
        load: () => void
        setOnLoadCallback: (callback: () => void) => void
        DefaultViewer: new (element: HTMLElement) => {
          load: (identifier: string, notFoundCallback?: () => void, successCallback?: () => void) => void
          nextPage: () => void
          previousPage: () => void
          goToPage: (pageNumber: number) => boolean
          getPageNumber: () => string
          zoomIn: () => void
          zoomOut: () => void
          resize: () => void
          isLoaded: () => boolean
        }
      }
    }
  }
}

export default function GoogleBooksViewer({ 
  isVisible,
  onClose,
  bookTitle, 
  bookAuthor, 
  genre, 
  onContentExtracted, 
  onProgress,
  onPreviewUrlFound 
}: GoogleBooksViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null)
  const [viewer, setViewer] = useState<any>(null)
  const [apiLoaded, setApiLoaded] = useState(false)
  const [currentBook, setCurrentBook] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<string[]>([])
  const [extractedContent, setExtractedContent] = useState<string>('')
  const [status, setStatus] = useState<'running' | 'completed' | 'error' | 'restricted'>('running')

  const addDebugInfo = (info: string) => {
    console.log('GoogleBooksViewer:', info)
    setDebugInfo(prev => [...prev, `${new Date().toLocaleTimeString()}: ${info}`])
  }

  useEffect(() => {
    const handleApiLoad = () => {
      console.log(`${new Date().toLocaleTimeString()}: API load callback triggered`)
      setApiLoaded(true)
    }

    if (window.google && window.google.books) {
      console.log(`${new Date().toLocaleTimeString()}: Google Books API already available`)
      // If API is already available, call the callback directly
      handleApiLoad()
    } else {
      console.log(`${new Date().toLocaleTimeString()}: Loading Google Books API script`)
      
      // Try multiple script URLs in case the primary one fails
      const scriptUrls = [
        'https://www.google.com/books/jsapi.js',
        'https://books.google.com/books/jsapi.js',
        'https://www.gstatic.com/books/jsapi.js'
      ]
      
      let scriptIndex = 0
      
      const loadScript = () => {
        if (scriptIndex >= scriptUrls.length) {
          addDebugInfo('❌ All Google Books API script URLs failed to load')
          // Fallback: try to initialize without the script
          setTimeout(() => {
            addDebugInfo('🔄 Attempting fallback initialization')
            if (window.google && window.google.books) {
              handleApiLoad()
            } else {
              addDebugInfo('❌ Google Books API not available - using fallback content')
              // Set a flag to show fallback content
              setApiLoaded(false)
            }
          }, 1000)
          return
        }
        
        const script = document.createElement('script')
        script.src = scriptUrls[scriptIndex]
        
        script.onload = () => {
          console.log(`${new Date().toLocaleTimeString()}: Google Books API script loaded from ${scriptUrls[scriptIndex]}`)
          addDebugInfo(`✅ Google Books API script loaded from ${scriptUrls[scriptIndex]}`)
          
          // Check if the API is available
          if (window.google && window.google.books) {
            // Try both approaches for maximum compatibility
            try {
              window.google.books.setOnLoadCallback(handleApiLoad)
            } catch (e) {
              console.log('setOnLoadCallback failed, trying direct call')
            }
            // Also call directly as a fallback
            setTimeout(handleApiLoad, 100)
          } else {
            addDebugInfo('❌ Google Books API not available after script load')
            // Try next script URL
            scriptIndex++
            loadScript()
          }
        }
        
        script.onerror = (error) => {
          console.error(`${new Date().toLocaleTimeString()}: Failed to load Google Books API script from ${scriptUrls[scriptIndex]}`)
          addDebugInfo(`❌ Failed to load from ${scriptUrls[scriptIndex]}`)
          // Try next script URL
          scriptIndex++
          loadScript()
        }
        
        // Add timeout for script loading
        setTimeout(() => {
          if (!window.google || !window.google.books) {
            console.log(`${new Date().toLocaleTimeString()}: Script loading timeout from ${scriptUrls[scriptIndex]}`)
            addDebugInfo(`⏱️ Loading timeout from ${scriptUrls[scriptIndex]}`)
            scriptIndex++
            loadScript()
          }
        }, 10000) // 10 second timeout
        
        document.head.appendChild(script)
      }
      
      loadScript()
    }
  }, [])

  // Initialize viewer when conditions are met
  useEffect(() => {
    if (isVisible && bookTitle && bookAuthor) {
      if (apiLoaded) {
        addDebugInfo('All conditions met - initializing viewer')
        initializeViewer()
      } else {
        // If API failed to load, show fallback content after a delay
        setTimeout(() => {
          if (!apiLoaded) {
            addDebugInfo('API failed to load - showing fallback content')
            showFallbackContent()
          }
        }, 5000) // Wait 5 seconds for API to load
      }
    }
  }, [isVisible, apiLoaded, bookTitle, bookAuthor])

  const showFallbackContent = () => {
    const fallbackContent = `📖 "${bookTitle}" by ${bookAuthor}

      🔍 **Preview API Loading Issue**

Unfortunately, the preview API failed to load properly. This might be due to:
• Network connectivity issues
• API service temporarily unavailable
• Browser security restrictions
• Ad blockers or extensions blocking the script

📚 **Alternative Options:**

1. **Try Browser Automation Method**: Use the other extraction method available in this app
      2. **Manual Search**: Search for "${bookTitle}" directly on book preview sites
3. **Library Search**: Check your local library's digital collection
4. **Archive.org**: Try searching [Archive.org](https://archive.org) for public domain books

**Troubleshooting Steps:**
• Refresh the page and try again
• Disable ad blockers temporarily
• Try a different browser
• Check your internet connection

We apologize for the inconvenience. Please try the Browser Automation method as an alternative.`

    onProgress('error', '❌ Preview API failed to load', 'error')
    // Don't call onContentExtracted for API failures - keep the book facts instead
  }

  const initializeViewer = async () => {
    if (!viewerRef.current || !bookTitle || !bookAuthor || !isVisible || !apiLoaded) {
      addDebugInfo(`Cannot initialize viewer - missing requirements: 
        viewerRef: ${!!viewerRef.current}, 
        bookTitle: ${!!bookTitle}, 
        bookAuthor: ${!!bookAuthor}, 
        isVisible: ${isVisible}, 
        apiLoaded: ${apiLoaded}`)
      return
    }

    addDebugInfo('Initializing viewer')
          onProgress('step1', '✅ Preview API loaded', 'completed')
    onProgress('step2', '🔍 Searching for book...', 'running')

    try {
      // First, make sure google.books.load() is called with proper callback
      addDebugInfo('Calling google.books.load() with callback')
      
      if (window.google && window.google.books && window.google.books.load) {
        // Use the proper callback pattern for Google Books API
        window.google.books.load()
        
        // Set up a callback to wait for API to be ready
        const checkApiReady = () => {
          addDebugInfo(`DefaultViewer available: ${!!(window.google?.books?.DefaultViewer)}`)
          
          if (window.google?.books?.DefaultViewer) {
            addDebugInfo('Google Books API is ready, creating viewer')
            
            // Check if viewerRef is available
            if (!viewerRef.current) {
              addDebugInfo('ERROR: Viewer container not available')
              onProgress('error', '❌ Viewer container not found', 'error')
              return
            }
            
            // Create the viewer
            addDebugInfo('Creating DefaultViewer instance')
            const viewerInstance = new window.google.books.DefaultViewer(viewerRef.current)
            setViewer(viewerInstance)
            
            // Continue with the rest of the initialization
            continueInitialization(viewerInstance)
          } else {
            addDebugInfo('API not ready yet, waiting...')
            setTimeout(checkApiReady, 200)
          }
        }
        
        // Start checking after a short delay
        setTimeout(checkApiReady, 100)
        return
      } else {
        addDebugInfo('ERROR: google.books.load() not available')
        onProgress('error', '❌ Preview API not available', 'error')
        return
      }
    } catch (error) {
      addDebugInfo(`ERROR in initializeViewer: ${error}`)
      onProgress('error', '❌ Failed to initialize viewer', 'error')
    }
  }

  const continueInitialization = async (viewerInstance: any) => {
    try {

      // Search for book identifier first
      const title = bookTitle || 'Unknown Title'
      const author = bookAuthor || 'Unknown Author'
      addDebugInfo(`Searching for book: "${title}" by ${author}`)
      const volumeId = await searchForBook(title, author)
      
              if (!volumeId) {
          addDebugInfo(`No volume ID found for book`)
          onProgress('error', `❌ Book "${title}" by ${author} not found in preview database`, 'error')
          return
        }

      if (volumeId === 'NO_PREVIEW') {
        addDebugInfo(`Book found but no preview access available - copyrighted content`)
        onProgress('error', `🔒 "${title}" by ${author} is copyrighted and cannot be extracted. No preview available.`, 'error')
        return
      }

      addDebugInfo(`Found volume ID: ${volumeId}`)
            onProgress('step2', '✅ Book found in preview database', 'completed')
      onProgress('step3', '📄 Starting content extraction...', 'running')

      // Try PDF extraction first, as it's more reliable
      setCurrentBook(volumeId)
      
      // Start content extraction immediately
      extractContentFromPage(viewerInstance, title, author, genre)
      
      // Also try to load the embedded viewer for backup (but don't wait for it)
      addDebugInfo('Loading book into embedded viewer as backup')
      viewerInstance.load(
        volumeId,
        // Not found callback
        () => {
          addDebugInfo('Embedded viewer load failed - this is expected for many books')
        },
        // Success callback
        () => {
          addDebugInfo('Embedded viewer loaded successfully (backup method)')
        }
      )

    } catch (error) {
      addDebugInfo(`ERROR in initializeViewer: ${error}`)
      console.error('Viewer initialization error:', error)
      onProgress('error', `❌ Failed to initialize viewer: ${error}`, 'error')
    }
  }

  const searchForBook = async (title: string, author: string): Promise<string | null> => {
    try {
      const query = `intitle:"${title}" inauthor:"${author}"`
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY || ''
      
      addDebugInfo(`API Key present: ${!!apiKey}`)
      addDebugInfo(`Search query: ${query}`)
      
      const searchUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&key=${apiKey}&maxResults=5`
      addDebugInfo(`Full search URL: ${searchUrl}`)
      
      const response = await fetch(searchUrl)
      
      addDebugInfo(`API Response status: ${response.status}`)
      
      if (!response.ok) {
        const errorText = await response.text()
        addDebugInfo(`API Error: ${errorText}`)
        throw new Error('Failed to search preview database')
      }

      const data = await response.json()
      addDebugInfo(`API returned ${data.items?.length || 0} books`)
      
      if (data.items && data.items.length > 0) {
        // Find the best match with preview access - check multiple criteria
        for (const item of data.items) {
          const accessInfo = item.accessInfo
          const volumeInfo = item.volumeInfo
          
          addDebugInfo(`Checking book ${item.id}: ${volumeInfo?.title || 'Unknown'}`)
          addDebugInfo(`  - Access view status: ${accessInfo?.accessViewStatus || 'none'}`)
          addDebugInfo(`  - Embeddable: ${accessInfo?.embeddable || 'none'}`)
          addDebugInfo(`  - Public domain: ${accessInfo?.publicDomain || 'none'}`)
          addDebugInfo(`  - PDF available: ${accessInfo?.pdf?.isAvailable || 'none'}`)
          addDebugInfo(`  - EPUB available: ${accessInfo?.epub?.isAvailable || 'none'}`)
          
          // Check for embeddable books first
          if (accessInfo?.embeddable === true) {
            addDebugInfo(`✅ Found embeddable book: ${item.id}`)
            return item.id
          }
          
          // Check for books with preview access
          if (accessInfo?.accessViewStatus === 'SAMPLE' || 
              accessInfo?.accessViewStatus === 'FULL_PUBLIC_DOMAIN' ||
              accessInfo?.publicDomain === true) {
            addDebugInfo(`✅ Found book with preview access: ${item.id}`)
            return item.id
          }
        }
        
        // If no clearly embeddable book found, try to find one with any preview
        for (const item of data.items) {
          const accessInfo = item.accessInfo
          if (accessInfo?.accessViewStatus !== 'NONE' && 
              accessInfo?.accessViewStatus !== 'FULL_PURCHASED') {
            addDebugInfo(`📖 Found book with some access: ${item.id}`)
            return item.id
          }
        }
        
        // No preview access available - this is a copyrighted book
        addDebugInfo(`❌ No preview access found - this appears to be a copyrighted book`)
        return 'NO_PREVIEW'
      }
      
      addDebugInfo('No books found in API response')
      return null
    } catch (error) {
      addDebugInfo(`ERROR in searchForBook: ${error}`)
      console.error('Error searching for book:', error)
      return null
    }
  }

  const extractContentFromPage = async (viewerInstance: any, bookTitle: string, bookAuthor: string, genre?: string) => {
    try {
      addDebugInfo('Starting PDF preview content extraction')
      
      // PDF extraction removed - going directly to API content extractionb
      addDebugInfo('Falling back to API content extraction')
      try {
        const apiContent = await getPreviewContentFromAPI(bookTitle, bookAuthor, currentBook)
        if (apiContent) {
          setExtractedContent(apiContent)
          setStatus('completed')
          // Don't call onContentExtracted - let API extraction happen in background, keep facts in UI
          return apiContent
        }
      } catch (error) {
        addDebugInfo(`API extraction failed: ${error}`)
      }
      
      // Last resort: try DOM + screenshot extraction
      addDebugInfo('Trying DOM and screenshot extraction as last resort')
      
      // Wait for the viewer to be fully loaded
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      // First, try DOM text extraction
      let domText = ''
      try {
        domText = await extractTextFromDOM()
        addDebugInfo(`DOM extraction found ${domText.length} characters`)
      } catch (error) {
        addDebugInfo(`DOM extraction failed: ${error}`)
      }
      
      // If DOM extraction didn't yield much, try screenshot analysis
      let screenshotText = ''
      if (domText.length < 200) {
        try {
          screenshotText = await extractTextFromScreenshots(viewerInstance, bookTitle, bookAuthor)
          addDebugInfo(`Screenshot extraction found ${screenshotText.length} characters`)
        } catch (error) {
          addDebugInfo(`Screenshot extraction failed: ${error}`)
        }
      }
      
      // Combine results
      const extractedText = domText.length > screenshotText.length ? domText : screenshotText
      
      if (extractedText && extractedText.length > 100) {
        const formattedContent = formatExtractedContent(extractedText, bookTitle, bookAuthor)
        addDebugInfo(`✅ Successfully extracted ${extractedText.length} characters of preview content`)
        setExtractedContent(formattedContent)
        setStatus('completed')
        // Don't call onContentExtracted - keep the book facts instead of Google Books metadata
        return formattedContent
      } else {
        // No content could be extracted
        const restrictedMessage = `📚 **"${bookTitle}" by ${bookAuthor}**\n\n🔒 **Preview Status: Limited Access**\n\nNo preview content could be extracted for this book. This could be due to:\n\n**Technical Issues:**\n- No PDF or EPUB preview available\n- Book has restricted access\n- CORS limitations with embedded viewer\n\n**This is common for copyrighted books with restricted access.**\n\n**Suggestions:**\n1. 📖 Try searching for public domain books (older works)\n2. 📚 Check your local library's digital collection\n3. 🛒 Consider purchasing the book for full access\n4. 🔍 Look for books with "Full View" or "Limited Preview" status\n5. 📱 Try accessing book preview sites directly in your browser`
        
        setExtractedContent(restrictedMessage)
        setStatus('restricted')
        // Don't call onContentExtracted for restricted access - keep the book facts instead
        return restrictedMessage
      }
    } catch (error) {
      addDebugInfo(`Content extraction failed: ${error}`)
      const errorMessage = `❌ **Extraction Error**\n\nFailed to extract preview content for "${bookTitle}" by ${bookAuthor}.\n\nError: ${error}\n\nThis could be due to:\n- Network connectivity issues\n- Book access restrictions\n- Browser security limitations\n\nPlease try again or select a different book.`
      setExtractedContent(errorMessage)
      setStatus('error')
      // Don't call onContentExtracted for errors - keep the book facts instead
      return errorMessage
    }
  }

  // PDF extraction function removed - using Playwright automation instead

  const extractTextFromDOM = async (): Promise<string> => {
    return new Promise((resolve) => {
      try {
        if (!viewerRef.current) {
          resolve('')
          return
        }
        
        // Wait a bit for content to load
        setTimeout(() => {
          const viewerContainer = viewerRef.current
          if (!viewerContainer) {
            resolve('')
            return
          }
          
          // Try multiple selectors for Google Books content
          const selectors = [
            '.gb-viewer-content',
            '.gb-page-content',
            '.gb-text-content',
            '.page-content',
            '.text-content',
            '[role="document"]',
            '.book-content',
            'div[style*="page"]',
            // Generic selectors
            'div',
            'p',
            'span'
          ]
          
          let extractedText = ''
          
          for (const selector of selectors) {
            const elements = viewerContainer.querySelectorAll(selector)
            
            for (const element of elements) {
              const text = element.textContent?.trim()
              if (text && text.length > 50 && !text.includes('Loading')) {
                extractedText += text + '\n\n'
              }
            }
            
            if (extractedText.length > 200) {
              break
            }
          }
          
          // Clean up the extracted text
          extractedText = extractedText
            .replace(/\s+/g, ' ')
            .replace(/\n\s*\n/g, '\n\n')
            .trim()
          
          resolve(extractedText)
        }, 2000)
      } catch (error) {
        addDebugInfo(`DOM extraction error: ${error}`)
        resolve('')
      }
    })
  }

  const extractTextFromScreenshots = async (viewerInstance: any, bookTitle: string, bookAuthor: string): Promise<string> => {
    return new Promise(async (resolve) => {
      try {
        if (!viewerRef.current) {
          resolve('')
          return
        }
        
        let allExtractedText = ''
        
        // Try to extract from multiple pages (up to 5)
        for (let pageAttempt = 0; pageAttempt < 5; pageAttempt++) {
          try {
            // Wait for page to load
            await new Promise(resolve => setTimeout(resolve, 2000))
            
            // Take screenshot of the current page
            const canvas = await html2canvas(viewerRef.current, {
              useCORS: true,
              scale: 2,
              logging: false,
              backgroundColor: '#ffffff'
            })
            
            const screenshot = canvas.toDataURL('image/png')
            
            // Extract text from screenshot using improved prompt
            const response = await fetch(getApiUrl('extract-text-from-image'), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                image: screenshot,
                prompt: `Extract all readable text from this book preview page. Focus on:
                
1. Main body text (paragraphs, sentences)
2. Chapter titles and headings
3. Any readable book content
4. Ignore navigation elements, page numbers, and UI elements

Return only the actual book content text, maintaining paragraph structure. If you see "No readable text found" or similar, try harder to find any text that might be present in the image. Look for text that might be in different fonts, sizes, or layouts.`
              })
            })
            
            if (response.ok) {
              const data = await response.json()
              const pageText = data.text?.trim()
              
              if (pageText && pageText.length > 50 && !pageText.includes('No readable text found')) {
                allExtractedText += pageText + '\n\n'
                addDebugInfo(`Page ${pageAttempt + 1}: extracted ${pageText.length} characters`)
              }
            }
            
            // Try to go to next page
            if (pageAttempt < 4) {
              try {
                if (viewerInstance && viewerInstance.nextPage) {
                  viewerInstance.nextPage()
                  await new Promise(resolve => setTimeout(resolve, 1000))
                }
              } catch (error) {
                addDebugInfo(`Could not navigate to next page: ${error}`)
                break
              }
            }
            
          } catch (error) {
            addDebugInfo(`Screenshot extraction error for page ${pageAttempt + 1}: ${error}`)
            continue
          }
        }
        
        resolve(allExtractedText.trim())
      } catch (error) {
        addDebugInfo(`Screenshot extraction failed: ${error}`)
        resolve('')
      }
    })
  }

  const formatExtractedContent = (text: string, bookTitle: string, bookAuthor: string): string => {
    const timestamp = new Date().toLocaleString()
    
    return `📖 **"${bookTitle}" by ${bookAuthor}**
📅 **Extracted:** ${timestamp}
📄 **Source:** Book Preview Pages

---

📚 **Preview Content:**

${text}

---

✅ **Extracted from embedded preview viewer**
🔍 **Method:** Combined DOM extraction and screenshot analysis
📋 **Content Length:** ${text.length} characters

**Note:** This is preview content available through the book preview system. For the complete book, please visit the official book page or purchase the full version.`
  }

  const getPreviewContentFromAPI = async (bookTitle: string, bookAuthor: string, volumeId: string | null): Promise<string | null> => {
    try {
      // First, try to get content using the volume ID directly if we have it
      if (volumeId) {
        addDebugInfo(`Fetching preview content for volume ID: ${volumeId}`)
        const volumeResponse = await fetch(`https://www.googleapis.com/books/v1/volumes/${volumeId}?key=${process.env.NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY}`)
        
        if (volumeResponse.ok) {
          const volumeData = await volumeResponse.json()
          const content = extractContentFromVolumeData(volumeData, bookTitle, bookAuthor)
          if (content) {
            addDebugInfo(`Found content via volume ID: ${content.length} characters`)
            return content
          }
        }
      }
      
      // If volume ID approach didn't work, try searching
      addDebugInfo(`Searching for book: "${bookTitle}" by ${bookAuthor}`)
      const searchQuery = `intitle:"${bookTitle}" inauthor:"${bookAuthor}"`
      const searchResponse = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(searchQuery)}&key=${process.env.NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY}`)
      
      if (!searchResponse.ok) {
        addDebugInfo(`Search API request failed: ${searchResponse.status}`)
        return null
      }
      
      const searchData = await searchResponse.json()
      addDebugInfo(`Search API returned ${searchData.items?.length || 0} results`)
      
      if (searchData.items && searchData.items.length > 0) {
        // Try each result to find the best content
        for (let i = 0; i < searchData.items.length; i++) {
          const item = searchData.items[i]
          addDebugInfo(`Processing search result ${i + 1}/${searchData.items.length}: ${item.volumeInfo?.title || 'No title'}`)
          const content = extractContentFromVolumeData(item, bookTitle, bookAuthor)
          if (content) {
            addDebugInfo(`Found content from search result ${i + 1}: ${content.length} characters`)
            return content
          }
        }
      }
      
      return null
    } catch (error) {
      addDebugInfo(`API request error: ${error}`)
      return null
    }
  }

  const extractContentFromVolumeData = (volumeData: any, bookTitle: string, bookAuthor: string): string | null => {
    let content = `📚 **"${bookTitle}" by ${bookAuthor}**\n\n`
    let hasContent = false
    
    // Extract basic book information
    if (volumeData.volumeInfo) {
      const info = volumeData.volumeInfo
      
      // Add publication info
      if (info.publisher) {
        content += `📖 **Publisher:** ${info.publisher}\n`
      }
      if (info.publishedDate) {
        content += `📅 **Published:** ${info.publishedDate}\n`
      }
      if (info.pageCount) {
        content += `📄 **Pages:** ${info.pageCount}\n`
      }
      if (info.categories && info.categories.length > 0) {
        content += `🏷️ **Categories:** ${info.categories.join(', ')}\n`
      }
      
      content += `\n`
      
      // Add book description (this is often substantial content)
      if (info.description) {
        content += `📝 **Description:**\n${info.description}\n\n`
        hasContent = true
        addDebugInfo(`Found description: ${info.description.length} characters`)
      }
    }
    
    // Extract search snippet (this is preview text from the book)
    if (volumeData.searchInfo && volumeData.searchInfo.textSnippet) {
      content += `📖 **Preview Text:**\n${volumeData.searchInfo.textSnippet}\n\n`
      hasContent = true
      addDebugInfo(`Found text snippet: ${volumeData.searchInfo.textSnippet.length} characters`)
    }
    
    // Add access information
    if (volumeData.accessInfo) {
      const access = volumeData.accessInfo
      content += `🔓 **Access Information:**\n`
      
      if (access.viewability) {
                          const viewabilityMap: Record<string, string> = {
           'PARTIAL': 'Limited Preview Available',
           'ALL_PAGES': 'Full View Available',
           'NO_PAGES': 'No Preview Available',
           'UNKNOWN': 'Preview Status Unknown'
         }
         const viewabilityText = viewabilityMap[access.viewability] || access.viewability
        
        content += `- Preview Status: ${viewabilityText}\n`
      }
      
      if (access.embeddable !== undefined) {
        content += `- Embeddable: ${access.embeddable ? 'Yes' : 'No'}\n`
      }
      
      if (access.publicDomain !== undefined) {
        content += `- Public Domain: ${access.publicDomain ? 'Yes' : 'No'}\n`
      }
      
      content += `\n`
    }
    
    // Add links and notify parent about preview URL
    if (volumeData.volumeInfo && volumeData.volumeInfo.previewLink) {
      content += `🔗 **Links:**\n`
              content += `- [Preview Link](${volumeData.volumeInfo.previewLink})\n`
      if (volumeData.volumeInfo.infoLink) {
        content += `- [More Information](${volumeData.volumeInfo.infoLink})\n`
      }
      content += `\n`
      
      // Notify parent component about the preview URL for browser automation
      if (onPreviewUrlFound) {
        console.log('🔗 Preview link found:', volumeData.volumeInfo.previewLink)
        console.log('🔗 Info link (NOT used):', volumeData.volumeInfo.infoLink)
        onPreviewUrlFound(volumeData.volumeInfo.previewLink)
      }
    }
    
    content += `---\n\n`
    content += `✅ **Content extracted using Preview API**\nThis is the official preview content available for this book.`
    
    return hasContent ? content : null
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gray-100 border-b border-gray-200 px-4 py-3 rounded-t-lg">
        <h2 className="text-lg font-semibold text-gray-900">📖 Book Preview</h2>
      </div>
      
      <div className="max-h-[500px] overflow-y-auto">
      
      <div className="p-4">



        {/* Google Books Viewer Container */}
        <div 
          ref={viewerRef} 
          className="w-full border border-gray-300 rounded-lg bg-white"
          style={{ minHeight: '500px', height: '70vh' }}
        >
          {!apiLoaded && (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600 mb-2">Loading preview API...</p>
                <p className="text-sm text-gray-500">This may take a few moments</p>
                {debugInfo.length > 0 && (
                  <p className="text-xs text-gray-400 mt-2">
                    {debugInfo[debugInfo.length - 1]}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
        
        <div className="mt-4 text-sm text-gray-500">
          <p>
            📚 Powered by <a href="https://developers.google.com/books/docs/v1/getting_started" 
               target="_blank" rel="noopener noreferrer" 
               className="text-blue-600 hover:underline">
              Books API
            </a>
          </p>
          <p className="mt-1">
            🔍 AI analyzes and extracts the most relevant pages for you.
          </p>
        </div>
      </div>
      
      </div>
    </div>
  )
}