# データベース最適化メモ

作成日: 2026-01-23

## 自動削除候補のテーブル

蓄積する必要がないデータを定期的に削除してDBを節約する。

| テーブル | 削除条件 | 備考 |
|---------|---------|------|
| **entries** | 大会日から1ヶ月後 | エントリー情報は大会終了後は不要 |
| **team_attendance** | イベント日から1-2ヶ月後 | 出欠情報、分析用途以外不要 |
| **user_sessions** | `expires_at` が過ぎたもの | 期限切れセッションは即削除可 |
| **announcements** | `end_at` から1ヶ月後 | 古いお知らせは不要 |

## 削除しないテーブル

| テーブル | 理由 |
|---------|------|
| **records** | 自己ベスト・成長記録。長期保存必須 |
| **practices** | 練習履歴。振り返りに必要 |
| **practice_logs** | 練習メニュー詳細。分析用 |
| **practice_times** | 練習タイムの詳細記録。残す |
| **split_times** | ユーザー入力のスプリットタイム。残す |
| **competitions** | 大会履歴。記録の紐付けに必要 |
| **goals / milestones** | 目標管理。達成履歴として価値あり |
| **users / teams / team_memberships** | マスターデータ |

## split_times の冗長データ問題

### 現象

RecordLogFormでタイムを入力すると、自動で種目距離と同じスプリットタイムが追加される。

例: 50m自由形で35.00を入力 → 自動で「50m: 35.00」のsplit_timeが作成される

### 該当コード

`apps/web/components/forms/record-log/hooks/useRecordLogForm.ts` の `handleTimeChange` 関数（139-187行目）

```typescript
if (raceDistance && newTime > 0) {
  // 種目距離と同じスプリットタイムを自動追加
  updatedSplitTimes = [
    ...updatedSplitTimes,
    {
      distance: raceDistance,  // 例: 50m種目なら50
      splitTime: newTime,      // 入力したタイムと同じ
    },
  ]
}
```

### 対策オプション

1. **フロントで50m種目の場合はスプリット自動追加をスキップ**
   - 50mは1スプリットしかないので冗長
   - 100m以上では意味がある（ゴールタイム = 最終ラップ）

2. **DBで重複データを定期削除**
   - 条件: `records.time = split_times.split_time AND style.distance = split_times.distance`
   - pg_cronでスケジュール実行

3. **現状維持**
   - 100m以上では意味があるので、統一的な仕様として残す
   - ストレージ負荷は軽微

### 判断保留

どのオプションを採用するかは未決定。

---

## 実装予定（pg_cron）

Supabaseでpg_cronを使って自動削除を実装する場合の例：

```sql
-- 期限切れセッションの削除（毎日実行）
SELECT cron.schedule(
  'cleanup-expired-sessions',
  '0 3 * * *',  -- 毎日AM3時
  $$DELETE FROM user_sessions WHERE expires_at < NOW()$$
);

-- 古いエントリーの削除（毎週実行）
SELECT cron.schedule(
  'cleanup-old-entries',
  '0 4 * * 0',  -- 毎週日曜AM4時
  $$
  DELETE FROM entries
  WHERE competition_id IN (
    SELECT id FROM competitions
    WHERE date < NOW() - INTERVAL '1 month'
  )
  $$
);

-- 古い出欠データの削除（毎週実行）
SELECT cron.schedule(
  'cleanup-old-attendance',
  '0 4 * * 0',
  $$
  DELETE FROM team_attendance
  WHERE (practice_id IS NOT NULL AND practice_id IN (
    SELECT id FROM practices WHERE date < NOW() - INTERVAL '2 months'
  ))
  OR (competition_id IS NOT NULL AND competition_id IN (
    SELECT id FROM competitions WHERE date < NOW() - INTERVAL '2 months'
  ))
  $$
);

-- 古いお知らせの削除（毎週実行）
SELECT cron.schedule(
  'cleanup-old-announcements',
  '0 4 * * 0',
  $$
  DELETE FROM announcements
  WHERE end_at IS NOT NULL AND end_at < NOW() - INTERVAL '1 month'
  $$
);
```

## TODO

- [ ] 自動削除のpg_cronジョブを実装
- [ ] split_timesの冗長データ対策を決定
- [ ] 削除前にバックアップを取るか検討
