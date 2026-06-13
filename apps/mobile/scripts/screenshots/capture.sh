#!/usr/bin/env bash
#
# App Store スクショ自動撮影オーケストレーション
# locale (en/ja) × device (iPhone 6.9" / iPad 13") を総当たりで Maestro 実行する。
#
# 前提:
#   - maestro CLI がインストール済み (https://maestro.mobile.dev)
#   - シミュレータ用 .app がビルド済み (scripts/screenshots/build-sim.sh で生成)
#   - デモアカウントが seed 済み (scripts/screenshots/seed-demo.sh 参照)
#
# 必須 env:
#   APP_PATH       : シミュレータ用 .app への絶対パス
#   APP_EMAIL      : デモアカウントのメール
#   APP_PASSWORD   : デモアカウントのパスワード
#
# 使い方:
#   APP_PATH=/abs/SwimHub.app APP_EMAIL=demo@example.com APP_PASSWORD=... \
#     ./scripts/screenshots/capture.sh
#
set -euo pipefail

APP_ID="app.swimhub"
MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MAESTRO_FLOWS="$MOBILE_DIR/.maestro/flows"
OUT_ROOT="$MOBILE_DIR/fastlane/screenshots"

: "${APP_PATH:?APP_PATH (シミュレータ用 .app の絶対パス) を指定してください}"
# APP_EMAIL/APP_PASSWORD は任意。
#  - 指定あり: 未ログイン時に Maestro が email/password で自動ログイン（email+password 認証の垢のみ）
#  - 指定なし: 事前に手動ログイン（Google/Apple 等でもOK）した状態で実行する。login subflow は
#             既にログイン済みなら welcome 画面をスキップしてそのまま撮影に進む。
APP_EMAIL="${APP_EMAIL:-}"
APP_PASSWORD="${APP_PASSWORD:-}"

command -v maestro >/dev/null 2>&1 || {
  echo "ERROR: maestro が見つかりません。 curl -Ls 'https://get.maestro.mobile.dev' | bash" >&2
  exit 1
}
[ -d "$APP_PATH" ] || { echo "ERROR: APP_PATH が見つかりません: $APP_PATH" >&2; exit 1; }

# device 表示名 | App Store フォルダ用 device タグ
DEVICES=(
  "iPhone 17 Pro Max|iphone69"
  "iPad Pro 13-inch (M5)|ipad13"
)
# maestro locale | App Store ロケールフォルダ | region
# 今回は英語ローカライズ用に EN のみ。JA を追加するなら下に "ja|ja|JP" を足す。
LOCALES=(
  "en|en-US|US"
)

udid_for() {
  # 利用可能なシミュレータから表示名で UDID を取得
  xcrun simctl list devices available \
    | grep -F "$1 (" | head -1 \
    | grep -oE '[0-9A-F-]{36}'
}

for loc in "${LOCALES[@]}"; do
  IFS='|' read -r LOCALE ASC_LOCALE REGION <<< "$loc"
  OUTPUT_DIR="$OUT_ROOT/$ASC_LOCALE"
  mkdir -p "$OUTPUT_DIR"

  for dev in "${DEVICES[@]}"; do
    IFS='|' read -r DEVICE_NAME DEVICE_TAG <<< "$dev"
    UDID="$(udid_for "$DEVICE_NAME")"
    if [ -z "$UDID" ]; then
      echo "WARN: シミュレータが見つかりません: $DEVICE_NAME — スキップ" >&2
      continue
    fi

    echo "==> [$ASC_LOCALE / $DEVICE_NAME] boot $UDID"
    xcrun simctl boot "$UDID" 2>/dev/null || true
    xcrun simctl bootstatus "$UDID" -b >/dev/null 2>&1 || true

    echo "==> install $APP_PATH"
    xcrun simctl install "$UDID" "$APP_PATH"

    echo "==> maestro test ($ASC_LOCALE / $DEVICE_TAG)"
    MAESTRO_DRIVER_STARTUP_TIMEOUT=120000 maestro --device "$UDID" test "$MAESTRO_FLOWS" \
      -e APP_ID="$APP_ID" \
      -e LOCALE="$LOCALE" \
      -e REGION="$REGION" \
      -e APP_EMAIL="$APP_EMAIL" \
      -e APP_PASSWORD="$APP_PASSWORD" \
      -e OUTPUT_DIR="$OUTPUT_DIR" \
      -e DEVICE_TAG="$DEVICE_TAG"

    xcrun simctl shutdown "$UDID" 2>/dev/null || true
  done
done

echo ""
echo "✅ 生スクショ出力先: $OUT_ROOT/{en-US,ja}/"
echo "   次: cd $MOBILE_DIR && fastlane frame                       # 枠+テキスト合成"
echo "       cd $MOBILE_DIR && ASC_ISSUER_ID=... fastlane upload_screenshots"
