/**
 * 大会エントリー代理入力ページのローディングUI
 *
 * ページ側にも同じ形の Suspense があるが、ページ本体が params を待つ間や
 * 大会名を引くメタデータ取得の間は、親 (チーム詳細) のスケルトンが出てしまう。
 * 遷移した瞬間からこのページの形で表示する。
 */
export default function CompetitionEntriesLoading() {
  return (
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
  );
}
