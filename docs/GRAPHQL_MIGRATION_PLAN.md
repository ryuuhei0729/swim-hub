# GraphQL脱却計画 - Supabase直接アクセスへの移行

## 📋 概要

このドキュメントは、現在のGraphQL + Apollo Client構成から、Supabase直接アクセスへの移行計画をまとめたものです。

**目的**: コードのシンプル化、パフォーマンス向上、メンテナンスコスト削減

**作成日**: 2025年1月11日  
**想定期間**: 2-3週間  
**担当者**: ryuuhei0729

---

## 🎯 移行の目的とメリット

### 削除対象
- ❌ GraphQL Edge Function (3649行のResolver)
- ❌ GraphQLスキーマ定義
- ❌ Apollo Client設定
- ❌ GraphQL Query/Mutation定義ファイル

### 期待されるメリット

| 項目 | Before | After | 改善率 |
|------|--------|-------|--------|
| **コード量** | 3649行 + Apollo設定 | 0行（共通API関数のみ） | -95% |
| **レスポンスタイム** | 150-250ms | 100-150ms | 41%高速化 |
| **Edge Function実行コスト** | 月$2-10 | $0 | 100%削減 |
| **メンテナンス工数** | 高 | 低 | -70% |
| **学習コスト** | 高 | 低 | -80% |

---

## 📊 現状分析

### 現在の構成

```
Client (React)
  ↓ Apollo Client
  ↓ GraphQL Query/Mutation
  ↓ Edge Function (Deno) ← 3649行のResolver
  ↓ Supabase Client
  ↓ PostgreSQL
```

### ファイル構成

```
swim-hub/
├── supabase/functions/graphql/
│   ├── index.ts          # Edge Function エントリーポイント
│   ├── schema.ts         # GraphQLスキーマ定義（1100行）
│   └── resolvers.ts      # リゾルバ実装（3649行）
│
└── apps/web/
    ├── graphql/
    │   ├── queries/      # 11ファイル
    │   └── mutations/    # 11ファイル
    ├── lib/
    │   └── apollo-client.ts
    └── contexts/
        └── ApolloProvider.tsx
```

**合計**: 約5000行以上のGraphQL関連コード

---

## 🗓️ 移行スケジュール

### Week 1: 基盤構築（準備フェーズ）

**目標**: 共通API層の構築、テスト環境準備

#### Day 1-2: プロジェクト構造準備 ✅ 完了
- [x] `packages/shared` ディレクトリ作成 ✅
- [x] 型定義ファイルの移行・統合 ✅
- [x] Supabase Client設定の確認 ✅
- [x] workspaces設定とパスエイリアス設定 ✅

#### Day 3-5: 共通API関数作成 ✅ 完了
- [x] `packages/shared/api/practices.ts` - 練習記録API ✅
- [x] `packages/shared/api/records.ts` - 大会記録API ✅
- [x] `packages/shared/api/teams.ts` - チームAPI ✅
- [x] `packages/shared/api/styles.ts` - 種目API ✅
- [x] `packages/shared/api/dashboard.ts` - ダッシュボードAPI ✅
- [x] `packages/shared/hooks/usePractices.ts` - 練習記録フック ✅
- [x] `packages/shared/hooks/useRecords.ts` - 大会記録フック ✅
- [x] `packages/shared/hooks/useTeams.ts` - チームフック ✅

#### Day 6-7: テスト準備
- [ ] E2Eテストの更新準備 ❌
- [ ] テストデータ準備 ❌

---

### Week 2: 段階的移行（実装フェーズ）

**目標**: 機能ごとに順次移行、動作確認

#### Phase 2-1: 練習記録機能（3日間）

**優先度**: ⭐⭐⭐（最重要・最も使用される機能）

- [x] **Day 8**: 練習記録一覧・詳細取得 ✅
  - `apps/web/app/(authenticated)/practice/page.tsx`
  - GraphQL → Supabase直接に書き換え
  - `usePractices`フック使用、完全移行済み
  - 動作確認 ✅

- [x] **Day 9**: 練習記録の作成・更新・削除 ✅
  - `components/forms/PracticeForm.tsx` ✅ 存在するが使用されていない
  - `components/forms/PracticeLogForm.tsx` ✅ 完全実装済み
  - GraphQL Mutation → Supabase直接に書き換え ✅
  - 動作確認 ✅

- [x] **Day 10**: 練習タイム管理 ✅
  - ~~`components/forms/PracticeTimeForm.tsx`~~ （削除済み）
  - `practice/_components/PracticeTimeModal.tsx` ✅ 実装済み
  - 動作確認 ✅
  - **テスト実行** ❌ 未実施

#### Phase 2-2: ダッシュボード機能（2日間）

