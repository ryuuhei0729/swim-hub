# unit_Mocking.md - モック戦略・Supabaseモックガイド

**最終更新**: 2025-01-20

---

## 📘 このドキュメントについて

このドキュメントは、**Supabaseモックとその他のモック戦略**について詳しく説明します。

**対象**：
- Cursorによるコード生成
- 開発者の実装時の参照
- 新しいモックパターンの追記

**メインルールブック**：👉 [unit_Main-rule.md](./unit_Main-rule.md)

---

## § 1. Supabaseモック基本使い方

### 1.1 createMockSupabaseClient

**基本使用法**：

```typescript
import { createMockSupabaseClient } from '../../__mocks__/supabase'

describe('RecordAPI', () => {
  let mockClient: any

  beforeEach(() => {
    mockClient = createMockSupabaseClient()
  })
})
```

**オプション**：

```typescript
// デフォルト（認証済み）
const mockClient = createMockSupabaseClient()

// 未認証状態をシミュレート
const mockClient = createMockSupabaseClient({ userId: '' })

// カスタムユーザーID
const mockClient = createMockSupabaseClient({ userId: 'custom-user-id' })

// クエリデータとエラーを指定
const mockClient = createMockSupabaseClient({
  userId: 'test-user-id',
  queryData: [{ id: '1', name: 'test' }],
  queryError: null,
})
```

**提供される機能**：
- `auth.getUser()` - 認証状態の取得
- `auth.signInWithPassword()` - ログイン
- `auth.signOut()` - ログアウト
- `auth.getSession()` - セッション取得
- `from(table)` - テーブルクエリ
- `rpc(functionName)` - RPC呼び出し
- `channel()` - リアルタイムチャネル
- `removeChannel()` - チャネル削除

---

### 1.2 基本的なクエリモック

```typescript
describe('記録取得', () => {
  it('記録一覧を取得できる', async () => {
    const mockRecord = createMockRecord()
    
    mockClient.from = vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [mockRecord],
        error: null,
      }),
    }))

    const result = await api.getRecords()

    expect(mockClient.from).toHaveBeenCalledWith('records')
    expect(result).toEqual([mockRecord])
  })
})
```

**ポイント**：
- `mockReturnThis()`でチェーンメソッドを実現
- `mockResolvedValue()`で最終結果を返す
- `data`と`error`の両方を指定

---

## § 2. クエリビルダーモック詳細

### 2.1 createMockQueryBuilder

**基本構造**：

```typescript
import { createMockQueryBuilder } from '../../__mocks__/supabase'

const builder = createMockQueryBuilder(
  returnData,  // 返却するデータ
  returnError // 返却するエラー（nullの場合はエラーなし）
)
```

**利用可能なメソッド**：
- `select()` - カラム選択
- `insert()` - データ挿入
- `update()` - データ更新
- `delete()` - データ削除
- `upsert()` - 挿入または更新
- `eq()`, `neq()`, `gt()`, `gte()`, `lt()`, `lte()` - 比較演算子
- `is()`, `like()`, `ilike()` - 文字列検索
- `in()`, `contains()`, `overlaps()` - 配列/JSON操作
- `or()` - OR条件
- `order()` - ソート
- `limit()`, `range()` - 件数制限
- `single()`, `maybeSingle()` - 単一結果取得
- `returns()` - 返却値指定

---

### 2.2 チェーンメソッドのモック

**実装例**：複数のメソッドをチェーンする場合

```typescript
mockClient.from = vi.fn(() => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue({
    data: [mockRecord],
    error: null,
  }),
}))
```

**ポイント**：
- 中間のメソッドは`mockReturnThis()`で自分自身を返す
- 最後のメソッドは`mockResolvedValue()`で結果を返す

---

### 2.3 single()とmaybeSingle()のモック

```typescript
// single() - 必ず1件返す（0件の場合はエラー）
mockClient.from = vi.fn(() => ({
  insert: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({
    data: createdRecord,
    error: null,
  }),
}))

// maybeSingle() - 0件の場合はnullを返す
mockClient.from = vi.fn(() => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue({
    data: null, // 0件の場合
    error: null,
  }),
}))
```

---

### 2.4 エラーレスポンスのモック

