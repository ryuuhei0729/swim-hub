# e2e_Selectors.md - セレクタ戦略・パターン集

**最終更新**: 2025-11-06

---

## 📘 このドキュメントについて

このドキュメントは、**このプロジェクト固有のセレクタ戦略とパターン**を記載しています。

**対象**：
- Cursorによるコード生成
- AIレビュー時の基準
- 開発者の実装時の参照

**メインルールブック**：👉 [e2e_Main-rule.md](./e2e_Main-rule.md)

---

## § 1. このプロジェクトのセレクタ戦略

### 1.1 ルール化の背景

**日付**: 2025-10-01  
**発見**: Playwright推奨のセレクタ（data-testid、セマンティック）が動作しない  
**原因**: 既存HTMLに以下の属性が不足：
- `data-testid`属性
- `aria-label`属性
- 適切な`label`要素
- セマンティックな`role`属性

**試行錯誤**: フロントエンドチームに属性追加を依頼 → 優先度の問題で対応困難  
**結論**: CSSセレクタで実装する方針に決定

---

### 1.2 このプロジェクトでのセレクタ優先順位

| 優先順位 | セレクタ種類 | 使用可否 | 理由 |
|---------|------------|---------|------|
| ❌ 1 | data-testid | **使用不可** | HTMLに存在しない |
| ❌ 2 | セマンティック（getByRole等） | **使用不可** | aria-label等が不足 |
| ✅ 3 | CSSセレクタ + :has-text() | **推奨** | 動作する |
| ✅ 4 | CSSセレクタ + :text-is() | **推奨** | XPath置き換えに最適 |
| ✅ 5 | 属性セレクタ（name, type） | **推奨** | フォーム要素に有効 |
| ✅ 6 | 親要素絞り込み + :has-text() | **推奨** | モーダル内要素に有効 |

---

### 1.3 基本セレクタパターン

#### ✅ 推奨パターン1：:has-text()（部分一致）

```typescript
// ボタン
page.locator('button:has-text("ログイン")')
page.locator('button:has-text("コースを作成")')

// リンク
page.locator('a:has-text("マイページ")')
```

**注意**：部分一致のため、複数要素がマッチする可能性あり

#### ✅ 推奨パターン2：:text-is()（完全一致）

```typescript
// XPath text()='...' の置き換えに最適
page.locator('span:text-is("マイページ")')
page.locator('span:text-is("TypeScript入門（前編：始め方と関数宣言）")')
```

**用途**：XPath の `text()='...'` を置き換える場合

#### ✅ 推奨パターン3：属性セレクタ

```typescript
// name属性（Auth0フォーム）
page.locator('input[name="username"]')
page.locator('input[name="password"]')

// type属性
page.locator('input[type="email"]')
page.locator('input[type="checkbox"]')
```

#### ✅ 推奨パターン4：親要素で絞り込み

```typescript
// モーダル内のボタン
page.locator('[role="dialog"] button:has-text("保存")')
page.locator('[role="dialog"] input[type="checkbox"]')
```

---

### 1.4 XPath → CSS変換の注意点

**重要**：`text()='...'` と `:has-text()` は動作が異なる！

```typescript
// ❌ 間違い：完全一致 → 部分一致
page.locator(`//span[text()='ログイン']`)
→ page.locator(`span:has-text("ログイン")`) // 「ログインする」「再ログイン」もマッチ！

