// =============================================================================
// カレンダー記録色カスタマイズ 型定義 - Swim Hub共通パッケージ
// =============================================================================
// ダッシュボードの練習/大会アイテムの表示色を、個人設定・チーム別設定として
// ユーザーがカスタマイズできるようにするための型。
// 色の値はタグ機能と同一の10色パレット (apps/shared/constants/tagColors.ts)。
// =============================================================================

import { z } from "zod";
import { STORABLE_TAG_COLORS, TAG_COLORS } from "../constants/tagColors";

/** カレンダー記録色として選択可能な色（タグと同一パレット） */
export const PRESET_CALENDAR_COLORS = TAG_COLORS;

/** users テーブルの個人カレンダー記録色カラム */
export interface UserCalendarColors {
  personal_practice_color: string | null;
  personal_competition_color: string | null;
}

/** user_team_calendar_colors テーブルの1行分（チーム別カレンダー記録色） */
export interface TeamCalendarColors {
  team_id: string;
  practice_color: string | null;
  competition_color: string | null;
}

/** 色解決ロジック (calendarColorResolver) への入力型 */
export interface CalendarColorSettings {
  personal: {
    practice_color: string | null;
    competition_color: string | null;
  };
  byTeam: Record<
    string,
    {
      practice_color: string | null;
      competition_color: string | null;
    }
  >;
}

/**
 * カレンダー記録色の入力バリデーション。
 * パレット外の値 (自由入力の hex 等) を拒否する。null は「デフォルトに戻す」を表す。
 */
export const CalendarColorInputSchema = z.object({
  // 🚨 検証対象は **STORABLE_TAG_COLORS (選択肢8色 + 旧色)**。TAG_COLORS ではない。
  // 「変更しない側の色を既存値のまま再送する」保存実装のため、8色に絞ると
  // 旧色を保存済みのユーザーがもう片方の色を変更できなくなる (回復不能)。
  // 根拠の詳細は constants/tagColors.ts の STORABLE_TAG_COLORS を参照。
  // ピッカーが提示するのは引き続き TAG_COLORS の8色だけ。
  practice_color: z.enum(STORABLE_TAG_COLORS).nullable(),
  competition_color: z.enum(STORABLE_TAG_COLORS).nullable(),
});

export type CalendarColorInput = z.infer<typeof CalendarColorInputSchema>;
