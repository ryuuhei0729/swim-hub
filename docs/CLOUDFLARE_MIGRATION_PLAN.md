# Cloudflare移行計画

## 概要
- **移行元**: Vercel + Supabase Storage
- **移行先**: Cloudflare Pages + Cloudflare R2
- **維持**: Supabase Database（PostgreSQL）、認証、RLS、RPC関数

---

## ⚠️ Cloudflare Pages + Next.js の制限事項

`@cloudflare/next-on-pages` を使用する場合、以下の制限に注意が必要：

| 機能 | 状況 | 対応策 |
|------|------|--------|
| **Server Actions** | Edge Runtimeのみ対応 | Edge互換性の確認必須 |
| **Dynamic Routes** | 一部制限あり | 動作確認必須 |
| **Node.js API** | `nodejs_compat`でも全ては使えない | 使用APIの確認 |
| **`next/image`** | デフォルト最適化が動かない | カスタムloader or `unoptimized` |
| **ISR** | サポートなし | 静的生成 or クライアント取得に変更 |
| **Middleware** | Edge Runtime互換が必要 | Node.js API使用箇所の確認 |

---

## Phase 0: 互換性調査（移行前準備）

### 0.1 Server Actionsの棚卸し

以下のディレクトリ内のServer Actionsを確認し、Edge Runtime互換性をチェック：

```bash
# Server Actionsの検索
grep -r "use server" apps/web/app --include="*.ts" --include="*.tsx"
```

**確認観点**:
- Node.js専用APIの使用有無（`fs`, `path`, `crypto`等）
- 重いライブラリの使用有無
- Supabaseクライアントの使い方（サーバー側クライアントの初期化方法）

### 0.2 `next/image` 使用箇所の洗い出し

```bash
grep -r "next/image" apps/web --include="*.tsx"
```

**対応方針を決定**:
- [ ] **Option A**: Cloudflare Images を使う（有料）
- [ ] **Option B**: `unoptimized: true` にする（最適化なし）
- [ ] **Option C**: カスタムloaderを実装

### 0.3 Middlewareの確認

`apps/web/middleware.ts` がEdge Runtime互換かチェック。

### 0.4 API Routesの確認

`apps/web/app/api/` 配下のルートがEdge Runtime互換かチェック。

### 0.5 Next.js 16 互換性確認

現在のプロジェクトは **Next.js 16.1.0** を使用しています。
`@cloudflare/next-on-pages` の最新ドキュメントで互換性を確認してください。

- 公式ドキュメント: https://developers.cloudflare.com/pages/framework-guides/nextjs/
- GitHub Issues: next-on-pages の Next.js 16 対応状況を確認

**確認事項**:
- Next.js 16 の新機能（Server Actions、Server Components等）が正常に動作するか
- ビルドエラーが発生しないか
- ローカルでの `npm run build:cloudflare` が成功するか

---

## 現状分析

### 移行が必要な機能
| 機能 | 現状 | 移行先 | 影響度 |
|------|------|--------|--------|
| ホスティング | Vercel | Cloudflare Pages | 中 |
| 画像Storage | Supabase Storage | Cloudflare R2 | 中 |
| キャッシュ (`unstable_cache`) | Vercel | 削除（毎回取得） | 小 |
| `revalidatePath` | Vercel | `router.refresh()` | 小 |

### 維持する機能
- Supabase Database（PostgreSQL）
- Supabase Auth（認証）
- RLS（Row Level Security）
- RPC関数（Google Calendar連携等）

---

## Phase 1: Cloudflare R2 への Storage 移行

### 1.1 R2バケット作成

Cloudflareダッシュボードで **単一バケット + プレフィックス構成** で作成：

```
swim-hub-images/
  ├── profiles/      # プロフィール画像
  ├── practices/     # 練習記録画像
  └── competitions/  # 大会記録画像
```

