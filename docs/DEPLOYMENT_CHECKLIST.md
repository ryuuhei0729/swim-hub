# ✅ デプロイ前チェックリスト

本番環境にデプロイする前に、このチェックリストを確認してください。

---

## 📦 コードの準備

### Git管理
- [ ] すべての変更がコミットされている
- [ ] `.env.local` などの機密ファイルが `.gitignore` に含まれている
- [ ] 不要なファイルがコミットされていない

### ビルド確認
```bash
# ルートディレクトリで実行
cd apps/web
npm run build
```
- [ ] ビルドが成功する
- [ ] ビルドエラーがない
- [ ] ビルド警告がない（または許容範囲内）

### 型チェック
```bash
cd apps/web
npm run type-check
```
- [ ] 型エラーがない
- [ ] `any` 型の使用が最小限

### Lintチェック
```bash
cd apps/web
npm run lint:web
```
- [ ] Lintエラーがない
- [ ] コードフォーマットが統一されている

### テスト
```bash
# E2Eテスト（オプション、時間がかかる場合）
cd apps/web
npm run test:e2e
```
- [ ] E2Eテストが通る（または主要なテストが通る）

---

## 🗄️ データベースの準備

### Supabase本番プロジェクト
- [ ] 本番用Supabaseプロジェクトが作成されている
- [ ] プロジェクト名: `swimmer-prod`（または任意）
- [ ] リージョンが適切に選択されている

### マイグレーション
- [ ] すべてのマイグレーションファイルが適用されている
- [ ] `supabase/migrations/` 配下のSQLが実行済み
- [ ] マイグレーションエラーがない

### RLSポリシー
Supabase Dashboard → Authentication → Policies で確認：

- [ ] `users` テーブルのRLSが有効
- [ ] `practices` テーブルのRLSが有効
- [ ] `practice_logs` テーブルのRLSが有効
- [ ] `practice_times` テーブルのRLSが有効
- [ ] `competitions` テーブルのRLSが有効
- [ ] `records` テーブルのRLSが有効
- [ ] `split_times` テーブルのRLSが有効
- [ ] `teams` テーブルのRLSが有効
- [ ] `team_memberships` テーブルのRLSが有効
- [ ] `team_announcements` テーブルのRLSが有効
- [ ] `styles` テーブルのRLSが有効（読み取り専用）

### 認証設定
Supabase Dashboard → Authentication → URL Configuration：

- [ ] Site URLが設定されている（デプロイ後に更新）
- [ ] Redirect URLsが設定されている（デプロイ後に更新）

---

## 🔐 環境変数の準備

### Supabase認証情報の取得
Supabase Dashboard → Project Settings → API：

- [ ] **Project URL** をコピー: `https://xxxxx.supabase.co`
- [ ] **anon public key** をコピー
- [ ] **service_role key** をコピー（⚠️ 秘密に保持）

### Vercel環境変数リスト

以下の環境変数をVercelに設定する準備：

| 環境変数名 | 必須 | 環境 | 説明 |
|----------|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | All | SupabaseプロジェクトURL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | All | Supabase匿名キー |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Prod, Preview | Supabaseサービスロールキー |
| `NEXT_PUBLIC_APP_URL` | ✅ | Production | 本番アプリケーションURL |
| `NEXT_PUBLIC_ENVIRONMENT` | ✅ | Production | `production` |

---

## 🌐 Vercelプロジェクトの準備

### Vercelアカウント
- [ ] Vercelアカウントが作成されている
- [ ] GitHubアカウントと連携されている

### プロジェクト設定
- [ ] リポジトリがVercelに連携されている
- [ ] Root Directory: `apps/web`
- [ ] Build Command: `cd ../.. && cd apps/web && npm run build`
- [ ] Install Command: `cd ../.. && npm install --frozen-lockfile`

---

## 🚀 デプロイ実行

### ブランチ確認
- [ ] デプロイするブランチを確認（`main` または `develop`）
- [ ] ブランチが最新の状態

### デプロイ方法の選択
- [ ] 自動デプロイ（Git push）を使用
- [ ] または手動デプロイ（Vercel CLI）を使用

---

## ✅ デプロイ後の確認

### ビルドログ
- [ ] ビルドが成功している
- [ ] エラーや警告がない

### アプリケーション動作
- [ ] ホームページが表示される
- [ ] サインアップができる
- [ ] ログインができる
- [ ] ダッシュボードが表示される
- [ ] 練習記録の追加ができる
- [ ] 大会記録の追加ができる

### Supabase認証設定の更新
- [ ] Site URLを本番URLに更新
- [ ] Redirect URLsに本番URLを追加

---

## 🔒 セキュリティ確認

- [ ] 環境変数に機密情報が含まれていない（`NEXT_PUBLIC_*` は公開される）
- [ ] `SUPABASE_SERVICE_ROLE_KEY` はサーバー側のみで使用
- [ ] RLSポリシーがすべてのテーブルで有効
- [ ] 認証URLが正しく設定されている
- [ ] HTTPSが有効（Vercelは自動で有効）

---

## 📊 モニタリング設定

### Vercel Analytics
- [ ] Vercel Analyticsが有効（オプション）

### Supabase Monitoring
- [ ] Supabase Dashboardでモニタリングを確認

---

## 📝 チェックリストの使い方

1. **デプロイ前**: このチェックリストを印刷または開いたまま、各項目を確認
2. **完了した項目**: ✅ にチェックを入れる
3. **未完了の項目**: 完了してからデプロイを実行
4. **デプロイ後**: デプロイ後の確認項目を実行

---

**重要**: すべての必須項目（✅）が完了してからデプロイを実行してください。

