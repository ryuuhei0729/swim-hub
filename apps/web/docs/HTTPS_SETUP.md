# HTTPS開発環境セットアップ（mkcert）

ローカル開発環境でHTTPSを使用することで、`secure: true`のCookieを使用できます。

## セットアップ手順

### 1. mkcertのインストール

**macOS (Homebrew):**
```bash
brew install mkcert
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt install libnss3-tools
# または
wget -O mkcert https://github.com/FiloSottile/mkcert/releases/latest/download/mkcert-v1.4.4-linux-amd64
chmod +x mkcert
sudo mv mkcert /usr/local/bin/
```

**Windows:**
```powershell
# Chocolatey
choco install mkcert
```

### 2. ローカルCA（認証局）のインストール

```bash
mkcert -install
```

これにより、ローカルで作成した証明書がブラウザに信頼されるようになります。

### 3. 証明書の作成

`apps/web`ディレクトリで実行：

```bash
cd apps/web
mkcert localhost 127.0.0.1 ::1
```

これにより、以下のファイルが作成されます：
- `localhost+2.pem` (証明書)
- `localhost+2-key.pem` (秘密鍵)

### 4. 証明書ファイルのリネーム

```bash
mv localhost+2.pem localhost.pem
mv localhost+2-key.pem localhost-key.pem
```

### 5. HTTPSで開発サーバーを起動

```bash
npm run dev:https
```

ブラウザで `http://localhost:3000` にアクセスしてください。

## 注意事項

- 証明書ファイル（`localhost.pem`, `localhost-key.pem`）は`.gitignore`に追加されているため、Gitにはコミットされません
- チームメンバーは各自で証明書を作成する必要があります
- 証明書は開発環境でのみ使用してください

## Google OAuth設定

HTTPSを使用する場合、Google OAuth ConsoleでリダイレクトURIを追加する必要があります。

### 手順

1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. プロジェクトを選択
3. 「APIとサービス」→「認証情報」を開く
4. OAuth 2.0 クライアントIDを選択
5. 「承認済みのリダイレクト URI」に以下を追加：
   - `http://localhost:3000/api/auth/callback`
   - `http://127.0.0.1:3000/api/auth/callback`（必要に応じて）

### Supabase設定の反映

`supabase/config.toml`を更新した後、Supabaseを再起動してください：

```bash
npm run supabase:stop
```

**重要**: Google OAuthを使用する場合、環境変数を設定してSupabaseを起動する必要があります：

```bash
# supabase/.envから環境変数を読み込んで起動
cd supabase
export $(cat .env | grep -v '^#' | xargs)
cd ..
npm run supabase:start
```

または、環境変数を直接指定：

```bash
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID="your-client-id" \
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET="your-secret" \
npm run supabase:start
```

## トラブルシューティング

### 証明書エラーが表示される場合

1. `mkcert -install`が実行されているか確認
2. 証明書ファイルが正しい場所にあるか確認（`apps/web/`ディレクトリ）
3. ブラウザのキャッシュをクリア

### redirect_uri_mismatchエラーが表示される場合

1. Google OAuth Consoleで`http://localhost:3000/api/auth/callback`が追加されているか確認
2. Supabaseを再起動して設定を反映
3. ブラウザのキャッシュをクリア

### ポートが既に使用されている場合

`server.js`の`port`を変更するか、既存のプロセスを終了してください。
