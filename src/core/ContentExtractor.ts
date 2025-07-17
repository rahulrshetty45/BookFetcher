import axios from 'axios';
import { BookInfo, ExtractorConfig, PageContent } from '../types';



export class ContentExtractor {
  private config: ExtractorConfig;

  constructor(config: ExtractorConfig) {
    this.config = config;
  }

  /**
   * Extract content from the specified page type (first or second content page)
   */
  async extract(bookInfo: BookInfo, pageType: 'first-page' | 'second-page') {
    if (this.config.verbose) {
      console.log(`📖 Extracting ${pageType} content for: "${bookInfo.title}"`);
    }

    // Try different content sources in order of preference
    const extractors = [
      () => this.extractFromArchiveOrg(bookInfo, pageType),
      () => this.extractFromGutendex(bookInfo, pageType),
      () => this.extractFromHathiTrust(bookInfo, pageType),
      () => this.extractFromGoogleBooksPreview(bookInfo, pageType),
      () => this.extractFromOpenLibrary(bookInfo, pageType)
    ];

    // Collect results from multiple sources for comparison
    const results: (PageContent & { sourceDetails?: any })[] = [];

    for (const extractor of extractors) {
      try {
        const result = await extractor();
        if (result.text.length > 100) {
          results.push(result);
          if (this.config.verbose) {
            console.log(`✅ Got content from ${result.source}: ${result.text.length} chars, confidence: ${result.confidence}`);
          }
        }
      } catch (error) {
        if (this.config.verbose) {
          console.log(`❌ Extraction failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // Choose the best result based on content quality and source reliability
    if (results.length > 0) {
      const bestResult = this.chooseBestPreview(results);
      if (this.config.verbose) {
        console.log(`🏆 Selected best preview from ${bestResult.source} (confidence: ${bestResult.confidence})`);
      }
      return bestResult;
    }

    // If all sources fail, provide helpful guidance
    const suggestions = [];
    
    if (bookInfo.genre === 'fiction') {
      suggestions.push('📖 For fiction books, try searching specific book excerpt or chapter sites');
      suggestions.push('🔍 Look for author-approved sample chapters on their official website');
    } else {
      suggestions.push('📊 For non-fiction, check if the publisher offers free sample chapters');
      suggestions.push('📚 Academic books may have previews on university press websites');
    }
    
    suggestions.push('🏛️ If this is a classic work, try Project Gutenberg (gutenberg.org)');
    suggestions.push('📖 For recent books, check if the publisher offers "Look Inside" features');
    suggestions.push('🔗 Sometimes direct publisher websites have more content than aggregators');

    const errorMessage = `❌ Unable to extract actual page content for "${bookInfo.title}".\n\n` +
      `📋 What we tried:\n` +
      `• Archive.org (no accessible preview pages)\n` +
      `• Project Gutenberg (book not found or not public domain)\n` +
      `• HathiTrust Digital Library (no preview access)\n` +
      `• Google Books Preview API (no preview pages available)\n` +
      `• OpenLibrary (content not available)\n\n` +
      `💡 Suggestions:\n${suggestions.map(s => `• ${s}`).join('\n')}\n\n` +
      `⚖️ Note: Many books are under copyright and don't have freely accessible full text.`;

    throw new Error(errorMessage);
  }

  /**
   * Choose the best preview result from multiple sources
   */
  private chooseBestPreview(results: PageContent[]): PageContent {
    // Sort by quality factors:
    // 1. Actual content pages (isContentPage=true) are better than metadata
    // 2. Higher confidence scores
    // 3. Longer text content (more substantial)
    // 4. Source reliability (Archive.org > HathiTrust > Google Books > others)
    
    const sourceReliability: { [key: string]: number } = {
      'archive-org': 100,
      'gutendex': 95,
      'hathi-trust': 85,
      'google-books-preview': 80,
      'google-books': 60,
      'open-library': 50
    };

    return results.sort((a, b) => {
      // Prioritize actual content pages
      if (a.isContentPage !== b.isContentPage) {
        return b.isContentPage ? 1 : -1;
      }
      
      // Then by confidence + source reliability
      const aScore = (a.confidence || 0) + (sourceReliability[a.source || ''] || 0);
      const bScore = (b.confidence || 0) + (sourceReliability[b.source || ''] || 0);
      
      if (aScore !== bScore) {
        return bScore - aScore;
      }
      
      // Finally by content length
      return b.text.length - a.text.length;
    })[0];
  }

  /**
   * Extract content from Archive.org using optimized direct API access
   */
  private async extractFromArchiveOrg(bookInfo: BookInfo, pageType: 'first-page' | 'second-page'): Promise<PageContent> {
    if (this.config.verbose) {
      console.log(`🔍 Searching Archive.org for: "${bookInfo.title}" by "${bookInfo.author}"`);
    }

    // Use more targeted search with better scoring
    const searchUrl = 'https://archive.org/advancedsearch.php';
    const searchParams = {
      q: `title:"${bookInfo.title}" AND creator:"${bookInfo.author}" AND mediatype:texts`,
      fl: 'identifier,title,creator,description,date,downloads,num_reviews',
      rows: 5,
      page: 1,
      output: 'json',
      sort: 'downloads desc'
    };

    const searchResponse = await axios.get(searchUrl, { 
      params: searchParams, 
      timeout: this.config.timeout,
      headers: {
        'User-Agent': 'BookExtractor/1.0 (Educational Research)'
      }
    });
    
    if (!searchResponse.data.response?.docs?.length) {
      throw new Error('Book not found on Archive.org');
    }

    if (this.config.verbose) {
      console.log(`📚 Found ${searchResponse.data.response.docs.length} Archive.org items`);
    }

    // Try each book result, but more efficiently
    for (const doc of searchResponse.data.response.docs) {
      try {
        if (this.config.verbose) {
          console.log(`🔍 Checking: ${doc.identifier} - "${doc.title}"`);
        }

        // Try to get text content directly
        const textContent = await this.getArchiveOrgTextDirect(doc.identifier, pageType);
        
        if (textContent && textContent.trim().length > 200) {
          if (textContent.trim().length > 1000) {
            // Extract the appropriate page based on genre for full text content
            const extractedText = this.extractPageFromText(textContent, pageType, bookInfo.genre);
            
            if (extractedText.trim().length > 200) {
              if (this.config.verbose) {
                console.log(`✅ Successfully extracted ${extractedText.length} characters from Archive.org`);
              }
              
              return {
                text: extractedText,
                source: 'archive-org' as const,
                confidence: 90,
                isContentPage: true,
                pageType: 'content' as const
              };
            }
          } else {
            // This is preview/access information, return it as successful extraction
            if (this.config.verbose) {
              console.log(`✅ Successfully extracted preview access information from Archive.org`);
            }
            
                          return {
                text: textContent,
                source: 'archive-org' as const,
                confidence: 75,
                isContentPage: false,
                pageType: 'unknown' as const
              };
          }
        }

      } catch (error) {
        if (this.config.verbose) {
          console.log(`❌ Failed to process Archive.org item ${doc.identifier}: ${error instanceof Error ? error.message : String(error)}`);
        }
        continue;
      }
    }

    throw new Error('No readable text content found on Archive.org');
  }

  /**
   * Get text content directly from Archive.org using the most reliable method
   */
  private async getArchiveOrgTextDirect(identifier: string, pageType: 'first-page' | 'second-page'): Promise<string | null> {
    try {
      // Method 1: Get metadata first to find available text files
      const metadataUrl = `https://archive.org/metadata/${identifier}`;
      const metadataResponse = await axios.get(metadataUrl, { 
        timeout: this.config.timeout,
        headers: {
          'User-Agent': 'BookExtractor/1.0 (Educational Research)'
        }
      });
      
      const files = metadataResponse.data.files || [];
      
      // Find the best text file using priority order
      const textFile = this.findBestArchiveTextFile(files);
      
      if (textFile) {
        if (this.config.verbose) {
          console.log(`📄 Found text file: ${textFile.name} (${textFile.size} bytes)`);
        }
        return await this.downloadArchiveTextFile(identifier, textFile);
      }

    } catch (metadataError) {
      if (this.config.verbose) {
        console.log(`❌ Metadata method failed: ${metadataError instanceof Error ? metadataError.message : String(metadataError)}`);
      }
    }

    try {
      // Method 2: Try common text file patterns directly
      const commonPatterns = [
        `${identifier}_djvu.txt`,
        `${identifier}.txt`, 
        `${identifier}_text.txt`,
        // For Gutenberg books, try extracting the number and common patterns
        ...this.getGutenbergTextPatterns(identifier)
      ];

      for (const filename of commonPatterns) {
        try {
          const textUrl = `https://archive.org/download/${identifier}/${filename}`;
          
          if (this.config.verbose) {
            console.log(`📄 Trying pattern: ${filename}`);
          }

          const textResponse = await axios.get(textUrl, {
            timeout: this.config.timeout,
            maxContentLength: 50 * 1024 * 1024, // 50MB limit
            maxRedirects: 5, // Follow redirects to actual file servers
            headers: {
              'User-Agent': 'BookExtractor/1.0 (Educational Research)'
            },
            validateStatus: (status) => status === 200
          });

          if (textResponse.data && typeof textResponse.data === 'string' && textResponse.data.length > 1000) {
            if (this.config.verbose) {
              console.log(`✅ Got text from ${filename}: ${textResponse.data.length} characters`);
            }
            return this.cleanArchiveOrgText(textResponse.data);
          }

        } catch (fileError) {
          // Continue to next pattern
          continue;
        }
      }

    } catch (directError) {
      if (this.config.verbose) {
        console.log(`❌ Direct pattern method failed: ${directError instanceof Error ? directError.message : String(directError)}`);
      }
    }

    // Method 3: Try Archive Lab API for preview text extraction
    try {
      if (this.config.verbose) {
        console.log(`📖 Trying Archive Lab API for ${identifier}...`);
      }
      
      const previewContent = await this.getArchiveLabPreviewText(identifier, pageType);
      if (previewContent) {
        return previewContent;
      }
    } catch (previewError) {
      if (this.config.verbose) {
        console.log(`❌ Archive Lab API method failed: ${previewError instanceof Error ? previewError.message : String(previewError)}`);
      }
    }

    return null;
  }

  /**
   * Extract preview text using Archive Lab API
   */
  private async getArchiveLabPreviewText(identifier: string, pageType: 'first-page' | 'second-page'): Promise<string | null> {
    try {
      // Get metadata to find the correct server and path
      if (this.config.verbose) {
        console.log(`🔍 Getting metadata for ${identifier} to find search-inside endpoint...`);
      }

      const searchMetadataUrl = `https://archive.org/metadata/${identifier}`;
      const searchMetadataResponse = await axios.get(searchMetadataUrl, { 
        timeout: 10000,
        headers: {
          'User-Agent': 'BookExtractor/1.0 (Educational Research)'
        }
      });

      const server = searchMetadataResponse.data.server;
      const dir = searchMetadataResponse.data.dir;
      
      if (!server || !dir) {
        if (this.config.verbose) {
          console.log(`❌ Could not get server/dir from metadata for ${identifier}`);
        }
        return null;
      }

      const hostname = `https://${server}`;
      const path = `${dir}/${identifier}`;

      if (this.config.verbose) {
        console.log(`📡 Using server: ${hostname}, path: ${path}`);
      }

      // Try search-inside API using the correct Archive.org format
      // Use a generic search term that works for most books
      const searchUrl = `${hostname}/fulltext/inside.php?item_id=${identifier}&doc=${identifier}&path=${path}&q=text`;
      
      if (this.config.verbose) {
        console.log(`🔍 Searching inside book with URL: ${searchUrl}`);
      }

      const searchResponse = await axios.get(searchUrl, { 
        timeout: 15000,
        headers: {
          'User-Agent': 'BookExtractor/1.0 (Educational Research)'
        }
      });

      // Parse the response to check for matches or provide access info
      let responseData: any = {};
      try {
        if (typeof searchResponse.data === 'string') {
          responseData = JSON.parse(searchResponse.data);
        } else {
          responseData = searchResponse.data;
        }
      } catch (parseError) {
        if (this.config.verbose) {
          console.log(`❌ Could not parse search response for ${identifier}`);
        }
      }

      if (responseData.matches && responseData.matches.length > 0) {
        if (this.config.verbose) {
          console.log(`📖 Found ${responseData.matches.length} text matches in ${identifier}`);
        }

        // Extract preview text from search results
        const previewTexts = responseData.matches.slice(0, 3).map((match: any) => {
          const cleanText = match.text.replace(/\{\{\{|\}\}\}/g, '');
          return `Page ${match.par[0]?.page || 'Unknown'}: ${cleanText}`;
        });

        return `Preview text from "${identifier}":

${previewTexts.join('\n\n')}

📖 Full book available at: https://archive.org/details/${identifier}
📄 This preview shows sample content from the book through Archive.org's search-inside feature.

Note: This is preview content extracted from Archive.org's search-inside functionality. The complete book may be available for borrowing or viewing through their controlled digital lending system.`;
      } else if (responseData.indexed) {
        // Book is indexed but may not have searchable text due to OCR limitations
        if (this.config.verbose) {
          console.log(`📚 Book ${identifier} is indexed but no OCR text available. Trying BookReader API.`);
        }

        // Try BookReader API for individual page access
        const bookReaderContent = await this.getArchiveBookReaderPreview(identifier, pageType);
        if (bookReaderContent) {
          return bookReaderContent;
        }

        return `"${identifier}" is available on Archive.org with preview access.

📖 View the book at: https://archive.org/details/${identifier}
📄 This book is indexed in Archive.org's catalog and available for viewing.

${responseData.error ? `Technical note: ${responseData.error}` : ''}

Note: While full-text search may not be available for this book, you can still view page images and may be able to borrow or read the book through Archive.org's digital lending system. Preview pages are typically available even for copyrighted works.`;
      }

      // Fallback: Try to get book metadata and OCR from a sample page
      if (this.config.verbose) {
        console.log(`📚 Trying to extract OCR text from sample pages for ${identifier}...`);
      }

      // Try a few sample pages that are commonly available for preview
      const samplePages = [1, 5, 10, 15, 20];
      let extractedTexts: string[] = [];

      for (const pageNum of samplePages) {
        try {
          const ocrUrl = `https://api.archivelab.org/books/${identifier}/pages/${pageNum}/ocr`;
          const ocrResponse = await axios.get(ocrUrl, { 
            timeout: 5000,
            headers: {
              'User-Agent': 'BookExtractor/1.0 (Educational Research)'
            }
          });

          if (ocrResponse.data && ocrResponse.data.text) {
            const cleanText = ocrResponse.data.text.trim();
            if (cleanText.length > 50) {
              extractedTexts.push(`Page ${pageNum}: ${cleanText.substring(0, 500)}...`);
              if (this.config.verbose) {
                console.log(`📄 Extracted ${cleanText.length} characters from page ${pageNum}`);
              }
            }
          }
        } catch (pageError) {
          // Continue to next page
          continue;
        }

        // Stop after we get a good sample
        if (extractedTexts.length >= 2) break;
      }

      if (extractedTexts.length > 0) {
        return `Preview content from Archive.org book ${identifier}:

${extractedTexts.join('\n\n')}

📖 Full book available at: https://archive.org/details/${identifier}
📄 This preview shows sample pages from the book through Archive.org's OCR system.

Note: This is preview content extracted from publicly accessible pages. Additional content may be available through Archive.org's controlled digital lending system.`;
      }

      // Final fallback: Get basic book info
      const metadataUrl = `https://api.archivelab.org/books/${identifier}`;
      const metadataResponse = await axios.get(metadataUrl, { 
        timeout: this.config.timeout,
        headers: {
          'User-Agent': 'BookExtractor/1.0 (Educational Research)'
        }
      });

      if (metadataResponse.data) {
        const bookTitle = metadataResponse.data.title || 'Unknown Title';
        const bookCreator = metadataResponse.data.creator || 'Unknown Author';
        
        if (this.config.verbose) {
          console.log(`📚 Retrieved basic metadata for ${identifier}: "${bookTitle}" by ${bookCreator}`);
        }

        return `Book "${bookTitle}" by ${bookCreator} is available on Archive.org.

📖 Access the book at: https://archive.org/details/${identifier}
📄 This book is available through Archive.org's digital library system.

Note: While full text extraction is not available for this copyrighted work, you can access preview pages and potentially borrow the book through Archive.org's controlled digital lending system.`;
      }

      return null;

    } catch (error) {
      if (this.config.verbose) {
        console.log(`❌ Archive Lab API extraction failed: ${error}`);
      }
      return null;
    }
  }

  /**
   * Get preview content using Archive.org's BookReader API
   */
  private async getArchiveBookReaderPreview(identifier: string, pageType: 'first-page' | 'second-page'): Promise<string | null> {
    try {
      if (this.config.verbose) {
        console.log(`📖 Trying Archive.org BookReader API for ${identifier}...`);
      }

      // Get book metadata first to understand structure
      const metadataUrl = `https://archive.org/metadata/${identifier}`;
      const metadataResponse = await axios.get(metadataUrl, { 
        timeout: this.config.timeout,
        headers: {
          'User-Agent': 'BookExtractor/1.0 (Educational Research)'
        }
      });

      const server = metadataResponse.data.server;
      const dir = metadataResponse.data.dir;

      if (!server || !dir) {
        if (this.config.verbose) {
          console.log(`❌ Could not get server/dir for BookReader access`);
        }
        return null;
      }

      // First, try to detect which pages are actually available for preview
      const availablePages = await this.getAvailablePreviewPages(identifier, server, dir);
      
      if (availablePages.length === 0) {
        if (this.config.verbose) {
          console.log(`❌ No preview pages available for ${identifier}`);
        }
        return null;
      }

      if (this.config.verbose) {
        console.log(`📄 Found ${availablePages.length} available preview pages: ${availablePages.join(', ')}`);
      }

      // Select appropriate pages based on pageType
      let targetPages: number[];
      
      if (pageType === 'first-page') {
        // For first-page, get the earliest content pages (skip cover if it's page 1)
        targetPages = availablePages.filter(p => p > 1).slice(0, 3);
        if (targetPages.length === 0 && availablePages.length > 0) {
          targetPages = [availablePages[0]]; // Fallback to first available
        }
      } else {
        // For second-page, get middle pages or later pages
        targetPages = availablePages.filter(p => p > 2).slice(0, 3);
        if (targetPages.length === 0) {
          targetPages = availablePages.slice(1, 4); // Take pages after the first
        }
      }

      if (this.config.verbose) {
        console.log(`📄 Targeting pages for ${pageType}: ${targetPages.join(', ')}`);
      }

      let extractedContent: string[] = [];

      for (const pageNum of targetPages) {
        try {
          // Try different Archive.org page image access methods
          const imageUrls = [
            `https://archive.org/services/img/${identifier}/page/n${pageNum}_w600.jpg`,
            `https://archive.org/services/img/${identifier}/page/n${pageNum}_w800.jpg`,
            `https://archive.org/download/${identifier}/page/n${pageNum}.jpg`,
            `https://archive.org/download/${identifier}/page/n${pageNum}_w600.jpg`,
            `https://archive.org/download/${identifier}/page/n${pageNum}_w800.jpg`,
            `https://ia803404.us.archive.org/BookReader/BookReaderImages.php?zip=${dir}/${identifier}_jp2.zip&file=${identifier}_jp2/${identifier}_${String(pageNum).padStart(4, '0')}.jp2&id=${identifier}&scale=1&rotate=0`
          ];

          let pageImageFound = false;

          for (const imageUrl of imageUrls) {
            try {
              if (this.config.verbose) {
                console.log(`📄 Trying to access page ${pageNum} image: ${imageUrl}`);
              }

              const imageResponse = await axios.get(imageUrl, { 
                timeout: 10000,
                responseType: 'arraybuffer',
                headers: {
                  'User-Agent': 'BookExtractor/1.0 (Educational Research)'
                },
                validateStatus: (status) => status === 200
              });

              if (imageResponse.data && imageResponse.data.byteLength > 1000) {
                if (this.config.verbose) {
                  console.log(`📷 Got page ${pageNum} image: ${imageResponse.data.byteLength} bytes`);
                }

                // Convert image to base64 and OCR it
                const imageBuffer = Buffer.from(imageResponse.data);
                const base64Image = imageBuffer.toString('base64');
                
                const ocrText = await this.ocrPageImage(base64Image);
                if (ocrText && ocrText.trim().length > 100) {
                  extractedContent.push(`Page ${pageNum}: ${ocrText.trim().substring(0, 600)}...`);
                  if (this.config.verbose) {
                    console.log(`✅ OCR extracted ${ocrText.length} characters from page ${pageNum}`);
                  }
                  pageImageFound = true;
                  break; // Found content for this page, try next page
                }
              }
            } catch (urlError) {
              // Try next URL
              continue;
            }
          }

          // If we couldn't get the image, try text-based methods
          if (!pageImageFound) {
            const textUrls = [
              `https://archive.org/download/${identifier}/page/n${pageNum}.txt`,
              `https://${server}/BookReader/BookReaderGetTextWrapper.php?path=${dir}/${identifier}&page=${pageNum}`,
            ];

            for (const textUrl of textUrls) {
              try {
                const pageResponse = await axios.get(textUrl, { 
                  timeout: 5000,
                  headers: {
                    'User-Agent': 'BookExtractor/1.0 (Educational Research)'
                  }
                });

                if (pageResponse.data && typeof pageResponse.data === 'string') {
                  const cleanText = pageResponse.data.trim();
                  if (cleanText.length > 100 && !cleanText.includes('<!DOCTYPE') && !cleanText.includes('<html')) {
                    extractedContent.push(`Page ${pageNum}: ${cleanText.substring(0, 400)}...`);
                    if (this.config.verbose) {
                      console.log(`📄 Got BookReader text from page ${pageNum}: ${cleanText.length} chars`);
                    }
                    break; // Found content for this page, try next page
                  }
                }
              } catch (urlError) {
                // Try next URL
                continue;
              }
            }
          }

          // Stop if we have enough content
          if (extractedContent.length >= 3) break;

        } catch (pageError) {
          // Continue to next page
          continue;
        }
      }

      if (extractedContent.length > 0) {
        return `Preview content extracted from Archive.org pages for "${identifier}":

${extractedContent.join('\n\n')}

📖 Full book available at: https://archive.org/details/${identifier}
📄 This preview shows actual page content extracted from Archive.org's page images.

Note: This preview content was extracted by OCR from publicly accessible page images on Archive.org. Additional pages and the complete book may be available for borrowing through their digital lending system.`;
      }

      // Fallback: Try Archive.org's text layer extraction if available
      if (this.config.verbose) {
        console.log(`📄 Trying Archive.org text layer extraction for ${identifier}...`);
      }

      const textLayerUrl = `https://${server}/BookReader/BookReaderGetTextWrapper.php?path=${dir}/${identifier}`;
      try {
        const textResponse = await axios.get(textLayerUrl, { 
          timeout: 10000,
          headers: {
            'User-Agent': 'BookExtractor/1.0 (Educational Research)'
          }
        });

        if (textResponse.data && typeof textResponse.data === 'string') {
          const cleanText = textResponse.data.trim();
          if (cleanText.length > 200) {
            const previewText = cleanText.substring(0, 1000);
            return `Preview content from Archive.org text layer for "${identifier}":

${previewText}...

📖 Full book available at: https://archive.org/details/${identifier}
📄 This preview was extracted from Archive.org's text layer.

Note: This is a sample from the book's text layer. The complete book may be available for viewing or borrowing on Archive.org.`;
          }
        }
      } catch (textLayerError) {
        if (this.config.verbose) {
          console.log(`❌ Text layer extraction failed: ${textLayerError}`);
        }
      }

      return null;

    } catch (error) {
      if (this.config.verbose) {
        console.log(`❌ Archive.org BookReader API failed: ${error}`);
      }
      return null;
    }
  }

  /**
   * Detect which preview pages are actually available through Archive.org's BookReader
   */
  private async getAvailablePreviewPages(identifier: string, server: string, dir: string): Promise<number[]> {
    try {
      if (this.config.verbose) {
        console.log(`🔍 Detecting available preview pages for ${identifier}...`);
      }

      // Try to get BookReader configuration/preview info
      const bookReaderUrls = [
        `https://archive.org/services/bookreader/${identifier}`,
        `https://${server}/BookReader/BookReaderJSON.php?itemId=${identifier}`,
        `https://archive.org/details/${identifier}?output=json`
      ];

      for (const url of bookReaderUrls) {
        try {
          const response = await axios.get(url, { 
            timeout: 10000,
            headers: {
              'User-Agent': 'BookExtractor/1.0 (Educational Research)'
            }
          });

          if (response.data) {
            // Look for page information in the response
            let availablePages: number[] = [];
            
            // Check different possible structures in the response
            if (response.data.preview && response.data.preview.pages) {
              availablePages = response.data.preview.pages.map((p: any) => parseInt(p.pageNum || p.page || p));
            } else if (response.data.pages) {
              availablePages = response.data.pages.map((p: any) => parseInt(p.pageNum || p.page || p));
            } else if (response.data.previewpages) {
              availablePages = response.data.previewpages.map((p: any) => parseInt(p));
            }

            if (availablePages.length > 0) {
              if (this.config.verbose) {
                console.log(`✅ Found ${availablePages.length} preview pages from BookReader API`);
              }
              return availablePages.filter(p => !isNaN(p) && p > 0);
            }
          }
        } catch (urlError) {
          // Try next URL
          continue;
        }
      }

      // Fallback: Try to detect pages by testing common page numbers
      if (this.config.verbose) {
        console.log(`📄 Fallback: Testing common page numbers for preview availability...`);
      }

      const testPages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20];
      const availablePages: number[] = [];

      for (const pageNum of testPages) {
        try {
          // Test if page image is accessible
          const testUrl = `https://archive.org/services/img/${identifier}/page/n${pageNum}_w600.jpg`;
          
          const testResponse = await axios.head(testUrl, { 
            timeout: 5000,
            headers: {
              'User-Agent': 'BookExtractor/1.0 (Educational Research)'
            },
            validateStatus: (status) => status === 200
          });

          if (testResponse.status === 200) {
            availablePages.push(pageNum);
            if (this.config.verbose) {
              console.log(`✅ Page ${pageNum} is available`);
            }
          }
        } catch (error) {
          // Page not available, continue
          continue;
        }

        // Limit testing to avoid too many requests
        if (availablePages.length >= 8) break;
      }

      return availablePages;

    } catch (error) {
      if (this.config.verbose) {
        console.log(`❌ Could not detect available preview pages: ${error}`);
      }
      
      // Final fallback: return common page numbers
      return [1, 2, 3, 4, 5];
    }
  }

  /**
   * OCR a page image using GPT-4 Vision
   */
  private async ocrPageImage(base64Image: string): Promise<string | null> {
    try {
      const openaiApiKey = process.env.OPENAI_API_KEY;
      if (!openaiApiKey) {
        if (this.config.verbose) {
          console.log(`❌ OpenAI API key not available for OCR`);
        }
        return null;
      }

      if (this.config.verbose) {
        console.log(`🔍 Using GPT-4 Vision to extract text from page image...`);
      }

      const openaiUrl = 'https://api.openai.com/v1/chat/completions';
      const openaiRequest = {
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract all the readable text from this book page image. Return only the text content in reading order, without any commentary or analysis. If this appears to be a title page, include the title and author. If it's a content page, include all the readable text from that page."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                  detail: "high"
                }
              }
            ]
          }
        ],
        max_tokens: 1000,
        temperature: 0
      };

