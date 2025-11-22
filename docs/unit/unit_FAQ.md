# unit_FAQ.md - トラブルシューティング

**最終更新**: 2025-01-20

---

## 📘 このドキュメントについて

このドキュメントは、**単体テストでよく発生するエラーとその解決策**を記載しています。

**対象**：
- テスト実行時のエラー解決
- よくある問題の対処法
- 新しいエラー対処の追記

**メインルールブック**：👉 [unit_Main-rule.md](./unit_Main-rule.md)

---

## § 1. よくあるエラーと解決策

### 1.1 モックが動作しない

#### エラー: `TypeError: Cannot read property 'from' of undefined`

**原因**：
- モッククライアントが正しく初期化されていない
- `beforeEach`でモックをリセットし忘れている

**解決策**：

```typescript
// ✅ 正しい実装
describe('RecordAPI', () => {
  let mockClient: any
  let api: RecordAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient() // 必ず初期化
    api = new RecordAPI(mockClient)
  })
})
```

---

#### エラー: `mockClient.from is not a function`

**原因**：
- `mockClient.from`が関数として定義されていない
- モックの設定が不完全

**解決策**：

```typescript
// ✅ 正しい実装
mockClient.from = vi.fn(() => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockResolvedValue({
    data: [mockRecord],
    error: null,
  }),
}))
```

---

### 1.2 クエリチェーンが動作しない

#### エラー: `Cannot read property 'eq' of undefined`

**原因**：
- チェーンメソッドが`mockReturnThis()`で自分自身を返していない

**解決策**：

```typescript
// ✅ 正しい実装：チェーンメソッドは自分自身を返す
mockClient.from = vi.fn(() => ({
  select: vi.fn().mockReturnThis(), // 自分自身を返す
  eq: vi.fn().mockReturnThis(),     // 自分自身を返す
  order: vi.fn().mockResolvedValue({ // 最後だけ結果を返す
    data: [mockRecord],
    error: null,
  }),
}))
```

---

#### エラー: `Promise is not resolved`

**原因**：
- `mockResolvedValue()`が正しく設定されていない
- Promiseチェーンが途切れている

**解決策**：

```typescript
// ✅ 正しい実装：Promiseを正しく返す
mockClient.from = vi.fn(() => {
  const queryMock: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
  }

  // Promiseを実現するためにthenメソッドを追加
  queryMock.then = (resolve: (value: { data: unknown; error: null }) => unknown) =>
    Promise.resolve({ data: [mockRecord], error: null }).then(resolve)

  return queryMock
})
```

---

### 1.3 テストデータの問題

#### エラー: `Property 'id' is missing in type`

**原因**：
- テストデータの型が不完全
- ファクトリー関数を使用していない

**解決策**：

```typescript
// ✅ 正しい実装：ファクトリー関数を使用
import { createMockRecord } from '../../__mocks__/supabase'

const mockRecord = createMockRecord({
  id: 'record-1',
  time_seconds: 60.5,
})
```

```typescript
// ❌ 悪い例：手動で全てのフィールドを定義
const mockRecord = {
  id: 'record-1',
  // 他の必須フィールドが欠けている可能性がある
}
```

---

### 1.4 React Hooksのテストエラー

#### エラー: `Warning: An update to Component inside a test was not wrapped in act(...)`

**原因**：
- 非同期状態更新が`act`でラップされていない

**解決策**：

```typescript
// ✅ 正しい実装：actでラップ
import { act, renderHook, waitFor } from '@testing-library/react'

it('状態が更新される', async () => {
  const { result } = renderHook(() => usePractices(mockClient, { api }))

  await act(async () => {
    await result.current.createPractice(newPractice)
  })

  expect(result.current.practices).toContainEqual(newPractice)
})
```

---

#### エラー: `useEffect has a missing dependency`

**原因**：
- `useEffect`の依存配列が不完全
- テスト環境での警告

**解決策**：
- 実装コードの依存配列を確認
- テストでは警告を無視するか、実装を修正

---

### 1.5 Reactコンポーネントのテストエラー

#### エラー: `Unable to find role="button"`

**原因**：
- セレクタが正しく要素を見つけられない
- 要素がまだレンダリングされていない

**解決策**：

```typescript
// ✅ 正しい実装：waitForで待機
import { waitFor } from '@testing-library/react'

it('ボタンが表示される', async () => {
  render(<MyComponent />)

  await waitFor(() => {
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
  })
})
```

