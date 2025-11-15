import { Suspense } from 'react'
import DashboardDataLoader from './_server/DashboardDataLoader'
import LoadingFallback from './_server/LoadingFallback'

/**
 * ダッシュボードページ（Server Component）
 * データ取得をサーバー側で実行し、Client Componentに渡す
 * 
 * パフォーマンス最適化:
 * - すべてのデータ取得を並行実行（Waterfall問題の解消）
 * - Suspenseによる段階的なストリーミング
 */
export default async function DashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* すべてのデータ取得を並行実行 */}
      <Suspense fallback={<LoadingFallback />}>
        <DashboardDataLoader />
      </Suspense>
    </div>
  )
}
