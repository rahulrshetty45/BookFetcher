import * as fs from 'fs-extra';
import { OpenAI } from 'openai';
import { ExtractorConfig, ValidationResult, ExtractionResult, BookInfo } from '../types';
import { ImageValidator } from './ImageValidator';
import { BookIdentifier } from './BookIdentifier';
import { ContentExtractor } from './ContentExtractor';
import { GenreClassifier } from './GenreClassifier';

export class BookExtractor {
  private config: ExtractorConfig;
  private openai: OpenAI;
  private imageValidator: ImageValidator;
  private bookIdentifier: BookIdentifier;
  private contentExtractor: ContentExtractor;
  private genreClassifier: GenreClassifier;

  constructor(config: ExtractorConfig = {}) {
    this.config = {
      verbose: false,
      maxRetries: 3,
      timeout: 30000,
      ...config
    };

    // Initialize OpenAI
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    
    this.openai = new OpenAI({ apiKey });

    // Initialize components
    this.imageValidator = new ImageValidator(this.openai, this.config);
    this.bookIdentifier = new BookIdentifier(this.config);
    this.contentExtractor = new ContentExtractor(this.config);
    this.genreClassifier = new GenreClassifier(this.openai, this.config);
  }

  /**
   * Main extraction pipeline
   */
  async extractFromImage(imagePath: string): Promise<ExtractionResult> {
    this.log('🚀 Starting book extraction pipeline...');

    // Step 1: Validate the image contains a book
    this.log('📸 Validating book cover image...');
    const validation = await this.validateBookImage(imagePath);
    
    if (!validation.isValid) {
      throw new Error(`Invalid book image: ${validation.reason}`);
    }

    // Step 2: Extract text from cover and identify the book
    this.log('🔍 Identifying book from cover...');
    const bookInfo = await this.identifyBook(imagePath, validation);

    // Step 3: Classify genre (fiction vs non-fiction)
    this.log('📚 Classifying book genre...');
    const genre = await this.classifyGenre(bookInfo);
    bookInfo.genre = genre;

    // Step 4: Extract content from appropriate page
    this.log('📖 Extracting book content...');
    const pageType = genre === 'fiction' ? 'second-page' : 'first-page';
    const content = await this.extractContent(bookInfo, pageType);

    const result: ExtractionResult = {
      book: bookInfo,
      text: content.text,
      pageType: pageType,
      source: content.source || 'web-search',
      confidence: content.confidence || 50
    };

    this.log('✅ Extraction completed successfully!');
    return result;
  }

  /**
   * Validate if the image contains a clear book cover
   */
  async validateBookImage(imagePath: string): Promise<ValidationResult> {
    return await this.imageValidator.validate(imagePath);
  }

  /**
   * Identify the book from the cover image
   */
  private async identifyBook(imagePath: string, validation: ValidationResult): Promise<BookInfo> {
    // Use detected text from validation if available
    const hints = validation.detectedText;
    return await this.bookIdentifier.identify(imagePath, hints);
  }

  /**
   * Classify the book genre
   */
  private async classifyGenre(bookInfo: BookInfo): Promise<'fiction' | 'non-fiction'> {
    return await this.genreClassifier.classify(bookInfo);
  }

  /**
   * Extract content from the appropriate page
   */
  private async extractContent(bookInfo: BookInfo, pageType: 'first-page' | 'second-page') {
    return await this.contentExtractor.extract(bookInfo, pageType);
  }

  /**
   * Log messages if verbose mode is enabled
   */
  private log(message: string): void {
    if (this.config.verbose) {
      console.log(message);
    }
  }
} 