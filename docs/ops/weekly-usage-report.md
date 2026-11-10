# 週次利用レポート 運用手順

仕様: `docs/specs/weekly-usage-report.md`。毎週土曜 07:00 JST (cron `0 22 * * 5`、UTC 金曜 22:00) に、
前週の土曜から金曜までの利用状況を運営者にメールする。

本番への設定・デプロイは、マージ後に PM がユーザーの承認を得て行う。

## 1. secret

`WEEKLY_REPORT_CRON_SECRET` は、Edge Function の secret と vault の両方に同じ値を置く。値は migration やリポジトリに書かない。

```bash
# 値は十分に長いランダム文字列にする
supabase secrets set WEEKLY_REPORT_CRON_SECRET=<値> --project-ref <ref>
# 宛先。未設定なら BILLING_NOTIFY_EMAIL に送る。RESEND_API_KEY は既存の secret を使う
supabase secrets set WEEKLY_REPORT_EMAIL=<宛先> --project-ref <ref>
```

vault (SQL Editor で実行)。同じ名前の secret が既にあると `create_secret` は名前の重複で失敗するので、先に有無を確かめる:

```sql
select name from vault.secrets where name in ('project_url', 'weekly_report_cron_secret');
```

無いものは作る:

```sql
select vault.create_secret('https://<ref>.supabase.co', 'project_url');
select vault.create_secret('<WEEKLY_REPORT_CRON_SECRET と同じ値>', 'weekly_report_cron_secret');
```

既にあって値を変えるときは `update_secret` を使う:

```sql
select vault.update_secret((select id from vault.secrets where name = 'weekly_report_cron_secret'), '<新しい値>');
```

`project_url` か `weekly_report_cron_secret` が vault に無い環境では、`invoke_weekly_usage_report()` は NOTICE を出して何もしない。

## 2. デプロイ

3アプリは Supabase プロジェクトを共有しているので、swim-hub からデプロイする。

`db push` は、本番に未適用の migration をすべて適用する。先に一覧を見て、この2本以外に未適用のものが無いかを確かめる (別の変更の migration が一緒に出ないように)。この2本以外にも未適用があったら、`db push` せずに止めて PM に相談する。

```bash
cd swim-hub
supabase link --project-ref <ref>
supabase migration list --linked                 # Remote が空の行 = 未適用。20261110000000 / 20261110000001 だけであること
supabase db push
supabase functions deploy weekly-report --project-ref <ref>
```

migration 適用時に NOTICE が出ていないか確かめる (`pg_net の有効化に失敗しました` / `pg_cron が無効なため ... 登録しませんでした`)。
登録の確認: `select jobname, schedule from cron.job where jobname = 'weekly-usage-report';` (`0 22 * * 5`)。

デプロイ後に、ゲートウェイで JWT の検証が無効になっているかを確かめる。認証なしで POST して、Edge Function 自身の 401 (`{"error":"Unauthorized"}`) が返れば無効になっている。ゲートウェイの JWT エラーが返る場合は、`config.toml` の `[functions.weekly-report] verify_jwt = false` が反映されていない (cron からの呼び出しも 401 になる)。

### 注意

- **cron の時刻 (土曜 07:00 JST) の前後に手動実行しない。** 同時実行でメールが二重に届く (advisory lock は generate の中だけで、送信は守っていない)。
- **デプロイ後の初回確認は既定の週 (body `{}`) で行う。** 未集計の過去の週を後から作らない。スナップショットは実行時点の状態で取られるため、過去の週を作ると課金の差分の期間がずれる。
- **pg_net の有効化で `net` スキーマ (`http_post`・`http_request_queue`・`_http_response`) が PUBLIC に開く。** cron secret はワーカーが処理するまで平文でキューに載る。現状 API が公開しているのは `public` スキーマだけなので、anon / authenticated から届く経路は無い (これは `config.toml` (ローカル) の設定で、本番は Dashboard の API 設定の Exposed schemas に `net` が無いことを確認する)。`public` に動的 SQL を実行する関数を作らないこと。
- **generate が失敗 (500) すると、その週の行が残らない。** 翌週のメールが「先週データなし」になるだけで気づきにくい。メールが来なかったら §4 の確認クエリを見る。

## 3. 手動実行・再送

Edge Function は POST のみ。認証は `Authorization: Bearer <WEEKLY_REPORT_CRON_SECRET>`。

```bash
# 既定の週 (今日以前の直近の土曜の7日前) を集計して送る。送信済みなら再送しない
curl -X POST https://<ref>.supabase.co/functions/v1/weekly-report \
  -H "Authorization: Bearer <secret>" -H "Content-Type: application/json" -d '{}'

# 週を指定して、送信済みでも再送する (week_start は終わった週の土曜、YYYY-MM-DD)
curl -X POST https://<ref>.supabase.co/functions/v1/weekly-report \
  -H "Authorization: Bearer <secret>" -H "Content-Type: application/json" \
  -d '{"week_start":"2026-10-31","force":true}'
```

応答は `{ "week_start", "sent", "reason?" }`。

| 応答 | 意味 |
|---|---|
| 200 `sent: true` | 送信して `email_sent_at` を記録した |
| 200 `already_sent` | 送信済み (`force: true` で再送) |
| 200 `not_configured` | 宛先 (`WEEKLY_REPORT_EMAIL` / `BILLING_NOTIFY_EMAIL`) か `RESEND_API_KEY` が無い。集計の保存だけした |
| 502 `send_failed` | Resend が失敗。`email_sent_at` は更新していない。再実行すれば再送できる |
| 500 | 集計の失敗、または送信後の記録の失敗 (後者は再実行すると二重送信になる) |
| 400 | `week_start` が土曜でない・形式不正・まだ終わっていない週、`force` が boolean でない、JSON が壊れている |

## 4. 確認

- 保存行: `select week_start, generated_at, email_sent_at from weekly_usage_reports order by week_start desc;`
- cron の実行履歴: `select * from cron.job_run_details order by start_time desc limit 5;`
- pg_net の応答: `select id, status_code, content from net._http_response order by created desc limit 5;`
- メール末尾の「未分類テーブル」に名前が出たら、`generate_weekly_usage_report` の分類済み / 除外リストに足す。
