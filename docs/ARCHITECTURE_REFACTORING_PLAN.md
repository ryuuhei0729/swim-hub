# アーキテクチャリファクタリング計画 - Swim Hub v2

## 📋 概要

このドキュメントは、Swim Hub v2プロジェクトのレポジトリ構造をMECE（Mutually Exclusive, Collectively Exhaustive）の観点で分析し、ベストプラクティスに基づいたリファクタリング計画をまとめたものです。

**目的**: コードの可読性・保守性・開発効率の向上、MECE原則に基づく構造の最適化

**作成日**: 2025年1月15日  
**想定期間**: 1週間  
**担当者**: ryuuhei0729

---

## 🎯 リファクタリングの目的とメリット

### 現在の問題点

| 問題領域 | 現状 | 問題点 |
|---------|------|--------|
| **型定義** | 3箇所に分散 | 重複・保守性低下 |
| **コンポーネント** | 分類基準不明確 | 可読性・発見性低下 |
| **フック** | 共通・専用の境界曖昧 | 再利用性低下 |
| **テスト** | 配置不統一 | テスト実行・管理の複雑化 |
| **設定** | 重複・分散 | メンテナンスコスト増加 |

### 期待されるメリット

| 項目 | Before | After | 改善率 |
|------|--------|-------|--------|
| **型定義の重複** | 3箇所 | 1箇所 | -67% |
| **コンポーネント分類** | 曖昧 | 明確 | 100%改善 |
| **フックの分散** | 2箇所 | 1箇所 | -50% |
| **テスト配置** | 不統一 | 統一 | 100%改善 |
| **設定重複** | 高 | 低 | -70% |
| **開発効率** | 中 | 高 | +40% |

---

## 📊 現状分析

### 現在のレポジトリ構造

```
swim-hub/
├── apps/
│   ├── web/                    # Next.jsアプリケーション
│   │   ├── app/                # App Router
│   │   │   ├── (authenticated)/ # 認証後ページ
│   │   │   ├── (unauthenticated)/ # 認証前ページ
│   │   │   └── api/            # API Routes
│   │   ├── components/         # コンポーネント
│   │   │   ├── auth/          # 認証関連
│   │   │   ├── forms/         # フォーム関連
│   │   │   ├── layout/        # レイアウト関連
│   │   │   ├── members/       # メンバー関連
│   │   │   ├── team/          # チーム関連
│   │   │   └── ui/            # UI関連
│   │   ├── contexts/          # React Context
│   │   ├── hooks/             # カスタムフック
│   │   ├── lib/               # ライブラリ
│   │   ├── types/             # 型定義
│   │   ├── utils/             # ユーティリティ
│   │   └── e2e/               # E2Eテスト
│   └── mobile/                # React Native（未実装）
│
├── packages/
│   └── shared/                # 共通パッケージ
│       ├── api/              # 共通API
│       ├── hooks/            # 共通フック
│       ├── types/            # 共通型定義
│       └── utils/            # 共通ユーティリティ
│
├── supabase/                 # Supabase設定
│   ├── functions/            # Edge Functions
│   └── migrations/           # データベースマイグレーション
│
└── docs/                    # ドキュメント
```

### 発見されたMECE違反箇所

#### 1. 型定義の重複・分散 🚨

**問題**: 型定義が複数箇所に分散し、重複が発生

```
❌ 現在の構造
├── apps/web/types/index.ts (496行) - Web専用型定義
├── packages/shared/types/database.ts - 共通データベース型
├── packages/shared/types/ui.ts - 共通UI型
└── apps/web/types/team.ts - チーム型定義
```

**問題点**:
- 同じ型が複数箇所で定義されている
- `apps/web/types/index.ts`が巨大（496行）
- 型定義の責任範囲が不明確

#### 2. コンポーネント分類の曖昧さ 🚨

**問題**: コンポーネントの分類基準が不明確

```
❌ 現在の構造
├── components/forms/ - フォーム関連
├── components/team/ - チーム関連  
├── components/members/ - メンバー関連
└── components/layout/ - レイアウト関連
```

**問題点**:
- `components/members/` と `components/team/` の境界が曖昧
- フォームコンポーネントが機能別に分散していない

