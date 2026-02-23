'use client'

import { useState, useEffect, useCallback } from 'react'
import type { EntryInfo } from '@apps/shared/types/ui'
import type {
  RecordLogFormState,
  RecordLogFormData,
  RecordLogEditData,
  SplitTimeDraft,
  SplitTimeRow,
  StyleOption,
} from '../types'
import { formatSecondsToDisplay, parseTimeToSeconds } from '../utils/formatters'

interface UseRecordLogFormOptions {
  isOpen: boolean
  editData?: RecordLogEditData | null
  entryDataList?: EntryInfo[]
  styles?: StyleOption[]
}

interface UseRecordLogFormReturn {
  formDataList: RecordLogFormState[]
  hasUnsavedChanges: boolean
  isSubmitted: boolean
  setIsSubmitted: (value: boolean) => void
  resetUnsavedChanges: () => void
  resetFormData: () => void
  handleTimeChange: (index: number, value: string) => void
  handleToggleRelaying: (index: number, checked: boolean) => void
  handleNoteChange: (index: number, value: string) => void
  handleVideoChange: (index: number, value: string) => void
  handleReactionTimeChange: (index: number, value: string) => void
  handleStyleChange: (index: number, value: string) => void
  handleAddSplitTime: (entryIndex: number) => void
  handleAddSplitTimesEvery25m: (entryIndex: number) => void
  handleRemoveSplitTime: (entryIndex: number, splitIndex: number) => void
  handleSplitTimeChange: (
    entryIndex: number,
    splitIndex: number,
    field: 'distance' | 'splitTime',
    value: string
  ) => void
  prepareSubmitData: () => { hasStyleError: boolean; submitList: RecordLogFormData[] }
}

function createDefaultState(styleId: string): RecordLogFormState {
  return {
    styleId,
    time: 0,
    timeDisplayValue: '',
    isRelaying: false,
    splitTimes: [],
    note: '',
    videoUrl: '',
    reactionTime: '',
  }
}

/**
 * RecordLogForm の状態管理フック
 */
