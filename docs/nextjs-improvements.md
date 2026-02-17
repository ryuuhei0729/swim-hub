# Next.js ベストプラクティス改善タスク

## 1. 動的ルートに `generateMetadata` を追加

SNS共有時にページ固有のタイトル・説明を表示するため、動的ルートに `generateMetadata` を実装する。

### 対象ファイル

- `apps/web/app/(authenticated)/teams/[teamId]/page.tsx`
- `apps/web/app/(authenticated)/competition/[competitionId]/page.tsx`
- `apps/web/app/(authenticated)/practice/[practiceId]/page.tsx`
- `apps/web/app/(authenticated)/members/[memberId]/page.tsx`
- その他 `[param]` を含む動的ルート

### 実装例

```tsx
import type { Metadata } from 'next'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ teamId: string }>
}): Promise<Metadata> {
  const { teamId } = await params
  const supabase = await createAuthenticatedServerClient()
  const { data: team } = await supabase
    .from('teams')
    .select('name')
    .eq('id', teamId)
    .single()

  return {
    title: team?.name
      ? `${team.name} | SwimHub`
      : 'チーム | SwimHub',
  }
}
```

---

## 2. 静的ページに `revalidate` を設定

認証不要の公開ページを静的生成し、ビルド時にHTMLを生成する。

### 対象ファイル

- `apps/web/app/(unauthenticated)/terms/page.tsx`
- `apps/web/app/(unauthenticated)/privacy/page.tsx`
- `apps/web/app/(unauthenticated)/support/page.tsx`
- `apps/web/app/(unauthenticated)/contact/page.tsx`

### 実装例

```tsx
// 各ページファイルの先頭に追加
export const revalidate = 3600 // 1時間ごとに再生成
```

コンテンツが完全に静的なら:

```tsx
export const dynamic = 'force-static'
```

---

## 3. 不足している `loading.tsx` / `error.tsx` を追加

### loading.tsx が不足しているルート

- `apps/web/app/(authenticated)/settings/loading.tsx`
- `apps/web/app/(authenticated)/goals/loading.tsx`
- `apps/web/app/(authenticated)/attendance/loading.tsx`
- `apps/web/app/(authenticated)/schedule/loading.tsx`
- `apps/web/app/(authenticated)/members/loading.tsx`

### error.tsx が不足しているルート

- `apps/web/app/(authenticated)/settings/error.tsx`
- `apps/web/app/(authenticated)/goals/error.tsx`
- `apps/web/app/(authenticated)/attendance/error.tsx`
- `apps/web/app/(authenticated)/schedule/error.tsx`
- `apps/web/app/(authenticated)/members/error.tsx`

### テンプレート (loading.tsx)

```tsx
export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-4 space-y-4">
        <div className="bg-white rounded-lg shadow p-6 animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded w-full" />
            <div className="h-4 bg-gray-200 rounded w-2/3" />
          </div>
        </div>
      </div>
    </div>
  )
}
```

### テンプレート (error.tsx)

```tsx
'use client'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function Error({ error, reset }: ErrorProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
        <h2 className="text-xl font-bold text-gray-800 mb-2">
          エラーが発生しました
        </h2>
        <p className="text-gray-600 mb-6">
          {error.message || 'データの読み込みに失敗しました'}
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          再試行
        </button>
      </div>
    </div>
  )
}
```

---

## 4. 日本語フォントの最適化

`next/font` 経由で日本語フォントを読み込み、FOUT（Flash of Unstyled Text）を防止する。

### 対象ファイル

- `apps/web/app/layout.tsx`

### 実装例

```tsx
import { Inter } from 'next/font/google'
import { Noto_Sans_JP } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  variable: '--font-noto-sans-jp',
  weight: ['400', '500', '700'],
})

// layout内
<body className={`${inter.variable} ${notoSansJP.variable} font-sans`}>
```

CSSで `font-family` を設定:

```css
:root {
  font-family: var(--font-inter), var(--font-noto-sans-jp), sans-serif;
}
```

---

## 5. `next.config.js` を ESM 形式に移行

`require()` を廃止し `import` に統一する。

### 対象ファイル

- `apps/web/next.config.js` → `apps/web/next.config.mjs`

### Before

```js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

module.exports = withBundleAnalyzer(nextConfig)
```

### After

```mjs
import withBundleAnalyzer from '@next/bundle-analyzer'

const analyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

export default analyzer(nextConfig)
```

---

## 6. Image最適化の代替策（Cloudflare Images）

`unoptimized: true` の代わりに Cloudflare Images または カスタム loader を使う。

### 対象ファイル

- `apps/web/next.config.js` (or `.mjs`)

### 実装例（カスタム loader）

```tsx
// lib/cloudflare-image-loader.ts
export default function cloudflareLoader({
  src,
  width,
  quality,
}: {
  src: string
  width: number
  quality?: number
}) {
  const params = [`width=${width}`, `quality=${quality || 75}`, 'format=auto']
  return `https://your-domain.com/cdn-cgi/image/${params.join(',')}/${src}`
}
```

```js
// next.config.mjs
const nextConfig = {
  images: {
    loader: 'custom',
    loaderFile: './lib/cloudflare-image-loader.ts',
  },
}
```

> **注意:** Cloudflare Imagesの契約が必要。現状のR2直接配信でも許容範囲なら優先度は低い。
