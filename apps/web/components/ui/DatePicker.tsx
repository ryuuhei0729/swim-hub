'use client'

import React, { useState, useRef, useEffect, useCallback, useId } from 'react'
import { format, parseISO, isValid, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, getDay, isToday } from 'date-fns'
import { ja } from 'date-fns/locale'
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { cn } from '@/utils'

interface DatePickerProps {
  /** 選択された日付 (yyyy-MM-dd形式の文字列またはDate) */
  value?: string | Date
  /** 日付が変更された時のコールバック */
  onChange: (date: string) => void
  /** ラベル */
  label?: string
  /** 必須かどうか */
  required?: boolean
  /** 無効状態 */
  disabled?: boolean
  /** エラーメッセージ */
  error?: string
  /** ヘルパーテキスト */
  helperText?: string
  /** 最小日付 */
  minDate?: Date
  /** 最大日付 */
  maxDate?: Date
  /** プレースホルダー */
  placeholder?: string
  /** カスタムクラス */
  className?: string
  /** カレンダーを開いた時のデフォルト表示月（値が未選択の場合に使用） */
  defaultMonth?: Date
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export default function DatePicker({
  value,
  onChange,
  label,
  required,
  disabled,
  error,
  helperText,
  minDate,
  maxDate,
  placeholder = '日付を選択',
  className,
  defaultMonth
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    if (value) {
      const date = typeof value === 'string' ? parseISO(value) : value
      return isValid(date) ? startOfMonth(date) : startOfMonth(defaultMonth || new Date())
    }
    return startOfMonth(defaultMonth || new Date())
  })

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLButtonElement>(null)
  const calendarRef = useRef<HTMLDivElement>(null)

  const id = useId()
  const errorId = `${id}-error`

  // 選択中の日付
  const selectedDate = value
    ? typeof value === 'string'
      ? parseISO(value)
      : value
    : null

  // カレンダーの日付を生成
  const getDaysInMonth = useCallback(() => {
    const start = startOfMonth(currentMonth)
    const end = endOfMonth(currentMonth)
    const days = eachDayOfInterval({ start, end })

    // 月初の曜日を取得して、前月の空白を埋める
    const startDayOfWeek = getDay(start)
    const leadingEmptyDays = Array(startDayOfWeek).fill(null)

    return [...leadingEmptyDays, ...days]
  }, [currentMonth])

  // 日付が選択可能かどうか
  const isDateDisabled = useCallback((date: Date): boolean => {
    if (minDate && date < minDate) return true
    if (maxDate && date > maxDate) return true
    return false
  }, [minDate, maxDate])

  // 日付選択ハンドラー
  const handleSelectDate = (date: Date) => {
    if (isDateDisabled(date)) return
    onChange(format(date, 'yyyy-MM-dd'))
    setIsOpen(false)
    inputRef.current?.focus()
  }

  // 前月へ
  const handlePrevMonth = () => {
    setCurrentMonth(prev => subMonths(prev, 1))
  }

  // 次月へ
  const handleNextMonth = () => {
    setCurrentMonth(prev => addMonths(prev, 1))
  }

  // 今日へ
  const handleToday = () => {
    const today = new Date()
    setCurrentMonth(startOfMonth(today))
    if (!isDateDisabled(today)) {
      onChange(format(today, 'yyyy-MM-dd'))
      setIsOpen(false)
    }
  }

