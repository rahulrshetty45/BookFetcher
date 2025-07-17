export interface BookInfo {
  title: string;
  author: string;
  isbn?: string;
  publishedDate?: string;
  publisher?: string;
  genre: 'fiction' | 'non-fiction' | 'unknown';
  description?: string;
  pageCount?: number;
  previewLink?: string;
}

export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  reason?: string;
  suggestions?: string;
  detectedText?: {
    title?: string;
    author?: string;
  };
}

export interface ExtractionResult {
  book: BookInfo;
  text: string;
  pageType: 'first-page' | 'second-page';
  source: 'google-books' | 'google-books-preview' | 'open-library' | 'archive-org' | 'gutendex' | 'hathi-trust' | 'web-search';
  confidence: number;
}

export interface ExtractorConfig {
  verbose?: boolean;
  maxRetries?: number;
  timeout?: number;
}

export interface APIResponse {
  success: boolean;
  data?: any;
  error?: string;
  source: string;
}

export interface BookSearchResult {
  books: BookInfo[];
  totalCount: number;
  source: string;
}

export interface PageContent {
  text: string;
  pageNumber?: number;
  isContentPage?: boolean;
  pageType?: 'title' | 'toc' | 'content' | 'acknowledgments' | 'unknown';
  source?: 'google-books' | 'google-books-preview' | 'open-library' | 'archive-org' | 'gutendex' | 'hathi-trust' | 'web-search';
  confidence?: number;
} 