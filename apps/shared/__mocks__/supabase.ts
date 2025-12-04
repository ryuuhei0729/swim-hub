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
  then: <T>(resolve: (value: { data: any; error: any; count?: number }) => T) => Promise<T>
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

export const createMockRecord = (overrides = {}) => ({
  id: 'record-1',
  user_id: 'test-user-id',
  competition_id: 'comp-1',
  style_id: 1,
  time: 60.5,
  is_relaying: false,
  note: 'テスト記録',
  video_url: null,
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

export const createMockRecordWithDetails = (overrides = {}) => ({
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
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  teams: createMockTeam(),
  ...overrides,
})

