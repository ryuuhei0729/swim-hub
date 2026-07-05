import type { ShareBadgeState } from "./utils";

/**
 * 自己ベストバッジ（シェアカード・大会記録詳細で共用）。
 * - first: 「初」(amber)
 * - best (±0含む): 「自己ベスト」+ 差分 (blue)
 * - slower: 「自己ベスト」+ 差分 (red)
 * - none: 非表示
 */
export function BestBadge({ state }: { state: ShareBadgeState }) {
  if (state.kind === "none") return null;

  if (state.kind === "first") {
    return (
      <div className="bg-amber-50 rounded-lg px-4 py-2 text-center shrink-0">
        <p className="text-amber-600 text-lg font-bold">初</p>
      </div>
    );
  }

  const boxCls = state.kind === "best" ? "bg-blue-50" : "bg-red-50";
  const valCls = state.kind === "best" ? "text-blue-600" : "text-red-600";
  return (
    <div className={`${boxCls} rounded-lg px-4 py-2 text-center shrink-0`}>
      <p className="text-gray-500 text-xs">自己ベスト</p>
      <p className={`${valCls} text-lg font-bold`}>{state.label}</p>
    </div>
  );
}
