'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import type {
  RecordFormData,
  RecordSet,
  SplitTimeInput,
  EditData,
  EditRecord,
  EditSplitTime,
  SwimStyle,
} from '../types'
import { generateUUID } from '../utils/timeParser'

interface UseRecordFormOptions {
  isOpen: boolean
  initialDate?: Date
  editData?: EditData
  styles?: SwimStyle[]
}

interface UseRecordFormReturn {
  formData: RecordFormData
  setFormData: React.Dispatch<React.SetStateAction<RecordFormData>>
  hasUnsavedChanges: boolean
  isSubmitted: boolean
  setIsSubmitted: (value: boolean) => void
  resetUnsavedChanges: () => void
  addRecord: () => void
  removeRecord: (recordId: string) => void
  updateRecord: (recordId: string, updates: Partial<RecordSet>) => void
  addSplitTime: (recordId: string) => void
  addSplitTimesEvery25m: (recordId: string) => void
  updateSplitTime: (recordId: string, splitIndex: number, updates: Partial<SplitTimeInput>) => void
  removeSplitTime: (recordId: string, splitIndex: number) => void
  sanitizeFormData: () => RecordFormData
}

/**
 * RecordForm の状態管理フック
 */
export const useRecordForm = ({
  isOpen,
  initialDate,
  editData,
  styles = [],
}: UseRecordFormOptions): UseRecordFormReturn => {
  const [formData, setFormData] = useState<RecordFormData>(() =>
    createInitialFormData(initialDate, styles)
  )
  const [isInitialized, setIsInitialized] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  // モーダルが閉じた時にリセット
  useEffect(() => {
    if (!isOpen) {
      setIsInitialized(false)
      setHasUnsavedChanges(false)
      setIsSubmitted(false)
    }
  }, [isOpen])

  // initialDateが変更された時にフォームデータを更新
  useEffect(() => {
    if (isOpen && initialDate) {
      setFormData((prev) => ({
        ...prev,
        recordDate: format(initialDate, 'yyyy-MM-dd'),
      }))
    }
  }, [isOpen, initialDate])

  // フォームに変更があったことを記録
  useEffect(() => {
    if (isOpen && isInitialized) {
      setHasUnsavedChanges(true)
    }
  }, [formData, isOpen, isInitialized])

  // 編集データがある場合、フォームを初期化
  useEffect(() => {
    if (!isOpen || isInitialized) return

    if (editData) {
      // 複数のRecordが存在する場合の処理
      if (editData.records && editData.records.length > 0) {
        const records: RecordSet[] = editData.records.map(
          (record: EditRecord, index: number) => ({
            id: record.id || `record-${index}`,
            styleId: record.styleId || styles[0]?.id || '',
            time: record.time || 0,
            isRelaying: record.isRelaying || false,
            splitTimes:
              record.splitTimes?.map((st: EditSplitTime) => ({
                distance: st.distance,
                splitTime: st.splitTime,
                uiKey: generateUUID(),
              })) || [],
            note: record.note || '',
            videoUrl: record.videoUrl || '',
            reactionTime: record.reactionTime?.toString() || '',
          })
        )

        setFormData({
          recordDate: editData.recordDate || format(new Date(), 'yyyy-MM-dd'),
          place: editData.place || '',
          competitionName: editData.competitionName || '',
          poolType: editData.poolType || 0,
          records: records,
          note: editData.note || '',
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
        records: [
          {
            id: editData.id || '1',
            styleId: editData.styleId || styles[0]?.id || '',
            time: editData.time || 0,
            isRelaying: editData.isRelaying || false,
            splitTimes:
              editData.splitTimes?.map((st: EditSplitTime) => ({
                distance: st.distance,
                splitTime: st.splitTime,
                uiKey: generateUUID(),
              })) || [],
            note: editData.note || '',
            videoUrl: editData.videoUrl || '',
            reactionTime: editData.reactionTime?.toString() || '',
          },
        ],
        note: editData.note || '',
      })
      setIsInitialized(true)
    } else if (!editData && isOpen) {
      // 新規作成時はデフォルト値にリセット
      setFormData(createInitialFormData(initialDate, styles))
      setIsInitialized(true)
    }
  }, [editData, isOpen, initialDate, isInitialized, styles])

  const resetUnsavedChanges = useCallback(() => {
    setHasUnsavedChanges(false)
  }, [])

  const addRecord = useCallback(() => {
    const newRecord: RecordSet = {
      id: `record-${Date.now()}`,
      styleId: styles[0]?.id || '',
      time: 0,
      isRelaying: false,
      splitTimes: [],
      note: '',
      videoUrl: '',
      reactionTime: '',
    }

    setFormData((prev) => ({
      ...prev,
      records: [...prev.records, newRecord],
    }))
  }, [styles])

  const removeRecord = useCallback((recordId: string) => {
    setFormData((prev) => {
      if (prev.records.length <= 1) return prev
      return {
        ...prev,
        records: prev.records.filter((record) => record.id !== recordId),
      }
    })
  }, [])

  const updateRecord = useCallback(
    (recordId: string, updates: Partial<RecordSet>) => {
      setFormData((prev) => {
        const record = prev.records.find((r) => r.id === recordId)
        if (!record) return prev

        const updatedRecord = { ...record, ...updates }
        const style = styles.find((s) => s.id === updatedRecord.styleId)
        const raceDistance = style?.distance

        // タイムが変更された場合、種目の距離と同じ距離のsplit-timeを自動追加/更新
        if (updates.time !== undefined && raceDistance && updatedRecord.time > 0) {
          const existingSplitIndex = updatedRecord.splitTimes.findIndex(
            (st) => typeof st.distance === 'number' && st.distance === raceDistance
          )

          if (existingSplitIndex >= 0) {
            updatedRecord.splitTimes = updatedRecord.splitTimes.map((st, idx) =>
              idx === existingSplitIndex
                ? { ...st, splitTime: updatedRecord.time, splitTimeDisplayValue: undefined }
                : st
            )
          } else {
            const newSplitTime: SplitTimeInput = {
              distance: raceDistance,
              splitTime: updatedRecord.time,
              uiKey: generateUUID(),
            }
            updatedRecord.splitTimes = [...updatedRecord.splitTimes, newSplitTime]
          }
        }

        return {
          ...prev,
          records: prev.records.map((r) => (r.id === recordId ? updatedRecord : r)),
        }
      })
    },
    [styles]
  )

  const addSplitTime = useCallback(
    (recordId: string) => {
      const newSplitTime: SplitTimeInput = {
        distance: '',
        splitTime: 0,
        uiKey: generateUUID(),
      }

      setFormData((prev) => {
        const record = prev.records.find((r) => r.id === recordId)
        if (!record) return prev

        return {
          ...prev,
          records: prev.records.map((r) =>
            r.id === recordId
              ? { ...r, splitTimes: [...r.splitTimes, newSplitTime] }
              : r
          ),
        }
      })
    },
    []
  )

  const addSplitTimesEvery25m = useCallback(
    (recordId: string) => {
      setFormData((prev) => {
        const record = prev.records.find((r) => r.id === recordId)
        if (!record) return prev

        const style = styles.find((s) => s.id === record.styleId)
        if (!style || !style.distance) return prev

        const raceDistance = style.distance
        const existingDistances = new Set(
          record.splitTimes
            .map((st) => (typeof st.distance === 'number' ? st.distance : null))
            .filter((d): d is number => d !== null)
        )

        const newSplitTimes: SplitTimeInput[] = []
        for (let distance = 25; distance <= raceDistance; distance += 25) {
          if (!existingDistances.has(distance)) {
            newSplitTimes.push({
              distance,
              splitTime: 0,
              uiKey: generateUUID(),
            })
          }
        }

        if (newSplitTimes.length === 0) return prev

        return {
          ...prev,
          records: prev.records.map((r) =>
            r.id === recordId
              ? { ...r, splitTimes: [...r.splitTimes, ...newSplitTimes] }
              : r
          ),
        }
      })
    },
    [styles]
  )

  const updateSplitTime = useCallback(
    (recordId: string, splitIndex: number, updates: Partial<SplitTimeInput>) => {
      setFormData((prev) => {
        const record = prev.records.find((r) => r.id === recordId)
        if (!record) return prev

        const style = styles.find((s) => s.id === record.styleId)
        const raceDistance = style?.distance

        const updatedSplitTimes = record.splitTimes.map((split, index) =>
          index === splitIndex ? { ...split, ...updates } : split
        )

        const updatedSplit = updatedSplitTimes[splitIndex]
        let updatedRecord = { ...record, splitTimes: updatedSplitTimes }

        // 種目の距離と同じ距離のsplit-timeが変更されたら、タイムも同期
        if (
          raceDistance &&
          typeof updatedSplit.distance === 'number' &&
          updatedSplit.distance === raceDistance &&
          updates.splitTime !== undefined
        ) {
          updatedRecord = {
            ...updatedRecord,
            time: updates.splitTime,
            timeDisplayValue: undefined,
          }
        }

        return {
          ...prev,
          records: prev.records.map((r) => (r.id === recordId ? updatedRecord : r)),
        }
      })
    },
    [styles]
  )

  const removeSplitTime = useCallback((recordId: string, splitIndex: number) => {
    setFormData((prev) => {
      const record = prev.records.find((r) => r.id === recordId)
      if (!record) return prev

      return {
        ...prev,
        records: prev.records.map((r) =>
          r.id === recordId
            ? {
                ...r,
                splitTimes: r.splitTimes.filter((_, index) => index !== splitIndex),
              }
            : r
        ),
      }
    })
  }, [])

  const sanitizeFormData = useCallback((): RecordFormData => {
    return {
      ...formData,
      records: formData.records.map((record) => ({
        ...record,
        splitTimes: record.splitTimes.map((st) => ({
          distance: st.distance,
          splitTime: st.splitTime,
        })),
      })),
    }
  }, [formData])

  return {
    formData,
    setFormData,
    hasUnsavedChanges,
    isSubmitted,
    setIsSubmitted,
    resetUnsavedChanges,
    addRecord,
    removeRecord,
    updateRecord,
    addSplitTime,
    addSplitTimesEvery25m,
    updateSplitTime,
    removeSplitTime,
    sanitizeFormData,
  }
}

function createInitialFormData(initialDate?: Date, styles?: SwimStyle[]): RecordFormData {
  return {
    recordDate: initialDate
      ? format(initialDate, 'yyyy-MM-dd')
      : format(new Date(), 'yyyy-MM-dd'),
    place: '',
    competitionName: '',
    poolType: 0,
    records: [
      {
        id: '1',
        styleId: styles?.[0]?.id || '',
        time: 0,
        isRelaying: false,
        splitTimes: [],
        note: '',
        videoUrl: '',
        reactionTime: '',
      },
    ],
    note: '',
  }
}

export default useRecordForm
