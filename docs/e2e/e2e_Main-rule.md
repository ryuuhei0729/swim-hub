# e2e_Main-rule.md - E2Eテストプロジェクト メインルールブック

**プロジェクト名**: E2E Test Framework  
**対象環境**: Playwright + TypeScript  
**最終更新**: 2025-11-06

---

## 📘 このドキュメントについて

### 目的と位置づけ

このドキュメントは、**AIによるコード生成とレビューのルールエンジン**として機能します：

```
┌──────────────────────────────────────┐
│ 人間：自然言語で指示                 │
│ 「ログイン機能のテストを作って」     │
└──────────────────────────────────────┘
           ↓
┌──────────────────────────────────────┐
│ Cursor                               │
│ → このe2e_Main-rule.mdを参照         │
│ → Playwrightコード生成               │
└──────────────────────────────────────┘
           ↓
┌──────────────────────────────────────┐
│ テスト実行 → 不備発見                │
│ → 曖昧さ/未定義条件を特定            │
│ → ルール化して追記                   │
└──────────────────────────────────────┘
           ↓
┌──────────────────────────────────────┐
│ AIレビュー（Cursor）                 │
│ → ルール準拠をチェック               │
└──────────────────────────────────────┘
```

### ドキュメント構成

このプロジェクトは**4つのルールブック**で構成されています：

| ドキュメント | 役割 | 行数 |
|-------------|------|------|
| **e2e_Main-rule.md** (本書) | メインルールブック・必須事項 | 400行 |
| **[e2e_Selectors.md](./e2e_Selectors.md)** | セレクタ戦略・パターン集 | 400行 |
| **[e2e_Patterns.md](./e2e_Patterns.md)** | 実装パターン・成功事例 | 400行 |
| **[e2e_FAQ.md](./e2e_FAQ.md)** | トラブルシューティング | 300行 |
| **[e2e_4R-flamework.md](./e2e_4R-flamework.md)** | 4層アーキテクチャ技術標準（全プロジェクト共通） | 参考 |

### 優先順位

**矛盾する場合の優先順位**：
1. **e2e_Main-rule.md（本書）** - 必須ルール・禁止事項
2. **e2e_Selectors.md / e2e_Patterns.md** - プロジェクト固有の実装方法
3. **e2e_4R-flamework.md** - 汎用的なベストプラクティス（参考）

---

## 🎯 プロジェクト概要

### 基本情報

このプロジェクトは、**シナリオE2E検証**を行うためのテストフレームワークです。

**技術スタック**：
- Playwright（E2Eテストフレームワーク）
- TypeScript
- Auth0（外部認証）

**開発フロー**：
- 自然言語での指示 → AI（Cursor）がコード生成
- テスト実行 → 不備発見 → ルール化
- AIレビュー → ルール準拠チェック

### アーキテクチャ

このプロジェクトは**4層アーキテクチャ**に基づいています：

```
Layer 4: Config/Env     → 環境設定・環境変数管理
Layer 3: Tests          → 期待結果検証（AAA パターン）
Layer 2: Actions        → ビジネスロジック・複数画面フロー
Layer 1: Page Objects   → UI要素定義・基本操作
```

**詳細は**：👉 **[e2e_4R-flamework.md](./e2e_4R-flamework.md)**

---

## 🚨 § 2. 絶対に守るべき必須ルール

### 2.1 セキュリティルール（MUST）

#### ❌ 禁止：認証情報のハードコード

```typescript
// ❌ 絶対禁止
const email = 'user@example.com';
const password = 'password123';
```

#### ✅ 必須：環境変数から読み込み

```typescript
// ✅ 正しい実装
import { EnvConfig } from '../config/env';

const env = EnvConfig.getTestEnvironment();
const email = env.credentials.email;
const password = env.credentials.password;
```

**対象となる機密情報**：
- メールアドレス
- パスワード
- 認証トークン
- APIキー
- テスト対象URL（環境ごとに異なる場合）

**レビューポイント**：
- `.env`ファイルが`.gitignore`に含まれているか
- コード内にハードコードされた認証情報がないか

---

### 2.2 定数管理ルール（MUST）

**ルール化の背景**：
- **日付**: 2025-10-20
- **発見**: タイムアウト値が各ファイルでバラバラ（2000ms, 5000ms, 10000ms...）
- **問題**: 環境変更時に修正箇所が多く、漏れが発生
- **結論**: constants.tsで一元管理する方針に決定

