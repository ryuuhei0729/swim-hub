'use client'

import React, { useState, useEffect } from 'react'
import { Button, Input } from '@/components/ui'
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { formatTime } from '@/utils/formatters'
import { EntryInfo } from '@apps/shared/types/ui'
// SplitTimeRow型定義（editData用のcamelCase型）
type SplitTimeRow = {
  distance: number
  splitTime: number
}

export interface SplitTimeInput {
  distance: number | ''
  splitTime: number
  splitTimeDisplayValue?: string
  uiKey?: string
}

// フォーム内部状態用（入力中はdistanceがnumber | ''）
interface RecordLogFormState {
  styleId: string
  time: number
  timeDisplayValue?: string
  isRelaying: boolean
  splitTimes: SplitTimeInput[]
  note: string
  videoUrl?: string
}

// 送信用（distanceはnumber）
export interface RecordLogFormData {
  styleId: string
  time: number
  timeDisplayValue?: string
  isRelaying: boolean
  splitTimes: Array<{ distance: number; splitTime: number }>
  note: string
  videoUrl?: string
}

interface RecordLogFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: RecordLogFormData) => Promise<void>
  competitionId: string
  editData?: {
    id?: string
    styleId?: number
    time?: number
    isRelaying?: boolean
    splitTimes?: SplitTimeRow[]
    note?: string
    videoUrl?: string
  } | null
  isLoading?: boolean
  styles?: Array<{ id: string | number; nameJp: string; distance: number }>
  entryData?: EntryInfo // エントリー情報（ある場合は種目固定）
}

