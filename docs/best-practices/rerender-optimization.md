# Re-render / Rendering / Client-Side 最適化 — 詳細と修正例

> ルール: `rerender-derived-state-no-effect`, `rerender-memo-with-default-value`, `rerender-simple-expression-in-memo`, `rerender-transitions`, `client-swr-dedup`, `rendering-conditional-render`, `rendering-usetransition-loading`
> 評価: **B** / **A-** / **B+**

---

## 1. useEffectでの不要な派生state

### 1a. GoalsClient — useEffectでの初期state設定

**ファイル:** `apps/web/app/(authenticated)/goals/_client/GoalsClient.tsx`

```ts
// 問題: useEffectで初期stateを設定（余分なレンダリングが発生）
useEffect(() => {
  if (initialGoals.length > 0 && !selectedGoalId) {
    setSelectedGoalId(initialGoals[0].id)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

#### 修正例

```ts
// useStateの初期値として直接計算
const [selectedGoalId, setSelectedGoalId] = useState<string | null>(
  initialGoals.length > 0 ? initialGoals[0].id : null
)
```

### 1b. DashboardClient / CompetitionClient — propsをZustandに同期

**ファイル:** `apps/web/app/(authenticated)/dashboard/_client/DashboardClient.tsx`

```ts
// 問題: useEffectでpropsをstoreに同期 → 余分なレンダリング
React.useEffect(() => {
  setAvailableTags(tags)
  setCompetitionStyles(styles)
}, [tags, styles, setAvailableTags, setCompetitionStyles])
```

**ファイル:** `apps/web/app/(authenticated)/competition/_client/CompetitionClient.tsx`

```ts
React.useEffect(() => {
  setStyles(styles)
}, [styles, setStyles])
```

#### 改善案

1. **Zustandストアの初期化関数を使う**:

```ts
// ストアに初期化メソッドを追加
const useCommonFormStore = create<CommonFormState>((set) => ({
  // ...
  initialize: (tags, styles) => set({ availableTags: tags, competitionStyles: styles }),
}))

// コンポーネントでrefベースの1回限り初期化
const initialized = useRef(false)
if (!initialized.current) {
  initialize(tags, styles)
  initialized.current = true
}
```

2. **propsを直接使う**: ストアへの同期自体が不要なら、propsをそのまま子コンポーネントに渡す。

### 1c. MilestoneParamsForm — フォーム値のuseEffect同期

**ファイル:** `apps/web/app/(authenticated)/goals/_components/forms/MilestoneParamsForm.tsx`

```ts
useEffect(() => {
  if (params.target_time > 0) {
    setTimeDisplayValue(formatTimeBest(params.target_time))
    setTimeError('')
  } else {
    setTimeDisplayValue('')
  }
}, [params.target_time])
```

#### 評価

controlled componentパターンとして許容範囲だが、レンダリング中に派生値を計算する方が理想的:

```ts
const timeDisplayValue = params.target_time > 0
  ? formatTimeBest(params.target_time)
  : ''
```

ただし、ユーザーが入力中の「編集中状態」を保持する必要がある場合はuseEffectでの同期が必要。

---

## 2. 不要な`useMemo`

### 2a. `startOfDay(new Date())` のメモ化

**ファイル:** `apps/web/app/(authenticated)/competition/_client/CompetitionClient.tsx`
**ファイル:** `apps/web/app/(authenticated)/practice/_client/PracticeClient.tsx`

```ts
const today = useMemo(() => startOfDay(new Date()), [])
```

#### 問題

- `startOfDay(new Date())`は軽量な計算でメモ化不要
- 空の依存配列`[]`のため、コンポーネントが日付を跨いでマウントされ続けるとstaleになる

#### 修正例

```ts
// メモ化せず直接計算
const today = startOfDay(new Date())
```

### 2b. ランディングページのscale計算

**ファイル:** `apps/web/app/page.tsx`

```ts
const mobileScale = useMemo(() => {
  if (windowWidth === 0) return 0.80
  if (windowWidth >= 1920) return 0.80
  if (windowWidth <= 768) return 0.40
  const ratio = (windowWidth - 768) / (1920 - 768)
  return 0.40 + (ratio * 0.40)
}, [windowWidth])
```

#### 評価

単純な算術演算（比較とdivision）。`useMemo`のオーバーヘッド（値の保存、依存配列の比較）が計算コスト自体と同程度。削除して問題ない。

---

## 3. 非プリミティブなデフォルト値

### CalendarProvider

**ファイル:** `apps/web/app/(authenticated)/dashboard/_providers/CalendarProvider.tsx`

```ts
export function CalendarProvider({
  children,
  initialCalendarItems = [],        // 毎レンダリングで新しい配列参照
  initialMonthlySummary = { practiceCount: 0, recordCount: 0 },  // 同上
})
```

#### 問題

`= []`はレンダリングのたびに新しい配列を生成。これがuseEffectの依存配列に使われると無限ループの原因になりうる。

#### 修正例

```ts
const EMPTY_ITEMS: CalendarItem[] = []
const DEFAULT_SUMMARY: MonthlySummary = { practiceCount: 0, recordCount: 0 }

