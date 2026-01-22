import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { format } from 'date-fns'

import { useRecordForm } from '../../components/forms/record/hooks/useRecordForm'
import type { SwimStyle, EditData } from '../../components/forms/record/types'

// generateUUID をモック
vi.mock('../../components/forms/record/utils/timeParser', () => ({
  generateUUID: vi.fn(() => `uuid-${Math.random().toString(36).substr(2, 9)}`),
}))

describe('useRecordForm', () => {
  const mockStyles: SwimStyle[] = [
    { id: 'style-1', nameJp: '自由形100m', distance: 100 },
    { id: 'style-2', nameJp: '平泳ぎ200m', distance: 200 },
    { id: 'style-3', nameJp: '背泳ぎ50m', distance: 50 },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('初期状態', () => {
    it('isOpen=falseのとき、デフォルトの初期値を持つ', () => {
      const { result } = renderHook(() =>
        useRecordForm({ isOpen: false, styles: mockStyles })
      )

      expect(result.current.formData.records).toHaveLength(1)
      expect(result.current.formData.records[0].styleId).toBe('style-1')
      expect(result.current.formData.records[0].time).toBe(0)
      expect(result.current.formData.records[0].splitTimes).toEqual([])
      expect(result.current.hasUnsavedChanges).toBe(false)
      expect(result.current.isSubmitted).toBe(false)
    })

    it('initialDateを渡すと、記録日が設定される', () => {
      const initialDate = new Date('2024-06-15')
      const { result } = renderHook(() =>
        useRecordForm({ isOpen: true, initialDate, styles: mockStyles })
      )

      expect(result.current.formData.recordDate).toBe('2024-06-15')
    })

    it('stylesが空の場合、styleIdは空文字になる', () => {
      const { result } = renderHook(() =>
        useRecordForm({ isOpen: true, styles: [] })
      )

      expect(result.current.formData.records[0].styleId).toBe('')
    })
  })

  describe('addRecord', () => {
    it('新しいレコードを追加する', () => {
      const { result } = renderHook(() =>
        useRecordForm({ isOpen: true, styles: mockStyles })
      )

      expect(result.current.formData.records).toHaveLength(1)

      act(() => {
        result.current.addRecord()
      })

      expect(result.current.formData.records).toHaveLength(2)
      expect(result.current.formData.records[1].styleId).toBe('style-1')
      expect(result.current.formData.records[1].time).toBe(0)
      expect(result.current.formData.records[1].isRelaying).toBe(false)
    })

    it('複数のレコードを追加できる', () => {
      const { result } = renderHook(() =>
        useRecordForm({ isOpen: true, styles: mockStyles })
      )

      act(() => {
        result.current.addRecord()
        result.current.addRecord()
        result.current.addRecord()
      })

      expect(result.current.formData.records).toHaveLength(4)
    })
  })

  describe('removeRecord', () => {
    it('指定したIDのレコードを削除する', () => {
      const { result } = renderHook(() =>
        useRecordForm({ isOpen: true, styles: mockStyles })
      )

      act(() => {
        result.current.addRecord()
      })

      const recordIdToRemove = result.current.formData.records[1].id

      act(() => {
        result.current.removeRecord(recordIdToRemove)
      })

      expect(result.current.formData.records).toHaveLength(1)
      expect(result.current.formData.records.find(r => r.id === recordIdToRemove)).toBeUndefined()
    })

    it('最後の1つのレコードは削除できない', () => {
      const { result } = renderHook(() =>
        useRecordForm({ isOpen: true, styles: mockStyles })
      )

      const recordId = result.current.formData.records[0].id

      act(() => {
        result.current.removeRecord(recordId)
      })

      expect(result.current.formData.records).toHaveLength(1)
    })
  })

  describe('updateRecord', () => {
    it('レコードのプロパティを更新する', () => {
      const { result } = renderHook(() =>
        useRecordForm({ isOpen: true, styles: mockStyles })
      )

      const recordId = result.current.formData.records[0].id

      act(() => {
        result.current.updateRecord(recordId, {
          time: 55.42,
          note: 'テストメモ',
          isRelaying: true,
        })
      })

      const updatedRecord = result.current.formData.records[0]
      expect(updatedRecord.time).toBe(55.42)
      expect(updatedRecord.note).toBe('テストメモ')
      expect(updatedRecord.isRelaying).toBe(true)
    })

    it('タイムを更新すると、種目の距離と同じ距離のsplit-timeが自動追加される', () => {
      const { result } = renderHook(() =>
        useRecordForm({ isOpen: true, styles: mockStyles })
      )

      const recordId = result.current.formData.records[0].id

      act(() => {
        result.current.updateRecord(recordId, { time: 55.42 })
      })

      const updatedRecord = result.current.formData.records[0]
      // style-1 は 100m なので、100m のsplit-timeが追加される
      const splitTime100m = updatedRecord.splitTimes.find(st => st.distance === 100)
      expect(splitTime100m).toBeDefined()
      expect(splitTime100m?.splitTime).toBe(55.42)
    })

    it('存在しないレコードIDの場合は何も変更しない', () => {
      const { result } = renderHook(() =>
        useRecordForm({ isOpen: true, styles: mockStyles })
      )

      const originalRecords = result.current.formData.records

      act(() => {
        result.current.updateRecord('non-existent-id', { time: 100 })
      })

      expect(result.current.formData.records).toEqual(originalRecords)
    })
  })

  describe('addSplitTime', () => {
    it('空のsplit-timeを追加する', () => {
      const { result } = renderHook(() =>
        useRecordForm({ isOpen: true, styles: mockStyles })
      )

      const recordId = result.current.formData.records[0].id

      act(() => {
        result.current.addSplitTime(recordId)
      })

      expect(result.current.formData.records[0].splitTimes).toHaveLength(1)
      expect(result.current.formData.records[0].splitTimes[0].distance).toBe('')
      expect(result.current.formData.records[0].splitTimes[0].splitTime).toBe(0)
    })

    it('複数のsplit-timeを追加できる', () => {
      const { result } = renderHook(() =>
        useRecordForm({ isOpen: true, styles: mockStyles })
      )

      const recordId = result.current.formData.records[0].id

      act(() => {
        result.current.addSplitTime(recordId)
        result.current.addSplitTime(recordId)
        result.current.addSplitTime(recordId)
      })

      expect(result.current.formData.records[0].splitTimes).toHaveLength(3)
    })
  })

  describe('addSplitTimesEvery25m', () => {
    it('25m刻みでsplit-timeを追加する', () => {
      const { result } = renderHook(() =>
        useRecordForm({ isOpen: true, styles: mockStyles })
      )

      const recordId = result.current.formData.records[0].id

      act(() => {
        result.current.addSplitTimesEvery25m(recordId)
      })

      const splitTimes = result.current.formData.records[0].splitTimes
      // style-1 は 100m なので、25m, 50m, 75m, 100m の4つが追加される
      expect(splitTimes).toHaveLength(4)
      expect(splitTimes.map(st => st.distance)).toEqual([25, 50, 75, 100])
    })

    it('すでに存在する距離はスキップする', () => {
      const { result } = renderHook(() =>
        useRecordForm({ isOpen: true, styles: mockStyles })
      )

      const recordId = result.current.formData.records[0].id

      // 50m のsplit-timeを先に追加
      act(() => {
        result.current.addSplitTime(recordId)
      })
      act(() => {
        result.current.updateSplitTime(recordId, 0, { distance: 50, splitTime: 25.0 })
      })

      act(() => {
        result.current.addSplitTimesEvery25m(recordId)
      })

      const splitTimes = result.current.formData.records[0].splitTimes
      // 50m は既に存在するので、25m, 75m, 100m の3つだけ追加される
      expect(splitTimes).toHaveLength(4)
      // 50m のsplit-timeは最初に追加したもの（25.0秒）
      const st50m = splitTimes.find(st => st.distance === 50)
      expect(st50m?.splitTime).toBe(25.0)
    })
  })

  describe('updateSplitTime', () => {
    it('split-timeを更新する', () => {
      const { result } = renderHook(() =>
        useRecordForm({ isOpen: true, styles: mockStyles })
      )

      const recordId = result.current.formData.records[0].id

      act(() => {
        result.current.addSplitTime(recordId)
      })

      act(() => {
        result.current.updateSplitTime(recordId, 0, { distance: 50, splitTime: 26.5 })
      })

      const splitTime = result.current.formData.records[0].splitTimes[0]
      expect(splitTime.distance).toBe(50)
      expect(splitTime.splitTime).toBe(26.5)
    })

    it('種目の距離と同じ距離のsplit-timeを更新すると、タイムも同期される', () => {
      const { result } = renderHook(() =>
        useRecordForm({ isOpen: true, styles: mockStyles })
      )

      const recordId = result.current.formData.records[0].id

      act(() => {
        result.current.addSplitTime(recordId)
      })

      // 100m（style-1 の距離）のsplit-timeを更新
      act(() => {
        result.current.updateSplitTime(recordId, 0, { distance: 100, splitTime: 55.42 })
      })

      // レコードのタイムも同期される
      expect(result.current.formData.records[0].time).toBe(55.42)
    })
  })

  describe('removeSplitTime', () => {
    it('指定したインデックスのsplit-timeを削除する', () => {
      const { result } = renderHook(() =>
        useRecordForm({ isOpen: true, styles: mockStyles })
      )

      const recordId = result.current.formData.records[0].id

      act(() => {
        result.current.addSplitTime(recordId)
        result.current.addSplitTime(recordId)
      })

      act(() => {
        result.current.updateSplitTime(recordId, 0, { distance: 25, splitTime: 12.0 })
        result.current.updateSplitTime(recordId, 1, { distance: 50, splitTime: 26.0 })
      })

      act(() => {
        result.current.removeSplitTime(recordId, 0)
      })

      expect(result.current.formData.records[0].splitTimes).toHaveLength(1)
      expect(result.current.formData.records[0].splitTimes[0].distance).toBe(50)
    })
  })

  describe('sanitizeFormData', () => {
    it('uiKeyを除去したフォームデータを返す', () => {
      const { result } = renderHook(() =>
        useRecordForm({ isOpen: true, styles: mockStyles })
      )

      const recordId = result.current.formData.records[0].id

      act(() => {
        result.current.addSplitTime(recordId)
      })

      // uiKeyが存在することを確認
      expect(result.current.formData.records[0].splitTimes[0].uiKey).toBeDefined()

      const sanitized = result.current.sanitizeFormData()

      // sanitized後はuiKeyが含まれない
      expect(sanitized.records[0].splitTimes[0]).not.toHaveProperty('uiKey')
      expect(sanitized.records[0].splitTimes[0]).toHaveProperty('distance')
      expect(sanitized.records[0].splitTimes[0]).toHaveProperty('splitTime')
    })
  })

  describe('hasUnsavedChanges', () => {
    it('フォームに変更があるとtrueになる', async () => {
      const { result, rerender } = renderHook(() =>
        useRecordForm({ isOpen: true, styles: mockStyles })
      )

      // 初期化後の状態を安定させる
      rerender()

      // 変更前の状態をリセット
      act(() => {
        result.current.resetUnsavedChanges()
      })

      expect(result.current.hasUnsavedChanges).toBe(false)

      act(() => {
        result.current.setFormData(prev => ({ ...prev, place: '東京辰巳' }))
      })

      // useEffectの実行を待つ
      rerender()

      expect(result.current.hasUnsavedChanges).toBe(true)
    })

    it('resetUnsavedChangesでfalseにリセットできる', async () => {
      const { result, rerender } = renderHook(() =>
        useRecordForm({ isOpen: true, styles: mockStyles })
      )

      // 初期化後の状態を安定させる
      rerender()

      act(() => {
        result.current.setFormData(prev => ({ ...prev, place: '東京辰巳' }))
      })

      rerender()
      expect(result.current.hasUnsavedChanges).toBe(true)

      act(() => {
        result.current.resetUnsavedChanges()
      })

      expect(result.current.hasUnsavedChanges).toBe(false)
    })
  })

  describe('編集データの初期化', () => {
    it('単一レコードの編集データを正しく初期化する', () => {
      const editData: EditData = {
        recordDate: '2024-06-15',
        place: '東京辰巳',
        competitionName: '日本選手権',
        poolType: 1,
        id: 'edit-1',
        styleId: 'style-2',
        time: 135.5,
        isRelaying: false,
        splitTimes: [
          { distance: 50, splitTime: 30.0 },
          { distance: 100, splitTime: 65.0 },
        ],
        note: 'テストメモ',
      }

      const { result } = renderHook(() =>
        useRecordForm({ isOpen: true, editData, styles: mockStyles })
      )

      expect(result.current.formData.recordDate).toBe('2024-06-15')
      expect(result.current.formData.place).toBe('東京辰巳')
      expect(result.current.formData.competitionName).toBe('日本選手権')
      expect(result.current.formData.poolType).toBe(1)
      expect(result.current.formData.records).toHaveLength(1)
      expect(result.current.formData.records[0].styleId).toBe('style-2')
      expect(result.current.formData.records[0].time).toBe(135.5)
      expect(result.current.formData.records[0].splitTimes).toHaveLength(2)
    })

    it('複数レコードの編集データを正しく初期化する', () => {
      const editData: EditData = {
        recordDate: '2024-06-15',
        place: '東京辰巳',
        competitionName: '日本選手権',
        poolType: 1,
        records: [
          {
            id: 'record-1',
            styleId: 'style-1',
            time: 55.0,
            isRelaying: false,
            splitTimes: [{ distance: 50, splitTime: 26.0 }],
            note: 'レコード1',
          },
          {
            id: 'record-2',
            styleId: 'style-2',
            time: 135.0,
            isRelaying: true,
            splitTimes: [],
            note: 'レコード2',
          },
        ],
        note: '全体メモ',
      }

      const { result } = renderHook(() =>
        useRecordForm({ isOpen: true, editData, styles: mockStyles })
      )

      expect(result.current.formData.records).toHaveLength(2)
      expect(result.current.formData.records[0].id).toBe('record-1')
      expect(result.current.formData.records[0].styleId).toBe('style-1')
      expect(result.current.formData.records[1].id).toBe('record-2')
      expect(result.current.formData.records[1].isRelaying).toBe(true)
    })
  })

  describe('コールバックの安定性', () => {
    it('addRecordは再レンダリングしても同じ参照を保つ', () => {
      const { result, rerender } = renderHook(() =>
        useRecordForm({ isOpen: true, styles: mockStyles })
      )

      const firstCallback = result.current.addRecord
      rerender()
      expect(result.current.addRecord).toBe(firstCallback)
    })

    it('removeRecordは再レンダリングしても同じ参照を保つ', () => {
      const { result, rerender } = renderHook(() =>
        useRecordForm({ isOpen: true, styles: mockStyles })
      )

      const firstCallback = result.current.removeRecord
      rerender()
      expect(result.current.removeRecord).toBe(firstCallback)
    })

    it('addSplitTimeは再レンダリングしても同じ参照を保つ', () => {
      const { result, rerender } = renderHook(() =>
        useRecordForm({ isOpen: true, styles: mockStyles })
      )

      const firstCallback = result.current.addSplitTime
      rerender()
      expect(result.current.addSplitTime).toBe(firstCallback)
    })

    it('removeSplitTimeは再レンダリングしても同じ参照を保つ', () => {
      const { result, rerender } = renderHook(() =>
        useRecordForm({ isOpen: true, styles: mockStyles })
      )

      const firstCallback = result.current.removeSplitTime
      rerender()
      expect(result.current.removeSplitTime).toBe(firstCallback)
    })

    it('resetUnsavedChangesは再レンダリングしても同じ参照を保つ', () => {
      const { result, rerender } = renderHook(() =>
        useRecordForm({ isOpen: true, styles: mockStyles })
      )

      const firstCallback = result.current.resetUnsavedChanges
      rerender()
      expect(result.current.resetUnsavedChanges).toBe(firstCallback)
    })
  })
})
