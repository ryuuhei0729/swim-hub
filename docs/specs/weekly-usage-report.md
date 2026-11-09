# 週次利用レポート 仕様 / Sprint Contract

状態: 承認済み (2026-11-09。送信は土曜 7:00 JST、集計は土曜から金曜の週)
ブランチ: `feature/weekly-usage-report`

## 目的

運営者が毎週、DB の「この1週間の登録件数」と登録後の動線を Gmail で受け取る。

## 構成

```
pg_cron (毎週金曜 22:00 UTC = 土曜 07:00 JST)
  → invoke_weekly_usage_report()  … vault の project_url と cron 用 secret で pg_net.http_post
    → Edge Function weekly-report (verify_jwt = false、cron 用 secret を定数時間比較)
      → RPC generate_weekly_usage_report(p_week_start)  … 集計 + スナップショット + 保存 + 先週値を返す
      → 本文を整形して Resend で送信
      → RPC mark_weekly_usage_report_sent(p_week_start)
```

- 3アプリは Supabase プロジェクトを共有しているので、Edge Function は swim-hub からデプロイする
- Resend の呼び方は `_shared/revenucat-webhook-handler.ts` の `notifyBillingEmail` に揃える
  (fetch を直接使う、from `SwimHub <noreply@swim-hub.app>`、`Bearer`、5秒の `AbortSignal.timeout`)
- 宛先: `WEEKLY_REPORT_EMAIL`、未設定なら `BILLING_NOTIFY_EMAIL`。どちらも無ければ送らず、保存だけする
- cron の認証: 専用の `WEEKLY_REPORT_CRON_SECRET`。Edge Function の secret と vault の両方に同じ値を置く。値は migration に書かない
- `pg_net` は initial_schema で DROP されている。cron 用の migration で `CREATE EXTENSION`。失敗は NOTICE にして、migration 自体は通す
- vault に値が無い環境 (ローカル・CI) では、`invoke_weekly_usage_report()` は NOTICE を出して何もしない

## 週の定義

- 対象週は JST の土曜 00:00 から翌週の土曜 00:00 までの半開区間 `[period_start, period_end)` で、土曜から金曜の7日間になる。`week_start` は始まりの土曜の JST の日付
- 既定の対象週は「実行時点の JST で、今日以前の直近の土曜の7日前」。土曜 07:00 に実行すると、前週の土曜から前日の金曜までが対象になる (ユーザーの指定: 2026-11-09 に月曜 9:00 から土曜 7:00 へ変更)
- `timestamptz` の列は `period_start <= created_at < period_end` で数える。日付の列 (`usage_date`。JST の日付で書かれている) は `week_start <= usage_date < week_start + 7` で数える
- 物理削除された行は数えない (soft delete の列は無い)

## 指標

すべて `weekly_usage_reports.metrics` (キー → 数値の flat な jsonb) に保存する。区分ごとの表示順と表示名は Edge Function の整形側に持ち、ラベルの無いキーも落とさずに「その他の指標」に出す。

### 1. アカウント・利用
| キー | 表示名 | 定義 |
|---|---|---|
| `account.users_new` | 新規アカウント登録 | `users.created_at` が週内 |
| `account.active_users` | アクティブユーザー (週内に何か登録した人) | 下の作成系テーブルのうち、週内に作られた行の作成者を重複なしで数える。作成者は行ごとに `coalesce(created_by, user_id)` で決める (practices の created_by はほとんど NULL なので、列単位で created_by を選ぶと作成者が落ちる)。対象: practices, practice_logs, practice_tags, practice_log_templates, competitions, entries, records, relay_records (created_by), goals (milestones は goals.user_id 経由), team_memberships, team_groups (created_by), announcements (created_by), teams (作成者の列がある場合のみ)、および出欠に回答した人 (`team_attendance` で status が NOT NULL、かつ updated_at が週内の user_id) |

- 制限: 代理入力 (管理者が選手の entries / records を入力する) では、選手の `user_id` が作成者として数えられる。Scanner / Timer の利用は区分7で別に数え、ここには含めない

`user_sessions` は使わない。どのアプリからも書き込まれておらず、常に 0 件になるため。