```typescript
describe('記録取得', () => {
  it('クエリが失敗したときエラーが発生する', async () => {
    const error = new Error('Query failed')
    
    mockClient.from = vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: null,
        error,
      }),
    }))

    await expect(api.getRecords()).rejects.toThrow('Query failed')
  })
})
```

---

## § 3. テストデータファクトリー活用方法

### 3.1 利用可能なファクトリー関数

**場所**: `apps/shared/__mocks__/supabase.ts`

| 関数名 | 用途 | 例 |
|--------|------|-----|
| `createMockPractice` | 練習記録のモックデータ | `createMockPractice({ date: '2025-01-15' })` |
| `createMockRecord` | 大会記録のモックデータ | `createMockRecord({ time_seconds: 60.5 })` |
| `createMockStyle` | 種目のモックデータ | `createMockStyle({ name_en: 'freestyle' })` |
| `createMockTeam` | チームのモックデータ | `createMockTeam({ name: 'テストチーム' })` |
| `createMockPracticeLog` | 練習ログのモックデータ | `createMockPracticeLog({ distance: 100 })` |

---

### 3.2 基本的な使い方

```typescript
import { createMockRecord, createMockPractice } from '../../__mocks__/supabase'

// デフォルト値で作成
const mockRecord = createMockRecord()

// 一部のフィールドを上書き
const mockRecord = createMockRecord({
  id: 'record-1',
  time_seconds: 60.5,
  competition_id: 'comp-1',
})

// 複数のモックデータを作成
const mockRecords = [
  createMockRecord({ id: 'record-1', time_seconds: 60.0 }),
  createMockRecord({ id: 'record-2', time_seconds: 61.0 }),
  createMockRecord({ id: 'record-3', time_seconds: 62.0 }),
]
```

---

### 3.3 ファクトリー関数の利点

**1. デフォルト値の管理**
```typescript
// ✅ 良い例：ファクトリー関数を使用
const mockRecord = createMockRecord({ time_seconds: 60.5 })
// 他のフィールドは自動的にデフォルト値が設定される

// ❌ 悪い例：全てのフィールドを手動で定義
const mockRecord = {
  id: 'record-1',
  user_id: 'test-user-id',
  competition_id: 'comp-1',
  style_id: 1,
  time_seconds: 60.5,
  pool_type: 'long',
  is_relay: false,
  memo: null,
  video_url: null,
  created_at: '2025-01-15T10:00:00Z',
  updated_at: '2025-01-15T10:00:00Z',
}
```

**2. 型安全性**
```typescript
// ファクトリー関数は型定義に基づいているため、型エラーを検出できる
const mockRecord = createMockRecord({
  time_seconds: 60.5,
  // 存在しないフィールドは型エラーになる
  invalidField: 'test', // ❌ 型エラー
})
```

**3. 一貫性**
```typescript
// 全てのテストで同じデフォルト値を使用できる
const record1 = createMockRecord()
const record2 = createMockRecord()
// record1とrecord2は同じデフォルト値を持つ
```

---

### 3.4 カスタムファクトリー関数の作成

**実装例**：特定のテストケース用のファクトリー関数

```typescript
// テストファイル内で定義
const createAttendanceRow = (
  overrides: Partial<TeamAttendance> & {
    user?: Record<string, unknown>
    practice?: Record<string, unknown>
    competition?: Record<string, unknown>
  } = {}
) => ({
  id: 'attendance-1',
  practice_id: overrides.practice_id ?? 'practice-1',
  competition_id: overrides.competition_id ?? null,
  user_id: overrides.user_id ?? 'member-1',
  status: overrides.status ?? ('present' as AttendanceStatus),
  note: overrides.note ?? null,
  created_at: overrides.created_at ?? '2025-01-01T00:00:00Z',
  updated_at: overrides.updated_at ?? '2025-01-01T00:00:00Z',
  user: overrides.user ?? {
    id: 'member-1',
    name: 'メンバー'
  },
  practice: overrides.practice ?? {
    id: 'practice-1',
    team_id: 'team-1'
  },
  competition: overrides.competition ?? null
})
```

**ポイント**：
- デフォルト値は`??`演算子で設定
- オプショナルな関連データも含める
- 型安全性を保つ

