'use client'

import React from 'react'

interface CopyrightPopupProps {
  isVisible: boolean
  onClose: () => void
  bookTitle: string
  bookAuthor: string
}

export default function CopyrightPopup({ isVisible, onClose, bookTitle, bookAuthor }: CopyrightPopupProps) {
  if (!isVisible) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Content */}
        <div className="text-center">
          {/* Icon */}
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-orange-100 mb-4">
            <svg className="h-6 w-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>

          {/* Title */}
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Book Not Available for Preview
          </h3>

          {/* Book info */}
          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-1">
              <span className="font-medium">{bookTitle}</span>
            </p>
            <p className="text-sm text-gray-500">
              by {bookAuthor}
            </p>
          </div>

          {/* Message */}
          <div className="text-sm text-gray-700 mb-6 space-y-2">
            <p>
              🔒 This book is <strong>copyrighted</strong> and has no preview available through Google Books.
            </p>
            <p className="text-gray-600">
              We can only extract content from books with available previews or public domain works.
            </p>
          </div>

          {/* Suggestions */}
          <div className="text-left mb-6">
            <p className="text-sm font-medium text-gray-900 mb-2">Try instead:</p>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Look for older books (public domain)</li>
              <li>• Search for books with "Preview available"</li>
              <li>• Check your local library's digital collection</li>
            </ul>
          </div>

          {/* Action button */}
          <button
            onClick={() => {
              // Simple solution: just reload the page
              window.location.reload()
            }}
            className="w-full btn-primary"
          >
            Try Another Book
          </button>
        </div>
      </div>
    </div>
  )
} 