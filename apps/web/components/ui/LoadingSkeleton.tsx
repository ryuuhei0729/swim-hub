/**
 * 共通スケルトンローディングコンポーネント
 * Next.js App Routerのloading.tsxで使用
 */

interface LoadingSkeletonProps {
  type?: 'page' | 'table' | 'card' | 'list'
  itemCount?: number
}

/**
 * ページ全体のスケルトン
 */
function PageSkeleton() {
  return (
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
  )
}

/**
 * テーブルのスケルトン
 */
function TableSkeleton({ itemCount = 5 }: { itemCount?: number }) {
  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-4 py-4 border-b border-gray-200">
        <div className="h-6 bg-gray-200 rounded w-1/4 animate-pulse"></div>
      </div>
      <div className="p-6">
        <div className="animate-pulse space-y-3">
          {Array.from({ length: itemCount }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * カードグリッドのスケルトン
 */
function CardSkeleton({ itemCount = 3 }: { itemCount?: number }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: itemCount }).map((_, i) => (
        <div key={i} className="bg-white rounded-lg shadow p-6">
          <div className="animate-pulse">
            <div className="h-10 w-10 bg-gray-200 rounded mb-4"></div>
            <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-full"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3 mt-2"></div>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * リストのスケルトン
 */
function ListSkeleton({ itemCount = 5 }: { itemCount?: number }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="animate-pulse space-y-3">
        {Array.from({ length: itemCount }).map((_, i) => (
          <div key={i} className="h-12 bg-gray-200 rounded"></div>
        ))}
      </div>
    </div>
  )
}

/**
 * 共通スケルトンローディングコンポーネント
 */
export default function LoadingSkeleton({ type = 'page', itemCount }: LoadingSkeletonProps) {
  switch (type) {
    case 'table':
      return <TableSkeleton itemCount={itemCount} />
    case 'card':
      return <CardSkeleton itemCount={itemCount} />
    case 'list':
      return <ListSkeleton itemCount={itemCount} />
    case 'page':
    default:
      return <PageSkeleton />
  }
}

/**
 * ヘッダースケルトン
 */
export function HeaderSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/3 mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
      </div>
    </div>
  )
}

/**
 * 統計情報カードのスケルトン
 */
export function StatsCardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-lg shadow p-6">
          <div className="animate-pulse">
            <div className="h-16 bg-gray-200 rounded"></div>
          </div>
        </div>
      ))}
    </div>
  )
}

