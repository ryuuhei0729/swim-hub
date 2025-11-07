/**
 * ダッシュボードローディングUI
 * Next.js App Routerで自動的に表示される
 */
export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-4 space-y-4">
        {/* チームお知らせセクションのスケルトン */}
        <div className="bg-white rounded-lg shadow animate-pulse">
          <div className="px-4 py-4">
            <div className="h-6 bg-gray-200 rounded w-1/3 mb-3"></div>
            <div className="border-t border-gray-200 pt-4 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-full"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            </div>
          </div>
        </div>

        {/* カレンダーのスケルトン */}
        <div className="bg-white rounded-lg shadow p-4">
          {/* カレンダーヘッダー */}
          <div className="flex justify-between items-center mb-4">
            <div className="h-8 bg-gray-200 rounded w-32 animate-pulse"></div>
            <div className="flex gap-2">
              <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
            </div>
          </div>

          {/* 曜日ヘッダー */}
          <div className="grid grid-cols-7 gap-2 mb-2">
            {['日', '月', '火', '水', '木', '金', '土'].map((day) => (
              <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
                {day}
              </div>
            ))}
          </div>

          {/* カレンダーグリッド */}
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 35 }).map((_, i) => (
              <div
                key={i}
                className="h-24 bg-gray-100 rounded-lg animate-pulse border border-gray-200"
              >
                <div className="p-2">
                  {/* 日付番号 */}
                  <div className="h-4 w-6 bg-gray-200 rounded mb-1"></div>
                  {/* エントリー */}
                  <div className="space-y-1">
                    <div className="h-3 bg-gray-200 rounded w-full"></div>
                    <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

