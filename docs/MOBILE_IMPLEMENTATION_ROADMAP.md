# モバイル実装ロードマップ

## 概要

このドキュメントは、Swim HubのWebアプリケーション（Next.js）をベースに、React Nativeでモバイルアプリを実装するためのロードマップです。

現在のレポジトリ構造を最大限活用し、`apps/shared`配下のAPI層、型定義、React QueryフックをWeb/Mobileで共通利用する設計になっています。

## 現在のアーキテクチャ

### レポジトリ構造

```
swim-hub/
├── apps/
│   ├── shared/          # Web/Mobile共通パッケージ
│   │   ├── api/         # Supabase API層（クラスベース）
│   │   ├── hooks/       # React Queryフック（'use client'あり）
│   │   ├── types/       # 型定義（database.ts, ui.ts）
│   │   ├── utils/       # ユーティリティ（date.ts, time.ts）
│   │   └── lib/         # React Query設定
│   ├── web/             # Next.js Webアプリ
│   │   ├── stores/      # Zustandストア（フォーム・フィルター状態）
│   │   ├── contexts/    # AuthProvider（Supabase認証）
│   │   └── lib/         # Supabaseクライアント（@supabase/ssr使用）
│   └── mobile/          # React Nativeアプリ（未実装）
└── supabase/            # データベース・マイグレーション
```

### 技術スタック（Web）

- **フレームワーク**: Next.js 15 (App Router)
- **状態管理**: 
  - Zustand（フォーム・フィルター状態）
  - React Query（データフェッチング）
- **データアクセス**: Supabase Client（`@supabase/ssr`の`createBrowserClient`）
- **認証**: Supabase Auth（`AuthProvider`で管理）

### 技術スタック（Mobile - 計画）

- **フレームワーク**: React Native + Expo
- **状態管理**: 
  - Zustand（フォーム・フィルター状態）← Webと共通
  - React Query（データフェッチング）← Webと共通
- **データアクセス**: Supabase Client（`@supabase/supabase-js`の`createClient`）
- **認証**: Supabase Auth（React Native用のストレージアダプター）
- **ナビゲーション**: React Navigation
- **UI**: React Native Components + 必要に応じてUIライブラリ

## 実装フェーズ

### Phase 1: 環境構築と基盤整備

#### 1.1 React Native + Expo環境セットアップ

**目標**: モバイルアプリの開発環境を構築

**タスク**:
- [x] Expoプロジェクトの初期化（`apps/mobile`）
- [x] Expo SDK 53+の使用を確認（React 19とReact Native 0.78+をサポート）
- [x] TypeScript設定
- [x] モノレポ構成への統合（npm workspaces）
- [x] 開発環境のセットアップ（iOS/Android）
- [x] ルート`package.json`のスクリプト更新（Flutter → React Native）
- [x] React 19.2とReact Native 0.78+の互換性確認
- [x] 使用予定のサードパーティライブラリのReact 19対応状況を確認

**技術選択**:
- Expo SDK 53+（React 19とReact Native 0.78+をサポート）
- TypeScript 5
- React Native 0.78+（React 19.2と互換性あり）

**注意点**:
- `package.json`にFlutter関連のスクリプトがあるため、React Native用に更新が必要
- モノレポ構成を維持し、`apps/shared`を依存関係として追加
- **重要**: React 19.2を使用するには、React Native 0.78+とExpo SDK 53+が必要。WebアプリとReactバージョンを統一するため、この組み合わせを推奨

#### 1.2 Supabaseクライアントの初期化

**目標**: React Native環境でSupabaseクライアントを正しく初期化

**タスク**:
- [x] React Native用Supabaseクライアント作成（`apps/mobile/lib/supabase.ts`）
- [x] AsyncStorageアダプターの設定（認証トークン保存）
- [x] 環境変数の管理（`.env`ファイル）
- [x] 型定義の共有（`apps/shared/types`を使用）

**実装例**:
```typescript
// apps/mobile/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Database } from '@swim-hub/shared/types/database'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
```

**注意点**:
- Webでは`@supabase/ssr`を使用しているが、React Nativeでは`@supabase/supabase-js`を直接使用
- AsyncStorageが必要（`@react-native-async-storage/async-storage`）

#### 1.3 認証コンテキストの実装

**目標**: Webの`AuthProvider`と同等の機能をReact Nativeで実装

**タスク**:
- [x] `AuthProvider`の実装（`apps/mobile/contexts/AuthProvider.tsx`）
- [x] 認証状態の管理（セッション、ユーザー情報）
- [x] 認証メソッドの実装（signIn, signUp, signOut）
- [x] React Queryの`QueryClient`設定

