'use client'

import {
  formatTimeFull,
  formatTimeShort as sharedFormatTimeShort,
  parseTime as sharedParseTime
} from '@apps/shared/utils/time'
import { validateTime as sharedValidateTime } from '@apps/shared/utils/validators'
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
 * 共通ユーティリティ関数をReactコンポーネント向けにラップします。
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
    if (seconds === 0) return '0.00'
    return formatTimeFull(seconds)
  }, [])

  const formatTimeShort = useCallback((seconds: number): string => {
    return sharedFormatTimeShort(seconds)
  }, [])

  const validateTime = useCallback((seconds: number): boolean => {
    return sharedValidateTime(seconds).valid
  }, [])

  return { parseTime, formatTime, formatTimeShort, validateTime }
}

export default useTimeInput
