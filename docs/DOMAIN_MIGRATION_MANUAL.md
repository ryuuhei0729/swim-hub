# ドメイン移行マニュアル（swim-hub.app）

新しいドメイン `swim-hub.app` への移行に伴い、以下の作業を手動で実施してください。

---

## ✅ 完了したコード修正

以下のファイルは自動で修正済みです：

- ✅ `README.md` - サービスURLの更新
- ✅ `docs/app-store-texts.md` - サポートURL、マーケティングURLの更新
- ✅ `apps/web/lib/env.ts` - 本番環境のデフォルトURL更新
- ✅ `apps/web/app/layout.tsx` - SEOメタデータの追加（Open Graph, Twitter Card, metadataBase）
- ✅ `supabase/config.toml` - ローカル設定のリダイレクトURL追加

---

## 🔧 手動作業が必要な項目

### 1. Vercel - カスタムドメイン設定 ⭐️ **最優先**

#### 手順：
1. **Vercelダッシュボードにアクセス**
   - https://vercel.com/dashboard
   - プロジェクト `swim-hub` を選択

2. **ドメイン設定を開く**
   - `Settings` タブをクリック
   - 左サイドバーから `Domains` を選択

3. **新しいドメインを追加**
   - `Add Domain` ボタンをクリック
   - ドメイン名 `swim-hub.app` を入力
   - `Add` をクリック

4. **DNS設定**
   Vercelが表示する指示に従って、お使いのドメインレジストラ（ドメインを購入したサービス）でDNSレコードを設定します。

   **Aレコードの場合：**
   ```
   Type: A
   Name: @
   Value: 76.76.21.21
   ```

   **CNAMEレコードの場合：**
   ```
   Type: CNAME
   Name: www
   Value: cname.vercel-dns.com
   ```

5. **SSL証明書の確認**
   - DNS設定が完了すると、Vercelが自動でSSL証明書を発行します
   - ステータスが `Valid Configuration` になるまで待機（通常5-10分）

6. **プライマリドメインに設定（推奨）**
   - ドメイン一覧で `swim-hub.app` の右側にある `...` メニューをクリック
   - `Set as Primary Domain` を選択
   - これにより、旧ドメイン（swim-hub.vercel.app）から自動でリダイレクトされます

---

### 2. Vercel - 環境変数の更新

#### 手順：
1. **Vercelダッシュボードにアクセス**
   - プロジェクト `swim-hub` を選択

2. **環境変数を開く**
   - `Settings` タブをクリック
   - 左サイドバーから `Environment Variables` を選択

3. **NEXT_PUBLIC_APP_URLを更新**
   - `NEXT_PUBLIC_APP_URL` を探す（なければ新規作成）
   - 値を `https://swim-hub.app` に設定
   - 環境は `Production` と `Preview` にチェック
   - `Save` をクリック

4. **再デプロイ**
   - 環境変数の変更を反映するため、再デプロイが必要です
   - `Deployments` タブに移動
   - 最新のデプロイの右側にある `...` メニューから `Redeploy` を選択

---

### 3. Supabase - 認証リダイレクトURL設定 ⭐️ **重要**

#### 手順：
1. **Supabase Dashboardにアクセス**
   - https://supabase.com/dashboard
   - プロジェクトを選択

2. **Authentication設定を開く**
   - 左サイドバーから `Authentication` をクリック
   - `URL Configuration` を選択

3. **Site URLを更新**
   ```
   Site URL: https://swim-hub.app
   ```

4. **Redirect URLsに追加**
   以下のURLを `Redirect URLs` セクションに追加します：
   
   ```
   https://swim-hub.app/**
   https://swim-hub.vercel.app/**
   ```
   
   **注意：** 旧ドメイン（swim-hub.vercel.app）も移行期間中は残しておくことを推奨します。

5. **保存**
   - `Save` ボタンをクリック

---

### 4. 環境変数ファイルの更新（dotenvx使用時）

プロジェクトではdotenvxで環境変数を暗号化管理しているため、以下の手順で更新してください：

#### 本番環境（.env.production）の更新

```bash
# apps/web/.env.production の NEXT_PUBLIC_APP_URL を更新
npx @dotenvx/dotenvx set NEXT_PUBLIC_APP_URL "https://swim-hub.app" -f apps/web/.env.production
```

