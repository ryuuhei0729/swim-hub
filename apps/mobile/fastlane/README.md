fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## iOS

### ios upload_metadata

```sh
[bundle exec] fastlane ios upload_metadata
```

新ロケールのメタデータ (概要/キーワード等) を App Store Connect にアップロード

### ios upload_release_notes

```sh
[bundle exec] fastlane ios upload_release_notes
```

編集中バージョンの「このバージョンの新機能」だけを更新する (他の項目・ロケールの追加はしない)

metadata/<locale>/release_notes.txt を読む。無ければ同じ言語 (en-GB → en-*) のファイルを使う

options: apply:true で実際に書き込む (既定は確認のみ)

### ios upload_search_metadata

```sh
[bundle exec] fastlane ios upload_search_metadata
```

検索に効く項目 (名前・サブタイトル・キーワード) だけを更新する。概要などには触れない

metadata/<locale>/{name,subtitle,keywords}.txt を読む。無ければ同じ言語 (en-AU → en-*) のファイルを使う

ASC に無いロケールのうち metadata/<locale>/ があるもの (en-US) は作る。概要・宣伝文・新機能も入れ、スクショは copy_screenshots_from (既定 en-GB) から複製する

options: apply:true で実際に書き込む (既定は確認のみ)

### ios frame

```sh
[bundle exec] fastlane ios frame
```

Maestro が撮った生スクショにデバイス枠+訴求テキストを合成する (frameit) ※現在は未使用

### ios upload_screenshots

```sh
[bundle exec] fastlane ios upload_screenshots
```

スクショ (素のまま) を App Store Connect にアップロード

options: languages (default: 新ロケールのみ)

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
