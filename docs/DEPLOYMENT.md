# 🚀 本番環境デプロイ手順

SwimHubを本番環境にデプロイするための完全な手順書です。

---

## 📋 デプロイ前チェックリスト

### 1. コードの準備
- [ ] すべての変更がコミットされている
- [ ] `main`ブランチにマージ済み（または`develop`ブランチからデプロイ）
- [ ] ビルドエラーがない（`npm run build:web`が成功する）
- [ ] 型エラーがない（`npm run type-check`が成功する）
- [ ] Lintエラーがない（`npm run lint:web`が成功する）
- [ ] E2Eテストが通る（`npm run test:e2e`が成功する）

### 2. データベースの準備
- [ ] Supabase本番プロジェクトが作成されている
- [ ] マイグレーションが適用されている
- [ ] RLSポリシーが正しく設定されている
- [ ] シードデータが必要な場合は投入済み

### 3. 環境変数の準備
- [ ] 本番用Supabase URLとAPIキーを取得済み
- [ ] 環境変数のリストを準備済み

---

## 🔧 Step 1: Supabase本番環境の準備

### 1.1 Supabase本番プロジェクトの作成

1. [Supabase Dashboard](https://app.supabase.com/)にログイン
2. 「New Project」をクリック
3. プロジェクト情報を入力：
   - **Name**: `swimmer-prod`（または任意の名前）
   - **Database Password**: 強力なパスワードを設定（必ず保存）
   - **Region**: 最適なリージョンを選択（例: `Northeast Asia (Tokyo)`）
   - **Pricing Plan**: 適切なプランを選択

4. プロジェクト作成完了を待つ（数分かかります）

### 1.2 データベースマイグレーションの適用

```bash
# Supabase CLIで本番環境に接続
supabase link --project-ref <your-project-ref>

# マイグレーションを適用
supabase db push
```

または、Supabase Dashboardから直接SQLを実行：

1. Supabase Dashboard → SQL Editor
2. `supabase/migrations/`配下のSQLファイルを順番に実行

### 1.3 RLSポリシーの確認

Supabase Dashboard → Authentication → Policies で以下を確認：

- [ ] `practices`テーブルのRLSが有効
- [ ] `competitions`テーブルのRLSが有効
- [ ] `records`テーブルのRLSが有効
- [ ] `teams`テーブルのRLSが有効
- [ ] その他すべてのテーブルでRLSが有効

### 1.4 本番環境の認証設定

Supabase Dashboard → Authentication → URL Configuration：

- **Site URL**: `https://your-app.vercel.app`（後で設定）
- **Redirect URLs**: 
  - `https://your-app.vercel.app/**`
  - `https://your-app.vercel.app/auth/callback`

---

## 🌐 Step 2: Vercelプロジェクトの準備

### 2.1 Vercelアカウントの準備

1. [Vercel](https://vercel.com/)にログイン（GitHubアカウントで連携推奨）
2. 必要に応じてプランを選択

### 2.2 プロジェクトのインポート

1. Vercel Dashboard → 「Add New...」→ 「Project」
2. GitHubリポジトリを選択
3. プロジェクト設定：
   - **Framework Preset**: Next.js
   - **Root Directory**: `apps/web`
   - **Build Command**: `cd ../.. && cd apps/web && npm run build`
   - **Install Command**: `cd ../.. && npm install --frozen-lockfile`
   - **Output Directory**: `.next`（デフォルト）

4. 「Deploy」をクリック（この時点では環境変数未設定のため失敗します）

---

## 🔐 Step 3: 環境変数の設定

### 3.1 Supabaseの認証情報を取得

Supabase Dashboard → Project Settings → API：

- **Project URL**: `https://xxxxx.supabase.co`
- **anon public key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **service_role key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`（⚠️ 秘密に保持）

### 3.2 Vercelに環境変数を設定

Vercel Dashboard → プロジェクト → Settings → Environment Variables：

以下の環境変数を追加：

#### 必須環境変数

| 環境変数名 | 値 | 環境 |
|----------|-----|------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxx.supabase.co` | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | Production, Preview, Development |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | Production, Preview（Developmentは任意） |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` | Production |
| `NEXT_PUBLIC_ENVIRONMENT` | `production` | Production |

#### オプション環境変数

| 環境変数名 | 値 | 説明 |
|----------|-----|------|
| `NEXT_PUBLIC_GRAPHQL_ENDPOINT` | `https://xxxxx.supabase.co/functions/v1/graphql` | GraphQL使用時のみ |

### 3.3 環境変数の設定方法

1. Vercel Dashboard → プロジェクト → Settings → Environment Variables
2. 「Add New」をクリック
3. 各環境変数を追加：
   - **Key**: 環境変数名
   - **Value**: 値
   - **Environment**: Production / Preview / Development を選択
4. 「Save」をクリック

**重要**: 
- `NEXT_PUBLIC_*` はクライアント側でも使用されるため、機密情報は含めない
- `SUPABASE_SERVICE_ROLE_KEY` はサーバー側のみで使用（Production, Previewのみ設定）

---

## 🚀 Step 4: デプロイの実行

### 4.1 自動デプロイ（推奨）

`vercel.json`の設定により、以下のブランチにpushすると自動デプロイされます：

- `main`ブランチ → Production環境
- `develop`ブランチ → Preview環境

```bash
# mainブランチにマージしてpush
git checkout main
git merge develop
git push origin main
```

### 4.2 手動デプロイ

Vercel Dashboard → プロジェクト → Deployments → 「Redeploy」

または、Vercel CLIを使用：

```bash
# Vercel CLIのインストール（初回のみ）
npm i -g vercel

# ログイン
vercel login

# デプロイ
cd apps/web
vercel --prod
```

---

## ✅ Step 5: デプロイ後の確認

### 5.1 ビルドログの確認

Vercel Dashboard → プロジェクト → Deployments → 最新のデプロイ → 「Build Logs」

以下を確認：
- [ ] ビルドが成功している
- [ ] エラーや警告がない
- [ ] 環境変数が正しく読み込まれている

### 5.2 アプリケーションの動作確認

1. **ホームページ**: `https://your-app.vercel.app`
   - [ ] ページが表示される
   - [ ] エラーがない

2. **認証機能**:
   - [ ] サインアップができる
   - [ ] ログインができる
   - [ ] ログアウトができる

3. **主要機能**:
   - [ ] ダッシュボードが表示される
   - [ ] 練習記録の追加ができる
   - [ ] 大会記録の追加ができる
   - [ ] チーム機能が動作する

### 5.3 Supabase認証設定の更新

デプロイが完了したら、Supabase Dashboardで認証URLを更新：

1. Supabase Dashboard → Authentication → URL Configuration
2. **Site URL**を更新: `https://your-app.vercel.app`
3. **Redirect URLs**に追加: `https://your-app.vercel.app/**`

### 5.4 パフォーマンス確認

- [ ] ページ読み込み速度が適切
- [ ] 画像が正しく表示される
- [ ] APIリクエストが正常に動作

---

## 🔄 Step 6: 継続的デプロイの設定

### 6.1 GitHub連携の確認

Vercel Dashboard → プロジェクト → Settings → Git：

- [ ] GitHubリポジトリが連携されている
- [ ] 自動デプロイが有効になっている

### 6.2 ブランチ戦略

- **`main`ブランチ**: 本番環境（Production）
- **`develop`ブランチ**: プレビュー環境（Preview）
- **その他のブランチ**: プレビュー環境（Preview）

### 6.3 プレビューデプロイの確認

プルリクエストを作成すると、自動的にプレビュー環境が作成されます：

1. 機能ブランチからPRを作成
2. Vercelが自動的にプレビュー環境をデプロイ
3. PRにプレビューURLがコメントされる
4. レビュー後に`main`にマージ

---

## 🐛 トラブルシューティング

### ビルドエラー

**問題**: ビルドが失敗する

**解決策**:
1. ビルドログを確認
2. ローカルで `npm run build:web` を実行してエラーを確認
3. 型エラー: `npm run type-check`
4. Lintエラー: `npm run lint:web`

### 環境変数エラー

**問題**: 環境変数が読み込まれない

**解決策**:
1. Vercel Dashboardで環境変数が正しく設定されているか確認
2. `NEXT_PUBLIC_*` プレフィックスが正しいか確認
3. 環境（Production/Preview/Development）が正しいか確認
4. デプロイを再実行（環境変数変更後は再デプロイが必要）

### 認証エラー

**問題**: ログインできない、リダイレクトエラー

**解決策**:
1. Supabase Dashboard → Authentication → URL Configuration を確認
2. Site URLとRedirect URLsが正しく設定されているか確認
3. Vercelの環境変数 `NEXT_PUBLIC_SUPABASE_URL` が正しいか確認

### データベース接続エラー

**問題**: データが取得できない

**解決策**:
1. Supabase Dashboardでプロジェクトがアクティブか確認
2. RLSポリシーが正しく設定されているか確認
3. 環境変数 `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` が正しいか確認

### パフォーマンス問題

**問題**: ページが遅い

**解決策**:
1. Vercel Dashboard → Analytics でパフォーマンスを確認
2. 画像最適化の設定を確認
3. 不要な依存関係を削除
4. コード分割を確認

---

## 📊 デプロイ後のモニタリング

### Vercel Analytics

Vercel Dashboard → Analytics で以下を確認：

- ページビュー
- パフォーマンスメトリクス
- エラー率
- ユーザー分布

### Supabase Monitoring

Supabase Dashboard → Project Settings → Monitoring で以下を確認：

- APIリクエスト数
- データベース接続数
- ストレージ使用量
- エラーログ

---

## 🔒 セキュリティチェックリスト

デプロイ前に以下を確認：

- [ ] 環境変数に機密情報が含まれていない（`NEXT_PUBLIC_*` は公開される）
- [ ] `SUPABASE_SERVICE_ROLE_KEY` はサーバー側のみで使用
- [ ] RLSポリシーがすべてのテーブルで有効
- [ ] 認証URLが正しく設定されている
- [ ] HTTPSが有効（Vercelは自動で有効）
- [ ] 不要な環境変数が削除されている

---

## 📝 デプロイ手順のまとめ

1. ✅ **Supabase本番環境の準備**
   - プロジェクト作成
   - マイグレーション適用
   - RLSポリシー確認

2. ✅ **Vercelプロジェクトの作成**
   - リポジトリ連携
   - プロジェクト設定

3. ✅ **環境変数の設定**
   - Supabase認証情報
   - アプリケーションURL

4. ✅ **デプロイの実行**
   - 自動デプロイ（推奨）
   - または手動デプロイ

5. ✅ **動作確認**
   - ビルドログ確認
   - アプリケーション動作確認
   - 認証設定更新

6. ✅ **継続的デプロイの設定**
   - GitHub連携確認
   - ブランチ戦略確認

---

## 🎉 デプロイ完了！

本番環境へのデプロイが完了しました。

**次のステップ**:
- ユーザーにアプリケーションを公開
- モニタリングを開始
- フィードバックを収集
- 継続的な改善

---

**最終更新**: 2025年1月15日  
**バージョン**: 1.0.0

