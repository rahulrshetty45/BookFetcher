# BookFetcher Web Interface

A beautiful web interface for AI-powered book content extraction, designed with cal.com-inspired aesthetics.

## Features

- **Clean, Modern UI**: Inspired by cal.com's design language
- **Drag & Drop Upload**: Easy image upload with visual feedback
- **🤖 Live Browser Automation**: Watch AI navigate Archive.org and extract content from 4 book pages in real-time
- **AI-Powered Navigation**: Uses browser-use technology for autonomous web browsing
- **Real-time Processing**: Watch the AI extract content in real-time with live progress updates
- **Multiple Sources**: Extracts content from Archive.org, Google Books, and more
- **OCR Technology**: Uses GPT-4 Vision for high-quality text extraction
- **Smart Content Extraction**: AI autonomously opens book readers and extracts text from multiple pages

## Setup

1. **Install Dependencies**
```bash
npm install
```

2. **Environment Configuration**
Create a `.env.local` file in the root directory:
```
OPENAI_API_KEY=your_openai_api_key_here
```

3. **Setup Browser Automation** (Optional but recommended)
```bash
./setup_browser_automation.sh
```

4. **Build TypeScript**
```bash
npm run build
```

5. **Start Web Server**
```bash
npm run web
```

The web interface will be available at http://localhost:3000

## Usage

1. **Upload Book Cover**: Drag and drop or click to select a book cover image
2. **Extract Content**: Click "Extract Book Content" to start the AI processing
3. **Enable Browser Automation**: Click "Show Browser Automation" to watch AI navigate websites live
4. **Watch AI Browse**: See real-time AI navigation in the right panel as it searches and extracts content
5. **View Results**: See the extracted book information and content preview
6. **Try Another**: Click "Extract Another Book" to process a new image

### Browser Automation Features
- **Live Navigation**: Watch AI browse Archive.org in real-time
- **Progress Tracking**: See each automation step with status indicators
- **Content Extraction**: AI extracts text from 4 pages of the book
- **Error Handling**: Automatic fallbacks and retry mechanisms

## Supported Image Formats

- JPEG (.jpg, .jpeg)
- PNG (.png)
- GIF (.gif)
- WebP (.webp)

## Features

### Book Identification
- AI-powered book cover recognition
- Title and author extraction
- Genre classification

### Content Sources
- **Archive.org**: Preview pages with OCR extraction
- **Google Books**: Preview content
- **HathiTrust**: Digital library access
- **OpenLibrary**: Metadata and content

### Content Extraction
- Preview text from multiple pages
- Confidence scoring
- Source attribution
- Quality assessment

## Architecture

The web interface uses:
- **Next.js 14**: Modern React framework
- **Tailwind CSS**: Utility-first styling
- **TypeScript**: Type-safe development
- **OpenAI GPT-4**: Image analysis and OCR

## API Endpoints

### POST /api/extract
Extracts book content from uploaded image.

**Request:**
- `image`: File (book cover image)
- `pageType`: String (optional, default: "second-page")

**Response:**
```json
{
  "title": "Book Title",
  "author": "Author Name",
  "genre": "Fiction",
  "text": "Extracted content...",
  "source": "archive-org",
  "confidence": 90,
  "pageType": "content"
}
```

## Development

### CLI Commands
- `npm run build`: Build TypeScript
- `npm run web`: Start web server
- `npm run dev`: Watch TypeScript files
- `npm start`: Run CLI tool

### File Structure
```
app/
├── layout.tsx          # Root layout
├── page.tsx           # Main page
├── globals.css        # Global styles
└── api/
    └── extract/
        └── route.ts   # API endpoint

src/
└── core/              # Shared extraction logic
    ├── BookExtractor.ts
    ├── ImageValidator.ts
    ├── BookIdentifier.ts
    ├── ContentExtractor.ts
    └── GenreClassifier.ts
```

## Troubleshooting

### "OpenAI API key not configured"
- Ensure `.env.local` file exists with valid `OPENAI_API_KEY`
- Restart the web server after adding the key

### "Image does not contain a clear book cover"
- Ensure image shows a clear, front-facing book cover
- Title and author should be readable
- Avoid blurry, tilted, or spine-view images

### "Failed to extract content"
- Check internet connection for source access
- Some copyrighted books may have limited preview access
- Try different books or sources

## Production Deployment

1. Build the application:
```bash
npm run build:web
```

2. Set environment variables on your hosting platform
3. Deploy using your preferred hosting service (Vercel, Netlify, etc.)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - See LICENSE file for details 