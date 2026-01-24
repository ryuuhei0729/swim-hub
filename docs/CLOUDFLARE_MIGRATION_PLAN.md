# Cloudflare移行計画（Workers + OpenNext）

## 概要
- **移行元**: Vercel + Supabase Storage
- **移行先**: Cloudflare Workers + OpenNext + Cloudflare R2
- **維持**: Supabase Database（PostgreSQL）、認証、RLS、RPC関数

---

## なぜ Workers + OpenNext なのか？

| 項目 | Pages + next-on-pages | Workers + OpenNext |
|------|----------------------|-------------------|
| Next.js 対応 | **14まで** | **14, 15, 16 対応** |
| Runtime | Edge Runtime のみ | **Node.js Runtime** |
| Node.js API | 制限あり | より多くのAPIが利用可能 |
| 公式推奨 | 非推奨化の方向 | **推奨** |
| 静的アセット | リクエストにカウント | **カウントされない** |
| 無料枠 | - | 1日10万リクエスト |

> **重要**: 本プロジェクトは Next.js 16.1.0 を使用しているため、`@cloudflare/next-on-pages` は使用できません。

---

## Phase 0: 環境準備

### 0.1 パッケージインストール

```bash
cd apps/web
npm install @opennextjs/cloudflare wrangler --save-dev
```

### 0.2 wrangler.jsonc 作成

**新規ファイル**: `apps/web/wrangler.jsonc`
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "swim-hub",
  // ⚠️ 重要: 2025-04-01 以降を指定（process.env が正しく動作するため）
  "compatibility_date": "2025-04-01",
  "compatibility_flags": ["nodejs_compat"],

  // OpenNext がビルド時に生成するファイル（変更不要）
  "main": ".open-next/worker.js",
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },

  // 環境変数（シークレットは wrangler secret で設定）
  "vars": {
    "NEXT_PUBLIC_ENVIRONMENT": "production"
  },

  // R2 バケット（画像ストレージ）
  // 開発: swim-hub-images-dev / 本番: swim-hub-images-prod
  "r2_buckets": [
    {
      "binding": "R2_BUCKET",
      "bucket_name": "swim-hub-images-prod"  // 開発時は swim-hub-images-dev に変更
    }
  ],

  // ISR/データキャッシュ用（オプション）
  "kv_namespaces": [
    {
      "binding": "NEXT_CACHE_KV",
      "id": "<KV_NAMESPACE_ID>"
    }
  ]
}
```

### 0.3 open-next.config.ts 作成（オプション）

カスタム設定が必要な場合のみ作成：

**新規ファイル**: `apps/web/open-next.config.ts`
```typescript
import type { OpenNextConfig } from "@opennextjs/cloudflare";

const config: OpenNextConfig = {
  // デフォルト設定で十分な場合は空でOK
};

export default config;
```

### 0.4 package.json スクリプト追加

**修正ファイル**: `apps/web/package.json`
```json
{
  "scripts": {
    "build": "next build",
    "dev": "next dev",
    "preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
    "deploy": "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
    "deploy:preview": "opennextjs-cloudflare build && opennextjs-cloudflare upload"
  }
}
```

### 0.5 .gitignore 追加

```
# OpenNext
.open-next/
```

---

## Phase 1: 互換性確認・修正

### 1.1 Runtime 設定の削除

OpenNext では **Node.js Runtime** がデフォルトです。
既存の `export const runtime = 'edge'` があれば削除または確認：

```bash
# Edge Runtime 指定の検索
grep -r "runtime.*=.*edge" apps/web --include="*.ts" --include="*.tsx"
```

### 1.2 Server Actions の確認

OpenNext は Node.js Runtime を使用するため、`@cloudflare/next-on-pages` より多くのNode.js APIが利用可能です。
ただし、以下は確認が必要：

```bash
# Server Actions の検索
grep -r "use server" apps/web/app --include="*.ts" --include="*.tsx"
```

**確認観点**:
- `fs` モジュール（ファイルシステム）→ 使用不可、R2/KVを使用
- `crypto` モジュール → 多くは利用可能
- 外部ライブラリの互換性

### 1.3 Middleware の確認

`apps/web/middleware.ts` が Workers 環境で動作するか確認。
Supabase Auth の middleware は通常問題なく動作します。

### 1.4 API Routes の確認

`apps/web/app/api/` 配下のルートを確認。
Node.js Runtime で動作するため、Edge 制限は緩和されています。

---

## Phase 2: Cloudflare R2 への Storage 移行

### 2.1 R2バケット作成

Cloudflareダッシュボードで作成済み：

```
swim-hub-images-dev   ← 開発用
swim-hub-images-prod  ← 本番用
```

各バケット内のフォルダ構造：
```
├── profiles/      # プロフィール画像
├── practices/     # 練習記録画像
└── competitions/  # 大会記録画像
```

### 2.2 R2クライアント実装

**新規ファイル**: `apps/web/lib/r2.ts`
```typescript
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

const BUCKET_NAME = process.env.R2_BUCKET_NAME!
const PUBLIC_URL = process.env.R2_PUBLIC_URL!

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

### 2.3 必要なパッケージ

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

### 2.4 フォールバック実装（移行期間中）

**新規ファイル**: `apps/web/lib/image-url.ts`
```typescript
const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL
const SUPABASE_STORAGE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public`

export function getImageUrl(
  path: string | null,
  bucket: 'profiles' | 'practices' | 'competitions'
): string | null {
  if (!path) return null

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }

  // R2優先
  if (R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL}/${bucket}/${path}`
  }

  // フォールバック: Supabase Storage
  return `${SUPABASE_STORAGE_URL}/${bucket}/${path}`
}
```

