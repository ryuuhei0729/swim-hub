# 認証システムリファクタリング要件定義書

## 1. 背景・目的

### 1.1 背景
- App Store審査において **Guideline 4.8 (Login Services)** に抵触
- サードパーティログイン（Google）を提供している場合、**Sign in with Apple** の実装が必須
- 現状、ユーザーが「Google / Apple / メールアドレス、どれで登録したっけ？」と迷う問題がある

### 1.2 目的
1. App Storeガイドライン 4.8 への準拠（Sign in with Apple の追加）
2. **アカウントリンク機能**により、ログイン方法を意識せずに使えるUXを実現

---

## 2. 現状の認証方式

### 2.1 モバイルアプリ (iOS/Android)
| 方式 | 状態 |
|------|------|
| メールアドレス・パスワード | ✅ 実装済み |
| Google ログイン | ✅ 実装済み |
| Apple ログイン | ❌ 未実装 |

### 2.2 Webアプリ
| 方式 | 状態 |
|------|------|
| メールアドレス・パスワード（サインイン/サインアップ） | ✅ 実装済み |
| Google ログイン | ✅ 実装済み |
| Apple ログイン | ❌ 未実装 |

---

## 3. 目標の認証方式

### 3.1 モバイルアプリ (iOS/Android)
| 方式 | 状態 |
|------|------|
| メールアドレス・パスワード | ✅ 維持 |
| Google ログイン | ✅ 維持 |
| Apple ログイン | ✅ **新規追加** |

### 3.2 Webアプリ
| 方式 | 状態 |
|------|------|
| メールアドレス・パスワード | ✅ 維持 |
| Google ログイン | ✅ 維持 |
| Apple ログイン | ✅ **新規追加** |

---

## 4. 機能要件

### 4.1 Sign in with Apple 実装

#### 4.1.1 iOS（React Native / Expo）
- `expo-apple-authentication` を使用
- ネイティブのApple認証UIを表示
- 取得する情報：
  - ユーザーID（Apple ID）
  - メールアドレス（ユーザーが「メールを非公開」を選択した場合はリレーメール）
  - 名前（初回のみ取得可能）

#### 4.1.2 Web
- Supabase の OAuth フローを使用
- ポップアップまたはリダイレクト方式

#### 4.1.3 Supabase 設定
- Apple プロバイダーを有効化
- Apple Developer Console で以下を設定：
  - App ID（Sign in with Apple 有効化）
  - Service ID（Web用）
  - Key（秘密鍵）

### 4.2 アカウントリンク機能

#### 4.2.1 概要
同じメールアドレスを持つ複数の認証プロバイダーを、1つのユーザーアカウントに統合する。

#### 4.2.2 動作仕様

```
シナリオ1: Google → Apple
  1. ユーザーがGoogleでログイン（メール: test@gmail.com）
  2. 新規アカウント作成
  3. 後日、同じユーザーがAppleでログイン（同じメール: test@gmail.com）
  4. 既存アカウントに自動リンク → 同じアカウントにログイン ✅

シナリオ2: メアド・パスワード → Google
  1. ユーザーがメアド・パスワードで登録（メール: test@gmail.com）
  2. 後日、同じユーザーがGoogleでログイン（同じメール: test@gmail.com）
  3. 既存アカウントに自動リンク → 同じアカウントにログイン ✅

シナリオ3: Apple「メールを非公開」使用時
  1. ユーザーがAppleでログイン（リレーメール: xyz@privaterelay.appleid.com）
  2. 新規アカウント作成
  3. 後日、同じユーザーがGoogleでログイン（メール: test@gmail.com）
  4. メールアドレスが異なるため、別アカウントとして作成
```

#### 4.2.3 Supabase 設定
Supabase Dashboard > Authentication > Providers で以下を設定：
- **「Automatically link accounts」** を有効化（同じメールで自動リンク）

---

## 5. UI/UX 仕様

### 5.1 ログイン画面（モバイル）

```
┌─────────────────────────────────┐
│                                 │
│           SwimHub               │
│         ログイン                │
│                                 │
│  ┌─────────────────────────┐    │
│  │ メールアドレス           │    │
│  └─────────────────────────┘    │
│  ┌─────────────────────────┐    │
│  │ パスワード              │    │
│  └─────────────────────────┘    │
│                                 │
│  ┌─────────────────────────┐    │
│  │       ログイン           │    │
│  └─────────────────────────┘    │
│                                 │
│  ─────────── または ───────────  │
│                                 │
│  ┌─────────────────────────┐    │
│  │  🍎 Appleでログイン      │    │  ← 新規追加
│  └─────────────────────────┘    │
│                                 │
│  ┌─────────────────────────┐    │
│  │  G  Googleでログイン     │    │
│  └─────────────────────────┘    │
│                                 │
└─────────────────────────────────┘
```

### 5.2 ログイン画面（Web）

