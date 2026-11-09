/**
 * お知らせ本文の切り詰め判定に関する純関数群。
 * `onTextLayout` で得られる実測行数から、トグル表示の可否・
 * `numberOfLines` の値・展開状態の遷移を導出する。
 *
 * `AnnouncementItem` (components/dashboard/DashboardNoticesSection.tsx) から
 * 呼び出される想定。RN/DOM に依存しないため単体テスト可能。
 */

interface ResolveIsTruncatedParams {
  measuredLines: number;
  maxLines: number;
  wasTruncated: boolean;
}

/**
 * 実測行数と上限行数から truncated 状態を解決する。
 * 一度 true になった場合、以降の再計測で false に戻らないよう
 * これまでの検出結果 (wasTruncated) との OR を取る。
 */
export function resolveIsTruncated({
  measuredLines,
  maxLines,
  wasTruncated,
}: ResolveIsTruncatedParams): boolean {
  return wasTruncated || measuredLines > maxLines;
}

interface ResolveNumberOfLinesParams {
  isExpanded: boolean;
  maxLines: number;
}

/**
 * 展開状態に応じて Text コンポーネントに渡す numberOfLines を解決する。
 * 展開時は undefined (全文表示)、折りたたみ時は maxLines。
 */
export function resolveNumberOfLines({
  isExpanded,
  maxLines,
}: ResolveNumberOfLinesParams): number | undefined {
  return isExpanded ? undefined : maxLines;
}
