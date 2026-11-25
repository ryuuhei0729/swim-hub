"use client";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p className="font-semibold">データを取得できませんでした</p>
      <p className="mt-1 break-all">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1 hover:bg-red-100"
      >
        再読み込み
      </button>
    </div>
  );
}
