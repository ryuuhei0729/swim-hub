/**
 * チームページローディングUI
 * Next.js App Routerで自動的に表示される
 */
export default function TeamsLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 space-y-6">
        {/* ヘッダーのスケルトン */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>

        {/* チームカードのスケルトン */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
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
      </div>
    </div>
  )
}

