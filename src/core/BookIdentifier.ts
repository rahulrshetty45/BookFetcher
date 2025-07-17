import axios from 'axios';
import { BookInfo, ExtractorConfig, BookSearchResult } from '../types';

export class BookIdentifier {
  private config: ExtractorConfig;
  private googleBooksApiKey?: string;

  constructor(config: ExtractorConfig) {
    this.config = config;
    this.googleBooksApiKey = process.env.GOOGLE_BOOKS_API_KEY;
  }

  /**
   * Identify a book from cover image and text hints
   */
  async identify(imagePath: string, hints?: { title?: string; author?: string }): Promise<BookInfo> {
    if (this.config.verbose) {
      console.log('🔍 Starting book identification with hints:', hints);
    }

    // If we have hints from image validation, use them
    if (hints?.title || hints?.author) {
      if (this.config.verbose) {
        console.log(`📚 Searching for book with title: "${hints.title}", author: "${hints.author}"`);
      }
      
      try {
        const searchResult = await this.searchByTitleAuthor(hints.title, hints.author);
        if (searchResult.books.length > 0) {
          if (this.config.verbose) {
            console.log(`✅ Found ${searchResult.books.length} book(s), returning best match: "${searchResult.books[0].title}"`);
          }
          return searchResult.books[0]; // Return the best match
        } else {
          if (this.config.verbose) {
            console.log(`❌ No books found with provided hints`);
          }
        }
      } catch (error) {
        if (this.config.verbose) {
          console.log(`❌ Search failed with error:`, error);
        }
      }
    }

    // Try a broader search with partial matches if we have any text
    if (hints?.title) {
      if (this.config.verbose) {
        console.log(`🔍 Trying broader search with just title: "${hints.title}"`);
      }
      
      try {
        const broadSearchResult = await this.searchByTitleAuthor(hints.title);
        if (broadSearchResult.books.length > 0) {
          if (this.config.verbose) {
            console.log(`✅ Broad search found ${broadSearchResult.books.length} book(s)`);
          }
          return broadSearchResult.books[0];
        }
      } catch (error) {
        if (this.config.verbose) {
          console.log(`❌ Broad search failed:`, error);
        }
      }
    }

    // If no hints provided, try OCR extraction from the image
    if (!hints?.title && !hints?.author) {
      if (this.config.verbose) {
        console.log('📖 No hints provided, attempting OCR extraction from image...');
      }
      
      try {
        // This would require implementing OCR - for now we'll use a more specific error
        throw new Error('No title or author hints provided from image validation. OCR extraction not yet implemented.');
      } catch (error) {
        if (this.config.verbose) {
          console.log(`❌ OCR extraction failed:`, error);
        }
      }
    }

    // Final fallback error with debugging info
    const errorMessage = hints?.title || hints?.author 
      ? `Could not find book with title: "${hints.title || 'unknown'}", author: "${hints.author || 'unknown'}". Please ensure the book cover image is clear and the book is available in our databases.`
      : 'Could not identify book from the provided image. Please ensure the title and author are clearly visible.';
    
    throw new Error(errorMessage);
  }

