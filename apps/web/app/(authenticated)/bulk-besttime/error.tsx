'use client'

import { useEffect } from 'react'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

export default function BulkBestTimeError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('ベストタイム一括入力エラー:', error)
  }, [error])

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center space-x-3 mb-4">
          <ExclamationTriangleIcon className="h-8 w-8 text-red-500" />
          <h1 className="text-2xl font-bold text-gray-900">
            エラーが発生しました
          </h1>
        </div>
        <p className="text-gray-600 mb-4">
          ベストタイム一括入力ページの読み込み中にエラーが発生しました。
        </p>
        <div className="flex space-x-4">
          <button
            onClick={reset}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            再試行
          </button>
          <a
            href="/mypage"
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
          >
            マイページに戻る
          </a>
        </div>
      </div>
    </div>
  )
}

