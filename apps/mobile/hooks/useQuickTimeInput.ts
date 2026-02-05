'use client'

import { useCallback, useState } from 'react'
import {
  parseQuickTime,
  isQuickTimeFormat,
  defaultQuickTimeContext,
  QuickTimeContext
} from '@apps/shared/utils/quickTimeParser'
import { parseTime, formatTimeShort } from '@apps/shared/utils/time'

export interface UseQuickTimeInputReturn {
  /**
   * 入力文字列をパースし、コンテキストを更新
   * クイック形式でない場合は従来のparseTimeにフォールバック
   */
  parseInput: (input: string) => { time: number; displayValue: string }
  /**
   * 現在のコンテキストを取得
   */
  getContext: () => QuickTimeContext
  /**
   * コンテキストをリセット（セット変更時など）
   */
  resetContext: () => void
  /**
   * コンテキストを手動設定
   */
  setContext: (context: QuickTimeContext) => void
  /**
   * 入力がクイック形式かどうか判定
   */
  isQuickFormat: (input: string) => boolean
}

/**
 * クイックタイム入力用カスタムフック
 *
 * 使用例:
 * ```tsx
 * const { parseInput, resetContext } = useQuickTimeInput()
 *
 * const handleTimeConfirm = (value: string) => {
 *   const { time, displayValue } = parseInput(value)
 *   setTime(time)
 *   setDisplayValue(displayValue)
 * }
 *
 * // セット変更時
 * useEffect(() => {
 *   resetContext()
 * }, [currentSet])
 * ```
 */
export function useQuickTimeInput(): UseQuickTimeInputReturn {
  const [context, setContextState] = useState<QuickTimeContext>(defaultQuickTimeContext)

  const parseInput = useCallback((input: string): { time: number; displayValue: string } => {
    if (!input || input.trim() === '') {
      return { time: 0, displayValue: '' }
    }

    // クイック形式を試す
    const quickResult = parseQuickTime(input, context)

    if (quickResult) {
      // コンテキストを更新
      setContextState(quickResult.context)
      return {
        time: quickResult.time,
        displayValue: quickResult.displayValue
      }
    }

    // フォールバック: 従来のparseTime
    const time = parseTime(input)
    const displayValue = time > 0 ? formatTimeShort(time) : input

    // 従来形式でもコンテキストを更新（秒の十の位を記憶）
    if (time > 0) {
      const totalSeconds = Math.floor(time)
      const seconds = totalSeconds % 60
      const minutes = Math.floor(totalSeconds / 60)
      const tensDigit = Math.floor(seconds / 10)
      setContextState({ minutes, tensDigit })
    }

    return { time, displayValue }
  }, [context])

  const getContext = useCallback((): QuickTimeContext => {
    return context
  }, [context])

  const resetContext = useCallback(() => {
    setContextState(defaultQuickTimeContext)
  }, [])

  const setContext = useCallback((newContext: QuickTimeContext) => {
    setContextState(newContext)
  }, [])

  return {
    parseInput,
    getContext,
    resetContext,
    setContext,
    isQuickFormat: isQuickTimeFormat
  }
}

export default useQuickTimeInput
