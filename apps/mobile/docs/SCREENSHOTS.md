# App Store スクショ自動化

iOS シミュレータ上で **Maestro** がアプリを操作してスクショを撮り、App Store Connect の
ローカライズ用ディレクトリ (`fastlane/screenshots/en-US/`) に保存するパイプライン。
（任意で fastlane frameit による枠+テキスト合成 / fastlane deliver による自動アップロードも可）

対象アプリ: **SwimHub** (`app.swimhub` / App Store ID `6756808731`)

---

## 🎯 今回のスコープ（英語ローカライズ用・4画面・生スクショ）

- **言語**: EN のみ（`capture.sh` の `LOCALES` は en のみ。JA を足すなら1行追加）
- **画面**: Dashboard / Practices / Competitions(=レース記録) / My Page の **4枚**
- **出力**: `fastlane/screenshots/en-US/` に生 PNG（枠加工なし → ASC にそのまま貼れる）
- **ASC 反映**: 手動（スクショをドラッグ＆ドロップ＋英語概要を貼り付け）。英語メタデータの
  ドラフトは `fastlane/metadata/en-US/`（name / subtitle / keywords / promotional_text / description）

実行手順は §1〜§3 のみ（§4 frameit・§5 deliver は今回は任意）。

```
build-sim.sh        seed-demo.sh              capture.sh                fastlane frame      fastlane upload_screenshots
 .app を生成   →   デモ垢+データ投入   →   EN/JA × iPhone/iPad 撮影  →  枠+テキスト合成  →  ASC へアップロード
```

## 撮影対象（4画面）

| # | 画面 | testID |
|---|------|--------|
| 01 | Dashboard（カレンダー） | `tab-dashboard` |
| 02 | Practices（練習一覧） | `tab-practices` |
| 03 | Competitions（大会＝レース記録） | `tab-competitions` |
| 04 | MyPage（プロフィール/ベストタイム） | `tab-mypage` |

