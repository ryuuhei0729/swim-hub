#!/usr/bin/env bash
# swim-hub (apps/mobile, Expo + pnpm モノレポ) を iOS シミュレーター用の .app (arm64, 署名なし) にビルドする。
# 前提: リポジトリルートで pnpm install と swimhub-oauth のビルドが済んでいること。
# apps/mobile/.env.development を dotenvx で注入した状態で呼ぶこと (Metro がビルド時に EXPO_PUBLIC_* を埋め込む):
#   cd apps/mobile && pnpm exec dotenvx run -f .env.development -- bash ../../tools/agent-testers/scripts/build/<platform>.sh
# 出力: tools/agent-testers/app-ios.tgz。ビルドログは results/build-ios.log (後で暗号化)。
# Based on pierridotite/mobile-agent-testers scripts/build/ios.sh (MIT, see LICENSE.upstream)
set -uo pipefail
ROOT=${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel)}
HERE="$ROOT/tools/agent-testers"
mkdir -p "$HERE/results"; LOG="$HERE/results/build-ios.log"
DD="${RUNNER_TEMP:-/tmp}/dd"
q() { "$@" >>"$LOG" 2>&1; }
fail() { echo "::error::iOS build failed: see the encrypted build log ($1)"; exit 1; }

# 本番の Supabase に向いたビルドでエージェントを走らせない
[ -n "${EXPO_PUBLIC_SUPABASE_URL:-}" ] || { echo "::error::EXPO_PUBLIC_SUPABASE_URL is empty: run through dotenvx (.env.development)"; exit 1; }
[ "${EXPO_PUBLIC_ENVIRONMENT:-development}" != production ] || { echo "::error::Refusing to build against production"; exit 1; }
export EXPO_NO_DOTENV=1   # Expo CLI に .env.production などを読ませない

cd "$ROOT/apps/mobile" || exit 1
q env CI=1 pnpm exec expo prebuild --platform ios --no-install --clean || fail prebuild
(cd ios && q pod install) || fail pods
WS=$(find ios -maxdepth 1 -name '*.xcworkspace' | head -1)
[ -n "$WS" ] || fail workspace
SCHEME=${IOS_SCHEME:-$(basename "$WS" .xcworkspace)}
echo "Workspace: $WS, scheme: $SCHEME"
# arm64 のみ (GitHub の macOS ランナーは Apple Silicon)
q xcodebuild -workspace "$WS" -scheme "$SCHEME" -configuration Release -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath "$DD" \
  EXCLUDED_ARCHS=x86_64 ONLY_ACTIVE_ARCH=YES CODE_SIGNING_ALLOWED=NO build || fail xcodebuild
OUT=$(find "$DD/Build/Products" -maxdepth 2 -path '*iphonesimulator/*.app' -not -name '*Tests*' | head -1)
[ -n "$OUT" ] && [ -d "$OUT" ] || { echo "::error::No Simulator .app found after the build"; exit 1; }
tar czf "$HERE/app-ios.tgz" -C "$(dirname "$OUT")" "$(basename "$OUT")"; echo "Simulator app ready"
