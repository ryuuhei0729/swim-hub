# Server-Side性能 — 詳細と修正例

> ルール: `server-cache-react`, `server-auth-actions`, `server-dedup-props`, `server-serialization`, `server-parallel-fetching`, `server-after-nonblocking`
> 評価: **C** — `React.cache()`と`after()`の活用が大幅に不足

---

## 1. `React.cache()`未使用

### 現状

プロジェクト全体で`React.cache()`は**1箇所のみ**:

```ts
// lib/supabase-auth/auth.ts
export const cachedValidateAuthWithRedirect = cache(validateAuthWithRedirect)
```

### 問題: `getServerUser()`が毎回ネットワークリクエスト

**ファイル:** `apps/web/lib/supabase-server-auth.ts`

`getServerUser()`は複数のServer Componentから呼ばれる（DashboardDataLoader, CompetitionDataLoader, TeamAnnouncementsSection等）。各呼び出しで:

1. `createAuthenticatedServerClient()`で新しいSupabaseクライアントを生成
2. `supabase.auth.getUser()`でSupabase Authにネットワークリクエスト

同一リクエスト内で複数回呼ばれると、同じユーザー情報を何度も取得してしまう。

### 修正例

```ts
// lib/supabase-server-auth.ts
import { cache } from 'react'

// 元の関数
async function _getServerUser() {
  const supabase = await createAuthenticatedServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    redirect('/login')
  }
  return user
}

// React.cache()でラップ — 同一リクエスト内で自動デデュプリケーション
export const getServerUser = cache(_getServerUser)
```

### 問題: `createAuthenticatedServerClient()`の重複生成

同様に、`createAuthenticatedServerClient()`も複数箇所で呼ばれるが、毎回新しいクライアントインスタンスを生成する。

```ts
// 修正例
import { cache } from 'react'

export const createAuthenticatedServerClient = cache(async () => {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { /* ... */ } }
  )
})
```

### 問題: `getCachedStyles()`が名前に反してキャッシュなし

**ファイル:** `apps/web/lib/data-loaders/common.ts`

```ts
// 現状: "Cached"と命名されているが実際のキャッシュなし
export async function getCachedStyles(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('styles')
    .select('*')
    .order('distance', { ascending: true })
  // ...
}
```

#### 修正例

```ts
import { cache } from 'react'

// React.cache()で同一リクエスト内のデデュプリケーション
export const getCachedStyles = cache(async () => {
  const supabase = await createAuthenticatedServerClient()
  const { data, error } = await supabase
    .from('styles')
    .select('*')
    .order('distance', { ascending: true })
  // ...
  return data
})
```

> stylesは全ユーザー共通のマスターデータなので、LRUキャッシュ(`server-cache-lru`)の候補でもある。

---

## 2. Server Actionsの認証

### 現状

**ファイル:** `apps/web/app/(authenticated)/teams/_actions/actions.ts`

Server Actionsは`createAuthenticatedServerClient()`でセッション付きSupabaseクライアントを使用し、SupabaseのRow Level Security (RLS)に認可を委任している。

```ts
export async function reactivateTeamMembership(membershipId: string, joinedAt: string) {
  const supabase = await createAuthenticatedServerClient()
  const api = new TeamMembersAPI(supabase)
  const membership = await api.reactivateMembership(membershipId, joinedAt)
  // ...
}
```

### 評価

RLSへの委任は有効だが、ベストプラクティスとしてはServer Action内で明示的に認証チェックを行うべき（defense-in-depth）:

```ts
export async function reactivateTeamMembership(membershipId: string, joinedAt: string) {
  const supabase = await createAuthenticatedServerClient()

  // 明示的な認証チェック（defense-in-depth）
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const api = new TeamMembersAPI(supabase)
  const membership = await api.reactivateMembership(membershipId, joinedAt)
  // ...
}
```

---

## 3. `after()`未使用

### 現状

`next/server`の`after()`はプロジェクト内で一切使われていない。

### 適用候補

#### 3a. Server Actionsの`revalidatePath()`

```ts
// 現状: revalidatePath()がレスポンス前に実行される
export async function reactivateTeamMembership(membershipId: string, joinedAt: string) {
  // ...
  revalidatePath('/teams')
  return membership
}
```

```ts
// 修正例: after()でレスポンス後に実行
import { after } from 'next/server'

export async function reactivateTeamMembership(membershipId: string, joinedAt: string) {
  // ...
  after(() => {
    revalidatePath('/teams')
  })
  return membership
}
```

#### 3b. APIルートのログ・分析処理

Google Calendar連携のAPIルート等で、レスポンス後にログ記録やキャッシュ更新を行う場合に有効。

---

## 4. シリアライゼーションの最適化

### 問題: CompetitionDataLoaderの二重データ転送

**ファイル:** `apps/web/app/(authenticated)/competition/_server/CompetitionDataLoader.tsx`

```tsx
<CompetitionClient
  initialRecords={recordsResult}  // 大量のRecordWithDetails[]をシリアライズ
  styles={stylesResult}
/>
```

`CompetitionClient`は`initialRecords`を受け取った後、React Queryの`useRecordsQuery`で同じデータを再取得する設計。初期レンダリング用のpropsとReact Queryのキャッシュの両方にデータが存在する。

### 改善案

React QueryのHydration APIを使い、サーバーでprefetchしたデータをクライアントのキャッシュに直接注入:

```tsx
// Server Component
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'

export default async function CompetitionDataLoader() {
  const queryClient = new QueryClient()

  await queryClient.prefetchQuery({
    queryKey: recordKeys.lists(),
    queryFn: () => fetchRecords(),
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CompetitionClient styles={stylesResult} />
    </HydrationBoundary>
  )
}
```

これにより`initialRecords` propが不要になり、シリアライゼーションが1回で済む。

---

## 5. チェックリスト

- [x] `getServerUser()`を`React.cache()`でラップ
- [x] `createAuthenticatedServerClient()`を`React.cache()`でラップ
- [x] `getStyles()`に`React.cache()`を実装
- [x] Server Actionsに明示的な認証チェックを追加（defense-in-depth）
- [x] `revalidatePath()`を`after()`でラップ
- [x] CompetitionDataLoaderでReact Query Hydrationパターンを適用
- [x] stylesマスターデータのインメモリキャッシュを実装（TTL: 1時間）
