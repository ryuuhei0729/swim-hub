# SwimHub 要件定義書

## 1. システム概要

### 1.1 システム名
SwimHub

### 1.2 システムの目的
1. **個人利用（メイン）**: 水泳選手が個人で記録管理、目標管理を行える
2. **チーム利用（サブ）**: 水泳チームでの効率的なチーム運営をサポート
3. **柔軟な利用形態**: 個人利用からチーム利用への段階的移行が可能

### 1.3 対象ユーザー
- **個人ユーザー**: 水泳選手（個人での記録・目標管理）
- **チームメンバー**: チームに所属する選手、コーチ、監督、マネージャー

### 1.4 利用形態
#### 1.4.1 個人利用（メイン機能）
- アカウント作成後、即座に個人での記録管理が可能
- 練習記録、大会記録、目標管理を個人で完結
- チームに所属せずに単独で利用可能

#### 1.4.2 チーム利用（サブ機能）
- 個人利用の機能に加えて、チーム機能を追加利用
- 複数のチームに同時所属可能
- チームごとに異なる権限・役割・グループを設定可能
- チーム脱退時も個人データは保持

## 2. ユーザー管理・認証機能

### 2.1 チーム内権限システム
- **role**: `admin` / `user`
- **member_type**: `swimmer` / `coach` / `director` / `manager` / `other`
- **group**: 例：1年生/2年生/3年生, 15期/16期/17期, sprint/middle/long などチーム内で作成可能

### 2.2 認証機能
- [x] Supabase Authを使用した認証システム
- [x] メールアドレス・パスワード認証
- [x] パスワードリセット機能
- [x] セッション管理
- [x] JWT認証トークン機能
- [x] Row Level Security (RLS) による権限管理

### 2.3 ユーザー情報
- 名前、性別、誕生日
- プロフィール画像（Supabase Storage）
- 自己紹介文

---

# 第1部：個人利用機能

## 3. カレンダー・記録入力機能（最優先実装）

### 3.1 ホーム画面カレンダー
- [x] 月間カレンダー表示（メイン画面）
- [x] カレンダー基本操作(前月、翌月、年月直接指定など)
- [x] 日付別記録状況の可視化
  - 記録追加ボタン
  - 練習記録あり
  - 大会記録あり  
  - 両方記録あり
- [x] 今月のサマリー表示（練習回数）

### 3.2 記録追加フロー
#### 3.2.1 記録タイプ選択
- [x] 日付タップ時の選択モーダル表示
  - 「練習記録を追加」
  - 「大会記録を追加」
  - 「キャンセル」

#### 3.2.2 練習記録追加フロー
- [x] 練習日時（選択済み日付がデフォルト）
- [x] 場所の記録
- [x] 練習タグの記録（例：AN2, EN3, 耐乳酸, ショートサークル, 長水路など各自で設定可能）
- [x] 練習内容の記録（距離・本数・セット・サークルタイム・種目）
- [x] タイム入力画面に遷移 or タイム入力モーダル表示
- [x] セット別・本数別タイム記録

#### 3.2.3 大会記録追加フロー  
- [x] 大会基本情報入力
  - 大会日時（選択済み日付がデフォルト）
  - 大会名・場所の記録
  - プール種別（長水路/短水路）
  - 大会カテゴリ（公式/記録会/タイムトライアル）
- [x] 記録詳細入力
  - 種目・距離選択
  - リレー種目対応
  - 記録タイム入力
  - スプリットタイム入力（12.5m, 15m, 25m等選択可能）
  - 順位・メモ入力
  - 動画URL添付

### 3.3 記録表示・編集
- [x] 日付タップ時の記録詳細表示
- [x] 記録の編集・削除機能
- [x] 複数記録がある場合のリスト表示

## 4. 練習記録管理・分析

### 4.1 練習内容記録
- [ ] home画面のカレンダー及びPractice画面から追加可能
- [ ] 練習日時・場所の記録
- [ ] 練習タグの記録（例：AN2, EN3, 耐乳酸, ショートサークル, 長水路など各自で設定可能）
- [ ] 練習内容の記録（距離・本数・セット・サークルタイム・種目）
- [ ] セット別・本数別タイム記録
※全てCRUDできるように

