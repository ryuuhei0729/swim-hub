import { Suspense } from 'react'
import BulkBestTimeClient from './_client/BulkBestTimeClient'

export const metadata = {
  title: 'ベストタイム一括入力 | SwimHub',
  description: 'Excelファイルを使用してベストタイムを一括で登録できます',
}

export default function BulkBestTimePage() {
  return (
    <Suspense fallback={<BulkBestTimeLoading />}>
      <BulkBestTimeClient />
    </Suspense>
  )
}

function BulkBestTimeLoading() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/4"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-10 bg-gray-200 rounded w-48"></div>
        </div>
      </div>
    </div>
  )
}

