import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'
import { OpenAI } from 'openai'
import { ImageValidator } from '../../../src/core/ImageValidator'
import { BookIdentifier } from '../../../src/core/BookIdentifier'
import { ContentExtractor } from '../../../src/core/ContentExtractor'
import { GenreClassifier } from '../../../src/core/GenreClassifier'

const writeFile = promisify(fs.writeFile)
const unlink = promisify(fs.unlink)

export async function POST(request: NextRequest) {
  try {
    // Parse the form data
    const formData = await request.formData()
    const imageFile = formData.get('image') as File
    const pageType = (formData.get('pageType') as string) || 'second-page'

    if (!imageFile) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 })
    }

    // Check for OpenAI API key
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    // Initialize OpenAI client
    const openai = new OpenAI({ apiKey })

    // Convert File to Buffer and save temporarily
    const bytes = await imageFile.arrayBuffer()
    const buffer = Buffer.from(bytes)
    
    // Create temporary file
    const tempDir = path.join(process.cwd(), 'temp')
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }
    
    const tempFilePath = path.join(tempDir, `${Date.now()}-${imageFile.name}`)
    await writeFile(tempFilePath, buffer)

    try {
      // Configuration object
      const config = {
        openaiApiKey: apiKey,
        timeout: 30000,
        verbose: true // Enable verbose logging for debugging
      }

      // Validate the image contains a book cover
      const imageValidator = new ImageValidator(openai, config)

      const validationResult = await imageValidator.validate(tempFilePath)
      
      if (!validationResult.isValid) {
        return NextResponse.json({ 
          error: validationResult.reason || 'Image does not contain a clear book cover' 
        }, { status: 400 })
      }

      // Identify the book
      const bookIdentifier = new BookIdentifier(config)

      const bookInfo = await bookIdentifier.identify(tempFilePath, validationResult.detectedText)

      // Classify genre
      const genreClassifier = new GenreClassifier(openai, config)

      const genre = await genreClassifier.classify(bookInfo)
      bookInfo.genre = genre

      // Extract content
      const contentExtractor = new ContentExtractor(config)

      const pageContent = await contentExtractor.extract(bookInfo, pageType as 'first-page' | 'second-page')

      // Clean up temporary file
      await unlink(tempFilePath)

      // Return the results
      return NextResponse.json({
        title: bookInfo.title,
        author: bookInfo.author,
        genre: bookInfo.genre,
        text: pageContent.text,
        source: pageContent.source,
        confidence: pageContent.confidence,
        pageType: pageContent.pageType
      })

    } catch (error) {
      // Clean up temporary file even if there's an error
      try {
        await unlink(tempFilePath)
      } catch (unlinkError) {
        console.error('Failed to clean up temp file:', unlinkError)
      }
      throw error
    }

  } catch (error) {
    console.error('Book extraction error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
} 