#### ❌ 禁止：数値・共通セレクタのハードコード

```typescript
// ❌ タイムアウト値のハードコード（禁止）
await page.waitForTimeout(2000);
await this.emailInput.waitFor({ state: 'visible', timeout: 10000 });

// ❌ 共通セレクタのハードコード（禁止）
this.modal = page.locator('[role="dialog"]');
this.submitButton = page.locator('button[type="submit"]');
```

#### ✅ 必須：constants.tsからインポート

```typescript
import { TIMEOUTS, SELECTORS } from '../config/constants';

// ✅ 正しい実装
await page.waitForTimeout(TIMEOUTS.AUTH0_STABILIZATION);
await this.emailInput.waitFor({ state: 'visible', timeout: TIMEOUTS.DEFAULT });

this.modal = page.locator(SELECTORS.MODAL);
this.submitButton = page.locator(SELECTORS.SUBMIT_BUTTON);
```

**定義されている定数**：

```typescript
// タイムアウト値
export const TIMEOUTS = {
  DEFAULT: 10000,              // デフォルトタイムアウト
  LONG: 30000,                 // 長いタイムアウト
  SHORT: 5000,                 // 短いタイムアウト
  AUTH0_STABILIZATION: 2000,   // Auth0画面の安定化待ち
  MODAL_ANIMATION: 1000,       // モーダルアニメーション完了待ち
  SPA_RENDERING: 2000,         // SPAレンダリング完了待ち
  REDIRECT: 3000,              // リダイレクト完了待ち
} as const;

// 共通セレクタ（複数ページで使用されるもの）
export const SELECTORS = {
  MODAL: '[role="dialog"]',
  SUBMIT_BUTTON: 'button[type="submit"]',
  // ページ固有セレクタはe2e_Selectors.md参照
} as const;
```

**レビューポイント**：
- Page Objects、Actionsの冒頭で`import { TIMEOUTS, SELECTORS }`しているか
- 数値が直接記述されていないか（`2000`, `10000`など）
- 共通セレクタが直接記述されていないか

**🚨 特に重要：コード修正・追加時の注意**：
- ❌ エラー修正時に「とりあえず動かす」ために数値をハードコードしない
- ❌ 新機能追加時に既存の定数を確認せずに数値を書かない
- ✅ 新しいタイムアウト値が必要な場合：
  1. まず`constants.ts`に定数を追加（例: `KEEP_BROWSER_OPEN: 300000`）
  2. その後、使用箇所で`TIMEOUTS.XXX`として参照
- ✅ 既存コード修正時も必ず`constants.ts`の定数を使用

**実例（2025-11-06に発見）**：
```typescript
// ❌ 悪い例：エラー修正時にハードコード
await this.page.waitForTimeout(2000);  // CreateCourseAction.ts

// ✅ 良い例：定数を使用
await this.page.waitForTimeout(TIMEOUTS.SPA_RENDERING);
```

**詳細なセレクタ戦略**：👉 **[e2e_Selectors.md](./e2e_Selectors.md)**

---

### 2.3 禁止事項まとめ

| 禁止事項 | 理由 | 代替手段 |
|---------|------|----------|
| 認証情報のハードコード | セキュリティリスク | 環境変数（.env） |
| タイムアウト値のハードコード | 保守性低下 | TIMEOUTS定数 |
| 共通セレクタのハードコード | 一貫性欠如 | SELECTORS定数 |
| `.first()`の安易な使用 | 保守性低下 | 具体的なセレクタ |
| `text=`ロケータ | このプロジェクトで動作しない | CSSセレクタ + :has-text() |
| セマンティックロケータ | HTMLに属性が不足 | CSSセレクタ |

---

## 📁 § 3. ディレクトリ構成

```
src/
├── config/                    # Layer 4: 環境設定
│   ├── env.ts                # 環境変数管理
│   └── constants.ts          # 定数定義（TIMEOUTS, SELECTORS）
├── pages/                    # Layer 1: Page Objects
│   ├── BasePage.ts           # 基底クラス
│   ├── TermsPage.ts          # 利用規約ページ
│   ├── Auth0LoginPage.ts     # Auth0ログインページ
│   └── CoursePage.ts         # コース一覧ページ
├── actions/                  # Layer 2: Actions
│   ├── BaseAction.ts         # 基底クラス
│   ├── LoginAction.ts        # ログインフロー
│   └── CreateCourseAction.ts # コース作成フロー
└── tests/                    # Layer 3: Tests
    └── scenarios/
        └── createCourse.spec.ts
```

