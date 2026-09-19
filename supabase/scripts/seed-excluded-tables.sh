# =============================================================================
# seed.sql に含めてはいけないテーブルの唯一の定義元
# =============================================================================
# dump-prod.sh  : ダンプ時に -x で除外する
# reset-local.sh: seed に混入していないか適用前に検査する
#
# 2箇所に書き分けると片方だけ更新されて静かに壊れるため、必ずここを唯一の
# 定義元として両スクリプトから source する。
# =============================================================================

SEED_EXCLUDED_TABLES=(
  # --- migration が INSERT するテーブル ---
  # 本番データを重ねると主キー重複になる。加えて本番に Issue #13 の
  # タイトルケース移行が未適用だと小文字の style が CHECK 制約に弾かれる。
  public.styles
  public.race_pace_models
  storage.buckets

  # --- Supabase プラットフォーム (GoTrue) 管理のテーブル ---
  # auth スキーマの構造はこちらの migration の管轄外。本番の GoTrue が
  # ローカル CLI 同梱版より新しいとカラムが増えていて適用が失敗する。
  # 実例: 本番 GoTrue v2.185.0 の flow_state には invite_token / referrer /
  # oauth_client_state_id / linking_target_id / email_optional がある。
  auth.flow_state

  # --- 本番ユーザーの生きた認証情報 ---
  # sanitize-seed.sql のマスク対象外。かつマスクでパスワードがダミーに
  # 置き換わるためローカルでは使えず、コピーする意味がない。
  auth.sessions
  auth.refresh_tokens
  auth.mfa_amr_claims
  auth.one_time_tokens

  # --- 本番の認証ログ (IPアドレス・メールアドレスを含む) ---
  auth.audit_log_entries
)
