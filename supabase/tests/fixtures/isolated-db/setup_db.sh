#!/bin/bash
# pgTAP 用の隔離した Postgres を作り直し、supabase/migrations を順に適用する。
# supabase start のスタック (54322) を使えないとき・他のセッションと共有しているときに使う。
#
#   bash supabase/tests/fixtures/isolated-db/setup_db.sh
#   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54399 -U postgres -d postgres -tA -f supabase/tests/20_weekly_usage_report.test.sql
# テストはホストの psql -f で流す。docker exec の標準入力で流すと、09 番の `\ir ../migrations/...` が
# 解決できずに偽の赤になる。
#
# 既定はコンテナ qa-weekly-report-pg / 127.0.0.1:54399。並行して別に立てるときは
#   QA_PG_NAME=qa-wr-other QA_PG_PORT=54398 bash supabase/tests/fixtures/isolated-db/setup_db.sh
# 同じ名前のコンテナは作り直す (中のデータは消える)。
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)" # swim-hub
NAME="${QA_PG_NAME:-qa-weekly-report-pg}"
PORT="${QA_PG_PORT:-54399}"
IMAGE="${QA_PG_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.052}"
LOG="${TMPDIR:-/tmp}/$NAME-migrate.log"

docker rm -f "$NAME" >/dev/null 2>&1
docker run -d --name "$NAME" -p "127.0.0.1:$PORT:5432" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null || exit 1
for _ in $(seq 1 90); do
  if docker exec "$NAME" psql -U postgres -tAc "select 1 from pg_namespace where nspname='storage'" 2>/dev/null | grep -q 1; then break; fi
  sleep 2
done
sleep 5

# bare image に無いものを補う。対象の所有者が supabase_* なので postgres では permission denied になり、
# supabase_admin で流す必要がある
#   1. storage-api のコンテナが足す storage.buckets の列 (無いと initial_schema など4本が途中で止まる)
#   2. auth.uid() / role() / email() / jwt() を supabase start の DB (GoTrue が差し替えた版) と同じ定義にする
#      (image 同梱の auth.uid() は request.jwt.claims を読まず、role を切り替える pgTAP が赤になる)
admin() { docker exec -i -e PGPASSWORD=postgres "$NAME" psql -h 127.0.0.1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
admin -c "alter table storage.buckets add column if not exists public boolean default false, add column if not exists file_size_limit bigint, add column if not exists allowed_mime_types text[];" \
  || { echo "storage.buckets の列の追加に失敗"; exit 1; }
admin < "$HERE/auth_funcs.sql" || { echo "auth 関数の差し替えに失敗"; exit 1; }

: > "$LOG"
failed=0
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "== $f" >> "$LOG"
  docker exec -i "$NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "$f" >> "$LOG" 2>&1 || { echo "FAILED $(basename "$f")"; failed=1; }
done
echo "applied: $(grep -c '^==' "$LOG") (log: $LOG)"
docker exec "$NAME" psql -U postgres -tAc "select 'auth.uid reads request.jwt.claims', pg_get_functiondef('auth.uid'::regproc) like '%request.jwt.claims%'; select 'cron', jobname, schedule from cron.job order by jobname"
exit $failed
