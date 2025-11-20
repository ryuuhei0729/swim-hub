# unit_Patterns.md - 実装パターン・成功事例集

**最終更新**: 2025-01-20

---

## 📘 このドキュメントについて

このドキュメントは、**このプロジェクトで実際に動作した実装パターンと成功事例**を記載しています。

**対象**：
- Cursorによるコード生成
- 開発者の実装時の参照
- 新しいパターンの追記

**メインルールブック**：👉 [unit_Main-rule.md](./unit_Main-rule.md)

---

## § 1. APIクラステストパターン

### 1.1 基本パターン

**ルール化の背景**：
- **日付**: 2025-01-20
- **発見**: APIクラスのテストパターンが統一されていない
- **結論**: 標準パターンを確立

#### 基本構造

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockRecord, createMockSupabaseClient } from '../../__mocks__/supabase'
import { RecordAPI } from '../../api/records'

describe('RecordAPI', () => {
  let mockClient: any
  let api: RecordAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    api = new RecordAPI(mockClient)
  })

  describe('記録取得', () => {
    it('認証済みユーザーのとき記録一覧を取得できる', async () => {
      // Arrange: テスト準備
      const mockRecord = createMockRecord()
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [mockRecord],
          error: null,
        }),
      }))

      // Act: 操作実行
      const result = await api.getRecords()

      // Assert: 結果検証
      expect(mockClient.auth.getUser).toHaveBeenCalled()
      expect(mockClient.from).toHaveBeenCalledWith('records')
      expect(result).toEqual([mockRecord])
    })
  })
})
```

**重要なポイント**：
1. `beforeEach`でモックをリセット
2. テストデータファクトリーを使用
3. モッククライアントをAPIクラスに注入
4. 正常系と異常系の両方をテスト

---

### 1.2 フィルタリングパターン

**実装例**：日付範囲やスタイルでフィルタリングするテスト

```typescript
describe('記録取得', () => {
  it('日付範囲を指定したとき該当期間の記録を取得できる', async () => {
    const mockRecord = createMockRecord()
    mockClient.from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            gte: vi.fn(() => ({
              lte: vi.fn().mockResolvedValue({
                data: [mockRecord],
                error: null,
              }),
            })),
          })),
        })),
      })),
    }))

    await api.getRecords('2025-01-01', '2025-01-31')

    expect(mockClient.from).toHaveBeenCalledWith('records')
  })

  it('種目を指定したとき該当種目の記録を取得できる', async () => {
    const mockRecord = createMockRecord()
    mockClient.from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({
              data: [mockRecord],
              error: null,
            }),
          })),
        })),
      })),
    }))

    await api.getRecords(undefined, undefined, 1)

    expect(mockClient.from).toHaveBeenCalledWith('records')
  })
})
```

**ポイント**：
- チェーンメソッドは`mockReturnThis()`で自分自身を返す
- 最終的な結果は`mockResolvedValue()`で返す

---

### 1.3 CRUD操作パターン

#### Create（作成）

```typescript
describe('記録作成', () => {
  it('認証済みユーザーのとき記録を作成できる', async () => {
    const newRecord = {
      competition_id: 'comp-1',
      style_id: 1,
      time: 60.5,
      video_url: null,
      note: 'テストメモ',
      is_relaying: false,
    }
    const createdRecord = createMockRecord(newRecord)

    mockClient.from = vi.fn(() => ({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: createdRecord,
        error: null,
      }),
    }))

    const result = await api.createRecord(newRecord)

    expect(mockClient.from).toHaveBeenCalledWith('records')
    expect(result).toEqual(createdRecord)
  })
})
```

#### Update（更新）

```typescript
describe('記録更新', () => {
  it('記録を更新できる', async () => {
    const updatedRecord = createMockRecord({ time_seconds: 59.0 })

    mockClient.from = vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: updatedRecord,
        error: null,
      }),
    }))

    const result = await api.updateRecord('record-1', { time: 59.0 })

    expect(mockClient.from).toHaveBeenCalledWith('records')
    expect(result).toEqual(updatedRecord)
  })
})
```

#### Delete（削除）

```typescript
describe('記録削除', () => {
  it('記録を削除できる', async () => {
    mockClient.from = vi.fn(() => ({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    }))

    await expect(api.deleteRecord('record-1')).resolves.toBeUndefined()

    expect(mockClient.from).toHaveBeenCalledWith('records')
  })
})
```

---

### 1.4 認証チェックパターン

**実装例**：認証が必要なAPIのテスト

```typescript
describe('getRecords', () => {
  it('認証されていないときエラーになる', async () => {
    mockClient = createMockSupabaseClient({ userId: '' })
    api = new RecordAPI(mockClient)

    await expect(api.getRecords()).rejects.toThrow('認証が必要です')
  })
})
```

**ポイント**：
- `createMockSupabaseClient({ userId: '' })`で未認証状態をシミュレート
- エラーメッセージを検証

---

## § 2. React Hooksテストパターン

### 2.1 基本パターン

**ルール化の背景**：
- **日付**: 2025-01-20
- **発見**: React Hooksのテストパターンが統一されていない
- **結論**: `renderHook`を使用した標準パターンを確立

#### 基本構造

```typescript
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
}

