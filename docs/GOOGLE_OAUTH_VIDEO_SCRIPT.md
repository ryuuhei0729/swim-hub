# Google OAuth審査用デモ動画 撮影台本

## 🎬 重要な注意事項

**Googleが却下した理由**: OAuth同意画面のワークフローが含まれていなかった

**必須事項**: OAuth認証フロー全体（同意画面を含む）を撮影すること

---

## 📝 撮影準備

### 1. 環境準備
- [ ] ブラウザのシークレットモード（プライベートウィンドウ）を開く
- [ ] 画面録画ソフトを起動（Loom / QuickTime / OBS Studio）
- [ ] アプリURL: https://swimhub.app を開く

### 2. データ準備
- [ ] テスト用Googleアカウントでログイン可能な状態
- [ ] アプリのテストアカウント情報を用意

---

## 🎥 撮影シナリオ（所要時間: 3分）

### Scene 1: ログイン（20秒）
```
[画面]: SwimHubトップページ
[操作]: 
1. 「ログイン」ボタンをクリック
2. Googleでログイン（または既存アカウントでログイン）
3. ダッシュボードが表示される

[ナレーション（英語）]:
"First, I'll sign in to SwimHub, a swim training management application."
```

### Scene 2: ★Google Calendar連携開始★（60秒）★最重要★
```
[画面]: マイページ
[操作]:
1. 「マイページ」をクリック
2. 「Googleカレンダー連携」セクションまでスクロール
3. 「Googleカレンダーと連携」ボタンをクリック

   ★★★ 重要！ここで OAuth同意画面が表示される ★★★

4. Google OAuth同意画面を表示
   - アプリ名「SwimHub」を表示
   - 要求されるスコープを表示:
     ✓ Google カレンダーを使用してアクセスできるすべてのカレンダーの参照、ダウンロード
     ✓ すべてのカレンダーの予定の表示と編集
   
   ★この画面を5秒以上表示すること★

5. 下にスクロールして「許可」ボタンを表示
6. 「許可」ボタンをクリック
7. アプリにリダイレクトされる
8. 「連携中」のステータスが表示される

[ナレーション（英語）]:
"Now I'll connect SwimHub with Google Calendar.
I click the 'Connect with Google Calendar' button.
Google shows the OAuth consent screen, requesting permission to:
- Read and download all calendars
- View and edit all calendar events

I'll click 'Allow' to grant these permissions.
The integration is now active."
```

### Scene 3: 練習記録を作成（40秒）
```
[画面]: ダッシュボード
[操作]:
1. 「練習記録を追加」ボタンをクリック
2. フォームに入力:
   - タイトル: 「Morning Practice」
   - 場所: 「Tokyo Aquatics Center」
   - 日付: 今日の日付を選択
   - メモ: 「100m freestyle × 10 sets」
3. 「保存」ボタンをクリック
4. 「Googleカレンダーに同期しました」のメッセージを表示

[ナレーション（英語）]:
"I'll create a practice record.
I enter the title, location, date, and training details.
When I save it, SwimHub automatically syncs it to Google Calendar."
```

### Scene 4: Googleカレンダーで確認（30秒）
```
[画面]: Googleカレンダー
[操作]:
1. 新しいタブでGoogleカレンダーを開く
2. 今日の日付にイベント「Morning Practice」が表示されていることを確認
3. イベントをクリックして詳細を表示:
   - タイトル: 「Morning Practice」
   - 場所: 「Tokyo Aquatics Center」
   - 説明: 「100m freestyle × 10 sets」

[ナレーション（英語）]:
"Let's check Google Calendar.
The practice record has been automatically synced.
The event includes the title, location, and training details."
```

### Scene 5: 大会記録の同期（30秒）
```
[画面]: SwimHubダッシュボード
[操作]:
1. 「大会記録を追加」ボタンをクリック
2. フォームに入力:
   - タイトル: 「Tokyo Swimming Championship」
   - 場所: 「Tokyo Dome」
   - 日付: 来週の土曜日
3. 「保存」ボタンをクリック
4. Googleカレンダーで確認（イベントが追加されている）

[ナレーション（英語）]:
"Competition records are also synced automatically.
I create a competition event, and it appears in Google Calendar."
```

### Scene 6: 設定画面の説明（20秒）
```
[画面]: マイページ - Googleカレンダー連携設定
[操作]:
1. 設定画面を表示:
   - ☑ 練習記録を自動同期
   - ☑ 大会記録を自動同期
2. 「連携を解除」ボタンを表示（クリックはしない）

[ナレーション（英語）]:
"Users can control which records to sync.
They can also disconnect the integration at any time.
Thank you for watching."
```

---

## ✅ 撮影チェックリスト

### 必須項目（Googleの要求事項）
- [ ] OAuth同意画面が明確に表示されている
- [ ] 要求されるスコープが読み取れる
- [ ] ユーザーが「許可」をクリックする様子が含まれている
- [ ] アプリにリダイレクトされる様子が含まれている

### 品質チェック
- [ ] 動画の長さ: 2〜4分
- [ ] 画面が鮮明（フルHD 1080p推奨）
- [ ] 音声が明瞭（または字幕を追加）
- [ ] 操作がゆっくりで分かりやすい
- [ ] OAuth同意画面を5秒以上表示

### YouTube設定
- [ ] タイトル: "SwimHub - Google Calendar OAuth Integration Demo"
- [ ] 公開設定: **限定公開（Unlisted）**
- [ ] 説明文: スコープの使用方法（前回提供したテキスト）

---

## 📧 Googleへの返信

動画をアップロード後、以下の内容でGoogleに返信してください：

```
Subject: Re: API OAuth Dev Verification

Dear Google OAuth Review Team,

Thank you for your feedback. I have uploaded a new demo video that includes the complete OAuth consent screen workflow.

Demo Video URL: [YouTubeのURL]

The video demonstrates:
1. User initiates Google Calendar integration from the app
2. Google OAuth consent screen is displayed showing the requested scopes:
   - .../auth/calendar.readonly
   - .../auth/calendar.events
3. User clicks "Allow" to grant permissions
4. App redirects back and shows successful integration
5. App creates practice/competition records that automatically sync to Google Calendar

Please let me know if you need any additional information.

Best regards,
[Your Name]
```

---

## 🎯 よくある失敗例（避けること）

❌ **失敗例1**: すでにログイン済みの状態から撮影
→ OAuth同意画面が表示されない

❌ **失敗例2**: 同意画面をスキップして撮影
→ Googleが最も見たい部分が含まれない

❌ **失敗例3**: 同意画面が一瞬しか映らない
→ スコープの内容が読み取れない

✅ **成功のポイント**: 
- シークレットモードで撮影
- 同意画面を5秒以上表示
- ゆっくり丁寧に操作