export function CalendarProvider({
  children,
  initialCalendarItems = EMPTY_ITEMS,
  initialMonthlySummary = DEFAULT_SUMMARY,
})
```

### 同様のパターンがある他のファイル

- `components/forms/EntryLogForm.tsx` — `styles = []`, `initialEntries = []`
- `components/forms/record-log/RecordLogForm.tsx` — `styles = []`, `entryDataList = []`
- `components/profile/ProfileDisplay.tsx` — `teams = []`
- `components/ui/FormStepper.tsx` — `skippedSteps = []`

---

## 4. `useTransition`未使用

### 現状

プロジェクト全体で`useTransition`が一切使われていない。全てのローディング状態は手動の`useState`:

```ts
const [loading, setLoading] = useState(false)
const [isLoading, setIsLoading] = useState(false)
const [syncing, setSyncing] = useState(false)
```

20箇所以上でこのパターンが存在。

### 適用候補

#### 4a. フィルター変更時のUI応答性

**ファイル:** `apps/web/app/(authenticated)/practice/_client/PracticeClient.tsx`

タグ選択やフィルター変更でリスト全体が再フィルタリング/ソートされる。`useTransition`で非緊急更新としてマークすることでUIの応答性が向上:

```ts
const [isPending, startTransition] = useTransition()

const handleFilterChange = (newFilter: string) => {
  startTransition(() => {
    setFilterStyle(newFilter)
  })
}

// isPendingでローディングインジケータを表示
{isPending && <div className="opacity-50">...</div>}
```

#### 4b. React Query `isPending`との重複

`PracticeClient.tsx`等では手動の`isLoading`とReact Queryの`isPending`が重複:

```ts
if (loading || isLoading || createPracticeMutation.isPending || updatePracticeMutation.isPending || ...)
```

React Queryのmutation stateを使えば手動のloading stateは不要:

```ts
const isAnyMutating = createPracticeMutation.isPending
  || updatePracticeMutation.isPending
  || deletePracticeMutation.isPending
```

---

## 5. Client-Sideデータ取得

### 5a. React Queryをバイパスしたrawクエリ

以下のファイルでReact Queryを使わず直接Supabaseを呼んでいる:

| ファイル | 内容 |
|---------|------|
| `MyPageClient.tsx` | `coreApi.getMyTeams()` — コメントに「useTeamsQueryが空配列を返す問題の回避」とあり |
| `GoogleCalendarSyncSettings.tsx` | 設定更新の`supabase.from().update()` |
| `TeamsClient.tsx` | `supabase.rpc('get_invite_code_by_team_id')` |
| `PracticeClient.tsx` | `supabase.rpc('replace_practice_log_tags')` |
| `AvatarUpload.tsx` | `fetch('/api/storage/profile')` |

#### 評価

- `MyPageClient.tsx`の回避策は根本原因（`useTeamsQuery`のバグ）を修正すべき
- 設定更新やRPCは`useMutation`でラップすることで、pending/error状態の自動管理とリトライが得られる

### 5b. `useLocalStorage`のバージョニング未対応

**ファイル:** `apps/web/hooks/useLocalStorage.ts`

```ts
export function useLocalStorage<T>(key: string, initialValue: T) {
  const getInitialValue = (): T => {
    const item = window.localStorage.getItem(key)
    return item ? JSON.parse(item) : initialValue
  }
  // ...
}
```

#### 問題

- バージョンキーやスキーママイグレーション機構がない
- デプロイでデータ構造が変わると、古いデータがそのままparseされエラーの原因に

#### 改善案

```ts
export function useLocalStorage<T>(key: string, initialValue: T, version = 1) {
  const versionedKey = `${key}_v${version}`
  const getInitialValue = (): T => {
    const item = window.localStorage.getItem(versionedKey)
    if (item) {
      try {
        return JSON.parse(item)
      } catch {
        window.localStorage.removeItem(versionedKey)
      }
    }
    return initialValue
  }
  // ...
}
```

---

## 6. `&&`条件レンダリング — 問題なし

プロジェクト全体で、数値をそのまま`&&`の左辺に使うパターンは見られない。全て`> 0`や真偽値で比較:

```ts
{entries.length > 0 && (<span>...)}  // OK: > 0 はbooleanを返す
{isLoading && <LoadingSpinner />}     // OK: boolean
```

---

## 7. チェックリスト

- [x] `GoalsClient`のuseEffectをuseState初期値に変更
- [x] `DashboardClient`/`CompetitionClient`/`PracticeClient`のuseEffectによるstore同期を改善（refベース初期化に変更）
- [x] `CompetitionClient`/`PracticeClient`の`useMemo(() => startOfDay(...), [])`を削除
- [x] `page.tsx`のscale計算の不要な`useMemo`を削除（IIFE化）
- [x] `CalendarProvider`等の非プリミティブデフォルト値を定数に抽出（`EntryLogForm`, `RecordLogForm`, `ProfileDisplay`, `FormStepper`含む）
- [x] フィルター変更処理に`useTransition`を導入（`CompetitionClient`, `PracticeClient`のページリセットuseEffectも除去）
- [x] 手動loading stateとReact Query `isPending`の重複を解消（`CompetitionClient`で`isAnyMutating`に統合、`PracticeClient`も同様）
- [x] `MyPageClient`の`useTeamsQuery`バグを修正し、rawクエリの回避策を削除（`useTeamsQuery`に統一）
- [x] `useLocalStorage`にバージョニングを追加（旧キーからのマイグレーション対応）