describe('usePractices', () => {
  let mockClient: any
  let practiceApiMock: PracticeApiMock
  let api: PracticeAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    practiceApiMock = {
      getPractices: vi.fn(),
      createPractice: vi.fn(),
      updatePractice: vi.fn(),
      deletePractice: vi.fn(),
    }
    api = practiceApiMock as unknown as PracticeAPI
  })
})
```

---

### 2.2 初期化パターン

```typescript
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
```

**ポイント**：
- `renderHook`でフックを実行
- `waitFor`で非同期処理の完了を待つ
- `act`で状態更新をラップ

---

### 2.3 データ取得パターン

```typescript
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
```

---

### 2.4 操作関数パターン

```typescript
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
})
```

**ポイント**：
- `act`で非同期操作をラップ
- 操作後の再取得を検証

---

### 2.5 リアルタイム購読パターン

```typescript
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
```

**ポイント**：
- `unmount`でクリーンアップを検証
- オプションによる動作の違いをテスト

---

## § 3. Reactコンポーネントテストパターン

### 3.1 基本パターン

**ルール化の背景**：
- **日付**: 2025-01-20
- **発見**: Reactコンポーネントのテストパターンが統一されていない
- **結論**: `@testing-library/react`を使用した標準パターンを確立

#### 基本構造

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import PracticeForm from '../../../components/forms/PracticeForm'

// Next.js Router をモック
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

describe('PracticeForm', () => {
  const mockOnClose = vi.fn()
  const mockOnSubmit = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })
})
```

---

### 3.2 レンダリングパターン

```typescript
describe('レンダリング', () => {
  it('フォームが開いているときに表示される', () => {
    render(
      <PracticeForm
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    )

    expect(screen.getByText('練習記録を追加')).toBeInTheDocument()
    expect(screen.getByLabelText('練習日')).toBeInTheDocument()
    expect(screen.getByLabelText('練習場所')).toBeInTheDocument()
    expect(screen.getByLabelText('メモ')).toBeInTheDocument()
  })

  it('フォームが閉じているときに表示されない', () => {
    render(
      <PracticeForm
        isOpen={false}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    )

    expect(screen.queryByText('練習記録を追加')).not.toBeInTheDocument()
  })
})
```

**ポイント**：
- `screen.getByText`で要素の存在を確認
- `screen.queryByText`で要素の不在を確認

---

### 3.3 フォーム入力パターン

```typescript
describe('フォーム入力', () => {
  it('ユーザーが入力したときフォームデータが更新される', async () => {
    const user = userEvent.setup()
    
    render(
      <PracticeForm
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    )

    const placeInput = screen.getByLabelText('練習場所')
    const noteInput = screen.getByLabelText('メモ')

    await user.type(placeInput, 'テストプール')
    await user.type(noteInput, 'テスト練習')

    expect(placeInput).toHaveValue('テストプール')
    expect(noteInput).toHaveValue('テスト練習')
  })

  it('初期日付を指定したときその日付で初期化される', () => {
    const initialDate = new Date('2025-01-15')
    
    render(
      <PracticeForm
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        initialDate={initialDate}
      />
    )

    const dateInput = screen.getByLabelText('練習日')
    expect(dateInput).toHaveValue('2025-01-15')
  })
})
```