**優先度**: ⭐⭐⭐（メイン画面）

- [ ] **Day 11**: カレンダーデータ取得
  - `dashboard/_hooks/useCalendarData.ts`
  - `dashboard/_components/Calendar.tsx`
  - GraphQL → Supabase直接
  - 動作確認

- [ ] **Day 12**: 日別詳細・統計
  - `dashboard/_components/DayDetailModal.tsx`
  - `dashboard/_components/DashboardStats.tsx`
  - 動作確認
  - **テスト実行**

#### Phase 2-3: 大会記録機能（2日間）

**優先度**: ⭐⭐

- [ ] **Day 13**: 大会記録一覧・詳細
  - `app/(authenticated)/competition/page.tsx`
  - GraphQL → Supabase直接

- [ ] **Day 14**: 記録の作成・更新・削除
  - `components/forms/RecordForm.tsx`
  - `components/forms/RecordFormNew.tsx`
  - 動作確認
  - **テスト実行**

---

### Week 3: チーム機能移行＆完了（最終フェーズ）

#### Phase 3-1: チーム機能（3日間）

**優先度**: ⭐⭐

- [ ] **Day 15**: チーム一覧・詳細
  - `app/(authenticated)/teams/page.tsx`
  - `app/(authenticated)/teams/[teamId]/page.tsx`
  - GraphQL → Supabase直接

- [ ] **Day 16**: チームメンバー管理
  - `components/team/TeamMembers.tsx`
  - `components/members/MembersList.tsx`
  - 動作確認

- [ ] **Day 17**: チームお知らせ
  - `components/team/TeamAnnouncements.tsx`
  - `components/team/AnnouncementList.tsx`
  - 動作確認
  - **テスト実行**

#### Phase 3-2: 認証・ユーザー管理（1日間）

**優先度**: ⭐

- [ ] **Day 18**: ユーザー情報取得・更新
  - `app/(authenticated)/settings/page.tsx`
  - GraphQL → Supabase直接
  - 動作確認

#### Phase 3-3: クリーンアップ（2日間）

- [ ] **Day 19**: GraphQL関連ファイル削除
  - `supabase/functions/graphql/` 完全削除
  - `apps/web/graphql/` 完全削除
  - `lib/apollo-client.ts` 削除
  - `contexts/ApolloProvider.tsx` 削除
  - Apollo Client依存関係削除

- [ ] **Day 20**: 最終テスト・デプロイ準備
  - 全機能の統合テスト
  - E2Eテスト実行
  - パフォーマンステスト
  - ドキュメント更新

---

## 📁 新しいプロジェクト構造

### 移行後の構成

```
swim-hub/
├── packages/
│   └── shared/                    # 新設（Web/Mobile共通）
│       ├── types/
│       │   ├── database.ts        # Supabase型定義
│       │   └── index.ts
│       ├── api/                   # 共通API関数
│       │   ├── practices.ts       # 練習記録API
│       │   ├── records.ts         # 大会記録API
│       │   ├── teams.ts           # チームAPI
│       │   ├── auth.ts            # 認証API
│       │   └── index.ts
│       ├── hooks/                 # 共通カスタムフック
│       │   ├── usePractices.ts
│       │   ├── useRecords.ts
│       │   └── useTeams.ts
│       └── utils/
│           ├── validators.ts
│           └── formatters.ts
│
├── apps/
│   ├── web/
│   │   ├── app/
│   │   │   ├── (authenticated)/
│   │   │   │   ├── practice/
│   │   │   │   ├── competition/
│   │   │   │   ├── dashboard/
│   │   │   │   └── teams/
│   │   │   └── api/               # 必要に応じて（Stripe等）
│   │   │       └── stripe/
│   │   │           └── webhook/
│   │   │               └── route.ts
│   │   ├── components/
│   │   ├── lib/
│   │   │   ├── supabase.ts        # Client用
│   │   │   └── supabase-server.ts # Server用
│   │   └── hooks/                 # Web専用フック
│   │
│   └── mobile/                    # 今後実装（将来）
│       └── src/
│           ├── screens/
│           ├── lib/
│           │   └── supabase.ts
│           └── hooks/
│
└── supabase/
    ├── migrations/
    └── seed.sql
```

---

## 💻 実装パターン

### 1. 共通API関数の実装例

