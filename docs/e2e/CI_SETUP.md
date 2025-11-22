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

## パフォーマンス最適化

CI環境でのE2Eテスト実行速度を改善するための設定とテクニックを説明します。

### 1. ヘッドレス実行＋高速モード

Playwrightではブラウザをヘッドレスで起動するだけで大きな高速化が可能です。

**設定**: `playwright.config.ts`で`headless: 'new'`を設定

```typescript
use: {
  headless: 'new',  // 'new'は従来のtrueより高速かつ安定
}
```

**効果**:
- CIでは必ず有効化（GUIが不要なため）
- ローカルでもGUIが不要な場合は推奨

### 2. テストの並列実行（workers）

テストファイル単位で並列実行することにより、処理時間を大幅に削減できます。

**設定**: `playwright.config.ts`で`workers`を設定

```typescript
workers: process.env.CI ? 4 : 1,
```

**推奨値**:
- CI環境: 論理CPUコア数 - 1（例: 4コア → 3-4 workers）
- ローカル環境: 1（デバッグしやすいため）

**注意**: マシン性能に応じて要調整。リソース不足の場合は減らす。

### 3. テスト対象の絞り込み

すべてのテストを毎回実行するのは非効率です。開発中は特定のテストのみ実行しましょう。

**方法1: `.only`を使用**

```typescript
test.only('ログインできること', async ({ page }) => {
  // テスト本体
});
```

**方法2: `--grep`オプションを使用**

```bash
# スモークテストのみ実行
npx playwright test --grep '@smoke'

# 特定のテストファイルのみ実行
npx playwright test src/tests/personal/dashboard-practice.spec.ts
```

**効果**: 開発中の迅速なフィードバックが可能

### 4. CI環境向け最適化設定

CI環境では、デバッグ用のログやトレースの記録がボトルネックになることがあります。

**設定**: `playwright.config.ts`でCI環境向けに最適化

```typescript
use: {
  // trace: デバッグ時以外オフに
  trace: process.env.CI ? 'off' : 'on-first-retry',
  
  // video: 失敗時のみ記録
  video: process.env.CI ? 'retain-on-failure' : 'off',
  
  // screenshot: 失敗時のみ記録
  screenshot: 'only-on-failure',
}
```

**効果**: ログやトレースの記録時間を削減

### 5. ログイン状態の保存（実装済み）

毎回のログインはテストを遅くします。ログイン状態を保存して再利用することで高速化できます。

**実装方法**:

`global-setup.ts`で一度だけログイン処理を実行し、ログイン状態を`playwright/.auth/user.json`に保存します。

```typescript
// global-setup.tsで一度だけログイン＆保存
const loginAction = new LoginAction(loginPage)
await loginAction.execute(baseUrl, email, password)
await context.storageState({ path: 'playwright/.auth/user.json' })
```

`playwright.config.ts`で保存したログイン状態を読み込みます。

```typescript
use: {
  // ファイルが存在する場合のみ設定（存在しない場合は各テストでログイン）
  storageState: fs.existsSync('playwright/.auth/user.json') 
    ? 'playwright/.auth/user.json' 
    : undefined,
}
```

**効果**: 
- ログイン処理をスキップしてテスト開始時間を短縮
- 各テストで個別にログイン処理を実行する必要がなくなる
- テスト実行時間が大幅に短縮される

**注意**: 
- `playwright/.auth/user.json`は認証情報を含むため、`.gitignore`に追加済み
- ファイルが存在しない場合は、各テストで個別にログイン処理が実行される（後方互換性）

### 6. 不要な静的待機を排除

固定待機（`waitForTimeout`）は無駄な時間を生みます。状態変化を検知できるセレクタを使いましょう。

**推奨パターン**:

```typescript
// ❌ 悪い例: 固定待機
await page.waitForTimeout(2000);

// ✅ 良い例: 状態ベース待機
await page.locator('text=保存しました').waitFor();
```

**詳細**: [e2e_Patterns.md § 2](./e2e_Patterns.md) - 待機処理パターン

### パフォーマンス改善のまとめ

| テクニック | 効果 | 実装状況 |
|----------|------|---------|
| ヘッドレス実行（`headless: 'new'`） | 大 | ✅ 実装済み |
| 並列実行（`workers`） | 大 | ✅ 実装済み（CI: 2, ローカル: 1） |
| テスト絞り込み（`.only` / `--grep`） | 中 | ✅ 利用可能 |
| CI環境向け最適化（trace/video） | 中 | ✅ 実装済み |
| ログイン状態保存 | 大 | ✅ 実装済み |
| 静的待機の排除 | 小 | ✅ 推奨パターンあり |

**参考**: [Playwright実行速度改善テクニック](https://qiita.com/Yasushi-Mo/items/b8133ac92975545a4d6c)

## 参考資料

- [Playwright公式ドキュメント](https://playwright.dev/)
- [Supabase CLI公式ドキュメント](https://supabase.com/docs/guides/cli)
- [GitHub Actions公式ドキュメント](https://docs.github.com/ja/actions)

## 関連ファイル

- `.github/workflows/ci.yml` - CI設定ファイル
- `apps/web/e2e/src/config/playwright.config.ts` - Playwright設定ファイル
- `apps/web/e2e/src/config/env.ts` - 環境変数設定
- `apps/web/e2e/scripts/create-test-user.js` - テストユーザー作成スクリプト

## 参考資料

- [Playwright実行速度改善テクニック](https://qiita.com/Yasushi-Mo/items/b8133ac92975545a4d6c) - パフォーマンス最適化の参考記事