#### 3. フックの配置不整合 🚨

**問題**: フックが複数箇所に分散

```
❌ 現在の構造
├── apps/web/hooks/ - Web専用フック
├── packages/shared/hooks/ - 共通フック
└── apps/web/hooks/useTeamAnnouncements.ts - チーム専用フック
```

**問題点**:
- 共通フックとWeb専用フックの境界が不明確
- `useTeamAnnouncements`がWeb側に残っている

#### 4. テストファイルの配置不整合 🚨

**問題**: テストファイルの配置が統一されていない

```
❌ 現在の構造
├── apps/web/components/forms/PracticeForm.test.tsx
├── packages/shared/api/practices.test.ts
└── apps/web/e2e/ - E2Eテスト
```

**問題点**:
- 単体テストとE2Eテストの配置基準が不明確
- テストファイルが機能別に分散

#### 5. 設定ファイルの分散 🚨

**問題**: 設定ファイルが複数箇所に分散

```
❌ 現在の構造
├── apps/web/package.json
├── packages/shared/package.json
├── apps/web/tsconfig.json
├── packages/shared/tsconfig.json
└── apps/web/vitest.config.ts
```

**問題点**:
- 設定ファイルの責任範囲が不明確
- 重複する設定項目がある

---

## 🏗️ 目標構造（ベストプラクティス）

### 推奨されるモノレポ構造

```
swim-hub/
├── apps/
│   ├── web/                    # Next.jsアプリケーション
│   │   ├── app/                # App Router
│   │   ├── components/         # Web専用コンポーネント
│   │   │   ├── features/       # 機能別コンポーネント
│   │   │   │   ├── auth/       # 認証関連
│   │   │   │   ├── practice/   # 練習関連
│   │   │   │   ├── competition/ # 大会関連
│   │   │   │   ├── team/       # チーム関連
│   │   │   │   └── dashboard/  # ダッシュボード関連
│   │   │   ├── ui/             # 汎用UIコンポーネント
│   │   │   ├── forms/          # 汎用フォームコンポーネント
│   │   │   └── layout/         # レイアウトコンポーネント
│   │   ├── hooks/              # Web専用フック
│   │   ├── lib/                # Web専用ライブラリ
│   │   ├── types/              # Web専用型定義
│   │   ├── utils/              # Web専用ユーティリティ
│   │   ├── __tests__/          # 単体テスト
│   │   └── e2e/                # E2Eテスト
│   └── mobile/                 # React Native（将来）
│
├── packages/
│   ├── shared/                 # 共通パッケージ
│   │   ├── api/                # 共通API
│   │   ├── hooks/              # 共通フック
│   │   ├── types/              # 共通型定義
│   │   │   ├── database.ts     # データベース型
│   │   │   ├── api.ts          # API型
│   │   │   ├── ui.ts           # UI型
│   │   │   └── index.ts        # エクスポート統合
│   │   └── utils/              # 共通ユーティリティ
│   ├── ui/                     # 共通UIコンポーネント（将来）
│   └── config/                 # 共通設定（将来）
│
├── tools/                      # 開発ツール
│   ├── eslint-config/         # ESLint設定
│   ├── typescript-config/      # TypeScript設定
│   ├── vitest-config/          # Vitest設定
│   └── tailwind-config/        # Tailwind設定
│
├── supabase/                   # Supabase設定
│   ├── functions/              # Edge Functions
│   └── migrations/             # データベースマイグレーション
│
└── docs/                      # ドキュメント
```

### 設計原則

#### 1. MECE原則の適用
- **Mutually Exclusive**: 各ディレクトリの責任範囲が重複しない
- **Collectively Exhaustive**: すべてのファイルが適切な場所に配置される

#### 2. 責任分離の原則
- **共通パッケージ**: 複数のアプリで使用される機能
- **アプリ専用**: 特定のアプリでのみ使用される機能
- **設定**: 開発・ビルド・テスト設定の分離

#### 3. スケーラビリティの考慮
- 新しいアプリ（Mobile）の追加に対応
- 共通パッケージの拡張に対応
- 開発ツールの追加に対応

---