> **理由**: 複数バケットより管理がシンプル。CORS設定やアクセス権限も一箇所で管理可能。

### 1.2 R2アクセス方法

**S3互換API** を使用（Cloudflare Pages + Next.jsとの相性が良い）：

**新規ファイル**: `apps/web/lib/r2.ts`
```typescript
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

const BUCKET_NAME = process.env.R2_BUCKET_NAME!
const PUBLIC_URL = process.env.R2_PUBLIC_URL! // カスタムドメイン or R2.dev URL

export async function uploadToR2(
  file: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: file,
      ContentType: contentType,
    })
  )
  return `${PUBLIC_URL}/${key}`
}

export async function deleteFromR2(key: string): Promise<void> {
  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    })
  )
}

export function getR2PublicUrl(key: string): string {
  return `${PUBLIC_URL}/${key}`
}
```

### 1.3 必要なパッケージ

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

### 1.4 修正対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `apps/shared/api/practices.ts` | **メイン修正**: upload/remove/getPublicUrl を R2 に変更 |
| `apps/shared/api/competitions.ts` | **メイン修正**: upload/remove/getPublicUrl を R2 に変更 |
| `apps/web/components/profile/AvatarUpload.tsx` | Supabase Storage → R2 API |
| `apps/web/app/(authenticated)/dashboard/_components/DayDetailModal.tsx` | 画像URL生成をR2形式に |
| `apps/web/app/(authenticated)/dashboard/_hooks/useCalendarHandlers.ts` | 画像URL生成をR2形式に |
| `apps/web/app/(authenticated)/dashboard/_hooks/useDashboardHandlers.ts` | 上記APIの呼び出しに影響 |

### 1.5 移行期間中のフォールバック実装

既存のSupabase Storage画像も読み取れるようにフォールバックを実装：

**新規ファイル**: `apps/web/lib/image-url.ts`
```typescript
const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL
const SUPABASE_STORAGE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public`

/**
 * 画像URLを取得（R2優先、フォールバックでSupabase Storage）
 * 移行完了後はR2のみに変更
 */
export function getImageUrl(
  path: string | null,
  bucket: 'profiles' | 'practices' | 'competitions'
): string | null {
  if (!path) return null

  // 既にフルURLの場合はそのまま返す
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }

  // R2のURLを返す（移行後）
  if (R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL}/${bucket}/${path}`
  }

  // フォールバック: Supabase Storage
  return `${SUPABASE_STORAGE_URL}/${bucket}/${path}`
}
```

### 1.6 データ移行スクリプト

既存のSupabase Storageから画像をR2へ移行：

**新規ファイル**: `scripts/migrate-storage-to-r2.ts`
```typescript
// 実行: npx ts-node scripts/migrate-storage-to-r2.ts

import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const BUCKETS = ['profiles', 'practices', 'competitions'] as const

async function migrateStorage() {
  // 1. Supabase Storageから全ファイル一覧取得
  // 2. 各ファイルをダウンロード
  // 3. R2にアップロード
  // 4. 進捗をログ出力
}

migrateStorage()
```

---

## Phase 2: キャッシュ戦略の簡略化

### 2.1 `unstable_cache` の削除

**修正ファイル**:
- `apps/web/lib/data-loaders/common.ts`
- `apps/web/app/(authenticated)/dashboard/_server/MetadataLoader.tsx`

**変更内容**:
- `unstable_cache` を削除し、直接Supabaseから取得
- Styles（種目データ）は頻繁に変わらないため、パフォーマンス影響は軽微

```typescript
// Before
export async function getCachedStyles(...) {
  return unstable_cache(async () => { ... })()
}

// After
export async function getStyles(): Promise<Style[]> {
  const supabase = createClient()
  const { data } = await supabase.from('styles').select('*')
  return data ?? []
}
```

### 2.2 `revalidatePath` の置き換え

