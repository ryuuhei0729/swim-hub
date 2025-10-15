# Swim Manager v2 - プロジェクト状態

## 概要

このドキュメントはプロジェクトの現在の実装状態を記録します。機能の追加・完成のたびに更新してください。

**最終更新**: 2025年1月15日

---

## ✅ 実装済み機能

### 認証・ユーザー管理

- [x] **Supabase Auth統合** - メール・パスワード認証
- [x] **ログイン機能** - `app/(unauthenticated)/login/`
- [x] **サインアップ機能** - `app/(unauthenticated)/signup/`
- [x] **パスワードリセット** - `app/(unauthenticated)/reset-password/`
- [x] **パスワード更新** - `app/(unauthenticated)/update-password/`
- [x] **ユーザープロフィール管理** - `app/(authenticated)/settings/`
- [x] **認証ミドルウェア** - `middleware.ts`（未認証アクセス防止）
- [x] **AuthProvider** - `contexts/AuthProvider.tsx`

### 個人機能

#### ダッシュボード
- [x] **カレンダービュー** - `app/(authenticated)/dashboard/`
  - [x] 月間カレンダー表示
  - [x] 前月・翌月ナビゲーション
  - [x] 日付別記録状況の可視化
  - [x] 月間サマリー表示（練習回数）
  - [x] 日別詳細モーダル
- [x] **Calendar コンポーネント** - `dashboard/_components/Calendar.tsx`
- [x] **DayDetailModal コンポーネント** - `dashboard/_components/DayDetailModal.tsx`
- [x] **DashboardStats コンポーネント** - `dashboard/_components/DashboardStats.tsx`

#### 練習記録機能
- [x] **練習記録管理画面** - `app/(authenticated)/practice/page.tsx`
- [x] **練習記録の追加**
  - [x] 日付・場所入力
  - [x] 練習セット管理（距離・本数・サークルタイム）
  - [x] 種目選択
  - [x] メモ入力
- [x] **練習記録の編集・削除**
- [x] **練習タイムの記録**
  - [x] セット別・本数別タイム入力
  - [x] TimeInputModal - `practice/_components/PracticeTimeModal.tsx`
- [x] **練習タグ管理**
  - [x] タグ作成・編集・削除
  - [x] タグの色設定
  - [x] タグの複数選択
- [x] **練習フォームコンポーネント群**
  - [x] `PracticeForm.tsx` - 練習日入力
  - [x] `PracticeLogForm.tsx` - 練習セット入力
  - [x] `PracticeLogFormNew.tsx` - 新規練習ログ
  - [x] `PracticeEditForm.tsx` - 編集用フォーム
  - [x] `PracticeTagForm.tsx` - タグ管理
  - [x] `TagSelector.tsx` - タグ選択UI

#### 大会記録機能
- [x] **大会記録管理画面** - `app/(authenticated)/competition/page.tsx`
- [x] **大会情報管理**
  - [x] 大会名・日付・場所入力
  - [x] プール種別選択（長水路/短水路）
  - [x] メモ入力
- [x] **記録管理**
  - [x] 種目選択（17種目固定）
  - [x] タイム入力（分・秒形式）
  - [x] リレー種目フラグ
  - [x] スプリットタイム入力
  - [x] 動画URL添付
  - [x] メモ入力
- [x] **記録の編集・削除**
- [x] **記録フォームコンポーネント**
  - [x] `RecordForm.tsx` - 記録入力フォーム
  - [x] `RecordFormNew.tsx` - 新規記録フォーム

#### 種目マスタ
- [x] **17種目固定データ** - `supabase/migrations/`
  - 自由形: 50m, 100m, 200m, 400m, 800m
  - 平泳ぎ: 50m, 100m, 200m
  - 背泳ぎ: 50m, 100m, 200m
  - バタフライ: 50m, 100m, 200m
  - 個人メドレー: 100m, 200m, 400m

### チーム機能

#### チーム管理
- [x] **チーム一覧画面** - `app/(authenticated)/teams/page.tsx`
- [x] **チーム詳細画面** - `app/(authenticated)/teams/[teamId]/page.tsx`
- [x] **チーム作成機能**
  - [x] チーム名・説明入力
  - [x] 招待コード自動生成
