import React, { Suspense } from 'react'
import RecordDataLoader from './_server/RecordDataLoader'

interface RecordPageProps {
  params: Promise<{ teamId: string; competitionId: string }>
}

/**
 * チーム大会Record代理入力ページ（Server Component）
 * adminがチームメンバーのRecord/split_timeを代理入力する
 */
export default async function RecordPage({ params }: RecordPageProps) {
  const { teamId, competitionId } = await params

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50">
          <div className="p-6 space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="animate-pulse">
                <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-2/3"></div>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <RecordDataLoader teamId={teamId} competitionId={competitionId} />
    </Suspense>
  )
}

