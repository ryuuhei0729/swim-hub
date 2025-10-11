# デプロイメント設定ガイド

## CI/CD概要

このプロジェクトは、以下の自動デプロイメント戦略を使用しています：

- **mainブランチ**: Vercel Production環境への自動デプロイ
- **developブランチ**: Vercel Preview環境（開発用）への自動デプロイ
- **プルリクエスト**: Vercel Preview環境でのプレビューデプロイ

## 必要な設定

### 1. GitHub Secretsの設定

以下のシークレットをGitHubリポジトリの Settings > Secrets and variables > Actions で設定してください：

```
VERCEL_TOKEN=your_vercel_token_here
VERCEL_ORG_ID=your_vercel_org_id_here
VERCEL_PROJECT_ID=your_vercel_project_id_here
```

### 2. Vercelトークンの取得

1. [Vercel Dashboard](https://vercel.com/dashboard) にログイン
2. Settings > Tokens でアクセストークンを作成
3. 作成したトークンを `VERCEL_TOKEN` として設定

### 3. Organization IDとProject IDの取得

1. Vercel CLIをインストール: `npm i -g vercel`
2. プロジェクトディレクトリで `vercel link` を実行
3. `.vercel/project.json` ファイルから `orgId` と `projectId` を確認

### 4. 環境変数の設定

#### Vercel Dashboardでの設定手順

1. [Vercel Dashboard](https://vercel.com/dashboard) にログイン
2. プロジェクトを選択
3. **Settings** タブをクリック
4. 左サイドバーから **Environment Variables** を選択
5. **Add New** ボタンをクリック

#### 設定する環境変数

以下の環境変数を設定します。各環境変数について、**Environment** で適用する環境を選択してください：

##### ① NEXT_PUBLIC_SUPABASE_URL
**Production環境用（mainブランチ）**:
- **Name**: `NEXT_PUBLIC_SUPABASE_URL`
- **Value**: `https://your-prod-project-id.supabase.co` (本番用SupabaseプロジェクトのURL)
- **Environment**: ✅ **Production** のみ

**Development環境用（developブランチ・PR）**:
- **Name**: `NEXT_PUBLIC_SUPABASE_URL`
- **Value**: `https://your-dev-project-id.supabase.co` (開発用SupabaseプロジェクトのURL)
- **Environment**: ✅ **Preview** と ✅ **Development**

**取得方法**: 各Supabase Dashboard > Settings > API > Project URL

##### ② NEXT_PUBLIC_SUPABASE_ANON_KEY
**Production環境用（mainブランチ）**:
- **Name**: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Value**: `eyJhbGciOiJIUzI1NiIs...` (本番用Supabaseの匿名キー)
- **Environment**: ✅ **Production** のみ

**Development環境用（developブランチ・PR）**:
- **Name**: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Value**: `eyJhbGciOiJIUzI1NiIs...` (開発用Supabaseの匿名キー)
- **Environment**: ✅ **Preview** と ✅ **Development**

**取得方法**: 各Supabase Dashboard > Settings > API > Project API keys > `anon` `public`

##### ③ SUPABASE_SERVICE_ROLE_KEY
**Production環境用（mainブランチ）**:
- **Name**: `SUPABASE_SERVICE_ROLE_KEY`
- **Value**: `eyJhbGciOiJIUzI1NiIs...` (本番用Supabaseのサービスロールキー)
- **Environment**: ✅ **Production** のみ

**Development環境用（developブランチ・PR）**:
- **Name**: `SUPABASE_SERVICE_ROLE_KEY`
- **Value**: `eyJhbGciOiJIUzI1NiIs...` (開発用Supabaseのサービスロールキー)
- **Environment**: ✅ **Preview** と ✅ **Development**

**取得方法**: 各Supabase Dashboard > Settings > API > Project API keys > `service_role` `secret`

⚠️ **注意**: サービスロールキーは管理者権限を持つため、絶対に公開しないでください

##### ④ NEXT_PUBLIC_ENVIRONMENT
- **Name**: `NEXT_PUBLIC_ENVIRONMENT`
- **Value**: 
  - Production環境: `production`
  - Preview環境: `development`
- **Environment**:
  - Production環境の場合: ✅ **Production** のみ
  - Preview環境の場合: ✅ **Preview** のみ

#### 実際の設定手順（プロジェクト分離版）

Vercel Dashboardで **Add New** を**6回**クリックして、以下を設定します：

**1回目**: Production用 SUPABASE_URL
```
Name: NEXT_PUBLIC_SUPABASE_URL
Value: https://your-prod-project-id.supabase.co
Environment: ✅ Production のみ
```

**2回目**: Development用 SUPABASE_URL  
```
Name: NEXT_PUBLIC_SUPABASE_URL
Value: https://your-dev-project-id.supabase.co
Environment: ✅ Preview ✅ Development
```

**3回目**: Production用 ANON_KEY
```
Name: NEXT_PUBLIC_SUPABASE_ANON_KEY
Value: (本番用Supabaseの匿名キー)
Environment: ✅ Production のみ
```

**4回目**: Development用 ANON_KEY
```
Name: NEXT_PUBLIC_SUPABASE_ANON_KEY  
Value: (開発用Supabaseの匿名キー)
Environment: ✅ Preview ✅ Development
```

**5回目**: Production用 SERVICE_ROLE_KEY
```
Name: SUPABASE_SERVICE_ROLE_KEY
Value: (本番用Supabaseのサービスロールキー)
Environment: ✅ Production のみ
```

**6回目**: Development用 SERVICE_ROLE_KEY
```
Name: SUPABASE_SERVICE_ROLE_KEY
Value: (開発用Supabaseのサービスロールキー)  
Environment: ✅ Preview ✅ Development
```

**7回目**: Production用 ENVIRONMENT
```
Name: NEXT_PUBLIC_ENVIRONMENT
Value: production
Environment: ✅ Production のみ
```

**8回目**: Preview用 ENVIRONMENT
```
Name: NEXT_PUBLIC_ENVIRONMENT
Value: preview
Environment: ✅ Preview のみ
```

#### 環境別設定例

**Production環境（mainブランチ）**:
```
NEXT_PUBLIC_SUPABASE_URL=https://prod-abc123.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...(本番用)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...(本番用)
NEXT_PUBLIC_ENVIRONMENT=production
```

**Preview環境（developブランチ・PR）**:
```
NEXT_PUBLIC_SUPABASE_URL=https://dev-xyz789.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...(開発用)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...(開発用)
NEXT_PUBLIC_ENVIRONMENT=preview
```

#### 設定のポイント

1. **同じ環境変数名を複数回設定**: 環境ごとに異なる値を設定
2. **プロジェクト分離**: 本番と開発で完全に分離されたSupabaseプロジェクトを使用
3. **データの安全性**: 本番データが開発環境で影響を受けることがない
4. **Environment選択**: 必ず適切な環境を選択してください

## デプロイフロー

### Production デプロイ
```bash
git checkout main
git merge develop  # または直接mainにコミット
git push origin main
```

### Development デプロイ
```bash
git checkout develop
# 変更をコミット
git push origin develop
```

### プレビューデプロイ
プルリクエストを作成すると自動的にプレビューデプロイが作成されます。

## ファイル構成

- `.github/workflows/deploy.yml`: GitHub Actionsワークフロー
- `apps/web/vercel.json`: Vercel設定ファイル
- このファイル: デプロイメントガイド

## トラブルシューティング

### デプロイが失敗する場合

1. GitHub Secretsが正しく設定されているか確認
2. Vercel プロジェクトが正しくリンクされているか確認
3. 環境変数がVercel Dashboardで設定されているか確認
4. ビルドエラーがないか確認（ローカルで `npm run build` を実行）

### 環境変数が反映されない場合

1. Vercel Dashboardで環境変数を再確認
2. デプロイを手動で再実行
3. キャッシュをクリアしてから再デプロイ
