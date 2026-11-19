#!/usr/bin/env bash
# AI テスターの初回セットアップ (自分のターミナルで 1 回だけ実行する)。
#  1. 結果を暗号化する鍵ペアを作る (秘密鍵はこのマシンの ~/.mobile-agent-testers/ にだけ残る)
#  2. 公開鍵を tools/agent-testers/results_public.pem に書く (コミットはしない。中身を確認して自分でコミット)
#  3. GitHub Secrets を設定する: ARTIFACT_PASSPHRASE / Claude の認証 / テスト用アカウント
# 認証情報はこのターミナルでだけ入力する。チャットや AI エージェントには渡さないこと。
# Based on pierridotite/mobile-agent-testers setup.sh (MIT, see LICENSE.upstream)
set -euo pipefail
command -v gh >/dev/null || { echo "GitHub CLI (gh) をインストールしてください: https://cli.github.com"; exit 1; }
command -v openssl >/dev/null || { echo "openssl が必要です"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "先に gh auth login を実行してください"; exit 1; }
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
echo "Setting up agent testers for $REPO"

KEYDIR="$HOME/.mobile-agent-testers"; mkdir -p "$KEYDIR"; chmod 700 "$KEYDIR"
PRIV="$KEYDIR/${REPO//\//_}.pem"
if [ ! -f "$PRIV" ]; then
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out "$PRIV" 2>/dev/null
  chmod 600 "$PRIV"
  echo "秘密鍵を作成しました: $PRIV (コミットしない・なくさない)"
fi
openssl pkey -in "$PRIV" -pubout -out "$HERE/results_public.pem"
echo "公開鍵: $HERE/results_public.pem"

SECRETS=$(gh secret list --json name -q '.[].name' 2>/dev/null || true)
has() { grep -qxE "$1" <<<"$SECRETS"; }
ask_secret() {  # $1 = secret name, $2 = prompt
  local v; read -rsp "$2 (入力は表示されません): " v; echo
  [ -n "$v" ] || { echo "空なので $1 は設定しませんでした"; return; }
  printf '%s' "$v" | gh secret set "$1"; unset v; echo "Secret $1 を設定しました"
}

has ARTIFACT_PASSPHRASE || { openssl rand -hex 32 | gh secret set ARTIFACT_PASSPHRASE; echo "Secret ARTIFACT_PASSPHRASE を設定しました"; }

if ! has 'CLAUDE_CODE_OAUTH_TOKEN|ANTHROPIC_API_KEY'; then
  echo
  echo "Claude の認証。どちらか:"
  echo "  1) Claude Pro/Max のサブスクリプション: 別のターミナルで 'claude setup-token' を実行して出たトークン"
  echo "  2) Anthropic の API キー (従量課金)"
  read -rp "1 か 2: " CHOICE
  if [ "$CHOICE" = 2 ]; then ask_secret ANTHROPIC_API_KEY "API キーを貼り付け"
  else ask_secret CLAUDE_CODE_OAUTH_TOKEN "トークンを貼り付け"; fi
fi

if ! has AGENT_TESTERS_LOGIN_EMAIL || ! has AGENT_TESTERS_LOGIN_PASSWORD; then
  echo
  echo "テスト用アカウント: development の Supabase (apps/mobile/.env.development の接続先) に"
  echo "メール + パスワードでログインできる、テスト専用のアカウント。本番や個人のアカウントは使わないこと。"
  echo "Android では ASCII しか入力できないので、パスワードは英数字と記号だけにしてください。"
  ask_secret AGENT_TESTERS_LOGIN_EMAIL "メールアドレス"
  ask_secret AGENT_TESTERS_LOGIN_PASSWORD "パスワード"
fi

has DOTENV_PRIVATE_KEY_DEVELOPMENT || echo "注意: Secret DOTENV_PRIVATE_KEY_DEVELOPMENT がありません (ビルドに必要。web の CI と同じもの)"

cat <<MSG

完了。次の手順:
  1. git add tools/agent-testers/results_public.pem して、develop に入れる (ワークフローは develop にないと実行できない)
  2. 実行:  gh workflow run agent-testers.yml
  3. 回収:  bash tools/agent-testers/collect.sh <run id>
MSG