**ポイント**：
- `userEvent.setup()`でユーザー操作をシミュレート
- `user.type()`でテキスト入力
- `toHaveValue()`で入力値を検証

---

### 3.4 フォーム送信パターン

```typescript
describe('フォーム送信', () => {
  it('フォームデータとともにonSubmitが呼ばれる', async () => {
    const user = userEvent.setup()
    mockOnSubmit.mockResolvedValue(undefined)
    
    render(
      <PracticeForm
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    )

    const placeInput = screen.getByLabelText('練習場所')
    const noteInput = screen.getByLabelText('メモ')
    const submitButton = screen.getByRole('button', { name: '保存' })

    await user.type(placeInput, 'テストプール')
    await user.type(noteInput, 'テスト練習')
    await user.click(submitButton)

    expect(mockOnSubmit).toHaveBeenCalledWith({
      practiceDate: expect.any(String),
      place: 'テストプール',
      note: 'テスト練習'
    })
  })

  it('送信中はローディング状態が表示される', async () => {
    const user = userEvent.setup()
    mockOnSubmit.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)))
    
    const { rerender } = render(
      <PracticeForm
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    )

    const placeInput = screen.getByLabelText('練習場所')
    await user.type(placeInput, 'テストプール')

    const submitButton = screen.getByRole('button', { name: '保存' })
    await user.click(submitButton)

    rerender(
      <PracticeForm
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        isLoading={true}
      />
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '保存中...' })).toBeInTheDocument()
    })
  })
})
```

**ポイント**：
- `user.click()`でボタンクリック
- `mockResolvedValue()`で非同期処理をモック
- `rerender()`で状態変更をシミュレート

---

### 3.5 バリデーションパターン

```typescript
describe('バリデーション', () => {
  it('必須項目が空のときエラーが表示される', async () => {
    const user = userEvent.setup()
    
    render(
      <PracticeForm
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    )

    const dateInput = screen.getByLabelText('練習日')
    await user.clear(dateInput)
    
    const submitButton = screen.getByRole('button', { name: '保存' })
    await user.click(submitButton)

    // HTML5のバリデーションが動作することを確認
    expect(dateInput).toBeInvalid()
  })
})
```

---

## § 4. エラーハンドリングパターン

### 4.1 APIエラーパターン

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

### 4.2 更新エラーパターン

```typescript
describe('記録更新', () => {
  it('更新が失敗したときエラーが発生する', async () => {
    const error = new Error('Update failed')
    mockClient.from = vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error,
      }),
    }))

    await expect(api.updateRecord('record-1', { time: 59.0 })).rejects.toThrow(
      'Update failed'
    )
  })
})
```

### 4.3 コンポーネントエラーパターン

```typescript
describe('フォーム送信', () => {
  it('送信エラーが発生したときエラーを処理できる', async () => {
    const user = userEvent.setup()
    const error = new Error('保存に失敗しました')
    mockOnSubmit.mockRejectedValue(error)
    
    render(
      <PracticeForm
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    )

    const placeInput = screen.getByLabelText('練習場所')
    await user.type(placeInput, 'テストプール')

    const submitButton = screen.getByRole('button', { name: '保存' })
    await user.click(submitButton)

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled()
    })
  })
})
```

---

## § 5. 認証チェックパターン

### 5.1 未認証エラーパターン

```typescript
describe('getRecords', () => {
  it('認証されていないときエラーになる', async () => {
    mockClient = createMockSupabaseClient({ userId: '' })
    api = new RecordAPI(mockClient)

    await expect(api.getRecords()).rejects.toThrow('認証が必要です')
  })
})
```

### 5.2 認証状態の確認パターン

```typescript
describe('記録取得', () => {
  it('認証済みユーザーのとき記録一覧を取得できる', async () => {
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

    expect(mockClient.auth.getUser).toHaveBeenCalled()
    expect(result).toEqual([mockRecord])
  })
})
```

---

## § 6. 新パターン追記エリア

### [日付] - [パターン名]

**実装背景**：  
**成功要因**：  
**コード例**：  
**注意点**：  

---

## § 7. パターン改善ログ

### 2025-01-20
- 初版作成
- APIクラス、React Hooks、Reactコンポーネントのテストパターンを記録

---

**最終更新**: 2025-01-20  
**管理者**: QA Team

