'use client'

import React, { useState, useEffect } from 'react'
import { Button, Input } from '@/components/ui'
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import { formatTime } from '@/utils/formatters'
import { LapTimeDisplay } from './LapTimeDisplay'


interface RecordSet {
  id: string
  styleId: string
  time: number
  timeDisplayValue?: string // 入力中の表示用
  isRelaying: boolean
  splitTimes: SplitTimeInput[]
  note: string
  videoUrl?: string
}

interface RecordFormData {
  recordDate: string
  place: string
  competitionName: string
  poolType: number // 0: short, 1: long
  records: RecordSet[]
  note: string
}

interface SplitTimeInput {
  distance: number | ''
  splitTime: number
  splitTimeDisplayValue?: string // 入力中の表示用
  // UI安定化用のキー（サーバー送信時には除去）
  uiKey?: string
}

interface RecordFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: RecordFormData) => Promise<void>
  initialDate?: Date
  editData?: EditData
  isLoading?: boolean
  styles?: Array<{ id: string; nameJp: string; distance: number }>
}

// 編集データ用の型
type EditSplitTime = { distance: number; splitTime: number }
type EditRecord = {
  id?: string
  styleId?: string
  time?: number
  isRelaying?: boolean
  splitTimes?: EditSplitTime[]
  note?: string
  videoUrl?: string
}
type EditData = {
  recordDate?: string
  place?: string
  competitionName?: string
  poolType?: number
  note?: string
  records?: EditRecord[]
  // 単一レコード編集ケースのためのフィールド
  id?: string
  styleId?: string
  time?: number
  isRelaying?: boolean
  splitTimes?: EditSplitTime[]
  videoUrl?: string
}

const POOL_TYPES = [
  { value: 0, label: '短水路 (25m)' },
  { value: 1, label: '長水路 (50m)' }
]