```
┌─────────────────────────────────┐
│                                 │
│           SwimHub               │
│         ログイン                │
│                                 │
│  ┌─────────────────────────┐    │
│  │ メールアドレス           │    │
│  └─────────────────────────┘    │
│  ┌─────────────────────────┐    │
│  │ パスワード              │    │
│  └─────────────────────────┘    │
│                                 │
│  ┌─────────────────────────┐    │
│  │       ログイン           │    │
│  └─────────────────────────┘    │
│                                 │
│  ─────────── または ───────────  │
│                                 │
│  ┌─────────────────────────┐    │
│  │  G  Googleでログイン     │    │
│  └─────────────────────────┘    │
│                                 │
│  ┌─────────────────────────┐    │
│  │  🍎 Appleでログイン      │    │  ← 新規追加
│  └─────────────────────────┘    │
│                                 │
└─────────────────────────────────┘
```

### 5.3 ボタンデザイン要件
- **Appleボタン**: [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple) に準拠
  - 黒背景 + 白文字、または白背景 + 黒文字
  - Appleロゴを使用
  - 高さ: 44pt以上
  - Googleボタンと同等のサイズ・配置

---

## 6. 技術仕様

### 6.1 必要なパッケージ

#### モバイル
```bash
npx expo install expo-apple-authentication
```

#### Web
- Supabase の OAuth フローを使用（追加パッケージ不要）

### 6.2 Apple Developer Console 設定

1. **Certificates, Identifiers & Profiles** > **Identifiers**
   - App ID で「Sign in with Apple」を有効化

2. **Services ID** を作成（Web用）
   - Identifier: `com.swimhub.web`（任意）
   - Return URLs: `https://<supabase-project-ref>.supabase.co/auth/v1/callback`

3. **Keys** を作成
   - 「Sign in with Apple」を有効化
   - 秘密鍵をダウンロード（.p8ファイル）

### 6.3 Supabase 設定

1. **Authentication** > **Providers** > **Apple**
   - Enabled: ON
   - Client ID (iOS): App ID (例: `com.swimhub.app`)
   - Client ID (Web): Service ID (例: `com.swimhub.web`)
   - Secret Key: .p8ファイルの内容
   - Key ID: Apple Developer Console で確認
   - Team ID: Apple Developer Console で確認

2. **Authentication** > **Settings** > **Auth Providers**
   - 「Automatically link accounts」を有効化

### 6.4 環境変数

```env
# 既存（変更なし）
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## 7. 実装タスク

### Phase 1: 準備・設定
- [ ] Apple Developer Console で App ID に Sign in with Apple を有効化
- [ ] Apple Developer Console で Service ID を作成（Web用）
- [ ] Apple Developer Console で Key を作成
- [ ] Supabase Dashboard で Apple プロバイダーを設定
- [ ] Supabase Dashboard で「Automatically link accounts」を有効化

### Phase 2: モバイル実装
- [ ] `expo-apple-authentication` をインストール
- [ ] `AppleLoginButton` コンポーネントを作成
- [ ] `useAppleAuth` フックを作成
- [ ] `LoginForm.tsx` に Apple ログインボタンを追加
- [ ] iOS 実機でテスト

### Phase 3: Web実装
- [ ] `AuthForm.tsx` に Apple ログインボタンを追加
- [ ] Apple OAuth フロー実装（Supabase `signInWithOAuth`）
- [ ] Webでテスト

### Phase 4: テスト・リリース
- [ ] アカウントリンクのテスト（Google → Apple、Apple → Google）
- [ ] App Store スクリーンショット更新
- [ ] App Store 再審査申請

---

## 8. テストケース

### 8.1 Sign in with Apple
| # | テスト内容 | 期待結果 |
|---|-----------|----------|
| 1 | 新規ユーザーがAppleでログイン | アカウント作成、ダッシュボードに遷移 |
| 2 | 既存ユーザーがAppleでログイン | 既存アカウントにログイン |
| 3 | 「メールを非公開」でログイン | リレーメールでアカウント作成 |

### 8.2 アカウントリンク
| # | テスト内容 | 期待結果 |
|---|-----------|----------|
| 1 | Googleで登録 → 同じメールでAppleログイン | 同じアカウントにログイン |
| 2 | Appleで登録 → 同じメールでGoogleログイン | 同じアカウントにログイン |
| 3 | メアドで登録 → 同じメールでGoogleログイン | 同じアカウントにログイン |

---

## 9. リスクと対策

| リスク | 対策 |
|--------|------|
| Apple「メールを非公開」でアカウント分離 | ユーザーに「メールを公開」を推奨する案内を表示 |
| Apple 審査で再度リジェクト | ガイドラインを厳密に遵守、ボタンサイズ・配置を確認 |
| iOS シミュレータでテスト不可 | 実機テストが必須（Apple 認証はシミュレータ非対応） |

---

## 10. 参考リンク

- [Apple Human Interface Guidelines - Sign in with Apple](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple)
- [Supabase - Apple OAuth](https://supabase.com/docs/guides/auth/social-login/auth-apple)
- [Expo Apple Authentication](https://docs.expo.dev/versions/latest/sdk/apple-authentication/)
- [App Store Review Guidelines 4.8](https://developer.apple.com/app-store/review/guidelines/#login-services)
