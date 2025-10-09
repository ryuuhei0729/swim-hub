# SwimHub

水泳チームの選手、コーチ、監督、マネージャーが効率的にチーム運営を行えるWebアプリケーション・モバイルアプリケーション

## 🏗️ モノレポ構造

```
swim-hub/
├── .github/
│   └── workflows/              # GitHub Actions CI/CD
├── apps/
│   ├── web/                   # Next.js Webアプリケーション
│   └── mobile/                # Flutter モバイルアプリ
├── supabase/                  # Supabase設定・Edge Functions
│   ├── functions/
│   │   └── graphql/           # GraphQL Edge Functions
│   └── migrations/            # データベースマイグレーション
├── packages/
│   ├── graphql-schema/        # 共有GraphQLスキーマ・型定義
│   └── types/                 # 共有TypeScript型定義
├── .gitignore
├── package.json               # ワークスペース設定
└── README.md
```

## 🚀 クイックスタート

### 前提条件
- Node.js 18以上
- npm 8以上

### インストール

```bash
# 全依存関係をインストール
npm install

# Webアプリケーションの開発サーバーを起動
npm run dev:web
```

## 📦 パッケージ構成

### Apps
- `apps/web` - Next.js Webアプリケーション
- `apps/mobile` - Flutter モバイルアプリケーション

### Backend
- `supabase` - Supabase設定・Edge Functions・データベース

### Packages
- `packages/types` - 共有型定義
- `packages/graphql-schema` - GraphQL スキーマ

## 🛠️ 開発コマンド

```bash
# Webアプリ開発
npm run dev:web              # 開発サーバー起動
npm run build:web            # ビルド

# 全体管理
npm run lint                 # 全プロジェクトのLint
npm run type-check          # 型チェック

# Supabase
npm run supabase:start      # ローカルSupabase起動

# GraphQL
npm run graphql:codegen     # GraphQL型生成
```

## 🌐 インフラ構成

| 環境 | アプリの場所 | 接続先DB | 誰が使う？ |
|------|-------------|----------|------------|
| 開発 (dev) | 自分のPC (localhost) | supabase開発用DB (swimmer-dev) | あなた (開発者) |
| ステージング (stg) | Vercelサーバー (プレビュー用) | supabase開発用DB (swimmer-dev) | テスト用 |
| 本番 (prod) | Vercelサーバー (公開用) | supabase本番用DB (swimmer-prod) | 全てのユーザー |

### 環境別設定

- **開発環境**: ローカル開発用。開発用データベースに接続
- **ステージング環境**: Vercelプレビューデプロイ。本番リリース前のテスト用
- **本番環境**: 実際のユーザーが利用する環境。本番データベースに接続

### Supabaseプロジェクト構成

現在、以下のSupabaseプロジェクトを作成・管理する必要があります：

| プロジェクト名 | 用途 | 接続環境 |
|---------------|------|----------|
| `swimmer-dev` | 開発・ステージング用 | 開発環境 + ステージング環境 |
| `swimmer-prod` | 本番用 | 本番環境のみ |

**重要**: `swimmer-dev` プロジェクトから `swimmer-prod` を複製する手順：

1. **本番用Supabaseプロジェクト作成**
   
   **ステップ1: 新しいプロジェクト作成**
   ```bash
   # Supabaseダッシュボード (https://supabase.com/dashboard) で：
   # 1. "New Project" ボタンをクリック
   # 2. Organization を選択
   # 3. プロジェクト名: "swimmer-prod" 
   # 4. データベースパスワードを設定（強力なパスワードを推奨）
   # 5. リージョン: ap-northeast-1 (Tokyo) を選択
   # 6. "Create new project" で作成開始
   ```

   **ステップ2: スキーマの移行**
   ```bash
   # 現在のプロジェクトから swimmer-prod に切り替え
   cd supabase
   supabase link --project-ref [swimmer-prod-project-id]
   
   # 既存のマイグレーションファイルを本番環境に適用
   supabase db push
   
   # または、本番用のマイグレーションファイルを使用
   supabase db reset --db-url [swimmer-prod-db-url]
   
   # Edge Functionsも本番環境にデプロイ
   supabase functions deploy graphql
   ```
   
   **既存のマイグレーションファイル**
   - `migrations/database_complete.sql` - 完全なスキーマ
   - `migrations/database_production_ready.sql` - 本番用スキーマ  
   - `migrations/seed_data.sql` - 初期データ（本番では使用しない）

2. **複製完了後の設定**
   ```bash
   # swimmer-prod プロジェクト作成後に取得する情報：
   # - Project URL: https://[project-id].supabase.co
   # - Anon/Public Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   # - Service Role Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

3. **環境変数の分離**
   
   **ローカル開発用 (`.env.local`)**
   ```bash
   # swimmer-dev を使用
   NEXT_PUBLIC_SUPABASE_URL=https://swimmer-dev.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=dev_anon_key
   SUPABASE_SERVICE_ROLE_KEY=dev_service_role_key
   ```

   **Vercel環境変数設定**
   ```bash
   # Preview環境（ステージング）: swimmer-dev を使用
   NEXT_PUBLIC_SUPABASE_URL=https://swimmer-dev.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=dev_anon_key
   
   # Production環境（本番）: swimmer-prod を使用  
   NEXT_PUBLIC_SUPABASE_URL=https://swimmer-prod.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=prod_anon_key
   SUPABASE_SERVICE_ROLE_KEY=prod_service_role_key
   ```

4. **プロジェクト作成時の注意事項**
   - **重要**: Supabaseには「Duplicate project」機能はありません
   - 新しいプロジェクトを手動作成し、スキーマを移行する必要があります
   - `supabase db push` でスキーマ、RLS、Functions が移行されます
   - Edge Functions は別途 `supabase functions deploy` が必要
   - 本番用プロジェクトには**テストデータを含めない**
   - プロジェクトIDとAPIキーは作成後にダッシュボードで確認

5. **データ分離のメリット**
   - 開発・テスト時に本番データを汚染しない
   - 本番環境の安定性を保証
   - セキュリティリスクの軽減
   - 各環境で独立したデータベース管理が可能

## 📊 技術スタック

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL), GraphQL
- **Deployment**: Vercel
- **Monorepo**: npm workspaces
- **CI/CD**: GitHub Actions
