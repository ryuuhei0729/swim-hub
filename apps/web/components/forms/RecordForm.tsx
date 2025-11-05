'use client'

import React, { useState, useEffect } from 'react'
import { Button, Input } from '@/components/ui'
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import { formatTime } from '@/utils/formatters'

interface SplitTime {
  id: string
  distance: number
  splitTime: number
}

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

  // initialDateが変更された時にフォームデータを更新
  useEffect(() => {
    if (isOpen && initialDate) {
      setFormData(prev => ({
        ...prev,
        recordDate: format(initialDate, 'yyyy-MM-dd')
      }))
    }
  }, [isOpen, initialDate])

  // 編集データがある場合、フォームを初期化
  useEffect(() => {
    if (editData && isOpen) {
      
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
    }
  }, [editData, isOpen, initialDate, styles])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
    } catch (error) {
      console.error('フォーム送信エラー:', error)
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
    setFormData(prev => ({
      ...prev,
      records: prev.records.map(record =>
        record.id === recordId ? { ...record, ...updates } : record
      )
    }))
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

  const updateSplitTime = (recordId: string, splitIndex: number, updates: Partial<SplitTimeInput>) => {
    const record = formData.records.find(r => r.id === recordId)
    if (!record) return
    
    const updatedSplitTimes = record.splitTimes.map((split, index) =>
      index === splitIndex ? { ...split, ...updates } : split
    )
    
    updateRecord(recordId, { splitTimes: updatedSplitTimes })
  }

  const removeSplitTime = (recordId: string, splitIndex: number) => {
    const record = formData.records.find(r => r.id === recordId)
    if (!record) return
    
    const updatedSplitTimes = record.splitTimes.filter((_, index) => index !== splitIndex)
    updateRecord(recordId, { splitTimes: updatedSplitTimes })
  }

  const getStyleName = (styleId: string) => {
    const style = styles.find(s => s.id === styleId)
    return style ? `${style.nameJp} ${style.distance}m` : '種目を選択'
  }

  const formatTimeDisplay = (seconds: number): string => {
    if (seconds === 0) return '0.00'
    return formatTime(seconds)
  }


  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* オーバーレイ */}
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={onClose}></div>

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
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
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
              >
                <PlusIcon className="h-4 w-4" />
                種目を追加
              </Button>
            </div>

            {formData.records.map((record, recordIndex) => (
              <div key={record.id} className="border border-gray-200 rounded-lg p-4 space-y-4 bg-blue-50">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-gray-700">種目 {recordIndex + 1}</h4>
                  {formData.records.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRecord(record.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      種目
                    </label>
                    <select
                      value={record.styleId}
                      onChange={(e) => updateRecord(record.id, { styleId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      記録
                    </label>
                    <Input
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
                          updateRecord(record.id, { time, timeDisplayValue: undefined })
                        }
                      }}
                      placeholder="例: 1:30.50"
                      required
                    />
                  </div>

                  <div className="flex items-center">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={record.isRelaying}
                        onChange={(e) => updateRecord(record.id, { isRelaying: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm text-gray-700">リレー</span>
                    </label>
                  </div>
                </div>

                {/* スプリットタイム */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      スプリットタイム
                    </label>
                    <Button
                      type="button"
                      onClick={() => addSplitTime(record.id)}
                      className="text-sm"
                    >
                      <PlusIcon className="h-3 w-3 mr-1" />
                      追加
                    </Button>
                  </div>
                  
                  {record.splitTimes.map((split, splitIndex) => (
                    <div key={split.uiKey} className="flex items-center gap-2 mb-2">
                      <Input
                        type="text"
                        placeholder="距離 (m)"
                        value={split.distance}
                        onChange={(e) => updateSplitTime(record.id, splitIndex, { distance: e.target.value === '' ? '' : parseInt(e.target.value) })}
                        className="w-24"
                      />
                      <span className="text-gray-500">m:</span>
                      <Input
                        type="text"
                        placeholder="例: 1:30.50"
                        value={split.splitTimeDisplayValue !== undefined ? split.splitTimeDisplayValue : (split.splitTime > 0 ? formatTimeDisplay(split.splitTime) : '')}
                        onChange={(e) => {
                          const timeStr = e.target.value
                          // 入力中は文字列をそのまま保持
                          updateSplitTime(record.id, splitIndex, { splitTimeDisplayValue: timeStr })
                        }}
                        onBlur={(e) => {
                          const timeStr = e.target.value
                          if (timeStr === '') {
                            updateSplitTime(record.id, splitIndex, { splitTime: 0, splitTimeDisplayValue: undefined })
                          } else {
                            const time = parseTimeString(timeStr)
                            updateSplitTime(record.id, splitIndex, { splitTime: time, splitTimeDisplayValue: undefined })
                          }
                        }}
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => removeSplitTime(record.id, splitIndex)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
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
                    />
                  </div>
                </div>
              </div>
            ))}
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
            />
          </div>

          {/* ボタン */}
          <div className="flex justify-end gap-3 pt-6 border-t">
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