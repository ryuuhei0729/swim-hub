# チーム内フィードバック（大会記録へのフィードバック）仕様

確定日: 2026-11-26

## 概要

チーム管理者が、チームメンバーの大会記録（`records`）に対してフィードバック（以下 FB）を書ける機能。
選手本人は自分の記録に付いた FB を、ダッシュボード・記録一覧・チーム記録一覧のどこからでも読める。

無料機能（プレミアム判定なし）。Web とモバイルに同時リリースし、全ロケール（ja / en / de / ko / zh）に対応する。

## 対象

- `records.team_id IS NOT NULL` のチーム記録だけが対象。個人で登録した記録（`team_id IS NULL`）には書けない。
- リレーは個人のレグ（`records.is_relaying = true` の行）単位で付ける。`relay_records` には付けない。
- 練習記録は対象外。

## 権限

| 操作 | 誰ができるか |
|---|---|
| 作成 | 記録のチーム（`records.team_id`）の、承認済みかつ現役の管理者（`role='admin'`, `status='approved'`, `is_active IS TRUE`）。自分の記録には書けない |
| 閲覧 | 選手本人（記録の持ち主）と、同じチームの承認済みかつ現役の管理者 |
| 編集 | 書いた本人だけ。その時点でもそのチームの承認済みかつ現役の管理者であること |
| 削除 | 書いた本人だけ。条件は編集と同じ |
| 既読をつける | 選手本人だけ |

- 判定は SQL 関数 `can_give_record_feedback(team_id, user_id)` に集約する。将来、管理者以外にも開放するときはこの関数だけを直す。
- フィードバックを受けた選手は編集・削除できない。

## 件数の制約

- 1件の記録に、複数の FB が付く。
- 1人が1件の記録に書ける FB は1件まで（`UNIQUE (record_id, author_id)`）。
- 削除するとその枠が空き、同じ人がもう一度書ける。

## 中身

- 自由記述1欄。前後の空白を除いて 1〜1000 文字。
- 編集した FB には「編集済み」と表示する（`updated_at > created_at`）。

## 既読と未読

- 未読 = `read_at IS NULL`。
- 既読になるのは、選手本人が記録画面（後述の FB セクション）で FB を表示したときだけ。ポップアップで「閉じる」を押しても既読にはならない。
- FB の本文が編集されたら未読に戻す（`read_at = NULL`）。

## 表示

### 件数表示「FB n件」

閲覧権限のある FB の件数を、記録カードに表示する（0件のときは出さない）。

- Web: ダッシュボードの日付詳細モーダル、記録ページ（`/competition`）のカード、チーム記録一覧
- モバイル: 日付詳細モーダル、記録タブのカード、チーム記録一覧

### FB セクション

記録カードを開いた先の詳細画面に FB の一覧を出す。各 FB には書いた人の名前、本文、日時、「編集済み」表示を出す。

- 書いた人が退団していても、選手本人には名前を表示する（取得用の RPC が名前を返す）。
- 書いた人がアカウントを削除した場合（`author_id IS NULL`）は「退会したユーザー」と表示する。
- 選手本人が開いたときに、その記録の未読 FB を既読にする。

### 管理者の書き込み導線

- チーム記録一覧の各行に、FB の件数と「自分が書いたか」を表示する。
- まだ書いていない記録には「FB を書く」ボタン、書いた記録には自分の FB の編集・削除を出す。入力はモーダルで行う。

### 受信ポップアップ（ダッシュボード）

- 未読 FB があるとき、ダッシュボードが表示されるたびに確認して出す。
- 最初に「手紙が届く」アニメーション（約3秒）を流し、続けてポップアップを出す。
  - タップするとアニメーションを飛ばしてポップアップを出す。
  - OS の「視差効果を減らす」（reduce motion）が有効なら、アニメーションを出さずにポップアップだけ出す。
  - 実装は、Web は CSS / SVG、モバイルは `react-native-reanimated`。新しいライブラリは入れない。
- ポップアップには未読 FB を新しい順に並べる。各項目の内容は次のとおり。
  - 「〇〇さんからフィードバックが届きました」
  - 大会名・種目・タイム
  - 「記録画面へ」ボタン
- 本文はポップアップには出さない。
- 「閉じる」は全体で1つ。押しても既読にはしない。同じセッション中は、閉じたときに出ていた FB では再表示しない。
  - Web は `sessionStorage`、モバイルはアプリのプロセス内メモリで管理する。
  - キーは `feedback_id:updated_at`。編集された FB はもう一度出る。
- 「記録画面へ」を押すと、記録タブで該当のカードを押したときと同じ画面に遷移する。
  - Web: `/competition` で該当の記録の詳細モーダル（大会あり → `CompetitionDetailModal`、大会なし → `RecordDetailModal`）が開いた状態。
  - モバイル: 記録タブ（大会の表示）で、該当日の `DayDetailModal` が開いた状態。
  - 開いた FB は、記録画面で表示した時点で既読になる（上の「既読」と同じ）。
  - 一緒に出ていた他の FB は閉じた扱いにしない（既読にもしない）。開かなかった未読は、次にダッシュボードを開いたときにまた出る（Web・モバイル共通）。

## ライフサイクル

| イベント | FB の扱い |
|---|---|
| 記録を削除 | 一緒に削除（`record_id` が ON DELETE CASCADE） |
| チームを削除 | 一緒に削除（`team_id` が ON DELETE CASCADE。`delete_team_preserving_records` は記録だけを個人のデータとして残す） |
| 書いた人が退団・降格 | FB は残る。選手本人は引き続き読める。書いた人は編集・削除・閲覧できなくなる |
| 選手が退団 | FB は残る。選手本人は引き続き読める |
| 書いた人がアカウントを削除 | FB は残る。`author_id` が NULL になる |
| 選手がアカウントを削除 | 記録ごと削除 |

## データモデル

テーブル `public.record_feedbacks`:

| 列 | 型 | 説明 |
|---|---|---|
| `id` | uuid PK | |
| `record_id` | uuid NOT NULL → `records(id)` ON DELETE CASCADE | |
| `team_id` | uuid NOT NULL → `teams(id)` ON DELETE CASCADE | INSERT 時にトリガで `records.team_id` を入れる |
| `recipient_id` | uuid NOT NULL → `users(id)` ON DELETE CASCADE | INSERT 時にトリガで `records.user_id` を入れる |
| `author_id` | uuid → `users(id)` ON DELETE SET NULL | 既定値 `auth.uid()` |
| `content` | text NOT NULL | 前後の空白を除いて 1〜1000 文字 |
| `read_at` | timestamptz | NULL = 未読 |
| `created_at` / `updated_at` | timestamptz NOT NULL | |

- クライアントが書き込めるのは、INSERT では `record_id` / `author_id` / `content`、UPDATE では `content` だけ（列単位の GRANT で制限）。
- `read_at` を更新できるのは RPC `mark_record_feedbacks_read` だけ。
- RPC:
  - `get_record_feedbacks(p_record_id)`: 書いた人の名前付きで一覧を返す。
  - `get_unread_record_feedbacks()`: ポップアップ用。大会名・種目・タイムを付けて返す。
  - `mark_record_feedbacks_read(p_record_id)`: 本人宛ての未読 FB を既読にする。
