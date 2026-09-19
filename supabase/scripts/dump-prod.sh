#!/bin/bash
# =============================================================================
# Production データダンプスクリプト
# 本番DBのデータをダンプして supabase/seed.sql に保存する
# =============================================================================
#
# 使い方:
#   ./supabase/scripts/dump-prod.sh                   # linked プロジェクトから（パスワードは対話入力）
#   SUPABASE_DB_PASSWORD=xxx ./supabase/scripts/dump-prod.sh
#   ./supabase/scripts/dump-prod.sh postgresql://...  # 接続文字列を直接指定
#
# パスワードは Supabase Dashboard > Settings > Database で確認・再発行できる。
#
# pg_dump はホストのものを使わず Supabase CLI が Docker 内で起動する。
# ホストの pg_dump (Homebrew libpq: 14系) では本番の PG17 をダンプできず
# バージョン不一致で abort するため。Docker が起動している必要がある。
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SUPABASE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$(cd "$SUPABASE_DIR/.." && pwd)"
SEED_FILE="$SUPABASE_DIR/seed.sql"

# 除外テーブルの定義元は seed-excluded-tables.sh (reset-local.sh と共有)
# shellcheck source=./seed-excluded-tables.sh
source "$SCRIPT_DIR/seed-excluded-tables.sh"

PROD_DB_URL="${1:-${PROD_DATABASE_URL:-}}"

cd "$PROJECT_DIR"

# --- 接続先の決定 ---
# 注意: --workdir は付けない。付けると CLI が config.toml を見つけられず
# project_id/migrations をデフォルト値にフォールバックする。
if [ -n "$PROD_DB_URL" ]; then
  CONN=(--db-url "$PROD_DB_URL")
  TARGET="指定された接続文字列"
else
  CONN=(--linked)
  TARGET="linked プロジェクト ($(cat "$SUPABASE_DIR/.temp/project-ref" 2>/dev/null || echo '不明'))"
  if [ -z "${SUPABASE_DB_PASSWORD:-}" ]; then
    if [ ! -t 0 ]; then
      echo "エラー: 対話入力できない環境です。SUPABASE_DB_PASSWORD を設定するか"
      echo "        接続文字列を引数で渡してください。"
      exit 1
    fi
    read -rsp "本番DBのパスワード (Dashboard > Settings > Database): " SUPABASE_DB_PASSWORD
    echo ""
  fi
  export SUPABASE_DB_PASSWORD
fi

# --- Docker 確認 ---
if ! docker info >/dev/null 2>&1; then
  echo "エラー: Docker が起動していません。"
  echo "Supabase CLI は pg_dump を Docker 内で実行するため Docker が必要です。"
  exit 1
fi

echo "========================================"
echo " 本番データダンプ"
echo "========================================"
echo "接続先: $TARGET"
echo "出力先: $SEED_FILE"
echo ""

# --- migration のズレ確認 ---
# 本番スキーマが手元の migration より古いと、ダンプしたデータが
# ローカルのスキーマ (NOT NULL / CHECK) を通らず db:reset が失敗する。
echo "1/2 本番と手元の migration 差分を確認中..."
MIGRATION_LIST="$(mktemp)"
trap 'rm -f "$MIGRATION_LIST"' EXIT

if ! pnpm exec supabase migration list "${CONN[@]}" > "$MIGRATION_LIST" 2>&1; then
  echo ""
  echo "エラー: 本番DBに接続できません。"
  cat "$MIGRATION_LIST"
  echo ""
  echo "確認事項:"
  echo "  - パスワードが正しいか"
  echo "  - Supabase Dashboard でIPアクセス制限がかかっていないか"
  exit 1
fi

if grep -qE '^\s*Local\s*\|\s*Remote\s*\|' "$MIGRATION_LIST"; then
  # Local 列に値があり Remote 列が空 = 本番未適用
  UNAPPLIED="$(awk -F'|' '
    { gsub(/ /, "", $1); gsub(/ /, "", $2) }
    $1 ~ /^[0-9]{14}$/ && $2 == "" { print $1 }
  ' "$MIGRATION_LIST")"

  if [ -n "$UNAPPLIED" ]; then
    echo ""
    echo "警告: 本番に未適用の migration が $(echo "$UNAPPLIED" | wc -l | tr -d ' ') 件あります:"
    echo "$UNAPPLIED" | sed 's/^/  /'
    echo ""
    echo "本番スキーマが手元より古いため、ダンプしたデータが"
    echo "ローカルのスキーマに入らない場合があります (NOT NULL / CHECK 違反)。"
    echo ""
    if [ -t 0 ]; then
      read -rp "続行しますか? [y/N]: " ANSWER
      if [ "$ANSWER" != "y" ] && [ "$ANSWER" != "Y" ]; then
        echo "中止しました。"
        exit 1
      fi
    else
      echo "(対話不可のため続行します)"
    fi
  else
    echo "本番と手元の migration は同期しています。"
  fi
else
  # CLI のバージョンアップで出力形式が変わった場合は自動判定せず生表示する
  echo ""
  echo "警告: migration list の出力形式を解釈できませんでした。目視で確認してください:"
  cat "$MIGRATION_LIST"
fi

# --- ダンプ ---
echo ""
echo "2/2 ダンプ中... (数分かかることがあります)"

EXCLUDE_ARGS=()
for t in "${SEED_EXCLUDED_TABLES[@]}"; do
  EXCLUDE_ARGS+=(-x "$t")
done

# 失敗時に既存の seed.sql を壊さないよう、一時ファイルに書いてから差し替える
TMP_SEED="$(mktemp)"
trap 'rm -f "$MIGRATION_LIST" "$TMP_SEED"' EXIT

pnpm exec supabase db dump "${CONN[@]}" \
  --data-only \
  "${EXCLUDE_ARGS[@]}" \
  -f "$TMP_SEED"

if [ ! -s "$TMP_SEED" ]; then
  echo "エラー: ダンプ結果が空です。seed.sql は更新していません。"
  exit 1
fi

mv "$TMP_SEED" "$SEED_FILE"

FILESIZE=$(wc -c < "$SEED_FILE" | tr -d ' ')
echo ""
echo "========================================"
echo " 完了: $SEED_FILE ($((FILESIZE / 1024)) KB)"
echo "========================================"
echo ""
echo "含まれるスキーマ: public / auth / storage"
echo "除外したテーブル (migration 管理 / プラットフォーム管理 / 認証情報):"
printf '  %s\n' "${SEED_EXCLUDED_TABLES[@]}"
echo ""
echo "次のステップ:"
echo "  pnpm run db:reset   # ローカルDBをリセット (migration + seed + PIIマスク)"
