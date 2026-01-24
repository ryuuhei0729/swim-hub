'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Button, Input, ConfirmDialog } from '@/components/ui'
import FormStepper from '@/components/ui/FormStepper'
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'

// 大会記録フォームのステップ定義
const COMPETITION_STEPS = [
  { id: 'basic', label: '大会情報', description: '日程・場所' },
  { id: 'entry', label: 'エントリー', description: '種目・タイム' },
  { id: 'record', label: '記録入力', description: '結果・スプリット' }
]
import { formatTime, formatTimeShort, parseTime } from '@apps/shared/utils/time'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

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
  isLoading = false,
  styles = [],
  editData,
  initialEntries = []
}: EntryLogFormProps) {
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
            (entry.entryTime && entry.entryTime > 0 ? formatTime(entry.entryTime) : ''),
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
                  ? formatTime(Number(entry.entryTime ?? entry.entry_time))
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
            entryTimeDisplayValue: editData.entry_time ? formatTime(editData.entry_time) : '',
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

        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-3xl">
          {/* ヘッダー */}
          <div className="bg-white px-6 py-4 border-b border-gray-200">
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
            <p className="mt-3 text-sm text-gray-600">
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 種目選択 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        種目 <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={entry.styleId}
                        onChange={(e) => updateEntry(entry.id, { styleId: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                        data-testid={`entry-time-${index + 1}`}
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
                      data-testid={`entry-note-${index + 1}`}
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
                data-testid="entry-skip-button"
              >
                エントリーをスキップ
              </Button>
              
              <div className="flex gap-3">
                <Button
                  type="button"
                  onClick={handleClose}
                  variant="secondary"
                  disabled={isLoading}
                  data-testid="entry-cancel-button"
                >
                  キャンセル
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading}
                  data-testid="entry-submit-button"
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