---

## 🎨 § 4. このプロジェクトの特性

### 4.1 HTML構造の特徴

**ルール化の背景**：
- **日付**: 2025-10-01
- **発見**: Playwrightの推奨セレクタ（data-testid、セマンティック）が使えない
- **原因**: 既存HTMLに`data-testid`、`aria-label`等の属性が不足
- **試行錯誤**: フロントエンドチームに属性追加を依頼したが、優先度の問題で対応困難
- **結論**: CSSセレクタで実装する方針

**このプロジェクトでの制約**：
- ❌ `data-testid`属性がほぼ存在しない
- ❌ `aria-label`、`label`要素が不足
- ❌ セマンティックロケータ（getByRole等）が動作しない

**対応策**：
- ✅ CSSセレクタ + `:has-text()` / `:text-is()`
- ✅ 属性セレクタ（name, type）
- ✅ 親要素で絞り込み

**詳細**：👉 **[e2e_Selectors.md § 1-2](./e2e_Selectors.md)**

---

### 4.2 認証フローの特性

**このプロジェクトの認証**：Auth0による外部認証

```
1. 利用規約ページ（yaicchi.stg-lms.globis.co.jp/login）
   ↓ 利用規約チェック → メールログインボタン
2. Auth0ログインページ（login.stg-lms.globis.co.jp）← 外部ドメイン
   ↓ メール・パスワード入力 → ログインボタン
3. アプリケーション（コース一覧画面など）
```

**重要**：外部ドメインへの遷移があるため、以下が必須：
- Page Objectsの分離（TermsPage / Auth0LoginPage）
- URL遷移の明示的な待機
- 画面安定化の待機

**詳細**：👉 **[e2e_Patterns.md § 1](./e2e_Patterns.md)**

---

### 4.3 SPA特性

このプロジェクトはReact SPAのため、以下の特性があります：

**問題**：`networkidle`後もレンダリング遅延が発生

**対応**：
```typescript
// networkidle + waitForTimeout の組み合わせ
await page.waitForLoadState('networkidle');
await page.waitForTimeout(TIMEOUTS.SPA_RENDERING); // 2000ms
```

**詳細**：👉 **[e2e_Patterns.md § 2](./e2e_Patterns.md)**

---

## 🧪 § 5. テストコード品質ルール

### 5.1 AAAパターン（必須）

```typescript
test('コース作成テスト', async ({ page }) => {
  // Arrange: テスト準備
  const env = EnvConfig.getTestEnvironment();
  const courseName = `テストコース_${Date.now()}`;
  
  // Act: 操作実行
  await loginAction.execute(url, env.credentials.email, env.credentials.password);
  await createCourseAction.execute(courseName);
  
  // Assert: 結果検証
  await expect(page.getByText(courseName)).toBeVisible();
});
```

### 5.2 コード生成後の内部テスト（必須）

テストコードを生成・修正したら、**必ず実行して動作確認**すること。

```bash
# テスト実行
npm test

# 特定のテストのみ
npx playwright test src/tests/scenarios/login.spec.ts

# ヘッドモードで確認
npm run test:headed
```

### 5.3 データクリーンアップ（推奨）

テスト後、作成したデータは削除すること：

```typescript
test.afterEach(async ({ page }) => {
  // クリーンアップ処理
  await cleanupTestData();
});
```

---

## 📋 § 6. AIレビューチェックリスト

Cursorがコードレビューする際は、以下を確認すること：

### 必須チェック（違反 = MUST FIX）

#### ✅ セキュリティ
- [ ] 認証情報がハードコードされていない
- [ ] `.env`ファイルが`.gitignore`に含まれている

#### ✅ 定数管理
- [ ] **constants.tsからTIMEOUTS、SELECTORSをインポートしている**
- [ ] タイムアウト値が直接記述されていない（`2000`, `10000`など）
- [ ] 共通セレクタが直接記述されていない（`'button[type="submit"]'`など）

#### ✅ ロケータ
- [ ] `text=`ロケータを使用していない
- [ ] CSSセレクタ + `:has-text()` / `:text-is()` を使用している
- [ ] 共通セレクタは`SELECTORS`から読み込んでいる

---