export default function RecordLogForm({
  isOpen,
  onClose,
  onSubmit,
  competitionId,
  editData,
  isLoading = false,
  styles = [],
  entryData
}: RecordLogFormProps) {
  const [formData, setFormData] = useState<RecordLogFormState>({
    styleId: entryData?.styleId?.toString() || styles[0]?.id?.toString() || '',
    time: 0,
    timeDisplayValue: '',
    isRelaying: false,
    splitTimes: [],
    note: '',
    videoUrl: ''
  })

  // エントリーモードかどうかを判定
  const isEntryMode = !!entryData

  // editDataまたはstylesが変更された時にフォームを初期化
  useEffect(() => {
    if (isOpen) {
      if (editData) {
        // 編集モード
        const timeInSeconds = editData.time ?? 0 // DBは秒単位のDECIMAL
        const minutes = Math.floor(timeInSeconds / 60)
        const seconds = (timeInSeconds % 60).toFixed(2)
        const timeDisplay = minutes > 0 ? `${minutes}:${seconds.padStart(5, '0')}` : seconds

        setFormData({
          styleId: editData.styleId?.toString() || styles[0]?.id?.toString() || '',
          time: editData.time ?? 0,
          timeDisplayValue: timeDisplay,
          isRelaying: editData.isRelaying || false,
          splitTimes: editData.splitTimes?.map((st: SplitTimeRow, index: number) => {
            const splitSeconds = st.splitTime
            const splitMinutes = Math.floor(splitSeconds / 60)
            const splitSecs = (splitSeconds % 60).toFixed(2)
            const splitDisplay = splitMinutes > 0 ? `${splitMinutes}:${splitSecs.padStart(5, '0')}` : splitSecs
            
            return {
              distance: st.distance,
              splitTime: st.splitTime,
              splitTimeDisplayValue: splitDisplay,
              uiKey: `split-${index}`
            }
          }) || [],
          note: editData.note || '',
          videoUrl: editData.videoUrl || ''
        })
      } else {
        // 新規作成モード
        // entryDataがある場合は、それを使って初期化（エントリー済みの種目を反映）
        const defaultStyleId = entryData?.styleId 
          ? String(entryData.styleId) 
          : (styles[0]?.id ? String(styles[0].id) : '')
        
        setFormData({
          styleId: defaultStyleId,
          time: 0,
          timeDisplayValue: '',
          isRelaying: false,
          splitTimes: [],
          note: '',
          videoUrl: ''
        })
      }
    }
  }, [isOpen, editData, styles, entryData])

  const parseTimeToSeconds = (timeStr: string): number => {
    if (!timeStr || timeStr.trim() === '') return 0
    
    const parts = timeStr.split(':')
    if (parts.length === 2) {
      // 「分:秒.小数」形式（例: 1:23.45）
      const minutes = parseInt(parts[0]) || 0
      const seconds = parseFloat(parts[1]) || 0
      return minutes * 60 + seconds
    } else {
      // 秒数のみの形式（例: 32.32）
      return parseFloat(timeStr) || 0
    }
  }

  const handleTimeChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      timeDisplayValue: value,
      time: parseTimeToSeconds(value)
    }))
  }

  const handleAddSplitTime = () => {
    setFormData(prev => ({
      ...prev,
      splitTimes: [
        ...prev.splitTimes,
        {
          distance: '',
          splitTime: 0,
          splitTimeDisplayValue: '',
          uiKey: `split-${Date.now()}`
        }
      ]
    }))
  }

  const handleRemoveSplitTime = (index: number) => {
    setFormData(prev => ({
      ...prev,
      splitTimes: prev.splitTimes.filter((_, i) => i !== index)
    }))
  }

  const handleSplitTimeChange = (index: number, field: 'distance' | 'splitTime', value: string) => {
    setFormData(prev => ({
      ...prev,
      splitTimes: prev.splitTimes.map((st, i) => {
        if (i === index) {
          if (field === 'distance') {
            return { ...st, distance: value === '' ? '' : parseInt(value) }
          } else {
            // 空文字列の場合はsplitTimeを0にする（後でフィルタリングされる）
            const parsedTime = value.trim() === '' ? 0 : parseTimeToSeconds(value)
            return {
              ...st,
              splitTimeDisplayValue: value,
              splitTime: parsedTime
            }
          }
        }
        return st
      })
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // バリデーション
    if (!formData.styleId) {
      console.error('種目を選択してください')
      return
    }
    if (formData.time <= 0) {
      console.error('タイムを入力してください（形式: 分:秒.小数 または 秒.小数）')
      return
    }

    // スプリットタイムのバリデーション・変換
    // 空のスプリットタイムを除外し、distanceをnumberに変換
    const validSplitTimes = formData.splitTimes
      .map((st) => {
        // distanceをnumberに変換
        const distance = typeof st.distance === 'number' ? st.distance : (st.distance === '' ? NaN : parseInt(String(st.distance)))
        
        // 有効な値のみ返す
        if (!isNaN(distance) && distance > 0 && st.splitTime > 0) {
          return {
            distance,
            splitTime: st.splitTime
          }
        }
        return null
      })
      .filter((st): st is { distance: number; splitTime: number } => st !== null)

    // バリデーション済みのデータを送信
    const submitData = {
      ...formData,
      splitTimes: validSplitTimes
    }

    await onSubmit(submitData)
  }

  const handleClose = () => {
    setFormData({
      styleId: styles[0]?.id?.toString() || '',
      time: 0,
      timeDisplayValue: '',
      isRelaying: false,
      splitTimes: [],
      note: '',
      videoUrl: ''
    })
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* オーバーレイ */}
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={handleClose}></div>

        {/* モーダルコンテンツ */}
        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-2xl">
          {/* ヘッダー */}
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {editData ? '記録編集' : '記録登録'}
              </h3>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* エントリー情報表示 */}
            {isEntryMode && entryData && (
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="text-sm font-medium text-blue-900 mb-2">📝 エントリー情報</h4>
                <div className="space-y-1 text-sm text-blue-800">
                  <p><span className="font-medium">種目:</span> {entryData.styleName}</p>
                  {entryData.entryTime && entryData.entryTime > 0 && (
                    <p><span className="font-medium">エントリータイム:</span> {formatTime(entryData.entryTime)}</p>
                  )}
                </div>
              </div>
            )}

            {/* フォーム */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* 種目 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  種目 <span className="text-red-500">*</span>
                </label>
                {isEntryMode && entryData ? (
                  // エントリーモード: 種目固定表示
                  <div className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-700">
                    {entryData.styleName}
                  </div>
                ) : (
                  // 通常モード: 種目選択
                  <select
                    value={formData.styleId}
                    onChange={(e) => setFormData({ ...formData, styleId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="">種目を選択</option>
                    {styles.map((style) => (
                      <option key={style.id} value={style.id}>
                        {style.nameJp}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* タイム */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  タイム <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  value={formData.timeDisplayValue}
                  onChange={(e) => handleTimeChange(e.target.value)}
                  placeholder="例: 1:23.45 または 32.45"
                  required
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  形式: 分:秒.小数（例: 1:23.45）または 秒.小数（例: 32.45）
                </p>
              </div>

              {/* リレー */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isRelaying"
                  checked={formData.isRelaying}
                  onChange={(e) => setFormData({ ...formData, isRelaying: e.target.checked })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="isRelaying" className="ml-2 text-sm text-gray-700">
                  リレー種目
                </label>
              </div>

              {/* スプリットタイム */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    スプリットタイム
                  </label>
                  <button
                    type="button"
                    onClick={handleAddSplitTime}
                    className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    <PlusIcon className="h-4 w-4 mr-1" />
                    追加
                  </button>
                </div>
                {formData.splitTimes.length === 0 ? (
                  <p className="text-sm text-gray-500">スプリットタイムはありません</p>
                ) : (
                  <div className="space-y-2">
                    {formData.splitTimes.map((st, index) => (
                      <div key={st.uiKey || index} className="flex items-center space-x-2">
                        <Input
                          type="number"
                          value={st.distance}
                          onChange={(e) => handleSplitTimeChange(index, 'distance', e.target.value)}
                          placeholder="距離 (m)"
                          className="w-24"
                        />
                        <Input
                          type="text"
                          value={st.splitTimeDisplayValue || ''}
                          onChange={(e) => handleSplitTimeChange(index, 'splitTime', e.target.value)}
                          placeholder="例: 28.50 または 0:28.50"
                          className="flex-1"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveSplitTime(index)}
                          className="p-2 text-red-600 hover:text-red-700"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ビデオURL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ビデオURL
                </label>
                <Input
                  type="url"
                  value={formData.videoUrl}
                  onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full"
                />
              </div>

              {/* メモ */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  メモ
                </label>
                <textarea
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  placeholder="記録に関するメモ（任意）"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </form>
          </div>

          {/* フッター */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <Button
              onClick={handleSubmit}
              disabled={isLoading}
              className="w-full sm:w-auto sm:ml-3"
            >
              {isLoading ? '保存中...' : editData ? '更新' : '保存'}
            </Button>
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
              className="mt-3 w-full sm:mt-0 sm:w-auto"
            >
              キャンセル
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