### 2. 個人の練習
| キー | 表示名 | 定義 |
|---|---|---|
| `practice.personal_practices` | 練習登録 | `practices`、`team_id IS NULL` |
| `practice.personal_practices_with_image` | うち画像付き | 上記のうち、`image_paths` が空でない jsonb 配列のもの |
| `practice.personal_logs` | 練習ログ登録 | `practice_logs` のうち、親の practice の `team_id IS NULL` のもの |
| `practice.personal_logs_with_times` | うちタイム付き | 上記のうち、`practice_times` が1件以上あるもの (時点は集計時) |
| `practice.tags` | 練習タグ作成 | `practice_tags` |
| `practice.log_templates` | 練習テンプレート作成 | `practice_log_templates` |

### 3. 個人の大会
| キー | 表示名 | 定義 |
|---|---|---|
| `competition.personal_competitions` | 大会登録 | `competitions`、`team_id IS NULL` |
| `competition.personal_entries` | エントリー登録 | `entries`、`team_id IS NULL` |
| `competition.personal_records` | レースレコード登録 | `records`、`team_id IS NULL` |
| `competition.personal_records_with_video` | うち動画付き | 上記のうち、`video_path` が NULL でも空文字でもないもの |
| `competition.personal_records_with_splits` | うちラップタイム付き | 上記のうち、`split_times` が1件以上あるもの |

`practice_times` と `split_times` は、保存のたびに全行を削除して作り直される (`packages/shared/api/practices.ts` の replacePracticeTimes、`records.ts` の replaceSplitTimes)。そのため行数ではなく、親の件数で数える。

### 4. チーム
| キー | 表示名 | 定義 |
|---|---|---|
| `team.teams` | チーム作成 | `teams` |
| `team.memberships_new` | チーム加入 (申請・招待を含む) | `team_memberships` |
| `team.memberships_approved` | うち承認済み (集計時点) | 上記のうち `status = 'approved'` |
| `team.practices` | チーム練習登録 | `practices`、`team_id IS NOT NULL` |
| `team.practices_with_logs` | うち練習ログ付き | 上記のうち、`practice_logs` が1件以上あるもの (チームのログは一括編集で作り直されるので、親で数える) |
| `team.competitions` | チーム大会登録 | `competitions`、`team_id IS NOT NULL` |
| `team.entries` | チームエントリー | `entries`、`team_id IS NOT NULL` |
| `team.records` | チームの記録登録 | `records`、`team_id IS NOT NULL` |
| `team.records_with_splits` | うちラップタイム付き | 上記のうち、`split_times` が1件以上あるもの |
| `team.relay_records` | リレー記録 | `relay_records` |
| `team.attendance` | 出欠回答 | `team_attendance` で `status IS NOT NULL` かつ `updated_at` が週内のもの。出欠の行は、チームの練習・大会を作った時点でトリガ (`create_attendance_for_team_practice/competition`) が全員分を status NULL で作り、回答すると UPDATE されて `updated_at` が更新される (`update_team_attendance_updated_at`)。created_at で数えると回答ではなく自動作成の行を数えてしまう。回答後にメモだけ編集しても再計上されるのは制限として受け入れる |
| `team.announcements` | お知らせ投稿 | `announcements` |
| `team.groups` | グループ作成 | `team_groups` |

### 5. 目標
| キー | 表示名 | 定義 |
|---|---|---|
| `goal.created` | 目標設定 | `goals.created_at` |
| `goal.achieved` | 目標達成 | `goals.achieved_at` が週内 |
| `goal.milestones_created.<type>` | マイルストーン設定 (種類別) | `milestones` を `type` で group by。type は固定で列挙せず、動的に出す |
| `goal.milestones_achieved` | マイルストーン達成 | `milestones.achieved_at` が週内 |

### 6. 課金 (3アプリ共通)
`user_subscriptions` には状態遷移の履歴が無い。そこで毎週、premium の行のスナップショットを `user_subscription_snapshots` に保存し、前週のスナップショットとの差分を取る。

