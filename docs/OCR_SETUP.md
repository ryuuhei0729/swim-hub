# OCR機能セットアップガイド

Cloud Vision APIを使用したOCR機能のセットアップ方法を説明します。

## 前提条件

- Google Cloud Platform (GCP) アカウント
- Cloud Vision APIが有効化されたGCPプロジェクト

## セットアップ手順

### 1. Google Cloudプロジェクトの設定

1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. プロジェクトを作成または選択
3. Cloud Vision APIを有効化
   - 「APIとサービス」→「ライブラリ」→「Cloud Vision API」を検索して有効化

### 2. サービスアカウントの作成

1. 「IAMと管理」→「サービスアカウント」に移動
2. 「サービスアカウントを作成」をクリック
3. サービスアカウント名を入力（例: `swim-hub-ocr`）
4. 「作成して続行」をクリック
5. ロールに「Cloud Vision API ユーザー」を追加
6. 「完了」をクリック

### 3. 認証情報の取得

#### 方法A: サービスアカウントキーファイルを使用（推奨）

1. 作成したサービスアカウントをクリック
2. 「キー」タブを選択
3. 「キーを追加」→「新しいキーを作成」をクリック
4. キーのタイプで「JSON」を選択
5. 「作成」をクリック（JSONファイルがダウンロードされます）
6. ダウンロードしたJSONファイルを安全な場所に保存

#### 方法B: 環境変数で直接指定

サービスアカウントキーのJSONファイルの内容を環境変数として設定します。

### 4. 環境変数の設定

プロジェクトルートの `.env.local` ファイルに以下のいずれかの方法で設定します。

#### 方法A: サービスアカウントキーファイルのパスを指定

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/service-account-key.json
GOOGLE_CLOUD_PROJECT_ID=your-project-id
```

#### 方法B: サービスアカウントキーのJSONを直接指定

```bash
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_KEY='{"type":"service_account","project_id":"your-project-id",...}'
```

**注意**: `GOOGLE_CLOUD_KEY` はJSON文字列全体をシングルクォートで囲んでください。

### 5. 依存関係のインストール

```bash
npm install
```

または

```bash
cd apps/web
npm install
```

## 使用方法

1. 練習記録追加フォームを開く
2. 「画像から練習記録を読み込む」セクションで画像を選択
3. 「OCRを実行」ボタンをクリック
4. OCR結果が自動的にフォームに入力されます
5. 必要に応じて結果を編集して保存

## 対応画像形式

- JPEG (.jpg, .jpeg)
- PNG (.png)
- ファイルサイズ: 5MB以下

## トラブルシューティング

### Cloud Vision APIのエラーが発生する場合

1. Cloud Vision APIが有効化されているか確認
2. サービスアカウントに適切な権限があるか確認
3. 環境変数が正しく設定されているか確認
4. サービスアカウントキーファイルのパスが正しいか確認

### OCR結果が正しく解析されない場合

- 画像の解像度が低い可能性があります。より高解像度の画像を試してください
- 手書きの文字が読みにくい場合、より鮮明な画像を使用してください
- OCR結果は自動的にフォームに入力されますが、必要に応じて手動で編集できます

## セキュリティに関する注意事項

- サービスアカウントキーファイルは絶対にGitリポジトリにコミットしないでください
- `.env.local` ファイルは `.gitignore` に含まれていることを確認してください
- 本番環境では環境変数を使用して認証情報を管理してください

## 参考リンク

- [Cloud Vision API ドキュメント](https://cloud.google.com/vision/docs)
- [サービスアカウントの作成](https://cloud.google.com/iam/docs/creating-managing-service-accounts)
- [認証の設定](https://cloud.google.com/docs/authentication/getting-started)

