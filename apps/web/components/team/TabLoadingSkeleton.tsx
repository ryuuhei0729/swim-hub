import React from "react";

/**
 * タブ本文の遅延読み込み中に出すスケルトン。
 *
 * 🚨 **見た目のためだけの部品ではない。`dynamic()` の `loading` に渡すことが本体。**
 *
 * `next/dynamic` は `dynamic(() => import(...))` のようにオプション無しで呼ぶと
 * **Suspense 境界を作らない**。実装 (next/dist/shared/lib/lazy-dynamic/loadable.js) は
 *
 *     const defaultOptions = { loading: null, ssr: true };
 *     const hasSuspenseBoundary = !opts.ssr || !!opts.loading;   // → false
 *     const Wrap = hasSuspenseBoundary ? Suspense : Fragment;    // → Fragment
 *
 * となっており、`loading` を渡して初めて `Suspense` でラップされる。
 *
 * 境界が無いと、未ロードのタブを初めて押したときのサスペンドが
 * **`teams/[teamId]/page.tsx` の `<Suspense>` (クライアントより上) まで伝播**する。
 * React は隠したツリーの effect を破棄するため、`TeamDetailClient` の
 * `useEffect(..., [reset])` の cleanup が走って **Zustand ストアが初期化され、
 * 押したタブが既定値 (出欠) に戻る**。2回目はチャンクがキャッシュ済みで
 * サスペンドしないので効く ＝「初回クリックだけ飲まれる」症状になる。
 *
 * よって **`loading` を外すとバグが再発する。「不要なスケルトン」として消さないこと。**
 * (QA の対照実験: `loading` 有り 2/2 成功 / 無し 3/3 失敗)
 *
 * 呼び出し側の `<div className="bg-white rounded-lg shadow">` の内側に入るため、
 * ここではカードの装飾を持たず余白と中身だけを描く。
 */
export default function TabLoadingSkeleton() {
  return (
    <div className="p-4 sm:p-6" data-testid="team-tab-loading" aria-hidden="true">
      <div className="animate-pulse space-y-4">
        <div className="h-6 w-1/3 bg-gray-200 rounded" />
        <div className="space-y-3">
          <div className="h-16 bg-gray-100 rounded" />
          <div className="h-16 bg-gray-100 rounded" />
          <div className="h-16 bg-gray-100 rounded" />
        </div>
      </div>
    </div>
  );
}