      const openaiResponse = await axios.post(openaiUrl, openaiRequest, {
        timeout: 30000,
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (openaiResponse.data?.choices?.[0]?.message?.content) {
        const extractedText = openaiResponse.data.choices[0].message.content.trim();
        if (this.config.verbose) {
          console.log(`✅ GPT-4 Vision extracted ${extractedText.length} characters from page image`);
        }
        return extractedText;
      }

      return null;

    } catch (error) {
      if (this.config.verbose) {
        console.log(`❌ GPT-4 Vision OCR failed: ${error}`);
      }
      return null;
    }
  }

  /**
   * Generate common text file patterns for Gutenberg books
   */
  private getGutenbergTextPatterns(identifier: string): string[] {
    const patterns: string[] = [];
    
    // Extract number from identifier (e.g., "malcolm07127gut" -> "07127")
    const numberMatch = identifier.match(/(\d+)/);
    if (numberMatch) {
      const number = numberMatch[1];
      // Common Gutenberg patterns
      patterns.push(
        `${identifier.replace(/gut$/, '')}.txt`,
        `${number}.txt`,
        `${number}-0.txt`,
        `${number}-8.txt`,
        `pg${number}.txt`
      );
    }
    
    return patterns;
  }

  /**
   * Find the best text file from Archive.org files list
   */
  private findBestArchiveTextFile(files: any[]): any | null {
    // Priority order: best text quality first
    const fileTypes = [
      { pattern: '_djvu.txt', weight: 10, isText: true },           // DjVu OCR (best quality)
      { pattern: '.txt', weight: 9, isText: true },                 // Plain text (often Gutenberg)
      { pattern: '_text.txt', weight: 8, isText: true },            // Alternative text format
      { pattern: '_abbyy.gz', weight: 7, isText: false },           // ABBYY OCR (compressed)
      { pattern: '_hocr_searchtext.txt.gz', weight: 6, isText: false }, // HOCR text (compressed)
      { pattern: '_text.pdf', weight: 5, isText: false }            // PDF text layer
    ];

    for (const fileType of fileTypes) {
      const file = files.find(f => 
        f.name && f.name.includes(fileType.pattern) && 
        f.size && parseInt(f.size) > 500 && // Lower threshold for text files
        f.source !== 'metadata' && // Skip metadata files
        f.format !== 'Metadata' // Also skip by format
      );
      
      if (file) {
        if (this.config.verbose) {
          console.log(`📄 Selected file: ${file.name} (${file.size} bytes, ${file.format || 'unknown format'})`);
        }
        return file;
      }
    }
    
    return null;
  }

