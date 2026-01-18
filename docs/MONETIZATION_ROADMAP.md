# マネタイズ導入ロードマップ（広告 + 有料プラン）

## 概要

Swim Hub（Web: Next.js / Mobile: Expo）をマネタイズするために、以下を段階的に導入します。

- **通常広告**: 無料ユーザーに表示。**有料ユーザーは非表示**
- **リワード広告**: **タイム追加時に表示**（基本必須。ただし回線不良などは救済） / **有料ユーザーは非表示**
- **課金**: WebはStripe、Mobileはアプリ内課金（IAP）。最終判定はSupabaseの`public.users`フラグで一元管理

## ゴール（受け入れ基準）

- **無料ユーザー**
  - Web: 通常広告が表示される
  - Mobile: 通常広告が表示される
  - Mobile: 以下の保存時にリワード広告が表示される（soft-required）
    - 練習タイム保存（`practice_times`追加）
    - 大会スプリット保存（`split_times`追加/置き換え）
- **有料ユーザー**
  - Web/Mobileともに通常広告が表示されない
  - Mobileのリワード広告ゲートが無効化され、タイム保存が通常どおり完了する
- **有料判定**
  - `public.users`が単一の判定ソースとなり、Web/Mobileで同じ基準で切り替わる

## スコープ

### 対象（今回のマネタイズ）

- Web（Next.js）
- Mobile（Expo）
- Supabase（DB / RLS / Functions or Web側API）

### 非対象（このロードマップでは後回し）

- 広告の高度な最適化（AB、複数配置、フリークエンシー最適化）
- 広告収益・LTVの本格的分析基盤（BigQuery連携等）
- 有料プランの複数段階化（Basic/Proなど）

## 現状の関連実装（差し込みポイント）

### DB（ユーザー）

- `public.users` がプロフィール等の中心テーブル
  - 作成トリガー: `supabase/migrations/20251201014342_initial_schema.sql` 内 `handle_new_user()`

### 練習タイム（practice_times）

- Web（入力UI）: `apps/web/app/(authenticated)/practice/_components/PracticeTimeModal.tsx`
- Web（保存ハンドラー）: `apps/web/app/(authenticated)/dashboard/_hooks/useDashboardHandlers.ts`（`createPracticeTime`）
- Mobile（入力UI）: `apps/mobile/screens/PracticeTimeFormScreen.tsx`（`handleSave`でストアへ保存→後段でDB反映）
- 共通API/フック:
  - `apps/shared/api/practices.ts`（`practice_times`リレーションを含めて取得）
  - `apps/shared/hooks/queries/practices.ts`（`useCreatePracticeTimeMutation` 等）

### 大会スプリット（split_times = lap_time想定）

- Web（保存ロジック）: `apps/web/app/(authenticated)/competition/_client/CompetitionClient.tsx`（`useReplaceSplitTimesMutation`）
- Web（チーム記録）: `apps/web/app/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/RecordClient.tsx`
- Mobile（入力UI）: `apps/mobile/screens/RecordFormScreen.tsx` / `apps/mobile/screens/RecordLogFormScreen.tsx`
- 共通フック:
  - `apps/shared/hooks/queries/records.ts`（`useCreateSplitTimesMutation` / `useReplaceSplitTimesMutation`）

> リワード広告ゲートは「DB保存の直前」ではなく、**UIの保存ボタン押下直前**に入れるのが安全です（失敗時の救済、UXの一貫性、Web/Mobileの実装差を吸収しやすい）。

## 設計方針（最重要）

### 1) 有料判定の単一ソース（`public.users`）

`public.users`に以下を追加し、Web/Mobile共通で参照します。

- **必須**
  - `is_premium boolean not null default false`
- **推奨（運用で効く）**
  - `premium_expires_at timestamptz null`（期限で自動的に無料へ戻せる）
  - `premium_source text null`（`stripe` / `appstore` / `googleplay` / `manual` 等）
  - `premium_updated_at timestamptz not null default now()`（監査・デバッグ用）

判定例:

- `isPremium = users.is_premium && (premium_expires_at is null || premium_expires_at > now())`

#### セキュリティ（RLS/権限）

- クライアント（Web/Mobile）からは **自分の`public.users`を読み取り**できる
- クライアントから `is_premium` 等を **更新できない**
- 更新は以下のみ許可:
  - Stripe / Store通知を受けるサーバ処理
  - （必要なら）管理者用の限定オペレーション

### 2) 課金の“監視” → DB反映

#### Web（Stripe）

- Checkout/Portalを導入
- Webhook受信で`public.users`を更新
- **ユーザー紐付け**は、Stripe側の`customer/subscription`の`metadata`に`supabase_user_id`を保存して解決（DBにStripe IDを必ずしも保持しない）
  - 例: Checkout Session作成時に`metadata: { supabase_user_id }`

#### Mobile（IAP）

- アプリ内課金の状態を監視し、サーバ側で検証→`public.users`更新
- **ユーザー紐付け**:
  - iOS: `appAccountToken`等にユーザーIDを埋め込む（実装方式に合わせて決定）
  - Google Play: `obfuscatedAccountId` / `obfuscatedProfileId`等を利用

> 実装の置き場所は「Next.js Route Handlers」または「Supabase Edge Functions」のどちらかに統一し、署名検証と監査ログを必ず残す。

