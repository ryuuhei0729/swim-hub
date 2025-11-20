# E2Eテストフレームワーク - 4層アーキテクチャ 技術標準書

**文書バージョン**: 2.0 (汎用版)  
**最終更新**: 2025-11-06  
**対象**: すべてのE2Eテストプロジェクト

---

## 📘 このドキュメントについて

このドキュメントは、**Playwright + TypeScript による E2Eテストフレームワークの汎用的な設計標準**です。

### 位置づけ

```
e2e_4R-flamework.md (本書)
    ↓ 参考にして作成
e2e_Main-rule.md (プロジェクト固有ルール)
    ↓ AIが参照
コード生成
```

**使い方**：
1. 新規プロジェクト開始時に、このドキュメントを参照
2. プロジェクト固有の調整は `e2e_Main-rule.md` に記載
3. AIコード生成時は `e2e_Main-rule.md` を優先参照

---

## 目次

1. [アーキテクチャ概要](#1-アーキテクチャ概要)
2. [ディレクトリ構成](#2-ディレクトリ構成)
3. [Layer 1: Page Objects](#3-layer-1-page-objects)
4. [Layer 2: Actions](#4-layer-2-actions)
5. [Layer 3: Tests](#5-layer-3-tests)
6. [Layer 4: Config/Env](#6-layer-4-configenv)
7. [命名規則](#7-命名規則)
8. [コーディング規約](#8-コーディング規約)
9. [エラーハンドリング](#9-エラーハンドリング)
10. [テストデータ管理](#10-テストデータ管理)
11. [外部認証フローの扱い](#11-外部認証フローの扱い)
12. [プロジェクト固有の調整方法](#12-プロジェクト固有の調整方法)

---

## 1. アーキテクチャ概要

### 1.1 4層構造

```
┌─────────────────────────────────────┐
│ Layer 4: Config/Env                 │  ← 環境設定
├─────────────────────────────────────┤
│ Layer 3: Tests                      │  ← 期待結果検証
├─────────────────────────────────────┤
│ Layer 2: Actions                    │  ← ビジネスロジック
├─────────────────────────────────────┤
│ Layer 1: Page Objects               │  ← UI要素管理
└─────────────────────────────────────┘
```

### 1.2 責任分離の原則

| Layer | 責任 | 変更理由 |
|-------|------|----------|
| **Page Objects** | UI要素の定義と基本操作 | HTML構造の変更 |
| **Actions** | ビジネスフロー、複数画面の制御 | 業務手順の変更 |
| **Tests** | 期待結果の定義と検証 | テスト観点の変更 |
| **Config/Env** | 環境依存の設定値 | 環境の変更 |

### 1.3 設計原則

**単一責任の原則（SRP）**
- 各クラスは1つの責任のみを持つ
- 変更理由が1つのみである

**開放閉鎖の原則（OCP）**
- 拡張には開いている
- 修正には閉じている

**依存性逆転の原則（DIP）**
- 上位層は下位層に依存する
- 下位層は上位層に依存しない

---

## 2. ディレクトリ構成

### 2.1 標準ディレクトリ構造

```
e2e-tests/
├── src/
│   ├── config/                       # Layer 4: 設定
│   │   ├── env.ts                   # 環境変数管理
│   │   └── constants.ts             # 定数定義
│   ├── pages/                       # Layer 1: Page Objects
│   │   ├── BasePage.ts              # 基底クラス
│   │   ├── LoginPage.ts
│   │   ├── ProductPage.ts
│   │   └── DashboardPage.ts
│   ├── actions/                     # Layer 2: Actions
│   │   ├── BaseAction.ts            # 基底クラス
│   │   ├── LoginAction.ts
│   │   ├── ProductManagementAction.ts
│   │   └── UserProfileAction.ts
│   ├── tests/                       # Layer 3: Tests
│   │   ├── scenarios/               # シナリオテスト
│   │   │   ├── user-journey.spec.ts
│   │   │   └── product-management.spec.ts
│   │   └── smoke/                   # スモークテスト
│   │       └── critical-path.spec.ts
│   └── utils/                       # ユーティリティ
│       ├── testData.ts
│       └── helpers.ts
├── playwright.config.ts              # Playwright設定
├── package.json
└── .env.example                      # 環境変数テンプレート
```

### 2.2 環境セットアップ

新規プロジェクトを作成した際、以下の手順で環境をセットアップします：

#### 1. 依存関係のインストール

```bash
npm install
```

#### 2. Playwrightブラウザのインストール

```bash
npx playwright install
```

または特定のブラウザのみ：

```bash
npx playwright install chromium
```

#### 3. 環境変数の設定

`.env.example`をコピーして`.env`ファイルを作成し、実際の値を設定：

```bash
cp .env.example .env
```

`.env`ファイルを編集：

```bash
BASE_URL=https://your-test-environment.com
TEST_EMAIL=your-test-email@example.com
TEST_PASSWORD=your-test-password
```

**重要**: `.env`ファイルは機密情報を含むため、`.gitignore`に含めること。

#### 4. テスト実行確認

```bash
npm test
```

---

### 2.3 ファイル命名規則

| 種類 | 命名規則 | 例 |
|------|---------|-----|
| Page Objects | `{PageName}Page.ts` | `LoginPage.ts` |
| Actions | `{ActionName}Action.ts` | `LoginAction.ts` |
| Tests | `{feature}.spec.ts` | `login.spec.ts` |

---

## 3. Layer 1: Page Objects

### 3.1 責任範囲

**Page Objectsが持つべきもの**：
- UI要素の定義（Locator）
- UI要素への基本操作メソッド（click, fill, select等）
- 画面固有の待機処理

**Page Objectsが持つべきでないもの**：
- ❌ ビジネスロジック
- ❌ 複数画面にまたがる操作
- ❌ 検証（Assert）

### 3.2 BasePage（基底クラス）

```typescript
import type { Page } from '@playwright/test';

export class BasePage {
  protected readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * ページに遷移
   */
  async goto(url: string): Promise<void> {
    await this.page.goto(url);
  }

  /**
   * ページタイトルを取得
   */
  async getTitle(): Promise<string> {
    return await this.page.title();
  }

  /**
   * URLを取得
   */
  getUrl(): string {
    return this.page.url();
  }
}
```

### 3.3 Page Object 実装例

```typescript
import type { Locator, Page } from '@playwright/test';
import { TIMEOUTS, SELECTORS } from '../config/constants';
import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  // UI要素定義（readonly推奨）
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page);
    
    // ロケーター定義
    this.emailInput = page.locator('input[name="email"]');
    this.passwordInput = page.locator('input[name="password"]');
    this.submitButton = page.locator('button[type="submit"]');
    this.errorMessage = page.locator('[role="alert"]');
  }

  /**
   * メールアドレスを入力
   */
  async fillEmail(email: string): Promise<void> {
    await this.emailInput.fill(email);
  }

  /**
   * パスワードを入力
   */
  async fillPassword(password: string): Promise<void> {
    await this.passwordInput.fill(password);
  }

  /**
   * ログインボタンをクリック
   */
  async clickSubmit(): Promise<void> {
    await this.submitButton.click();
  }

  /**
   * エラーメッセージを取得
   */
  async getErrorMessage(): Promise<string> {
    return await this.errorMessage.textContent() || '';
  }
}
```

### 3.4 ロケーター戦略

#### 優先順位（理想的な環境）

| 優先度 | ロケーター種類 | 例 | 理由 |
|--------|--------------|-----|------|
| 1 | data-testid | `page.getByTestId('login-button')` | 最も安定 |
| 2 | セマンティック | `page.getByRole('button', { name: 'Login' })` | アクセシビリティ |
| 3 | label | `page.getByLabel('Email')` | フォーム要素 |
| 4 | CSS + text | `page.locator('button:has-text("Login")')` | 代替手段 |

#### プロジェクト固有の調整

実際のHTMLに`data-testid`や`aria-label`が不足している場合は：

1. **e2e_Main-rule.mdに記載**：
   - 使用できないロケーター種類
   - 代替セレクタ戦略
   - constants.tsでのセレクタ定義方針

2. **開発チームに依頼**：
   - `data-testid`属性の追加
   - `aria-label`属性の追加

### 3.5 定数管理

**共通セレクタはconstants.tsで定義**：

```typescript
// config/constants.ts
export const SELECTORS = {
  MODAL: '[role="dialog"]',
  SUBMIT_BUTTON: 'button[type="submit"]',
  ERROR_ALERT: '[role="alert"]',
  // プロジェクト固有セレクタはe2e_Selectors.mdで管理
} as const;

export const TIMEOUTS = {
  DEFAULT: 10000,
  LONG: 30000,
  SHORT: 5000,
  ANIMATION: 1000,
  // プロジェクト固有タイムアウトはe2e_Main-rule.mdで定義
} as const;
```

---

## 4. Layer 2: Actions

### 4.1 責任範囲

**Actionsが持つべきもの**：
- ビジネスフロー（複数画面の制御）
- 複雑な操作シーケンス
- 複数のPage Objectsの組み合わせ

**Actionsが持つべきでないもの**：
- ❌ 検証（Assert）
- ❌ UI要素の直接定義

### 4.2 BaseAction（基底クラス）

```typescript
import type { Page } from '@playwright/test';

export class BaseAction {
  protected readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * スクリーンショットを保存
   */
  protected async saveScreenshot(name: string): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await this.page.screenshot({ 
      path: `screenshots/${name}_${timestamp}.png`,
      fullPage: true 
    });
  }
}
```

### 4.3 Action 実装例

```typescript
import type { Page } from '@playwright/test';
import { TIMEOUTS } from '../config/constants';
import { BaseAction } from './BaseAction';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';

export class LoginAction extends BaseAction {
  private readonly loginPage: LoginPage;
  private readonly dashboardPage: DashboardPage;

  constructor(page: Page) {
    super(page);
    this.loginPage = new LoginPage(page);
    this.dashboardPage = new DashboardPage(page);
  }

  /**
   * ログインフローを実行
   * @param url ログインページURL
   * @param email メールアドレス
   * @param password パスワード
   */
  async execute(url: string, email: string, password: string): Promise<void> {
    console.log('=== ログインフロー開始 ===');

    // Step 1: ログインページに遷移
    await this.loginPage.goto(url);

    // Step 2: 認証情報を入力
    await this.loginPage.fillEmail(email);
    await this.loginPage.fillPassword(password);

    // Step 3: ログインボタンをクリック
    await this.loginPage.clickSubmit();

    // Step 4: ダッシュボードの表示を待つ
    await this.page.waitForLoadState('networkidle');

    console.log('=== ログインフロー完了 ===');
  }
}
```

### 4.4 待機処理のベストプラクティス

| シチュエーション | 推奨方法 | 例 |
|----------------|---------|-----|
| ページ遷移 | `waitForLoadState('networkidle')` | 通常のページ遷移 |
| 要素の表示 | `element.waitFor({ state: 'visible' })` | モーダル表示 |
| API完了 | `waitForResponse()` | データ取得完了 |
| アニメーション | `waitForTimeout()` + コメント | モーダルフェードイン |

**重要**：`waitForTimeout()`は必ずコメントで理由を明記すること

```typescript
// ✅ 良い例
await page.waitForTimeout(TIMEOUTS.ANIMATION);
// 理由: モーダルのフェードインアニメーション完了を待つ

// ❌ 悪い例
await page.waitForTimeout(1000); // コメントなし、定数未使用
```

---

## 5. Layer 3: Tests

### 5.1 責任範囲

**Testsが持つべきもの**：
- テストシナリオの定義
- 期待結果の検証（Assert）
- テストデータの準備とクリーンアップ

**Testsが持つべきでないもの**：
- ❌ UI要素の直接操作
- ❌ ビジネスロジックの実装

### 5.2 AAAパターン

```typescript
import { test, expect } from '@playwright/test';
import { EnvConfig } from '../config/env';
import { LoginAction } from '../actions/LoginAction';

test('ログイン成功のテスト', async ({ page }) => {
  // Arrange: テスト準備
  const env = EnvConfig.getTestEnvironment();
  const loginAction = new LoginAction(page);

  // Act: 操作実行
  await loginAction.execute(
    env.baseUrl,
    env.credentials.email,
    env.credentials.password
  );

  // Assert: 結果検証
  await expect(page).toHaveURL(/.*dashboard/);
  await expect(page.getByText('Welcome')).toBeVisible();
});
```

### 5.3 テストの構造化

```typescript
import { test, expect } from '@playwright/test';

test.describe('ユーザー管理機能', () => {
  test.beforeEach(async ({ page }) => {
    // 各テスト前の共通処理
    await page.goto('/admin');
  });

  test.afterEach(async ({ page }) => {
    // データクリーンアップ
  });

  test('ユーザーを追加できる', async ({ page }) => {
    // テスト内容
  });

  test('ユーザーを編集できる', async ({ page }) => {
    // テスト内容
  });

  test('ユーザーを削除できる', async ({ page }) => {
    // テスト内容
  });
});
```

### 5.4 テスト命名規則

**推奨フォーマット**：
```
test('[主語]は[条件]のとき[期待動作]', ...)
```

**良い例**：
```typescript
test('管理者は有効なメールアドレスでログインできる', ...)
test('一般ユーザーは他人のデータを閲覧できない', ...)
test('フォームは必須項目が未入力のとき送信できない', ...)
```

**悪い例**：
```typescript
test('test1', ...) // 内容が不明
test('ログイン', ...) // 期待動作が不明
```

---

## 6. Layer 4: Config/Env

### 6.1 環境変数管理

```typescript
// config/env.ts
import * as dotenv from 'dotenv';

dotenv.config();

export interface TestEnvironment {
  baseUrl: string;
  credentials: {
    email: string;
    password: string;
  };
}

export class EnvConfig {
  /**
   * テスト環境の設定を取得
   */
  static getTestEnvironment(): TestEnvironment {
    const baseUrl = process.env.BASE_URL;
    const email = process.env.TEST_EMAIL;
    const password = process.env.TEST_PASSWORD;

    if (!baseUrl || !email || !password) {
      throw new Error('必要な環境変数が設定されていません');
    }

    return {
      baseUrl,
      credentials: { email, password }
    };
  }
}
```

### 6.2 .env ファイル

```bash
# .env.example（テンプレート）
BASE_URL=https://example.com
TEST_EMAIL=test@example.com
TEST_PASSWORD=your_password_here

# 実際の .env ファイルは .gitignore に追加すること！
```

### 6.3 constants.ts

```typescript
// config/constants.ts
export const TIMEOUTS = {
  DEFAULT: 10000,
  LONG: 30000,
  SHORT: 5000,
  ANIMATION: 1000,
} as const;

export const SELECTORS = {
  MODAL: '[role="dialog"]',
  SUBMIT_BUTTON: 'button[type="submit"]',
  ERROR_ALERT: '[role="alert"]',
} as const;

export const URLS = {
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  SETTINGS: '/settings',
} as const;
```

---

## 7. 命名規則

### 7.1 ファイル命名

| 種類 | 形式 | 例 |
|------|------|-----|
| Page Objects | PascalCase + Page | `LoginPage.ts` |
| Actions | PascalCase + Action | `LoginAction.ts` |
| Tests | kebab-case + .spec | `user-login.spec.ts` |
| Utilities | camelCase | `testHelpers.ts` |

### 7.2 変数・関数命名

```typescript
// クラス名: PascalCase
export class LoginPage {}

// メソッド名: camelCase（動詞で始める）
async fillEmail(email: string) {}
async clickSubmitButton() {}
async getErrorMessage() {}

// 変数名: camelCase
const emailInput = page.locator('input[name="email"]');
const isLoggedIn = await page.isVisible('.dashboard');

// 定数: UPPER_SNAKE_CASE
const DEFAULT_TIMEOUT = 10000;
const MAX_RETRY_COUNT = 3;
```

---

## 8. コーディング規約

### 8.1 TypeScript厳格モード

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

### 8.2 型定義

```typescript
// ✅ 良い例：明示的な型定義
async fillForm(email: string, password: string): Promise<void> {
  await this.emailInput.fill(email);
  await this.passwordInput.fill(password);
}

// ❌ 悪い例：any型の使用
async fillForm(data: any) { ... }
```

### 8.3 readonlyの使用

```typescript
// ✅ Page Objectsのロケーターはreadonly
export class LoginPage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;

  constructor(page: Page) {
    this.emailInput = page.locator('input[name="email"]');
    this.passwordInput = page.locator('input[name="password"]');
  }
}
```

### 8.4 asyncの一貫性

```typescript
// ✅ 非同期メソッドは必ずPromiseを返す
async clickButton(): Promise<void> {
  await this.button.click();
}

// ❌ voidを返さない
async clickButton() {
  await this.button.click();
}
```

---

## 9. エラーハンドリング

### 9.1 基本方針

```typescript
export class BaseAction {
  protected async handleError(error: Error, actionName: string): Promise<void> {
    console.error(`=== ${actionName} でエラー発生 ===`);
    console.error(error.message);
    
    // スクリーンショット保存
    await this.saveScreenshot(`error_${actionName}`);
    
    // エラーを再スロー
    throw error;
  }
}
```

### 9.2 使用例

```typescript
export class LoginAction extends BaseAction {
  async execute(url: string, email: string, password: string): Promise<void> {
    try {
      console.log('=== ログインフロー開始 ===');
      
      await this.loginPage.goto(url);
      await this.loginPage.fillEmail(email);
      await this.loginPage.fillPassword(password);
      await this.loginPage.clickSubmit();
      
      console.log('=== ログインフロー完了 ===');
    } catch (error) {
      await this.handleError(error as Error, 'Login');
    }
  }
}
```

---

## 10. テストデータ管理

### 10.1 データ生成

```typescript
// utils/testData.ts
export class TestDataGenerator {
  /**
   * ランダムなメールアドレスを生成
   */
  static generateEmail(): string {
    const timestamp = Date.now();
    return `test_${timestamp}@example.com`;
  }

  /**
   * ユニークなユーザー名を生成
   */
  static generateUsername(): string {
    return `user_${Date.now()}`;
  }
}
```

### 10.2 フィクスチャ

```typescript
// tests/fixtures/userData.ts
export const testUsers = {
  admin: {
    email: 'admin@example.com',
    password: 'admin123',
    role: 'admin'
  },
  regularUser: {
    email: 'user@example.com',
    password: 'user123',
    role: 'user'
  }
};
```

---

## 11. 外部認証フローの扱い

### 11.1 外部認証の特性

多くのアプリケーションは、外部認証サービス（OAuth、SAML等）を使用します：

```
利用規約ページ（自社ドメイン）
  ↓ 
外部認証ページ（auth-provider.com）← 別ドメイン
  ↓
アプリケーション（自社ドメイン）← 戻る
```

### 11.2 Page Objectsの分離

**重要**：外部認証ページは別のPage Objectとして定義

```typescript
// 自社の利用規約ページ
export class TermsPage extends BasePage {
  readonly agreeCheckbox: Locator;
  readonly loginButton: Locator;
}

// 外部認証サービスのページ
export class ExternalAuthPage extends BasePage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
}
```

### 11.3 URL遷移の待機（必須）

```typescript
export class LoginAction extends BaseAction {
  async execute(url: string, email: string, password: string): Promise<void> {
    // Step 1: 利用規約に同意
    await this.termsPage.goto(url);
    await this.termsPage.agreeToTerms();
    await this.termsPage.clickLogin();

    // Step 2: 外部サイトへの遷移を待つ（重要！）
    await this.page.waitForURL('**/auth-provider.com/**', { 
      timeout: TIMEOUTS.DEFAULT 
    });
    await this.page.waitForTimeout(TIMEOUTS.EXTERNAL_AUTH_STABILIZATION);

    // Step 3: 外部サイトで認証
    await this.externalAuthPage.fillEmail(email);
    await this.externalAuthPage.fillPassword(password);
    await this.externalAuthPage.clickSubmit();

    // Step 4: リダイレクト完了を待つ
    await this.page.waitForTimeout(TIMEOUTS.REDIRECT);
  }
}
```

---

## 12. プロジェクト固有の調整方法

### 12.1 調整が必要になるケース

実際のプロジェクトでは、以下のような調整が必要になります：

| 状況 | 調整方法 |
|------|---------|
| HTMLに`data-testid`がない | `e2e_Main-rule.md`にセレクタ戦略を記載 |
| SPAでレンダリング遅延 | `e2e_Main-rule.md`に待機処理を追記 |
| 外部認証の具体的な実装 | `e2e_Patterns.md`に成功例を記載 |
| 頻出エラー | `e2e_FAQ.md`に解決策を追記 |

### 12.2 e2e_Main-rule.mdの作成

プロジェクト開始時に、以下のテンプレートでe2e_Main-rule.mdを作成：

```markdown
# e2e_Main-rule.md - [プロジェクト名] E2Eテストルール

## このプロジェクトの特性

### HTML構造
- data-testidの有無
- aria-labelの有無
- 使用するセレクタ戦略

### 認証方式
- 使用する認証サービス
- Page Objects構成
- URL遷移パターン

### 待機処理
- SPAレンダリング待機
- モーダルアニメーション待機
- その他必要な待機

## constants.ts 定義

### TIMEOUTS
```typescript
export const TIMEOUTS = {
  // プロジェクト固有のタイムアウト値
}
```

### SELECTORS
```typescript
export const SELECTORS = {
  // プロジェクト固有のセレクタ
}
```

## 禁止事項

- 認証情報のハードコード
- タイムアウト値のハードコード
- 共通セレクタのハードコード

## 成功パターン

### test1: ログインフロー
（実装例）

### test2: データ作成フロー
（実装例）
```

### 12.3 継続的な改善

```
1. テスト実行
   ↓
2. 不備発見（エラー、曖昧さ）
   ↓
3. 原因分析
   ↓
4. e2e_Main-rule.mdにルール追記
   ↓
5. AIが次回から正しいコードを生成
```

---

## 付録

### A. Playwright設定例

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src/tests',
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
```

### B. 参考資料

- [Playwright公式ドキュメント](https://playwright.dev/)
- [Page Object Model](https://playwright.dev/docs/pom)
- [Best Practices](https://playwright.dev/docs/best-practices)

---

**最終更新**: 2025-11-06  
**バージョン**: 2.0 (汎用版)  
**管理者**: QA Team

**変更履歴**
- v2.0 (2025-11-06): プロジェクト固有記述を削除、汎用版に改訂
- v1.0 (2025-09-30): 初版作成
