import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BestTime } from '../../components/team/shared/hooks/useMemberBestTimes'
import { useMemberBestTimes } from '../../components/team/shared/hooks/useMemberBestTimes'

// Supabaseクライアントのモックを作成するヘルパー
const createMockSupabase = (mockData: unknown[] | null = [], mockError: Error | null = null) => {
  const mockOrder = vi.fn().mockResolvedValue({ data: mockData, error: mockError })
  const mockEq = vi.fn().mockReturnValue({ order: mockOrder })
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
  const mockFrom = vi.fn().mockReturnValue({ select: mockSelect })

  return {
    from: mockFrom,
    _mocks: { mockFrom, mockSelect, mockEq, mockOrder },
  }
}

describe('useMemberBestTimes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ヘルパー: 基本的なモックSupabaseを返す
  const getBasicMockSupabase = () => createMockSupabase([], null)

  describe('BestTime型', () => {
    it('BestTime型が正しい構造を持つ', () => {
      const bestTime: BestTime = {
        id: 'test-id',
        time: 65.5,
        created_at: '2025-01-15T00:00:00Z',
        pool_type: 0, // 短水路
        is_relaying: false,
        style: {
          name_jp: '50m自由形',
          distance: 50,
        },
        competition: {
          title: 'テスト大会',
          date: '2025-01-15',
        },
      }

      expect(bestTime.id).toBe('test-id')
      expect(bestTime.time).toBe(65.5)
      expect(bestTime.pool_type).toBe(0)
      expect(bestTime.is_relaying).toBe(false)
      expect(bestTime.style.name_jp).toBe('50m自由形')
      expect(bestTime.style.distance).toBe(50)
      expect(bestTime.competition?.title).toBe('テスト大会')
    })

    it('BestTime型はcompetitionがオプショナル', () => {
      const bestTime: BestTime = {
        id: 'test-id',
        time: 65.5,
        created_at: '2025-01-15T00:00:00Z',
        pool_type: 1, // 長水路
        is_relaying: false,
        style: {
          name_jp: '100m背泳ぎ',
          distance: 100,
        },
      }

      expect(bestTime.competition).toBeUndefined()
    })

    it('BestTime型はrelayingTimeがオプショナル', () => {
      const bestTimeWithRelay: BestTime = {
        id: 'test-id',
        time: 65.5,
        created_at: '2025-01-15T00:00:00Z',
        pool_type: 0,
        is_relaying: false,
        style: {
          name_jp: '50m自由形',
          distance: 50,
        },
        relayingTime: {
          id: 'relay-id',
          time: 64.8,
          created_at: '2025-01-10T00:00:00Z',
          competition: {
            title: 'リレー大会',
            date: '2025-01-10',
          },
        },
      }

      expect(bestTimeWithRelay.relayingTime?.id).toBe('relay-id')
      expect(bestTimeWithRelay.relayingTime?.time).toBe(64.8)
    })
  })

  describe('初期状態', () => {
    it('memberBestTimesの初期値は空のMap', () => {
      const mockSupabase = getBasicMockSupabase()
      const { result } = renderHook(() =>
        useMemberBestTimes(mockSupabase as never)
      )

      expect(result.current.memberBestTimes.size).toBe(0)
    })

    it('loadingの初期値はfalse', () => {
      const mockSupabase = getBasicMockSupabase()
      const { result } = renderHook(() =>
        useMemberBestTimes(mockSupabase as never)
      )

      expect(result.current.loading).toBe(false)
    })

    it('errorの初期値はnull', () => {
      const mockSupabase = getBasicMockSupabase()
      const { result } = renderHook(() =>
        useMemberBestTimes(mockSupabase as never)
      )

      expect(result.current.error).toBeNull()
    })
  })

  describe('loadBestTimesForMember', () => {
    it('空のデータを返す場合は空配列を返す', async () => {
      const mockSupabase = createMockSupabase([], null)

      const { result } = renderHook(() =>
        useMemberBestTimes(mockSupabase as never)
      )

      let bestTimes: BestTime[] = []
      await act(async () => {
        bestTimes = await result.current.loadBestTimesForMember('user-123')
      })

      expect(bestTimes).toEqual([])
    })

    it('nullデータを返す場合は空配列を返す', async () => {
      const mockSupabase = createMockSupabase(null, null)

      const { result } = renderHook(() =>
        useMemberBestTimes(mockSupabase as never)
      )

      let bestTimes: BestTime[] = []
      await act(async () => {
        bestTimes = await result.current.loadBestTimesForMember('user-123')
      })

      expect(bestTimes).toEqual([])
    })

    it('エラー発生時は空配列を返しコンソールエラーを出力', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const mockSupabase = createMockSupabase(null, new Error('Database error'))

      const { result } = renderHook(() =>
        useMemberBestTimes(mockSupabase as never)
      )

      let bestTimes: BestTime[] = []
      await act(async () => {
        bestTimes = await result.current.loadBestTimesForMember('user-123')
      })

      expect(bestTimes).toEqual([])
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'メンバー user-123 のベストタイム取得エラー:',
        expect.any(Error)
      )

      consoleErrorSpy.mockRestore()
    })

    it('同じ種目・プール種別で最速タイムのみを返す', async () => {
      const mockData = [
        {
          id: '1',
          time: 30.5,
          created_at: '2025-01-15T00:00:00Z',
          pool_type: 0,
          is_relaying: false,
          styles: { name_jp: '50m自由形', distance: 50 },
          competitions: { title: '大会1', date: '2025-01-15' },
        },
        {
          id: '2',
          time: 31.0,
          created_at: '2025-01-10T00:00:00Z',
          pool_type: 0,
          is_relaying: false,
          styles: { name_jp: '50m自由形', distance: 50 },
          competitions: { title: '大会2', date: '2025-01-10' },
        },
      ]

      const mockSupabase = createMockSupabase(mockData, null)

      const { result } = renderHook(() =>
        useMemberBestTimes(mockSupabase as never)
      )

      let bestTimes: BestTime[] = []
      await act(async () => {
        bestTimes = await result.current.loadBestTimesForMember('user-123')
      })

      // 最速の30.5秒のみが返される
      expect(bestTimes).toHaveLength(1)
      expect(bestTimes[0].time).toBe(30.5)
      expect(bestTimes[0].id).toBe('1')
    })

    it('異なる種目は個別に返す', async () => {
      const mockData = [
        {
          id: '1',
          time: 30.5,
          created_at: '2025-01-15T00:00:00Z',
          pool_type: 0,
          is_relaying: false,
          styles: { name_jp: '50m自由形', distance: 50 },
          competitions: null,
        },
        {
          id: '2',
          time: 65.0,
          created_at: '2025-01-10T00:00:00Z',
          pool_type: 0,
          is_relaying: false,
          styles: { name_jp: '100m背泳ぎ', distance: 100 },
          competitions: null,
        },
      ]

      const mockSupabase = createMockSupabase(mockData, null)

      const { result } = renderHook(() =>
        useMemberBestTimes(mockSupabase as never)
      )

      let bestTimes: BestTime[] = []
      await act(async () => {
        bestTimes = await result.current.loadBestTimesForMember('user-123')
      })

      expect(bestTimes).toHaveLength(2)
    })

    it('同じ種目でも異なるプール種別は個別に返す', async () => {
      const mockData = [
        {
          id: '1',
          time: 30.5,
          created_at: '2025-01-15T00:00:00Z',
          pool_type: 0, // 短水路
          is_relaying: false,
          styles: { name_jp: '50m自由形', distance: 50 },
          competitions: null,
        },
        {
          id: '2',
          time: 31.0,
          created_at: '2025-01-10T00:00:00Z',
          pool_type: 1, // 長水路
          is_relaying: false,
          styles: { name_jp: '50m自由形', distance: 50 },
          competitions: null,
        },
      ]

      const mockSupabase = createMockSupabase(mockData, null)

      const { result } = renderHook(() =>
        useMemberBestTimes(mockSupabase as never)
      )

      let bestTimes: BestTime[] = []
      await act(async () => {
        bestTimes = await result.current.loadBestTimesForMember('user-123')
      })

      expect(bestTimes).toHaveLength(2)
      expect(bestTimes.some((bt) => bt.pool_type === 0)).toBe(true)
      expect(bestTimes.some((bt) => bt.pool_type === 1)).toBe(true)
    })

    it('引き継ぎありのタイムを紐付けて返す', async () => {
      const mockData = [
        {
          id: '1',
          time: 30.5,
          created_at: '2025-01-15T00:00:00Z',
          pool_type: 0,
          is_relaying: false,
          styles: { name_jp: '50m自由形', distance: 50 },
          competitions: { title: '大会1', date: '2025-01-15' },
        },
        {
          id: '2',
          time: 29.8,
          created_at: '2025-01-10T00:00:00Z',
          pool_type: 0,
          is_relaying: true, // 引き継ぎあり
          styles: { name_jp: '50m自由形', distance: 50 },
          competitions: { title: 'リレー大会', date: '2025-01-10' },
        },
      ]

      const mockSupabase = createMockSupabase(mockData, null)

      const { result } = renderHook(() =>
        useMemberBestTimes(mockSupabase as never)
      )

      let bestTimes: BestTime[] = []
      await act(async () => {
        bestTimes = await result.current.loadBestTimesForMember('user-123')
      })

      expect(bestTimes).toHaveLength(1)
      expect(bestTimes[0].is_relaying).toBe(false)
      expect(bestTimes[0].relayingTime).toBeDefined()
      expect(bestTimes[0].relayingTime?.time).toBe(29.8)
    })

    it('引き継ぎありのみのタイムも返す', async () => {
      const mockData = [
        {
          id: '1',
          time: 29.8,
          created_at: '2025-01-10T00:00:00Z',
          pool_type: 0,
          is_relaying: true, // 引き継ぎあり
          styles: { name_jp: '50m自由形', distance: 50 },
          competitions: { title: 'リレー大会', date: '2025-01-10' },
        },
      ]

      const mockSupabase = createMockSupabase(mockData, null)

      const { result } = renderHook(() =>
        useMemberBestTimes(mockSupabase as never)
      )

      let bestTimes: BestTime[] = []
      await act(async () => {
        bestTimes = await result.current.loadBestTimesForMember('user-123')
      })

      // 引き継ぎなしがない場合、引き継ぎありを単独で追加
      expect(bestTimes).toHaveLength(1)
      expect(bestTimes[0].is_relaying).toBe(true)
    })

    it('スタイルがnullの場合はUnknownとして処理', async () => {
      const mockData = [
        {
          id: '1',
          time: 30.5,
          created_at: '2025-01-15T00:00:00Z',
          pool_type: 0,
          is_relaying: false,
          styles: null,
          competitions: null,
        },
      ]

      const mockSupabase = createMockSupabase(mockData, null)

      const { result } = renderHook(() =>
        useMemberBestTimes(mockSupabase as never)
      )

      let bestTimes: BestTime[] = []
      await act(async () => {
        bestTimes = await result.current.loadBestTimesForMember('user-123')
      })

      expect(bestTimes).toHaveLength(1)
      expect(bestTimes[0].style.name_jp).toBe('Unknown')
      expect(bestTimes[0].style.distance).toBe(0)
    })

    it('スタイルが配列の場合は最初の要素を使用', async () => {
      const mockData = [
        {
          id: '1',
          time: 30.5,
          created_at: '2025-01-15T00:00:00Z',
          pool_type: 0,
          is_relaying: false,
          styles: [
            { name_jp: '50m自由形', distance: 50 },
            { name_jp: '100m自由形', distance: 100 },
          ],
          competitions: null,
        },
      ]

      const mockSupabase = createMockSupabase(mockData, null)

      const { result } = renderHook(() =>
        useMemberBestTimes(mockSupabase as never)
      )

      let bestTimes: BestTime[] = []
      await act(async () => {
        bestTimes = await result.current.loadBestTimesForMember('user-123')
      })

      expect(bestTimes).toHaveLength(1)
      expect(bestTimes[0].style.name_jp).toBe('50m自由形')
    })

    it('pool_typeがundefinedの場合は0として扱う', async () => {
      const mockData = [
        {
          id: '1',
          time: 30.5,
          created_at: '2025-01-15T00:00:00Z',
          pool_type: undefined,
          is_relaying: false,
          styles: { name_jp: '50m自由形', distance: 50 },
          competitions: null,
        },
      ]

      const mockSupabase = createMockSupabase(mockData, null)

      const { result } = renderHook(() =>
        useMemberBestTimes(mockSupabase as never)
      )

      let bestTimes: BestTime[] = []
      await act(async () => {
        bestTimes = await result.current.loadBestTimesForMember('user-123')
      })

      expect(bestTimes).toHaveLength(1)
      expect(bestTimes[0].pool_type).toBe(0)
    })
  })

  describe('loadAllBestTimes', () => {
    it('複数メンバーのベストタイムを並列取得する', async () => {
      const mockData = [
        {
          id: '1',
          time: 30.5,
          created_at: '2025-01-15T00:00:00Z',
          pool_type: 0,
          is_relaying: false,
          styles: { name_jp: '50m自由形', distance: 50 },
          competitions: null,
        },
      ]

      const mockSupabase = createMockSupabase(mockData, null)

      const { result } = renderHook(() =>
        useMemberBestTimes(mockSupabase as never)
      )

      const members = [
        { id: 'member-1', user_id: 'user-1' },
        { id: 'member-2', user_id: 'user-2' },
      ]

      await act(async () => {
        await result.current.loadAllBestTimes(members)
      })

      expect(result.current.memberBestTimes.size).toBe(2)
      expect(result.current.memberBestTimes.has('member-1')).toBe(true)
      expect(result.current.memberBestTimes.has('member-2')).toBe(true)
    })

    it('空のメンバー配列を処理できる', async () => {
      const mockSupabase = createMockSupabase([], null)

      const { result } = renderHook(() =>
        useMemberBestTimes(mockSupabase as never)
      )

      await act(async () => {
        await result.current.loadAllBestTimes([])
      })

      expect(result.current.memberBestTimes.size).toBe(0)
      expect(result.current.error).toBeNull()
    })

    it('処理完了後にloadingがfalseになる', async () => {
      const mockSupabase = createMockSupabase([], null)

      const { result } = renderHook(() =>
        useMemberBestTimes(mockSupabase as never)
      )

      const members = [{ id: 'member-1', user_id: 'user-1' }]

      await act(async () => {
        await result.current.loadAllBestTimes(members)
      })

      expect(result.current.loading).toBe(false)
    })
  })

  describe('getBestTimeForMember', () => {
    it('存在しないメンバーIDの場合はnullを返す', () => {
      const mockSupabase = createMockSupabase([], null)

      const { result } = renderHook(() =>
        useMemberBestTimes(mockSupabase as never)
      )

      const bestTime = result.current.getBestTimeForMember(
        'non-existent',
        '自由形',
        50
      )

      expect(bestTime).toBeNull()
    })

    it('存在しないスタイルの場合はnullを返す', async () => {
      const mockData = [
        {
          id: '1',
          time: 30.5,
          created_at: '2025-01-15T00:00:00Z',
          pool_type: 0,
          is_relaying: false,
          styles: { name_jp: '50m自由形', distance: 50 },
          competitions: null,
        },
      ]

      const mockSupabase = createMockSupabase(mockData, null)

      const { result } = renderHook(() =>
        useMemberBestTimes(mockSupabase as never)
      )

      await act(async () => {
        await result.current.loadAllBestTimes([{ id: 'member-1', user_id: 'user-1' }])
      })

      const bestTime = result.current.getBestTimeForMember(
        'member-1',
        '背泳ぎ', // 存在しないスタイル
        100
      )

      expect(bestTime).toBeNull()
    })

    it('短水路と長水路の速い方を選択する', async () => {
      const mockData = [
        {
          id: '1',
          time: 30.5,
          created_at: '2025-01-15T00:00:00Z',
          pool_type: 0, // 短水路
          is_relaying: false,
          styles: { name_jp: '50m自由形', distance: 50 },
          competitions: null,
        },
        {
          id: '2',
          time: 29.5,
          created_at: '2025-01-10T00:00:00Z',
          pool_type: 1, // 長水路（より速い）
          is_relaying: false,
          styles: { name_jp: '50m自由形', distance: 50 },
          competitions: null,
        },
      ]

      const mockSupabase = createMockSupabase(mockData, null)

      const { result } = renderHook(() =>
        useMemberBestTimes(mockSupabase as never)
      )

      await act(async () => {
        await result.current.loadAllBestTimes([{ id: 'member-1', user_id: 'user-1' }])
      })

      const bestTime = result.current.getBestTimeForMember(
        'member-1',
        '自由形',
        50
      )

      expect(bestTime?.time).toBe(29.5)
      expect(bestTime?.pool_type).toBe(1)
    })

    it('includeRelaying=trueの場合は引き継ぎタイムも候補に含める', async () => {
      const mockData = [
        {
          id: '1',
          time: 30.5,
          created_at: '2025-01-15T00:00:00Z',
          pool_type: 0,
          is_relaying: false,
          styles: { name_jp: '50m自由形', distance: 50 },
          competitions: null,
        },
        {
          id: '2',
          time: 29.0, // 引き継ぎありで最速
          created_at: '2025-01-10T00:00:00Z',
          pool_type: 0,
          is_relaying: true,
          styles: { name_jp: '50m自由形', distance: 50 },
          competitions: null,
        },
      ]

      const mockSupabase = createMockSupabase(mockData, null)

      const { result } = renderHook(() =>
        useMemberBestTimes(mockSupabase as never)
      )

      await act(async () => {
        await result.current.loadAllBestTimes([{ id: 'member-1', user_id: 'user-1' }])
      })

      const bestTime = result.current.getBestTimeForMember(
        'member-1',
        '自由形',
        50,
        true // includeRelaying
      )

      expect(bestTime?.time).toBe(29.0)
      expect(bestTime?.is_relaying).toBe(true)
    })

    it('includeRelaying=falseの場合は引き継ぎなしタイムのみ', async () => {
      const mockData = [
        {
          id: '1',
          time: 30.5,
          created_at: '2025-01-15T00:00:00Z',
          pool_type: 0,
          is_relaying: false,
          styles: { name_jp: '50m自由形', distance: 50 },
          competitions: null,
        },
        {
          id: '2',
          time: 29.0,
          created_at: '2025-01-10T00:00:00Z',
          pool_type: 0,
          is_relaying: true,
          styles: { name_jp: '50m自由形', distance: 50 },
          competitions: null,
        },
      ]

      const mockSupabase = createMockSupabase(mockData, null)

      const { result } = renderHook(() =>
        useMemberBestTimes(mockSupabase as never)
      )

      await act(async () => {
        await result.current.loadAllBestTimes([{ id: 'member-1', user_id: 'user-1' }])
      })

      const bestTime = result.current.getBestTimeForMember(
        'member-1',
        '自由形',
        50,
        false // includeRelaying
      )

      expect(bestTime?.time).toBe(30.5)
      expect(bestTime?.is_relaying).toBe(false)
    })
  })

  describe('コールバックの安定性', () => {
    it('loadBestTimesForMemberは再レンダリングしても同じ参照を保つ', () => {
      const mockSupabase = createMockSupabase([], null)
      const { result, rerender } = renderHook(() =>
        useMemberBestTimes(mockSupabase as never)
      )

      const firstCallback = result.current.loadBestTimesForMember

      rerender()

      expect(result.current.loadBestTimesForMember).toBe(firstCallback)
    })

    it('loadAllBestTimesは再レンダリングしても同じ参照を保つ', () => {
      const mockSupabase = createMockSupabase([], null)
      const { result, rerender } = renderHook(() =>
        useMemberBestTimes(mockSupabase as never)
      )

      const firstCallback = result.current.loadAllBestTimes

      rerender()

      expect(result.current.loadAllBestTimes).toBe(firstCallback)
    })

    it('getBestTimeForMemberはmemberBestTimes変更時に新しい参照になる', async () => {
      const mockSupabase = createMockSupabase([], null)

      const { result } = renderHook(() =>
        useMemberBestTimes(mockSupabase as never)
      )

      const firstCallback = result.current.getBestTimeForMember

      await act(async () => {
        await result.current.loadAllBestTimes([{ id: 'member-1', user_id: 'user-1' }])
      })

      // memberBestTimesが変わったので新しい参照になる
      expect(result.current.getBestTimeForMember).not.toBe(firstCallback)
    })
  })
})