### 4.2 練習一覧・分析（Practice画面）
- [ ] 練習履歴一覧表示（日付順、最新が上）
- [ ] フィルタリング機能
  - 日付範囲指定
  - 種目別フィルタ
  - 練習タグ別フィルタ
  - 場所別フィルタ
- [ ] 練習詳細表示（タップで展開）
- [ ] タイム推移グラフ表示
- [ ] 泳法別・距離別分析
- [ ] 月間・週間練習統計
- [ ] 練習記録の編集・削除機能
- [ ] 練習から逆算した時のベストタイム（AIを使うので後ほど実装）

## 4. 大会記録管理

### 5.1 大会情報管理
- [ ] home画面のカレンダー及びRecord画面から追加可能
- [ ] 参加大会の登録・管理
- [ ] 大会日時・場所・名称記録
- [ ] プール種別管理（長水路/短水路）
※全てCRUDできるように

### 5.2 記録管理
- [ ] 記録の登録・管理（種目、距離、長水路/短水路、リレーイング）
- [ ] スプリットタイム記録（12.5m, 15m, 25mなど自分で選択可能）
- [ ] 記録詳細情報（順位メモ、動画URL）
- [ ] ベストタイム自動更新・履歴管理
※全てCRUDできるように

### 5.3 記録一覧・分析（Record画面）
- [ ] 大会記録履歴一覧表示（日付順、最新が上）
- [ ] フィルタリング機能
  - 日付範囲指定
  - 種目別フィルタ
  - プール種別フィルタ（長水路/短水路）
  - 大会カテゴリ別フィルタ
  - 大会名・場所別フィルタ
- [ ] 記録詳細表示（タップで展開、スプリットタイム表示）
- [ ] 泳法別ベストタイム一覧（表形式で出力）
- [ ] 記録推移グラフ表示
- [ ] プール種別ベストタイム比較
- [ ] 大会記録の編集・削除機能


----

## 6. 個人目標管理

### 6.1 目標設定
- [ ] 目標タイム設定（泳法別・プール種別）
- [ ] 質的目標設定（技術面・メンタル面）
- [ ] 量的目標設定（練習頻度・距離）
- [ ] 目標期限・期間設定

### 6.2 進捗管理
- [ ] 目標達成率の確認
- [ ] 目標と実績の比較
- [ ] マイルストーン設定・管理
- [ ] 達成予測・アラート機能

### 6.3 目標分析
- [ ] 目標設定履歴
- [ ] 達成パターン分析
- [ ] 目標達成統計



---

# 第2部：チーム利用機能

## 7. チーム管理機能

### 7.1 チーム基本機能
#### Admin権限
- [ ] チーム作成・編集・削除
- [ ] チーム情報管理（名前、説明）
- [ ] 招待コード生成・管理
- [ ] チーム設定管理

#### User権限
- [ ] チーム情報閲覧
- [ ] チーム参加・脱退

### 7.2 チーム内グループ機能
#### Admin権限
- [ ] グループ作成・編集・削除（例：1年生/2年生/3年生）
- [ ] グループ情報管理（名前、説明）
- [ ] グループ種別管理（学年別/期別/専門種目別/その他）
- [ ] メンバーのグループ割り当て・変更

#### User権限
- [ ] 自分のグループ情報閲覧
- [ ] グループ別表示・フィルタリング

### 7.3 メンバー管理機能
#### Admin権限
- [ ] チームメンバー一覧表示・管理
- [ ] メンバー招待・参加管理
- [ ] メンバー権限・役割・グループ管理
- [ ] メンバー除名機能
- [ ] 権限レベル設定（admin/user）
- [ ] 役割タイプ設定（swimmer/coach/director/manager/other）

#### User権限
- [ ] チームメンバー一覧閲覧
- [ ] 自分の権限・役割確認
- [ ] グループ別・役割別フィルタリング
- [ ] チーム脱退機能

## 8. チーム練習記録管理

