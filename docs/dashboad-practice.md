# ダッシュボード経由で個人練習を登録するフロー

## 概要
- ダッシュボードのカレンダー上から個人練習（Practice）を登録するための一連の操作と、各モーダルで扱うテーブルを整理したメモ
- フロー途中で `practices` テーブルが先に保存され、その後 `practice_logs`・`practice_times`・`practice_tags` を追加登録する構成

## 操作フロー
1. **日付をクリック**
   - カレンダー上の任意の日をクリックすると、当日の詳細モーダル（DayDetail）を表示
2. **練習記録の追加を選択**
   - DayDetail モーダル内から「練習記録の追加」をクリックし、Practice 用の入力モーダルを開く
3. **Practice モーダルで練習予定を作成**
   - `practices` テーブルに対応する基本情報（日時・場所・メニュー等）を入力
   - 「練習予定を作成」をクリックすると `practices` テーブルへ保存され、保存完了後に Practice_Log モーダルへ自動遷移
4. **Practice_Log モーダルで練習記録を保存**
   - `practice_logs` テーブルの詳細（本数、距離、フィードバック等）を入力
   - タイム入力ボタンを押して `practice_times` モーダルを追加で開き、必要に応じてタイムを登録
   - タグ入力欄にて `practice_tags` の情報も併せて登録可能
   - 「練習記録を保存」をクリックすると、`practice_logs` と紐づく `practice_times`・`practice_tags` がまとめて保存される

## モーダル遷移
- DayDetail モーダル → 「練習記録の追加」をクリック
- Practice モーダル（`practices` テーブル） → 保存後、Practice_Log モーダルへ遷移
- Practice_Log モーダル（`practice_logs` テーブル）
  - タイム入力ボタン → Practice_Time サブモーダル（`practice_times` テーブル）
  - タグ入力 → Practice_Tag フォーム（`practice_tags` テーブル）

## データ保存タイミングと対象テーブル
- Practice モーダルの保存: `practices`
- Practice_Log モーダルの保存:
  - 本体: `practice_logs`
  - タイム（任意）：`practice_times`
  - タグ（任意）：`practice_tags`

## 備考
- Practice_Log モーダルでタイムやタグを入力しない場合でも、`practice_logs` の保存自体は可能
- 各モーダルともバリデーションはモーダル内で完結（未入力項目がある場合は保存不可）

