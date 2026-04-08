# フェーズ4: パフォーマンス最適化 - 計画書

**作成日**: 2026-01-22
**ステータス**: ✅ 主要部分完了（Step 1-5）

---

## 📋 目次

1. [現状分析](#現状分析)
2. [最適化対象](#最適化対象)
3. [ステップ1: パフォーマンス計測ベースライン](#ステップ1-パフォーマンス計測ベースライン)
4. [ステップ2: データ取得の最適化](#ステップ2-データ取得の最適化)
5. [ステップ3: コンポーネントの最適化](#ステップ3-コンポーネントの最適化)
6. [ステップ4: バンドルサイズの最適化](#ステップ4-バンドルサイズの最適化)
7. [ステップ5: 画像の最適化](#ステップ5-画像の最適化)
8. [ステップ6: Supabaseクエリの最適化](#ステップ6-supabaseクエリの最適化)
9. [検証チェックリスト](#検証チェックリスト)

---

## 現状分析

### 潜在的なパフォーマンス問題

1. **ウォーターフォール問題**: データ取得が直列に実行される可能性
2. **不要な再レンダリング**: 適切なメモ化が欠如
3. **大きなバンドルサイズ**: コード分割が不十分
4. **最適化されていないクエリ**: N+1問題の可能性
5. **画像最適化の欠如**: Next.js Imageの活用不足

### 現在の構成

- **フレームワーク**: Next.js 15.1 (App Router)
- **状態管理**: Zustand + React Query
- **データベース**: Supabase (PostgreSQL)
- **リアルタイム**: Supabase Realtime

---

## 最適化対象

### 優先度マトリクス

| 対象                 | 影響度 | 実装難易度 | 優先度  |
| -------------------- | ------ | ---------- | ------- |
| データ取得の並列化   | 高     | 中         | 🔴 最高 |
| React.memo適用       | 高     | 低         | 🔴 高   |
| 動的インポート       | 中     | 低         | 🟡 中   |
| バンドル分析・最適化 | 中     | 中         | 🟡 中   |
| 画像最適化           | 中     | 低         | 🟡 中   |
| Supabaseクエリ最適化 | 高     | 中         | 🔴 高   |

---

## ステップ1: パフォーマンス計測ベースライン

### 目標

現在のパフォーマンスを計測し、改善後と比較するためのベースラインを作成する。

### 計測項目

#### Core Web Vitals

| 指標                               | 説明                             | 目標値  |
| ---------------------------------- | -------------------------------- | ------- |
| **LCP** (Largest Contentful Paint) | 最大コンテンツの表示時間         | < 2.5秒 |
| **FID** (First Input Delay)        | 初回入力遅延                     | < 100ms |
| **CLS** (Cumulative Layout Shift)  | レイアウトシフト                 | < 0.1   |
| **TTI** (Time to Interactive)      | インタラクティブになるまでの時間 | < 3.8秒 |

#### アプリケーション固有

| 指標                   | 説明                   | 目標値  |
| ---------------------- | ---------------------- | ------- |
| ダッシュボード読み込み | 初期表示までの時間     | < 1.5秒 |
| チームページ読み込み   | 初期表示までの時間     | < 2.0秒 |
| フォームモーダル表示   | モーダル表示までの時間 | < 300ms |
| 初期バンドルサイズ     | JSバンドルサイズ       | < 500KB |

### 計測方法

```bash
# 1. Lighthouseでパフォーマンス計測
npm run build
npm run start
# Chrome DevToolsでLighthouseを実行

# 2. バンドル分析
ANALYZE=true npm run build

# 3. React DevTools Profilerで再レンダリング計測
```

### 実施タスク

- [ ] Lighthouseでベースライン計測（ダッシュボード、チーム、マイページ）
- [ ] バンドルサイズ計測
- [ ] 結果をドキュメント化

### 推定工数

**1-2時間**

---

## ステップ2: データ取得の最適化

### 目標

ウォーターフォール問題を解消し、データ取得を並列化する。

### 現状の問題

```typescript
// ❌ 悪い例: ウォーターフォール
const Dashboard = () => {
  const { data: practices } = usePracticesQuery(); // 1回目のリクエスト
  const { data: records } = useRecordsQuery(); // 2回目のリクエスト（1が完了後）
  const { data: goals } = useGoalsQuery(); // 3回目のリクエスト（2が完了後）
  // 合計: 3回の直列リクエスト
};
```

### 解決策1: Server Componentsでの並列データ取得

```typescript
// ✅ 良い例: Server Componentで並列取得
// apps/web/app/(authenticated)/dashboard/page.tsx
import { createServerClient } from '@/lib/supabase/server'

async function fetchDashboardData(userId: string) {
  const supabase = createServerClient()

  // Promise.allで並列実行
  const [practices, records, goals, teams] = await Promise.all([
    supabase
      .from('practices')
      .select('id, date, title, place, practice_logs(id, style, distance)')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(10),
    supabase
      .from('records')
      .select('id, time_result, competition_date, style:styles(id, name_jp, distance)')
      .eq('user_id', userId)
      .order('competition_date', { ascending: false })
      .limit(10),
    supabase
      .from('goals')
      .select('id, target_time, is_achieved, style:styles(id, name_jp, distance)')
      .eq('user_id', userId)
      .eq('is_achieved', false),
    supabase
      .from('team_memberships')
      .select('id, role, team:teams(id, name)')
      .eq('user_id', userId)
      .eq('is_active', true)
  ])

  return {
    practices: practices.data ?? [],
    records: records.data ?? [],
    goals: goals.data ?? [],
    teams: teams.data ?? []
  }
}

export default async function DashboardPage() {
  const user = await getUser()
  const data = await fetchDashboardData(user.id)

  return <DashboardClient {...data} />
}
```

### 解決策2: React Queryのプリフェッチ

```typescript
// apps/web/components/navigation/NavLink.tsx
'use client'

import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'

export const NavLink = ({ href, children }: { href: string; children: React.ReactNode }) => {
  const queryClient = useQueryClient()

  const handleMouseEnter = () => {
    // ホバー時にデータをプリフェッチ
    if (href === '/practices') {
      queryClient.prefetchQuery({
        queryKey: ['practices'],
        queryFn: fetchPractices,
        staleTime: 5 * 60 * 1000
      })
    }
    if (href === '/records') {
      queryClient.prefetchQuery({
        queryKey: ['records'],
        queryFn: fetchRecords,
        staleTime: 5 * 60 * 1000
      })
    }
  }

  return (
    <Link href={href} onMouseEnter={handleMouseEnter}>
      {children}
    </Link>
  )
}
```

### 適用対象ページ

| ページ         | 現状       | 最適化後                |
| -------------- | ---------- | ----------------------- |
| ダッシュボード | 直列クエリ | Server Component + 並列 |
| チーム詳細     | 直列クエリ | Server Component + 並列 |
| マイページ     | 直列クエリ | Server Component + 並列 |
| 記録一覧       | 直列クエリ | Server Component + 並列 |

### 推定工数

**3-4時間**

---

## ステップ3: コンポーネントの最適化

### 目標

不要な再レンダリングを防止し、UIの応答性を向上させる。

### React.memoの適用

```typescript
// ❌ 毎回再レンダリング
export const PracticeCard = ({ practice, onEdit, onDelete }) => {
  return <div>...</div>
}

// ✅ React.memoで再レンダリング防止
export const PracticeCard = React.memo(
  ({ practice, onEdit, onDelete }) => {
    return <div>...</div>
  },
  (prevProps, nextProps) => {
    // カスタム比較関数
    return (
      prevProps.practice.id === nextProps.practice.id &&
      prevProps.practice.updated_at === nextProps.practice.updated_at
    )
  }
)
```

### 適用対象コンポーネント

| コンポーネント | 場所         | 理由               |
| -------------- | ------------ | ------------------ |
| PracticeCard   | リスト内     | 多数レンダリング   |
| RecordCard     | リスト内     | 多数レンダリング   |
| GoalCard       | リスト内     | 多数レンダリング   |
| TeamMemberCard | リスト内     | 多数レンダリング   |
| CalendarDay    | カレンダー内 | 42日分レンダリング |
| AttendanceRow  | テーブル内   | 多数レンダリング   |

### useMemo / useCallbackの適用

```typescript
// ❌ 毎回新しい配列が生成される
const filteredPractices = practices.filter((p) => p.team_id === teamId);

// ✅ useMemoで計算結果をメモ化
const filteredPractices = useMemo(
  () => practices.filter((p) => p.team_id === teamId),
  [practices, teamId],
);

// ❌ 毎回新しい関数が生成される
const handleClick = (id: string) => {
  doSomething(id);
};

// ✅ useCallbackで関数をメモ化
const handleClick = useCallback((id: string) => {
  doSomething(id);
}, []);
```

### 適用対象フック/計算

| 対象                   | 場所                    | 種類        |
| ---------------------- | ----------------------- | ----------- |
| フィルタリング結果     | リストコンポーネント    | useMemo     |
| ソート結果             | テーブルコンポーネント  | useMemo     |
| イベントハンドラ       | カード/行コンポーネント | useCallback |
| 計算結果（距離合計等） | 統計コンポーネント      | useMemo     |

### 推定工数

**2-3時間**

---

## ステップ4: バンドルサイズの最適化

### 目標

初期バンドルサイズを削減し、初期読み込み時間を短縮する。

### 動的インポートの適用

```typescript
// ❌ すべてのモーダルが初期バンドルに含まれる
import { RecordFormModal } from '@/components/modals/RecordFormModal'
import { PracticeFormModal } from '@/components/modals/PracticeFormModal'

// ✅ 動的インポートで必要な時のみロード
import dynamic from 'next/dynamic'

const RecordFormModal = dynamic(
  () => import('@/components/modals/RecordFormModal'),
  {
    loading: () => <ModalSkeleton />,
    ssr: false
  }
)

const PracticeFormModal = dynamic(
  () => import('@/components/modals/PracticeFormModal'),
  {
    loading: () => <ModalSkeleton />,
    ssr: false
  }
)
```

### 動的インポート適用対象

| コンポーネント       | 理由               | 推定サイズ削減 |
| -------------------- | ------------------ | -------------- |
| RecordFormModal      | 大きなフォーム     | ~50KB          |
| PracticeFormModal    | 大きなフォーム     | ~50KB          |
| PracticeLogFormModal | 大きなフォーム     | ~50KB          |
| RecordProgressChart  | chart.js依存       | ~100KB         |
| ImageCropModal       | 画像処理ライブラリ | ~80KB          |
| TagManagementModal   | 低使用頻度         | ~20KB          |

### バンドル分析の設定

```javascript
// next.config.js
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

module.exports = withBundleAnalyzer({
  // 既存の設定
});
```

```bash
# 実行
ANALYZE=true npm run build
```

### 推定工数

**2-3時間**

---

## ステップ5: 画像の最適化

### 目標

画像の読み込みを最適化し、ページ表示速度を向上させる。

### Next.js Imageコンポーネントの活用

```typescript
// ❌ 最適化されていない画像
<img src={practice.image_url} alt="Practice" />

// ✅ Next.js Imageで最適化
import Image from 'next/image'

<Image
  src={practice.image_url}
  alt="Practice"
  width={800}
  height={600}
  placeholder="blur"
  blurDataURL={practice.blur_data_url}
  loading="lazy"
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
/>
```

### next.config.js の画像設定

```javascript
// next.config.js
module.exports = {
  images: {
    formats: ["image/avif", "image/webp"], // 最新フォーマットを優先
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};
```

### 適用対象

| 場所               | 現状    | 対応                             |
| ------------------ | ------- | -------------------------------- |
| プロフィール画像   | `<img>` | `<Image>` + lazy                 |
| 練習画像ギャラリー | `<img>` | `<Image>` + lazy + sizes         |
| 大会画像ギャラリー | `<img>` | `<Image>` + lazy + sizes         |
| チームロゴ         | `<img>` | `<Image>` + priority（ヘッダー） |

### 推定工数

**1-2時間**

---

## ステップ6: Supabaseクエリの最適化

### 目標

データベースクエリを最適化し、データ取得時間を短縮する。

### select文の最適化

```typescript
// ❌ すべてのカラムを取得
const { data } = await supabase.from("practices").select("*");

// ✅ 必要なカラムのみ取得
const { data } = await supabase
  .from("practices")
  .select("id, date, title, place, team_id, practice_logs(id, style, distance)")
  .order("date", { ascending: false })
  .limit(20);
```

### N+1問題の解決

```typescript
// ❌ N+1問題が発生
const practices = await supabase.from("practices").select("*");
for (const practice of practices.data) {
  const logs = await supabase.from("practice_logs").select("*").eq("practice_id", practice.id);
  // 各practiceに対して個別にクエリが実行される
}

// ✅ JOINで一度に取得
const { data } = await supabase
  .from("practices")
  .select(
    `
    id, date, title, place,
    practice_logs(id, style, distance, rep_count, set_count)
  `,
  )
  .order("date", { ascending: false });
```

### インデックスの確認・追加

```sql
-- 頻繁にクエリされるカラムにインデックスを追加
CREATE INDEX IF NOT EXISTS idx_practices_user_date
  ON practices(user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_practices_team_date
  ON practices(team_id, date DESC)
  WHERE team_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_records_user_style
  ON records(user_id, style_id);

CREATE INDEX IF NOT EXISTS idx_team_attendance_practice
  ON team_attendance(practice_id, status);

CREATE INDEX IF NOT EXISTS idx_goals_user_achieved
  ON goals(user_id, is_achieved);
```

### リアルタイムサブスクリプションの最適化

```typescript
// ❌ すべてのキャッシュを無効化
useEffect(() => {
  const channel = supabase
    .channel("practices_changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "practices" }, () => {
      queryClient.invalidateQueries(["practices"]); // 全キャッシュ無効化
    })
    .subscribe();
}, []);

// ✅ 部分的なキャッシュ更新
useEffect(() => {
  const channel = supabase
    .channel("practices_changes")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "practices" },
      (payload) => {
        // 新規データをキャッシュに追加（再取得不要）
        queryClient.setQueryData(["practices"], (old: Practice[]) => [
          payload.new as Practice,
          ...old,
        ]);
      },
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "practices" },
      (payload) => {
        // 更新されたデータのみキャッシュ更新
        queryClient.setQueryData(["practices"], (old: Practice[]) =>
          old.map((p) => (p.id === payload.new.id ? (payload.new as Practice) : p)),
        );
      },
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "practices" },
      (payload) => {
        // 削除されたデータをキャッシュから除去
        queryClient.setQueryData(["practices"], (old: Practice[]) =>
          old.filter((p) => p.id !== payload.old.id),
        );
      },
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}, [queryClient]);
```

### 推定工数

**2-3時間**

---

## 📊 進捗サマリー

| ステップ | 対象                   | 影響度 | ステータス |
| -------- | ---------------------- | ------ | ---------- |
| 1        | パフォーマンス計測     | 基盤   | ✅ 完了    |
| 2        | データ取得の最適化     | 高     | ✅ 完了    |
| 3        | コンポーネントの最適化 | 高     | ✅ 完了    |
| 4        | バンドルサイズの最適化 | 中     | ✅ 完了    |
| 5        | 画像の最適化           | 中     | ✅ 完了    |
| 6        | Supabaseクエリの最適化 | 高     | ⏳ 未着手  |

---

## 🎯 期待される改善効果

| 指標                   | 現在（推定） | 目標    | 改善率  |
| ---------------------- | ------------ | ------- | ------- |
| LCP                    | 3.5s         | < 2.0s  | 43%改善 |
| FID                    | 150ms        | < 100ms | 33%改善 |
| TTI                    | 4.5s         | < 3.0s  | 33%改善 |
| バンドルサイズ         | 800KB        | < 500KB | 38%削減 |
| ダッシュボード読み込み | 2.5s         | < 1.5s  | 40%改善 |

---

## 🎯 実装順序（推奨）

1. **ステップ1: パフォーマンス計測** (1-2時間)
   - ベースライン作成
   - 改善効果を測定可能に

2. **ステップ2: データ取得の最適化** (3-4時間)
   - 最も効果が高い
   - Server Components活用

3. **ステップ6: Supabaseクエリの最適化** (2-3時間)
   - データ取得と併せて実施
   - インデックス追加

4. **ステップ3: コンポーネントの最適化** (2-3時間)
   - React.memo適用
   - useMemo/useCallback適用

5. **ステップ4: バンドルサイズの最適化** (2-3時間)
   - 動的インポート
   - バンドル分析

6. **ステップ5: 画像の最適化** (1-2時間)
   - Next.js Image適用
   - 設定最適化

**合計推定工数**: 12-17時間

---

## 検証チェックリスト

### 各ステップ完了後

- [ ] Lighthouseスコア計測
- [ ] Core Web Vitals確認
- [ ] 既存テスト全てパス (`npm test`)
- [ ] 手動動作確認
  - [ ] ページ遷移速度
  - [ ] インタラクション応答性
  - [ ] 画像表示

### 最終検証

- [ ] ベースラインと比較
- [ ] 目標値達成確認
- [ ] 本番環境でのテスト

---

## 📝 注意事項

### 過度な最適化を避ける

- 計測に基づいて最適化する（推測ではなく）
- 可読性とのバランスを考慮
- 効果が小さい最適化は後回し

### テストの重要性

- 最適化後も機能が正常に動作することを確認
- パフォーマンステストも追加検討

### 段階的な適用

- 一度にすべてを変更しない
- 各ステップ後に効果を計測

---

## 📚 参考

### 公式ドキュメント

- [Next.js Performance](https://nextjs.org/docs/app/building-your-application/optimizing)
- [React Performance](https://react.dev/learn/render-and-commit)
- [Supabase Performance Tips](https://supabase.com/docs/guides/performance)

### ツール

- **Lighthouse**: パフォーマンス計測
- **webpack-bundle-analyzer**: バンドル分析
- **React DevTools Profiler**: 再レンダリング分析

### 関連ドキュメント

- [REFACTORING_PLAN.md](./REFACTORING_PLAN.md) - 全体計画
- [REFACTORING_PHASE2_PROGRESS.md](./REFACTORING_PHASE2_PROGRESS.md) - フェーズ2完了
- [REFACTORING_PHASE3_PLAN.md](./REFACTORING_PHASE3_PLAN.md) - フェーズ3計画

---

**最終更新**: 2026-01-22
**次回更新予定**: ステップ1完了後
