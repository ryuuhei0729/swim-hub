# unit_Main-rule.md - 単体テストプロジェクト メインルールブック

**プロジェクト名**: Unit Test Framework  
**対象環境**: Vitest + TypeScript  
**最終更新**: 2025-01-20

---

## 📘 このドキュメントについて

### 目的と位置づけ

このドキュメントは、**AIによるコード生成とレビューのルールエンジン**として機能します：

```
┌──────────────────────────────────────┐
│ 人間：自然言語で指示                 │
│ 「RecordAPIのテストを作って」        │
└──────────────────────────────────────┘
           ↓
┌──────────────────────────────────────┐
│ Cursor                               │
│ → このunit_Main-rule.mdを参照         │
│ → Vitestコード生成                    │
└──────────────────────────────────────┘
           ↓
┌──────────────────────────────────────┐
│ テスト実行 → 不備発見                │
│ → 曖昧さ/未定義条件を特定            │
│ → ルール化して追記                   │
└──────────────────────────────────────┘
           ↓
┌──────────────────────────────────────┐
│ AIレビュー（Cursor）                 │
│ → ルール準拠をチェック               │
└──────────────────────────────────────┘
```

### ドキュメント構成

このプロジェクトは**4つのルールブック**で構成されています：

| ドキュメント | 役割 | 行数 |
|-------------|------|------|
| **unit_Main-rule.md** (本書) | メインルールブック・必須事項 | 400行 |
| **[unit_Patterns.md](./unit_Patterns.md)** | 実装パターン・成功事例 | 400行 |
| **[unit_Mocking.md](./unit_Mocking.md)** | モック戦略・Supabaseモックガイド | 400行 |
| **[unit_FAQ.md](./unit_FAQ.md)** | トラブルシューティング | 300行 |

### 優先順位

**矛盾する場合の優先順位**：
1. **unit_Main-rule.md（本書）** - 必須ルール・禁止事項
2. **unit_Patterns.md / unit_Mocking.md** - プロジェクト固有の実装方法
3. 汎用的なベストプラクティス（参考）

---

## 🎯 プロジェクト概要

### 基本情報

このプロジェクトは、**単体テスト**を行うためのテストフレームワークです。

**技術スタック**：
- Vitest（テストフレームワーク）
- TypeScript
- @testing-library/react（Reactコンポーネントテスト）
- @testing-library/user-event（ユーザー操作シミュレーション）
- Supabase（モック対象）

**開発フロー**：
- 自然言語での指示 → AI（Cursor）がコード生成
- テスト実行 → 不備発見 → ルール化
- AIレビュー → ルール準拠チェック

### テスト対象

このプロジェクトでは以下のテスト対象を扱います：

1. **APIクラス** (`apps/shared/api/`)
   - Supabaseクライアントを使用するAPIクラス
   - 例: `RecordAPI`, `PracticeAPI`, `StyleAPI`

2. **React Hooks** (`apps/shared/hooks/`)
   - カスタムフック
   - 例: `usePractices`, `useRecords`, `useTeams`

3. **Reactコンポーネント** (`apps/web/components/`)
   - UIコンポーネント
   - 例: `PracticeForm`, `RecordForm`

4. **ユーティリティ関数** (`apps/shared/utils/`, `apps/web/utils/`)
   - 純粋関数
   - 例: `formatTime`, `validateDate`

---

## 🚨 § 2. 絶対に守るべき必須ルール

### 2.1 モック使用ルール（MUST）

#### ✅ 必須：Supabaseモックを使用

**ルール化の背景**：
- **日付**: 2025-01-20
- **発見**: 実データベースへの接続がテストに含まれていた
- **問題**: テストが不安定、実行が遅い、データ汚染のリスク
- **結論**: 必ずモックを使用する方針に決定

```typescript
// ✅ 正しい実装：モックを使用
import { createMockSupabaseClient } from '../../__mocks__/supabase'

describe('RecordAPI', () => {
  let mockClient: any
  let api: RecordAPI

  beforeEach(() => {
    mockClient = createMockSupabaseClient()
    api = new RecordAPI(mockClient)
  })
})
```

```typescript
// ❌ 絶対禁止：実データベースに接続
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
)
```

**対象となる外部依存**：
- Supabaseクライアント
- Next.js Router (`next/navigation`)
- ブラウザAPI (`localStorage`, `window`等)
- タイマー関数 (`setTimeout`, `setInterval`)

**レビューポイント**：
- 実データベースへの接続がないか
- モックが適切に使用されているか
- `__mocks__`ディレクトリのモックを活用しているか

---

### 2.2 テスト構造ルール（MUST）

#### ✅ 必須：describe/it構造を使用

```typescript
// ✅ 正しい実装
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('RecordAPI', () => {
  let mockClient: any
  let api: RecordAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    api = new RecordAPI(mockClient)
  })

  describe('getRecords', () => {
    it('認証済みユーザーのとき記録一覧を取得できる', async () => {
      // テスト内容
    })
  })
})
```

#### ✅ 必須：beforeEachでモックをリセット