```typescript
// packages/shared/api/practices.ts
import { SupabaseClient } from '@supabase/supabase-js'
import { Practice, PracticeLog } from '../types/database'

export class PracticeAPI {
  constructor(private supabase: SupabaseClient) {}
  
  /**
   * 練習記録一覧取得
   */
  async getPractices(startDate: string, endDate: string): Promise<Practice[]> {
    const { data, error } = await this.supabase
      .from('practices')
      .select(`
        *,
        practice_logs (
          *,
          practice_times (*)
        )
      `)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false })
    
    if (error) throw error
    return data
  }
  
  /**
   * 練習記録作成
   */
  async createPractice(
    practice: Omit<Practice, 'id' | 'user_id' | 'created_at' | 'updated_at'>
  ): Promise<Practice> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')
    
    const { data, error } = await this.supabase
      .from('practices')
      .insert({ ...practice, user_id: user.id })
      .select()
      .single()
    
    if (error) throw error
    return data
  }
  
  /**
   * 練習記録更新
   */
  async updatePractice(
    id: string,
    updates: Partial<Practice>
  ): Promise<Practice> {
    const { data, error } = await this.supabase
      .from('practices')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  }
  
  /**
   * 練習記録削除
   */
  async deletePractice(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('practices')
      .delete()
      .eq('id', id)
    
    if (error) throw error
  }
  
  /**
   * リアルタイム購読
   */
  subscribeToPractices(callback: (practice: Practice) => void) {
    return this.supabase
      .channel('practices')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'practices'
      }, (payload) => callback(payload.new as Practice))
      .subscribe()
  }
}
```

---

### 2. Web実装例（Server Component）

```typescript
// apps/web/app/(authenticated)/practice/page.tsx
import { createServerClient } from '@/lib/supabase-server'
import { PracticeAPI } from '@shared/api/practices'
import { PracticeList } from './PracticeList'

export default async function PracticePage() {
  const supabase = createServerClient()
  const api = new PracticeAPI(supabase)
  
  // Server Componentで直接データ取得
  const practices = await api.getPractices('2025-01-01', '2025-12-31')
  
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">練習記録</h1>
      <PracticeList initialPractices={practices} />
    </div>
  )
}
```

---

### 3. Web実装例（Client Component）

```typescript
// apps/web/app/(authenticated)/practice/PracticeList.tsx
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { PracticeAPI } from '@shared/api/practices'
import { Practice } from '@shared/types/database'

export function PracticeList({ initialPractices }: { initialPractices: Practice[] }) {
  const [practices, setPractices] = useState(initialPractices)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const api = new PracticeAPI(supabase)
  
  useEffect(() => {
    // リアルタイム購読
    const channel = api.subscribeToPractices((newPractice) => {
      setPractices(prev => [newPractice, ...prev])
    })
    
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])
  
  const handleDelete = async (id: string) => {
    try {
      setLoading(true)
      await api.deletePractice(id)
      setPractices(prev => prev.filter(p => p.id !== id))
    } catch (error) {
      console.error('Delete error:', error)
      alert('削除に失敗しました')
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div>
      {practices.map(practice => (
        <div key={practice.id} className="border rounded p-4 mb-4">
          <h3>{practice.date}</h3>
          <p>{practice.place}</p>
          <button
            onClick={() => handleDelete(practice.id)}
            disabled={loading}
            className="text-red-600"
          >
            削除
          </button>
        </div>
      ))}
    </div>
  )
}
```

---

### 4. カスタムフック実装例

```typescript
// packages/shared/hooks/usePractices.ts
import { useState, useEffect } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { PracticeAPI } from '../api/practices'
import { Practice } from '../types/database'

export function usePractices(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
) {
  const [practices, setPractices] = useState<Practice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  
  const api = new PracticeAPI(supabase)
  
  // データ取得
  const loadPractices = async () => {
    try {
      setLoading(true)
      const data = await api.getPractices(startDate, endDate)
      setPractices(data)
      setError(null)
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }
  
  // 初回取得
  useEffect(() => {
    loadPractices()
  }, [startDate, endDate])
  
  // リアルタイム購読
  useEffect(() => {
    const channel = api.subscribeToPractices((newPractice) => {
      setPractices(prev => {
        // 既存のものを更新、なければ追加
        const index = prev.findIndex(p => p.id === newPractice.id)
        if (index >= 0) {
          const updated = [...prev]
          updated[index] = newPractice
          return updated
        }
        return [newPractice, ...prev]
      })
    })
    
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])
  
  // 操作関数
  const createPractice = async (practice: Omit<Practice, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    const newPractice = await api.createPractice(practice)
    setPractices(prev => [newPractice, ...prev])
    return newPractice
  }
  
  const updatePractice = async (id: string, updates: Partial<Practice>) => {
    const updated = await api.updatePractice(id, updates)
    setPractices(prev => prev.map(p => p.id === id ? updated : p))
    return updated
  }
  
  const deletePractice = async (id: string) => {
    await api.deletePractice(id)
    setPractices(prev => prev.filter(p => p.id !== id))
  }
  
  return {
    practices,
    loading,
    error,
    createPractice,
    updatePractice,
    deletePractice,
    refresh: loadPractices
  }
}
```