- スナップショットに入れる行は `plan = 'premium'` のもの。列は `week_start`, `user_id`, `status`, `provider`, `cancel_at_period_end`, `provider_environment`, `premium_expires_at`
- スナップショットはその週で最初に集計したとき (その週の `weekly_usage_reports` の行がまだ無いとき) に1回だけ取る。行ごとの `ON CONFLICT DO NOTHING` だけでは、後から有料になった人が再実行のたびに足されるので足りない。同じ週を再実行・force 再送しても取り直さない。課金の指標は、常にその週のスナップショットから計算する。これは、過去の週を再実行したときに「今」の状態で上書きされ、翌週の差分が壊れるのを防ぐため
- 「前週のスナップショットがあるか」は、前週の `weekly_usage_reports` の行があるかで判定する。前週の premium が 0 人でも「比較あり」として扱う
- 集計は本番と sandbox を分ける。`provider_environment = 'sandbox'` だけを sandbox とし、NULL (2026-08 以前の行) は本番として扱う
- provider が NULL の premium 行は、キーの末尾を `unknown` にする (例 `billing.premium_total.unknown`)

| キー | 表示名 | 定義 |
|---|---|---|
| `billing.premium_total.<provider>` | 有料会員数 (集計時点) | 本番の premium 行を provider 別に数える |
| `billing.cancel_pending` | うち解約予約中 | `status = 'canceled'` または `cancel_at_period_end = true` |
| `billing.new_premium.<provider>` | 新規有料 | 今回にあり、前週に無い user_id |
| `billing.new_cancel_pending` | 新規解約予約 | 今回は解約予約中で、前週は無いか解約予約ではない |
| `billing.churned` | 有料終了 | 前週にあり、今回に無い |
| `billing.sandbox_premium_total` | sandbox の有料 (参考) | sandbox の premium 行の数 |

- 前週のスナップショットが無いとき (初回) は、フローの指標 (`new_*`・`churned`) を出さず、「比較なし」と表示する
- 週の中で購入から失効まで終わったものは見えない。これは制限として受け入れる

### 7. Scanner / Timer
| キー | 表示名 | 定義 |
|---|---|---|
| `token.<app>.<action_type>` | AI 読み取り回数 | `token_consumption_log.created_at` が週内。app と action_type で group by |
| `usage.<app>.active_users` | アプリ別の利用者数 | `app_daily_usage` で `usage_date` が週内のもの。`usage_count > 0` の distinct user_id を app 別に |
| `guest.scans` | ゲストの読み取り回数 | `guest_scan_daily_usage` の count の合計 |
| `guest.unique_ips` | ゲストの IP 数 | 同じく distinct ip_hash |

### 8. サポート
| キー | 表示名 | 定義 |
|---|---|---|
| `support.contact_messages` | 問い合わせ | `contact_messages` |

### 9. 動線 (1週遅れのコホート)
コホートは「対象週の前の週 `[week_start - 7, week_start)` に登録したユーザー」。登録から7日以内 (`created_at < users.created_at + 7 days`) に、各段階の行動を1回以上した人数を出す。コホートの全員が、`period_end` までに丸7日の猶予を持っている。

| キー | 表示名 | 行動 |
|---|---|---|
| `funnel.cohort_size` | 前週の新規登録者 | コホートの人数 |
| `funnel.practice` | 7日以内に練習 | practices または practice_logs を作成 |
| `funnel.competition` | 7日以内に大会・記録 | competitions / entries / records を作成 |
| `funnel.team` | 7日以内にチーム参加 | team_memberships を作成 |
| `funnel.goal` | 7日以内に目標 | goals を作成 |

メールでは、コホート人数に対する割合も出す (コホートが 0 人なら割合は出さない)。

### 子テーブル (分類済み。親の指標の中で使い、単独では数えない)
- `practice_times` (練習ログの子)、`split_times` (レース記録の子)、`relay_record_legs` (リレー記録の子)

### 集計しないもの (除外リスト)
- 関連テーブル: `practice_log_tags`, `team_group_memberships`, `user_team_calendar_colors`, `milestone_achievements`
- マスタ: `styles`, `race_pace_models`
- システム用: `processed_webhook_events`, `contact_rate_limit_daily_usage`, `user_sessions` (書き込みが無い), `weekly_usage_reports`, `user_subscription_snapshots`
- 課金で別扱い: `user_subscriptions`

