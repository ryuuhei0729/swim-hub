# 環境変数設定ガイド

## 🔧 ローカル開発環境の設定

### 1. 環境変数ファイルの作成

`apps/web/.env.local` ファイルを作成してください：

```bash
# 開発環境用設定 (swimmer-dev プロジェクト)
NEXT_PUBLIC_SUPABASE_URL=https://your-dev-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-dev-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-dev-service-role-key

# GraphQL エンドポイント (自動生成されるため通常は不要)
# NEXT_PUBLIC_GRAPHQL_ENDPOINT=${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/graphql

# アプリケーション設定
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ENVIRONMENT=development

# その他の開発用設定
NODE_ENV=development
```

### 2. Supabase設定の取得方法

1. [Supabaseダッシュボード](https://supabase.com/dashboard)にログイン
2. `swimmer-dev` プロジェクトを選択
3. Settings → API で以下を確認：
   - **Project URL**: `NEXT_PUBLIC_SUPABASE_URL` に設定
   - **anon/public key**: `NEXT_PUBLIC_SUPABASE_ANON_KEY` に設定
   - **service_role key**: `SUPABASE_SERVICE_ROLE_KEY` に設定

## 🌐 Vercel環境変数の設定

### ステージング環境 (Preview)

Vercelダッシュボード → Settings → Environment Variables で以下を設定：

| 変数名 | 値 | 環境 |
|--------|----|----- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://your-dev-project-id.supabase.co` | Preview |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `your-dev-anon-key` | Preview |
| `SUPABASE_SERVICE_ROLE_KEY` | `your-dev-service-role-key` | Preview |
| `NEXT_PUBLIC_ENVIRONMENT` | `staging` | Preview |

### 本番環境 (Production)

| 変数名 | 値 | 環境 |
|--------|----|----- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://your-prod-project-id.supabase.co` | Production |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `your-prod-anon-key` | Production |
| `SUPABASE_SERVICE_ROLE_KEY` | `your-prod-service-role-key` | Production |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` | Production |
| `NEXT_PUBLIC_ENVIRONMENT` | `production` | Production |

## 🔍 環境判定の仕組み

アプリケーションは以下の優先順位で環境を判定します：

1. **Vercel環境変数** (`VERCEL_ENV`)
   - `production` → 本番環境
   - `preview` → ステージング環境

2. **明示的な環境指定** (`NEXT_PUBLIC_ENVIRONMENT`)
   - `production` → 本番環境
   - `staging` → ステージング環境

3. **Node.js環境変数** (`NODE_ENV`)
   - `production` → 本番環境

4. **デフォルト** → 開発環境

## 📋 環境別の特徴

### 開発環境 (Development)
- **Supabaseプロジェクト**: `swimmer-dev`
- **デバッグログ**: 有効
- **ストレージキー**: `swimhub-auth-development`

### ステージング環境 (Staging)
- **Supabaseプロジェクト**: `swimmer-dev` (開発用DBを共有)
- **デバッグログ**: 有効
- **ストレージキー**: `swimhub-auth-staging`
- **用途**: 本番リリース前のテスト

### 本番環境 (Production)
- **Supabaseプロジェクト**: `swimmer-prod` (専用DB)
- **デバッグログ**: 無効
- **ストレージキー**: `swimhub-auth-production`
- **用途**: 実際のユーザー向けサービス

## ⚠️ 重要な注意事項

1. **環境変数の管理**
   - `.env.local` ファイルは `.gitignore` に含まれています
   - 本番用の環境変数は絶対にコミットしないでください

2. **データベースの分離**
   - ステージング環境は開発用DB (`swimmer-dev`) を使用
   - 本番環境は専用DB (`swimmer-prod`) を使用
   - この設計により、テストデータが本番環境を汚染することを防ぎます

3. **セキュリティ**
   - `SERVICE_ROLE_KEY` は管理者権限を持つため慎重に管理してください
   - 本番環境のキーは必要最小限の人員のみがアクセスできるようにしてください

## 🚀 開発開始手順

1. このファイルに従って `.env.local` を作成
2. Supabaseプロジェクトから必要なキーを取得して設定
3. `npm run dev` でローカル開発サーバーを起動
4. ブラウザコンソールで環境情報を確認：
   ```
   🏊 SwimHub - 開発環境 (swimmer-dev)
   🚀 GraphQL Endpoint: https://your-dev-project-id.supabase.co/functions/v1/graphql
   ```

## 🔧 トラブルシューティング

### 環境変数が読み込まれない
- `.env.local` ファイルの場所を確認 (`apps/web/.env.local`)
- 変数名にタイポがないか確認
- Next.jsを再起動してください

### Supabase接続エラー
- プロジェクトURLとキーが正しいか確認
- Supabaseプロジェクトが有効か確認
- ネットワーク接続を確認

### GraphQL接続エラー
- Edge Functions がデプロイされているか確認
- GraphQLエンドポイントが正しいか確認
- Supabase Functions のログを確認