export const useRecordLogForm = ({
  isOpen,
  editData,
  entryDataList = [],
  styles = [],
}: UseRecordLogFormOptions): UseRecordLogFormReturn => {
  const [formDataList, setFormDataList] = useState<RecordLogFormState[]>([])
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

  // 初期化
  useEffect(() => {
    if (!isOpen || isInitialized) return

    if (editData) {
      const splitTimes =
        editData.splitTimes?.map((st: SplitTimeRow, index: number) => ({
          distance: st.distance,
          splitTime: st.splitTime,
          splitTimeDisplayValue: formatSecondsToDisplay(st.splitTime),
          uiKey: `split-${index}`,
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
          videoUrl: editData.videoUrl || '',
          reactionTime: editData.reactionTime?.toString() || '',
        },
      ])
      setIsInitialized(true)
    } else if (entryDataList.length > 0) {
      setFormDataList(
        entryDataList.map((entry, index) =>
          createDefaultState(
            entry.styleId ? String(entry.styleId) : styles[index]?.id?.toString() || ''
          )
        )
      )
      setIsInitialized(true)
    } else {
      setFormDataList([createDefaultState(styles[0]?.id ? String(styles[0].id) : '')])
      setIsInitialized(true)
    }
  }, [isOpen, editData, entryDataList, isInitialized, styles])

  const updateFormData = useCallback(
    (index: number, updater: (prev: RecordLogFormState) => RecordLogFormState) => {
      setFormDataList((prev) =>
        prev.map((item, i) => (i !== index ? item : updater(item)))
      )
      setHasUnsavedChanges(true)
    },
    []
  )

  const handleTimeChange = useCallback(
    (index: number, value: string) => {
      updateFormData(index, (prev) => {
        const newTime = parseTimeToSeconds(value)
        const entryInfo = entryDataList[index]
        const styleId = entryInfo ? String(entryInfo.styleId) : prev.styleId
        const style = styles.find((s) => s.id.toString() === styleId)
        const raceDistance = style?.distance

        let updatedSplitTimes = [...prev.splitTimes]

        if (raceDistance && newTime > 0) {
          const existingSplitIndex = updatedSplitTimes.findIndex(
            (st) => typeof st.distance === 'number' && st.distance === raceDistance
          )

          if (existingSplitIndex >= 0) {
            updatedSplitTimes = updatedSplitTimes.map((st, idx) =>
              idx === existingSplitIndex
                ? {
                    ...st,
                    splitTime: newTime,
                    splitTimeDisplayValue: formatSecondsToDisplay(newTime),
                  }
                : st
            )
          } else {
            updatedSplitTimes = [
              ...updatedSplitTimes,
              {
                distance: raceDistance,
                splitTime: newTime,
                splitTimeDisplayValue: formatSecondsToDisplay(newTime),
                uiKey: `split-${Date.now()}`,
              },
            ]
          }
        }

        return {
          ...prev,
          timeDisplayValue: value,
          time: newTime,
          splitTimes: updatedSplitTimes,
        }
      })
    },
    [updateFormData, entryDataList, styles]
  )

  const handleToggleRelaying = useCallback(
    (index: number, checked: boolean) => {
      updateFormData(index, (prev) => ({ ...prev, isRelaying: checked }))
    },
    [updateFormData]
  )

  const handleNoteChange = useCallback(
    (index: number, value: string) => {
      updateFormData(index, (prev) => ({ ...prev, note: value }))
    },
    [updateFormData]
  )

  const handleVideoChange = useCallback(
    (index: number, value: string) => {
      updateFormData(index, (prev) => ({ ...prev, videoUrl: value }))
    },
    [updateFormData]
  )

  const handleReactionTimeChange = useCallback(
    (index: number, value: string) => {
      updateFormData(index, (prev) => ({ ...prev, reactionTime: value }))
    },
    [updateFormData]
  )

  const handleStyleChange = useCallback(
    (index: number, value: string) => {
      updateFormData(index, (prev) => ({ ...prev, styleId: value }))
    },
    [updateFormData]
  )

  const handleAddSplitTime = useCallback(
    (entryIndex: number) => {
      updateFormData(entryIndex, (prev) => ({
        ...prev,
        splitTimes: [
          ...prev.splitTimes,
          {
            distance: 0,
            splitTime: 0,
            splitTimeDisplayValue: '',
            uiKey: `split-${Date.now()}`,
          },
        ],
      }))
    },
    [updateFormData]
  )

  const handleAddSplitTimesEvery25m = useCallback(
    (entryIndex: number) => {
      updateFormData(entryIndex, (prev) => {
        const entryInfo = entryDataList[entryIndex]
        const styleId = entryInfo ? String(entryInfo.styleId) : prev.styleId
        const style = styles.find((s) => s.id.toString() === styleId)
        if (!style || !style.distance) return prev

        const raceDistance = style.distance
        const existingDistances = new Set(
          prev.splitTimes
            .map((st) =>
              typeof st.distance === 'number'
                ? st.distance
                : st.distance === ''
                  ? null
                  : parseFloat(String(st.distance)) || null
            )
            .filter((d): d is number => d !== null)
        )

        const newSplitTimes: SplitTimeDraft[] = []
        for (let distance = 25; distance <= raceDistance; distance += 25) {
          if (!existingDistances.has(distance)) {
            newSplitTimes.push({
              distance,
              splitTime: 0,
              splitTimeDisplayValue: '',
              uiKey: `split-${Date.now()}-${distance}`,
            })
          }
        }

        if (newSplitTimes.length === 0) return prev

        return {
          ...prev,
          splitTimes: [...prev.splitTimes, ...newSplitTimes],
        }
      })
    },
    [updateFormData, entryDataList, styles]
  )

  const handleRemoveSplitTime = useCallback(
    (entryIndex: number, splitIndex: number) => {
      updateFormData(entryIndex, (prev) => ({
        ...prev,
        splitTimes: prev.splitTimes.filter((_, i) => i !== splitIndex),
      }))
    },
    [updateFormData]
  )

  const handleSplitTimeChange = useCallback(
    (
      entryIndex: number,
      splitIndex: number,
      field: 'distance' | 'splitTime',
      value: string
    ) => {
      updateFormData(entryIndex, (prev) => {
        const entryInfo = entryDataList[entryIndex]
        const styleId = entryInfo ? String(entryInfo.styleId) : prev.styleId
        const style = styles.find((s) => s.id.toString() === styleId)
        const raceDistance = style?.distance

        const updatedSplitTimes = prev.splitTimes.map((st, i) => {
          if (i !== splitIndex) return st
          if (field === 'distance') {
            if (value === '') return { ...st, distance: '' }
            if (value.endsWith('.')) return { ...st, distance: value }
            const numValue = parseFloat(value)
            return { ...st, distance: isNaN(numValue) ? value : numValue }
          }
          const parsedTime = value.trim() === '' ? 0 : parseTimeToSeconds(value)
          return {
            ...st,
            splitTimeDisplayValue: value,
            splitTime: parsedTime,
          }
        })

        const updatedSplit = updatedSplitTimes[splitIndex]
        if (
          field === 'splitTime' &&
          raceDistance &&
          typeof updatedSplit.distance === 'number' &&
          updatedSplit.distance === raceDistance
        ) {
          return {
            ...prev,
            splitTimes: updatedSplitTimes,
            time: updatedSplit.splitTime,
            timeDisplayValue:
              updatedSplit.splitTimeDisplayValue ||
              formatSecondsToDisplay(updatedSplit.splitTime),
          }
        }

        return {
          ...prev,
          splitTimes: updatedSplitTimes,
        }
      })
    },
    [updateFormData, entryDataList, styles]
  )

  const resetUnsavedChanges = useCallback(() => {
    setHasUnsavedChanges(false)
  }, [])

  const resetFormData = useCallback(() => {
    setFormDataList([])
  }, [])

  const prepareSubmitData = useCallback((): {
    hasStyleError: boolean
    submitList: RecordLogFormData[]
  } => {
    let hasStyleError = false
    const submitList: RecordLogFormData[] = formDataList.reduce<RecordLogFormData[]>(
      (acc, data, index) => {
        const entryInfo = entryDataList[index]
        const styleId = entryInfo ? String(entryInfo.styleId) : data.styleId

        if (!styleId) {
          hasStyleError = true
          return acc
        }

        if (data.time <= 0) {
          return acc
        }

        // 種目の距離を取得
        const style = styles.find((s) => s.id.toString() === styleId)
        const raceDistance = style?.distance

        const validSplitTimes = data.splitTimes
          .map((st) => {
            const distance =
              typeof st.distance === 'number'
                ? st.distance
                : st.distance === ''
                  ? NaN
                  : parseFloat(String(st.distance))
            if (!isNaN(distance) && distance > 0 && st.splitTime > 0) {
              return { distance, splitTime: st.splitTime }
            }
            return null
          })
          .filter((st): st is { distance: number; splitTime: number } => st !== null)
          // 種目の距離と同じ距離のsplit_timeは保存しない
          // （ゴールタイム=split_timeなので途中経過ではない）
          .filter((st) => !(raceDistance && st.distance === raceDistance))

        acc.push({
          ...data,
          styleId,
          splitTimes: validSplitTimes,
        })
        return acc
      },
      []
    )

    return { hasStyleError, submitList }
  }, [formDataList, entryDataList, styles])

  return {
    formDataList,
    hasUnsavedChanges,
    isSubmitted,
    setIsSubmitted,
    resetUnsavedChanges,
    resetFormData,
    handleTimeChange,
    handleToggleRelaying,
    handleNoteChange,
    handleVideoChange,
    handleReactionTimeChange,
    handleStyleChange,
    handleAddSplitTime,
    handleAddSplitTimesEvery25m,
    handleRemoveSplitTime,
    handleSplitTimeChange,
    prepareSubmitData,
  }
}

export default useRecordLogForm