  /**
   * Search for books using title and/or author
   */
  private async searchByTitleAuthor(title?: string, author?: string): Promise<BookSearchResult> {
    const searchTerms = [];
    if (title) searchTerms.push(title);
    if (author) searchTerms.push(author);
    
    const query = searchTerms.join(' ');
    
    if (this.config.verbose) {
      console.log(`📚 Searching for: "${query}"`);
    }

    // Try multiple APIs in order of preference
    // Free APIs first, then paid APIs if available
    const searchMethods = [
      () => this.searchOpenLibrary(query),     // Free, excellent coverage
      () => this.searchGoogleBooks(query),     // Free tier, high quality
      () => this.searchGutendex(query),        // Free, Project Gutenberg
      () => this.searchArchiveOrg(query),      // Free, Internet Archive
      () => this.searchCrossRef(query),        // Free, academic books
      () => this.searchBigBookAPI(query),      // Premium, AI-powered
      () => this.searchISBNdb(query),          // Premium, comprehensive
      () => this.searchNYTBooks(query),        // Reviews & bestsellers
    ];

    for (const search of searchMethods) {
      try {
        const result = await search();
        if (result.books.length > 0) {
          if (this.config.verbose) {
            console.log(`✅ Found ${result.books.length} books from ${result.source}`);
          }
          return result;
        }
      } catch (error) {
        if (this.config.verbose) {
          console.log(`❌ Search failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    return { books: [], totalCount: 0, source: 'none' };
  }

  /**
   * Search Google Books API
   */
  private async searchGoogleBooks(query: string): Promise<BookSearchResult> {
    const url = 'https://www.googleapis.com/books/v1/volumes';
    const params: any = {
      q: query,
      maxResults: 5,
      orderBy: 'relevance'
    };

    if (this.googleBooksApiKey) {
      params.key = this.googleBooksApiKey;
    }

    const response = await axios.get(url, { params, timeout: this.config.timeout });
    
    const books: BookInfo[] = [];
    
    if (response.data.items) {
      for (const item of response.data.items) {
        const volumeInfo = item.volumeInfo;
        
        const book: BookInfo = {
          title: volumeInfo.title || 'Unknown Title',
          author: volumeInfo.authors ? volumeInfo.authors.join(', ') : 'Unknown Author',
          isbn: this.extractISBN(volumeInfo.industryIdentifiers),
          publishedDate: volumeInfo.publishedDate,
          publisher: volumeInfo.publisher,
          genre: this.inferGenre(volumeInfo.categories),
          description: volumeInfo.description,
          pageCount: volumeInfo.pageCount,
          previewLink: volumeInfo.previewLink || item.accessInfo?.webReaderLink
        };

        books.push(book);
      }
    }

    return {
      books,
      totalCount: response.data.totalItems || 0,
      source: 'google-books'
    };
  }

  /**
   * Search OpenLibrary API
   */
  private async searchOpenLibrary(query: string): Promise<BookSearchResult> {
    const url = 'https://openlibrary.org/search.json';
    const params = {
      q: query,
      limit: 5,
      fields: 'key,title,author_name,isbn,first_publish_year,publisher,subject'
    };

    const response = await axios.get(url, { params, timeout: this.config.timeout });
    
    const books: BookInfo[] = [];
    
    if (response.data.docs) {
      for (const doc of response.data.docs) {
        const book: BookInfo = {
          title: doc.title || 'Unknown Title',
          author: doc.author_name ? doc.author_name.join(', ') : 'Unknown Author',
          isbn: doc.isbn ? doc.isbn[0] : undefined,
          publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
          publisher: doc.publisher ? doc.publisher[0] : undefined,
          genre: this.inferGenreFromSubjects(doc.subject),
          previewLink: `https://openlibrary.org${doc.key}`
        };

        books.push(book);
      }
    }

    return {
      books,
      totalCount: response.data.numFound || 0,
      source: 'open-library'
    };
  }

  /**
   * Search Archive.org
   */
  private async searchArchiveOrg(query: string): Promise<BookSearchResult> {
    const url = 'https://archive.org/advancedsearch.php';
    const params = {
      q: `title:(${query}) OR creator:(${query})`,
      fl: 'identifier,title,creator,date,publisher,subject',
      rows: 5,
      page: 1,
      output: 'json',
      mediatype: 'texts'
    };

    const response = await axios.get(url, { params, timeout: this.config.timeout });
    
    const books: BookInfo[] = [];
    
    if (response.data.response?.docs) {
      for (const doc of response.data.response.docs) {
        const book: BookInfo = {
          title: doc.title || 'Unknown Title',
          author: doc.creator || 'Unknown Author',
          publishedDate: doc.date,
          publisher: doc.publisher,
          genre: this.inferGenreFromSubjects(doc.subject),
          previewLink: `https://archive.org/details/${doc.identifier}`
        };

        books.push(book);
      }
    }

    return {
      books,
      totalCount: response.data.response?.numFound || 0,
      source: 'archive-org'
    };
  }

  /**
   * Extract ISBN from industry identifiers
   */
  private extractISBN(identifiers?: any[]): string | undefined {
    if (!identifiers) return undefined;
    
    for (const id of identifiers) {
      if (id.type === 'ISBN_13' || id.type === 'ISBN_10') {
        return id.identifier;
      }
    }
    
    return undefined;
  }

  /**
   * Infer genre from Google Books categories
   */
  private inferGenre(categories?: string[]): 'fiction' | 'non-fiction' | 'unknown' {
    if (!categories) return 'unknown';
    
    const categoryText = categories.join(' ').toLowerCase();
    
    const fictionKeywords = ['fiction', 'novel', 'romance', 'mystery', 'thriller', 'fantasy', 'science fiction'];
    const nonFictionKeywords = ['biography', 'history', 'science', 'technology', 'business', 'self-help', 'reference'];
    
    const isFiction = fictionKeywords.some(keyword => categoryText.includes(keyword));
    const isNonFiction = nonFictionKeywords.some(keyword => categoryText.includes(keyword));
    
    if (isFiction && !isNonFiction) return 'fiction';
    if (isNonFiction && !isFiction) return 'non-fiction';
    
    return 'unknown';
  }

  /**
   * Search Gutendex API (Project Gutenberg)
   */
  private async searchGutendex(query: string): Promise<BookSearchResult> {
    const url = 'https://gutendex.com/books';
    const params = {
      search: query
    };

    const response = await axios.get(url, { params, timeout: this.config.timeout });
    
    const books: BookInfo[] = [];
    
    if (response.data.results) {
      for (const book of response.data.results) {
        const bookInfo: BookInfo = {
          title: book.title || 'Unknown Title',
          author: book.authors?.map((a: any) => a.name).join(', ') || 'Unknown Author',
          publishedDate: book.copyright ? String(book.copyright) : undefined,
          genre: 'unknown', // Gutenberg books are mostly public domain classics
          previewLink: book.formats?.['text/html'] || book.formats?.['text/plain']
        };

        books.push(bookInfo);
      }
    }

    return {
      books,
      totalCount: response.data.count || 0,
      source: 'gutendex'
    };
  }

  /**
   * Search CrossRef API (Academic books and papers)
   */
  private async searchCrossRef(query: string): Promise<BookSearchResult> {
    const url = 'https://api.crossref.org/works';
    const params = {
      query: query,
      rows: 5,
      filter: 'type:book'
    };

    const response = await axios.get(url, { params, timeout: this.config.timeout });
    
    const books: BookInfo[] = [];
    
    if (response.data.message?.items) {
      for (const item of response.data.message.items) {
        const book: BookInfo = {
          title: item.title?.[0] || 'Unknown Title',
          author: item.author?.map((a: any) => `${a.given} ${a.family}`).join(', ') || 'Unknown Author',
          publishedDate: item.published?.['date-parts']?.[0]?.[0]?.toString(),
          publisher: item.publisher,
          genre: 'non-fiction', // CrossRef is mostly academic
          description: item.abstract
        };

        books.push(book);
      }
    }

    return {
      books,
      totalCount: response.data.message?.['total-results'] || 0,
      source: 'crossref'
    };
  }

  /**
   * Search Big Book API (Premium)
   */
  private async searchBigBookAPI(query: string): Promise<BookSearchResult> {
    const apiKey = process.env.BIG_BOOK_API_KEY;
    if (!apiKey) {
      throw new Error('BIG_BOOK_API_KEY not configured');
    }

    // This is a placeholder - actual implementation would depend on Big Book API docs
    throw new Error('Big Book API integration not yet implemented');
  }

  /**
   * Search ISBNdb API (Premium)
   */
  private async searchISBNdb(query: string): Promise<BookSearchResult> {
    const apiKey = process.env.ISBNDB_API_KEY;
    if (!apiKey) {
      throw new Error('ISBNDB_API_KEY not configured');
    }

    const url = 'https://api.isbndb.com/books';
    const params = {
      q: query,
      page: 1,
      pageSize: 5
    };

    const response = await axios.get(url, { 
      params, 
      timeout: this.config.timeout,
      headers: {
        'Authorization': apiKey
      }
    });
    
    const books: BookInfo[] = [];
    
    if (response.data.books) {
      for (const book of response.data.books) {
        const bookInfo: BookInfo = {
          title: book.title || 'Unknown Title',
          author: book.authors?.join(', ') || 'Unknown Author',
          isbn: book.isbn13 || book.isbn,
          publishedDate: book.date_published,
          publisher: book.publisher,
          genre: this.inferGenre(book.subjects),
          description: book.synopsis,
          pageCount: book.pages
        };

        books.push(bookInfo);
      }
    }

    return {
      books,
      totalCount: response.data.total || 0,
      source: 'isbndb'
    };
  }

  /**
   * Search New York Times Books API
   */
  private async searchNYTBooks(query: string): Promise<BookSearchResult> {
    const apiKey = process.env.NYT_BOOKS_API_KEY;
    if (!apiKey) {
      throw new Error('NYT_BOOKS_API_KEY not configured');
    }

    // NYT Books API is mainly for reviews and bestsellers, not general search
    // This is a placeholder for potential integration
    throw new Error('NYT Books API integration not yet implemented');
  }

  /**
   * Infer genre from subject tags
   */
  private inferGenreFromSubjects(subjects?: string[]): 'fiction' | 'non-fiction' | 'unknown' {
    if (!subjects) return 'unknown';
    
    const subjectText = subjects.join(' ').toLowerCase();
    
    if (subjectText.includes('fiction')) return 'fiction';
    if (subjectText.includes('biography') || subjectText.includes('history') || 
        subjectText.includes('science') || subjectText.includes('reference')) {
      return 'non-fiction';
    }
    
    return 'unknown';
  }
} 