// ✅ 正しい：完全一致 → 完全一致
page.locator(`//span[text()='ログイン']`)
→ page.locator(`span:text-is("ログイン")`) // 「ログイン」のみマッチ
```

---

## § 2. constants.ts セレクタ定義集

### 2.1 セレクタ定義の方針

**原則**：静的なセレクタは、一意に特定できるように具体的に定義し、`.first()`を削減する

#### ❌ 非推奨：汎用的すぎる定義

```typescript
// 古いアプローチ（非推奨）
export const SELECTORS = {
  FIRST_CHECKBOX: 'input[type="checkbox"]',  // .first()が必要
  FIRST_TEXT_INPUT: 'input[type="text"]',    // .first()が必要
}
```

#### ✅ 推奨：test_fujioka風の具体的な定義

```typescript
// 新しいアプローチ（推奨）
export const SELECTORS = {
  // モーダルなどの共通要素
  MODAL: '[role="dialog"]',
  SUBMIT_BUTTON: 'button[type="submit"]',
  
  // ページごとに具体的に定義（.first()不要）
  TERMS_AGREEMENT_CHECKBOX: 'input[type="checkbox"]:near(:text("利用規約に同意する"))',
  AUTH0_EMAIL_INPUT: 'input[name="username"]',
  AUTH0_PASSWORD_INPUT: 'input[name="password"]',
  AUTH0_SUBMIT_BUTTON: 'button[type="submit"], button:has-text("続ける"), button:has-text("ログイン")',
  
  CONFIRM_CHECKBOX: '[role="dialog"] input[type="checkbox"]:near(:text("下記事項を確認"))',
  NOMINATED_COURSE_BUTTON: '[role="dialog"] button:has-text("指名コース")',
} as const;
```

---

### 2.2 現在定義されているセレクタ

#### 共通要素

```typescript
export const SELECTORS = {
  // モーダル
  MODAL: '[role="dialog"]',
  
  // ボタン
  SUBMIT_BUTTON: 'button[type="submit"]',
  
  // その他共通要素
  // ...
} as const;
```

#### Auth0関連

```typescript
// Auth0ログインページ
AUTH0_EMAIL_INPUT: 'input[name="username"]',
AUTH0_PASSWORD_INPUT: 'input[name="password"]',
AUTH0_SUBMIT_BUTTON: 'button[type="submit"], button:has-text("続ける"), button:has-text("ログイン")',
```

#### 利用規約ページ関連

```typescript
// 利用規約同意チェックボックス
TERMS_AGREEMENT_CHECKBOX: 'input[type="checkbox"]:near(:text("利用規約に同意する"))',
```

#### モーダル内要素

```typescript
// 確認チェックボックス
CONFIRM_CHECKBOX: '[role="dialog"] input[type="checkbox"]:near(:text("下記事項を確認"))',

// 指名コースボタン
NOMINATED_COURSE_BUTTON: '[role="dialog"] button:has-text("指名コース")',
```

---

### 2.3 新しいセレクタの追加ガイドライン

新しいセレクタパターンを追加する際は、以下の形式で記録してください：

```markdown
### [追加日] - [要素名]

**発見の経緯**：
- どのテストで必要になったか
- なぜこのセレクタが必要だったか

**試行錯誤**：
- 最初に試したセレクタ → 失敗した理由
- 次に試したセレクタ → 失敗した理由
- 最終的に採用したセレクタ → 成功した理由

**セレクタ定義**：
```typescript
ELEMENT_NAME: 'selector',
```

**使用例**：
```typescript
page.locator(SELECTORS.ELEMENT_NAME)
```
```

---

## § 3. `.first()`使用ルール

### 3.1 基本方針：できる限り避ける

**`.first()`の危険性**：
- ❌ 一度テストがPassすると、誰も修正しない（技術的負債化）
- ❌ UI変更時に突然失敗し、原因特定が困難
- ❌ 保守性が著しく低下し、将来の変更コストが増大

---

### 3.2 推奨対応（優先順位順）

#### 1. **最優先**：data-testid属性の追加依頼

```markdown
フロントエンドチームに依頼：
「data-testid="terms-checkbox" を追加してください（Issue #123）」
```

#### 2. **次善策**：`:near()` セレクタで周辺要素から特定

```typescript
// ✅ 周辺テキストから一意に特定
page.locator('input[type="checkbox"]:near(:text("利用規約に同意する"))')
```

#### 3. **妥協策**：親要素で十分に絞り込んでから`.first()`

```typescript
// ✅ モーダル内に絞り込んでから.first()
page.locator('[role="dialog"] input[type="checkbox"]').first()
```

#### 4. **最終手段**：`.first()` + 詳細コメント + TODO

```typescript
// ✅ やむを得ない場合は詳細コメント必須
this.agreeCheckbox = page
  .locator('[role="dialog"] input[type="checkbox"]')
  .first();
