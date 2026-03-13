#!/bin/bash
# =============================================================================
# ローカル環境リセットスクリプト
# supabase db reset（内部初期化）+ psqlでマイグレーション・seed適用
# =============================================================================
#
# 使い方:
#   ./supabase/scripts/reset-local.sh          # seed.sql があれば適用
#   ./supabase/scripts/reset-local.sh --no-seed # seedなしでリセット
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SUPABASE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$(cd "$SUPABASE_DIR/.." && pwd)"
SEED_FILE="$SUPABASE_DIR/seed.sql"
SANITIZE_FILE="$SCRIPT_DIR/sanitize-seed.sql"
MIGRATIONS_DIR="$SUPABASE_DIR/migrations"

LOCAL_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

NO_SEED=false
if [ "${1:-}" = "--no-seed" ]; then
  NO_SEED=true
fi

echo "========================================"
echo " SwimHub ローカルDB リセット"
echo "========================================"

# --- seed.sql の存在確認 ---
if [ "$NO_SEED" = true ]; then
  echo "モード: スキーマのみ（seedなし）"
elif [ -f "$SEED_FILE" ]; then
  FILESIZE=$(wc -c < "$SEED_FILE" | tr -d ' ')
  echo "モード: スキーマ + seed"
  echo "Seed:   $SEED_FILE ($(echo "scale=1; $FILESIZE / 1024" | bc) KB)"
else
  echo "モード: スキーマのみ（seed.sql が見つかりません）"
  echo ""
  echo "seedデータ付きでリセットするには、先に本番データをダンプしてください:"
  echo "  pnpm run db:dump-prod"
  NO_SEED=true
fi
echo ""

# --- Step 1: supabase db reset でクリーンなDB作成 ---
echo "1/4 supabase db reset（Supabase内部初期化）..."
echo ""

cd "$PROJECT_DIR"
pnpm exec supabase db reset --workdir supabase || true

# DBが使えるようになるまで待機
echo ""
echo "DB接続を確認中..."
for i in $(seq 1 15); do
  if psql "$LOCAL_DB_URL" -c "SELECT 1;" > /dev/null 2>&1; then
    echo "DB接続OK"
    break
  fi
  if [ "$i" -eq 15 ]; then
    echo "エラー: DBに接続できません"
    echo "Supabaseが起動しているか確認してください:"
    echo "  pnpm exec supabase start --workdir supabase"
    exit 1
  fi
  sleep 2
done

# --- Step 2: ユーザーマイグレーション適用 ---
echo ""
echo "2/4 マイグレーションを適用中..."

MIGRATION_COUNT=0
for migration_file in "$MIGRATIONS_DIR"/*.sql; do
  if [ -f "$migration_file" ]; then
    BASENAME=$(basename "$migration_file")
    if ! psql "$LOCAL_DB_URL" -f "$migration_file" > /dev/null 2>&1; then
      echo "  エラー: $BASENAME の適用に失敗"
      psql "$LOCAL_DB_URL" -f "$migration_file" 2>&1 | grep -i "error" | head -5
      exit 1
    fi
    MIGRATION_COUNT=$((MIGRATION_COUNT + 1))
  fi
done

echo "マイグレーション適用完了（${MIGRATION_COUNT}件）"

# --- Step 3: seed.sql を適用 ---
if [ "$NO_SEED" = false ]; then
  echo ""
  echo "3/4 seed.sql を適用中..."

  if psql "$LOCAL_DB_URL" -f "$SEED_FILE" > /dev/null 2>&1; then
    echo "seed.sql 適用完了"
  else
    echo ""
    echo "エラー: seed.sql の適用に失敗しました。詳細:"
    psql "$LOCAL_DB_URL" -f "$SEED_FILE" 2>&1 | tail -20
    exit 1
  fi

  # --- Step 4: 個人情報マスク + テストユーザー追加 ---
  echo ""
  echo "4/4 個人情報マスク + テストユーザー追加..."

  if psql "$LOCAL_DB_URL" -f "$SANITIZE_FILE" > /dev/null 2>&1; then
    echo "完了"
  else
    echo ""
    echo "警告: マスク処理に失敗しました。詳細:"
    psql "$LOCAL_DB_URL" -f "$SANITIZE_FILE" 2>&1 | tail -10
  fi
fi

echo ""
echo "========================================"
echo " リセット完了"
echo "========================================"
echo ""
echo "ローカルSupabase:"
echo "  API:    http://127.0.0.1:54321"
echo "  Studio: http://127.0.0.1:54323"
echo "  DB:     $LOCAL_DB_URL"
if [ "$NO_SEED" = false ]; then
  echo ""
  echo "テストユーザー: test@test.test / Pass1234"
fi