### 8.1 練習計画・管理
#### Admin権限
- [x] チーム練習ログ管理
- [x] 練習内容の記録（泳法、距離、本数×セット、サークル）
- [x] 練習メニュー作成・編集・削除
- [x] 練習参加者管理
- [ ] 練習計画テンプレート管理

#### User権限
- [x] 練習ログ一覧表示・詳細表示
- [x] 自分の練習タイム入力
- [ ] 練習メモ・振り返り入力

### 8.2 タイム記録管理
#### Admin権限
- [x] 選手別タイム入力・編集
- [x] 一括タイム入力機能
- [x] タイム履歴管理・修正
- [ ] タイム記録の承認・却下

#### User権限
- [x] 自分のタイム記録閲覧
- [ ] 自分のタイム入力（承認待ち）

### 8.3 練習分析
#### Admin権限
- [x] 選手別練習記録分析
- [x] 練習内容の統計
- [x] チーム全体の練習分析
- [ ] プール種別（長水路/短水路）別分析

#### User権限
- [x] 自分の練習記録分析
- [x] 自分のタイム推移確認

## 9. チーム大会管理

### 9.1 大会情報管理
#### Admin権限
- [ ] チーム大会の作成・管理
- [ ] 大会エントリー管理
- [ ] チームメンバーの大会記録一括管理
- [ ] エントリー締切・状況管理

#### User権限
- [ ] 大会情報閲覧
- [ ] 自分のエントリー状況確認
- [ ] エントリー申請・取消

### 9.2 エントリー管理
#### Admin権限
- [x] 大会エントリーの登録・編集・削除
- [x] 泳法・距離別エントリー管理
- [x] エントリータイム管理
- [x] エントリー状況確認・承認

#### User権限
- [ ] 自分のエントリー申請
- [x] エントリー状況確認

### 9.3 記録管理
#### Admin権限
- [x] チームメンバーの大会記録登録・編集
- [x] 泳法別記録管理
- [x] 記録の詳細情報管理（メモ、動画URL）
- [ ] プール種別別記録管理（長水路/短水路）

#### User権限
- [ ] 自分の大会記録閲覧
- [ ] 記録詳細情報入力

### 9.4 記録分析
#### Admin権限
- [x] チーム全体のベストタイム管理
- [x] 泳法別記録一覧
- [x] 記録の推移分析
- [ ] チーム記録統計・ランキング

#### User権限
- [x] 自分のベストタイム確認
- [x] 自分の記録推移確認

## 10. チーム目標管理

### 10.1 目標設定
#### Admin権限
- [x] 選手別目標設定
- [x] 大会別目標タイム設定
- [x] チーム目標の設定・共有
- [ ] 目標の承認・フィードバック機能

#### User権限
- [ ] 個人目標の申請・提案
- [ ] チーム目標の確認

### 10.2 マイルストーン管理
#### Admin権限
- [x] 目標達成のためのマイルストーン設定
- [x] マイルストーンの進捗管理
- [x] マイルストーンのレビュー機能

#### User権限
- [ ] 自分のマイルストーン確認
- [ ] 進捗報告・更新

### 10.3 目標分析
#### Admin権限
- [x] チーム全体の目標達成率確認
- [x] 目標と実績の比較分析
- [x] 目標設定の履歴管理

#### User権限
- [ ] 自分の目標達成率確認
- [ ] 目標達成履歴確認

## 11. チーム予定管理

### 11.1 予定管理
#### Admin権限
- [x] チーム練習予定の作成・編集・削除
- [x] チーム大会予定の作成・編集・削除
- [x] イベントタイプ分類（練習/大会）
- [x] 場所、メモ情報管理

#### User権限
- [x] チーム予定の閲覧
- [ ] 予定への参加・不参加表明

### 11.2 カレンダー機能
#### Admin権限
- [x] チームカレンダー管理
- [x] 月間・週間スケジュール管理
- [ ] 予定の重複チェック・アラート

#### User権限
- [x] チームカレンダー表示
- [x] 個人・チーム予定の統合表示

## 12. 出欠管理機能

