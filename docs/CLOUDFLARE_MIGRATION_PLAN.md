# Cloudflare移行計画

## 概要
- **移行元**: Vercel + Supabase Storage
- **移行先**: Cloudflare Pages + Cloudflare R2
- **維持**: Supabase Database（PostgreSQL）、認証、RLS、RPC関数

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
Cloudflareダッシュボードで以下のバケットを作成:
- `swim-hub-profile-images`
- `swim-hub-practice-images`
- `swim-hub-competition-images`

### 1.2 R2用ユーティリティ作成

**新規ファイル**: `apps/web/lib/r2.ts`
```typescript
// R2クライアント設定
// 環境変数: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
```

### 1.3 修正対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `apps/web/components/profile/AvatarUpload.tsx` | Supabase Storage → R2 API |
| `apps/web/app/(authenticated)/dashboard/_components/DayDetailModal.tsx` | 画像URL生成をR2形式に |
| `apps/web/app/(authenticated)/dashboard/_hooks/useCalendarHandlers.ts` | 画像URL生成をR2形式に |

### 1.4 データ移行
既存のSupabase Storageから画像をR2へ移行するスクリプト作成

---

## Phase 2: キャッシュ戦略の簡略化

### 2.1 `unstable_cache` の削除

**修正ファイル**: `apps/web/lib/data-loaders/common.ts`
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

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cloudflare Pages用の設定
  output: 'standalone', // 削除または調整
  // ...既存設定
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

| ファイル | 変更種別 |
|----------|----------|
| `apps/web/lib/r2.ts` | 新規作成 |
| `apps/web/lib/data-loaders/common.ts` | 修正 |
| `apps/web/components/profile/AvatarUpload.tsx` | 修正 |
| `apps/web/app/(authenticated)/dashboard/_components/DayDetailModal.tsx` | 修正 |
| `apps/web/app/(authenticated)/dashboard/_hooks/useCalendarHandlers.ts` | 修正 |
| `apps/web/app/(authenticated)/teams/_actions/actions.ts` | 修正 |
| `apps/web/next.config.js` | 修正 |
| `apps/web/wrangler.toml` | 新規作成 |
| `apps/web/package.json` | 修正 |

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

## 注意事項

- Supabase Storageの既存画像はR2への移行スクリプトで対応
- 移行期間中は両方のStorageから画像を読み取れるようフォールバック実装を検討
- Google Calendar連携のRPC関数はSupabaseで引き続き動作
