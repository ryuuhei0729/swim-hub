---
title: "VercelからCloudflare Workers + OpenNextへ移行した話"
emoji: "☁️"
type: "tech"
topics: ["nextjs", "cloudflare", "workers", "opennext", "vercel"]
published: false
---

## はじめに

個人開発で運用している Next.js アプリを **Vercel から Cloudflare Workers** へ移行しました。この記事では、移行の背景から具体的な手順、ハマったポイントまでを紹介します。

### 移行の構成

| 項目 | 移行前 | 移行後 |
|------|--------|--------|
| ホスティング | Vercel | Cloudflare Workers |
| 画像ストレージ | Supabase Storage | Cloudflare R2 |
| データベース | Supabase (PostgreSQL) | そのまま維持 |
| 認証 | Supabase Auth | そのまま維持 |

## なぜ移行したのか

### 1. コスト面

Vercel の無料枠は個人開発には十分ですが、Cloudflare Workers の無料枠はさらに魅力的です。

- **1日10万リクエスト**まで無料
- **静的アセットはリクエストにカウントされない**
- R2 も月10GBまで無料

### 2. 技術的な興味

OpenNext というプロジェクトが成熟してきて、Next.js を Vercel 以外でも本番運用できるようになりました。エッジコンピューティングの知見を深めたかったのも理由の一つです。

## OpenNext とは

[OpenNext](https://opennext.js.org/) は、Next.js アプリを AWS Lambda や Cloudflare Workers など、Vercel 以外の環境で動かすためのアダプターです。

Cloudflare には以前 `next-on-pages` というツールがありましたが、現在は **OpenNext が公式推奨**となっています。

| 項目 | next-on-pages | OpenNext |
|------|---------------|----------|
| Next.js 対応 | 14まで | **15.1.x 対応** |
| Runtime | Edge Runtime のみ | **Node.js Runtime** |
| 公式推奨 | 非推奨化の方向 | ✅ 推奨 |

## 移行手順

### 1. パッケージのインストール

```bash
npm install @opennextjs/cloudflare wrangler --save-dev
```

### 2. wrangler.jsonc の作成

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "your-app-name",
  "compatibility_date": "2025-04-01",
  "compatibility_flags": ["nodejs_compat"],
  "main": ".open-next/worker.js",
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  }
}
```

:::message
`compatibility_date` は `2025-04-01` 以降を指定してください。これより前だと `process.env` が正しく動作しません。
:::

### 3. open-next.config.ts の作成

```typescript
import type { OpenNextConfig } from "@opennextjs/cloudflare";

const config: OpenNextConfig = {
  default: {
    override: {
      wrapper: "cloudflare-node",
      converter: "edge",
      proxyExternalRequest: "fetch",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "dummy",
    },
  },
  edgeExternals: ["node:crypto"],
  middleware: {
    external: true,
    override: {
      wrapper: "cloudflare-edge",
      converter: "edge",
      proxyExternalRequest: "fetch",
    },
  },
};

export default config;
```

### 4. package.json にスクリプト追加

```json
{
  "scripts": {
    "preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
    "deploy": "opennextjs-cloudflare build && opennextjs-cloudflare deploy"
  }
}
```

### 5. デプロイ

```bash
npm run deploy
```

これだけで基本的なデプロイは完了です。

## ハマったポイント

### 1. Next.js のバージョン制限

**Next.js 15.2 以降は要注意です。**

15.2 から導入された Node.js Middleware（`proxy.ts`）は OpenNext で未サポートです。私は **Next.js 15.1.11** にダウングレードして対応しました。

```bash
npm install next@15.1.11
```

### 2. Middleware は Edge Runtime で

Middleware は従来の Edge Runtime（`middleware.ts`）を使用する必要があります。

```typescript
// middleware.ts
export const runtime = 'experimental-edge'

export async function middleware(request: NextRequest) {
  // ...
}
```

### 3. `unstable_cache` は使えない

Vercel 固有の `unstable_cache` は動作しません。シンプルに直接データを取得する形に変更しました。

```typescript
// Before
export async function getCachedData() {
  return unstable_cache(async () => {
    // fetch data
  })()
}

// After
export async function getData() {
  // fetch data directly
}
```

### 4. `next/image` の最適化

Cloudflare Workers では Vercel の画像最適化機能が使えないため、`unoptimized: true` を設定します。

```javascript
// next.config.js
module.exports = {
  images: {
    unoptimized: true,
  },
}
```

画像最適化が必要な場合は Cloudflare Images（有料）を検討してください。

## Supabase Storage から R2 への移行

画像ストレージも Cloudflare R2 へ移行しました。R2 は S3 互換の API を持っているため、AWS SDK がそのまま使えます。

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})
```

### フォールバック実装

移行期間中は、R2 にファイルがなければ Supabase Storage から取得するフォールバックを実装しておくと安心です。

```typescript
export function getImageUrl(path: string, bucket: string): string {
  if (process.env.R2_PUBLIC_URL) {
    return `${process.env.R2_PUBLIC_URL}/${bucket}/${path}`
  }
  // フォールバック
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
}
```

## 環境変数の設定

シークレットは Wrangler CLI で設定します。

```bash
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put R2_ACCESS_KEY_ID
# ...
```

## Workers の制限

無料プランでは以下の制限があります。

| 項目 | 無料 | 有料 |
|------|------|------|
| Worker サイズ | 3 MiB | 10 MiB |
| リクエスト/日 | 100,000 | 無制限 |
| CPU時間/リクエスト | 10ms | 30s |

個人開発であれば無料枠で十分でしょう。

## 移行してみて

### 良かった点

- **コスト削減**: 静的アセットがカウントされないのは大きい
- **パフォーマンス**: エッジで動作するため、体感速度も良好
- **学習**: Cloudflare のエコシステムを理解できた

### 気になる点

- **Next.js の最新機能への追従**: OpenNext のサポート待ちになる場合がある
- **デバッグ**: Vercel の開発者体験と比べると少し手間

## まとめ

Vercel から Cloudflare Workers + OpenNext への移行は、思ったよりスムーズでした。いくつかハマりポイントはありますが、ドキュメントも充実してきています。

コストを抑えつつ、エッジコンピューティングを試してみたい方にはおすすめです。

## 参考リンク

- [OpenNext Cloudflare 公式ドキュメント](https://opennext.js.org/cloudflare)
- [Cloudflare Workers Next.js ガイド](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [Cloudflare Blog: OpenNext アダプター](https://blog.cloudflare.com/deploying-nextjs-apps-to-cloudflare-workers-with-the-opennext-adapter/)
