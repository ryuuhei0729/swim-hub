/**
 * アカウント画面のローディングUI
 * PC は左にプロフィール + 一覧、右に詳細。SP は一覧だけを出す
 */
export default function AccountSkeleton() {
  return (
    <div className="px-3 sm:px-0 animate-pulse">
      <div className="mb-4 h-7 w-32 rounded bg-gray-200" />
      <div className="lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="space-y-4">
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <div className="mx-auto h-24 w-24 rounded-full bg-gray-200" />
            <div className="mx-auto mt-3 h-5 w-32 rounded bg-gray-200" />
            <div className="mx-auto mt-2 h-4 w-40 rounded bg-gray-200" />
            <div className="mt-4 h-9 rounded-lg bg-gray-200" />
          </div>
          <div className="h-12 rounded-xl bg-white shadow-sm" />
          <div className="h-36 rounded-xl bg-white shadow-sm" />
        </div>
        <div className="hidden lg:block space-y-4">
          <div className="h-6 w-40 rounded bg-gray-200" />
          <div className="h-64 rounded-lg bg-white shadow" />
        </div>
      </div>
    </div>
  );
}

