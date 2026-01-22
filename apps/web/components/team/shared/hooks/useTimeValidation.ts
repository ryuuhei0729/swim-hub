import { useCallback } from 'react'

/**
 * タイムバリデーションの結果型
 */
export interface ValidationResult {
  isValid: boolean
  error?: string
}

/**
 * エントリータイムのパース・バリデーションを提供するカスタムフック
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
    if (!timeStr || timeStr.trim() === '') return null

    const trimmed = timeStr.trim()

    try {
      const parts = trimmed.split(':')
      // コロンが2つ以上ある場合は不正な形式（例: "1:2:3"）
      if (parts.length > 2) {
        return null
      }

      if (parts.length === 2) {
        // "MM:SS.ms" 形式
        const minutesStr = parts[0].trim()
        const secondsStr = parts[1].trim()

        const minutes = parseInt(minutesStr, 10)
        const seconds = parseFloat(secondsStr)

        // 両方の値が有効な数値であることを確認
        if (!Number.isFinite(minutes) || !Number.isFinite(seconds) ||
            Number.isNaN(minutes) || Number.isNaN(seconds) ||
            minutes < 0 || seconds < 0) {
          return null
        }

        return minutes * 60 + seconds
      } else {
        // "SS.ms" 形式
        const seconds = parseFloat(trimmed)

        // 単一の数値が有効であることを確認
        if (!Number.isFinite(seconds) || Number.isNaN(seconds) || seconds < 0) {
          return null
        }

        return seconds
      }
    } catch {
      return null
    }
  }, [])

  /**
   * タイム文字列をバリデーションする
   *
   * @param timeStr タイム文字列
   * @returns バリデーション結果
   */
  const validateTime = useCallback((timeStr: string): ValidationResult => {
    if (!timeStr || timeStr.trim() === '') {
      return {
        isValid: false,
        error: 'タイムを入力してください'
      }
    }

    const parsedTime = parseTime(timeStr)

    if (parsedTime === null) {
      return {
        isValid: false,
        error: 'タイムの形式が正しくありません（例: 1:23.45 または 23.45）'
      }
    }

    if (parsedTime <= 0) {
      return {
        isValid: false,
        error: 'タイムは0より大きい必要があります'
      }
    }

    // 妥当性チェック: 1時間以上は異常値
    if (parsedTime > 3600) {
      return {
        isValid: false,
        error: 'タイムが大きすぎます'
      }
    }

    return {
      isValid: true
    }
  }, [parseTime])

  return {
    parseTime,
    validateTime
  }
}
