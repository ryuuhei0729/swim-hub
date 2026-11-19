#!/bin/bash
# =============================================================================
# dev の Supabase をローカル DB と同じ状態にする (スキーマ + データ)
# =============================================================================
#
# 使い方 (swim-hub のチェックアウトのルートで、ローカルの Supabase を起動した状態で):
#   bash supabase/scripts/sync-dev-from-local.sh
#
# やること:
#   1. 接続先を apps/mobile/.env.development の EXPO_PUBLIC_SUPABASE_URL のプロジェクトに限定する
#      (linked プロジェクト = 本番 だったら中止)
#   2. dev を supabase db reset で手元の migration どおりに作り直す (dev の既存データは消える)
#   3. ローカルのデータをダンプして dev に流し込む
#   4. 鍵かけ: KEEP_LOGIN_EMAIL (既定 user_1@example.com) 以外の全ユーザーのパスワードをランダムにし、
#      Stripe の ID を消す
#
# ローカルのデータは本番ダンプ (名前・メール等はマスク済み、それ以外は本番の内容) なので、
# 次のテーブルは dev に持ち出さない:
#   - seed-excluded-tables.sh の除外テーブル (migration 管理 / 認証情報)
#   - public.contact_messages (問い合わせの氏名・メール・IP・本文。マスクされていない)
#   - public.contact_rate_limit_daily_usage (IP ハッシュ)
#   - public.processed_webhook_events (本番の Stripe イベント ID)
#
# 必要なもの: Docker (ローカル Supabase), psql, apps/mobile/.env.keys,
#   dev の接続文字列 (Dashboard > Connect > Session pooler、パスワード入り)
# =============================================================================

set -euo pipefail

PROJECT_DIR="$(pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
KEEP_LOGIN_EMAIL="${KEEP_LOGIN_EMAIL:-user_1@example.com}"
LOCAL_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

die() { echo ""; echo "エラー: $*"; exit 1; }

# --- 前提の確認 ---
[ -f "$PROJECT_DIR/supabase/config.toml" ] || die "swim-hub のルートで実行してください (supabase/config.toml がありません)"
[ -f "$PROJECT_DIR/apps/mobile/.env.keys" ] || die "apps/mobile/.env.keys がありません (dev の URL を復号するのに必要)"
command -v psql >/dev/null || die "psql がありません: brew install libpq && brew link --force libpq"
docker info >/dev/null 2>&1 || die "Docker が起動していません"
psql "$LOCAL_DB_URL" -Atc "select 1" >/dev/null 2>&1 || die "ローカルの Supabase に接続できません: pnpm run supabase:start"
[ -t 0 ] || die "対話入力できる端末で実行してください"

# shellcheck source=./seed-excluded-tables.sh
source "$SCRIPT_DIR/seed-excluded-tables.sh"
EXCLUDED=("${SEED_EXCLUDED_TABLES[@]}" public.contact_messages public.contact_rate_limit_daily_usage public.processed_webhook_events)

