import { vi, Mock } from 'vitest'
import type { PoolType, Record as RecordRow, RecordWithDetails } from '../types'
import type { MockQueryBuilder, MockSupabaseClient } from './types'

/**
 * Supabase Client のモックヘルパー
 * テストで使用する汎用的なモックを提供
 */

// MockQueryBuilder と MockSupabaseClient は types.ts から export
export type { MockQueryBuilder, MockSupabaseClient } from './types'

/**
 * Supabase Realtime Channel のモック型
 */
interface MockChannel {
  on: Mock
  subscribe: Mock
  unsubscribe: Mock
  send: Mock
}

/**
 * クエリビルダーのモックを作成
 */
export const createMockQueryBuilder = <T = unknown>(
  returnData: T = [] as T,
  returnError: unknown = null,
  count?: number
): MockQueryBuilder<T> => {
  const builder = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    upsert: vi.fn(),
    eq: vi.fn(),
    neq: vi.fn(),
    gt: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    lte: vi.fn(),
    is: vi.fn(),
    like: vi.fn(),
    ilike: vi.fn(),
    in: vi.fn(),
    contains: vi.fn(),
    overlaps: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    range: vi.fn(),
    returns: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
    then: <TResult1 = { data: T; error: unknown; count?: number }, TResult2 = never>(
      onfulfilled?: ((value: { data: T; error: unknown; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): Promise<TResult1 | TResult2> => {
      return Promise.resolve({ data: returnData, error: returnError, count }).then(onfulfilled, onrejected)
    }
  }

  // チェーンメソッドは自分自身を返す
  builder.select.mockReturnValue(builder)
  builder.insert.mockReturnValue(builder)
  builder.update.mockReturnValue(builder)
  builder.delete.mockReturnValue(builder)
  builder.upsert.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.neq.mockReturnValue(builder)
  builder.gt.mockReturnValue(builder)
  builder.gte.mockReturnValue(builder)
  builder.lt.mockReturnValue(builder)
  builder.lte.mockReturnValue(builder)
  builder.is.mockReturnValue(builder)
  builder.like.mockReturnValue(builder)
  builder.ilike.mockReturnValue(builder)
  builder.in.mockReturnValue(builder)
  builder.contains.mockReturnValue(builder)
  builder.overlaps.mockReturnValue(builder)
  builder.or.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  builder.limit.mockReturnValue(builder)
  builder.range.mockReturnValue(builder)
  builder.returns.mockReturnValue(builder)

  // single() と maybeSingle() は結果を返す
  builder.single.mockResolvedValue({ data: returnData, error: returnError, count })
  builder.maybeSingle.mockResolvedValue({ data: returnData, error: returnError, count })

  return builder as MockQueryBuilder<T>
}

/**
 * Supabase Client のモックを作成
 */
export const createMockSupabaseClient = (options: {
  userId?: string
  queryData?: unknown
  queryError?: unknown
} = {}): MockSupabaseClient => {
  const {
    userId = 'test-user-id',
    queryData = [],
    queryError = null,
  } = options

  const mockClient = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: userId ? { id: userId, email: 'test@example.com' } : null,
        },
        error: userId ? null : new Error('Not authenticated'),
      }),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: userId ? { user: { id: userId } } : null,
        },
        error: null,
      }),
    },
    from: vi.fn((table: string) => {
      return createMockQueryBuilder(queryData, queryError)
    }),
    rpc: vi.fn().mockResolvedValue({ data: queryData, error: queryError }),
    channel: vi.fn(() => {
      const channel: MockChannel = {
        on: vi.fn(),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
        send: vi.fn(),
      }
      // チェーンメソッドは自身を返す
      channel.on.mockReturnValue(channel)
      channel.subscribe.mockReturnValue(channel)
      channel.send.mockReturnValue(channel)
      return channel
    }),
    removeChannel: vi.fn(),
  } as unknown as MockSupabaseClient

  return mockClient
}

/**
 * Selectクエリ用のシンプルなモッククエリビルダーを作成
 * テストでよく使うselect().eq().single()パターンを簡単に作成できる
 */
