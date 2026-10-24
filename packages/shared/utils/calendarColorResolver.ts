// =============================================================================
// カレンダー記録色 解決ロジック - Swim Hub共通パッケージ
// =============================================================================
// ダッシュボードカレンダーの各アイテム(練習/大会/エントリー/記録)の表示色を、
// ユーザーのカスタム設定から解決する。
//
// 優先順位:
//   1. team_id を持つアイテム(team_practice/team_competition、および
//      team_id 付きの entry/record): チーム別色 > 個人色 > デフォルト
//   2. team_id を持たない個人アイテム(practice/practice_log/competition、
//      および team_id なしの entry/record): 個人色 > デフォルト
//
// 団体/個人の判定は metadata.team_id の有無を正とする(entry/record も含む)。
// デフォルト色は既存 CalendarView の緑/青と同値で、未設定ユーザーの見た目を
// 変えない。
// =============================================================================

import type { CalendarItemType } from "../types/common";
import type { CalendarItem } from "../types/ui";
import type { CalendarColorSettings } from "../types/calendarColors";

/** 既存 CalendarView の緑色(bg-green-100 相当)。未設定時のデフォルト練習色。 */
export const DEFAULT_PRACTICE_COLOR = "#86EFAC";

/** 既存 CalendarView の青色(bg-blue-100 相当)。未設定時のデフォルト大会色。 */
export const DEFAULT_COMPETITION_COLOR = "#93C5FD";

type ColorCategory = "practice" | "competition";

/**
 * CalendarItemType を「練習系」「大会系」に分類する。
 * 未知の type は防御的に practice 扱いにフォールバックする(クラッシュしない)。
 */
function resolveCategory(type: CalendarItemType): ColorCategory {
  switch (type) {
    case "practice":
    case "team_practice":
    case "practice_log":
      return "practice";
    case "competition":
    case "team_competition":
    case "entry":
    case "record":
      return "competition";
    default:
      return "practice";
  }
}

/**
 * type からその項目カテゴリの「デフォルト色」を返す。
 * UI 層(CalendarGrid 等)が「resolver の戻り値がデフォルトのままか(=未カスタマイズ)」を
 * 判定して旧来の Tailwind クラス(ピクセル一致)にフォールバックする際に使う。
 */
export function getDefaultColorForType(type: CalendarItemType): string {
  return resolveCategory(type) === "practice" ? DEFAULT_PRACTICE_COLOR : DEFAULT_COMPETITION_COLOR;
}

export function resolveCalendarItemColor(
  type: CalendarItemType,
  metadata: CalendarItem["metadata"] | null | undefined,
  settings: CalendarColorSettings,
): string {
  const category = resolveCategory(type);
  const field: "practice_color" | "competition_color" =
    category === "practice" ? "practice_color" : "competition_color";
  const defaultColor =
    category === "practice" ? DEFAULT_PRACTICE_COLOR : DEFAULT_COMPETITION_COLOR;

  // 団体/個人の判定は metadata.team_id の有無を正とする。
  // 空文字・null・undefined はいずれも「個人アイテム」として扱う。
  const teamId = metadata?.team_id;
  const personalColor = settings?.personal?.[field] ?? null;

  if (teamId) {
    const teamColor = settings?.byTeam?.[teamId]?.[field] ?? null;
    if (teamColor) return teamColor;
    return personalColor ?? defaultColor;
  }

  return personalColor ?? defaultColor;
}
