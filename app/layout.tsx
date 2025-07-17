import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'BookFetcher | AI Book Content Extraction',
  description: 'Extract book content from cover images using AI',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} h-full bg-gray-50 antialiased`}>
        <div className="min-h-full">
          <nav className="bg-white shadow-sm border-b border-gray-200">
            <div className="px-4">
              <div className="flex justify-start h-16">
                <div className="flex items-center">
                  <h1 className="text-xl font-semibold text-gray-900">
                    BookFetcher
                  </h1>
                </div>
              </div>
            </div>
          </nav>
          <main className="flex-1">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
} 