  /**
   * Clean and normalize Archive.org text content
   */
  private cleanArchiveOrgText(text: string): string {
    return text
      .replace(/\f/g, '\n\n')                   // Form feed to paragraph break
      .replace(/\r\n/g, '\n')                   // Normalize line endings  
      .replace(/\n{3,}/g, '\n\n')               // Normalize multiple line breaks
      .replace(/^\s*Page \d+.*$/gm, '')         // Remove page headers
      .replace(/^\s*\d+\s*$/gm, '')             // Remove standalone page numbers
      .replace(/\[\d+\]/g, '')                  // Remove reference numbers
      .replace(/^.*OCR.*$/gm, '')               // Remove OCR notices
      .trim();
  }

  /**
   * Download and process text files from Archive.org (including compressed files)
   */
  private async downloadArchiveTextFile(identifier: string, file: any): Promise<string> {
    const downloadUrl = `https://archive.org/download/${identifier}/${file.name}`;
    
    if (this.config.verbose) {
      console.log(`📥 Downloading: ${downloadUrl}`);
    }

    // Handle different file types
    const isCompressed = file.name.endsWith('.gz') || file.format === 'Abbyy GZ';
    
    const response = await axios.get(downloadUrl, { 
      timeout: this.config.timeout,
      maxContentLength: 100 * 1024 * 1024, // 100MB limit
      maxRedirects: 5, // Follow redirects to actual file servers
      responseType: isCompressed ? 'arraybuffer' : 'text',
      headers: {
        'User-Agent': 'BookExtractor/1.0 (Educational Research)'
      }
    });

    let textContent = '';

    if (isCompressed) {
      try {
        // Handle compressed files
        const zlib = require('zlib');
        const decompressed = zlib.gunzipSync(Buffer.from(response.data));
        textContent = decompressed.toString('utf-8');
      } catch (error) {
        throw new Error(`Failed to decompress ${file.name}: ${error}`);
      }
    } else {
      textContent = response.data;
    }

    // Clean up common OCR artifacts and formatting issues
    textContent = textContent
      .replace(/\f/g, '\n\n') // Form feed to paragraph break
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\n{3,}/g, '\n\n') // Normalize multiple line breaks
      .replace(/^\s*Page \d+.*$/gm, '') // Remove page headers
      .replace(/^\s*\d+\s*$/gm, '') // Remove standalone page numbers
      .trim();

