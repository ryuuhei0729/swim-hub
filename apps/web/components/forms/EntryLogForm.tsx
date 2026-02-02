'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Button, Input, ConfirmDialog } from '@/components/ui'
import FormStepper from '@/components/ui/FormStepper'
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'

// 大会記録フォームのステップ定義
const COMPETITION_STEPS = [
  { id: 'basic', label: '大会情報', description: '日程・場所' },
  { id: 'entry', label: 'エントリー', description: '種目・タイム' },
  { id: 'record', label: '記録入力', description: '結果・スプリット' }
]
import { formatTimeBest, formatTimeShort, parseTime } from '@apps/shared/utils/time'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useBestTimes } from '@/hooks/useBestTimes'
import { useAuth } from '@/contexts'

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
  entries?: Array<{
    id?: string
    styleId?: string | number
    style_id?: string | number
    entryTime?: number | null
    entry_time?: number | null
    note?: string | null
  }>
}

interface EntryLogFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (entries: EntryData[]) => Promise<void>
  onSkip: () => void // SKIP機能
  competitionId: string
  competitionTitle?: string // 大会名（nullの場合は「大会」と表示）
  competitionDate?: string // 大会日付
  /** プールタイプ（0: 短水路, 1: 長水路） */
  poolType?: number
  isLoading?: boolean
  styles?: Array<{ id: string; nameJp: string; distance: number }>
  editData?: EditEntryData // 編集用の既存データ
  initialEntries?: EntryData[]
}

