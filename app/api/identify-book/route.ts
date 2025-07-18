import { NextRequest, NextResponse } from 'next/server'
import { OpenAI } from 'openai'
import formidable from 'formidable'
import fs from 'fs'
import path from 'path'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    // Parse the multipart form data
    const data = await request.formData()
    const file = data.get('image') as File
    
    if (!file) {
      return NextResponse.json(
        { error: 'No image file provided' },
        { status: 400 }
      )
    }

    // Convert file to base64
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const base64Image = buffer.toString('base64')
    const mimeType = file.type || 'image/jpeg'

    console.log('🔍 Identifying book from cover image using GPT-4 Vision...')

    // Use GPT-4 Vision to identify the book
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this book cover image and identify the book. Return ONLY a JSON object with exactly this format:
{
  "title": "The exact book title",
  "author": "The author's name"
}

Be precise and accurate. Look for the title and author text on the cover.`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 300,
      temperature: 0.1
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('No response from GPT-4 Vision')
    }

    console.log('📖 GPT-4 Vision response:', content)

    // Parse the JSON response
    let bookInfo
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        bookInfo = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('No JSON found in response')
      }
    } catch (parseError) {
      console.error('Failed to parse GPT-4 Vision response:', parseError)
      throw new Error('Failed to parse book identification response')
    }

    // Validate the response has required fields
    if (!bookInfo.title || !bookInfo.author) {
      throw new Error('Could not identify book title and author from the image')
    }

    console.log('✅ Book identified:', bookInfo.title, 'by', bookInfo.author)

    return NextResponse.json({
      title: bookInfo.title,
      author: bookInfo.author
    })

  } catch (error) {
    console.error('Book identification error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to identify book' },
      { status: 500 }
    )
  }
} 