または、手動で復号化して編集：

```bash
# 1. 復号化
npx @dotenvx/dotenvx decrypt apps/web/.env.production

# 2. エディタで apps/web/.env.production を開き、以下を変更：
#    NEXT_PUBLIC_APP_URL=https://swim-hub.app

# 3. 再暗号化
npx @dotenvx/dotenvx encrypt apps/web/.env.production
```

#### ローカル環境（オプション）

もしローカルで `.env.local` ファイルを使用している場合：

```bash
# apps/web/.env.local
NEXT_PUBLIC_APP_URL=https://swim-hub.app
```

---

## 🧪 動作確認

すべての設定が完了したら、以下を確認してください：

### 1. ドメインアクセス確認
- ✅ https://swim-hub.app にアクセスできる
- ✅ HTTPSで接続できる（鍵マークが表示される）
- ✅ swim-hub.vercel.app にアクセスすると swim-hub.app にリダイレクトされる

### 2. 認証フロー確認
- ✅ 新規登録ができる
- ✅ 登録後にメール認証リンクをクリックして正常にリダイレクトされる
- ✅ ログインができる
- ✅ パスワードリセットメールのリンクが正常に機能する

### 3. メタデータ確認
- ✅ Twitter/Slack/Discord等でURLをシェアした際にOGP画像が表示される
- ✅ Google検索で正しいタイトルとディスクリプションが表示される（インデックスされるまで時間がかかります）

---

## 📝 チェックリスト

実施した項目にチェックを入れてください：

- [ ] Vercelにカスタムドメイン `swim-hub.app` を追加
- [ ] DNSレコードを設定（ドメインレジストラ側）
- [ ] SSL証明書が有効になったことを確認
- [ ] `swim-hub.app` をプライマリドメインに設定
- [ ] Vercelの環境変数 `NEXT_PUBLIC_APP_URL` を更新
- [ ] 環境変数変更後に再デプロイ実施
- [ ] Supabaseの `Site URL` を `https://swim-hub.app` に更新
- [ ] Supabaseの `Redirect URLs` に `https://swim-hub.app/**` を追加
- [ ] Supabaseの `Redirect URLs` に `https://swim-hub.vercel.app/**` を追加（移行期間用）
- [ ] 新ドメインでサイトにアクセスできることを確認
- [ ] HTTPSで接続できることを確認
- [ ] 旧ドメインから新ドメインへのリダイレクトを確認
- [ ] 新規登録→メール認証フローを確認
- [ ] ログインフローを確認
- [ ] パスワードリセットフローを確認

---

## 🚨 トラブルシューティング

### ドメインが表示されない場合
- DNSの伝播には最大48時間かかる場合があります（通常は数分〜数時間）
- `nslookup swim-hub.app` コマンドでDNSが正しく設定されているか確認
- Vercelのドメイン設定画面でエラーメッセージを確認

### 認証リダイレクトが失敗する場合
- Supabaseの `Redirect URLs` に正しくURLが登録されているか確認
- URLの末尾に `/**` がついているか確認（ワイルドカード）
- Vercelの環境変数が正しく設定され、再デプロイされているか確認

### SSL証明書のエラーが出る場合
- Vercelのドメイン設定で証明書のステータスを確認
- 場合によっては証明書の再発行をトリガーする必要があります
  - ドメインを一度削除して再度追加

---

## 📌 追加の推奨事項（将来的に）

### Google Search Console の更新
1. https://search.google.com/search-console にアクセス
2. 新しいドメイン `swim-hub.app` をプロパティとして追加
3. 旧ドメインのプロパティ設定で「アドレス変更」を実施

### Google Analytics の更新（導入時）
- プロパティ設定で新しいドメインを追加

### sitemap.xml / robots.txt の作成（SEO対策）
- Next.jsのメタデータAPIを使用して自動生成を検討

---

## ✅ 完了後

すべての項目が完了したら、このドキュメントをアーカイブに移動してください：

```bash
mv docs/DOMAIN_MIGRATION_MANUAL.md docs/archive/DOMAIN_MIGRATION_MANUAL_COMPLETED.md
```

---

最終更新: 2025-12-23
作成者: AI Assistant