export default function EntryLogForm({
  isOpen,
  onClose,
  onSubmit,
  onSkip,
  competitionId: _competitionId,
  competitionTitle,
  competitionDate,
  poolType = 0,
  isLoading = false,
  styles = [],
  editData,
  initialEntries = []
}: EntryLogFormProps) {
  const { supabase, user } = useAuth()
  const { bestTimes, loadBestTimes } = useBestTimes(supabase)

  // ベストタイムを取得
  useEffect(() => {
    if (isOpen && user?.id) {
      loadBestTimes(user.id)
    }
  }, [isOpen, user?.id, loadBestTimes])

  // styleIdからベストタイムを取得するヘルパー関数（優先順位付き）
  // 1. 同じ水路・非リレー
  // 2. 同じ水路・リレー（引き継ぎあり）
  // 3. 異なる水路・非リレー
  // 4. 異なる水路・リレー（引き継ぎあり）
  const getBestTimeForStyle = useMemo(() => {
    return (styleId: string): { time: number; label: string } | null => {
      if (!bestTimes.length || !styleId) return null

      const style = styles.find(s => s.id === styleId)
      if (!style) return null

      const styleName = style.nameJp
      const otherPoolType = poolType === 0 ? 1 : 0
      const otherPoolLabel = poolType === 0 ? '長水路' : '短水路'

      // 1. 同じ水路・非リレー
      const samePoolNonRelay = bestTimes.find((bt) =>
        bt.style.name_jp === styleName && bt.pool_type === poolType && !bt.is_relaying
      )
      if (samePoolNonRelay) {
        return { time: samePoolNonRelay.time, label: 'ベストタイム' }
      }

      // 2. 同じ水路・リレー（relayingTimeを探す）
      const samePoolRelay = bestTimes.find((bt) =>
        bt.style.name_jp === styleName && bt.pool_type === poolType && bt.relayingTime
      )
      if (samePoolRelay?.relayingTime) {
        return { time: samePoolRelay.relayingTime.time, label: 'ベストタイム(引継)' }
      }

      // 3. 異なる水路・非リレー
      const otherPoolNonRelay = bestTimes.find((bt) =>
        bt.style.name_jp === styleName && bt.pool_type === otherPoolType && !bt.is_relaying
      )
      if (otherPoolNonRelay) {
        return { time: otherPoolNonRelay.time, label: `ベストタイム(${otherPoolLabel})` }
      }

      // 4. 異なる水路・リレー
      const otherPoolRelay = bestTimes.find((bt) =>
        bt.style.name_jp === styleName && bt.pool_type === otherPoolType && bt.relayingTime
      )
      if (otherPoolRelay?.relayingTime) {
        return { time: otherPoolRelay.relayingTime.time, label: `ベストタイム(${otherPoolLabel}引継)` }
      }

      return null
    }
  }, [bestTimes, styles, poolType])

  const [entries, setEntries] = useState<EntryData[]>([
    {
      id: '1',
      styleId: styles[0]?.id || '',
      entryTime: 0,
      note: ''
    }
  ])

  // 初期化済みフラグ（モーダルが開かれた時だけ初期化するため）
  const [isInitialized, setIsInitialized] = useState(false)
  // フォームに変更があるかどうかを追跡
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  // 送信済みフラグ（送信後は警告を出さない）
  const [isSubmitted, setIsSubmitted] = useState(false)
  // 初期値を保存（初期化時の変更を無視するため）
  const initialEntriesRef = useRef<EntryData[] | null>(null)
  // 確認ダイアログの表示状態
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  // 確認ダイアログのコンテキスト（close: モーダル閉じる, back: ブラウザバック）
  const [confirmContext, setConfirmContext] = useState<'close' | 'back'>('close')

  // モーダルが閉じた時に初期化フラグをリセット
  useEffect(() => {
    if (!isOpen) {
      setIsInitialized(false)
      setHasUnsavedChanges(false)
      setIsSubmitted(false)
      setShowConfirmDialog(false)
      initialEntriesRef.current = null
    }
  }, [isOpen])

  // フォームに変更があったことを記録（初期値と比較して、実際にユーザーが変更した場合のみ）
  useEffect(() => {
    if (!isOpen || !isInitialized || !initialEntriesRef.current) return

    // 初期値と現在の値を比較（深い比較）
    const hasChanged = JSON.stringify(entries) !== JSON.stringify(initialEntriesRef.current)
    setHasUnsavedChanges(hasChanged)
  }, [entries, isOpen, isInitialized])

  // ブラウザバックや閉じるボタンでの離脱を防ぐ
  useEffect(() => {
    if (!isOpen || !hasUnsavedChanges || isSubmitted) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }

    const handlePopState = (_e: PopStateEvent) => {
      if (hasUnsavedChanges && !isSubmitted) {
        // 履歴を戻す（ダイアログ表示中は戻らない）
        window.history.pushState(null, '', window.location.href)
        setConfirmContext('back')
        setShowConfirmDialog(true)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.history.pushState(null, '', window.location.href)
    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [isOpen, hasUnsavedChanges, isSubmitted])

  // モーダルが開かれたときにリセットまたは編集データを設定（モーダルが開かれた時だけ）
  useEffect(() => {
    if (!isOpen || isInitialized) return

    let initialEntriesData: EntryData[]
    if (initialEntries.length > 0) {
      initialEntriesData = initialEntries.map((entry, index) => ({
          id: entry.id || `entry-${index + 1}`,
          styleId: entry.styleId || '',
          entryTime: entry.entryTime || 0,
          entryTimeDisplayValue:
            entry.entryTimeDisplayValue ??
            (entry.entryTime && entry.entryTime > 0 ? formatTimeBest(entry.entryTime) : ''),
          note: entry.note || ''
        }))
    } else if (editData) {
      // 編集モード: 既存の値をセット
      initialEntriesData = (() => {
        // editDataにentries配列が含まれる場合は優先
        if (typeof editData === 'object' && editData !== null && 'entries' in editData) {
          const entriesProp = (editData as EditEntryData & { entries: Array<{
            id?: string
            styleId?: string | number
            style_id?: string | number
            entryTime?: number | null
            entry_time?: number | null
            note?: string | null
          }> }).entries
          if (Array.isArray(entriesProp) && entriesProp.length > 0) {
            return entriesProp.map((entry, idx) => ({
              id: entry.id || `entry-${idx + 1}`,
              styleId: String(entry.styleId ?? entry.style_id ?? styles[0]?.id ?? ''),
              entryTime: entry.entryTime ?? entry.entry_time ?? 0,
              entryTimeDisplayValue:
                entry.entryTime ?? entry.entry_time
                  ? formatTimeBest(Number(entry.entryTime ?? entry.entry_time))
                  : '',
              note: entry.note || ''
            }))
          }
        }

        return [
          {
            id: editData.id || '1',
            styleId: String(editData.style_id || editData.styleId || styles[0]?.id || ''),
            entryTime: editData.entry_time || 0,
            entryTimeDisplayValue: editData.entry_time ? formatTimeBest(editData.entry_time) : '',
            note: editData.note || ''
          }
        ]
      })()
    } else {
      // 新規作成モード
      initialEntriesData = [
        {
          id: '1',
          styleId: styles[0]?.id || '',
          entryTime: 0,
          note: ''
        }
      ]
    }
    
    setEntries(initialEntriesData)
    // 初期値を保存（初期化時の変更を無視するため）
    initialEntriesRef.current = initialEntriesData.map(entry => ({ ...entry }))
    setIsInitialized(true)
  }, [isOpen, styles, editData, initialEntries, isInitialized])

  if (!isOpen) return null

  const handleClose = () => {
    if (hasUnsavedChanges && !isSubmitted) {
      setConfirmContext('close')
      setShowConfirmDialog(true)
      return
    }
    onClose()
  }

  const handleConfirmClose = () => {
    if (confirmContext === 'back') {
      window.history.back()
    }
    setShowConfirmDialog(false)
    onClose()
  }

  const handleCancelClose = () => {
    setShowConfirmDialog(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // バリデーション: 少なくとも1つのエントリーが必要
    if (entries.length === 0) {
      console.error('少なくとも1つのエントリーを追加してください')
      return
    }

    // バリデーション: 種目が選択されているか
    const hasInvalidStyle = entries.some(entry => !entry.styleId)
    if (hasInvalidStyle) {
      console.error('すべてのエントリーで種目を選択してください')
      return
    }

    setIsSubmitted(true)
    try {
      await onSubmit(entries)
      setHasUnsavedChanges(false)
      // onClose()は呼ばない - handleEntrySubmitが適切にモーダルを管理する
      // (closeEntryLogForm() → openRecordLogForm())
    } catch (error) {
      console.error('エントリー送信エラー:', error)
      setIsSubmitted(false)
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
    return formatTimeShort(seconds)
  }

  const parseTimeString = (timeString: string): number => {
    return parseTime(timeString)
  }

  return (
    <div className="fixed inset-0 z-70 overflow-y-auto" data-testid="entry-form-modal">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={handleClose}></div>

        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-3xl max-h-[90vh] flex flex-col">
          {/* ヘッダー */}
          <div className="bg-white px-6 py-4 border-b border-gray-200 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                {(competitionTitle || competitionDate) && (
                  <div className="mt-3 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-lg font-bold text-gray-900">
                      {competitionDate && competitionTitle && (
                        <>
                          <span className="text-base font-semibold text-blue-700">
                            {format(new Date(competitionDate), 'yyyy年M月d日(E)', { locale: ja })}
                          </span>
                          <span className="ml-3">{competitionTitle}</span>
                        </>
                      )}
                      {competitionDate && !competitionTitle && (
                        format(new Date(competitionDate), 'yyyy年M月d日(E)', { locale: ja })
                      )}
                      {!competitionDate && competitionTitle && competitionTitle}
                    </p>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600"
                disabled={isLoading}
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            {/* ステッププログレス（編集モードでない場合のみ表示） */}
            {!editData && (
              <div className="mt-4">
                <FormStepper steps={COMPETITION_STEPS} currentStep={1} />
              </div>
            )}
            <p className="mt-3 text-[10px] sm:text-sm text-gray-600">
              大会にエントリーする種目とエントリータイムを入力してください。
              <br />
              エントリーをスキップして記録のみ登録することもできます。
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
                  data-testid="entry-add-button"
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
                        data-testid={`entry-remove-button-${index + 1}`}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                    {/* 種目選択 */}
                    <div className="flex items-start gap-2 sm:flex-1">
                      <label className="text-sm font-medium text-gray-700 whitespace-nowrap shrink-0 h-10 flex items-center">
                        エントリー種目 <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={entry.styleId}
                        onChange={(e) => updateEntry(entry.id, { styleId: e.target.value })}
                        className="flex-1 min-w-0 px-3 py-2 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                        disabled={isLoading}
                        data-testid={`entry-style-${index + 1}`}
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
                    <div className="flex items-start gap-2 sm:flex-1">
                      <label className="text-sm font-medium text-gray-700 whitespace-nowrap shrink-0 h-10 flex items-center">
                        エントリータイム
                      </label>
                      <div className="flex-1 min-w-0">
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
                          placeholder="1:30.50"
                          disabled={isLoading}
                          data-testid={`entry-time-${index + 1}`}
                          className="w-full"
                        />
                        {getBestTimeForStyle(entry.styleId) && (
                          <p className="text-xs text-gray-500 mt-1">
                            {getBestTimeForStyle(entry.styleId)!.label}: {formatTimeBest(getBestTimeForStyle(entry.styleId)!.time)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* メモ */}
                  <div className="flex items-center gap-2 w-full">
                    <label className="text-sm font-medium text-gray-700 whitespace-nowrap shrink-0">
                      メモ
                    </label>
                    <input
                      type="text"
                      value={entry.note}
                      onChange={(e) => updateEntry(entry.id, { note: e.target.value })}
                      placeholder="特記事項など"
                      disabled={isLoading}
                      data-testid={`entry-note-${index + 1}`}
                      className="flex-1 min-w-0 h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                </div>
              ))}
            </div>
            </div>

            {/* フッター（固定） */}
            <div className="shrink-0 bg-gray-50 px-4 py-3 sm:px-6 sm:py-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-3">
              <Button
                type="button"
                onClick={handleClose}
                variant="secondary"
                disabled={isLoading}
                data-testid="entry-cancel-button"
                className="w-full sm:w-auto order-last sm:order-first"
              >
                キャンセル
              </Button>

              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
                <Button
                  type="button"
                  onClick={onSkip}
                  variant="outline"
                  disabled={isLoading}
                  data-testid="entry-skip-button"
                  className="w-full sm:w-auto"
                >
                  エントリーをスキップ
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading}
                  data-testid="entry-submit-button"
                  className="w-full sm:w-auto"
                >
                  {isLoading ? '登録中...' : 'エントリー登録'}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* 確認ダイアログ */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        onConfirm={handleConfirmClose}
        onCancel={handleCancelClose}
        title="入力内容が保存されていません"
        message={confirmContext === 'back'
          ? '入力内容が保存されていません。このまま戻りますか？'
          : '入力内容が保存されていません。このまま閉じますか？'}
        confirmLabel={confirmContext === 'back' ? '戻る' : '閉じる'}
        cancelLabel="編集を続ける"
        variant="warning"
      />
    </div>
  )
}

