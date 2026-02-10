# Apple Sign In メンテナンスガイド

## 概要

Apple Sign In の Client Secret (JWT) は**最大6ヶ月**で期限切れになります。
期限切れになると Web での Apple ログインが失敗するため、定期的な更新が必要です。

---

## 期限切れの確認方法

### 症状
- Web で「Appleでログイン」ボタンを押すとエラーになる
- Supabase のログに `invalid_client` エラーが記録される

### 現在の有効期限
JWT 生成時にコンソールに表示されます。次回更新予定日をカレンダーに登録しておくことを推奨します。

---

## 更新手順

### 1. JWT を再生成

```bash
cd /Users/ryuuhei_0729/swim-hub
node scripts/generate-apple-client-secret.js
```

### 2. Supabase Dashboard で更新

1. [Supabase Dashboard](https://supabase.com/dashboard) にログイン
2. プロジェクトを選択
3. **Authentication** > **Providers** > **Apple**
4. **Secret Key** フィールドに新しい JWT を貼り付け
5. **Save** をクリック

### 3. 動作確認

Web で Apple ログインをテストして、正常に動作することを確認。

---

## 設定値一覧（参照用）

| 項目 | 値 |
|------|-----|
| Team ID | `TVJ2JG75MZ` |
| Key ID | `QKK8K4ST76` |
| Service ID (Web) | `app.swimhub.web` |
| App ID (iOS) | `app.swimhub` |
| .p8 ファイル | `AuthKey_QKK8K4ST76.p8` |

---

## 関連ファイル

| ファイル | 用途 |
|----------|------|
| `scripts/generate-apple-client-secret.js` | JWT 生成スクリプト |
| `AuthKey_QKK8K4ST76.p8` | Apple 秘密鍵（Git 管理外） |
| `docs/specs/auth-refactoring.md` | 認証システム仕様書 |

---

## トラブルシューティング

### .p8 ファイルが見つからない

```
Error: .p8 ファイルが見つかりません
```

→ プロジェクトルートに `AuthKey_QKK8K4ST76.p8` を配置してください。
紛失した場合は Apple Developer Console で新しい Key を作成する必要があります。

### Key が Revoke されている

Apple Developer Console で Key が無効化されている場合：
1. **Keys** > 新しい Key を作成
2. **Sign in with Apple** を有効化
3. `.p8` ファイルをダウンロード
4. `scripts/generate-apple-client-secret.js` の `KEY_ID` を更新
5. JWT を再生成して Supabase に登録

---

## リマインダー設定（推奨）

JWT 生成後、以下のリマインダーを設定してください：

- **5ヶ月後**: 「Apple Sign In の JWT を更新する」
- カレンダーやタスク管理ツールに登録

---

## 参考リンク

- [Apple Developer Console](https://developer.apple.com/account)
- [Supabase Dashboard](https://supabase.com/dashboard)
- [Supabase Apple OAuth ドキュメント](https://supabase.com/docs/guides/auth/social-login/auth-apple)
