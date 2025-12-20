# Reactバージョン統一タスク！

## 概要
Expo SDKがReact 19.2.1以上をサポートした際に、モノレポ全体でReactバージョンを統一するためのタスクリストです。

## 前提条件
- Expo SDKがReact 19.2.1以上をサポートしていることを確認
- 現在のExpo SDKバージョン: `~54.0.27`
- 現在のMobile Reactバージョン: `19.1.0`
- 現在のWeb Reactバージョン: `19.2.1`

## タスクリスト

### 1. 依存関係の更新

- [ ] `apps/mobile/package.json`のReactバージョンを更新
  ```json
  "react": "19.2.1",
  "react-test-renderer": "19.2.1"
  ```

- [ ] `apps/shared/package.json`の`peerDependencies`を更新
  ```json
  "peerDependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  }
  ```

- [ ] ルート`package.json`の依存関係を確認（必要に応じて更新）

### 2. 依存関係の再インストール

- [ ] `node_modules`と`package-lock.json`を削除
  ```bash
  rm -rf node_modules apps/*/node_modules package-lock.json apps/*/package-lock.json
  ```

- [ ] 依存関係を再インストール
  ```bash
  npm install
  ```

### 3. Metro Configの確認

- [ ] `apps/mobile/metro.config.js`が正しく動作しているか確認
  - Reactの解決が正しく行われているか
  - エラーが発生していないか

### 4. ビルドとテスト

- [ ] Mobileアプリのビルドが成功するか確認
  ```bash
  cd apps/mobile
  npm run ios
  # または
  npm run android
  ```

- [ ] Webアプリのビルドが成功するか確認
  ```bash
  cd apps/web
  npm run build
  ```

- [ ] 両方のアプリで動作確認
  - ログイン機能
  - データ取得・表示
  - フォーム送信
  - その他主要機能

### 5. Development Buildの再ビルド

- [ ] iOS Development Buildを再ビルド
  ```bash
  cd apps/mobile
  eas build --profile development --platform ios
  ```

- [ ] Android Development Buildを再ビルド（必要に応じて）
  ```bash
  cd apps/mobile
  eas build --profile development --platform android
  ```

### 6. クリーンアップ（オプション）

- [ ] `.npmrc`の`public-hoist-pattern`設定を確認
  - Reactバージョンが統一されたら、この設定は不要になる可能性がある
  - ただし、他の依存関係との競合がある場合は維持

- [ ] `apps/mobile/metro.config.js`の`resolveRequest`設定を確認
  - Reactバージョンが統一されたら、この設定は不要になる可能性がある
  - ただし、動作に問題がなければ維持しても問題なし

### 7. ドキュメント更新

- [ ] `apps/mobile/README.md`のReactバージョン情報を更新
- [ ] プロジェクトのドキュメントにReactバージョン統一の記録を追加

## 注意事項

- **必ずExpo SDKの公式ドキュメントを確認**してから作業を開始してください
- バージョン更新後は、必ず全機能の動作確認を行ってください
- 問題が発生した場合は、すぐにロールバックできるように、変更前の状態をコミットしておいてください

## 参考リンク

- [Expo SDK リリースノート](https://docs.expo.dev/versions/latest/)
- [React 19.2.1 リリースノート](https://github.com/facebook/react/releases)
- [Metro Bundler ドキュメント](https://metrobundler.dev/docs/configuration)

## 完了チェックリスト

すべてのタスクが完了したら、以下を確認：

- [ ] Mobileアプリが正常に動作している
- [ ] Webアプリが正常に動作している
- [ ] ビルドエラーがない
- [ ] テストが全て通る
- [ ] ドキュメントが更新されている
