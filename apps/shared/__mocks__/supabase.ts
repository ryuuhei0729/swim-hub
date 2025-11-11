import { vi } from 'vitest'

/**
 * Supabase Client のモックヘルパー
 * テストで使用する汎用的なモックを提供
 */

export interface MockQueryBuilder {
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  upsert: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  neq: ReturnType<typeof vi.fn>
  gt: ReturnType<typeof vi.fn>
  gte: ReturnType<typeof vi.fn>
  lt: ReturnType<typeof vi.fn>
  lte: ReturnType<typeof vi.fn>
  is: ReturnType<typeof vi.fn>
  like: ReturnType<typeof vi.fn>
  ilike: ReturnType<typeof vi.fn>
  in: ReturnType<typeof vi.fn>
  contains: ReturnType<typeof vi.fn>
  overlaps: ReturnType<typeof vi.fn>
  or: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  range: ReturnType<typeof vi.fn>
  returns: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
}

/**
 * クエリビルダーのモックを作成
 */
export const createMockQueryBuilder = (
  returnData: any = [],
  returnError: any = null
): MockQueryBuilder => {
  const mockBuilder: any = {
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
  }

  // チェーンメソッドは自分自身を返す
  Object.keys(mockBuilder).forEach((key) => {
    if (key !== 'single' && key !== 'maybeSingle') {
      mockBuilder[key].mockReturnValue(mockBuilder)
    }
  })

  // single() と maybeSingle() は結果を返す
  mockBuilder.single.mockResolvedValue({ data: returnData, error: returnError })
  mockBuilder.maybeSingle.mockResolvedValue({ data: returnData, error: returnError })
  mockBuilder.returns.mockReturnValue({ data: returnData, error: returnError })

  // デフォルトの Promise 解決（select の最終結果など）
  mockBuilder.then = (resolve: (value: { data: any; error: any }) => any) => {
    return Promise.resolve({ data: returnData, error: returnError }).then(resolve)
  }

  return mockBuilder
}

/**
 * Supabase Client のモックを作成
 */
export const createMockSupabaseClient = (options: {
  userId?: string
  queryData?: any
  queryError?: any
} = {}) => {
  const {
    userId = 'test-user-id',
    queryData = [],
    queryError = null,
  } = options

  const mockClient: any = {
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
      const channel = {
        on: vi.fn(() => channel),
        subscribe: vi.fn(() => channel),
        unsubscribe: vi.fn(),
        send: vi.fn(() => channel),
      }
      return channel
    }),
    removeChannel: vi.fn(),
  }

  return mockClient
}

/**
 * テストデータのファクトリー
 */
export const createMockPractice = (overrides = {}) => ({
  id: 'practice-1',
  user_id: 'test-user-id',
  date: '2025-01-15',
  place: 'テストプール',
  memo: 'テスト練習',
  created_at: '2025-01-15T10:00:00Z',
  updated_at: '2025-01-15T10:00:00Z',
  ...overrides,
})

export const createMockPracticeLog = (overrides = {}) => ({
  id: 'log-1',
  practice_id: 'practice-1',
  distance: 100,
  rep_count: 4,
  set_count: 2,
  circle_time: 90,
  style: 'freestyle',
  memo: 'テストログ',
  created_at: '2025-01-15T10:00:00Z',
  updated_at: '2025-01-15T10:00:00Z',
  ...overrides,
})

export const createMockRecord = (overrides = {}) => ({
  id: 'record-1',
  user_id: 'test-user-id',
  competition_id: 'comp-1',
  style_id: 'style-1',
  time_seconds: 60.5,
  pool_type: 'long',
  is_relay: false,
  memo: 'テスト記録',
  video_url: null,
  created_at: '2025-01-15T10:00:00Z',
  updated_at: '2025-01-15T10:00:00Z',
  ...overrides,
})

export const createMockTeam = (overrides = {}) => ({
  id: 'team-1',
  name: 'テストチーム',
  description: 'テストチームの説明',
  invite_code: 'ABC123',
  created_by: 'test-user-id',
  created_at: '2025-01-15T10:00:00Z',
  updated_at: '2025-01-15T10:00:00Z',
  ...overrides,
})

export const createMockStyle = (overrides = {}) => ({
  id: 'style-1',
  name_en: 'freestyle',
  name_ja: '自由形',
  distance: 100,
  stroke: 'freestyle',
  created_at: '2025-01-15T10:00:00Z',
  ...overrides,
})