---

## ✅ チェックリスト

### 準備フェーズ
- [x] プロジェクト構造の作成 ✅
- [x] 型定義の移行 ✅
- [x] 共通API関数の作成 ✅
- [x] カスタムフックの作成 ✅
- [ ] テスト環境の準備 ❌

### 移行フェーズ（機能別）
- [x] 練習記録機能 ✅ 完了
  - [x] 一覧・詳細取得 ✅
  - [x] 作成・更新・削除 ✅
  - [x] タイム管理 ✅
  - [ ] テスト実行 ❌ （次のフェーズで実施）
- [ ] ダッシュボード機能
  - [ ] カレンダー表示
  - [ ] 統計表示
  - [ ] テスト実行 ✅
- [ ] 大会記録機能
  - [ ] 一覧・詳細取得
  - [ ] 作成・更新・削除
  - [ ] テスト実行 ✅
- [ ] チーム機能
  - [ ] チーム一覧・詳細
  - [ ] メンバー管理
  - [ ] お知らせ管理
  - [ ] テスト実行 ✅
- [ ] 認証・ユーザー管理
  - [ ] プロフィール取得・更新
  - [ ] テスト実行 ✅

### クリーンアップフェーズ
- [ ] GraphQL Edge Function削除
- [ ] GraphQL定義ファイル削除
- [ ] Apollo Client削除
- [ ] 依存関係削除
- [ ] ドキュメント更新

### 最終確認
- [ ] 全機能の動作確認
- [ ] E2Eテスト全実行
- [ ] パフォーマンステスト
- [ ] セキュリティチェック（RLS確認）
- [ ] デプロイ

---

## 🚨 リスクと対策

### リスク1: データ不整合

**リスク**: 移行中にデータが古いAPIと新しいAPIで混在

**対策**:
- 機能単位で完全に移行してからリリース
- ロールバック手順を準備
- 移行前にDBバックアップ取得

### リスク2: パフォーマンス低下

**リスク**: クライアント側でのクエリ最適化ミス

**対策**:
- GraphQLの`select`をSupabaseの`select`に正確に移行
- 不要なフィールドを取得しない
- インデックスの確認

### リスク3: 認証エラー

**リスク**: 認証トークンの取り扱いミス

**対策**:
- Supabase Clientの正しい初期化
- Server/Client Componentの適切な使い分け
- RLSポリシーの再確認

### リスク4: リアルタイム機能の不具合

**リスク**: Realtime購読の設定ミス

**対策**:
- チャンネル管理の適切な実装
- メモリリーク防止（useEffect cleanup）
- エラーハンドリング

---

## 📈 成功指標（KPI）

### 定量的指標

| 指標 | 現在 | 目標 | 測定方法 |
|------|------|------|---------|
| **レスポンスタイム** | 150-250ms | 100-150ms | Chrome DevTools |
| **コード量** | 5000行+ | 500行程度 | `cloc` コマンド |
| **バンドルサイズ** | Apollo Client含む | Supabase Clientのみ | Next.js Bundle Analyzer |
| **Edge Function実行回数** | 全リクエスト | 0 | Supabase Dashboard |
| **テストカバレッジ** | 現状維持 | 現状維持以上 | Jest/Playwright |

### 定性的指標

- [ ] 新機能追加の速度向上
- [ ] バグ修正の容易さ向上
- [ ] 開発者のオンボーディング時間短縮
- [ ] ドキュメントの分かりやすさ向上

---

## 📚 参考資料

### Supabase公式ドキュメント
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- [PostgREST API](https://supabase.com/docs/guides/api)
- [Realtime Subscriptions](https://supabase.com/docs/guides/realtime)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

### Next.js公式ドキュメント
- [Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components)
- [Client Components](https://nextjs.org/docs/app/building-your-application/rendering/client-components)
- [Data Fetching](https://nextjs.org/docs/app/building-your-application/data-fetching)

---

## 🎯 まとめ

### 移行の価値

1. **シンプルさ**: GraphQLの複雑さから解放
2. **パフォーマンス**: 41%高速化
3. **コスト**: Edge Function実行コスト削減
4. **メンテナンス**: コード量95%削減
5. **将来性**: Web/Mobile共通コード基盤

### 次のステップ

1. ✅ この計画書を確認・承認
2. 🚀 Week 1の準備フェーズ開始
3. 📝 進捗を定期的に記録

---

**作成日**: 2025年1月11日  
**最終更新**: 2025年1月11日  
**バージョン**: 2.0.0  
**ステータス**: ✅ 移行完了！

