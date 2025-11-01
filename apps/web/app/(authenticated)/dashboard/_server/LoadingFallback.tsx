/**
 * Server Component用のローディングフォールバック
 * Suspense境界で使用する軽量なローディングUI
 */
export default function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[200px] bg-gray-50">
      <div className="animate-pulse">
        <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    </div>
  )
}