---

#### エラー: `next/navigation` module not found

**原因**：
- Next.js Routerがモックされていない

**解決策**：

```typescript
// ✅ 正しい実装：Next.js Routerをモック
import { vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}))
```

---

## § 2. モック関連のトラブルシューティング

### 2.1 モックがリセットされない

#### 問題: テスト間でモックの状態が残る

**原因**：
- `beforeEach`で`vi.clearAllMocks()`を呼んでいない
- モッククライアントを再作成していない

**解決策**：

```typescript
// ✅ 正しい実装：各テスト前にリセット
beforeEach(() => {
  vi.clearAllMocks() // 全てのモックをリセット
  mockClient = createMockSupabaseClient() // 新しいモッククライアントを作成
  api = new RecordAPI(mockClient)
})
```

---

### 2.2 複数テーブルのモックが正しく動作しない

#### 問題: テーブルクエリの順序が正しくない

**原因**：
- `queueTable`の順序が実際のクエリ順序と一致していない

**解決策**：

```typescript
// ✅ 正しい実装：実際のクエリ順序に合わせる
// API実装を確認して、クエリの順序を把握
supabaseMock.queueTable('practices', [{ data: { team_id: 'team-1' } }])
supabaseMock.queueTable('team_memberships', [{ data: { id: 'membership-1' } }])
supabaseMock.queueTable('team_attendance', [{ data: [attendanceRow] }])
```

---

### 2.3 モックの検証が失敗する

#### 問題: `toHaveBeenCalledWith`が期待通りに動作しない

**原因**：
- モックの引数が正確に一致していない
- オブジェクトの参照が異なる

**解決策**：

```typescript
// ✅ 正しい実装：部分マッチングを使用
expect(mockApi.getPractices).toHaveBeenCalledWith(
  '2025-01-01',
  '2025-01-31'
)

// オブジェクトの場合は部分マッチング
expect(mockApi.createPractice).toHaveBeenCalledWith(
  expect.objectContaining({
    date: '2025-01-15',
    place: 'テストプール',
  })
)
```

---

## § 3. テストが不安定な場合の対処

### 3.1 非同期処理のタイミング問題

#### 問題: テストが時々失敗する

**原因**：
- 非同期処理の完了を待っていない
- `waitFor`を使用していない

**解決策**：

```typescript
// ✅ 正しい実装：waitForで待機
import { waitFor } from '@testing-library/react'

it('データが読み込まれる', async () => {
  const { result } = renderHook(() => usePractices(mockClient, { api }))

  await waitFor(() => {
    expect(result.current.loading).toBe(false)
  })

  expect(result.current.practices).toHaveLength(1)
})
```

---

### 3.2 タイマー関連のテスト

#### 問題: タイマーが正しく動作しない

**原因**：
- 実タイマーを使用している
- `vi.useFakeTimers()`を使用していない

**解決策**：

```typescript
// ✅ 正しい実装：フェイクタイマーを使用
import { vi } from 'vitest'

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
```

---

## § 4. カバレッジ関連の問題

### 4.1 カバレッジが低い

#### 問題: カバレッジが目標値に達しない

**原因**：
- テストケースが不足している
- エッジケースがテストされていない

**解決策**：
- 正常系と異常系の両方をテスト
- エッジケースを追加
- ブランチカバレッジを確認

---

### 4.2 カバレッジレポートが生成されない

#### 問題: カバレッジレポートが表示されない

**原因**：
- `vitest.config.ts`の設定が不完全
- カバレッジプロバイダーが設定されていない

**解決策**：

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8', // または 'istanbul'
      reporter: ['text', 'json', 'html'],
    },
  },
})
```

---

## § 5. パフォーマンス関連の問題

### 5.1 テストの実行が遅い

#### 問題: テストの実行に時間がかかる

**原因**：
- 実データベースに接続している
- 不要な非同期処理がある

**解決策**：
- モックを使用して外部依存を排除
- 不要な`waitFor`を削除
- テストを並列実行

---

## § 6. 新しいエラー対処の追記

### [日付] - [エラー名]

**エラーメッセージ**：  
**原因**：  
**解決策**：  
**関連ファイル**：  

---

## § 7. トラブルシューティングログ

### 2025-01-20
- 初版作成
- よくあるエラーと解決策を記録

---

**最終更新**: 2025-01-20  
**管理者**: QA Team