```typescript
// ✅ 正しい実装：各テスト前にモックをリセット
beforeEach(() => {
  vi.clearAllMocks()
  mockClient = createMockSupabaseClient()
  api = new RecordAPI(mockClient)
})
```

**理由**：
- テスト間の依存関係を排除
- テストの独立性を保証
- 予期しない副作用を防止

---

### 2.3 テストデータルール（MUST）

#### ✅ 必須：テストデータファクトリーを使用

```typescript
// ✅ 正しい実装：ファクトリー関数を使用
import { createMockRecord, createMockPractice } from '../../__mocks__/supabase'

it('記録一覧を取得できる', async () => {
  const mockRecord = createMockRecord({
    id: 'record-1',
    time_seconds: 60.5
  })
  
  // テスト内容
})
```

```typescript
// ❌ 禁止：ハードコードされたテストデータ
it('記録一覧を取得できる', async () => {
  const mockRecord = {
    id: 'record-1',
    user_id: 'test-user-id',
    competition_id: 'comp-1',
    style_id: 1,
    time_seconds: 60.5,
    // ... 全てのフィールドを手動で定義
  }
})
```

**理由**：
- テストデータの一貫性を保証
- デフォルト値の管理が容易
- 型安全性の確保

**利用可能なファクトリー関数**：
- `createMockPractice`
- `createMockRecord`
- `createMockStyle`
- `createMockTeam`
- `createMockPracticeLog`

**詳細**：👉 **[unit_Mocking.md § 3](./unit_Mocking.md)**

---

### 2.4 命名規則ルール（MUST）

#### ✅ 必須：テスト名は日本語で明確に記述

```typescript
// ✅ 良い例：日本語で明確に記述
describe('記録取得', () => {
  it('認証済みユーザーのとき記録一覧を取得できる', async () => {
    // テスト内容
  })
  
  it('認証されていないときエラーになる', async () => {
    // テスト内容
  })
  
  it('日付範囲を指定したとき該当期間の記録を取得できる', async () => {
    // テスト内容
  })
})

describe('レンダリング', () => {
  it('フォームが開いているときに表示される', () => {
    // テスト内容
  })
  
  it('フォームが閉じているときに表示されない', () => {
    // テスト内容
  })
})
```

```typescript
// ❌ 悪い例：内容が不明確
it('test1', async () => {
  // テスト内容
})

it('fetch', async () => {
  // テスト内容
})

it('記録一覧を取得できる', async () => {
  // テスト内容（英語は禁止）
})
```

**推奨フォーマット**：
- 日本語: `[条件]のとき[期待動作]`
  - 正常系の例: `認証済みユーザーのとき記録一覧を取得できる`
  - 異常系の例: `認証されていないときエラーになる`
  - 条件が不要な場合: `初期表示でフォームが表示される`

---

### 2.5 AAAパターンルール（推奨）

#### ✅ 推奨：AAAパターンに従う

```typescript
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
  expect(result).toEqual([mockRecord])
  expect(mockClient.from).toHaveBeenCalledWith('records')
})
```

**理由**：
- テストの可読性向上
- テストの構造化
- デバッグの容易化

---

## 🚫 § 3. 禁止事項まとめ

| 禁止事項 | 理由 | 代替手段 |
|---------|------|----------|
| 実データベースへの接続 | テスト不安定、実行遅延 | Supabaseモック |
| ハードコードされたテストデータ | 保守性低下、一貫性欠如 | テストデータファクトリー |
| テスト間の依存関係 | テストの独立性欠如 | beforeEachでリセット |
| モックの不適切な使用 | テストの信頼性低下 | 適切なモック戦略 |
| テスト名の不明確な記述 | 可読性低下 | 明確な命名規則 |

---

## 📁 § 4. ディレクトリ構成

```
apps/
├── shared/
│   ├── __tests__/                    # 単体テスト
│   │   ├── api/                      # APIクラステスト
│   │   │   ├── records.test.ts
│   │   │   ├── practices.test.ts
│   │   │   └── styles.test.ts
│   │   ├── hooks/                   # React Hooksテスト
│   │   │   ├── usePractices.test.tsx
│   │   │   └── useRecords.test.tsx
│   │   ├── teams/                   # チーム機能テスト
│   │   │   └── ...
│   │   └── utils/                   # ユーティリティテスト
│   │       └── supabase-mock.ts
│   ├── __mocks__/                    # モック定義
│   │   └── supabase.ts              # Supabaseモック
│   ├── api/                         # テスト対象：APIクラス
│   ├── hooks/                       # テスト対象：React Hooks
│   └── utils/                       # テスト対象：ユーティリティ
│
└── web/
    ├── __tests__/                   # 単体テスト
    │   ├── components/              # コンポーネントテスト
    │   │   ├── forms/
    │   │   │   └── PracticeForm.test.tsx
    │   │   └── ui/
    │   ├── contexts/               # Contextテスト
    │   └── utils/                  # ユーティリティテスト
    └── components/                  # テスト対象：コンポーネント
```

### ファイル命名規則