### 12.1 出席状況管理
#### Admin権限
- [x] イベント別出席状況確認・管理
- [x] 出席・欠席・遅刻の管理
- [x] 一括出席状況更新
- [x] 出席状況の履歴管理

#### User権限
- [x] 自分の出席状況入力・編集
- [ ] 出席状況の事前申告

### 12.2 出席統計
#### Admin権限
- [x] 選手別出席率分析
- [x] イベント別参加者数統計
- [x] 出席状況レポート生成

#### User権限
- [ ] 自分の出席率確認

## 13. お知らせ管理機能

### 13.1 お知らせ作成・管理
#### Admin権限
- [x] チームお知らせの作成・編集・削除
- [x] お知らせの公開・非公開管理
- [x] お知らせの公開日時設定
- [x] お知らせの重要度管理
- [x] チーム別お知らせ配信

#### User権限
- [x] お知らせの一覧表示・詳細表示
- [ ] お知らせの既読・未読管理

### 13.2 通知機能
#### Admin権限
- [ ] 通知設定管理（メール・プッシュ通知）
- [x] お知らせの配信履歴確認

#### User権限
- [ ] 個人通知設定
- [ ] システム通知の受信・管理
- [ ] 個人目標達成通知
- [ ] 記録更新通知
- [ ] リマインダー機能

---

## 14. 技術要件

### 14.1 使用技術

#### フロントエンド（Web）
- **フレームワーク**: Next.js 15 (App Router)
- **言語**: TypeScript 5
- **UI**: React 19 + Tailwind CSS 3
- **状態管理**: React Hooks + Context API
- **認証**: Supabase Auth
- **日付処理**: date-fns 4
- **テスト**: Playwright（E2E）
- **デプロイ**: Vercel

#### バックエンド
- **BaaS**: Supabase
- **データベース**: PostgreSQL (Supabase)
- **認証**: Supabase Auth
- **API**: Supabase Client（直接アクセス）
- **ファイル管理**: Supabase Storage
- **リアルタイム**: Supabase Realtime

#### 共通ライブラリ（Web/Mobile共通）
- **API関数**: `packages/shared/api/`
  - 練習記録API、大会記録API、チームAPI等
- **カスタムフック**: `packages/shared/hooks/`
  - usePractices、useRecords、useTeams等
- **型定義**: `packages/shared/types/`
  - データベース型、UI型定義

#### モバイルアプリ（React Native - 開発予定）
- **フレームワーク**: React Native + Expo
- **言語**: TypeScript
- **状態管理**: React Hooks + Context API
- **API**: 共通API関数（`packages/shared`）
- **認証**: Supabase Auth

#### データベース設計
- **Row Level Security (RLS)**: 個人・チームデータの適切な権限管理
- **論理削除**: データの保持と段階的削除
- **インデックス最適化**: パフォーマンス向上
- **データ整合性**: 外部キー制約とトリガー

### 14.2 セキュリティ要件
- [x] Supabase Authによる認証
- [x] JWT Token認証
- [x] Row Level Security (RLS)
- [x] パスワードの複雑性チェック
- [x] セッション管理
- [ ] 二段階認証（管理者）
- [ ] API Rate Limiting
- [ ] データ暗号化

## 15. データベース設計詳細

### 15.1 主要テーブル設計