    if (this.config.verbose) {
      console.log(`✅ Successfully extracted ${textContent.length} characters from ${file.name}`);
    }

    return textContent;
  }

  /**
   * Extract content from Gutendex (Project Gutenberg)
   */
  private async extractFromGutendex(bookInfo: BookInfo, pageType: 'first-page' | 'second-page'): Promise<PageContent> {
    const searchUrl = 'https://gutendex.com/books';
    const searchParams = {
      search: `${bookInfo.title} ${bookInfo.author}`.trim()
    };

    const searchResponse = await axios.get(searchUrl, { params: searchParams, timeout: this.config.timeout });
    
    if (!searchResponse.data.results?.length) {
      throw new Error('Book not found on Project Gutenberg');
    }

    // Try to get text from the first result
    const book = searchResponse.data.results[0];
    const formats = book.formats || {};
    
    // Look for plain text format
    const textUrl = formats['text/plain'] || formats['text/html'];
    
    if (!textUrl) {
      throw new Error('No text format available on Project Gutenberg');
    }

    // Download the text content
    const textResponse = await axios.get(textUrl, { 
      timeout: this.config.timeout,
      responseType: 'text'
    });

    const fullText = textResponse.data;
    if (!fullText || fullText.length < 1000) {
      throw new Error('Text content too short or empty');
    }

    // Extract the appropriate page
    const extractedText = this.extractPageFromText(fullText, pageType, bookInfo.genre);
    
         return {
       text: extractedText,
       source: 'gutendex' as const,
       confidence: 95,
       isContentPage: true,
       pageType: 'content' as const
     };
  }

  /**
   * Extract content from OpenLibrary
   */
  private async extractFromOpenLibrary(bookInfo: BookInfo, pageType: 'first-page' | 'second-page'): Promise<PageContent> {
    if (!bookInfo.previewLink) {
      throw new Error('No OpenLibrary preview link available');
    }

    // Extract work ID from preview link
    const workId = bookInfo.previewLink.split('/').pop();
    if (!workId) {
      throw new Error('Invalid OpenLibrary preview link');
    }

         // Try to get book details and check for available formats
     const detailsUrl = `https://openlibrary.org/${workId}.json`;
     const detailsResponse = await axios.get(detailsUrl, { timeout: this.config.timeout });

    // Look for links to readable versions
    if (detailsResponse.data.links) {
      for (const link of detailsResponse.data.links) {
        if (link.title?.toLowerCase().includes('read') || 
            link.title?.toLowerCase().includes('text')) {
          // This is a simplified implementation - OpenLibrary's full text access
          // would require more complex parsing
          throw new Error('OpenLibrary full text extraction not yet implemented');
        }
      }
    }

    throw new Error('No readable text available from OpenLibrary');
  }

  /**
   * Extract content from Google Books (Note: Usually only provides descriptions/metadata for copyrighted books)
   */
  private async extractFromGoogleBooks(bookInfo: BookInfo, pageType: 'first-page' | 'second-page'): Promise<PageContent> {
    const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
    if (!apiKey) {
      throw new Error('Google Books API key not configured');
    }

    if (this.config.verbose) {
      console.log('🔍 Searching Google Books API...');
    }

    // Search for the book using Google Books API
    const searchUrl = 'https://www.googleapis.com/books/v1/volumes';
    const searchParams = {
      q: `intitle:"${bookInfo.title}" inauthor:"${bookInfo.author}"`,
      key: apiKey,
      maxResults: 5
    };

    const searchResponse = await axios.get(searchUrl, { 
      params: searchParams, 
      timeout: this.config.timeout 
    });

    if (!searchResponse.data.items?.length) {
      throw new Error('Book not found in Google Books');
    }

    // Get the best match
    const item = searchResponse.data.items[0];
    const volumeInfo = item.volumeInfo;
    const accessInfo = item.accessInfo;

    if (this.config.verbose) {
      console.log(`📖 Found: "${volumeInfo.title}" by ${volumeInfo.authors?.join(', ') || 'Unknown'}`);
      console.log(`📄 Access: ${accessInfo?.accessViewStatus || 'none'}`);
      console.log(`🔓 Public Domain: ${accessInfo?.publicDomain || false}`);
    }

    // Determine what type of content is available
    const isPublicDomain = accessInfo?.publicDomain || accessInfo?.accessViewStatus === 'FULL_PUBLIC_DOMAIN';
    const hasPreview = accessInfo?.accessViewStatus === 'SAMPLE' || volumeInfo.previewLink;
    
    let contentType: string;
    let confidence: number;
    let warning: string;

    if (isPublicDomain) {
      contentType = 'Public Domain Book (Description Only)';
      confidence = 70;
      warning = 'This book is in the public domain, but Google Books API only provides metadata. For full text, try Project Gutenberg or Internet Archive.';
    } else if (hasPreview) {
      contentType = 'Copyrighted Book (Limited Preview)';
      confidence = 60;
      warning = 'This is the book description only. The book has limited preview on Google Books, but actual page content is not accessible via API.';
    } else {
      contentType = 'Copyrighted Book (No Preview)';
      confidence = 50;
      warning = 'This is the book description only. No preview content is available for this copyrighted work.';
    }

    // Extract the description (this is typically all we can get)
    const description = volumeInfo.description;
    if (!description) {
      throw new Error('No description available for this book');
    }

    // Create informative content
    let extractedText = `[${contentType} - Google Books API]\n\n`;
    extractedText += `📚 Title: ${volumeInfo.title}\n`;
    extractedText += `✍️ Author(s): ${volumeInfo.authors?.join(', ') || 'Unknown'}\n`;
    extractedText += `📅 Published: ${volumeInfo.publishedDate || 'Unknown'}\n`;
    extractedText += `📄 Pages: ${volumeInfo.pageCount || 'Unknown'}\n`;
    extractedText += `🏷️ Categories: ${volumeInfo.categories?.join(', ') || 'Unknown'}\n\n`;
    
    extractedText += `📖 Description:\n`;
    extractedText += description.replace(/<[^>]*>/g, ''); // Remove HTML tags
    
    extractedText += `\n\n⚠️ Important: ${warning}`;

    if (this.config.verbose) {
      console.log(`✅ Extracted book description (${description.length} characters)`);
    }

    return {
      text: extractedText,
      source: 'google-books' as const,
      confidence: confidence,
      isContentPage: false, // This is NOT actual page content
      pageType: 'content' as const
    };
  }

  /**
   * Extract content from HathiTrust Digital Library
   */
  private async extractFromHathiTrust(bookInfo: BookInfo, pageType: 'first-page' | 'second-page'): Promise<PageContent> {
    if (this.config.verbose) {
      console.log(`🔍 Searching HathiTrust for: "${bookInfo.title}" by "${bookInfo.author}"`);
    }

    // Search HathiTrust API
    const searchUrl = 'https://catalog.hathitrust.org/api/volumes/brief/json';
    const searchQuery = `title:"${bookInfo.title}" AND author:"${bookInfo.author}"`;
    
    const searchParams = {
      q: searchQuery
    };

    const searchResponse = await axios.get(searchUrl, { 
      params: searchParams, 
      timeout: this.config.timeout,
      headers: {
        'User-Agent': 'BookExtractor/1.0 (Educational Research)'
      }
    });

    if (!searchResponse.data || Object.keys(searchResponse.data).length === 0) {
      throw new Error('Book not found on HathiTrust');
    }

    // Get the first result
    const htid = Object.keys(searchResponse.data)[0];
    const bookData = searchResponse.data[htid];

    if (this.config.verbose) {
      console.log(`📚 Found HathiTrust item: ${htid}`);
    }

    // Check access rights
    const items = bookData.items || [];
    let previewAvailable = false;
    let accessNote = '';

    for (const item of items) {
      if (item.us_access === 'allow' || item.us_access === 'preview') {
        previewAvailable = true;
        accessNote = item.us_access === 'allow' ? 'Full access available' : 'Preview access available';
        break;
      }
    }

    if (!previewAvailable) {
      throw new Error('No preview access available on HathiTrust');
    }

    // Try to get preview pages using HathiTrust's page access API
    const previewText = await this.getHathiTrustPreviewPages(htid, pageType);
    
    if (previewText) {
      if (this.config.verbose) {
        console.log(`✅ Successfully extracted preview from HathiTrust: ${previewText.length} characters`);
      }

      return {
        text: previewText,
        source: 'hathi-trust' as const,
        confidence: 85,
        isContentPage: true,
        pageType: 'content' as const
      };
    }

    // Fallback: provide access information
    let title = bookInfo.title;
    let author = bookInfo.author;
    
    if (bookData.records) {
      const recordKeys = Object.keys(bookData.records);
      if (recordKeys.length > 0) {
        const firstKey = recordKeys[0];
        const firstRecord = bookData.records[firstKey];
        if (firstRecord) {
          title = firstRecord.title || bookInfo.title;
          author = firstRecord.author || bookInfo.author;
        }
      }
    }

    const accessInfo = `"${title}" by ${author} is available on HathiTrust Digital Library.

📖 Access the book at: https://catalog.hathitrust.org/Record/${htid}
📄 ${accessNote}

Note: HathiTrust provides preview access for many books. You can view sample pages and may have access to more content depending on your institution's access rights.`;

    return {
      text: accessInfo,
      source: 'hathi-trust' as const,
      confidence: 75,
      isContentPage: false,
      pageType: 'unknown' as const
    };
  }

  /**
   * Get preview pages from HathiTrust
   */
  private async getHathiTrustPreviewPages(htid: string, pageType: 'first-page' | 'second-page'): Promise<string | null> {
    try {
      // HathiTrust doesn't have a public API for page content, but we can try their page access URLs
      // This is a simplified implementation - actual HathiTrust access requires proper authentication
      
      if (this.config.verbose) {
        console.log(`📄 Attempting to access HathiTrust preview pages for ${htid}...`);
      }

      // For now, return access information since HathiTrust preview requires special handling
      return null;

    } catch (error) {
      if (this.config.verbose) {
        console.log(`❌ HathiTrust page access failed: ${error}`);
      }
      return null;
    }
  }

  /**
   * Extract preview content from Google Books (NO descriptions, only actual preview pages)
   */
  private async extractFromGoogleBooksPreview(bookInfo: BookInfo, pageType: 'first-page' | 'second-page'): Promise<PageContent> {
    const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
    if (!apiKey) {
      throw new Error('Google Books API key not configured');
    }

    if (this.config.verbose) {
      console.log('🔍 Searching Google Books Preview API...');
    }

    // Search for the book using Google Books API
    const searchUrl = 'https://www.googleapis.com/books/v1/volumes';
    const searchParams = {
      q: `intitle:"${bookInfo.title}" inauthor:"${bookInfo.author}"`,
      key: apiKey,
      maxResults: 5
    };

    const searchResponse = await axios.get(searchUrl, { 
      params: searchParams, 
      timeout: this.config.timeout 
    });

    if (!searchResponse.data.items?.length) {
      throw new Error('Book not found in Google Books');
    }

    // Find a book with preview access
    let bestBook = null;
    for (const item of searchResponse.data.items) {
      const accessInfo = item.accessInfo;
      const volumeInfo = item.volumeInfo;
      
      // Look for books with preview access (not just metadata)
      if (accessInfo?.accessViewStatus === 'SAMPLE' || 
          accessInfo?.accessViewStatus === 'FULL_PUBLIC_DOMAIN' ||
          volumeInfo.previewLink) {
        bestBook = item;
        break;
      }
    }

    if (!bestBook) {
      throw new Error('No preview access available for this book in Google Books');
    }

    const volumeInfo = bestBook.volumeInfo;
    const accessInfo = bestBook.accessInfo;

    if (this.config.verbose) {
      console.log(`📖 Found preview: "${volumeInfo.title}" by ${volumeInfo.authors?.join(', ') || 'Unknown'}`);
      console.log(`📄 Access: ${accessInfo?.accessViewStatus || 'none'}`);
    }

    // Try to get actual preview content using volume ID
    const volumeId = bestBook.id;
    const previewContent = await this.getGoogleBooksPreviewContent(volumeId, apiKey, pageType);

    if (previewContent) {
      if (this.config.verbose) {
        console.log(`✅ Extracted preview content: ${previewContent.length} characters`);
      }

      return {
        text: previewContent,
        source: 'google-books-preview' as const,
        confidence: 80,
        isContentPage: true,
        pageType: 'content' as const
      };
    }

    // If we can't get preview content, provide access information (NO description)
    const isPublicDomain = accessInfo?.publicDomain || accessInfo?.accessViewStatus === 'FULL_PUBLIC_DOMAIN';
    
    let accessText = `"${volumeInfo.title}" by ${volumeInfo.authors?.join(', ') || 'Unknown'} has preview access on Google Books.\n\n`;
    
    if (volumeInfo.previewLink) {
      accessText += `📖 View preview at: ${volumeInfo.previewLink}\n`;
    }
    
    accessText += `📄 Access Level: ${accessInfo?.accessViewStatus || 'Unknown'}\n`;
    
    if (isPublicDomain) {
      accessText += `🔓 This book is in the public domain.\n`;
    }
    
    accessText += `\nNote: Preview pages are available but couldn't be extracted via API. Visit the preview link to read sample pages.`;

    return {
      text: accessText,
      source: 'google-books-preview' as const,
      confidence: 70,
      isContentPage: false,
      pageType: 'unknown' as const
    };
  }

  /**
   * Get actual preview content from Google Books
   */
  private async getGoogleBooksPreviewContent(volumeId: string, apiKey: string, pageType: 'first-page' | 'second-page'): Promise<string | null> {
    try {
      // Try to get layerInfo to find preview pages
      const layerUrl = `https://www.googleapis.com/books/v1/volumes/${volumeId}/layerInfo/search`;
      const layerParams = {
        key: apiKey,
        q: 'preview' // Search for preview content
      };

      if (this.config.verbose) {
        console.log(`🔍 Checking Google Books layers for ${volumeId}...`);
      }

      const layerResponse = await axios.get(layerUrl, { 
        params: layerParams, 
        timeout: this.config.timeout 
      });

      // Google Books API doesn't typically expose full page content via public API
      // This is a placeholder for more sophisticated preview extraction
      // In practice, you might need to use Google Books Embed Viewer or other methods

      if (this.config.verbose) {
        console.log(`❌ Google Books preview content extraction not fully implemented`);
      }

      return null;

    } catch (error) {
      if (this.config.verbose) {
        console.log(`❌ Google Books preview extraction failed: ${error}`);
      }
      return null;
    }
  }

  /**
   * Extract specific pages from full text based on genre and page type
   */
  private extractPageFromText(fullText: string, pageType: 'first-page' | 'second-page', genre?: string): string {
    // Clean the text and split into lines
    const lines = fullText
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    // Skip Project Gutenberg header if present
    let startIndex = 0;
    for (let i = 0; i < Math.min(50, lines.length); i++) {
      if (lines[i].includes('START OF THE PROJECT GUTENBERG') || 
          lines[i].includes('*** START OF') ||
          lines[i].match(/CHAPTER\s+(1|I|ONE)/i) ||
          lines[i].match(/^(1|I)\./)) {
        startIndex = i;
        break;
      }
    }

    // For fiction, we want the second page (skip the first page/chapter opening)
    // For non-fiction, we want the first page of actual content
    const targetPageIndex = (pageType === 'second-page' || genre === 'fiction') ? 1 : 0;
    
    // Find chapter/section breaks
    const sectionBreaks = [];
    for (let i = startIndex; i < lines.length; i++) {
      if (lines[i].match(/^(CHAPTER|Chapter|chapter)\s+/i) ||
          lines[i].match(/^\d+\./) ||
          lines[i].match(/^[IVX]+\./) ||
          (lines[i].length < 50 && lines[i].match(/^[A-Z\s]+$/))) {
        sectionBreaks.push(i);
      }
    }

    // If we don't have enough sections, just use paragraph breaks
    if (sectionBreaks.length < 2) {
      // Find substantial paragraph breaks
      for (let i = startIndex; i < lines.length - 1; i++) {
        if (lines[i].length < 10 && lines[i + 1].length > 50) {
          sectionBreaks.push(i + 1);
        }
      }
    }

    // Determine start and end of the page we want
    let pageStart = startIndex;
    let pageEnd = Math.min(startIndex + 50, lines.length); // Default to first 50 lines

    if (sectionBreaks.length > targetPageIndex) {
      pageStart = sectionBreaks[targetPageIndex];
      pageEnd = targetPageIndex + 1 < sectionBreaks.length ? 
                sectionBreaks[targetPageIndex + 1] : 
                Math.min(pageStart + 50, lines.length);
    }

    // Extract the page content
    const pageLines = lines.slice(pageStart, pageEnd);
    const pageText = pageLines.join('\n\n');

    // Ensure we have enough content
    if (pageText.length < 500) {
      // If the extracted section is too short, expand it
      const expandedEnd = Math.min(pageStart + 75, lines.length);
      return lines.slice(pageStart, expandedEnd).join('\n\n');
    }

    return pageText;
  }
} 