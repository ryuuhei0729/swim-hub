'use client'

import React from 'react'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function MembersError({ error, reset }: ErrorProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
            <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            エラーが発生しました
          </h2>
          <p className="text-gray-600 mb-6">
            メンバーデータの読み込み中に問題が発生しました。
          </p>
          {process.env.NODE_ENV === 'development' && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg text-left">
              <p className="text-sm font-mono text-red-600 break-all">
                {error.message || '不明なエラー'}
              </p>
              {error.digest && (
                <p className="text-xs text-gray-500 mt-2">
                  Error ID: {error.digest}
                </p>
              )}
            </div>
          )}
          <div className="flex gap-3 justify-center">
            <button
              onClick={reset}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              再試行
            </button>
            <button
              onClick={() => window.location.href = '/members'}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
            >
              ページを再読み込み
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
