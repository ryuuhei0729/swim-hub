import { useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  normalizeTimeSeparators,
  parseTime as parseRawTime,
  parseTimeStrict,
  TIME_FORMAT_REGEX,
} from "@apps/shared/utils/time";
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
   * 対応形式:
   * - "MM:SS.ms" (例: "1:23.45")
   * - "SS.ms" (例: "23.45")
   *
   * @param timeStr タイム文字列
   * @returns パースされた秒数、または無効な場合はnull
   */
  const parseTime = useCallback((timeStr: string): number | null => {
    return parseTimeStrict(timeStr);
  }, []);

  /**
   * タイム文字列をバリデーションする
   *
   * @param timeStr タイム文字列
   * @returns バリデーション結果
   */
  const validateTime = useCallback((timeStr: string): ValidationResult => {
    // 空チェック
    const stringResult = validateTimeString(timeStr);
    if (!stringResult.valid) {
      return {
        isValid: false,
        error: stringResult.error,
      };
    }

    // 形式チェック（"1.23.45" のような不正形式を弾く。全角区切りは ASCII に正規化して許容）
    const trimmed = normalizeTimeSeparators(timeStr.trim());
    if (!TIME_FORMAT_REGEX.test(trimmed)) {
      return {
        isValid: false,
        error: t("invalid"),
      };
    }

    // 形式は正しいので値域（0 より大きく1時間以内）を検証し、具体的なメッセージを返す
    const swimResult = validateSwimTime(parseRawTime(trimmed));
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