export default function RecordForm({
  isOpen,
  onClose,
  onSubmit,
  initialDate,
  editData,
  isLoading = false,
  styles = []
}: RecordFormProps) {
  const [formData, setFormData] = useState<RecordFormData>({
    recordDate: initialDate ? format(initialDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
    place: '',
    competitionName: '',
    poolType: 0,
    records: [{
      id: '1',
      styleId: styles[0]?.id || '',
      time: 0,
      isRelaying: false,
      splitTimes: [],
      note: '',
      videoUrl: ''
    }],
    note: ''
  })

  // 初期化済みフラグ（モーダルが開かれた時だけ初期化するため）
  const [isInitialized, setIsInitialized] = useState(false)
  // フォームに変更があるかどうかを追跡
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  // 送信済みフラグ（送信後は警告を出さない）
  const [isSubmitted, setIsSubmitted] = useState(false)

  // モーダルが閉じた時に初期化フラグをリセット
  useEffect(() => {
    if (!isOpen) {
      setIsInitialized(false)
      setHasUnsavedChanges(false)
      setIsSubmitted(false)
    }
  }, [isOpen])

  // ブラウザバックや閉じるボタンでの離脱を防ぐ
  useEffect(() => {
    if (!isOpen || !hasUnsavedChanges || isSubmitted) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }

    const handlePopState = (_e: PopStateEvent) => {
      if (hasUnsavedChanges && !isSubmitted) {
        const confirmed = window.confirm('入力内容が保存されていません。このまま戻りますか？')
        if (!confirmed) {
          // 履歴を戻す
          window.history.pushState(null, '', window.location.href)
        }
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

  // initialDateが変更された時にフォームデータを更新
  useEffect(() => {
    if (isOpen && initialDate) {
      setFormData(prev => ({
        ...prev,
        recordDate: format(initialDate, 'yyyy-MM-dd')
      }))
    }
  }, [isOpen, initialDate])

  // フォームに変更があったことを記録
  useEffect(() => {
    if (isOpen && isInitialized) {
      setHasUnsavedChanges(true)
    }
  }, [formData, isOpen, isInitialized])

  // 編集データがある場合、フォームを初期化（モーダルが開かれた時だけ）
  useEffect(() => {
    if (!isOpen || isInitialized) return

    if (editData) {
      
      // 複数のRecordが存在する場合の処理
      if (editData.records && editData.records.length > 0) {
        
        const records: RecordSet[] = editData.records.map((record: EditRecord, index: number) => ({
          id: record.id || `record-${index}`,
          styleId: record.styleId || styles[0]?.id || '',
          time: record.time || 0,
          isRelaying: record.isRelaying || false,
          splitTimes: (record.splitTimes?.map((st: EditSplitTime) => ({
            distance: st.distance,
            splitTime: st.splitTime,
            uiKey: (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
              ? (crypto as Crypto).randomUUID()
              : `split-${Date.now()}-${Math.random()}`
          })) || []),
          note: record.note || '',
          videoUrl: record.videoUrl || ''
        }))
        
        setFormData({
          recordDate: editData.recordDate || format(new Date(), 'yyyy-MM-dd'),
          place: editData.place || '',
          competitionName: editData.competitionName || '',
          poolType: editData.poolType || 0,
          records: records,
          note: editData.note || ''
        })
        setIsInitialized(true)
        return
      }
      
      // 単一のRecordの場合の従来の処理
      setFormData({
        recordDate: editData.recordDate || format(new Date(), 'yyyy-MM-dd'),
        place: editData.place || '',
        competitionName: editData.competitionName || '',
        poolType: editData.poolType || 0,
        records: [{
          id: editData.id || '1',
          styleId: editData.styleId || styles[0]?.id || '',
          time: editData.time || 0,
          isRelaying: editData.isRelaying || false,
          splitTimes: (editData.splitTimes?.map((st: EditSplitTime) => ({
            distance: st.distance,
            splitTime: st.splitTime,
            uiKey: (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
              ? (crypto as Crypto).randomUUID()
              : `split-${Date.now()}-${Math.random()}`
          })) || []),
          note: editData.note || '',
          videoUrl: editData.videoUrl || ''
        }],
        note: editData.note || ''
      })
      setIsInitialized(true)
    } else if (!editData && isOpen) {
      // 新規作成時はデフォルト値にリセット
      setFormData({
        recordDate: initialDate ? format(initialDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
        place: '',
        competitionName: '',
        poolType: 0,
        records: [{
          id: '1',
          styleId: styles[0]?.id || '',
          time: 0,
          isRelaying: false,
          splitTimes: [],
          note: '',
          videoUrl: ''
        }],
        note: ''
      })
      setIsInitialized(true)
    }
  }, [editData, isOpen, initialDate, isInitialized, styles])

  if (!isOpen) return null

  const handleClose = () => {
    if (hasUnsavedChanges && !isSubmitted) {
      const confirmed = window.confirm('入力内容が保存されていません。このまま閉じますか？')
      if (!confirmed) {
        return
      }
    }
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitted(true)
    try {
      // 送信前にUI専用プロパティを除去
      const sanitizedData = {
        ...formData,
        records: formData.records.map(record => ({
          ...record,
          splitTimes: record.splitTimes.map(st => ({
            distance: st.distance,
            splitTime: st.splitTime
          }))
        }))
      }
      
      await onSubmit(sanitizedData)
      setHasUnsavedChanges(false)
      onClose()
    } catch (error) {
      console.error('フォーム送信エラー:', error)
      setIsSubmitted(false)
    }
  }

  const addRecord = () => {
    const newRecord: RecordSet = {
      id: `record-${Date.now()}`,
      styleId: styles[0]?.id || '',
      time: 0,
      isRelaying: false,
      splitTimes: [],
      note: '',
      videoUrl: ''
    }
    
    setFormData(prev => ({
      ...prev,
      records: [...prev.records, newRecord]
    }))
  }

  const removeRecord = (recordId: string) => {
    if (formData.records.length > 1) {
      setFormData(prev => ({
        ...prev,
        records: prev.records.filter(record => record.id !== recordId)
      }))
    }
  }

  const updateRecord = (recordId: string, updates: Partial<RecordSet>) => {
    setFormData(prev => {
      const record = prev.records.find(r => r.id === recordId)
      if (!record) return prev

      const updatedRecord = { ...record, ...updates }
      const style = styles.find(s => s.id === updatedRecord.styleId)
      const raceDistance = style?.distance

      // タイムが変更された場合、種目の距離と同じ距離のsplit-timeを自動追加/更新
      if (updates.time !== undefined && raceDistance && updatedRecord.time > 0) {
        const existingSplitIndex = updatedRecord.splitTimes.findIndex(
          st => typeof st.distance === 'number' && st.distance === raceDistance
        )

        if (existingSplitIndex >= 0) {
          // 既存のsplit-timeを更新
          updatedRecord.splitTimes = updatedRecord.splitTimes.map((st, idx) =>
            idx === existingSplitIndex
              ? { ...st, splitTime: updatedRecord.time, splitTimeDisplayValue: undefined }
              : st
          )
        } else {
          // 新しいsplit-timeを追加
          const newSplitTime: SplitTimeInput = {
            distance: raceDistance,
            splitTime: updatedRecord.time,
            uiKey: (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
              ? (crypto as Crypto).randomUUID()
              : `split-${Date.now()}-${Math.random()}`
          }
          updatedRecord.splitTimes = [...updatedRecord.splitTimes, newSplitTime]
        }
      }

      return {
      ...prev,
      records: prev.records.map(record =>
          record.id === recordId ? updatedRecord : record
      )
      }
    })
  }

  const addSplitTime = (recordId: string) => {
    const newSplitTime: SplitTimeInput = {
      distance: '',
      splitTime: 0,
      uiKey: (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? (crypto as Crypto).randomUUID()
        : `split-${Date.now()}-${Math.random()}`
    }
    
    updateRecord(recordId, {
      splitTimes: [...formData.records.find(r => r.id === recordId)?.splitTimes || [], newSplitTime]
    })
  }

  const addSplitTimesEvery25m = (recordId: string) => {
    const record = formData.records.find(r => r.id === recordId)
    if (!record) return

    const style = styles.find(s => s.id === record.styleId)
    if (!style || !style.distance) return

    const raceDistance = style.distance
    const existingDistances = new Set(
      record.splitTimes
        .map(st => typeof st.distance === 'number' ? st.distance : null)
        .filter((d): d is number => d !== null)
    )

    // 25m間隔で種目の距離までsplit-timeを追加
    const newSplitTimes: SplitTimeInput[] = []
    for (let distance = 25; distance <= raceDistance; distance += 25) {
      // 既に存在する距離はスキップ
      if (!existingDistances.has(distance)) {
        newSplitTimes.push({
          distance,
          splitTime: 0,
          uiKey: (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
            ? (crypto as Crypto).randomUUID()
            : `split-${Date.now()}-${distance}-${Math.random()}`
        })
      }
    }

    if (newSplitTimes.length > 0) {
      updateRecord(recordId, {
        splitTimes: [...record.splitTimes, ...newSplitTimes]
      })
    }
  }

  const updateSplitTime = (recordId: string, splitIndex: number, updates: Partial<SplitTimeInput>) => {
    const record = formData.records.find(r => r.id === recordId)
    if (!record) return
    
    const style = styles.find(s => s.id === record.styleId)
    const raceDistance = style?.distance
    
    const updatedSplitTimes = record.splitTimes.map((split, index) =>
      index === splitIndex ? { ...split, ...updates } : split
    )
    
    // split-timeが変更された場合、種目の距離と同じ距離のsplit-timeならタイムも更新
    const updatedSplit = updatedSplitTimes[splitIndex]
    if (
      raceDistance &&
      typeof updatedSplit.distance === 'number' &&
      updatedSplit.distance === raceDistance &&
      updates.splitTime !== undefined
    ) {
      // 種目の距離と同じ距離のsplit-timeが変更されたら、タイムも同期
      updateRecord(recordId, {
        splitTimes: updatedSplitTimes,
        time: updates.splitTime,
        timeDisplayValue: undefined
      })
    } else {
    updateRecord(recordId, { splitTimes: updatedSplitTimes })
    }
  }

  const removeSplitTime = (recordId: string, splitIndex: number) => {
    const record = formData.records.find(r => r.id === recordId)
    if (!record) return
    
    const updatedSplitTimes = record.splitTimes.filter((_, index) => index !== splitIndex)
    updateRecord(recordId, { splitTimes: updatedSplitTimes })
  }

  const _getStyleName = (styleId: string) => {
    const style = styles.find(s => s.id === styleId)
    return style ? `${style.nameJp} ${style.distance}m` : '種目を選択'
  }

  const formatTimeDisplay = (seconds: number): string => {
    if (seconds === 0) return '0.00'
    return formatTime(seconds)
  }


  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto" data-testid="record-form-modal">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* オーバーレイ */}
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={handleClose}></div>

        {/* モーダルコンテンツ */}
        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
          {/* ヘッダー */}
          <div className="bg-white px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {editData ? '大会記録を編集' : '大会記録を追加'}
              </h3>
              <button
                type="button"
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600"
                aria-label="閉じる"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* 大会情報 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="record-date" className="block text-sm font-medium text-gray-700 mb-2">
                大会日
              </label>
              <Input
                id="record-date"
                type="date"
                value={formData.recordDate}
                onChange={(e) => setFormData(prev => ({ ...prev, recordDate: e.target.value }))}
                required
                data-testid="tournament-date"
              />
            </div>
            <div>
              <label htmlFor="record-place" className="block text-sm font-medium text-gray-700 mb-2">
                開催地
              </label>
              <Input
                id="record-place"
                type="text"
                value={formData.place}
                onChange={(e) => setFormData(prev => ({ ...prev, place: e.target.value }))}
                placeholder="例: 東京プール"
                required
                data-testid="tournament-place"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="competition-name" className="block text-sm font-medium text-gray-700 mb-2">
                大会名
              </label>
              <Input
                id="competition-name"
                type="text"
                value={formData.competitionName}
                onChange={(e) => setFormData(prev => ({ ...prev, competitionName: e.target.value }))}
                placeholder="例: 第○回水泳大会"
                required
                data-testid="tournament-name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                プール種別
              </label>
              <select
                value={formData.poolType}
                onChange={(e) => setFormData(prev => ({ ...prev, poolType: parseInt(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                data-testid="tournament-pool-type"
              >
                {POOL_TYPES.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 記録セクション */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">記録</h3>
              <Button
                type="button"
                onClick={addRecord}
                className="flex items-center gap-2"
                data-testid="record-add-button"
              >
                <PlusIcon className="h-4 w-4" />
                種目を追加
              </Button>
            </div>

            {formData.records.map((record, recordIndex) => {
              const styleId = `record-${record.id}-style`
              const timeId = `record-${record.id}-time`
              const relayId = `record-${record.id}-relay`

              return (
              <div key={record.id} className="border border-gray-200 rounded-lg p-4 space-y-4 bg-blue-50">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-gray-700">種目 {recordIndex + 1}</h4>
                  {formData.records.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRecord(record.id)}
                      className="text-red-500 hover:text-red-700"
                      aria-label="種目を削除"
                      data-testid={`record-remove-button-${recordIndex + 1}`}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                      <label htmlFor={styleId} className="block text-sm font-medium text-gray-700 mb-2">
                      種目
                    </label>
                    <select
                        id={styleId}
                      value={record.styleId}
                      onChange={(e) => updateRecord(record.id, { styleId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                      data-testid={`record-style-${recordIndex + 1}`}
                    >
                      <option value="">種目を選択</option>
                      {styles.map(style => (
                        <option key={style.id} value={style.id}>
                          {style.nameJp}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                      <label htmlFor={timeId} className="block text-sm font-medium text-gray-700 mb-2">
                        タイム
                    </label>
                    <Input
                        id={timeId}
                      type="text"
                      value={record.timeDisplayValue !== undefined ? record.timeDisplayValue : (record.time > 0 ? formatTimeDisplay(record.time) : '')}
                      onChange={(e) => {
                        const timeStr = e.target.value
                        // 入力中は文字列をそのまま保持
                        updateRecord(record.id, { timeDisplayValue: timeStr })
                      }}
                      onBlur={(e) => {
                        const timeStr = e.target.value
                        if (timeStr === '') {
                          updateRecord(record.id, { time: 0, timeDisplayValue: undefined })
                        } else {
                          const time = parseTimeString(timeStr)
                          // updateRecord内で自動的にsplit-timeも同期される
                          updateRecord(record.id, { time, timeDisplayValue: undefined })
                        }
                      }}
                      placeholder="例: 1:30.50"
                      required
                      data-testid={`record-time-${recordIndex + 1}`}
                    />
                  </div>

                    <div className="flex items-center">
                      <input
                        id={relayId}
                        type="checkbox"
                        checked={record.isRelaying}
                        onChange={(e) => updateRecord(record.id, { isRelaying: e.target.checked })}
                        className="mr-2"
                        data-testid={`record-relay-${recordIndex + 1}`}
                      />
                      <label htmlFor={relayId} className="text-sm text-gray-700">
                        リレー
                    </label>
                  </div>
                </div>

                {/* スプリットタイム */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      スプリットタイム
                    </label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={() => addSplitTimesEvery25m(record.id)}
                        className="text-sm"
                        variant="outline"
                        disabled={!styles.find(s => s.id === record.styleId)?.distance}
                        data-testid={`record-split-add-25m-button-${recordIndex + 1}`}
                      >
                        <PlusIcon className="h-3 w-3 mr-1" />
                        追加(25mごと)
                      </Button>
                    <Button
                      type="button"
                      onClick={() => addSplitTime(record.id)}
                      className="text-sm"
                        variant="outline"
                      data-testid={`record-split-add-button-${recordIndex + 1}`}
                    >
                      <PlusIcon className="h-3 w-3 mr-1" />
                        スプリットを追加
                    </Button>
                    </div>
                  </div>
                  
                  {[...record.splitTimes]
                    .sort((a, b) => {
                      const distA = typeof a.distance === 'number' ? a.distance : 0
                      const distB = typeof b.distance === 'number' ? b.distance : 0
                      return distA - distB
                    })
                    .map((split, _splitIndex) => {
                      // ソート後の元のインデックスを取得
                      const originalIndex = record.splitTimes.findIndex(st => st.uiKey === split.uiKey)
                      return { split, originalIndex }
                    })
                    .map(({ split, originalIndex }) => (
                    <div key={split.uiKey} className="flex items-center gap-2 mb-2">
                      <Input
                        type="text"
                        placeholder="距離 (m)"
                        value={split.distance}
                        onChange={(e) => updateSplitTime(record.id, originalIndex, { distance: e.target.value === '' ? '' : parseInt(e.target.value) })}
                        className="w-24"
                        data-testid={`record-split-distance-${recordIndex + 1}-${originalIndex + 1}`}
                      />
                      <span className="text-gray-500">m:</span>
                      <Input
                        type="text"
                        placeholder="例: 1:30.50"
                        value={split.splitTimeDisplayValue !== undefined ? split.splitTimeDisplayValue : (split.splitTime > 0 ? formatTimeDisplay(split.splitTime) : '')}
                        onChange={(e) => {
                          const timeStr = e.target.value
                          // 入力中は文字列をそのまま保持
                          updateSplitTime(record.id, originalIndex, { splitTimeDisplayValue: timeStr })
                        }}
                        onBlur={(e) => {
                          const timeStr = e.target.value
                          if (timeStr === '') {
                            updateSplitTime(record.id, originalIndex, { splitTime: 0, splitTimeDisplayValue: undefined })
                          } else {
                            const time = parseTimeString(timeStr)
                            updateSplitTime(record.id, originalIndex, { splitTime: time, splitTimeDisplayValue: undefined })
                          }
                        }}
                        className="flex-1"
                        data-testid={`record-split-time-${recordIndex + 1}-${originalIndex + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() => removeSplitTime(record.id, originalIndex)}
                        className="text-red-500 hover:text-red-700"
                        aria-label="スプリットを削除"
                        data-testid={`record-split-remove-button-${recordIndex + 1}-${originalIndex + 1}`}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  
                  {/* Lap-Time表示 */}
                  <LapTimeDisplay
                    splitTimes={record.splitTimes.map(st => ({
                      distance: st.distance,
                      splitTime: st.splitTime
                    }))}
                    raceDistance={styles.find(s => s.id === record.styleId)?.distance}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      動画URL
                    </label>
                    <Input
                      type="url"
                      value={record.videoUrl || ''}
                      onChange={(e) => updateRecord(record.id, { videoUrl: e.target.value })}
                      placeholder="https://..."
                      data-testid={`record-video-${recordIndex + 1}`}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      メモ
                    </label>
                    <Input
                      type="text"
                      value={record.note}
                      onChange={(e) => updateRecord(record.id, { note: e.target.value })}
                      placeholder="特記事項"
                      data-testid={`record-note-${recordIndex + 1}`}
                    />
                  </div>
                </div>
              </div>
              )
            })}
          </div>

          {/* 大会メモ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              大会メモ
            </label>
            <textarea
              value={formData.note}
              onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="大会に関する特記事項"
              data-testid="tournament-note"
            />
          </div>

          {/* ボタン */}
          <div className="flex justify-end gap-3 pt-6 border-t">
            <Button
              type="button"
              onClick={handleClose}
              variant="secondary"
              disabled={isLoading}
              data-testid="record-form-cancel-button"
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              data-testid="record-form-submit-button"
            >
              {isLoading ? '保存中...' : (editData ? '更新' : '保存')}
            </Button>
          </div>
        </form>
        </div>
      </div>

    </div>
  )
}

// タイム文字列を秒数に変換する関数
function parseTimeString(timeString: string): number {
  if (!timeString) return 0
  
  // "1:30.50" 形式
  if (timeString.includes(':')) {
    const [minutes, seconds] = timeString.split(':')
    return parseInt(minutes) * 60 + parseFloat(seconds)
  }
  
  // "30.50s" 形式
  if (timeString.endsWith('s')) {
    return parseFloat(timeString.slice(0, -1))
  }
  
  // 数値のみ
  return parseFloat(timeString)
}