**実装方針**:
- Webの`AuthProvider`を参考に、React Native用に調整
- ナビゲーションは後で実装するため、認証状態のみ管理
- `apps/shared`のAPI層をそのまま使用可能

#### 1.4 React Query設定

**目標**: `apps/shared`のReact QueryフックをReact Nativeで使用可能にする

**タスク**:
- [x] `QueryClientProvider`の設定
- [x] `apps/shared/lib/react-query.ts`の`createQueryClient`を使用
- [x] プロバイダーの階層構造を構築

**確認事項**:
- `apps/shared/hooks/queries/*.ts`の`'use client'`ディレクティブはReact Nativeでは無視される（問題なし）
- React QueryはReact Nativeでも完全に動作する

### Phase 2: 認証機能の実装

#### 2.1 ログイン画面

**目標**: メールアドレス・パスワードでログインできる

**タスク**:
- [x] ログイン画面UIの実装
- [x] フォームバリデーション
- [x] エラーハンドリング
- [x] ローディング状態の表示
- [x] `AuthProvider`の`signIn`メソッドを使用

**UI要件**:
- メールアドレス入力
- パスワード入力
- ログインボタン
- エラーメッセージ表示
- パスワードリセットリンク

#### 2.2 サインアップ画面

**目標**: 新規ユーザー登録ができる

**タスク**:
- [x] サインアップ画面UIの実装
- [x] フォームバリデーション（メール、パスワード強度）
- [x] エラーハンドリング
- [x] メール認証フローの説明

#### 2.3 パスワードリセット

**目標**: パスワードをリセットできる

**タスク**:
- [x] パスワードリセット画面
- [x] メール送信機能
- [x] パスワード更新画面

#### 2.4 認証ガード

**目標**: 未認証ユーザーをログイン画面にリダイレクト

**タスク**:
- [x] 認証ガードコンポーネントの実装
- [ ] ナビゲーション統合（Phase 3で実装）

### Phase 3: ナビゲーションと基本レイアウト

#### 3.1 React Navigationのセットアップ

**目標**: 画面遷移を実装

**タスク**:
- [x] React Navigationのインストール
- [x] ナビゲーション構造の設計
- [x] スタックナビゲーターの設定
- [x] タブナビゲーターの設定（ダッシュボード、練習、大会、チーム、マイページ）

**ナビゲーション構造**:
```
- AuthStack（未認証）
  - Login
  - SignUp
  - ResetPassword
- MainStack（認証済み）
  - TabNavigator
    - Dashboard
    - Practices
    - Competitions
    - Teams
    - MyPage
```

#### 3.2 基本レイアウトコンポーネント

**目標**: 共通レイアウトコンポーネントの実装

**タスク**:
- [x] ヘッダーコンポーネント
- [x] タブバーコンポーネント（React Navigationで既に実装済み）
- [x] ローディングコンポーネント
- [x] エラー表示コンポーネント

### Phase 4: 練習記録機能

#### 4.1 練習記録一覧

**目標**: 練習記録の一覧を表示

**タスク**:
- [x] 一覧画面の実装
- [x] `apps/shared/hooks/queries/practices.ts`の`usePracticesQuery`を使用
- [x] 日付フィルター機能
- [x] プルリフレッシュ機能
- [x] 無限スクロール（ページネーション）

**実装方針**:
- `apps/shared`のAPI層とReact Queryフックをそのまま使用
- Webの実装を参考に、React Nativeコンポーネントに置き換え

#### 4.2 練習記録詳細

**目標**: 特定日の練習記録を詳細表示

**タスク**:
- [x] 詳細画面の実装
- [x] 練習ログの表示
- [x] タイムの表示
- [x] タグの表示

#### 4.3 練習記録作成・編集

**目標**: 練習記録を作成・編集できる

**タスク**:
- [x] 作成画面の実装
- [x] 編集画面の実装
- [x] フォーム状態管理（Zustandを使用、Webと同様）
- [x] `apps/shared/hooks/queries/practices.ts`のミューテーションフックを使用
- [x] バリデーション

**実装方針**:
- Webの`apps/web/stores/form/practiceFormStore.ts`を参考に、モバイル用のZustandストアを作成
- フォームUIはReact Nativeのコンポーネントを使用

#### 4.4 練習記録削除

**目標**: 練習記録を削除できる

**タスク**:
- [x] 削除確認ダイアログ
- [x] 削除ミューテーションの実装

### Phase 5: 大会記録機能

#### 5.1 大会記録一覧

