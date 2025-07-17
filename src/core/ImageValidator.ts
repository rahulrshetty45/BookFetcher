import * as fs from 'fs-extra';
import * as path from 'path';
import { OpenAI } from 'openai';
import { ValidationResult, ExtractorConfig } from '../types';

export class ImageValidator {
  private openai: OpenAI;
  private config: ExtractorConfig;

  constructor(openai: OpenAI, config: ExtractorConfig) {
    this.openai = openai;
    this.config = config;
  }

  /**
   * Validate if the image contains a clear, readable book cover
   */
  async validate(imagePath: string): Promise<ValidationResult> {
    try {
      // Read and encode the image
      const imageBuffer = await fs.readFile(imagePath);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = this.getMimeType(imagePath);

      // Create the prompt for GPT-4 Vision
      const prompt = `Analyze this image and determine if it shows a clear, readable book cover. 

Please provide a JSON response with:
1. "isValid": boolean - true if this is a clear book cover with readable text
2. "confidence": number (0-100) - confidence percentage
3. "reason": string - explanation if not valid
4. "suggestions": string - suggestions for better image if not valid
5. "detectedText": object with "title" and "author" if readable

Requirements for a valid book cover:
- Must clearly show a book cover (front face)
- Title text must be clearly readable
- Author name should be visible (if present)
- Image should not be blurry, tilted, or obscured
- Should not be a spine view or back cover

Be strict in validation - only approve clearly readable covers.`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                  detail: "high"
                }
              }
            ]
          }
        ],
        max_tokens: 500,
        temperature: 0.1
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from GPT-4 Vision');
      }

      // Parse the JSON response
      const result = this.parseValidationResponse(content);
      
      if (this.config.verbose) {
        console.log('📸 Image validation result:', result);
      }

      return result;

    } catch (error) {
      console.error('Error validating image:', error);
      
      // Return a failed validation with error info
      return {
        isValid: false,
        confidence: 0,
        reason: `Failed to analyze image: ${error instanceof Error ? error.message : String(error)}`,
        suggestions: 'Please ensure the image is accessible and try again'
      };
    }
  }

  /**
   * Parse the GPT-4 Vision response into a ValidationResult
   */
  private parseValidationResponse(content: string): ValidationResult {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        return {
          isValid: Boolean(parsed.isValid),
          confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 0)),
          reason: parsed.reason || undefined,
          suggestions: parsed.suggestions || undefined,
          detectedText: parsed.detectedText ? {
            title: parsed.detectedText.title || undefined,
            author: parsed.detectedText.author || undefined
          } : undefined
        };
      }
      
      // Fallback: parse from text description
      const isValid = content.toLowerCase().includes('valid') && 
                     !content.toLowerCase().includes('not valid') &&
                     !content.toLowerCase().includes('invalid');
      
      return {
        isValid,
        confidence: isValid ? 70 : 30,
        reason: isValid ? undefined : 'Could not clearly identify book cover details',
        suggestions: isValid ? undefined : 'Please provide a clearer image of the book cover'
      };

    } catch (error) {
      console.error('Error parsing validation response:', error);
      
      return {
        isValid: false,
        confidence: 0,
        reason: 'Failed to parse validation response',
        suggestions: 'Please try again with a clearer image'
      };
    }
  }

  /**
   * Get MIME type from file extension
   */
  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.gif':
        return 'image/gif';
      case '.webp':
        return 'image/webp';
      default:
        return 'image/jpeg'; // Default fallback
    }
  }
} 