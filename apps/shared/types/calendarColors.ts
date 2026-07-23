// =============================================================================
// カレンダー記録色カスタマイズ 型定義 - Swim Hub共通パッケージ
// =============================================================================
// ダッシュボードの練習/大会アイテムの表示色を、個人設定・チーム別設定として
// ユーザーがカスタマイズできるようにするための型。
// 色の値はタグ機能と同一の10色パレット (apps/shared/constants/tagColors.ts)。
// =============================================================================

import { z } from "zod";
import { TAG_COLORS } from "../constants/tagColors";

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
  practice_color: z.enum(TAG_COLORS).nullable(),
  competition_color: z.enum(TAG_COLORS).nullable(),
});

export type CalendarColorInput = z.infer<typeof CalendarColorInputSchema>;