**目標**: 大会記録の一覧を表示

**タスク**:
- [x] 一覧画面の実装
- [x] `apps/shared/hooks/queries/records.ts`を使用
- [x] フィルター機能（種目、年度、プールタイプ）
- [x] ソート機能

**実装方針**:
- Webの`apps/web/stores/filter/competitionFilterStore.ts`を参考に、モバイル用のZustandストアを作成

#### 5.2 大会記録詳細

**目標**: 大会記録の詳細を表示

**タスク**:
- [x] 詳細画面の実装
- [x] エントリー情報の表示
- [x] スプリットタイムの表示
- [x] 反応時間の表示

#### 5.3 大会記録作成・編集

**目標**: 大会記録を作成・編集できる

**タスク**:
- [x] 作成画面の実装
- [x] 編集画面の実装
- [x] フォーム状態管理（Zustand）
- [x] エントリー情報の入力
- [x] スプリットタイムの入力

### Phase 6: ダッシュボード機能

#### 6.1 カレンダービュー

**目標**: 月間カレンダーで練習・大会を表示

**タスク**:
- [x] カレンダーコンポーネントの実装（ライブラリ使用可）
- [x] `apps/shared/api/dashboard.ts`を使用
- [x] 日付タップで詳細表示
- [x] 月の切り替え

#### 6.2 統計表示

**目標**: 練習・大会の統計を表示

**タスク**:
- [ ] グラフ表示（ライブラリ使用可）
- [ ] データ集計
- [ ] 期間選択

### Phase 7: チーム機能

#### 7.1 チーム一覧

**目標**: 所属チームの一覧を表示

**タスク**:
- [x] 一覧画面の実装
- [x] `apps/shared/hooks/queries/teams.ts`を使用
- [x] チーム作成ボタン

#### 7.2 チーム詳細

**目標**: チームの詳細情報を表示

**タスク**:
- [x] 詳細画面の実装
- [x] メンバー一覧
- [x] お知らせ一覧
- [ ] 練習・大会一覧

#### 7.3 チーム管理機能

**目標**: チーム管理者がチームを管理できる

**タスク**:
- [x] メンバー招待
- [x] メンバー管理
- [x] お知らせ作成・編集
- [x] チーム練習・大会の一括登録

### Phase 8: プロフィール機能

#### 8.1 プロフィール表示・編集

**目標**: ユーザープロフィールを表示・編集できる

**タスク**:
- [x] プロフィール画面の実装
- [x] プロフィール画像のアップロード（Supabase Storage）
- [x] 基本情報の編集
- [x] ベストタイム表の実装（WEB実装を参考）
- [x] パスワード変更

### Phase 9: オフライン対応とパフォーマンス最適化

#### 9.1 オフライン対応

**目標**: オフライン時でも基本機能が動作

**タスク**:
- [x] React Queryのキャッシュ戦略の最適化
- [x] オフライン検知
- [x] オフライン時のUI表示
- [x] データ同期（オンライン復帰時）

#### 9.2 パフォーマンス最適化

**目標**: アプリのパフォーマンスを向上

**タスク**:
- [x] 画像最適化
- [x] リストの仮想化（FlatList最適化）
- [x] メモ化の適用
- [x] バンドルサイズの最適化

### Phase 10: テストとリリース準備

#### 10.1 テスト実装

**目標**: モバイルアプリのテストを実装

**タスク**:
- [x] ユニットテスト（Vitest）
- [ ] コンポーネントテスト（React Native Testing Library）
- [ ] E2Eテスト（DetoxまたはMaestro）

#### 10.2 リリース準備

**目標**: アプリストアへのリリース準備

**タスク**:
- [ ] アイコン・スプラッシュスクリーンの設定
- [ ] アプリ情報の設定
- [ ] ビルド設定（iOS/Android）
- [ ] 配布設定（App Store Connect / Google Play Console）

## 技術的な考慮事項

### sharedパッケージの互換性

#### ✅ そのまま使用可能

1. **API層** (`apps/shared/api/`)
   - Supabaseクライアントを受け取る設計のため、React Nativeでも問題なく動作
   - クラスベースの実装で、プラットフォーム非依存

2. **型定義** (`apps/shared/types/`)
   - TypeScriptの型定義のため、完全に共通利用可能

3. **ユーティリティ** (`apps/shared/utils/`)
   - `date-fns`はReact Nativeでも動作
   - 純粋な関数のため、プラットフォーム非依存

4. **React Queryフック** (`apps/shared/hooks/queries/`)
   - `'use client'`ディレクティブはReact Nativeでは無視される（問題なし）
   - React QueryはReact Nativeでも完全に動作