export const createMockSelectBuilder = <T>(data: T, error: unknown = null): MockQueryBuilder<T> => {
  const builder: Partial<MockQueryBuilder<T>> = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    single: vi.fn(),
  }

  // チェーンメソッドは自分自身を返す
  builder.select!.mockReturnValue(builder)
  builder.eq!.mockReturnValue(builder)
  builder.order!.mockReturnValue(builder)

  // single() は結果を返す
  builder.single!.mockResolvedValue({ data, error })

  return builder as MockQueryBuilder<T>
}

/**
 * テストデータのファクトリー
 */
export const createMockPractice = (overrides = {}) => ({
  id: 'practice-1',
  user_id: 'test-user-id',
  date: '2025-01-15',
  title: 'テスト練習',
  place: 'テストプール',
  note: 'テスト練習',
  created_at: '2025-01-15T10:00:00Z',
  updated_at: '2025-01-15T10:00:00Z',
  ...overrides,
})

export const createMockPracticeLog = (overrides = {}) => ({
  id: 'log-1',
  user_id: 'test-user-id',
  practice_id: 'practice-1',
  distance: 100,
  rep_count: 4,
  set_count: 2,
  circle: 90,
  style: 'freestyle',
  note: 'テストログ',
  created_at: '2025-01-15T10:00:00Z',
  updated_at: '2025-01-15T10:00:00Z',
  ...overrides,
})

export const createMockPracticeWithLogs = (overrides = {}) => ({
  ...createMockPractice(),
  practice_logs: [],
  ...overrides,
})

export const createMockRecord = (overrides: Partial<RecordRow> = {}): RecordRow => ({
  id: 'record-1',
  user_id: 'test-user-id',
  competition_id: 'comp-1',
  style_id: 1,
  time: 60.5,
  pool_type: 0 as PoolType,
  is_relaying: false,
  note: 'テスト記録',
  video_url: null,
  reaction_time: null,
  created_at: '2025-01-15T10:00:00Z',
  updated_at: '2025-01-15T10:00:00Z',
  ...overrides,
})

export const createMockCompetition = (overrides = {}) => ({
  id: 'comp-1',
  user_id: 'test-user-id',
  team_id: null,
  title: 'テスト大会',
  date: '2025-01-15',
  place: 'テスト会場',
  pool_type: 1,
  note: '大会メモ',
  created_at: '2025-01-15T09:00:00Z',
  updated_at: '2025-01-15T09:00:00Z',
  ...overrides,
})

export const createMockStyle = (overrides = {}) => ({
  id: 1,
  name_jp: '自由形',
  name: 'freestyle',
  style: 'fr' as const,
  distance: 100,
  ...overrides,
})

export const createMockRecordWithDetails = (
  overrides: Partial<RecordWithDetails> = {}
): RecordWithDetails => ({
  ...createMockRecord(),
  competition: createMockCompetition(),
  style: createMockStyle(),
  split_times: [],
  ...overrides,
})

export const createMockTeam = (overrides = {}) => ({
  id: 'team-1',
  name: 'テストチーム',
  description: 'テストチームの説明',
  invite_code: 'ABC123',
  created_at: '2025-01-15T10:00:00Z',
  updated_at: '2025-01-15T10:00:00Z',
  ...overrides,
})

export const createMockTeamMembershipWithUser = (overrides = {}) => ({
  id: 'membership-1',
  team_id: 'team-1',
  user_id: 'test-user-id',
  role: 'admin' as const,
  member_type: null,
  group_name: null,
  status: 'approved' as const,
  is_active: true,
  joined_at: '2025-01-01T00:00:00Z',
  left_at: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  users: {
    id: 'test-user-id',
    name: 'テストユーザー',
    gender: 0,
    birthday: null,
    profile_image_path: null,
    bio: null,
    google_calendar_enabled: false,
    // google_calendar_refresh_token は機密情報のためクライアント側では除外
    google_calendar_sync_practices: false,
    google_calendar_sync_competitions: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  teams: createMockTeam(),
  ...overrides,
})

