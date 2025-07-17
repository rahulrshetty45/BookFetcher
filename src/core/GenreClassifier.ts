import { OpenAI } from 'openai';
import { BookInfo, ExtractorConfig } from '../types';

export class GenreClassifier {
  private openai: OpenAI;
  private config: ExtractorConfig;

  constructor(openai: OpenAI, config: ExtractorConfig) {
    this.openai = openai;
    this.config = config;
  }

  /**
   * Classify a book as fiction or non-fiction using AI
   */
  async classify(bookInfo: BookInfo): Promise<'fiction' | 'non-fiction'> {
    // If we already have a confident genre classification, use it
    if (bookInfo.genre && bookInfo.genre !== 'unknown') {
      if (this.config.verbose) {
        console.log(`📚 Using existing genre classification: ${bookInfo.genre}`);
      }
      return bookInfo.genre;
    }

    // Use AI to classify based on title, author, and description
    try {
      const classification = await this.classifyWithAI(bookInfo);
      
      if (this.config.verbose) {
        console.log(`🤖 AI classified as: ${classification}`);
      }
      
      return classification;
    } catch (error) {
      if (this.config.verbose) {
        console.log(`❌ AI classification failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Fallback to rule-based classification
      return this.classifyWithRules(bookInfo);
    }
  }

  /**
   * Use OpenAI to classify the book genre
   */
  private async classifyWithAI(bookInfo: BookInfo): Promise<'fiction' | 'non-fiction'> {
    const prompt = `Classify this book as either "fiction" or "non-fiction" based on the provided information.

Book Information:
- Title: ${bookInfo.title}
- Author: ${bookInfo.author}
- Publisher: ${bookInfo.publisher || 'Unknown'}
- Description: ${bookInfo.description || 'No description available'}

Classification Guidelines:
- Fiction: novels, stories, poetry, plays, fantasy, science fiction, romance, mystery, thrillers
- Non-fiction: biography, autobiography, history, science, business, self-help, reference, textbooks, how-to guides, memoirs, true stories

Respond with ONLY one word: "fiction" or "non-fiction"`;

    const response = await this.openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a librarian expert at classifying books. Always respond with exactly one word: either 'fiction' or 'non-fiction'."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 10,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content?.toLowerCase().trim();
    
    if (content === 'fiction') {
      return 'fiction';
    } else if (content === 'non-fiction') {
      return 'non-fiction';
    } else {
      throw new Error(`Unexpected AI response: ${content}`);
    }
  }

  /**
   * Fallback rule-based classification
   */
  private classifyWithRules(bookInfo: BookInfo): 'fiction' | 'non-fiction' {
    const title = bookInfo.title.toLowerCase();
    const author = bookInfo.author.toLowerCase();
    const description = (bookInfo.description || '').toLowerCase();
    
    const allText = `${title} ${author} ${description}`;

    // Fiction indicators
    const fictionKeywords = [
      'novel', 'story', 'tales', 'romance', 'mystery', 'thriller', 'fantasy',
      'science fiction', 'adventure', 'drama', 'poetry', 'poems', 'fiction'
    ];

    // Non-fiction indicators
    const nonFictionKeywords = [
      'biography', 'autobiography', 'memoir', 'history', 'science', 'business',
      'self-help', 'how to', 'guide', 'manual', 'reference', 'textbook',
      'encyclopedia', 'dictionary', 'cookbook', 'travel', 'health', 'finance',
      'psychology', 'philosophy', 'religion', 'politics', 'economics'
    ];

    // Author-based classification (common patterns)
    const nonFictionAuthors = [
      'dr.', 'prof.', 'professor', 'phd', 'm.d.', 'md'
    ];

    // Check for strong non-fiction indicators first
    for (const keyword of nonFictionKeywords) {
      if (allText.includes(keyword)) {
        if (this.config.verbose) {
          console.log(`📖 Rule-based classification: non-fiction (found "${keyword}")`);
        }
        return 'non-fiction';
      }
    }

    // Check for author titles indicating non-fiction
    for (const authorTitle of nonFictionAuthors) {
      if (author.includes(authorTitle)) {
        if (this.config.verbose) {
          console.log(`👨‍🔬 Rule-based classification: non-fiction (author title "${authorTitle}")`);
        }
        return 'non-fiction';
      }
    }

    // Check for fiction indicators
    for (const keyword of fictionKeywords) {
      if (allText.includes(keyword)) {
        if (this.config.verbose) {
          console.log(`📚 Rule-based classification: fiction (found "${keyword}")`);
        }
        return 'fiction';
      }
    }

    // Default fallback: if uncertain, lean towards non-fiction for first page extraction
    if (this.config.verbose) {
      console.log('❓ Rule-based classification: defaulting to non-fiction (uncertain)');
    }
    return 'non-fiction';
  }
} 