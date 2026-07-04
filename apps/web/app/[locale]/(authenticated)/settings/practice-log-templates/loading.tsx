export default function PracticeLogTemplatesLoading() {
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ヘッダースケルトン（lg以上） */}
      <div className="hidden lg:block bg-white rounded-lg shadow p-4 sm:p-6 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-200 rounded-md"></div>
          <div className="h-7 w-40 bg-gray-200 rounded"></div>
        </div>
      </div>

      {/* コンテンツカードスケルトン */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6 animate-pulse">
        {/* 件数表示スケルトン */}
        <div className="mb-6">
          <div className="h-4 w-24 bg-gray-200 rounded"></div>
        </div>

        {/* テンプレートカードスケルトン */}
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="h-5 w-32 bg-gray-200 rounded"></div>
                <div className="h-5 w-5 bg-gray-200 rounded"></div>
              </div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="h-6 w-16 bg-gray-200 rounded-full"></div>
                  <div className="h-6 w-20 bg-gray-200 rounded-full"></div>
                </div>
                <div className="h-4 w-48 bg-gray-200 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