### 3) 広告表示は“必ずガードを通す”

- `isPremium`をアプリ共通のContext/Storeに保持
- 広告UIは `if (!isPremium) render` を徹底
- 画面単位で分散させず、**共通レイアウト**や**共通コンポーネント**で吸収する

### 4) リワード広告ゲート（soft-required）

#### 対象アクション

- `practice_times`の保存（練習タイム追加）
- `split_times`の保存（大会スプリット追加/置き換え）

#### soft-requiredルール（提案）

- 基本は「視聴完了で保存」
- ただし以下は救済して保存を許可:
  - 広告ロード失敗 / 在庫なし
  - ネットワーク不良
  - SDKエラー
- 救済時は「今回は広告をスキップして保存しました」を表示し、**ログに理由を記録**（後で改善判断に使う）

## フェーズ別ロードマップ

### Phase 0: プロダクト/ポリシー定義

- [ ] プラン名・価格・提供価値の確定（まずは「広告非表示」）
- [ ] プライバシーポリシー/同意文言整備
  - 広告ID（IDFA/AAID）利用の説明
  - 課金状態（有料/無料）の扱い
- [ ] アプリ内の購入導線/復元導線（Restore Purchases）の設計

### Phase 1: 有料判定フラグ基盤（DB + 共通参照）

- [ ] DB: `public.users`に有料判定カラム追加（上記の必須/推奨）
- [ ] RLS/権限: クライアント更新不可、本人読み取り可を保証
- [ ] Web: `isPremium`を取得してアプリ全体で参照できる仕組み（Context/Hook）
- [ ] Mobile: 同様に`isPremium`を保持（AuthProvider or 専用Provider）

**受け入れ基準**
- [ ] ログイン後に`isPremium`が確実に取得でき、画面遷移しても保持される

### Phase 2: 通常広告（無料のみ）

- [ ] Web: AdSense/Ad Manager枠を共通レイアウトに追加（無料のみ）
  - SSR/CSRを考慮し、クライアント側でのみスクリプトを扱う
- [ ] Mobile: AdMob Bannerをまず1箇所に導入（無料のみ）
  - テスト用Ad Unit IDから開始 → 本番IDへ切替
- [ ] 計測（最小）: 広告の表示/非表示切替が正しいか（無料/有料で比較）

**受け入れ基準**
- [ ] 無料ユーザーで表示、有料ユーザーで非表示
- [ ] 広告表示による主要画面のレイアウト崩れがない

### Phase 3: リワード広告（soft-required）

- [ ] Mobile（練習タイム）: `PracticeTimeFormScreen`保存前にRewardedを表示
- [ ] Mobile（大会スプリット）: `RecordFormScreen`/`RecordLogFormScreen`保存前にRewardedを表示
- [ ] 救済: 失敗時は保存を許可 + 理由ログ
- [ ] 有料ユーザーはゲート無効（即保存）

**受け入れ基準**
- [ ] 視聴成功→保存完了
- [ ] 失敗→救済で保存完了（UIで明示）
- [ ] 有料→広告なしで保存完了

### Phase 4: Web課金（Stripe）

- [ ] Stripe Checkout導入（サブスク）
- [ ] Customer Portal導入（解約/支払い管理）
- [ ] Webhook受信（署名検証必須）
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- [ ] Webhookで`public.users`更新（`is_premium`, `premium_expires_at`, `premium_source`）
- [ ] 監査ログ（最低限の永続化）を残す（イベント種別/ユーザー/時刻/結果）

### Phase 5: Mobile課金（IAP）

- [ ] IAPライブラリ選定（Expo運用に合うもの）
- [ ] レシート検証 or サーバ通知を受ける仕組みを実装（署名/認証必須）
- [ ] `public.users`更新（`is_premium`, `premium_expires_at`, `premium_source`）
- [ ] 復元導線（Restore Purchases）を実装
- [ ] 失効/返金/チャージバック/更新失敗の取り扱いを明文化

### Phase 6: 運用・改善

- [ ] “救済”頻度が高い場合の改善（リトライ、事前ロード、導線の見直し）
- [ ] 有料導線の最適化（「広告非表示」訴求、設定画面）
- [ ] 不正対策（webhook重複、リプレイ、ID偽装）
- [ ] （必要に応じて）広告配置の追加・最適化

## テスト計画（最小）

- Web（E2E/手動）:
  - [ ] `isPremium=false`で広告表示
  - [ ] `isPremium=true`で広告非表示
- Mobile（手動→自動化は後）:
  - [ ] リワード成功→保存
  - [ ] リワード失敗→救済で保存
  - [ ] 有料→リワードなしで保存
- 統合:
  - [ ] Stripe webhook受信→`public.users`更新→クライアント反映
  - [ ] IAP検証/通知→`public.users`更新→クライアント反映

## リスクと対策

- **課金状態のズレ（Stripe/Store vs DB）**
  - 対策: Webhook/通知を正として更新し、後で再同期の仕組み（定期/手動）を用意
- **広告でUXが落ちる**
  - 対策: まずは最小配置（1箇所）から。計測しながら増やす
- **リワード失敗で登録できない**
  - 対策: soft-required救済 + 失敗理由ログ + 後で改善

