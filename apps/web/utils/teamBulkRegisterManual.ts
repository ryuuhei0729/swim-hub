// =============================================================================
// チーム一括登録「手動入力モード」ロジック (Sprint Contract D6)
// =============================================================================
//
// UI 本体 (components/team/TeamBulkRegister.tsx) からレンダリングせずに
// 境界値・異常系をユニットテストできるよう、バリデーション/変換ロジックを
// 純粋関数として切り出したモジュール。手本は mobile
// components/teams/TeamBulkRegisterForm.tsx。変換結果は共有 API
// (@apps/shared/api/teams/bulkRegister) の TeamBulkRegisterAPI.bulkRegister に
// そのまま渡せる BulkRegisterInput 形式。

import type { BulkRegisterInput } from "@apps/shared/api/teams/bulkRegister";

export interface PracticeRow {
  date: string;
  title: string;
  place: string;
  note: string;
}

export interface CompetitionRow {
  date: string;
  endDate: string;
  title: string;
  place: string;
  poolType: 0 | 1; // 0: 短水路(25m), 1: 長水路(50m)
  note: string;
}

export type ManualMode = "practice" | "competition";

/**
 * 行番号付きのエラーメッセージを組み立てる翻訳関数。
 * UI からは next-intl の t を束ねて渡す。未指定時は日本語の既定文言を返すため、
 * ユニットテストは翻訳器なしで検証できる。
 */
export type ManualErrorTranslator = (
  key: "dateRequired" | "startDateRequired" | "endDateAfterStart",
  row: number,
) => string;

const defaultErrorMessage: ManualErrorTranslator = (key, row) => {
  switch (key) {
    case "dateRequired":
      return `${row}行目: 日付は必須です`;
    case "startDateRequired":
      return `${row}行目: 開始日は必須です`;
    case "endDateAfterStart":
      return `${row}行目: 終了日は開始日以降にしてください`;
  }
};

/** 前後空白を除去し、空文字は null に変換する (API の Insert 型と整合) */
const trimToNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export function validatePracticeRows(
  rows: PracticeRow[],
  t: ManualErrorTranslator = defaultErrorMessage,
): string[] {
  const errors: string[] = [];
  rows.forEach((row, idx) => {
    if (!row.date.trim()) {
      errors.push(t("dateRequired", idx + 1));
    }
  });
  return errors;
}

export function validateCompetitionRows(
  rows: CompetitionRow[],
  t: ManualErrorTranslator = defaultErrorMessage,
): string[] {
  const errors: string[] = [];
  rows.forEach((row, idx) => {
    if (!row.date.trim()) {
      errors.push(t("startDateRequired", idx + 1));
    }
    // 同日 (endDate === date) は単日境界として許容。endDate が date より前のときのみエラー。
    if (row.endDate.trim() && row.endDate.trim() < row.date.trim()) {
      errors.push(t("endDateAfterStart", idx + 1));
    }
  });
  return errors;
}

/**
 * 手動入力の行データを TeamBulkRegisterAPI.bulkRegister に渡せる形へ変換する。
 * - 現在のモードに応じて、他方は常に空配列にする
 * - date が空文字の行は送信対象から除外する
 * - 各フィールドは trim し、空文字は null に変換する
 * - poolType は 0/1 のまま pool_type に渡す (数値変換・丸めをしない)
 */
export function buildManualBulkRegisterInput(
  mode: ManualMode,
  practiceRows: PracticeRow[],
  competitionRows: CompetitionRow[],
): BulkRegisterInput {
  const practices =
    mode === "practice"
      ? practiceRows
          .filter((row) => row.date.trim())
          .map((row) => ({
            date: row.date.trim(),
            title: trimToNull(row.title),
            place: trimToNull(row.place),
            note: trimToNull(row.note),
          }))
      : [];

  const competitions =
    mode === "competition"
      ? competitionRows
          .filter((row) => row.date.trim())
          .map((row) => ({
            date: row.date.trim(),
            end_date: trimToNull(row.endDate),
            title: trimToNull(row.title),
            place: trimToNull(row.place),
            pool_type: row.poolType,
            note: trimToNull(row.note),
          }))
      : [];

  return { practices, competitions };
}