サイズ: iPhone 17 Pro Max (6.9") / iPad Pro 13"（App Store 必須2サイズ。iPhone のみで良ければ capture.sh の DEVICES から iPad 行を削除）

---

## 0. 依存のインストール（初回のみ）

```bash
# Maestro
curl -Ls "https://get.maestro.mobile.dev" | bash      # ~/.maestro/bin を PATH に追加
# frameit が使う ImageMagick
brew install imagemagick
# fastlane はインストール済み (brew)。frameit のデバイス枠を取得:
cd swim-hub/apps/mobile && fastlane frameit download_frames
```

> jq / psql / java(シミュレータ操作) / Xcode は導入済み前提。

---

## 1. デモアカウント + シードデータ（要 Supabase 秘密情報）

`supabase/test-data-2025.sql`（2025年通年の練習・大会データ）を **デモ/ステージング** プロジェクトに投入し、
ログイン可能な auth ユーザーを作る。**本番には実行しないこと。**

```bash
cd swim-hub/apps/mobile
export DEMO_SUPABASE_URL="https://<demo-project>.supabase.co"
export DEMO_SERVICE_ROLE_KEY="<service_role key>"
export DEMO_DB_URL="postgresql://postgres:<pw>@db.<demo-project>.supabase.co:5432/postgres"
export APP_EMAIL="demo@swimhub.app"
export APP_PASSWORD="<任意のパスワード>"
./scripts/screenshots/seed-demo.sh
```

スクリプトは: auth ユーザー作成(email確認済) → seed SQL のユーザーIDを差し替えて投入 →
`users.onboarding_completed=true` を設定（オンボーディングを飛ばしてタブ画面に直行させるため）。

---

## 2. シミュレータ用 .app をビルド

`.env.local` が **デモ Supabase** を指している状態でビルドする（撮影に映るデータがデモになる）。

```bash
cd swim-hub/apps/mobile
./scripts/screenshots/build-sim.sh
# → 末尾に表示される APP_PATH を控える
```

---

## 3. 撮影（EN/JA × iPhone/iPad を総当たり）

言語はシミュレータ設定を変えずに、Maestro の launch arguments
(`-AppleLanguages` / `-AppleLocale`) で切り替える（expo-localization が尊重する）。

```bash
cd swim-hub/apps/mobile
APP_PATH="/abs/path/SwimHub.app" \
APP_EMAIL="demo@swimhub.app" \
APP_PASSWORD="<同上>" \
./scripts/screenshots/capture.sh
# → fastlane/screenshots/en-US/ と /ja/ に生スクショ
```

---

## 4. 枠＋テキスト合成（frameit）

```bash
cd swim-hub/apps/mobile
fastlane frame      # *_framed.png を生成
```

- 訴求コピーは `fastlane/screenshots/{en-US,ja}/title.strings`・`keyword.strings` で編集（下書き済み）。
- 枠スタイル・余白・色は `fastlane/screenshots/Framefile.json`。
- ブランド背景を使うなら `Framefile.json` の `default.background` に画像パスを指定。未指定なら白背景。

---

## 5. App Store Connect へアップロード（deliver）

認証は `swim-hub/AuthKey_QKK8K4ST76.p8`（API キー, KeyID=`QKK8K4ST76`）。
**Issuer ID** のみ未設定 → App Store Connect > Users and Access > Integrations > App Store Connect API で確認し env に渡す。

```bash
cd swim-hub/apps/mobile
export ASC_ISSUER_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
fastlane upload_screenshots
# frame と upload を一括: fastlane ship_screenshots
```

`deliver` は **スクショのみ** 更新（バイナリ・メタデータ・バージョンには触れない / 審査提出もしない）。
アップロード後、App Store Connect でローカライズ言語に **日本語** が追加されているか確認し、必要なら
説明文・キーワード等のメタデータを別途入力する。

---

## トラブルシュート

- **ログインで止まる**: デモユーザーの `onboarding_completed` が false だとオンボーディング画面で停止する。手順1で true にしているか確認。
- **JA に切り替わらない**: 端末言語が反映されない場合、シミュレータを一度 erase してから再実行、または `Settings > General > Language` を手動で日本語にして撮り直す。
- **frameit のサイズ拒否**: App Store は 6.9"/13" の正確な解像度を要求。フレーム合成後の解像度が要件に合わない場合は `Framefile.json` の `padding` を調整。
- **deliver がサイズ違いと言う**: 1ロケールフォルダに iPhone と iPad が混在していてOK（deliver は画像解像度でサイズを判定）。

---

## 他アプリ（swimhub-timer / swimhub-scanner）への展開

3アプリは独立 git リポジトリのため、この `apps/mobile/{.maestro,fastlane,scripts/screenshots,docs/SCREENSHOTS.md}`
一式を各リポジトリの `apps/mobile/` に**コピーして、下記のアプリ固有値だけ差し替える**。汎用ロジック
（capture.sh / build-sim.sh / fastlane frame・deliver レーン）はそのまま使える。

| 差し替える箇所 | swim-hub | 各アプリで変更 |
|---|---|---|
| `capture.sh` の `APP_ID` | `app.swimhub` | 各 app.config の bundleIdentifier |
| `Fastfile`/`Deliverfile` の `app_identifier` | `app.swimhub` | 同上 |
| ASC App ID（手動アップロード/deliver） | `6756808731` | 各 eas.json submit の `ascAppId` |
| `Fastfile` の ASC キー (`ASC_KEY_PATH`/`ASC_KEY_ID`) | `QKK8K4ST76.p8` | 各リポジトリの API キー |
| `.maestro/flows/*` と testID | 4タブ | **各アプリの画面・タブ・testID に作り直す**（timer はタブ無し・ゲストモード有、scanner も別構成） |
| `.maestro/subflows/login.yaml` | email ログイン必須 | timer は**ゲストモードでログイン不要**等、認証導線が違う |
| `seed-demo.sh` / シードデータ | `supabase/test-data-2025.sql` | 各アプリの Supabase・データモデル |
| `fastlane/metadata/en-US/*` | SwimHub 用文言 | 各アプリの訴求文言 |

> 注意: timer は **ゲストモード有り（ログイン不要）** なので、login subflow は不要かタップ1回で済む。
> 各アプリの画面構成・testID 付与は個別作業（タブ名・bundle id が違うため flows は使い回せない）。
> 共有しているのは「撮影→保存→（任意で）枠付け→アップロード」の**手順とランナー**まで。
