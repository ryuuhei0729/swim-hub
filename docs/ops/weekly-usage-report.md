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

vault (SQL Editor で実行):

```sql
select vault.create_secret('https://<ref>.supabase.co', 'project_url');
select vault.create_secret('<WEEKLY_REPORT_CRON_SECRET と同じ値>', 'weekly_report_cron_secret');
```

`project_url` か `weekly_report_cron_secret` が vault に無い環境では、`invoke_weekly_usage_report()` は NOTICE を出して何もしない。

## 2. デプロイ

3アプリは Supabase プロジェクトを共有しているので、swim-hub からデプロイする。

```bash
cd swim-hub
supabase db push --project-ref <ref>             # migration 20261110000000 / 20261110000001
supabase functions deploy weekly-report --project-ref <ref>
```

migration 適用時に NOTICE が出ていないか確かめる (`pg_net の有効化に失敗しました` / `pg_cron が無効なため ... 登録しませんでした`)。
登録の確認: `select jobname, schedule from cron.job where jobname = 'weekly-usage-report';` (`0 22 * * 5`)。

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
