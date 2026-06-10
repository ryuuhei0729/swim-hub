#!/usr/bin/env bash
#
# シミュレータ用 .app をビルドする（capture.sh の APP_PATH に渡す）。
# Release 構成・iphonesimulator SDK でビルド。1つの .app を iPhone/iPad 両シミュレータで使い回せる。
#
# 注意: EXPO_PUBLIC_SUPABASE_URL/ANON_KEY 等はビルド時にインライン展開される。
#       スクショ用デモ Supabase を指す .env を使うこと（既定では .env.local を使用）。
#
# 使い方:
#   ./scripts/screenshots/build-sim.sh
#   → 末尾に出力された .app パスを APP_PATH に渡す
#
set -euo pipefail

MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$MOBILE_DIR"

ENV_FILE="${ENV_FILE:-.env.local}"
SCHEME="${SCHEME:-SwimHub}"
WORKSPACE="ios/${SCHEME}.xcworkspace"
DERIVED="ios/build-sim"

# ネイティブプロジェクトが未生成なら prebuild
if [ ! -d "$WORKSPACE" ]; then
  echo "==> expo prebuild (ios)"
  pnpm exec dotenvx run -f "$ENV_FILE" -- npx expo prebuild -p ios
fi

echo "==> xcodebuild ($SCHEME, Release, iphonesimulator)"
pnpm exec dotenvx run -f "$ENV_FILE" -- xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -sdk iphonesimulator \
  -derivedDataPath "$DERIVED" \
  -quiet \
  build

APP_PATH="$(/usr/bin/find "$DERIVED/Build/Products" -maxdepth 2 -name "*.app" -type d | head -1)"
echo ""
echo "✅ APP_PATH=$MOBILE_DIR/$APP_PATH"
