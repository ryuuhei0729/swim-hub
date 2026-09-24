// =============================================================================
// rankBadgeColor - 順位バッジの配色 (フォルダ内共有)
// =============================================================================
//
// `RankingList.tsx` (個人種目) と `RelayRankingList.tsx` (リレー) は同じ順位バッジを
// 描くため、配色表をここ1箇所に置く。**片方だけ色を変えると個人種目タブとリレータブで
// 「1位」の色が食い違う** (ユーザーに見える破綻) ため、定義元を2つ持たない。
//
// 寸法 (バッジ幅・行の gap) は関心が違うので `./rowMetrics.ts` 側に置いてある。
// バレル (`./index.ts`) からは export しない (フォルダ内部品)。

interface RankBadgeColor {
  bg: string;
  text: string;
}

/** 表彰台 (1〜3位) だけ専用色。4位以下は DEFAULT_RANK_BADGE_COLOR */
const RANK_BADGE_COLORS: Record<number, RankBadgeColor> = {
  1: { bg: "#FEF3C7", text: "#92400E" },
  2: { bg: "#E5E7EB", text: "#374151" },
  3: { bg: "#FFEDD5", text: "#9A3412" },
};

const DEFAULT_RANK_BADGE_COLOR: RankBadgeColor = { bg: "#EFF6FF", text: "#1E40AF" };

/**
 * 順位に対応するバッジ配色。4位以下は表に載せていないので既定色にフォールバックする
 * (`??` は 4位以下で実際に発火する経路。既定色は「未設定」とは衝突しない)。
 */
export function getRankBadgeColor(rank: number): RankBadgeColor {
  return RANK_BADGE_COLORS[rank] ?? DEFAULT_RANK_BADGE_COLOR;
}