### 推奨チェック（違反 = SHOULD FIX）

#### ✅ コード品質
- [ ] **`.first()`使用時にコメントあり**
  - なぜ最初の要素で良いか説明
  - TODO でリファクタリング計画を明記
  
- [ ] **waitForTimeout使用時にコメントあり**
  - なぜ必要か説明
  - TIMEOUTS定数を使用

#### ✅ テスト品質
- [ ] AAAパターンに従っている
- [ ] 結果検証が実装されている
- [ ] データクリーンアップが実装されている（必要な場合）

---

### 情報チェック（違反 = INFO）

- [ ] **成功パターンを参照しているか**
  - test2（ログインフロー）
  - test_fujioka（セレクタ定義）
  - test5（モーダル処理）

---

## 📚 § 7. 詳細ドキュメント参照

コード生成・実装の詳細は、以下のドキュメントを参照してください：

### 🎯 セレクタ戦略
👉 **[e2e_Selectors.md](./e2e_Selectors.md)**
- このプロジェクトのロケータ戦略
- constants.tsのセレクタ定義集
- `.first()`削減パターン
- 新しいセレクタパターンの追記

### 🔄 実装パターン
👉 **[e2e_Patterns.md](./e2e_Patterns.md)**
- Auth0外部認証フロー
- 待機処理パターン（SPA、モーダル）
- 成功実装パターン集（test2, test_fujioka, test5）
- 新しいパターンの追記

### 🔧 トラブルシューティング
👉 **[e2e_FAQ.md](./e2e_FAQ.md)**
- よくあるエラーと解決策
- エラーメッセージ別対処法
- レビューでよく指摘される問題
- 新しいエラー対処の追記

### 📖 アーキテクチャ詳細
👉 **[e2e_4R-flamework.md](./e2e_4R-flamework.md)**
- 4層アーキテクチャの詳細
- Page Objects / Actions / Tests の作成方法
- 汎用的なベストプラクティス

---

## 🚀 § 8. 開発コマンド

```bash
# テスト実行
npm test                    # 全テスト実行
npm run test:headed         # ブラウザ表示モード
npm run test:debug          # デバッグモード
npm run test:ui             # Playwright UI モード

# レポート表示
npm run report              # HTML レポート表示
```

---

## ✅ § 9. クイックチェックリスト

### Page Object 作成時
- [ ] `import { TIMEOUTS, SELECTORS } from '../config/constants';` を追加
- [ ] `readonly`でロケーター定義
- [ ] CSSセレクタ + :has-text() を使用
- [ ] 共通セレクタは`SELECTORS`から読み込み
- [ ] `.first()`は極力避ける（使用時はコメント必須）

### Action 作成時
- [ ] `import { TIMEOUTS } from '../config/constants';` を追加
- [ ] Page Objectsをプライベートフィールドで保持
- [ ] 状態ベース待機 + waitForTimeout を組み合わせ
- [ ] waitForTimeout使用時は理由をコメント

### Test 作成時
- [ ] AAAパターンに従う
- [ ] 環境変数から認証情報を取得
- [ ] 結果検証を実施
- [ ] **実行して動作確認完了**（最重要！）

---

## 📝 § 10. ルールの追加・更新

### 新しいルールの追加方法

1. **テスト実行で不備を発見**
2. **原因を特定**：曖昧さ？未定義条件？
3. **適切なドキュメントに追記**：
   - セレクタ関連 → `e2e_Selectors.md`
   - パターン関連 → `e2e_Patterns.md`
   - エラー対処 → `e2e_FAQ.md`
4. **ルール化の背景を記録**：
   - 日付、発見内容、原因、試行錯誤、結論

### 汎用化のフロー

定期的（月次または四半期）に棚卸しを実施：

```
1. e2e_xxx.mdをレビュー
   ↓
2. 他プロジェクトでも使えるパターンを特定
   ↓
3. e2e_4R-flamework.mdへ移動（具体例として）
   ↓
4. e2e_xxx.mdから削除 or 参照リンクに置き換え
```

---

**最終更新**: 2025-11-06  
**管理者**: QA Team

**変更履歴**
- v2.0 (2025-11-06): AI運用最適化構造に再構成、4ファイル分割
- v1.3 (2025-11-05): test_fujioka風セレクタ定義追加
- v1.2 (2025-11-04): 定数管理ルール強化
- v1.1 (2025-10-09): 初版作成
