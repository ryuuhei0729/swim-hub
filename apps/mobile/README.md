# Swim Hub Mobile

水泳選手マネジメントシステム - モバイルアプリケーション

## 環境構築

### 必要な環境

- Node.js 20.x
- pnpm 9以上
- Expo CLI（グローバルインストール不要、pnpm execで実行）

### セットアップ

1. 依存関係のインストール（ルートディレクトリから）
```bash
pnpm install
```

2. 環境変数の設定

環境変数ファイルは以下の構成になっています：

- `.env.development` - 開発環境用（共有設定、git管理される）
- `.env.example` - テンプレート（git管理される）
- `.env.production` - 本番環境用（共有設定、git管理される）
- `.env.local` - 個人固有の設定（git管理されない、手動で作成）

**初回セットアップ**:
```bash
# .env.exampleをコピーして.env.localを作成
cd apps/mobile
cp .env.example .env.local
```

`.env.local`ファイルを編集して、必要に応じて個人固有の設定を追加してください。

**注意**: 
- `.env.local`ファイルは`apps/mobile`ディレクトリのルート（`package.json`と同じ階層）に配置してください
- Expoは自動的に環境に応じて適切な`.env`ファイルを読み込みます（開発時は`.env.development`、本番ビルド時は`.env.production`）
- `.env.local`は他の環境変数ファイルより優先されます

3. 開発サーバーの起動
```bash
# ルートディレクトリから
pnpm run dev:mobile

# または、apps/mobileディレクトリから
cd apps/mobile
pnpm start
```

## スクリプト

### 開発用

- `pnpm start` - Expo開発サーバーを起動
- `pnpm run android` - Androidエミュレータで起動
- `pnpm run ios` - iOSシミュレータで起動
- `pnpm run web` - Webブラウザで起動
- `pnpm run type-check` - TypeScriptの型チェック
- `pnpm run lint` - ESLintの実行
- `pnpm run clean` - キャッシュをクリア

### プロダクションビルド（EAS Build）

プロダクションビルドには **EAS CLI** が必要です。

#### EAS CLI のセットアップ

```bash
# グローバルインストール
pnpm install --global eas-cli

# Expo アカウントでログイン
eas login

# プロジェクトの設定（初回のみ）
eas build:configure
```

#### ビルドコマンド

- `pnpm run build:mobile:android` - Android向けプロダクションビルド（EAS Build）
- `pnpm run build:mobile:ios` - iOS向けプロダクションビルド（EAS Build）

**CI/CD 環境での認証**:
CI/CD パイプラインでは、`EXPO_TOKEN` 環境変数を使用して認証してください：

```bash
# Expo トークンの生成（ローカル環境で実行）
eas token:create

# CI/CD 環境変数に設定
export EXPO_TOKEN=your_token_here
```

## 技術スタック

- **フレームワーク**: React Native + Expo SDK 54
- **言語**: TypeScript 5.9
- **React**: 19.1.0
- **React Native**: 0.81.5
- **状態管理**: Zustand + React Query
- **ナビゲーション**: React Navigation
- **バックエンド**: Supabase

## モノレポ構成

このプロジェクトはモノレポ構成で、`apps/shared`パッケージを共通利用しています。

- `apps/shared` - Web/Mobile共通のAPI層、型定義、React Queryフック
- `apps/web` - Next.js Webアプリケーション
- `apps/mobile` - React Nativeモバイルアプリケーション