---

## § 4. 複数テーブル連携のモック例

### 4.1 テーブルキューを使用したモック

**実装例**：`createSupabaseMock`を使用した複数テーブルのモック

```typescript
import { createSupabaseMock } from '../../__tests__/utils/supabase-mock'

describe('AttendanceAPI', () => {
  let supabaseMock: ReturnType<typeof createSupabaseMock>
  let api: AttendanceAPI

  beforeEach(() => {
    vi.clearAllMocks()
    supabaseMock = createSupabaseMock()
    api = new AttendanceAPI(supabaseMock.client as any)
  })

  describe('練習出欠取得', () => {
    it('チーム練習のとき出欠一覧を取得できる', async () => {
      const attendanceRow = createAttendanceRow()

      // 複数テーブルへのクエリを順番にキューイング
      supabaseMock.queueTable('practices', [{ data: { team_id: 'team-1' } }])
      supabaseMock.queueTable('team_memberships', [{ data: { id: 'membership-1' } }])
      supabaseMock.queueTable('team_attendance', [{ data: [attendanceRow] }])

      const result = await api.getAttendanceByPractice('practice-1')

      expect(result).toEqual([attendanceRow])
    })
  })
})
```

**ポイント**：
- `queueTable()`でテーブルごとにレスポンスをキューイング
- クエリの順序に応じてレスポンスが返される
- 複数のテーブルアクセスを正確にシミュレート

---

### 4.2 クエリビルダーの履歴確認

```typescript
describe('練習出欠取得', () => {
  it('クエリが正しい順序で呼ばれる', async () => {
    const attendanceRow = createAttendanceRow()

    supabaseMock.queueTable('practices', [{ data: { team_id: 'team-1' } }])
    supabaseMock.queueTable('team_memberships', [{ data: { id: 'membership-1' } }])
    supabaseMock.queueTable('team_attendance', [{ data: [attendanceRow] }])

    await api.getAttendanceByPractice('practice-1')

    // クエリビルダーの履歴を確認
    const practiceHistory = supabaseMock.getBuilderHistory('practices')
    expect(practiceHistory.length).toBe(1)
    expect(practiceHistory[0].select).toHaveBeenCalled()
    expect(practiceHistory[0].eq).toHaveBeenCalledWith('id', 'practice-1')
  })
})
```

**ポイント**：
- `getBuilderHistory()`でクエリビルダーの履歴を取得
- クエリの呼び出し順序や引数を検証可能

---

### 4.3 複雑なクエリチェーンのモック

```typescript
describe('カレンダーエントリー取得', () => {
  it('日付範囲を指定したとき該当期間のカレンダーエントリーを取得できる', async () => {
    const mockPractices = [
      {
        id: 'practice-1',
        date: '2025-01-15',
        place: 'テストプール',
        practice_logs: [],
      },
    ]

    const mockRecords = [
      {
        id: 'record-1',
        competition_id: 'comp-1',
        time_seconds: 60.5,
      },
    ]

    const mockCompetitions = [
      {
        id: 'comp-1',
        name: 'テスト大会',
        date: '2025-01-20',
      },
    ]

    // 複数のテーブルクエリを順番に処理
    let callCount = 0
    mockClient.from = vi.fn(() => {
      callCount++
      const data =
        callCount === 1
          ? mockPractices
          : callCount === 2
            ? mockRecords
            : mockCompetitions

      const queryMock: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
      }

      queryMock.then = (resolve: (value: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data, error: null }).then(resolve)

      return queryMock
    })

    const result = await api.getCalendarEntries('2025-01-01', '2025-01-31')

    expect(result).toBeDefined()
    expect(Array.isArray(result)).toBe(true)
  })
})
```

**ポイント**：
- `callCount`で呼び出し順序を管理
- 各呼び出しで異なるデータを返す
- `then`メソッドでPromiseを実現

---

## § 5. Next.js Routerモック例

### 5.1 useRouterのモック

**基本パターン**：

```typescript
import { vi } from 'vitest'

// Next.js Router をモック
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/current/path',
  useSearchParams: () => new URLSearchParams(),
}))
```

---

### 5.2 ルーター操作のテスト