## 🗓️ リファクタリングスケジュール

### Phase 1: 型定義の統合・整理（優先度: ⭐⭐⭐）

**期間**: 1-2日  
**目標**: 型定義の重複削除・責任分離

#### Day 1: 型定義の分析・整理
- [ ] 現在の型定義の重複箇所を特定
- [ ] 共通型とWeb専用型の分類
- [ ] 型定義の責任範囲を明確化

#### Day 2: 型定義の移行・統合
- [ ] 共通型を`packages/shared/types/`に集約
- [ ] Web専用型を`apps/web/types/`に整理
- [ ] 重複型定義の削除
- [ ] エクスポートの統合

### Phase 2: コンポーネント構造の再編（優先度: ⭐⭐）

**期間**: 2-3日  
**目標**: 機能別コンポーネント分類・責任分離

#### Day 3-4: コンポーネントの分類・移行
- [ ] 機能別コンポーネントを`features/`配下に集約
- [ ] 汎用コンポーネントを`ui/`配下に集約
- [ ] フォームコンポーネントの機能別分散
- [ ] インデックスファイルの更新

#### Day 5: コンポーネントの整理・最適化
- [ ] 不要なコンポーネントの削除
- [ ] コンポーネントの命名規則統一
- [ ] ドキュメントの更新

### Phase 3: フック構造の整理（優先度: ⭐⭐）

**期間**: 1日  
**目標**: フックの責任分離・共通化

#### Day 6: フックの移行・整理
- [ ] `useTeamAnnouncements`を`packages/shared/hooks/`に移行
- [ ] Web専用フックのみ`apps/web/hooks/`に残す
- [ ] フックの命名規則統一
- [ ] インデックスファイルの更新

### Phase 4: テスト構造の統一（優先度: ⭐）

**期間**: 1日  
**目標**: テストファイルの配置統一

#### Day 7: テストファイルの移行・整理
- [ ] 単体テストを`__tests__/`配下に集約
- [ ] E2Eテストの配置統一
- [ ] テスト設定の統合
- [ ] テスト実行スクリプトの更新

### Phase 5: 設定ファイルの統合（優先度: ⭐）

**期間**: 1日  
**目標**: 設定ファイルの重複削除・統合

#### Day 8: 設定ファイルの統合
- [ ] 共通設定を`tools/`配下に集約
- [ ] 各パッケージで共通設定を継承
- [ ] 重複設定の削除
- [ ] 設定ファイルの最適化

---

## 💻 実装パターン

### 1. 型定義の統合例

```typescript
// packages/shared/types/database.ts
export interface UserProfile {
  id: string
  name: string
  // ... 他のフィールド
}

// packages/shared/types/api.ts
export interface ApiResponse<T> {
  data: T
  error: string | null
}

// packages/shared/types/ui.ts
export interface ButtonProps {
  variant: 'primary' | 'secondary'
  size: 'sm' | 'md' | 'lg'
}

// packages/shared/types/index.ts
export * from './database'
export * from './api'
export * from './ui'
```

### 2. コンポーネント構造の例

```typescript
// apps/web/components/features/practice/
├── PracticeList.tsx
├── PracticeForm.tsx
├── PracticeTimeModal.tsx
└── index.ts

// apps/web/components/ui/
├── Button.tsx
├── Modal.tsx
├── Input.tsx
└── index.ts
```

### 3. フック構造の例

```typescript
// packages/shared/hooks/usePractices.ts
export function usePractices(supabase: SupabaseClient) {
  // 共通の練習記録フック
}

// apps/web/hooks/useLocalStorage.ts
export function useLocalStorage<T>(key: string) {
  // Web専用のローカルストレージフック
}
```

### 4. テスト構造の例

```typescript
// apps/web/__tests__/components/features/practice/
├── PracticeList.test.tsx
├── PracticeForm.test.tsx
└── PracticeTimeModal.test.tsx

// packages/shared/__tests__/hooks/
├── usePractices.test.tsx
└── useRecords.test.tsx
```

---

## ✅ チェックリスト

### Phase 1: 型定義統合
- [ ] 型定義の重複箇所特定
- [ ] 共通型の集約
- [ ] Web専用型の整理
- [ ] 重複型定義の削除
- [ ] エクスポートの統合

