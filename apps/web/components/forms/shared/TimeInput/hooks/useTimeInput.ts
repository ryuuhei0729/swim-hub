'use client'

import { useCallback } from 'react'

export interface TimeInputHookReturn {
  /** MM:SS.ms または SS.ms 形式の文字列を秒数に変換 */
  parseTime: (timeString: string) => number
  /** 秒数を MM:SS.ms 形式にフォーマット */
  formatTime: (seconds: number) => string
  /** 秒数を短縮形式（分がない場合はSS.ms）にフォーマット */
  formatTimeShort: (seconds: number) => string
  /** 時間の妥当性を検証 */
  validateTime: (seconds: number) => boolean
}

/**
 * 時間入力に関するロジックを提供するカスタムフック
 *
 * @example
 * ```tsx
 * const { parseTime, formatTime, validateTime } = useTimeInput()
 *
 * // "1:30.50" -> 90.5 秒
 * const seconds = parseTime("1:30.50")
 *
 * // 90.5 秒 -> "1:30.50"
 * const formatted = formatTime(90.5)
 * ```
 */
export const useTimeInput = (): TimeInputHookReturn => {
  /**
   * MM:SS.ms または SS.ms 形式の文字列を秒数に変換
   * @param timeString - 時間文字列 ("1:30.50", "30.50", "30.50s" など)
   * @returns 秒数（無効な場合は0）
   */
  const parseTime = useCallback((timeString: string): number => {
    if (!timeString) return 0

    // "1:30.50" 形式 (MM:SS.ms)
    if (timeString.includes(':')) {
      const [minutes, seconds] = timeString.split(':')
      const parsedMinutes = parseInt(minutes, 10)
      const parsedSeconds = parseFloat(seconds)

      if (isNaN(parsedMinutes) || isNaN(parsedSeconds)) return 0
      return parsedMinutes * 60 + parsedSeconds
    }

    // "30.50s" 形式
    if (timeString.endsWith('s')) {
      const parsed = parseFloat(timeString.slice(0, -1))
      return isNaN(parsed) ? 0 : parsed
    }

    // 数値のみ
    const parsed = parseFloat(timeString)
    return isNaN(parsed) ? 0 : parsed
  }, [])

  /**
   * 秒数を MM:SS.ms 形式にフォーマット
   * @param seconds - 秒数
   * @returns フォーマットされた時間文字列
   */
  const formatTime = useCallback((seconds: number): string => {
    if (seconds === 0) return ''

    const min = Math.floor(seconds / 60)
    const sec = Math.floor(seconds % 60)
    const ms = Math.round((seconds % 1) * 100)

    return `${min}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }, [])

  /**
   * 秒数を短縮形式にフォーマット（分がない場合はSS.msのみ）
   * @param seconds - 秒数
   * @returns フォーマットされた時間文字列
   */
  const formatTimeShort = useCallback((seconds: number): string => {
    if (seconds === 0) return ''

    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60

    if (minutes > 0) {
      return `${minutes}:${remainingSeconds.toFixed(2).padStart(5, '0')}`
    }
    return remainingSeconds.toFixed(2)
  }, [])

  /**
   * 時間の妥当性を検証
   * @param seconds - 秒数
   * @returns 妥当な場合true
   */
  const validateTime = useCallback((seconds: number): boolean => {
    // 正の数かつ24時間以内
    return seconds > 0 && seconds < 86400
  }, [])

  return { parseTime, formatTime, formatTimeShort, validateTime }
}

export default useTimeInput