### 未分類テーブル
- 分類済みと除外リストは、集計関数の中の定数配列だけで持つ (唯一の定義元)
- `pg_tables` の public スキーマとの差を `uncategorized_tables text[]` として保存し、メールの末尾に出す。0件なら「なし」

## 保存と先週比

- `weekly_usage_reports` の列は次のとおり
  - `week_start date PK`
  - `period_start`, `period_end timestamptz`
  - `metrics jsonb`
  - `uncategorized_tables text[]`
  - `generated_at`
  - `email_sent_at`
- 先週比は「`week_start - 7` ちょうどの行」の metrics とだけ比べる。その行が無ければ「先週データなし」、キーが無ければ「新規指標」と表示する。過去に遡って比べない
- 同じ週を再実行したら上書きする。ただし `email_sent_at` は消さない (巻き戻さない)
- 新しいテーブルは2つ (`weekly_usage_reports`, `user_subscription_snapshots`)。どちらも RLS を有効にし、ポリシーは作らない
  - `anon` と `authenticated` からは REVOKE する
  - `service_role` には明示的に GRANT する (`.claude/rules/swim-domain.md` の新規テーブル規約に従う)
- 集計と送信済みの記録を行う RPC (`generate_weekly_usage_report`, `mark_weekly_usage_report_sent`)
  - `SECURITY DEFINER` と `SET search_path = public` を付け、OWNER は postgres
  - `PUBLIC`, `anon`, `authenticated` から REVOKE し、`service_role` にだけ EXECUTE を付ける
- `invoke_weekly_usage_report()` は cron (postgres) 専用。service_role にも EXECUTE を付けない

## メール

- テキストのみ。件名は `【週次レポート】2026/10/31〜11/06 の利用状況` (期間は JST、終了日は金曜の包含表記)
- 本文
  - 冒頭に集計期間 (JST) と生成時刻を書く
  - 区分 1〜9 の順に、見出し行と「表示名: 今週の値 (先週 N / +差分)」を並べる。減少は `-3`、同じなら `±0`
  - 末尾に「その他の指標」(ラベルの無いキー) と「未分類テーブル」を置く
  - 前週分の `email_sent_at` が NULL なら「前週のレポートは未送信でした」と注記する

## Edge Function の入出力

- POST のみ。それ以外は 405
- 認証値が一致しなければ 401 (定数時間で比較する)
- body (任意)
  - `{ "week_start": "YYYY-MM-DD", "force": boolean }`
  - 次のときは 400 を返す
    - `week_start` が土曜でない、または形式が不正
    - まだ終わっていない週 (`week_start + 7日` が JST の今日より後。進行中の今週を含む)
    - `force` が boolean でない
    - JSON として壊れている
  - RPC 側でも、土曜以外の `p_week_start` は例外にする
  - `force` が無ければ、送信済みの週は再送しない (集計の保存は行う)
- Resend が失敗 (非2xx・例外・タイムアウト) したら `email_sent_at` を更新せず、502 を返す。再実行すれば再送できる
- 送信には成功して mark が失敗したら、500 を返してログに出す。再実行すると二重送信になるが、制限として受け入れる
- OPTIONS は他のメソッドと同じく 405 にする
- 応答は `{ week_start, sent: boolean, reason? }`。reason は `already_sent` / `not_configured` / `send_failed` のいずれか
- 件名の期間は、年をまたぐときは終了日にも年を付ける (`2026/12/26〜2027/01/01`)

## ファイル構成

```
supabase/migrations/20261110000000_add_weekly_usage_reports.sql        テーブル2つ + 集計 RPC + mark RPC
supabase/migrations/20261110000001_register_weekly_usage_report_cron.sql  pg_net + invoke 関数 + cron.schedule
supabase/functions/weekly-report/index.ts
supabase/functions/_shared/weekly-report-handler.ts      認証・RPC・送信
supabase/functions/_shared/weekly-report-format.ts       件名・本文の整形 (純関数)
supabase/functions/_shared/weekly-report-handler.test.ts
supabase/functions/_shared/weekly-report-format.test.ts
supabase/config.toml                                     [functions.weekly-report] verify_jwt = false
supabase/tests/20_weekly_usage_report.test.sql           pgTAP
docs/ops/weekly-usage-report.md                          secret と vault の設定、デプロイ、手動再送の手順
```

