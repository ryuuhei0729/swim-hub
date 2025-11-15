# 🏊 SwimHub - 水泳選手管理システム

> 水泳選手の練習・大会記録を効率的に管理し、チーム運営をサポートするWebアプリケーション

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E.svg)](https://supabase.com/)

---

## 🎯 プロジェクト概要

**SwimHub**は、水泳選手が日々の練習記録や大会記録を簡単に管理でき、チームでの情報共有を円滑にするWebアプリケーションです。

### 解決する課題

- 📝 **練習記録の管理が煩雑** → カレンダービューで一目で把握
- 🏆 **大会記録が散在** → 種目別・大会別に一元管理
- 👥 **チーム内の情報共有が困難** → お知らせ機能で効率的に共有
- 📊 **成長の可視化が難しい** → タイム推移をグラフで表示（予定）

---

## ✨ 主な機能

### 個人利用機能

#### 📅 ダッシュボード（カレンダービュー）
- 月間カレンダーで練習・大会記録を一覧表示
- 日付クリックで詳細確認
- 月間サマリー（練習回数、記録数）

#### 🏊‍♂️ 練習記録管理
- 日付・場所・練習内容の記録
- セット別の詳細入力（距離・本数・サークルタイム）
- タイム記録（セット別・本数別）
- 練習タグでカテゴリ分け（EN2、耐乳酸など）

#### 🏅 大会記録管理
- 大会情報（日付・場所・プール種別）
- 種目別記録（17種目対応）
- スプリットタイム記録
- 動画URLの添付
- リレー種目対応

### チーム利用機能

#### 👥 チーム管理
- チーム作成・招待コード発行
- メンバー管理（権限・役割設定）
- 複数チームへの所属

#### 📢 お知らせ機能
- チーム内お知らせの投稿
- 公開/非公開の切り替え
- お知らせ一覧・詳細表示

---

## 🛠️ 技術スタック

### Frontend
- **Framework**: Next.js 15（App Router）
- **Language**: TypeScript 5
- **UI Library**: React 19
- **Styling**: Tailwind CSS 3
- **State Management**: React Hooks + Context API
- **Date Handling**: date-fns 4
- **Testing**: Playwright（E2E）

### Backend
- **Database**: PostgreSQL（Supabase）
- **API**: Supabase Client（直接アクセス）
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage
- **Security**: Row Level Security（RLS）
- **Realtime**: Supabase Realtime

### Infrastructure
- **Hosting**: Vercel
- **Monorepo**: npm workspaces
- **CI/CD**: GitHub Actions（予定）

### Mobile（開発予定）
- **Framework**: React Native + Expo
- **Language**: TypeScript

---

## 🌟 技術的ハイライト

### 1. モノレポ構成
npm workspacesを活用した効率的なモノレポ管理
```
swim-hub/
├── apps/web/          # Next.jsアプリ
├── apps/mobile/       # React Native（予定）
├── packages/shared/   # 共通API・型定義
└── supabase/          # Backend
```

### 2. 共通API層
Web/Mobile共通で使えるAPI関数とカスタムフック
- 練習記録API (`practices.ts`)
- 大会記録API (`records.ts`)
- チームAPI (`teams.ts`)
- 共通カスタムフック (`usePractices`, `useRecords`, `useTeams`)

### 3. Supabase直接アクセス
シンプルで高速なデータアクセス
- GraphQL廃止により41%高速化
- コード量95%削減
- Edge Function実行コスト100%削減
- リアルタイム購読でデータ同期

### 4. Spec駆動開発 + TDD
- 仕様書ベースの開発フロー
- テストファースト開発
- Playwright E2Eテスト

### 5. セキュリティ
- Row Level Security（RLS）で個人データ保護
- 認証ミドルウェアで未認証アクセス防止
- 環境変数の適切な管理

### 6. パフォーマンス最適化
- Server Components / Client Componentsの使い分け
- React.memo / useCallback / useMemoの活用
- 動的インポートによるコード分割
- Supabase Realtimeによる効率的なデータ同期

---

## 📂 プロジェクト構成

```
swim-hub/
├── .cursor/                    # Cursor Project Rules（AI開発ルール）
│   └── rules/
│       ├── 00-general.mdc      # プロジェクト概要・開発モード
│       ├── 01-development-flow.mdc  # TDDフロー
│       ├── 02-tech-stack.mdc   # 技術スタック
│       └── 03-coding-rules.mdc # コーディング規約
├── apps/
│   ├── web/                    # Next.jsアプリケーション
│   │   ├── app/                # App Router
│   │   │   ├── (authenticated)/    # 認証後の画面
│   │   │   │   ├── dashboard/      # ダッシュボード
│   │   │   │   ├── practice/       # 練習記録
│   │   │   │   ├── competition/    # 大会記録
│   │   │   │   └── teams/          # チーム機能
│   │   │   └── (unauthenticated)/  # 認証前の画面
│   │   ├── components/         # 共有コンポーネント
│   │   ├── contexts/           # React Context
│   │   ├── hooks/              # カスタムフック（Web専用）
│   │   ├── lib/                # ユーティリティ
│   │   ├── types/              # 型定義（Web専用）
│   │   └── e2e/                # E2Eテスト
│   └── mobile/                 # React Native（開発予定）
├── packages/
│   └── shared/                 # 共通ライブラリ（Web/Mobile共通）
│       ├── api/                # 共通API関数
│       │   ├── practices.ts    # 練習記録API
│       │   ├── records.ts      # 大会記録API
│       │   ├── teams.ts        # チームAPI
│       │   └── dashboard.ts    # ダッシュボードAPI
│       ├── hooks/              # 共通カスタムフック
│       │   ├── usePractices.ts
│       │   ├── useRecords.ts
│       │   └── useTeams.ts
│       ├── types/              # 共通型定義
│       │   ├── database.ts     # DB型
│       │   └── ui.ts           # UI型
│       └── utils/              # 共通ユーティリティ
├── supabase/                   # Backend
│   ├── migrations/             # データベースマイグレーション
│   └── seed.sql                # シードデータ
├── docs/                       # ドキュメント
│   ├── PROJECT_STATUS.md       # プロジェクト状態
│   ├── GRAPHQL_MIGRATION_PLAN.md  # GraphQL移行計画
│   └── requirement.md          # 要件定義
└── package.json                # Workspaces管理
```

---

## 🚀 クイックスタート

### 前提条件
- Node.js 20.x
- npm 8以上
- Supabaseアカウント

### インストール・起動

```bash
# 1. リポジトリのクローン
git clone https://github.com/your-username/swim-hub.git
cd swim-hub

# 2. 依存関係のインストール
npm install

# 3. 環境変数の設定
cp apps/web/.env.example apps/web/.env.local
# .env.localにSupabase URLとAPIキーを設定

# 4. 開発サーバーの起動
npm run dev:web
```

ブラウザで `http://localhost:3000` を開く

---

## 💻 開発コマンド

### Webアプリ開発
```bash
npm run dev:web              # 開発サーバー起動
npm run build:web            # 本番ビルド
npm run lint:web             # Lint実行
npm run test:e2e             # E2Eテスト実行
```

### Supabase
```bash
npm run supabase:start       # ローカルSupabase起動
npm run supabase:stop        # ローカルSupabase停止
npm run supabase:reset       # データベースリセット
npm run supabase:deploy      # Edge Functionsデプロイ
```

### 全体管理
```bash
npm run lint                 # 全プロジェクトのLint
npm run type-check           # 型チェック
npm run clean                # ビルドファイル削除
```

---

## 🎨 開発プロセス

### Spec駆動開発 + TDD

このプロジェクトでは、**仕様書駆動開発**と**テスト駆動開発（TDD）**を採用しています。

```
1. 仕様書を読み込む（specs/配下）
   ↓
2. テストを書く（Red - 失敗するテスト）
   ↓
3. 実装を進める（Green - テストが通る）
   ↓
4. テストが通って初めてOK
   ↓
5. リファクタリング（Refactor）
```

### AI開発（Cursor + Claude）

Cursor Project Rulesを活用し、以下の3つのモードで開発を進めます：

- **実装計画立案モード** - 新機能開発前の詳細な計画作成
- **実装モード** - TDDに基づいた実装
- **デバッグモード** - 問題の原因分析と修正

詳細は `.cursor/rules/` 参照

---

## 📊 データベース設計

### 主要テーブル（11テーブル）

#### 個人利用関連
- `users` - ユーザー情報
- `styles` - 種目マスタ（17種目固定）
- `practices` → `practice_logs` → `practice_times` - 練習記録（3階層）
- `practice_tags` - 練習タグ
- `competitions` → `records` → `split_times` - 大会記録（3階層）

#### チーム機能関連
- `teams` - チーム
- `team_memberships` - メンバーシップ
- `team_announcements` - お知らせ

詳細は `docs/DATABASE_SCHEMA.md` 参照

---

## 🔐 セキュリティ

- **Row Level Security（RLS）**: 全テーブルに適用し、個人データを保護
- **認証ミドルウェア**: 未認証アクセスを自動的にブロック
- **環境変数の分離**: 開発環境と本番環境を完全に分離

---

## 🔮 今後の展望

### Phase 2: 個人機能の拡充
- [ ] 目標管理機能
- [ ] スケジュール管理
- [ ] 分析・統計機能
- [ ] タイム推移グラフ

### Phase 3: チーム機能の拡充
- [ ] チーム練習管理
- [ ] チーム大会管理
- [ ] チーム内ランキング

### Phase 4: モバイルアプリ
- [ ] React Native + Expo での実装
- [ ] iOS/Android対応

### Phase 5: 高度な機能
- [ ] AI分析機能
- [ ] トレーニングプラン提案
- [ ] ソーシャル機能

詳細は `docs/PROJECT_STATUS.md` 参照

---

## 📚 ドキュメント

| ドキュメント | 説明 |
|-------------|------|
| `docs/PROJECT_STATUS.md` | プロジェクトの実装状態 |
| `docs/DATABASE_SCHEMA.md` | データベーススキーマ詳細 |
| `docs/COMMON_PATTERNS.md` | よくある実装パターン |
| `docs/requirement.md` | 要件定義書 |
| `docs/API_SPECIFICATION.md` | GraphQL API仕様書 |
| `docs/DEPLOYMENT.md` | デプロイ手順・環境構築 |
| `docs/DEPLOYMENT_CHECKLIST.md` | デプロイ前チェックリスト |

---

## 🤝 開発環境のセットアップ

詳細なセットアップ手順は `docs/DEPLOYMENT.md` を参照してください。

---

## 🚀 本番環境へのデプロイ

### クイックスタート

1. **Supabase本番環境の準備**
   - Supabase Dashboardで本番プロジェクトを作成
   - マイグレーションを適用
   - RLSポリシーを確認

2. **Vercelプロジェクトの作成**
   - GitHubリポジトリをVercelに連携
   - Root Directory: `apps/web` を設定

3. **環境変数の設定**
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_APP_URL`
   - `NEXT_PUBLIC_ENVIRONMENT=production`

4. **デプロイの実行**
   - `main`ブランチにpushすると自動デプロイ

**詳細な手順**: `docs/DEPLOYMENT.md` を参照  
**デプロイ前チェックリスト**: `docs/DEPLOYMENT_CHECKLIST.md` を参照

---

## 👤 作成者

**開発者**: Ryuuhei  
**開発期間**: 2025年1月 - 現在進行中  
**開発手法**: Spec駆動開発 + TDD、AI開発（Cursor + Claude）

---

## 📝 ライセンス

MIT License

---

**最終更新**: 2025年1月15日  
**バージョン**: 2.1.0 - GraphQL脱却完了
