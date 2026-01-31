'use client'

import {
  parseTime as sharedParseTime
} from '@apps/shared/utils/time'
import { validateTime as sharedValidateTime } from '@apps/shared/utils/validators'
import { useCallback } from 'react'

export interface TimeInputHookReturn {
  /** MM:SS.ms または SS.ms 形式の文字列を秒数に変換 */
  parseTime: (timeString: string) => number
  /** 秒数を MM:SS.ms 形式にフォーマット（入力用：2桁精度） */
  formatTime: (seconds: number) => string
  /** 秒数を短縮形式（分がない場合はSS.ms）にフォーマット（入力用：2桁精度） */
  formatTimeShort: (seconds: number) => string
  /** 時間の妥当性を検証 */
  validateTime: (seconds: number) => boolean
}

/**
 * 入力用フォーマット（小数第2位まで、常に分を表示）
 */
function formatTimeForInput(seconds: number): string {
  if (seconds === 0) return '0.00'
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00.00'

  const min = Math.floor(seconds / 60)
  const remainingSeconds = (seconds % 60).toFixed(2)

  return `${min}:${remainingSeconds.padStart(5, '0')}`
}

/**
 * 入力用短縮フォーマット（小数第2位まで、60秒未満は分なし）
 */
function formatTimeShortForInput(seconds: number): string {
  if (seconds === 0) return ''
  if (!Number.isFinite(seconds) || seconds < 0) return ''

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  if (minutes > 0) {
    return `${minutes}:${remainingSeconds.toFixed(2).padStart(5, '0')}`
  }
  return remainingSeconds.toFixed(2)
}

/**
 * 時間入力に関するロジックを提供するカスタムフック
 * 入力用に小数第2位までの精度でフォーマットします。
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
  const parseTime = useCallback((timeString: string): number => {
    return sharedParseTime(timeString)
  }, [])

  const formatTime = useCallback((seconds: number): string => {
    return formatTimeForInput(seconds)
  }, [])

  const formatTimeShort = useCallback((seconds: number): string => {
    return formatTimeShortForInput(seconds)
  }, [])

  const validateTime = useCallback((seconds: number): boolean => {
    return sharedValidateTime(seconds).valid
  }, [])

  return { parseTime, formatTime, formatTimeShort, validateTime }
}

export default useTimeInput