#### 15.1.1 ユーザー・チーム関連
```sql
-- users テーブル
users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  gender INTEGER NOT NULL DEFAULT 0 CHECK (gender IN (0, 1)), -- 0: male, 1: female
  birthday DATE,
  profile_image_path TEXT, -- Supabase Storageのパスを格納
  bio TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- teams テーブル（旧groups）
teams (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  team_type TEXT DEFAULT 'team',
  invite_code TEXT UNIQUE,
  is_public BOOLEAN DEFAULT false,
  max_members INTEGER DEFAULT 100,
  created_by UUID REFERENCES users(id)
);

-- team_memberships テーブル（旧group_memberships）
team_memberships (
  id UUID PRIMARY KEY,
  team_id UUID REFERENCES teams(id),
  user_id UUID REFERENCES users(id),
  permission_level TEXT DEFAULT 'user', -- admin/user
  role_type TEXT DEFAULT 'swimmer',     -- swimmer/coach/director/manager/other
  display_name TEXT,
  member_number TEXT,
  joined_at DATE DEFAULT CURRENT_DATE,
  left_at DATE,
  is_active BOOLEAN DEFAULT true
);

-- team_groups テーブル（チーム内グループ）
team_groups (
  id UUID PRIMARY KEY,
  team_id UUID REFERENCES teams(id),
  name TEXT NOT NULL,
  description TEXT,
  group_type TEXT, -- 学年/期別/専門種目/その他
  created_by UUID REFERENCES users(id)
);

-- group_assignments テーブル（メンバーのグループ割り当て）
group_assignments (
  id UUID PRIMARY KEY,
  team_group_id UUID REFERENCES team_groups(id),
  user_id UUID REFERENCES users(id),
  assigned_by UUID REFERENCES users(id),
  assigned_at DATE DEFAULT CURRENT_DATE
);
```

#### 15.1.2 練習・記録関連
```sql
-- practice_logs テーブル（個人・チーム両対応）
practice_logs (
  id UUID PRIMARY KEY,
  practice_date DATE NOT NULL,
  location TEXT,
  team_id UUID REFERENCES teams(id), -- NULL = 個人練習
  created_by UUID REFERENCES users(id),
  style TEXT,
  rep_count INTEGER,
  set_count INTEGER,
  distance INTEGER,
  circle DECIMAL(10,2),
  note TEXT
);

-- competitions テーブル（個人・チーム両対応）
competitions (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  competition_date DATE NOT NULL,
  location TEXT,
  pool_type TEXT CHECK (pool_type IN ('long_course', 'short_course')),
  pool_length INTEGER CHECK (pool_length IN (25, 50)),
  team_id UUID REFERENCES teams(id), -- NULL = 個人参加
  created_by UUID REFERENCES users(id)
);

-- records テーブル（統合記録管理）
records (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  style_id UUID REFERENCES styles(id),
  competition_id UUID REFERENCES competitions(id),
  practice_log_id UUID REFERENCES practice_logs(id),
  record_date DATE NOT NULL,
  record_type TEXT CHECK (record_type IN ('competition', 'practice', 'time_trial')),
  pool_type TEXT CHECK (pool_type IN ('long_course', 'short_course')),
  pool_length INTEGER CHECK (pool_length IN (25, 50)),
  time DECIMAL(10,2) NOT NULL
);
```
<!-- 
## 16. 新機能追加項目

### 16.1 個人利用機能の追加
- [ ] 個人練習記録機能
- [ ] 個人大会記録機能
- [ ] 個人目標管理機能
- [ ] 個人カレンダー機能
- [ ] プール種別管理（長水路/短水路）

### 16.2 チーム機能の追加
- [ ] チーム作成・管理機能
- [ ] チームメンバー招待・管理機能
- [ ] チーム権限管理機能
- [ ] チームお知らせ機能
- [ ] チーム練習・大会管理機能

### 16.3 統合機能の追加
- [ ] 個人・チームデータの統合表示
- [ ] ベストタイム管理（プール種別・記録種別別）
- [ ] 記録分析・比較機能
- [ ] 通知・アラート機能 -->

--

## 更新履歴

**作成日**: 2025年9月  
**更新日**: 2025年1月15日  
**作成者**: ryuuhei0729  
**バージョン**: v2.1

### 主な変更点（v2.1）
- **共通API層の追加**: `packages/shared/api/` に共通API関数を実装
- **パフォーマンス向上**: レスポンスタイム41%高速化、コード量95%削減
- **コスト削減**: Edge Function実行コスト100%削減

### 主な変更点（v2.0）
- システム構成をRails → Next.js + Supabaseに変更
- 個人利用をメイン、チーム利用をサブとする利用形態に変更
- 機能を個人利用・チーム利用に分離し、admin/user権限を明確化
- グループ機能の詳細設計を追加
- プール種別（長水路/短水路）管理機能を追加
- 記録種別（大会/練習/タイムトライアル）管理機能を追加
- RLS（Row Level Security）による権限管理設計を追加
