# Bundle最適化 — 詳細と修正例

> ルール: `bundle-barrel-imports`, `bundle-dynamic-imports`, `bundle-defer-third-party`, `bundle-conditional`, `bundle-preload`
> 評価: **C** — barrel import問題と`optimizePackageImports`未設定が大きなボトルネック

## 現状の良い点

- `exceljs` — 動的import済み (`await import('exceljs')`)
- `html-to-image` — 動的import済み (`await import('html-to-image')`)
- フォームモーダル — `next/dynamic`で遅延読み込み済み（FormModals.tsx）
- `ImageCropModal` — `next/dynamic`で遅延読み込み済み（AvatarUpload.tsx）

---

## 1. `optimizePackageImports`未設定

**ファイル:** `apps/web/next.config.mjs`

### 問題

`optimizePackageImports`が設定されていない。Next.js 13.5+のこの機能は、barrel fileからのimportを自動的に直接importに変換し、バンドルサイズを大幅に削減する。

### 現状のconfig

```js
const nextConfig = {
  typescript: { ignoreBuildErrors: false },
  env: { ... },
  serverExternalPackages: ['@supabase/supabase-js'],
  images: { ... },
}
```

### 修正例

```js
const nextConfig = {
  typescript: { ignoreBuildErrors: false },
  env: { ... },
  serverExternalPackages: ['@supabase/supabase-js'],
  images: { ... },
  experimental: {
    optimizePackageImports: [
      '@heroicons/react/24/outline',
      '@heroicons/react/24/solid',
      'date-fns',
      'recharts',
    ],
  },
}
```

> `@heroicons/react`は特に重要。プロジェクト全体で多数のアイコンを個別importしているが、barrel file経由だと全アイコンがバンドルに含まれる可能性がある。

---

## 2. Barrel Import問題

### 2a. `@/stores/index.ts` — 11ストア全集約 (HIGH)

**ファイル:** `apps/web/stores/index.ts`

```ts
// 現状: export * で全ストアを再エクスポート
export * from './practice/practiceStore'
export * from './competition/competitionStore'
export * from './form/attendanceTabStore'
export * from './form/commonFormStore'
export * from './form/competitionRecordStore'
export * from './form/practiceRecordStore'
export * from './form/teamDetailStore'
export * from './form/teamAdminStore'
export * from './modal/modalStore'
export * from './profile/profileStore'
export * from './team/teamStore'
export * from './ui/uiStore'
```

#### 影響

`import { usePracticeFormStore } from '@/stores'` と書くと、バンドラは12個のストアモジュール全てを評価する必要がある。`export *`はtree-shaking最悪のパターン。

#### 修正方針

各コンポーネントで直接importに変更:

```ts
// Before
import { usePracticeFormStore, useCompetitionFormStore } from '@/stores'

// After
import { usePracticeFormStore } from '@/stores/form/practiceRecordStore'
import { useCompetitionFormStore } from '@/stores/form/competitionRecordStore'
```

### 2b. `@/components/team/index.ts` — 27コンポーネント集約 (HIGH)

**ファイル:** `apps/web/components/team/index.ts`

27個のコンポーネントを再エクスポート。1つだけ必要な箇所でも全27モジュールが処理対象に。

#### 影響例

```ts
// TeamAnnouncementsSection.tsx — 1/27しか使わない
import { TeamAnnouncements } from '@/components/team'
```

#### 修正方針

```ts
// Before
import { TeamAnnouncements } from '@/components/team'

// After
import { TeamAnnouncements } from '@/components/team/announcements/TeamAnnouncements'
```

### 2c. `@/components/ui/index.ts` — 15コンポーネント集約 (MODERATE)

15個のUIコンポーネントを再エクスポート。30+ファイルから利用。個々のUIコンポーネントは小さいため影響は限定的だが、`DatePicker`や`FormStepper`など大きめのコンポーネントが含まれる。

### 2d. `@/utils/index.ts` — `export *` (LOW)

```ts
export * from './formatters'
export * from './validators'
export * from './redirect'
```

小さなモジュールだが`export *`パターンは非推奨。

---

## 3. 重量ライブラリの静的import

### 3a. `recharts` — 静的import、おそらく未使用 (CRITICAL)

**ファイル:** `apps/web/components/charts/RecordProgressChart.tsx`

```ts
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
```

#### 問題

- recharts は~300KB (gzipped) の大きなライブラリ
- `RecordProgressChart`コンポーネントはプロジェクト内で**どこからもimportされていない**
- 未使用でもバンドラがファイルを処理する可能性あり

#### 修正方針

1. **未使用なら削除**: `RecordProgressChart.tsx`自体を削除
2. **将来使うなら**: `next/dynamic`でラップ

```ts
import dynamic from 'next/dynamic'

const RecordProgressChart = dynamic(
  () => import('@/components/charts/RecordProgressChart'),
  { ssr: false, loading: () => <LoadingSkeleton height={300} /> }
)
```

### 3b. `@aws-sdk/client-s3` — 依存関係に存在するが未使用 (MODERATE)

**ファイル:** `apps/web/package.json`

```json
"@aws-sdk/client-s3": "^3.975.0"
```

プロジェクト内でこのパッケージをimportしているファイルがない。`node_modules`の肥大化とインストール時間に影響。

#### 修正

```bash
npm uninstall @aws-sdk/client-s3 --workspace=apps/web
```

---

## 4. 遅延読み込み候補

### 4a. `ShareCardModal` — 4箇所で静的import (MEDIUM)

**利用箇所:**
- `CompetitionDetails.tsx`
- `PracticeDetails.tsx`
- `PracticeClient.tsx`
- `CompetitionClient.tsx`

シェア機能は低頻度利用。`html-to-image`は既に動的importだが、モーダル自体とカードコンポーネントが静的import。

#### 修正例

```ts
// Before
import { ShareCardModal } from '@/components/share'

// After
import dynamic from 'next/dynamic'
const ShareCardModal = dynamic(
  () => import('@/components/share/ShareCardModal').then(mod => ({ default: mod.ShareCardModal })),
  { ssr: false }
)
```

---

## 5. チェックリスト

- [ ] `next.config.mjs`に`optimizePackageImports`を追加
- [ ] `RecordProgressChart.tsx`を削除 or `next/dynamic`化
- [ ] `@/stores/index.ts`のbarrel importを各ストアからの直接importに段階的に移行
- [ ] `@/components/team/index.ts`の主要消費者を直接importに変更
- [ ] `ShareCardModal`を`next/dynamic`化
- [ ] `@aws-sdk/client-s3`をpackage.jsonから削除
- [ ] `@/utils/index.ts`の`export *`を名前付きexportに変更