- [x] **チーム招待機能**
  - [x] 招待コード共有
  - [x] 招待コードでの参加
- [x] **チーム管理画面** - `app/(authenticated)/team-admin/page.tsx`
  - [x] チーム設定編集
  - [x] メンバー管理
  - [x] 権限管理（admin/user）

#### チーム内お知らせ
- [x] **お知らせ一覧表示**
- [x] **お知らせ作成・編集・削除**
- [x] **お知らせ詳細表示**
- [x] **公開/非公開切り替え**
- [x] **お知らせコンポーネント群**
  - [x] `TeamAnnouncements.tsx` - お知らせ管理
  - [x] `AnnouncementList.tsx` - 一覧表示
  - [x] `AnnouncementDetail.tsx` - 詳細表示
  - [x] `AnnouncementForm.tsx` - 作成・編集フォーム

#### チームメンバー
- [x] **メンバー一覧画面** - `app/(authenticated)/members/page.tsx`
- [x] **メンバー一覧表示** - `components/members/MembersList.tsx`
- [x] **TeamMembers コンポーネント** - `components/team/TeamMembers.tsx`

### データベース

- [x] **統合スキーママイグレーション** - `20250117000002_consolidated_schema.sql`
  - [x] users テーブル
  - [x] styles テーブル（種目マスタ）
  - [x] practices テーブル（練習日単位）
  - [x] practice_logs テーブル（セット単位）
  - [x] practice_times テーブル（タイム記録）
  - [x] practice_tags テーブル（タグ）
  - [x] practice_log_tags テーブル（タグ関連）
  - [x] competitions テーブル（大会情報）
  - [x] records テーブル（記録）
  - [x] split_times テーブル（スプリット）
- [x] **タイムスタンプ追加** - `20250117000003_add_timestamps.sql`
- [x] **チーム管理スキーマ** - `20250117000004_team_management_schema.sql`
  - [x] teams テーブル
  - [x] team_memberships テーブル
  - [x] team_announcements テーブル
- [x] **チームスケジュールRLS修正** - `20250117000005_fix_team_schedule_rls.sql`
- [x] **大会へのuser_id追加** - `20250117000006_add_user_id_to_competitions.sql`
- [x] **Row Level Security (RLS)** - 全テーブルに設定済み
  - [x] 個人データの保護（auth.uid() = user_id）
  - [x] チームデータのアクセス制御
  - [x] 共有大会データの制御

### API層（Supabase直接アクセス）

- [x] **共通API関数** - `packages/shared/api/`
  - [x] `practices.ts` - 練習記録API
  - [x] `records.ts` - 大会記録API
  - [x] `teams.ts` - チームAPI
  - [x] `styles.ts` - 種目API
  - [x] `dashboard.ts` - ダッシュボードAPI
- [x] **共通カスタムフック** - `packages/shared/hooks/`
  - [x] `usePractices.ts` - 練習記録フック
  - [x] `useRecords.ts` - 大会記録フック
  - [x] `useTeams.ts` - チームフック
- [x] **型定義** - `packages/shared/types/`
  - [x] `database.ts` - データベース型定義
  - [x] `ui.ts` - UI型定義
  - [x] `index.ts` - 共通エクスポート

### 状態管理・認証

- [x] **AuthProvider** - `contexts/AuthProvider.tsx`
- [x] **Supabaseクライアント** - `lib/supabase.ts`, `lib/supabase-server.ts`
  - [x] Client Component用クライアント
  - [x] Server Component用クライアント
  - [x] 認証状態管理

### UI コンポーネント

- [x] **基本UIコンポーネント** - `components/ui/`
  - [x] Button.tsx
  - [x] Card.tsx
  - [x] Input.tsx
  - [x] LoadingSpinner.tsx
- [x] **レイアウトコンポーネント** - `components/layout/`
  - [x] DashboardLayout.tsx
  - [x] Header.tsx
  - [x] Footer.tsx
  - [x] Sidebar.tsx
- [x] **認証コンポーネント** - `components/auth/`
  - [x] AuthForm.tsx
  - [x] AuthGuard.tsx
  - [x] PasswordResetForm.tsx
  - [x] UpdatePasswordForm.tsx