  // クリア
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
  }

  // 外部クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // キーボードナビゲーション
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return

      if (e.key === 'Escape') {
        setIsOpen(false)
        inputRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  // カレンダーが開いた時に適切な月を表示
  useEffect(() => {
    if (isOpen) {
      if (selectedDate && isValid(selectedDate)) {
        // 選択済みの日付があればその月を表示
        const newMonth = startOfMonth(selectedDate)
        setCurrentMonth(prev => {
          if (prev.getTime() === newMonth.getTime()) {
            return prev
          }
          return newMonth
        })
      } else if (defaultMonth) {
        // 未選択でdefaultMonthが指定されていればその月を表示
        const newMonth = startOfMonth(defaultMonth)
        setCurrentMonth(prev => {
          if (prev.getTime() === newMonth.getTime()) {
            return prev
          }
          return newMonth
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]) // selectedDate, defaultMonthは意図的に除外（isOpenが変わった時だけ実行）

  const days = getDaysInMonth()

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      {label && (
        <label
          htmlFor={id}
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {/* 日付表示ボタン */}
      <button
        ref={inputRef}
        id={id}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          'flex items-center justify-between w-full h-10 px-3 py-2 text-sm border rounded-md bg-white transition-colors',
          'focus:outline-none focus:ring-2 focus:border-transparent',
          error ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500',
          disabled && 'opacity-50 cursor-not-allowed bg-gray-50',
          !disabled && 'cursor-pointer hover:border-gray-400'
        )}
      >
        <span className={cn(
          'flex items-center gap-2',
          !selectedDate && 'text-gray-400'
        )}>
          <CalendarIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
          {selectedDate && isValid(selectedDate)
            ? format(selectedDate, 'yyyy年MM月dd日', { locale: ja })
            : placeholder}
        </span>

        {/* クリアボタン */}
        {selectedDate && !disabled && (
          <span
            role="button"
            tabIndex={0}
            onClick={handleClear}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleClear(e as unknown as React.MouseEvent)
              }
            }}
            className="p-1 text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer"
            aria-label="日付をクリア"
          >
            <XMarkIcon className="h-4 w-4" />
          </span>
        )}
      </button>

      {/* エラーメッセージ */}
      {error && (
        <p id={errorId} className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {/* ヘルパーテキスト */}
      {helperText && !error && (
        <p className="mt-2 text-sm text-gray-500">{helperText}</p>
      )}

      {/* カレンダーポップアップ */}
      {isOpen && (
        <div
          ref={calendarRef}
          role="dialog"
          aria-modal="true"
          aria-label="日付選択カレンダー"
          className="absolute z-50 mt-1 p-4 bg-white border border-gray-200 rounded-lg shadow-lg animate-in fade-in slide-in-from-top-2 duration-200"
        >
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              aria-label="前月"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>

            <span className="text-sm font-semibold text-gray-900">
              {format(currentMonth, 'yyyy年 M月', { locale: ja })}
            </span>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              aria-label="次月"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </div>

          {/* 曜日ヘッダー */}
          <div className="grid grid-cols-7 mb-2">
            {WEEKDAYS.map((day, index) => (
              <div
                key={day}
                className={cn(
                  'text-center text-xs font-medium py-2',
                  index === 0 && 'text-red-500',
                  index === 6 && 'text-blue-500',
                  index !== 0 && index !== 6 && 'text-gray-500'
                )}
              >
                {day}
              </div>
            ))}
          </div>

          {/* 日付グリッド */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, index) => {
              if (!day) {
                return <div key={`empty-${index}`} className="h-9" />
              }

              const isSelected = selectedDate && isSameDay(day, selectedDate)
              const isCurrentMonth = isSameMonth(day, currentMonth)
              const isDisabled = isDateDisabled(day)
              const isTodayDate = isToday(day)
              const dayOfWeek = getDay(day)

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => handleSelectDate(day)}
                  disabled={isDisabled}
                  className={cn(
                    'h-9 w-9 rounded-md text-sm font-medium transition-colors',
                    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
                    isSelected && 'bg-blue-600 text-white hover:bg-blue-700',
                    !isSelected && isTodayDate && 'bg-blue-100 text-blue-700',
                    !isSelected && !isTodayDate && isCurrentMonth && 'hover:bg-gray-100',
                    !isSelected && !isTodayDate && !isCurrentMonth && 'text-gray-300',
                    !isSelected && dayOfWeek === 0 && isCurrentMonth && 'text-red-500',
                    !isSelected && dayOfWeek === 6 && isCurrentMonth && 'text-blue-500',
                    isDisabled && 'opacity-50 cursor-not-allowed hover:bg-transparent'
                  )}
                  aria-label={format(day, 'yyyy年M月d日', { locale: ja })}
                  aria-pressed={isSelected || undefined}
                >
                  {format(day, 'd')}
                </button>
              )
            })}
          </div>

          {/* フッター */}
          <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between">
            <button
              type="button"
              onClick={handleToday}
              className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
            >
              今日
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