#### ⚠️ 調整が必要

1. **Supabaseクライアントの初期化**
   - Web: `@supabase/ssr`の`createBrowserClient`
   - Mobile: `@supabase/supabase-js`の`createClient` + AsyncStorage

2. **認証プロバイダー**
   - Web: Next.jsのルーティングと統合
   - Mobile: React Navigationと統合

### Zustandストアの移行

WebのZustandストア（`apps/web/stores/`）は基本的にそのまま使用可能ですが、以下の点に注意：

1. **フォームストア**: UIに依存しない部分は共通化可能
2. **フィルターストア**: 完全に共通化可能
3. **UIストア**: プラットフォーム固有の部分は分離が必要

**推奨アプローチ**:
- 共通ロジックは`apps/shared/stores/`に移動（将来のリファクタリング）
- プラットフォーム固有の部分は各アプリで実装

### ナビゲーション

React Navigationを使用し、Webのルーティング構造を参考に設計：

- **認証フロー**: AuthStack
- **メインフロー**: TabNavigator + StackNavigator

### UIコンポーネント

WebのTailwind CSSベースのコンポーネントを、React Nativeコンポーネントに置き換え：

- **スタイリング**: StyleSheet API または styled-components
- **レイアウト**: Flexbox（React Nativeのデフォルト）
- **アイコン**: `@heroicons/react`の代替（React Native Vector Icons等）

## 依存関係

### 必須パッケージ

```json
{
  "dependencies": {
    "@react-native-async-storage/async-storage": "^2.x",
    "@react-navigation/native": "^7.x",
    "@react-navigation/native-stack": "^7.x",
    "@react-navigation/bottom-tabs": "^7.x",
    "@supabase/supabase-js": "^2.80.0",
    "@swim-hub/shared": "*",
    "@tanstack/react-query": "^5.90.10",
    "date-fns": "^4.1.0",
    "expo": "~53.x",
    "react": "19.2.0",
    "react-native": "0.78.x",
    "zustand": "^5.0.8"
  }
}
```

**重要**: React 19.2を使用するには、React Native 0.78+とExpo SDK 53+が必要です。WebアプリとReactバージョンを統一するため、この組み合わせを推奨します。一部のサードパーティライブラリがReact 19に対応していない可能性があるため、使用前に互換性を確認してください。

### 開発依存関係

```json
{
  "devDependencies": {
    "@types/react": "^19",
    "@types/react-native": "^0.76.x",
    "typescript": "^5.9.3"
  }
}
```

## リスクと対策

### リスク1: sharedパッケージの'use client'ディレクティブ

**リスク**: `apps/shared/hooks/queries/*.ts`に`'use client'`があるが、React Nativeでは無視される

**対策**: 問題なし。React Nativeでは`'use client'`は無視されるため、そのまま使用可能

### リスク2: プラットフォーム固有のAPI

**リスク**: Webで使用しているブラウザAPI（localStorage等）がReact Nativeで使用できない

**対策**: 
- SupabaseクライアントのストレージアダプターをAsyncStorageに設定
- プラットフォーム固有の処理は条件分岐で対応

### リスク3: パフォーマンス

**リスク**: モバイル環境でのパフォーマンス問題

**対策**:
- リストの仮想化（FlatList）
- 画像の最適化
- React Queryのキャッシュ戦略の最適化
- メモ化の適切な使用

### リスク4: オフライン対応

**リスク**: オフライン時の動作

**対策**:
- React Queryのキャッシュを活用
- オフライン検知とUI表示
- データ同期の実装

### リスク5: React 19とReact Nativeの互換性

**リスク**: React 19.2を使用するにはReact Native 0.78+とExpo SDK 53+が必要。一部のサードパーティライブラリがReact 19に対応していない可能性がある

**対策**:
- Expo SDK 53+を使用（React 19とReact Native 0.78+をサポート）
- 使用予定のライブラリのReact 19対応状況を事前に確認
- 互換性の問題がある場合は、代替ライブラリを検討
- 定期的にExpo SDKとReact Nativeのアップデートを確認

## 次のステップ

1. **Phase 1の開始**: 環境構築から着手
2. **設計レビュー**: このロードマップのレビューと承認
3. **技術検証**: サンプル実装で技術スタックの検証

## 参考資料

- [Expo Documentation](https://docs.expo.dev/)
- [React Navigation](https://reactnavigation.org/)
- [Supabase React Native Guide](https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native)
- [React Query React Native](https://tanstack.com/query/latest/docs/framework/react/react-native)
