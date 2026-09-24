#!/usr/bin/env bash
# Metro を Tailscale 経由で公開する。
#
# 実機 iPhone は Mac と同一 Wi-Fi に居ないことが多い。expo start の既定は LAN IP を
# bundle URL に埋めるため別回線からは到達できない。tailnet IP を
# REACT_NATIVE_PACKAGER_HOSTNAME で上書きして、どこからでも繋がるようにする。
set -euo pipefail

TS_BIN="${TAILSCALE_BIN:-}"
if [ -z "$TS_BIN" ]; then
  if command -v tailscale >/dev/null 2>&1; then
    TS_BIN="$(command -v tailscale)"
  elif [ -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ]; then
    TS_BIN="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
  else
    echo "tailscale CLI が見つかりません。" >&2
    echo "  brew install --cask tailscale-app でインストールし、ログインしてください。" >&2
    exit 1
  fi
fi

TS_IP="$("$TS_BIN" ip -4 2>/dev/null | head -n1 || true)"
if [ -z "$TS_IP" ]; then
  echo "tailnet IP を取得できません。Tailscale にログイン・接続済みか確認してください。" >&2
  exit 1
fi

echo "Metro を tailnet IP ${TS_IP} で公開します"
export REACT_NATIVE_PACKAGER_HOSTNAME="$TS_IP"

# .env.local は Supabase / Web API とも localhost を指しており実機から到達できない。
# 実機では .env.development (リモート Supabase) を使う。
exec pnpm exec dotenvx run -f .env.development -- expo start --dev-client "$@"
