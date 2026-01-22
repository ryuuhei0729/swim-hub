import { useCallback } from 'react'
import { parseTimeStrict } from '@apps/shared/utils/time'
import { validateSwimTime, validateTimeString } from '@apps/shared/utils/validators'

/**
 * タイムバリデーションの結果型
 */
export interface ValidationResult {
  isValid: boolean
  error?: string
}

/**
 * エントリータイムのパース・バリデーションを提供するカスタムフック
 * 共通ユーティリティ関数をReactコンポーネント向けにラップします。
 *
 * TeamEntrySectionで使用
 */
export const useTimeValidation = () => {
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
    return parseTimeStrict(timeStr)
  }, [])

  /**
   * タイム文字列をバリデーションする
   *
   * @param timeStr タイム文字列
   * @returns バリデーション結果
   */
  const validateTime = useCallback((timeStr: string): ValidationResult => {
    // 空チェック
    const stringResult = validateTimeString(timeStr)
    if (!stringResult.valid) {
      return {
        isValid: false,
        error: stringResult.error
      }
    }

    // パースしてバリデーション
    const parsedTime = parseTimeStrict(timeStr)
    if (parsedTime === null) {
      return {
        isValid: false,
        error: 'タイムの形式が正しくありません（例: 1:23.45 または 23.45）'
      }
    }

    // 競泳タイムとしてのバリデーション（1時間以内）
    const swimResult = validateSwimTime(parsedTime)
    if (!swimResult.valid) {
      return {
        isValid: false,
        error: swimResult.error
      }
    }

    return {
      isValid: true
    }
  }, [])

  return {
    parseTime,
    validateTime
  }
}
