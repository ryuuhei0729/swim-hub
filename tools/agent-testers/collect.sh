#!/usr/bin/env bash
# Run on YOUR machine: downloads every encrypted artifact of a run and decrypts it.
# Usage: bash tools/agent-testers/collect.sh <run_id> [private_key.pem] [out_dir]
# 出力先の既定は tools/agent-testers/runs/<run_id> (gitignore 済み。公開リポジトリなので絶対にコミットしない)
# Adapted from pierridotite/mobile-agent-testers (MIT, see LICENSE.upstream)
# Default key: the one setup.sh created in ~/.mobile-agent-testers/
set -euo pipefail
RUN=$1
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
PRIV=${2:-$HOME/.mobile-agent-testers/${REPO//\//_}.pem}; HERE=$(cd "$(dirname "$0")" && pwd); OUT=${3:-$HERE/runs/$1}
mkdir -p "$OUT/enc"
gh run download "$RUN" -D "$OUT/enc" -p "results-*" -p "build-log-*"   # 暗号化済みのアプリ本体は落とさない
for key in "$OUT"/enc/*/*.key.bin; do
  name=$(basename "$key" .key.bin); dir=$(dirname "$key")
  pass=$(openssl pkeyutl -decrypt -inkey "$PRIV" -pkeyopt rsa_padding_mode:oaep -in "$key")
  mkdir -p "$OUT/$name"
  openssl enc -d -aes-256-cbc -pbkdf2 -in "$dir/$name.tgz.enc" -pass "pass:$pass" | tar xz -C "$OUT/$name"
  grep -l "hit your" "$OUT/$name"/results/agent-output.json 2>/dev/null && echo "WARNING: $name stopped on a usage limit"
done
python3 "$HERE/scripts/summarize.py" "$OUT" > "$OUT/SUMMARY.md" && echo "Summary: $OUT/SUMMARY.md"