### Phase 2: コンポーネント再編
- [ ] 機能別コンポーネントの分類
- [ ] 汎用コンポーネントの整理
- [ ] フォームコンポーネントの分散
- [ ] インデックスファイルの更新
- [ ] 不要コンポーネントの削除

### Phase 3: フック整理
- [ ] 共通フックの移行
- [ ] Web専用フックの整理
- [ ] フックの命名規則統一
- [ ] インデックスファイルの更新

### Phase 4: テスト統一
- [ ] 単体テストの集約
- [ ] E2Eテストの配置統一
- [ ] テスト設定の統合
- [ ] テスト実行スクリプトの更新

### Phase 5: 設定統合
- [ ] 共通設定の集約
- [ ] 設定ファイルの継承
- [ ] 重複設定の削除
- [ ] 設定ファイルの最適化

### 最終確認
- [ ] 全機能の動作確認
- [ ] テスト実行
- [ ] ドキュメント更新
- [ ] コードレビュー

---

## 🚨 リスクと対策

### リスク1: 型定義の破綻

**リスク**: 型定義の移行中に型エラーが発生

**対策**:
- 段階的な移行（1ファイルずつ）
- 型チェックの自動化
- 移行前後の動作確認

### リスク2: コンポーネントの依存関係

**リスク**: コンポーネントの移行中に依存関係が破綻

**対策**:
- 依存関係の事前分析
- 段階的な移行
- インポートパスの一括置換

### リスク3: テストの実行エラー

**リスク**: テストファイルの移行中にテストが失敗

**対策**:
- テスト設定の事前確認
- 段階的な移行
- テスト実行の自動化

### リスク4: 設定ファイルの不整合

**リスク**: 設定ファイルの統合中にビルドエラーが発生

**対策**:
- 設定ファイルの事前分析
- 段階的な統合
- ビルドテストの自動化

---

## 📈 成功指標（KPI）

### 定量的指標

| 指標 | 現在 | 目標 | 測定方法 |
|------|------|------|---------|
| **型定義の重複** | 3箇所 | 1箇所 | ファイル数カウント |
| **コンポーネント分類** | 曖昧 | 明確 | 構造分析 |
| **フックの分散** | 2箇所 | 1箇所 | ファイル数カウント |
| **テスト配置** | 不統一 | 統一 | 構造分析 |
| **設定重複** | 高 | 低 | 設定ファイル分析 |

### 定性的指標

- [ ] コードの可読性向上
- [ ] 開発効率の向上
- [ ] メンテナンス性の向上
- [ ] 新機能開発の速度向上
- [ ] オンボーディング時間の短縮

---

## 📚 参考資料

### モノレポ設計パターン
- [Nx Monorepo](https://nx.dev/)
- [Lerna](https://lerna.js.org/)
- [Turborepo](https://turbo.build/)

### TypeScript型定義
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [TypeScript Best Practices](https://typescript-eslint.io/rules/)

### React コンポーネント設計
- [React Component Patterns](https://reactpatterns.com/)
- [Atomic Design](https://bradfrost.com/blog/post/atomic-web-design/)

### テスト設計
- [Testing Library](https://testing-library.com/)
- [Playwright](https://playwright.dev/)
- [Vitest](https://vitest.dev/)

---

## 🎯 まとめ

### リファクタリングの価値

1. **可読性**: コードの構造が明確になり、理解しやすくなる
2. **保守性**: 責任分離により、変更の影響範囲が明確になる
3. **開発効率**: ファイルの配置が統一され、開発速度が向上する
4. **スケーラビリティ**: 新しい機能・アプリの追加が容易になる
5. **品質**: 構造の統一により、バグの発生を抑制できる

### 次のステップ

1. ✅ この計画書を確認・承認
2. 🚀 Phase 1の型定義統合から開始
3. 📝 進捗を定期的に記録
4. 🔄 各Phase完了後に動作確認

---

**作成日**: 2025年1月15日  
**最終更新**: 2025年1月15日  
**バージョン**: 1.0.0  
**ステータス**: 📋 計画完了 - 実装準備完了！