| 種類 | 命名規則 | 例 |
|------|---------|-----|
| テストファイル | `{対象名}.test.ts` または `{対象名}.test.tsx` | `records.test.ts`, `PracticeForm.test.tsx` |
| モックファイル | `{対象名}.ts` | `supabase.ts` |
| テストデータ | `createMock{型名}` | `createMockPractice`, `createMockRecord` |

---

## 🧪 § 5. テストコード品質ルール

### 5.1 テストの独立性

**必須**：各テストは独立して実行可能であること

```typescript
// ✅ 良い例：各テストが独立
describe('RecordAPI', () => {
  let mockClient: any
  let api: RecordAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    api = new RecordAPI(mockClient)
  })

  it('記録一覧を取得できる', async () => {
    // このテストは他のテストに依存しない
  })

  it('記録を作成できる', async () => {
    // このテストも他のテストに依存しない
  })
})
```

### 5.2 テストの実行速度

**推奨**：単体テストは高速に実行されること

- モックを使用して外部依存を排除
- 非同期処理は適切にモック
- タイマーは`vi.useFakeTimers()`を使用

### 5.3 テストのカバレッジ

**目標**：
- Lines: 75%
- Functions: 50%
- Branches: 80%
- Statements: 75%

（`apps/shared/vitest.config.ts`参照）

---

## 📋 § 6. AIレビューチェックリスト

Cursorがコードレビューする際は、以下を確認すること：

### 必須チェック（違反 = MUST FIX）

#### ✅ モック使用
- [ ] 実データベースへの接続がない
- [ ] `createMockSupabaseClient`を使用している
- [ ] 外部依存が適切にモックされている

#### ✅ テスト構造
- [ ] `describe/it`構造を使用している
- [ ] `beforeEach`でモックをリセットしている
- [ ] テスト名が明確に記述されている

#### ✅ テストデータ
- [ ] テストデータファクトリーを使用している
- [ ] ハードコードされたテストデータがない

#### ✅ テストの独立性
- [ ] テスト間の依存関係がない
- [ ] 各テストが独立して実行可能

---

### 推奨チェック（違反 = SHOULD FIX）

#### ✅ コード品質
- [ ] AAAパターンに従っている
- [ ] 適切なアサーションを使用している
- [ ] エラーハンドリングがテストされている

#### ✅ テスト品質
- [ ] 正常系と異常系の両方をテストしている
- [ ] エッジケースをテストしている
- [ ] テストが高速に実行される

---

## 📚 § 7. 詳細ドキュメント参照

コード生成・実装の詳細は、以下のドキュメントを参照してください：

### 🎯 実装パターン
👉 **[unit_Patterns.md](./unit_Patterns.md)**
- APIクラステストパターン
- React Hooksテストパターン
- Reactコンポーネントテストパターン
- エラーハンドリングパターン
- 認証チェックパターン

### 🔧 モック戦略
👉 **[unit_Mocking.md](./unit_Mocking.md)**
- Supabaseモックの使い方
- クエリビルダーモック詳細
- テストデータファクトリー活用方法
- 複数テーブル連携のモック例
- Next.js Routerモック例

### 🔍 トラブルシューティング
👉 **[unit_FAQ.md](./unit_FAQ.md)**
- よくあるエラーと解決策
- モックが動作しない場合の対処
- テストが不安定な場合の対処

---

## 🚀 § 8. 開発コマンド

```bash
# テスト実行
npm test                    # 全テスト実行
npm run test:watch          # ウォッチモード
npm run test:coverage       # カバレッジレポート生成

# 特定のテストのみ実行
npx vitest run apps/shared/__tests__/api/records.test.ts
```

---

## ✅ § 9. クイックチェックリスト

### APIクラステスト作成時
- [ ] `import { createMockSupabaseClient } from '../../__mocks__/supabase'` を追加
- [ ] `beforeEach`でモックをリセット
- [ ] テストデータファクトリーを使用
- [ ] 正常系と異常系の両方をテスト

### React Hooksテスト作成時
- [ ] `import { renderHook, waitFor } from '@testing-library/react'` を追加
- [ ] APIクラスをモック
- [ ] ローディング状態をテスト
- [ ] エラーハンドリングをテスト

### Reactコンポーネントテスト作成時
- [ ] `import { render, screen } from '@testing-library/react'` を追加
- [ ] `import userEvent from '@testing-library/user-event'` を追加
- [ ] Next.js Routerをモック（必要に応じて）
- [ ] ユーザー操作をシミュレート

---

## 📝 § 10. ルールの追加・更新

### 新しいルールの追加方法

1. **テスト実行で不備を発見**
2. **原因を特定**：曖昧さ？未定義条件？
3. **適切なドキュメントに追記**：
   - パターン関連 → `unit_Patterns.md`
   - モック関連 → `unit_Mocking.md`
   - エラー対処 → `unit_FAQ.md`
4. **ルール化の背景を記録**：
   - 日付、発見内容、原因、試行錯誤、結論

---

**最終更新**: 2025-01-20  
**管理者**: QA Team

**変更履歴**
- v1.0 (2025-01-20): 初版作成