### 2.5 修正対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `apps/shared/api/practices.ts` | upload/remove/getPublicUrl を R2 に変更 |
| `apps/shared/api/competitions.ts` | upload/remove/getPublicUrl を R2 に変更 |
| `apps/web/components/profile/AvatarUpload.tsx` | R2アップロードに変更 |

---

## Phase 3: キャッシュ戦略の調整

### 3.1 `unstable_cache` の対応

OpenNext は ISR/キャッシュをサポートしています。
KV Namespace を設定すれば `unstable_cache` も動作する可能性がありますが、
シンプルにするため削除を推奨：

**修正ファイル**:
- `apps/web/lib/data-loaders/common.ts`
- `apps/web/app/(authenticated)/dashboard/_server/MetadataLoader.tsx`

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

### 3.2 `revalidatePath` の対応

OpenNext は `revalidatePath` をサポートしています。
動作確認後、問題があれば `router.refresh()` に置き換え。

---

## Phase 4: `next/image` の対応

### 4.1 選択肢

| 方法 | メリット | デメリット |
|------|----------|------------|
| **`unoptimized: true`** | 設定が簡単 | 画像最適化なし |
| **Cloudflare Images** | 高品質な最適化 | 月額$5〜 |
| **カスタムloader** | 柔軟性が高い | 実装コスト |

### 4.2 推奨: `unoptimized: true`（初期対応）

**修正ファイル**: `apps/web/next.config.js`
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      // 既存のSupabase設定
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      // R2
      {
        protocol: 'https',
        hostname: '*.r2.dev',
      },
      // カスタムドメイン（設定時）
      {
        protocol: 'https',
        hostname: 'images.your-domain.com',
      },
    ],
  },
}
```

---

## Phase 5: 環境変数の設定

### 5.1 Cloudflare ダッシュボードで設定

Workers & Pages → 設定 → 環境変数

### 5.2 シークレットは CLI で設定

```bash
cd apps/web

# Supabase
wrangler secret put NEXT_PUBLIC_SUPABASE_URL
wrangler secret put NEXT_PUBLIC_SUPABASE_ANON_KEY
wrangler secret put SUPABASE_SERVICE_ROLE_KEY

# Google OAuth
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET

# R2
wrangler secret put R2_ACCOUNT_ID
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
wrangler secret put R2_BUCKET_NAME
wrangler secret put R2_PUBLIC_URL

# 公開用
wrangler secret put NEXT_PUBLIC_R2_PUBLIC_URL
```

---

## Phase 6: デプロイ・検証

### 6.1 ローカルプレビュー

```bash
cd apps/web
npm run preview
```

### 6.2 プレビューデプロイ

```bash
npm run deploy:preview
```

### 6.3 本番デプロイ

```bash
npm run deploy
```

### 6.4 検証項目

- [ ] ログイン・ログアウト動作
- [ ] OAuth認証（Google）
- [ ] 画像アップロード（プロフィール、練習、大会）
- [ ] 画像表示
- [ ] Server Actions の動作
- [ ] チーム参加・承認フロー
- [ ] Google Calendar連携

---

## ファイル一覧

### 新規作成
| ファイル | 内容 |
|----------|------|
| `apps/web/wrangler.jsonc` | Cloudflare Workers 設定 |
| `apps/web/open-next.config.ts` | OpenNext 設定（オプション） |
| `apps/web/lib/r2.ts` | R2クライアント |
| `apps/web/lib/image-url.ts` | 画像URL取得（フォールバック対応） |
| `scripts/migrate-storage-to-r2.ts` | Storage移行スクリプト |

### 修正
| ファイル | 変更内容 |
|----------|----------|
| `apps/web/package.json` | OpenNext スクリプト追加 |
| `apps/web/next.config.js` | images 設定 |
| `apps/web/.gitignore` | `.open-next/` 追加 |
| `apps/shared/api/practices.ts` | R2対応 |
| `apps/shared/api/competitions.ts` | R2対応 |
| `apps/web/components/profile/AvatarUpload.tsx` | R2対応 |
| `apps/web/lib/data-loaders/common.ts` | `unstable_cache` 削除 |

---

## 制限事項・注意点

### Workers の制限
| 項目 | Free | Paid |
|------|------|------|
| Worker サイズ | 3 MiB | 10 MiB |
| リクエスト/日 | 100,000 | 無制限 |
| CPU時間/リクエスト | 10ms | 30s |

### 既知の問題
- Next.js 15.3+ で instrumentation hook エラーが発生する場合あり（[GitHub #667](https://github.com/opennextjs/opennextjs-cloudflare/issues/667)）
- 本プロジェクトは Next.js 16.1.0 のため、動作確認必須

### Wrangler バージョン
- **3.99.0 以上** が必須

---

## ロールバック計画

1. **DNS切り替え前**: Vercel へのデプロイを継続
2. **問題発生時**: DNS を Vercel に戻すだけで即座にロールバック可能
3. **移行完了後**: Vercel プロジェクトを一定期間保持

---

## 参考リンク

- [OpenNext Cloudflare 公式ドキュメント](https://opennext.js.org/cloudflare)
- [Cloudflare Workers Next.js ガイド](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [OpenNext GitHub](https://github.com/opennextjs/opennextjs-cloudflare)
- [Cloudflare Blog: OpenNext アダプター](https://blog.cloudflare.com/deploying-nextjs-apps-to-cloudflare-workers-with-the-opennext-adapter/)
