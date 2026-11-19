#!/usr/bin/env bash
# swim-hub (apps/mobile, Expo + pnpm モノレポ) を Android エミュレーター用の APK にビルドする。
# 前提: リポジトリルートで pnpm install と swimhub-oauth のビルドが済んでいること。
# apps/mobile/.env.development を dotenvx で注入した状態で呼ぶこと (Metro がビルド時に EXPO_PUBLIC_* を埋め込む):
#   cd apps/mobile && pnpm exec dotenvx run --strict -f .env.development -- bash ../../tools/agent-testers/scripts/build/<platform>.sh
# 出力: tools/agent-testers/app.apk。ビルドログは results/build-android.log (後で暗号化)。
# Based on pierridotite/mobile-agent-testers scripts/build/android.sh (MIT, see LICENSE.upstream)
set -uo pipefail
ROOT=${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel)}
HERE="$ROOT/tools/agent-testers"
mkdir -p "$HERE/results"; LOG="$HERE/results/build-android.log"
q() { "$@" >>"$LOG" 2>&1; }
fail() { echo "::error::Android build failed: see the encrypted build log ($1)"; exit 1; }

# 本番の Supabase に向いたビルドでエージェントを走らせない
# 復号に失敗すると "encrypted:..." のまま入るので、URL の形まで確かめる
[[ "${EXPO_PUBLIC_SUPABASE_URL:-}" =~ ^https?:// ]] || { echo "::error::EXPO_PUBLIC_SUPABASE_URL is not a URL: check DOTENV_PRIVATE_KEY_DEVELOPMENT_MOBILE (apps/mobile/.env.keys)"; exit 1; }
[[ "${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}" != encrypted:* ]] && [ -n "${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}" ] || { echo "::error::EXPO_PUBLIC_SUPABASE_ANON_KEY could not be decrypted"; exit 1; }
[ "${EXPO_PUBLIC_ENVIRONMENT:-development}" != production ] || { echo "::error::Refusing to build against production"; exit 1; }
# CI のランナーから Supabase に届くか確かめる (ローカル / LAN / tailnet の URL だと、アプリがログインで
# Network request failed になるだけでエージェントの使用量が無駄になる)。公開ログなので URL は出さない。
HOST=$(sed -E 's#^https?://([^/:]+).*#\1#' <<<"$EXPO_PUBLIC_SUPABASE_URL")
case "$HOST" in *.supabase.co) KIND="Supabase cloud" ;; localhost|127.*|10.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[01].*|100.*|*.local|*.ts.net) KIND="local / private network" ;; *) KIND="other host" ;; esac
CODE=$(curl -s -o /dev/null -m 10 -w '%{http_code}' -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" "${EXPO_PUBLIC_SUPABASE_URL%/}/auth/v1/health" || true)
echo "Supabase URL: $KIND, /auth/v1/health from the runner: HTTP ${CODE:-none}"
[ "$CODE" = 200 ] || { echo "::error::Supabase ($KIND) is not reachable from GitHub Actions: apps/mobile/.env.development must point to a public development project"; exit 1; }
export EXPO_NO_DOTENV=1   # Expo CLI に .env.production などを読ませない

cd "$ROOT/apps/mobile" || exit 1
q env CI=1 pnpm exec expo prebuild --platform android --no-install --clean || fail prebuild
# Expo の release ビルドは debug keystore で署名されるので、エミュレーターにそのまま入る
(cd android && q ./gradlew assembleRelease -PreactNativeArchitectures=x86_64 --build-cache) || fail gradle
OUT=$(find android -path '*build/outputs/apk/release/*.apk' -not -name '*unaligned*' | head -1)
[ -n "$OUT" ] && [ -f "$OUT" ] || { echo "::error::No APK found after the build"; exit 1; }
cp "$OUT" "$HERE/app.apk"; echo "APK ready"
