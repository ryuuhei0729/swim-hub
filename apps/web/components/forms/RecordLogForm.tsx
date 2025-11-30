'use client'

import React, { useState, useEffect } from 'react'
import { Button, Input } from '@/components/ui'
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { formatTime } from '@/utils/formatters'
import { EntryInfo } from '@apps/shared/types/ui'
import { LapTimeDisplay } from './LapTimeDisplay'
// SplitTimeRow型定義（editData用のcamelCase型）
type SplitTimeRow = {
  distance: number
  splitTime: number
}

// フォーム内部状態用のスプリットタイム型（入力中はdistanceがnumber | ''）
interface SplitTimeDraft {
  distance: number
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
  splitTimes: SplitTimeDraft[]
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
  onSubmit: (dataList: RecordLogFormData[]) => Promise<void>
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
  entryDataList?: EntryInfo[] // エントリー情報（複数種目に対応）
}

export default function RecordLogForm({
  isOpen,
  onClose,
  onSubmit,
  competitionId: _competitionId,
  editData,
  isLoading = false,
  styles = [],
  entryDataList: entryDataListProp = []
}: RecordLogFormProps) {
  const entryDataList = entryDataListProp

  const createDefaultState = (styleId: string): RecordLogFormState => ({
    styleId,
    time: 0,
    timeDisplayValue: '',
    isRelaying: false,
    splitTimes: [],
    note: '',
    videoUrl: ''
  })

  const formatSecondsToDisplay = (seconds?: number): string => {
    if (!seconds || seconds <= 0) return ''
    const minutes = Math.floor(seconds / 60)
    const remainder = (seconds % 60).toFixed(2).padStart(5, '0')
    return minutes > 0 ? `${minutes}:${remainder}` : remainder
  }

  const [formDataList, setFormDataList] = useState<RecordLogFormState[]>([])
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

  // フォームに変更があったことを記録
  useEffect(() => {
    if (isOpen && isInitialized) {
      setHasUnsavedChanges(true)
    }
  }, [formDataList, isOpen, isInitialized])

  // ブラウザバックや閉じるボタンでの離脱を防ぐ
  useEffect(() => {
    if (!isOpen || !hasUnsavedChanges || isSubmitted) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }

    const handlePopState = (e: PopStateEvent) => {
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

  useEffect(() => {
    if (!isOpen || isInitialized) return

    if (editData) {
      const splitTimes =
        editData.splitTimes?.map((st: SplitTimeRow, index: number) => ({
          distance: st.distance,
          splitTime: st.splitTime,
          splitTimeDisplayValue: formatSecondsToDisplay(st.splitTime),
          uiKey: `split-${index}`
        })) ?? []

      const styleId =
        editData.styleId?.toString() ||
        entryDataList[0]?.styleId?.toString() ||
        (styles[0]?.id ? styles[0].id.toString() : '')

      setFormDataList([
        {
          styleId,
          time: editData.time ?? 0,
          timeDisplayValue: formatSecondsToDisplay(editData.time),
          isRelaying: editData.isRelaying || false,
          splitTimes,
          note: editData.note || '',
          videoUrl: editData.videoUrl || ''
        }
      ])
      setIsInitialized(true)
    } else if (entryDataList.length > 0) {
      setFormDataList(
        entryDataList.map((entry, index) =>
          createDefaultState(entry.styleId ? String(entry.styleId) : styles[index]?.id?.toString() || '')
        )
      )
      setIsInitialized(true)
    } else {
      setFormDataList([createDefaultState(styles[0]?.id ? String(styles[0].id) : '')])
      setIsInitialized(true)
    }
  }, [isOpen, editData, entryDataList, isInitialized])

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

  const updateFormData = (index: number, updater: (prev: RecordLogFormState) => RecordLogFormState) => {
    setFormDataList((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        return updater(item)
      })
    )
  }

  const handleTimeChange = (index: number, value: string) => {
    updateFormData(index, (prev) => {
      const newTime = parseTimeToSeconds(value)
      const entryInfo = entryDataList[index]
      const styleId = entryInfo ? String(entryInfo.styleId) : prev.styleId
      const style = styles.find(s => s.id.toString() === styleId)
      const raceDistance = style?.distance

      let updatedSplitTimes = [...prev.splitTimes]

      // タイムが変更された場合、種目の距離と同じ距離のsplit-timeを自動追加/更新
      if (raceDistance && newTime > 0) {
        const existingSplitIndex = updatedSplitTimes.findIndex(
          st => typeof st.distance === 'number' && st.distance === raceDistance
        )

        if (existingSplitIndex >= 0) {
          // 既存のsplit-timeを更新
          updatedSplitTimes = updatedSplitTimes.map((st, idx) =>
            idx === existingSplitIndex
              ? { ...st, splitTime: newTime, splitTimeDisplayValue: formatSecondsToDisplay(newTime) }
              : st
          )
        } else {
          // 新しいsplit-timeを追加
          updatedSplitTimes = [
            ...updatedSplitTimes,
            {
              distance: raceDistance,
              splitTime: newTime,
              splitTimeDisplayValue: formatSecondsToDisplay(newTime),
              uiKey: `split-${Date.now()}`
            }
          ]
        }
      }

      return {
      ...prev,
      timeDisplayValue: value,
        time: newTime,
        splitTimes: updatedSplitTimes
      }
    })
  }

  const handleToggleRelaying = (index: number, checked: boolean) => {
    updateFormData(index, (prev) => ({
      ...prev,
      isRelaying: checked
    }))
  }

  const handleNoteChange = (index: number, value: string) => {
    updateFormData(index, (prev) => ({
      ...prev,
      note: value
    }))
  }

  const handleVideoChange = (index: number, value: string) => {
    updateFormData(index, (prev) => ({
      ...prev,
      videoUrl: value
    }))
  }

  const handleAddSplitTime = (entryIndex: number) => {
    updateFormData(entryIndex, (prev) => ({
      ...prev,
      splitTimes: [
        ...prev.splitTimes,
        {
          distance: 0,
          splitTime: 0,
          splitTimeDisplayValue: '',
          uiKey: `split-${Date.now()}`
        }
      ]
    }))
  }

  const handleAddSplitTimesEvery25m = (entryIndex: number) => {
    updateFormData(entryIndex, (prev) => {
      const entryInfo = entryDataList[entryIndex]
      const styleId = entryInfo ? String(entryInfo.styleId) : prev.styleId
      const style = styles.find(s => s.id.toString() === styleId)
      if (!style || !style.distance) return prev

      const raceDistance = style.distance
      const existingDistances = new Set(
        prev.splitTimes
          .map(st => typeof st.distance === 'number' ? st.distance : st.distance === '' ? null : parseInt(String(st.distance)) || null)
          .filter((d): d is number => d !== null)
      )

      // 25m間隔で種目の距離までsplit-timeを追加
      const newSplitTimes: SplitTimeDraft[] = []
      for (let distance = 25; distance <= raceDistance; distance += 25) {
        // 既に存在する距離はスキップ
        if (!existingDistances.has(distance)) {
          newSplitTimes.push({
            distance,
            splitTime: 0,
            splitTimeDisplayValue: '',
            uiKey: `split-${Date.now()}-${distance}`
          })
        }
      }

      if (newSplitTimes.length === 0) return prev

      return {
        ...prev,
        splitTimes: [...prev.splitTimes, ...newSplitTimes]
      }
    })
  }

  const handleRemoveSplitTime = (entryIndex: number, splitIndex: number) => {
    updateFormData(entryIndex, (prev) => ({
      ...prev,
      splitTimes: prev.splitTimes.filter((_, i) => i !== splitIndex)
    }))
  }

  const handleSplitTimeChange = (
    entryIndex: number,
    splitIndex: number,
    field: 'distance' | 'splitTime',
    value: string
  ) => {
    updateFormData(entryIndex, (prev) => {
      const entryInfo = entryDataList[entryIndex]
      const styleId = entryInfo ? String(entryInfo.styleId) : prev.styleId
      const style = styles.find(s => s.id.toString() === styleId)
      const raceDistance = style?.distance

      const updatedSplitTimes = prev.splitTimes.map((st, i) => {
        if (i !== splitIndex) return st
        if (field === 'distance') {
          return { ...st, distance: value === '' ? 0 : parseInt(value) || 0 }
        }
        const parsedTime = value.trim() === '' ? 0 : parseTimeToSeconds(value)
        return {
          ...st,
          splitTimeDisplayValue: value,
          splitTime: parsedTime
        }
      })

      // split-timeが変更された場合、種目の距離と同じ距離のsplit-timeならタイムも更新
      const updatedSplit = updatedSplitTimes[splitIndex]
      if (
        field === 'splitTime' &&
        raceDistance &&
        typeof updatedSplit.distance === 'number' &&
        updatedSplit.distance === raceDistance
      ) {
        // 種目の距離と同じ距離のsplit-timeが変更されたら、タイムも同期
        return {
          ...prev,
          splitTimes: updatedSplitTimes,
          time: updatedSplit.splitTime,
          timeDisplayValue: updatedSplit.splitTimeDisplayValue || formatSecondsToDisplay(updatedSplit.splitTime)
        }
      }

      return {
        ...prev,
        splitTimes: updatedSplitTimes
      }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitted(true)

    let hasStyleError = false
    const submitList: RecordLogFormData[] = formDataList.reduce<RecordLogFormData[]>((acc, data, index) => {
      const entryInfo = entryDataList[index]
      const styleId = entryInfo ? String(entryInfo.styleId) : data.styleId

      if (!styleId) {
        hasStyleError = true
        console.error('種目を選択してください')
        return acc
      }

      if (data.time <= 0) {
        // タイム未入力のものはスキップ
        return acc
      }

      const validSplitTimes = data.splitTimes
        .map((st) => {
          const distance =
            typeof st.distance === 'number' ? st.distance : st.distance === '' ? NaN : parseInt(String(st.distance))
          if (!isNaN(distance) && distance > 0 && st.splitTime > 0) {
            return {
              distance,
              splitTime: st.splitTime
            }
          }
          return null
        })
        .filter((st): st is { distance: number; splitTime: number } => st !== null)

      acc.push({
        ...data,
        styleId,
        splitTimes: validSplitTimes
      })
      return acc
    }, [])

    if (hasStyleError) return

    if (submitList.length === 0) {
      console.error('タイムを入力してください（形式: 分:秒.小数 または 秒.小数）')
      return
    }

    try {
      await onSubmit(submitList)
      setHasUnsavedChanges(false)
    } catch (error) {
      console.error('フォーム送信エラー:', error)
      setIsSubmitted(false)
    }
  }

  const handleClose = () => {
    if (hasUnsavedChanges && !isSubmitted) {
      const confirmed = window.confirm('入力内容が保存されていません。このまま閉じますか？')
      if (!confirmed) {
        return
      }
    }
    setFormDataList([])
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto" data-testid="record-form-modal">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* オーバーレイ */}
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={handleClose}></div>

        {/* モーダルコンテンツ */}
        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-3xl">
          <form onSubmit={handleSubmit}>
            {/* ヘッダー */}
            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  {editData ? '記録編集' : '記録登録'}
                </h3>
                <button
                  type="button"
                  onClick={handleClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
            </div>

            <div className="px-4 pb-6 sm:px-6 sm:pb-6 space-y-6">
              {formDataList.map((formData, index) => {
                const entryInfo = entryDataList[index]
                const sectionIndex = index + 1
                const styleOptions = styles.map((style) => ({
                  id: style.id.toString(),
                  label: style.nameJp
                }))

                return (
                  <div
                    key={entryInfo ? `${entryInfo.styleId}-${index}` : `record-${index}`}
                    className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 sm:p-6 space-y-4"
                    data-testid={`record-entry-section-${sectionIndex}`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <h4 className="text-base font-semibold text-gray-900">
                        記録入力 {sectionIndex}
                      </h4>
                      {entryInfo && (
                        <div className="text-sm text-blue-800 bg-blue-100 px-3 py-1 rounded-full inline-flex items-center gap-2">
                          <span className="font-medium">{entryInfo.styleName}</span>
                          {entryInfo.entryTime && entryInfo.entryTime > 0 && (
                            <span className="text-blue-700">
                              entry: {formatTime(entryInfo.entryTime)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 種目 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        種目 <span className="text-red-500">*</span>
                      </label>
                      {entryInfo ? (
                        <div className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-100 text-gray-700">
                          {entryInfo.styleName}
                        </div>
                      ) : (
                        <select
                          value={formData.styleId}
                          onChange={(e) =>
                            updateFormData(index, (prev) => ({
                              ...prev,
                              styleId: e.target.value
                            }))
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          required
                          data-testid={`record-style-${sectionIndex}`}
                        >
                          <option value="">種目を選択</option>
                          {styleOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
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
                        onChange={(e) => handleTimeChange(index, e.target.value)}
                        placeholder="例: 1:23.45 または 32.45"
                        className="w-full"
                        data-testid={`record-time-${sectionIndex}`}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        形式: 分:秒.小数（例: 1:23.45）または 秒.小数（例: 32.45）
                      </p>
                    </div>

                    {/* リレー */}
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id={`isRelaying-${sectionIndex}`}
                        checked={formData.isRelaying}
                        onChange={(e) => handleToggleRelaying(index, e.target.checked)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        data-testid={`record-relay-${sectionIndex}`}
                      />
                      <label htmlFor={`isRelaying-${sectionIndex}`} className="ml-2 text-sm text-gray-700">
                        リレー種目
                      </label>
                    </div>

                    {/* スプリットタイム */}
                    <div data-testid={editData ? 'split-time-modal' : undefined}>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700">
                          スプリットタイム
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleAddSplitTimesEvery25m(index)}
                            className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50 border border-blue-300 rounded"
                            disabled={isLoading || !(entryInfo ? styles.find(s => s.id.toString() === entryInfo.styleId?.toString())?.distance : styles.find(s => s.id.toString() === formData.styleId)?.distance)}
                            data-testid={`record-split-add-25m-button-${sectionIndex}`}
                          >
                            <PlusIcon className="h-4 w-4 mr-1" />
                            追加(25mごと)
                          </button>
                        <button
                          type="button"
                          onClick={() => handleAddSplitTime(index)}
                            className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50 border border-blue-300 rounded"
                          disabled={isLoading}
                          data-testid={`record-split-add-button-${sectionIndex}`}
                        >
                          <PlusIcon className="h-4 w-4 mr-1" />
                          追加
                        </button>
                        </div>
                      </div>
                      {formData.splitTimes.length === 0 ? (
                        <p className="text-sm text-gray-500">スプリットタイムはありません</p>
                      ) : (
                        <div className="space-y-2">
                          {[...formData.splitTimes]
                            .sort((a, b) => {
                              const distA = typeof a.distance === 'number' ? a.distance : a.distance === '' ? 0 : parseInt(String(a.distance)) || 0
                              const distB = typeof b.distance === 'number' ? b.distance : b.distance === '' ? 0 : parseInt(String(b.distance)) || 0
                              return distA - distB
                            })
                            .map((st) => {
                              const originalIndex = formData.splitTimes.findIndex(s => s.uiKey === st.uiKey)
                              return { st, originalIndex }
                            })
                            .map(({ st, originalIndex }, splitIndex) => (
                            <div key={st.uiKey || `${index}-${originalIndex}`} className="flex items-center space-x-2">
                              <Input
                                type="number"
                                value={st.distance}
                                onChange={(e) =>
                                  handleSplitTimeChange(index, originalIndex, 'distance', e.target.value)
                                }
                                placeholder="距離 (m)"
                                className="w-24"
                                data-testid={`record-split-distance-${sectionIndex}-${originalIndex + 1}`}
                              />
                              <Input
                                type="text"
                                value={st.splitTimeDisplayValue || ''}
                                onChange={(e) =>
                                  handleSplitTimeChange(index, originalIndex, 'splitTime', e.target.value)
                                }
                                placeholder="例: 28.50 または 0:28.50"
                                className="flex-1"
                                data-testid={`record-split-time-${sectionIndex}-${originalIndex + 1}`}
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveSplitTime(index, originalIndex)}
                                className="p-2 text-red-600 hover:text-red-700"
                                disabled={isLoading}
                                data-testid={`record-split-remove-button-${sectionIndex}-${splitIndex + 1}`}
                              >
                                <TrashIcon className="h-5 w-5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Lap-Time表示 */}
                      <LapTimeDisplay
                        splitTimes={formData.splitTimes.map(st => ({
                          distance: st.distance,
                          splitTime: st.splitTime
                        }))}
                        raceDistance={
                          entryInfo
                            ? styles.find(s => s.id.toString() === entryInfo.styleId?.toString())?.distance
                            : styles.find(s => s.id.toString() === formData.styleId)?.distance
                        }
                      />
                    </div>

                    {/* ビデオURL */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        ビデオURL
                      </label>
                      <Input
                        type="url"
                        value={formData.videoUrl}
                        onChange={(e) => handleVideoChange(index, e.target.value)}
                        placeholder="https://..."
                        className="w-full"
                        data-testid={`record-video-${sectionIndex}`}
                      />
                    </div>

                    {/* メモ */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        メモ
                      </label>
                      <textarea
                        value={formData.note}
                        onChange={(e) => handleNoteChange(index, e.target.value)}
                        placeholder="記録に関するメモ（任意）"
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        data-testid={`record-note-${sectionIndex}`}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* フッター */}
            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full sm:w-auto sm:ml-3"
                data-testid={editData ? 'update-record-button' : 'save-record-button'}
              >
                {isLoading ? '保存中...' : editData ? '更新' : '保存'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isLoading}
                className="mt-3 w-full sm:mt-0 sm:w-auto"
              >
                キャンセル
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

