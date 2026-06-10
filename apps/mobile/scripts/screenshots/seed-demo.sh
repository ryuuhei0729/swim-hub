#!/usr/bin/env bash
#
# スクショ撮影用のデモアカウント + シードデータを Supabase に投入する。
# Maestro はこのアカウントでログインして、データの入った画面を撮影する。
#
# !!! 本番ではなくデモ/ステージング Supabase プロジェクトに対して実行すること !!!
#
# 必須 env:
#   DEMO_SUPABASE_URL    : https://xxxx.supabase.co
#   DEMO_SERVICE_ROLE_KEY: service_role キー（auth ユーザー作成用・秘匿）
#   DEMO_DB_URL          : postgres 接続文字列 (例 postgresql://postgres:pw@db.xxxx.supabase.co:5432/postgres)
#   APP_EMAIL            : デモアカウントのメール
#   APP_PASSWORD         : デモアカウントのパスワード（capture.sh と同じ値）
#
# 依存: curl, jq, psql
#
set -euo pipefail

SEED_SQL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../supabase" && pwd)/test-data-2025.sql"
SEED_USER_UUID="1f1d17b2-f4dd-4599-9a08-3c467b679bc6"  # 元 SQL 内の固定ユーザーID

: "${DEMO_SUPABASE_URL:?}" ; : "${DEMO_SERVICE_ROLE_KEY:?}" ; : "${DEMO_DB_URL:?}"
: "${APP_EMAIL:?}" ; : "${APP_PASSWORD:?}"
[ -f "$SEED_SQL" ] || { echo "ERROR: seed SQL が見つかりません: $SEED_SQL" >&2; exit 1; }
for c in curl jq psql; do command -v "$c" >/dev/null || { echo "ERROR: $c が必要です" >&2; exit 1; }; done

echo "==> auth ユーザー作成 (email_confirm=true)"
RESP="$(curl -sS -X POST "$DEMO_SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $DEMO_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $DEMO_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg e "$APP_EMAIL" --arg p "$APP_PASSWORD" \
        '{email:$e, password:$p, email_confirm:true, user_metadata:{name:"Demo Swimmer"}}')")"

NEW_ID="$(echo "$RESP" | jq -r '.id // empty')"
if [ -z "$NEW_ID" ]; then
  # 既存ユーザーの可能性 → 一覧から取得
  NEW_ID="$(curl -sS "$DEMO_SUPABASE_URL/auth/v1/admin/users" \
    -H "apikey: $DEMO_SERVICE_ROLE_KEY" -H "Authorization: Bearer $DEMO_SERVICE_ROLE_KEY" \
    | jq -r --arg e "$APP_EMAIL" '.users[]? | select(.email==$e) | .id' | head -1)"
fi
[ -n "$NEW_ID" ] || { echo "ERROR: auth ユーザーIDを取得できません: $RESP" >&2; exit 1; }
echo "    user id = $NEW_ID"

echo "==> シードデータ投入（ユーザーIDを差し替え）"
sed "s/$SEED_USER_UUID/$NEW_ID/g" "$SEED_SQL" | psql "$DEMO_DB_URL" -v ON_ERROR_STOP=1 -q

echo "==> プロフィール確定（onboarding_completed=true）"
psql "$DEMO_DB_URL" -v ON_ERROR_STOP=1 -q -c \
  "UPDATE users SET name=COALESCE(name,'Demo Swimmer'), onboarding_completed=true WHERE id='$NEW_ID';"

echo ""
echo "✅ デモアカウント準備完了"
echo "   APP_EMAIL=$APP_EMAIL でログイン可能。capture.sh にこの値を渡す。"
