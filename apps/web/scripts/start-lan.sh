#!/usr/bin/env bash
# 実機スマホから触るための dev サーバー起動スクリプト。
#
# NEXT_PUBLIC_* はクライアントバンドルに埋め込まれるため、.env.local のまま
# (127.0.0.1:54321) だとスマホのブラウザは「スマホ自身」を見にいって全通信が失敗する。
# ローカル Supabase / APP_URL のホスト部だけを、スマホから到達できるアドレスに差し替える。
#
# dotenvx は既に設定済みの環境変数を上書きしないため、ここで export した値が勝つ。
set -euo pipefail
cd "$(dirname "$0")/.."

# 到達先アドレス: tailnet IP を優先 (別回線でも届く)。無ければ LAN IP。
HOST_IP="${DEV_HOST_IP:-}"
if [ -z "$HOST_IP" ]; then
  for TS in "$(command -v tailscale 2>/dev/null || true)" /Applications/Tailscale.app/Contents/MacOS/Tailscale; do
    if [ -n "$TS" ] && [ -x "$TS" ]; then
      HOST_IP="$("$TS" ip -4 2>/dev/null | head -n1 || true)"
      [ -n "$HOST_IP" ] && break
    fi
  done
fi
if [ -z "$HOST_IP" ]; then
  HOST_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
fi
if [ -z "$HOST_IP" ]; then
  echo "到達可能な IP を特定できません。DEV_HOST_IP=<ip> を指定して再実行してください。" >&2
  exit 1
fi

# .env.local の値のうち、ローカルホストを指すものだけ書き換える。
# (リモート URL を指している場合はそのまま = 何もしない)
eval "$(python3 - "$HOST_IP" <<'PY'
import re, shlex, sys
ip = sys.argv[1]
vals = {}
with open(".env.local", encoding="utf-8") as fh:
    for line in fh:
        line = line.strip()
        for key in ("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_APP_URL"):
            if line.startswith(key + "="):
                vals[key] = line[len(key) + 1:].strip().strip("'\"")
for key, val in vals.items():
    new = re.sub(r"^(https?://)(127\.0\.0\.1|localhost)\b", r"\g<1>" + ip, val)
    if new != val:
        print(f"export {key}={shlex.quote(new)}")
        print(f"echo '  {key} -> {new}' >&2")
PY
)"

echo "dev サーバーを起動します。スマホからは http://${HOST_IP}:3000 で開けます" >&2
exec pnpm exec dotenvx run -f .env.local -- next dev -H 0.0.0.0 "$@"
