#!/bin/bash
# =============================================================================
# ローカル環境リセットスクリプト
# supabase db reset（migration 適用）+ psql で seed 適用・PIIマスク
# =============================================================================
#
# 使い方:
#   ./supabase/scripts/reset-local.sh           # seed.sql があれば適用
#   ./supabase/scripts/reset-local.sh --no-seed # seedなしでリセット
#
# seed.sql は本番ダンプなので、先に取得しておく:
#   pnpm run db:dump-prod
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SUPABASE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$(cd "$SUPABASE_DIR/.." && pwd)"
SEED_FILE="$SUPABASE_DIR/seed.sql"
SANITIZE_FILE="$SCRIPT_DIR/sanitize-seed.sql"

# 除外テーブルの定義元は seed-excluded-tables.sh (dump-prod.sh と共有)
# shellcheck source=./seed-excluded-tables.sh
source "$SCRIPT_DIR/seed-excluded-tables.sh"

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
  echo "Seed:   $SEED_FILE ($((FILESIZE / 1024)) KB)"

  # seed に含めてはいけないテーブルが混ざっていないか検査する。
  # 古い seed.sql をそのまま流すと psql の生エラー (重複キー / カラム不在)
  # になって原因が分かりにくいので、適用前に理由付きで止める。
  FOUND_FORBIDDEN=()
  for t in "${SEED_EXCLUDED_TABLES[@]}"; do
    SCHEMA="${t%%.*}"
    TABLE="${t##*.}"
    if grep -qE "INSERT INTO \"?${SCHEMA}\"?\.\"?${TABLE}\"?" "$SEED_FILE"; then
      FOUND_FORBIDDEN+=("$t")
    fi
  done

  if [ ${#FOUND_FORBIDDEN[@]} -gt 0 ]; then
    echo ""
    echo "エラー: seed.sql に含めてはいけないテーブルが入っています:"
    printf '  %s\n' "${FOUND_FORBIDDEN[@]}"
    echo ""
    echo "理由は supabase/scripts/seed-excluded-tables.sh を参照。"
    echo "対処: 本番データを取り直してください（除外して再ダンプされます）:"
    echo "  pnpm run db:dump-prod"
    exit 1
  fi
else
  echo "モード: スキーマのみ（seed.sql が見つかりません）"
  echo ""
  echo "seedデータ付きでリセットするには、先に本番データをダンプしてください:"
  echo "  pnpm run db:dump-prod"
  NO_SEED=true
fi
echo ""

# --- psql の存在確認（seed 適用に使う） ---
if [ "$NO_SEED" = false ] && ! command -v psql >/dev/null 2>&1; then
  echo "エラー: psql が見つかりません。"
  echo "  brew install libpq && brew link --force libpq"
  exit 1
fi

# 失敗時に psql を再実行すると、1回目が途中まで投入した行と衝突して
# 「重複キー」という偽のエラーが出て本当の初回エラーが隠れる。
# 1回だけ実行してログに落とし、失敗時はそのログを見せる。
PSQL_LOG="$(mktemp)"
trap 'rm -f "$PSQL_LOG"' EXIT

apply_sql() {
  psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -q -f "$1" > "$PSQL_LOG" 2>&1
}

# --- Step 1: supabase db reset（DB再作成 + migration 適用）---
# 注意: --workdir は付けない。付けると CLI が config.toml を見つけられず
# migrations ディレクトリを見失い、migration が1件も適用されない。
echo "1/3 supabase db reset（DB再作成 + migration 適用）..."
echo ""

cd "$PROJECT_DIR"
pnpm exec supabase db reset

# --- Step 2: seed.sql を適用 ---
if [ "$NO_SEED" = false ]; then
  echo ""
  echo "2/3 seed.sql を適用中..."

  # ダンプ先頭の SET session_replication_role = replica; がトリガーとFKを
  # 無効化するので、テーブルの投入順は問わない。
  if apply_sql "$SEED_FILE"; then
    echo "seed.sql 適用完了"
  else
    echo ""
    echo "エラー: seed.sql の適用に失敗しました。詳細:"
    tail -20 "$PSQL_LOG"
    exit 1
  fi

  # --- Step 3: 個人情報マスク + テストユーザー追加 ---
  echo ""
  echo "3/3 個人情報マスク + テストユーザー追加..."

  if apply_sql "$SANITIZE_FILE"; then
    echo "完了"
  else
    echo ""
    echo "エラー: マスク処理に失敗しました。本番の個人情報がローカルに残っています。詳細:"
    tail -20 "$PSQL_LOG"
    exit 1
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
  echo "ログイン情報:"
  echo "  全ユーザー     user_<連番>@example.com / Pass1234"
  echo "  テストユーザー test@test.test / Pass1234"
fi