**修正ファイル**: `apps/web/app/(authenticated)/teams/_actions/actions.ts`
- Server Actions内の `revalidatePath` を削除
- クライアント側で `router.refresh()` を呼び出す

---

## Phase 2.5: `next/image` の対応

Cloudflare Pagesでは`next/image`のデフォルト最適化が動作しないため、対応が必要。

### 選択肢

| 方法 | メリット | デメリット |
|------|----------|------------|
| **A: `unoptimized: true`** | 設定が簡単 | 画像最適化なし、パフォーマンス低下 |
| **B: Cloudflare Images** | 高品質な最適化 | 月額$5〜の追加コスト |
| **C: カスタムloader** | 柔軟性が高い | 実装コストがかかる |

### 推奨: カスタムloader（Cloudflare Images使用時）

**新規ファイル**: `apps/web/lib/image-loader.ts`
```typescript
import type { ImageLoader } from 'next/image'

export const cloudflareLoader: ImageLoader = ({ src, width, quality }) => {
  // Cloudflare Images を使用する場合
  // return `https://imagedelivery.net/${ACCOUNT_HASH}/${src}/w=${width},q=${quality || 75}`

  // R2直接配信の場合（最適化なし）
  return src
}
```

**next.config.js に追加**:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    loader: 'custom',
    loaderFile: './lib/image-loader.ts',
  },
}
```

### 最小対応: `unoptimized: true`

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
}
```

---

## Phase 3: Cloudflare Pages への移行

### 3.1 `@cloudflare/next-on-pages` 導入

```bash
npm install @cloudflare/next-on-pages
```

### 3.2 設定ファイル作成

**新規ファイル**: `apps/web/wrangler.toml`
```toml
name = "swim-hub"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[vars]
NEXT_PUBLIC_ENVIRONMENT = "production"

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "swim-hub-images"
```

### 3.3 next.config.js 修正

現在の `next.config.js` には `output: 'standalone'` は設定されていないため、追加は不要です。

**必要な修正**:
1. `images.remotePatterns` に R2 の URL パターンを追加
2. `images.loader` または `images.unoptimized` の設定（Phase 2.5参照）

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // ...既存設定
  
  images: {
    // ...既存設定
    remotePatterns: [
      // ...既存のSupabase設定
      {
        protocol: 'https',
        hostname: 'images.your-domain.com', // R2カスタムドメイン
        port: '',
        pathname: '/**',
      },
      // または R2.dev のパブリックURLを使用する場合
      {
        protocol: 'https',
        hostname: '*.r2.dev',
        port: '',
        pathname: '/**',
      },
    ],
    // Phase 2.5で決定したloader設定を追加
  },
}
```

### 3.4 ビルドコマンド変更

**package.json**:
```json
{
  "scripts": {
    "build": "next build",
    "build:cloudflare": "npx @cloudflare/next-on-pages",
    "preview": "npx wrangler pages dev .vercel/output/static"
  }
}
```

---

## Phase 4: 環境変数の移行

### 4.1 Cloudflare環境変数設定

Cloudflareダッシュボードまたは `wrangler secret` で設定:

```bash
wrangler secret put NEXT_PUBLIC_SUPABASE_URL
wrangler secret put NEXT_PUBLIC_SUPABASE_ANON_KEY
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
```

---

## Phase 5: デプロイ・検証

### 5.1 Cloudflare Pagesプロジェクト作成
1. Cloudflareダッシュボードで新規Pagesプロジェクト作成
2. GitHubリポジトリ連携
3. ビルド設定: `npx @cloudflare/next-on-pages`

### 5.2 検証項目
- [ ] ログイン・ログアウト動作
- [ ] OAuth認証（Google）
- [ ] 画像アップロード（プロフィール、練習、大会）
- [ ] 画像表示
- [ ] チーム参加・承認フロー
- [ ] Google Calendar連携

---

## 修正ファイル一覧

