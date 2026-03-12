#!/bin/bash
# =============================================================================
# Production データダンプスクリプト
# 本番DBのデータをダンプして supabase/seed.sql に保存する
# =============================================================================
#
# 使い方:
#   PROD_DATABASE_URL=postgresql://... ./supabase/scripts/dump-prod.sh
#   または
#   ./supabase/scripts/dump-prod.sh postgresql://postgres.[ref]:[password]@...
#
# 接続文字列は Supabase Dashboard > Settings > Database > Connection string (URI)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SUPABASE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SEED_FILE="$SUPABASE_DIR/seed.sql"

# --- 引数 / 環境変数から接続先を取得 ---
PROD_DB_URL="${1:-${PROD_DATABASE_URL:-}}"

if [ -z "$PROD_DB_URL" ]; then
  echo "エラー: 本番DBの接続文字列が必要です。"
  echo ""
  echo "使い方:"
  echo "  $0 <PROD_DATABASE_URL>"
  echo "  PROD_DATABASE_URL=postgresql://... $0"
  echo ""
  echo "接続文字列は Supabase Dashboard で確認できます:"
  echo "  Settings > Database > Connection string (URI)"
  exit 1
fi

# --- ツールの存在確認 ---
for cmd in pg_dump psql; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "エラー: $cmd が見つかりません。"
    echo "  brew install libpq && brew link --force libpq"
    exit 1
  fi
done

# --- SSL対応: sslmode が未指定なら自動付与 ---
if [[ "$PROD_DB_URL" != *"sslmode="* ]]; then
  if [[ "$PROD_DB_URL" == *"?"* ]]; then
    PROD_DB_URL="${PROD_DB_URL}&sslmode=require"
  else
    PROD_DB_URL="${PROD_DB_URL}?sslmode=require"
  fi
fi

# --- 接続テスト ---
echo "本番DBに接続テスト中..."
if ! psql "$PROD_DB_URL" -c "SELECT 1;" 2>&1; then
  echo ""
  echo "エラー: 本番DBに接続できません。"
  echo "確認事項:"
  echo "  - パスワードが正しいか（特殊文字は URL エンコードが必要）"
  echo "  - Direct connection の接続文字列を使っているか"
  echo "  - Supabase Dashboard でIPアクセス制限がないか"
  exit 1
fi
echo "接続OK"

# --- ダンプ対象テーブル（FK依存順） ---
# styles はマイグレーションでシードされるため除外
TABLES=(
  users
  teams
  team_memberships
  team_groups
  group_assignments
  practices
  practice_logs
  practice_tags
  practice_log_tags
  practice_times
  practice_log_templates
  practice_images
  competitions
  entries
  records
  split_times
  competition_images
  team_attendance
  goals
  milestones
  milestone_achievements
  announcements
  user_sessions
  user_subscriptions
  app_daily_usage
)

echo "seed.sql を生成中..."

# --- ヘッダー ---
cat > "$SEED_FILE" <<EOF
-- =============================================================================
-- Seed data (本番データダンプ)
-- Generated: $(date '+%Y-%m-%d %H:%M:%S')
-- =============================================================================

-- トリガー無効化（RLS・副作用回避）
SET session_replication_role = 'replica';

-- =============================================================================
-- auth.users（FK制約用・パスワードはダミーに置換）
-- =============================================================================
EOF

echo "  auth.users をダンプ中..."
psql "$PROD_DB_URL" --no-align --tuples-only --quiet -c "
SELECT
  'INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token) VALUES ('
  || quote_literal('00000000-0000-0000-0000-000000000000') || ', '
  || quote_literal(id) || ', '
  || quote_literal(COALESCE(aud, 'authenticated')) || ', '
  || quote_literal(COALESCE(role, 'authenticated')) || ', '
  || quote_literal(COALESCE(email, 'user_' || LEFT(id::text, 8) || '@example.com')) || ', '
  || quote_literal('\$2a\$10\$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345') || ', '
  || 'now(), now(), now(), '
  || quote_literal('') || ', '
  || quote_literal('') || ', '
  || quote_literal('') || ', '
  || quote_literal('')
  || ') ON CONFLICT (id) DO NOTHING;'
FROM auth.users
ORDER BY created_at;
" >> "$SEED_FILE" 2>/dev/null || {
  echo "  警告: auth.users のダンプに失敗（service_role権限が必要な場合があります）"
  echo "-- auth.users のダンプに失敗しました" >> "$SEED_FILE"
}

# --- public スキーマのテーブルをダンプ ---
echo "" >> "$SEED_FILE"
echo "-- =============================================================================" >> "$SEED_FILE"
echo "-- public スキーマ データ" >> "$SEED_FILE"
echo "-- =============================================================================" >> "$SEED_FILE"

for t in "${TABLES[@]}"; do
  # テーブルの存在チェック
  EXISTS=$(psql "$PROD_DB_URL" --no-align --tuples-only -c "
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = '$t'
    );
  " 2>/dev/null || echo "f")

  if [ "$EXISTS" = "t" ]; then
    ROW_COUNT=$(psql "$PROD_DB_URL" --no-align --tuples-only -c "SELECT COUNT(*) FROM public.\"$t\";" 2>/dev/null || echo "0")
    echo "  $t ($ROW_COUNT 行)..."

    if [ "$ROW_COUNT" != "0" ]; then
      echo "" >> "$SEED_FILE"
      echo "-- $t ($ROW_COUNT rows)" >> "$SEED_FILE"
      pg_dump "$PROD_DB_URL" \
        --data-only \
        --no-owner \
        --no-privileges \
        --column-inserts \
        --table="public.${t}" \
        2>/dev/null >> "$SEED_FILE" || {
        echo "  警告: $t のダンプに失敗しました"
        echo "-- $t のダンプに失敗しました" >> "$SEED_FILE"
      }
    else
      echo "-- $t (empty)" >> "$SEED_FILE"
    fi
  else
    echo "  $t (テーブルなし - スキップ)"
  fi
done

# --- フッター ---
cat >> "$SEED_FILE" <<'EOF'

-- =============================================================================
-- トリガー再有効化
-- =============================================================================
SET session_replication_role = 'origin';
EOF

FILESIZE=$(wc -c < "$SEED_FILE" | tr -d ' ')
echo ""
echo "完了: $SEED_FILE ($(echo "scale=1; $FILESIZE / 1024" | bc) KB)"
echo ""
echo "次のステップ:"
echo "  pnpm run db:reset   # ローカルDBをリセット（スキーマ + seed）"