```typescript
describe('ナビゲーション', () => {
  it('新しいページに遷移できる', async () => {
    const mockPush = vi.fn()
    vi.mock('next/navigation', () => ({
      useRouter: () => ({
        push: mockPush,
      }),
    }))

    render(<MyComponent />)

    const button = screen.getByRole('button', { name: '次へ' })
    await userEvent.click(button)

    expect(mockPush).toHaveBeenCalledWith('/next-page')
  })
})
```

---

### 5.3 usePathnameとuseSearchParamsのモック

```typescript
describe('URLパラメータ', () => {
  it('パス名を読み取れる', () => {
    vi.mock('next/navigation', () => ({
      usePathname: () => '/practices/123',
    }))

    render(<MyComponent />)

    expect(screen.getByText('/practices/123')).toBeInTheDocument()
  })

  it('検索パラメータを読み取れる', () => {
    const searchParams = new URLSearchParams('?date=2025-01-15')
    vi.mock('next/navigation', () => ({
      useSearchParams: () => searchParams,
    }))

    render(<MyComponent />)

    expect(screen.getByText('2025-01-15')).toBeInTheDocument()
  })
})
```

---

## § 6. その他のモックパターン

### 6.1 localStorageのモック

```typescript
describe('localStorage', () => {
  beforeEach(() => {
    // localStorageをモック
    const store: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value
      },
      removeItem: (key: string) => {
        delete store[key]
      },
      clear: () => {
        Object.keys(store).forEach(key => delete store[key])
      },
    })
  })

  it('localStorageに保存できる', () => {
    localStorage.setItem('key', 'value')
    expect(localStorage.getItem('key')).toBe('value')
  })
})
```

---

### 6.2 タイマーのモック

```typescript
describe('タイマー', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('遅延後にコールバックが呼ばれる', () => {
    const callback = vi.fn()
    setTimeout(callback, 1000)

    vi.advanceTimersByTime(1000)

    expect(callback).toHaveBeenCalled()
  })
})
```

---

### 6.3 モジュールのモック

```typescript
// モジュール全体をモック
vi.mock('../../api/practices', () => ({
  PracticeAPI: vi.fn().mockImplementation(() => ({
    getPractices: vi.fn(),
    createPractice: vi.fn(),
  })),
}))

// 特定の関数のみをモック
vi.mock('../../utils/formatters', async () => {
  const actual = await vi.importActual('../../utils/formatters')
  return {
    ...actual,
    formatTime: vi.fn((seconds: number) => `00:${seconds}`),
  }
})
```

---

## § 7. モックのベストプラクティス

### 7.1 beforeEachでのリセット

```typescript
beforeEach(() => {
  vi.clearAllMocks() // 全てのモックをリセット
  mockClient = createMockSupabaseClient() // 新しいモッククライアントを作成
})
```

**理由**：
- テスト間の依存関係を排除
- テストの独立性を保証

---

### 7.2 モックの再利用

```typescript
// ✅ 良い例：共通のモック設定を関数化
const createMockApi = () => ({
  getPractices: vi.fn(),
  createPractice: vi.fn(),
  updatePractice: vi.fn(),
  deletePractice: vi.fn(),
})

describe('usePractices', () => {
  let mockApi: ReturnType<typeof createMockApi>

  beforeEach(() => {
    mockApi = createMockApi()
  })
})
```

---

### 7.3 モックの検証

```typescript
it('正しいパラメータでAPIが呼ばれる', async () => {
  const mockApi = {
    getPractices: vi.fn().mockResolvedValue([]),
  }

  await api.getPractices('2025-01-01', '2025-01-31')

  expect(mockApi.getPractices).toHaveBeenCalledTimes(1)
  expect(mockApi.getPractices).toHaveBeenCalledWith('2025-01-01', '2025-01-31')
})
```

---

## § 8. 新パターン追記エリア

### [日付] - [パターン名]

**実装背景**：  
**成功要因**：  
**コード例**：  
**注意点**：  

---

## § 9. モック改善ログ

### 2025-01-20
- 初版作成
- Supabaseモック、テストデータファクトリー、複数テーブル連携のパターンを記録

---

**最終更新**: 2025-01-20  
**管理者**: QA Team