// TODO: data-testid="terms-checkbox" の追加を依頼（Issue #123）
// 理由: モーダル内に複数チェックボックスが存在するが、
//       最初の要素が常に利用規約チェックボックスであることを確認済み（2025-10-15）
```

---

### 3.3 `.first()`削減の実例：test_fujioka vs Test5

| 項目 | Test5（改善前） | test_fujioka（改善後） |
|------|----------------|----------------------|
| **総セレクタ数** | 20個 | 6個 |
| **`.first()`使用** | 14箇所 | 1箇所（動的な値） |
| **保守性** | 低い | 高い |

**改善アプローチ**：
- 汎用的セレクタ → 具体的セレクタ
- `:near()` セレクタの活用
- 親要素での絞り込み

---

## § 4. セレクタパターン集

### 4.1 フォーム要素

#### チェックボックス

```typescript
// ✅ 推奨：周辺テキストで特定
page.locator('input[type="checkbox"]:near(:text("利用規約に同意する"))')

// ⚠️ 許容：親要素で絞り込み
page.locator('[role="dialog"] input[type="checkbox"]').first()
// TODO: より具体的なセレクタに置き換え
```

#### テキスト入力

```typescript
// ✅ 推奨：name属性で特定
page.locator('input[name="username"]')
page.locator('input[name="password"]')

// ⚠️ 許容：placeholder + 親要素
page.locator('[role="dialog"] input[placeholder*="メール"]')
```

#### ボタン

```typescript
// ✅ 推奨：テキスト + type属性
page.locator('button[type="submit"]:has-text("ログイン")')

// ✅ 推奨：親要素で絞り込み
page.locator('[role="dialog"] button:has-text("保存")')

// ✅ 許容：複数候補を指定
page.locator('button[type="submit"], button:has-text("続ける"), button:has-text("ログイン")')
```

---

### 4.2 モーダル内要素

```typescript
// モーダル表示を待つ
await page.locator(SELECTORS.MODAL).waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT });
await page.waitForTimeout(TIMEOUTS.MODAL_ANIMATION); // アニメーション完了

// モーダル内の要素を操作
await page.locator('[role="dialog"] button:has-text("保存")').click();
```

---

### 4.3 アイコンボタン（SVG）

**問題**：3点リーダーボタン（...）などのアイコンボタンには、テキストやaria-labelが無い

**解決策**：SVGアイコンの`data-icon`属性でフィルタリング

```typescript
// ✅ Ellipsisアイコンを含むボタン
page.getByRole('button').filter({ has: page.locator('svg[data-icon="ellipsis"]') })

// ✅ Editアイコンボタン
page.getByRole('button').filter({ has: page.locator('svg[data-icon="edit"]') })

// ✅ Deleteアイコンボタン
page.getByRole('button').filter({ has: page.locator('svg[data-icon="delete"]') })
```

---

### 4.4 動的な値を扱う要素

**原則**：動的な値（実行時に決まる値）は、Page Object内で処理し、`.first()`の使用もやむを得ない

```typescript
/**
 * コース名をクリック（動的な値）
 * @param courseName - クリックするコース名
 */
async clickCourseName(courseName: string): Promise<void> {
  // 注意: 動的な値のため、.first()の使用は避けられない
  // 理想的には、コースIDやdata-testid属性で特定すべき
  await this.page.locator(`a:has-text("${courseName}")`).first().click();
  // TODO: data-testid="course-{courseId}" による特定を検討（Issue #XXX）
}
```

---

## § 5. レビュー時のチェックポイント

### 5.1 MUST FIX（必須修正）

- [ ] `text=`ロケータを使用していない
- [ ] セマンティックロケータ（getByRole等）を使用していない（このプロジェクトでは動作しない）
- [ ] 共通セレクタはconstants.tsの`SELECTORS`から読み込んでいる

### 5.2 SHOULD FIX（推奨修正）

- [ ] `.first()`使用時に詳細コメント + TODO あり
- [ ] 汎用的すぎるセレクタではなく、具体的なセレクタを使用している
- [ ] `:near()` セレクタで周辺要素から特定できないか検討した

### 5.3 INFO（情報）

- [ ] 成功パターン（test_fujioka等）を参考にしている

---

## § 6. 新パターン追記エリア

### [日付] - [要素名]

**発見の経緯**：  
**試行錯誤**：  
**セレクタ定義**：  
**使用例**：  

---

**最終更新**: 2025-11-06  
**管理者**: QA Team