### 新規作成
| ファイル | 内容 |
|----------|------|
| `apps/web/lib/r2.ts` | R2クライアント・ユーティリティ |
| `apps/web/lib/image-url.ts` | 画像URL取得（フォールバック対応） |
| `apps/web/lib/image-loader.ts` | next/image用カスタムloader |
| `apps/web/wrangler.toml` | Cloudflare Pages設定 |
| `scripts/migrate-storage-to-r2.ts` | Storage移行スクリプト |

### 修正
| ファイル | 変更内容 |
|----------|----------|
| `apps/shared/api/practices.ts` | **メイン修正**: upload/remove/getPublicUrl を R2 に変更 |
| `apps/shared/api/competitions.ts` | **メイン修正**: upload/remove/getPublicUrl を R2 に変更 |
| `apps/web/lib/data-loaders/common.ts` | `unstable_cache` 削除 |
| `apps/web/app/(authenticated)/dashboard/_server/MetadataLoader.tsx` | `unstable_cache` 削除 |
| `apps/web/components/profile/AvatarUpload.tsx` | R2アップロードに変更 |
| `apps/web/app/(authenticated)/dashboard/_components/DayDetailModal.tsx` | 画像URL生成をR2形式に |
| `apps/web/app/(authenticated)/dashboard/_hooks/useCalendarHandlers.ts` | 画像URL生成をR2形式に |
| `apps/web/app/(authenticated)/dashboard/_hooks/useDashboardHandlers.ts` | 上記APIの呼び出しに影響 |
| `apps/web/app/(authenticated)/teams/_actions/actions.ts` | `revalidatePath` 削除 |
| `apps/web/next.config.js` | Cloudflare Pages対応 + image loader設定 + R2 remotePatterns追加 |
| `apps/web/package.json` | ビルドスクリプト追加 |
| `apps/web/middleware.ts` | Edge Runtime互換性確認・修正（必要に応じて） |

### 確認が必要
| ファイル | 確認内容 |
|----------|----------|
| `apps/web/app/api/**/*.ts` | Edge Runtime互換性 |
| `next/image`使用箇所全て | loader対応 |
| Server Actions全て | Edge Runtime互換性 |

---

## 検証方法

1. **ローカル検証**
   ```bash
   npm run build:cloudflare
   npm run preview
   ```

2. **ステージング環境**
   - Cloudflare Pagesのプレビューデプロイで検証

3. **本番移行**
   - DNSをCloudflare Pagesに切り替え
   - 旧Vercel環境は一定期間並行稼働

---

## リスクと回避策

| リスク | 影響度 | 回避策 |
|--------|--------|--------|
| Server ActionsがEdge非互換 | 高 | Phase 0で事前確認、必要に応じてAPI Routeに変更 |
| `next/image`が動作しない | 中 | `unoptimized: true` で最小対応可能 |
| 移行中の画像表示エラー | 中 | フォールバック実装で両方から読み取り |
| ビルドエラー | 高 | ローカルで `npm run build:cloudflare` を十分にテスト |
| 認証フローの問題 | 高 | ステージング環境で十分に検証 |

---

## 注意事項

- Supabase Storageの既存画像はR2への移行スクリプトで対応
- 移行期間中は両方のStorageから画像を読み取れるようフォールバック実装済み（`lib/image-url.ts`）
- Google Calendar連携のRPC関数はSupabaseで引き続き動作
- **移行完了後**: フォールバックコードを削除し、R2のみに統一
- **ロールバック計画**: DNSをVercelに戻すだけで即座にロールバック可能（並行稼働期間中）

---

## 環境変数一覧（最終）

### Cloudflare Pages に設定
```
# Supabase（既存）
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Google OAuth（既存）
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# R2（新規）
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=swim-hub-images
R2_PUBLIC_URL=https://images.your-domain.com  # カスタムドメイン推奨

# 公開用
NEXT_PUBLIC_R2_PUBLIC_URL=https://images.your-domain.com
```