### テスト

- [x] **Playwright 設定** - `playwright.config.ts`
- [x] **E2Eテスト** - `e2e/`
  - [x] auth.spec.ts - 認証フロー
  - [x] dashboard.spec.ts - ダッシュボード
- [x] **テストユーティリティ** - `e2e/utils/`
  - [x] global-setup.ts
  - [x] global-teardown.ts
  - [x] test-helpers.ts
- [x] **テストフィクスチャ** - `e2e/fixtures/test-data.json`

---

## 🚧 実装中・未実装機能

### 個人機能

#### 目標管理
- [ ] **目標管理画面** - `app/(authenticated)/goals/page.tsx`
  - ⚠️ 画面ファイルは存在するが機能未実装
  - [ ] 目標の作成・編集・削除
  - [ ] 目標の種類（タイム、技術、頻度、距離）
  - [ ] 達成状況の管理
  - [ ] 期限設定
  - [ ] 進捗表示

#### スケジュール管理
- [ ] **スケジュール画面** - `app/(authenticated)/schedule/page.tsx`
  - ⚠️ 画面ファイルは存在するが機能未実装
  - [ ] カレンダー形式のスケジュール表示
  - [ ] 練習予定の登録
  - [ ] 大会予定の登録
  - [ ] イベント管理
  - [ ] リマインダー機能

#### 出席管理
- [ ] **出席管理画面** - `app/(authenticated)/attendance/page.tsx`
  - ⚠️ 画面ファイルは存在するが機能未実装
  - [ ] 出席記録の登録
  - [ ] 出席状況の確認
  - [ ] 出席率の計算
  - [ ] 出席カレンダー表示

#### 分析・統計機能
- [ ] **練習分析**
  - [ ] 総練習距離の集計
  - [ ] 種目別練習時間
  - [ ] 月間/年間統計
  - [ ] 練習頻度の分析
- [ ] **記録分析**
  - [ ] 種目別ベストタイム一覧
  - [ ] タイムの推移グラフ
  - [ ] スプリット分析
  - [ ] 自己ベスト更新履歴

#### グラフ表示
- [ ] **練習グラフ**
  - [ ] 月間練習距離グラフ
  - [ ] 種目別練習時間円グラフ
  - [ ] 練習頻度カレンダーヒートマップ
- [ ] **記録グラフ**
  - [ ] タイム推移折れ線グラフ
  - [ ] 種目別ベストタイム棒グラフ
  - [ ] スプリット比較グラフ

### チーム機能

#### チーム練習管理
- [ ] **チーム練習管理画面**
  - [ ] コンポーネントは存在 - `components/team/TeamPracticeManager.tsx`
  - [ ] チーム全体の練習予定登録
  - [ ] メンバーへの練習通知
  - [ ] 練習メニューの共有
  - [ ] 出席確認機能
- [ ] **GraphQL実装**
  - [x] ミューテーション定義済み - `graphql/mutations/teamPractices.ts`
  - [ ] リゾルバ実装
  - [ ] データベース統合

#### チーム大会管理
- [ ] **チーム大会管理画面**
  - [ ] コンポーネントは存在 - `components/team/TeamCompetitionManager.tsx`
  - [ ] チーム大会の登録
  - [ ] エントリー管理
  - [ ] メンバーの記録一覧
  - [ ] チーム内順位表示
- [ ] **GraphQL実装**
  - [x] ミューテーション定義済み - `graphql/mutations/teamCompetitions.ts`
  - [ ] リゾルバ実装
  - [ ] データベース統合

#### チームスケジュール管理
- [ ] **チームスケジュール画面**
  - [ ] コンポーネントは存在 - `components/team/TeamScheduleManager.tsx`
  - [ ] チームカレンダー表示
  - [ ] 練習・大会の一元管理
  - [ ] メンバーへの通知

#### チーム内記録ランキング
- [ ] **ランキング機能**
  - [ ] 種目別ランキング表示
  - [ ] 年齢別・性別ランキング
  - [ ] グループ別ランキング
  - [ ] リレーランキング

