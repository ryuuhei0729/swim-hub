import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { parseTimeFlexible } from "@apps/shared/utils/time";
import { validateSwimTime, validateTimeString } from "@apps/shared/utils/validators";

/**
 * タイムバリデーションの結果型
 */
export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * エントリータイムのパース・バリデーションを提供するカスタムフック
 * 共通ユーティリティ関数をReactコンポーネント向けにラップします。
 *
 * TeamEntrySectionで使用
 */
export const useTimeValidation = () => {
  const t = useTranslations("teams.timeValidation");
  /**
   * タイムをパースする
   *
   * 対応形式 (parseTimeFlexible):
   * - "MM:SS.ms" / "SS.ms" (例: "1:23.45", "23.45")
   * - クイック入力形式 = 数字の間を任意の非数字で区切る (例: "31-2", "1.23.45")
   *
   * @param timeStr タイム文字列
   * @returns パースされた秒数、または無効な場合はnull
   */
  const parseTime = useCallback((timeStr: string): number | null => {
    return parseTimeFlexible(timeStr);
  }, []);

  /**
   * タイム文字列をバリデーションする
   *
   * @param timeStr タイム文字列
   * @returns バリデーション結果
   */
  const validateTime = useCallback((timeStr: string): ValidationResult => {
    // 空チェック (validateTimeString の空エラーメッセージを流用。
    // 形式チェックは parseTimeFlexible に委譲するため、ここでは空のみ判定する)
    if (!timeStr || timeStr.trim() === "") {
      const stringResult = validateTimeString(timeStr);
      return {
        isValid: false,
        error: stringResult.error,
      };
    }

    // 形式チェック ("1.23.45" 等はクイック解釈で受理。解釈不能・0以下のみ弾く)
    const parsed = parseTimeFlexible(timeStr);
    if (parsed === null) {
      // 0 秒ちょうどの入力 ("0:00.00" 等) は形式として正しいため、
      // validateSwimTime の値域エラー ("0より大きい") を返す
      const zeroLike = /^[0:.\s]+$/.test(timeStr.trim());
      if (zeroLike) {
        const swimResult = validateSwimTime(0);
        if (!swimResult.valid) {
          return { isValid: false, error: swimResult.error };
        }
      }
      return {
        isValid: false,
        error: t("invalid"),
      };
    }

    // 値域（0 より大きく1時間以内）を検証し、具体的なメッセージを返す
    const swimResult = validateSwimTime(parsed);
    if (!swimResult.valid) {
      return {
        isValid: false,
        error: swimResult.error,
      };
    }

    return {
      isValid: true,
    };
  }, [t]);

  return {
    parseTime,
    validateTime,
  };
};