## Sprint Contract

### 成功条件
| # | 条件 | 検証 |
|---|---|---|
| 1 | 週の境界が `[土曜 00:00 JST, 翌週の土曜 00:00 JST)` になっている (始端ちょうどは含み、終端ちょうどは含まない) | pgTAP: 境界の -1秒・ちょうど・+1秒。変異 (`<` → `<=`) で赤になることを確認 |
| 2 | 日付の列 (`usage_date`) も同じ週で数える | pgTAP: 金曜と土曜の境界 |
| 3 | 個人とチームが正しく分かれる (`practice_logs` は親の practice の team_id で判定) | pgTAP: 混在した fixture |
| 4 | 「画像付き・動画付き・タイム付き・ラップ付き・ログ付き」が、空配列・空文字・NULL・子0件を除く | pgTAP |
| 5 | 親の件数で数える指標は、子を作り直しても増えない | pgTAP: 子を delete+insert した後に件数が同じ |
| 6 | アクティブユーザーが、複数のテーブルにまたがっても重複なしで数えられる | pgTAP |
| 7 | milestone を type 別に、動的なキーで出す | pgTAP |
| 8 | 課金のスナップショットの差分が正しい (新規・解約予約・有料終了、provider 別、sandbox の分離、初回は比較なし) | pgTAP: 2週分の状態を投入 |
| 9 | 動線のコホートと7日の窓が正しい (登録後7日ちょうどは含まない、コホート外は数えない) | pgTAP |
| 10 | 先週比は、ちょうど7日前の行だけを使う。その行が無い場合も扱える | pgTAP + Deno (整形) |
| 11 | 分類に無いテーブルが「未分類」に出る。今のスキーマでは 0 件 | pgTAP: 一時的にテーブルを作って確認 |
| 12 | RPC と2つのテーブルに、anon と authenticated はアクセスできない。RPC は service_role だけが実行できる | pgTAP: has_function_privilege と has_table_privilege で3ロールを確認 |
| 13 | cron ジョブが `0 22 * * 5` (金曜 22:00 UTC = 土曜 07:00 JST) で登録される (pg_cron がある環境のみ) | pgTAP |
| 14 | vault・pg_net が無い環境でも、migration と `invoke_weekly_usage_report()` が失敗しない | ローカルの `supabase db reset` か `supabase start`、および pgTAP |
| 15 | Edge Function が、認証なし・不一致なら 401、POST 以外なら 405、`week_start` が不正なら 400 を返す | Deno (CI) |
| 16 | Resend の呼び方が既存と同じ。宛先のフォールバックと、未設定なら送らない動きも正しい | Deno: fetch モック |
| 17 | 送信に失敗したら `email_sent_at` を更新しない。送信済みなら再送しない (`force` があれば再送する) | Deno |
| 18 | 本文が区分 1〜9、その他の指標、未分類の順に並ぶ。先週比の表記が正しい | Deno (純関数) |
| 19 | 既存のテストを壊さない。Deno は全件緑。pgTAP は着手前の基準線 (19本中15本が緑。05・06・07・13 は既に赤) から赤を増やさない。09 は `\ir` で migration を相対パスで読むので、標準入力ではなく `psql -f` で流す | `deno test supabase/functions/` と、既存の pgTAP を隔離 DB で実行 |
| 20 | ローカルの結合スモーク: `supabase start` → functions serve → 手動で POST → 行が保存される (送信は宛先未設定でスキップ) | 手動で実測し、ログを残す |

### 範囲外
- 課金のイベントログ (webhook の改修)
- 閲覧ベースのアクティブユーザー (トラッキングの新設)
- HTML メール・グラフ・ダッシュボード
- 過去の週のバックフィル
- pgTAP を CI に載せること (現状 CI で走っていない。別タスク)
- scanner / timer 側のコード変更
- 本番へのデプロイ・secret / vault の設定 (手順書を用意し、マージ後に PM がユーザーの承認を得て行う)