# --- 接続先 (dev) の特定 ---
DEV_API_URL="$(cd "$PROJECT_DIR/apps/mobile" && pnpm exec dotenvx get EXPO_PUBLIC_SUPABASE_URL -f .env.development 2>/dev/null || true)"
DEV_ANON_KEY="$(cd "$PROJECT_DIR/apps/mobile" && pnpm exec dotenvx get EXPO_PUBLIC_SUPABASE_ANON_KEY -f .env.development 2>/dev/null || true)"
[[ "$DEV_API_URL" =~ ^https://([a-z0-9]+)\.supabase\.co/?$ ]] || die "apps/mobile/.env.development の EXPO_PUBLIC_SUPABASE_URL が Supabase クラウドの URL ではありません"
DEV_REF="${BASH_REMATCH[1]}"
PROD_REF="$(cat "$PROJECT_DIR/supabase/.temp/project-ref" 2>/dev/null || true)"
[ "$DEV_REF" != "$PROD_REF" ] || die "dev の URL が linked プロジェクト (本番) と同じです: $DEV_REF"

echo "========================================"
echo " dev の Supabase をローカルと同じにする"
echo "========================================"
echo "接続先 (dev):    $DEV_REF  ($DEV_API_URL)"
echo "本番 (linked):   ${PROD_REF:-不明}  ← こちらには触りません"
echo "ログインを残す:  $KEEP_LOGIN_EMAIL (Pass1234)"
echo ""

psql "$LOCAL_DB_URL" -Atc "select 1 from auth.users where email = '$KEEP_LOGIN_EMAIL'" | grep -q 1 \
  || die "ローカルに $KEEP_LOGIN_EMAIL がいません (pnpm run db:reset で seed を入れてください)"

echo "dev の接続文字列を貼り付けてください (Dashboard > Connect > Session pooler、[YOUR-PASSWORD] を置き換えたもの)"
read -rsp "接続文字列 (表示されません): " DEV_DB_URL; echo ""
[[ "$DEV_DB_URL" == postgres*://* ]] || die "postgresql:// で始まる接続文字列を入力してください"
[[ "$DEV_DB_URL" == *"$DEV_REF"* ]] || die "接続文字列が dev ($DEV_REF) のものではありません"
[ -z "$PROD_REF" ] || [[ "$DEV_DB_URL" != *"$PROD_REF"* ]] || die "接続文字列に本番 ($PROD_REF) が含まれています"
psql "$DEV_DB_URL" -Atc "select 1" >/dev/null || die "dev に接続できません (パスワード / 一時停止していないか / 接続文字列)"

echo ""
echo "dev ($DEV_REF) のスキーマとデータはすべて消えて、ローカルの内容に置き換わります。"
read -rp "続けるなら dev のプロジェクト ID ($DEV_REF) を入力: " ANSWER
[ "$ANSWER" = "$DEV_REF" ] || die "中止しました"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
DATA="$TMP_DIR/data.sql"

# --- 1/4 ローカルのデータをダンプ ---
echo ""
echo "1/4 ローカルのデータをダンプ中..."
EXCLUDE_ARGS=()
for t in "${EXCLUDED[@]}"; do EXCLUDE_ARGS+=(-x "$t"); done
pnpm exec supabase db dump --local --data-only "${EXCLUDE_ARGS[@]}" -f "$DATA"
[ -s "$DATA" ] || die "ダンプが空です"
# pg_dump 17.6 以降が付ける \restrict / \unrestrict は psql 16 以前では解釈できず止まる。
# 自分で作ったダンプなので外してよい
grep -vE '^\\(un)?restrict ' "$DATA" > "$DATA.tmp" && mv "$DATA.tmp" "$DATA"

# --- 2/4 dev を migration どおりに作り直す ---
echo ""
echo "2/4 dev を手元の migration で作り直し中 (supabase db reset)..."
pnpm exec supabase db reset --db-url "$DEV_DB_URL" --no-seed

# --- 3/4 + 4/4 データ投入と鍵かけ (1 トランザクション: 途中で失敗したら何も入らない) ---
echo ""
echo "3/4 データを投入中 / 4/4 鍵かけ..."
# ダンプが入れる auth / storage のテーブルは reset 後も残っているので、先に空にする
CLEAR="$TMP_DIR/clear.sql"
grep -oE '^INSERT INTO "(auth|storage)"\."[a-z_]+"' "$DATA" | sort -u \
  | sed -E 's/^INSERT INTO (.*)$/DELETE FROM \1;/' > "$CLEAR"
# dev に残っているログインセッションも消す (ダンプには含めていない)
printf 'DELETE FROM auth.%s;\n' refresh_tokens sessions mfa_amr_claims one_time_tokens flow_state >> "$CLEAR"
LOCK="$TMP_DIR/lock.sql"
cat > "$LOCK" <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = '$KEEP_LOGIN_EMAIL') THEN
    RAISE EXCEPTION '$KEEP_LOGIN_EMAIL がデータにありません';
  END IF;
END \$\$;
-- ログインを残すユーザー以外は、行ごとに別のランダムなパスワードにする (誰にも分からない)
UPDATE auth.users
   SET encrypted_password = extensions.crypt(encode(extensions.gen_random_bytes(24), 'hex'), extensions.gen_salt('bf'))
 WHERE email <> '$KEEP_LOGIN_EMAIL';
-- 本番の Stripe の ID は dev に置かない
UPDATE public.user_subscriptions SET stripe_customer_id = NULL, provider_subscription_id = NULL;
SQL
psql "$DEV_DB_URL" --single-transaction -v ON_ERROR_STOP=1 -q \
  -c "SET session_replication_role = replica" \
  -f "$CLEAR" -f "$DATA" -f "$LOCK" >/dev/null

# --- 確認 ---
echo ""
echo "確認 (ローカル / dev の件数):"
for t in auth.users public.users public.teams public.practices public.competitions public.records; do
  L=$(psql "$LOCAL_DB_URL" -Atc "select count(*) from $t")
  D=$(psql "$DEV_DB_URL" -Atc "select count(*) from $t")
  printf '  %-22s %6s / %6s %s\n' "$t" "$L" "$D" "$([ "$L" = "$D" ] && echo OK || echo '← 不一致')"
done

login() {  # $1 = email → HTTP status of a password login on dev
  curl -s -o /dev/null -w '%{http_code}' -m 15 -X POST "${DEV_API_URL%/}/auth/v1/token?grant_type=password" \
    -H "apikey: $DEV_ANON_KEY" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"Pass1234\"}"
}
OTHER=$(psql "$DEV_DB_URL" -Atc "select email from auth.users where email <> '$KEEP_LOGIN_EMAIL' order by created_at limit 1")
echo ""
echo "ログイン確認 (dev の Auth API):"
echo "  $KEEP_LOGIN_EMAIL / Pass1234 → HTTP $(login "$KEEP_LOGIN_EMAIL") (200 なら OK)"
[ -n "$OTHER" ] && echo "  $OTHER / Pass1234 → HTTP $(login "$OTHER") (400 なら鍵かけ OK)"
echo ""
echo "完了"
