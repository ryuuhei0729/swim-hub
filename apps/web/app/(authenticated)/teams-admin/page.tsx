import React, { Suspense } from 'react'
import AdminTeamsDataLoader from './_server/AdminTeamsDataLoader'

/**
 * 動的レンダリングを強制（認証が必要なページのため）
 */
export const dynamic = 'force-dynamic'

/**
 * 管理者チーム一覧ページ（Server Component）
 * データ取得はサーバー側で並行実行される
 */
export default async function AdminTeamsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50">
          <div className="p-6 space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="animate-pulse">
                <div className="h-8 bg-gray-200 rounded w-1/3 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <AdminTeamsDataLoader />
    </Suspense>
  )
}


