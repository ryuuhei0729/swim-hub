import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, createMockPractice } from '../../__mocks__/supabase'
import { PracticeAPI } from '../../api/practices'
import { usePractices } from '../../hooks/usePractices'

type PracticeApiMock = {
  getPractices: ReturnType<typeof vi.fn>
  createPractice: ReturnType<typeof vi.fn>
  updatePractice: ReturnType<typeof vi.fn>
  deletePractice: ReturnType<typeof vi.fn>
  createPracticeLog: ReturnType<typeof vi.fn>
  updatePracticeLog: ReturnType<typeof vi.fn>
  deletePracticeLog: ReturnType<typeof vi.fn>
  createPracticeTimes: ReturnType<typeof vi.fn>
  replacePracticeTimes: ReturnType<typeof vi.fn>
  createPracticeTime: ReturnType<typeof vi.fn>
  deletePracticeTime: ReturnType<typeof vi.fn>
  subscribeToPractices: ReturnType<typeof vi.fn>
}

describe('usePractices', () => {
  let mockClient: any
  let practiceApiMock: PracticeApiMock
  let api: PracticeAPI

  beforeEach(() => {
    vi.clearAllMocks()
    // console.errorをモックしてstderrへの出力を抑制
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockClient = createMockSupabaseClient()
    practiceApiMock = {
      getPractices: vi.fn(),
      createPractice: vi.fn(),
      updatePractice: vi.fn(),
      deletePractice: vi.fn(),
      createPracticeLog: vi.fn(),
      updatePracticeLog: vi.fn(),
      deletePracticeLog: vi.fn(),
      createPracticeTimes: vi.fn(),
      replacePracticeTimes: vi.fn(),
      createPracticeTime: vi.fn(),
      deletePracticeTime: vi.fn(),
      subscribeToPractices: vi.fn(),
    }
    api = practiceApiMock as unknown as PracticeAPI
  })

  describe('初期化', () => {
    it('初期表示でローディング状態になる', async () => {
      const mockPractices = [createMockPractice()]
      practiceApiMock.getPractices.mockResolvedValue(mockPractices)

      const { result } = renderHook(() => usePractices(mockClient, { api }))

      await act(async () => {
        expect(result.current.loading).toBe(true)
        expect(result.current.practices).toEqual([])
        expect(result.current.error).toBeNull()
      })
    })

    it('マウント時に練習記録を読み込む', async () => {
      const mockPractices = [createMockPractice()]
      practiceApiMock.getPractices.mockResolvedValue(mockPractices)

      const { result } = renderHook(() => usePractices(mockClient, { api }))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(practiceApiMock.getPractices).toHaveBeenCalled()
      expect(result.current.practices).toEqual(mockPractices)
    })
  })

  describe('データ取得', () => {
    it('日付範囲を指定したとき該当期間の練習記録を取得できる', async () => {
      const mockPractices = [createMockPractice()]
      practiceApiMock.getPractices.mockResolvedValue(mockPractices)

      const { result } = renderHook(() =>
        usePractices(mockClient, {
          startDate: '2025-01-01',
          endDate: '2025-01-31',
          api,
        })
      )

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(practiceApiMock.getPractices).toHaveBeenCalledWith('2025-01-01', '2025-01-31')
    })

    it('取得エラーが発生したときエラーを処理できる', async () => {
      const error = new Error('Fetch failed')
      practiceApiMock.getPractices.mockRejectedValue(error)

      const { result } = renderHook(() => usePractices(mockClient, { api }))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toEqual(error)
      expect(result.current.practices).toEqual([])
    })
  })

  describe('操作関数', () => {
    it('練習記録を作成できる', async () => {
      const newPractice = {
        date: '2025-01-15',
        place: 'テストプール',
        memo: 'テスト練習',
        note: 'テスト練習のメモ',
      }
      const createdPractice = createMockPractice(newPractice)
      
      practiceApiMock.getPractices.mockResolvedValue([])
      practiceApiMock.createPractice.mockResolvedValue(createdPractice)

      const { result } = renderHook(() => usePractices(mockClient, { api }))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.createPractice(newPractice)
      })

      expect(practiceApiMock.createPractice).toHaveBeenCalledWith(newPractice)
      expect(practiceApiMock.getPractices).toHaveBeenCalledTimes(2) // 初回 + 再取得
    })

    it('練習記録を更新できる', async () => {
      const practiceId = 'practice-1'
      const updates = { place: '更新後プール' }
      
      practiceApiMock.getPractices.mockResolvedValue([])
      practiceApiMock.updatePractice.mockResolvedValue(createMockPractice(updates))

      const { result } = renderHook(() => usePractices(mockClient, { api }))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.updatePractice(practiceId, updates)
      })

      expect(practiceApiMock.updatePractice).toHaveBeenCalledWith(practiceId, updates)
    })

    it('練習記録を削除できる', async () => {
      const practiceId = 'practice-1'
      
      practiceApiMock.getPractices.mockResolvedValue([])
      practiceApiMock.deletePractice.mockResolvedValue(undefined)

      const { result } = renderHook(() => usePractices(mockClient, { api }))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.deletePractice(practiceId)
      })

      expect(practiceApiMock.deletePractice).toHaveBeenCalledWith(practiceId)
    })
  })

  describe('リアルタイム購読', () => {
    it('リアルタイム更新を購読できる', async () => {
      const mockChannel = { unsubscribe: vi.fn() }
      practiceApiMock.subscribeToPractices.mockReturnValue(mockChannel)
      practiceApiMock.getPractices.mockResolvedValue([])

      const { result, unmount } = renderHook(() => usePractices(mockClient, { api }))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(practiceApiMock.subscribeToPractices).toHaveBeenCalled()

      unmount()
      expect(mockClient.removeChannel).toHaveBeenCalledWith(mockChannel)
    })

    it('リアルタイムが無効のとき購読しない', async () => {
      practiceApiMock.getPractices.mockResolvedValue([])

      const { result } = renderHook(() =>
        usePractices(mockClient, { enableRealtime: false, api })
      )

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(practiceApiMock.subscribeToPractices).not.toHaveBeenCalled()
    })
  })

  describe('リフレッシュ', () => {
    it('データをリフレッシュできる', async () => {
      const mockPractices = [createMockPractice()]
      practiceApiMock.getPractices.mockResolvedValue(mockPractices)

      const { result } = renderHook(() => usePractices(mockClient, { api }))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // リフレッシュ実行
      await act(async () => {
        await result.current.refresh()
      })

      expect(practiceApiMock.getPractices).toHaveBeenCalledTimes(2) // 初回 + リフレッシュ
    })
  })
})
