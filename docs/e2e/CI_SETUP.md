# CI環境でのE2Eテスト実行ガイド

このドキュメントでは、GitHub ActionsでPlaywrightのE2Eテストを実行するための環境構築手順を説明します。

## 概要

CI環境では、ローカルSupabase環境を使用してE2Eテストを実行します。これにより、テストの分離性と実行速度を確保できます。

## 前提条件

- GitHub Actionsが有効になっていること
- Supabase CLIが利用可能であること（CI環境では自動的にインストールされます）
- Dockerが利用可能であること（GitHub Actionsの`ubuntu-latest`には既にインストール済み）

## GitHub Secretsの設定

CI環境でE2Eテストを実行するには、以下のGitHub Secretsを設定する必要があります。

### 必須のSecrets

1. **E2E_TEST_EMAIL**
   - E2Eテストで使用するテストユーザーのメールアドレス
   - 例: `test@swimhub.com`

2. **E2E_TEST_PASSWORD**
   - E2Eテストで使用するテストユーザーのパスワード
   - 例: `TestPassword123!`

### Secretsの設定方法

1. GitHubリポジトリのページにアクセス
2. **Settings** → **Secrets and variables** → **Actions** を選択
3. **New repository secret** をクリック
4. 上記のSecretsを追加

## CI設定の動作フロー

`.github/workflows/ci.yml`の`e2e-tests`ジョブは以下の手順で実行されます：

1. **依存関係のインストール**
   - Node.jsのセットアップ
   - npmパッケージのインストール
   - Playwrightブラウザのインストール

2. **Supabaseスタックの起動**
   - `npx supabase start --workdir supabase` を実行
   - ローカルSupabase環境（PostgreSQL、Auth、Storage等）を起動
   - 起動には2-3分かかります

3. **データベースのマイグレーション**
   - `npx supabase db reset --workdir supabase` を実行
   - マイグレーションファイルを適用
   - シードデータを投入

4. **テストユーザーの作成**
   - `node apps/web/e2e/scripts/create-test-user.js` を実行
   - E2Eテストで使用するテストユーザーを作成

5. **E2Eテストの実行**
   - `npm run test:e2e --workspace=apps/web` を実行
   - PlaywrightでE2Eテストを実行

6. **Supabaseスタックの停止**（クリーンアップ）
   - `npx supabase stop --workdir supabase` を実行
   - `if: always()`により、テストが失敗しても必ず実行されます

## ローカル開発環境での設定

ローカル開発環境でE2Eテストを実行する場合は、以下の手順を実行してください。

### 1. 環境変数の設定

`apps/web/.env.local`ファイルに以下の環境変数を設定してください。

**必須の環境変数**:
- `E2E_TEST_EMAIL`: E2Eテストで使用するテストユーザーのメールアドレス
- `E2E_TEST_PASSWORD`: E2Eテストで使用するテストユーザーのパスワード
- `NEXT_PUBLIC_SUPABASE_URL`: SupabaseのURL（ローカル環境の場合は`http://127.0.0.1:54321`）
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabaseの匿名キー
- `SUPABASE_SERVICE_ROLE_KEY`: Supabaseのサービスロールキー（テストユーザー作成に必要）

**注意**: `.env.local`は`.gitignore`に含まれているため、GitHubにはコミットされません。機密情報を含むため、リポジトリにコミットしないでください。

### 2. Supabaseの起動

```bash
npm run supabase:start
```

または

```bash
npx supabase start --workdir supabase
```

### 3. テストユーザーの作成

```bash
node apps/web/e2e/scripts/create-test-user.js
```

### 4. E2Eテストの実行

```bash
npm run test:e2e --workspace=apps/web
```

## トラブルシューティング

### Supabase起動に失敗する

**症状**: `npx supabase start`が失敗する

**原因と対策**:
- Dockerが起動していない可能性があります
  - ローカル環境: Docker Desktopが起動しているか確認
  - CI環境: GitHub Actionsの`ubuntu-latest`にはDockerが既にインストール済み
- ポートが既に使用されている可能性があります
  - `npx supabase stop`を実行して既存のインスタンスを停止

### テストユーザーが作成されない

**症状**: テストユーザーの作成に失敗する

**原因と対策**:
- Supabaseが起動していない可能性があります
  - `npx supabase status --workdir supabase`で状態を確認
- 環境変数が正しく設定されていない可能性があります
  - `SUPABASE_SERVICE_ROLE_KEY`が設定されているか確認

### E2Eテストが失敗する

**症状**: E2Eテストが実行されるが失敗する

**原因と対策**:
- テストユーザーが存在しない可能性があります
  - `create-test-user.js`を再実行
- アプリケーションサーバーが起動していない可能性があります
  - Playwrightの`webServer`設定を確認
- 環境変数が正しく設定されていない可能性があります
  - `E2E_TEST_EMAIL`と`E2E_TEST_PASSWORD`が設定されているか確認

### CI実行時間が長い

**症状**: CI実行時間が長すぎる

**原因と対策**:
- Supabase起動に2-3分かかります（これは正常です）
- Playwrightブラウザのキャッシュを活用することで、ブラウザインストール時間を短縮できます
- 並列実行を検討することで、全体の実行時間を短縮できます

## 参考資料

- [Playwright公式ドキュメント](https://playwright.dev/)
- [Supabase CLI公式ドキュメント](https://supabase.com/docs/guides/cli)
- [GitHub Actions公式ドキュメント](https://docs.github.com/ja/actions)

## 関連ファイル

- `.github/workflows/ci.yml` - CI設定ファイル
- `apps/web/e2e/src/config/playwright.config.ts` - Playwright設定ファイル
- `apps/web/e2e/src/config/env.ts` - 環境変数設定
- `apps/web/e2e/scripts/create-test-user.js` - テストユーザー作成スクリプト