#### チーム内グループ管理
- [ ] **グループ機能**
  - [ ] グループの作成・編集・削除
  - [ ] メンバーのグループ割り当て
  - [ ] グループ別通知
  - [ ] グループ別統計

### モバイルアプリ

#### React Native実装（全体未実装）
- [ ] **プロジェクトセットアップ**
  - [ ] Expo初期化
  - [ ] TypeScript設定
  - [ ] 依存パッケージインストール
- [ ] **認証機能**
  - [ ] ログイン画面
  - [ ] サインアップ画面
  - [ ] パスワードリセット
- [ ] **ダッシュボード**
  - [ ] カレンダービュー
  - [ ] 月間サマリー
- [ ] **練習記録**
  - [ ] 練習記録一覧
  - [ ] 練習記録追加・編集
- [ ] **大会記録**
  - [ ] 記録一覧
  - [ ] 記録追加・編集
- [ ] **チーム機能**
  - [ ] チーム一覧
  - [ ] チーム詳細
  - [ ] お知らせ
- [ ] **共通コンポーネント**
  - [ ] ナビゲーション
  - [ ] UIコンポーネント
  - [ ] フォームコンポーネント

---

## 📦 技術的負債・改善予定

### パフォーマンス
- [ ] 大量データのページネーション実装
- [ ] 画像の最適化（Next.js Image コンポーネント活用）
- [ ] コンポーネントのメモ化（React.memo）
- [ ] 不要な再レンダリングの削減
- [ ] リアルタイム購読の最適化

### コード品質
- [ ] ユニットテストの追加
- [ ] E2Eテストのカバレッジ向上
- [ ] TypeScriptの`any`型の削減
- [ ] エラーハンドリングの統一
- [ ] 共通API関数のテスト追加

### UI/UX
- [ ] ローディング状態の改善
- [ ] エラーメッセージの統一
- [ ] レスポンシブデザインの改善
- [ ] アクセシビリティの向上
- [ ] オフライン対応

### セキュリティ
- [ ] CSRFトークンの実装
- [ ] レート制限の実装
- [ ] 入力バリデーションの強化
- [ ] XSS対策の徹底
- [ ] RLSポリシーの定期レビュー

### ドキュメント
- [x] GraphQL移行計画の完了
- [x] プロジェクト状態の更新
- [ ] コンポーネントのドキュメント作成
- [ ] デプロイ手順の詳細化
- [ ] トラブルシューティングガイド

---

## 🗓️ 開発ロードマップ

### Phase 1: コア機能の安定化（現在）
- ✅ 認証・ユーザー管理
- ✅ ダッシュボード
- ✅ 練習記録管理
- ✅ 大会記録管理
- ✅ チーム基本機能

### Phase 2: 個人機能の拡充（次のフェーズ）
- [ ] 目標管理
- [ ] スケジュール管理
- [ ] 分析・統計機能
- [ ] グラフ表示

### Phase 3: チーム機能の拡充
- [ ] チーム練習管理
- [ ] チーム大会管理
- [ ] チーム内ランキング
- [ ] チーム内グループ管理

### Phase 4: モバイルアプリ開発
- [ ] React Native基盤構築
- [ ] 認証・ダッシュボード
- [ ] 練習・大会記録機能
- [ ] チーム機能

### Phase 5: 高度な機能
- [ ] AI分析機能
- [ ] トレーニングプラン提案
- [ ] ソーシャル機能
- [ ] 外部サービス連携

---

## 📝 更新履歴

### 2025年1月15日
- **GraphQL脱却完了**: Apollo ClientからSupabase直接アクセスに完全移行
- **共通API層の追加**: `packages/shared/api/` に共通API関数を実装
- **共通フックの追加**: `packages/shared/hooks/` に共通カスタムフックを実装
- **型定義の整理**: `packages/shared/types/` に型定義を統一
- **ドキュメント更新**: 技術スタックの変更を反映

### 2025年1月17日
- プロジェクト状態ドキュメントを新規作成
- `.cursorrules`から分離
- 実装済み機能の詳細を記載
- 未実装機能の一覧を整理
- 開発ロードマップを追加

---

**このドキュメントは定期的に更新してください。機能の実装が完了したら、該当箇所を ✅ に変更し、更新履歴に記録してください。**

