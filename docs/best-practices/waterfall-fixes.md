# Waterfall排除 — 詳細と修正例

> ルール: `async-parallel`, `async-defer-await`, `async-suspense-boundaries`
> 評価: **B** — `Promise.all`は広く使われているが、7箇所の未対応あり

## 現状の良い点

- **40箇所以上**で`Promise.all`を使った並列化が実装済み
- 全認証済みページに`Suspense`境界あり（LoadingFallback付き）
- ほとんどのDataLoaderが正しいパターンに従っている:

```ts
// 既存の良いパターン例（DashboardDataLoader等）
const [user, supabase] = await Promise.all([
  getServerUser(),
  createAuthenticatedServerClient()
])
```

---

## Finding 1 (HIGH): MetadataLoader — 逐次await

**ファイル:** `apps/web/app/(authenticated)/dashboard/_server/MetadataLoader.tsx`

### 問題コード

```ts
export default async function MetadataLoader({ children }: MetadataLoaderProps) {
  const user = await getServerUser()                        // 逐次
  const supabase = await createAuthenticatedServerClient()  // 逐次
  // ...
}
```

### 修正例

```ts
export default async function MetadataLoader({ children }: MetadataLoaderProps) {
  const [user, supabase] = await Promise.all([
    getServerUser(),
    createAuthenticatedServerClient()
  ])
  // ...
}
```

> 他の全てのDataLoaderは既にこのパターンに従っているため、単純な統一修正。

---

## Finding 2 (HIGH): TeamAdminDataLoader — 逐次チームデータ取得

**ファイル:** `apps/web/app/(authenticated)/teams-admin/[teamId]/_server/TeamAdminDataLoader.tsx`

### 問題コード

```ts
async function getTeamAdminData(supabase, teamId, userId) {
  const coreAPI = new TeamCoreAPI(supabase)

  const teamData = await coreAPI.getTeam(teamId)  // 逐次

  const { data: membershipData } = await supabase  // 逐次（独立したクエリ）
    .from('team_memberships')
    .select('*')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .eq('role', 'admin')
    .eq('is_active', true)
    .single()
}
```

### 修正例

```ts
async function getTeamAdminData(supabase, teamId, userId) {
  const coreAPI = new TeamCoreAPI(supabase)

  const [teamData, { data: membershipData }] = await Promise.all([
    coreAPI.getTeam(teamId),
    supabase
      .from('team_memberships')
      .select('*')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .eq('role', 'admin')
      .eq('is_active', true)
      .single()
  ])
}
```

> `TeamDetailDataLoader.getTeamData`は既にこのパターンで実装済み。

---

## Finding 3 (HIGH): Google Calendar sync-all — N+1クエリ

**ファイル:** `apps/web/app/api/google-calendar/sync-all/route.ts`

### 問題コード

```ts
for (const practice of practices) {
  // N+1: 各練習ごとにチーム名を個別クエリ
  let teamName: string | null = null
  if (practice.team_id) {
    const { data: team } = await supabase
      .from('teams')
      .select('name')
      .eq('id', practice.team_id)
      .single()
    teamName = team?.name || null
  }

  // 逐次Google Calendar API呼び出し
  const response = await fetchGoogleCalendarWithTokenRefresh(...)

  if (response.ok) {
    const result = await response.json()
    await supabase.from('practices').update(...)  // 逐次DB更新
  }
}
```

### 修正例

```ts
// 1. チーム名を事前に一括取得
const teamIds = [...new Set(practices.filter(p => p.team_id).map(p => p.team_id))]
const { data: teams } = await supabase
  .from('teams')
  .select('id, name')
  .in('id', teamIds)

const teamNameMap = new Map(teams?.map(t => [t.id, t.name]) ?? [])

// 2. Google Calendar API呼び出しを並列化（レート制限を考慮してバッチ化）
const BATCH_SIZE = 5
for (let i = 0; i < practices.length; i += BATCH_SIZE) {
  const batch = practices.slice(i, i + BATCH_SIZE)
  const results = await Promise.allSettled(
    batch.map(async (practice) => {
      const teamName = practice.team_id ? teamNameMap.get(practice.team_id) ?? null : null
      const response = await fetchGoogleCalendarWithTokenRefresh(...)
      if (response.ok) {
        const result = await response.json()
        await supabase.from('practices').update(...)
      }
    })
  )
}
```

> 競技会（competitions）のループでも同様のN+1パターンがあるため、同様に修正が必要。

---

## Finding 4 (MEDIUM): Profile Image Upload — 逐次R2 listing

**ファイル:** `apps/web/app/api/storage/profile/route.ts`

### 問題コード

```ts
const newPrefixFiles = await listR2Objects(`profile-images/${user.id}/`)
const legacyPrefixFiles = await listR2Objects(`profiles/avatars/${user.id}/`)
```

### 修正例

```ts
const [newPrefixFiles, legacyPrefixFiles] = await Promise.all([
  listR2Objects(`profile-images/${user.id}/`),
  listR2Objects(`profiles/avatars/${user.id}/`)
])
```

> DELETEハンドラにも同じパターンあり。

---

## Finding 5 (MEDIUM): CompetitionDetails — 逐次Supabaseクエリ

**ファイル:** `apps/web/app/(authenticated)/dashboard/_components/DayDetailModal/components/CompetitionSection/CompetitionDetails.tsx`

### 問題コード

```ts
useEffect(() => {
  const loadRecords = async () => {
    // 画像パスクエリ
    const { data: competitionData } = await supabase
      .from('competitions')
      .select('image_paths')
      .eq('id', competitionId)
      .single()

    // レコードクエリ（上記とは独立）
    const { data } = await supabase
      .from('records')
      .select(`*, style:styles(*), competition:competitions(*), split_times(*)`)
      .eq('competition_id', competitionId)
  }
})
```

### 修正例

```ts
useEffect(() => {
  const loadRecords = async () => {
    const [{ data: competitionData }, { data }] = await Promise.all([
      supabase
        .from('competitions')
        .select('image_paths')
        .eq('id', competitionId)
        .single(),
      supabase
        .from('records')
        .select(`*, style:styles(*), competition:competitions(*), split_times(*)`)
        .eq('competition_id', competitionId)
    ])
  }
})
```

---

## Finding 6 (MEDIUM): DayDetailModal — 逐次ユーザー確認

**ファイル:** `apps/web/app/(authenticated)/dashboard/_components/DayDetailModal/DayDetailModal.tsx`

`getUser()`とcompetitionステータスチェックが逐次実行。competition statusの取得は`user.id`に依存しないため並列化可能。

---

## Finding 7 (MEDIUM): useDashboardHandlers — ループ内の逐次insert/delete

**ファイル:** `apps/web/app/(authenticated)/dashboard/_hooks/useDashboardHandlers.ts`

### 問題コード

```ts
// タグを1件ずつ逐次insert
for (const tag of menu.tags) {
  const { error } = await queryBuilder.insert(insertData)
}

// 時間を1件ずつ逐次delete
for (const time of existingTimes) {
  await deletePracticeTime(time.id)
}
```

### 修正例

```ts
// タグを並列insert
await Promise.all(
  menu.tags.map(tag => queryBuilder.insert(insertData))
)

// 時間を並列delete
await Promise.all(
  existingTimes.map(time => deletePracticeTime(time.id))
)
```
