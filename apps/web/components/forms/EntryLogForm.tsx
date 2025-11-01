'use client'

import React, { useState, useEffect } from 'react'
import { Button, Input } from '@/components/ui'
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { formatTime } from '@/utils/formatters'

interface EntryData {
  id: string
  styleId: string
  entryTime: number // 秒単位
  entryTimeDisplayValue?: string // 入力中の表示用
  note: string
}

// 編集データの型定義
// Note: style_id (snake_case) はAPIレスポンス形式、styleId (camelCase) は内部形式
// 両方が存在する場合はどちらでも受け入れ可能（どちらも string | number に変換可能）
type EditEntryData = {
  id?: string
  style_id?: number | string
  styleId?: string | number
  entry_time?: number
  note?: string
}

interface EntryLogFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (entries: EntryData[]) => Promise<void>
  onSkip: () => void // SKIP機能
  competitionId: string
  isLoading?: boolean
  styles?: Array<{ id: string; nameJp: string; distance: number }>
  editData?: EditEntryData // 編集用の既存データ
}

export default function EntryLogForm({
  isOpen,
  onClose,
  onSubmit,
  onSkip,
  competitionId,
  isLoading = false,
  styles = [],
  editData
}: EntryLogFormProps) {
  const [entries, setEntries] = useState<EntryData[]>([
    {
      id: '1',
      styleId: styles[0]?.id || '',
      entryTime: 0,
      note: ''
    }
  ])

  // モーダルが開かれたときにリセットまたは編集データを設定
  useEffect(() => {
    if (isOpen) {
      if (editData) {
        // 編集モード: 既存の値をセット
        const entryData: EntryData = {
          id: editData.id || '1',
          styleId: String(editData.style_id || editData.styleId || styles[0]?.id || ''),
          entryTime: editData.entry_time || 0,
          entryTimeDisplayValue: editData.entry_time ? formatTime(editData.entry_time) : '',
          note: editData.note || ''
        }
        setEntries([entryData])
      } else {
        // 新規作成モード
        setEntries([
          {
            id: '1',
            styleId: styles[0]?.id || '',
            entryTime: 0,
            note: ''
          }
        ])
      }
    }
  }, [isOpen, styles, editData])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // バリデーション: 少なくとも1つのエントリーが必要
    if (entries.length === 0) {
      alert('少なくとも1つのエントリーを追加してください')
      return
    }

    // バリデーション: 種目が選択されているか
    const hasInvalidStyle = entries.some(entry => !entry.styleId)
    if (hasInvalidStyle) {
      alert('すべてのエントリーで種目を選択してください')
      return
    }

    try {
      await onSubmit(entries)
    } catch (error) {
      console.error('エントリー送信エラー:', error)
    }
  }

  const addEntry = () => {
    const newEntry: EntryData = {
      id: `entry-${Date.now()}`,
      styleId: styles[0]?.id || '',
      entryTime: 0,
      note: ''
    }
    
    setEntries(prev => [...prev, newEntry])
  }

  const removeEntry = (entryId: string) => {
    if (entries.length > 1) {
      setEntries(prev => prev.filter(entry => entry.id !== entryId))
    }
  }

  const updateEntry = (entryId: string, updates: Partial<EntryData>) => {
    setEntries(prev =>
      prev.map(entry =>
        entry.id === entryId ? { ...entry, ...updates } : entry
      )
    )
  }

  const formatTimeDisplay = (seconds: number): string => {
    if (seconds === 0) return ''
    return formatTime(seconds)
  }

  const parseTimeString = (timeString: string): number => {
    if (!timeString) return 0
    
    const trimmed = timeString.trim()
    if (!trimmed) return 0
    
    // "1:30.50" 形式
    if (trimmed.includes(':')) {
      const [minutesStr, secondsStr] = trimmed.split(':')
      const minutes = parseInt(minutesStr)
      const seconds = parseFloat(secondsStr)
      
      if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
        return 0
      }
      
      return minutes * 60 + seconds
    }
    
    // "30.50" 形式
    const parsed = parseFloat(trimmed)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={onClose}></div>

        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-3xl">
          {/* ヘッダー */}
          <div className="bg-white px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                エントリー登録
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
                disabled={isLoading}
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              大会にエントリーする種目とエントリータイムを入力してください。
              <br />
              エントリーをスキップして記録のみ登録することもできます。
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* エントリー一覧 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-md font-medium text-gray-900">エントリー種目</h4>
                <Button
                  type="button"
                  onClick={addEntry}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                  disabled={isLoading}
                >
                  <PlusIcon className="h-4 w-4" />
                  種目を追加
                </Button>
              </div>

              {entries.map((entry, index) => (
                <div key={entry.id} className="border border-gray-200 rounded-lg p-4 space-y-3 bg-blue-50">
                  <div className="flex items-center justify-between">
                    <h5 className="font-medium text-gray-700">種目 {index + 1}</h5>
                    {entries.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeEntry(entry.id)}
                        className="text-red-500 hover:text-red-700"
                        disabled={isLoading}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 種目選択 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        種目 <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={entry.styleId}
                        onChange={(e) => updateEntry(entry.id, { styleId: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                        disabled={isLoading}
                      >
                        <option value="">種目を選択</option>
                        {styles.map(style => (
                          <option key={style.id} value={style.id}>
                            {style.nameJp}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* エントリータイム */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        エントリータイム
                      </label>
                      <Input
                        type="text"
                        value={
                          entry.entryTimeDisplayValue !== undefined 
                            ? entry.entryTimeDisplayValue 
                            : (entry.entryTime > 0 ? formatTimeDisplay(entry.entryTime) : '')
                        }
                        onChange={(e) => {
                          const timeStr = e.target.value
                          updateEntry(entry.id, { entryTimeDisplayValue: timeStr })
                        }}
                        onBlur={(e) => {
                          const timeStr = e.target.value
                          if (timeStr === '') {
                            updateEntry(entry.id, { entryTime: 0, entryTimeDisplayValue: undefined })
                          } else {
                            const time = parseTimeString(timeStr)
                            updateEntry(entry.id, { entryTime: time, entryTimeDisplayValue: undefined })
                          }
                        }}
                        placeholder="例: 1:30.50"
                        disabled={isLoading}
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        未記入の場合はエントリータイムなしで登録されます
                      </p>
                    </div>
                  </div>

                  {/* メモ */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      メモ
                    </label>
                    <Input
                      type="text"
                      value={entry.note}
                      onChange={(e) => updateEntry(entry.id, { note: e.target.value })}
                      placeholder="特記事項など"
                      disabled={isLoading}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* ボタン */}
            <div className="flex justify-between items-center pt-6 border-t">
              <Button
                type="button"
                onClick={onSkip}
                variant="outline"
                disabled={isLoading}
              >
                エントリーをスキップ
              </Button>
              
              <div className="flex gap-3">
                <Button
                  type="button"
                  onClick={onClose}
                  variant="secondary"
                  disabled={isLoading}
                >
                  キャンセル
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading}
                >
                  {isLoading ? '登録中...' : 'エントリー登録'}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

