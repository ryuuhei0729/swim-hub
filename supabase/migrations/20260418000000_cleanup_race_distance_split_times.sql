-- チーム大会の記録保存パス (apps/web/.../teams/.../records/_client/RecordClient.tsx) で
-- 「ゴール距離 = split_times.distance」の行が誤って挿入されていた分を削除する。
-- 個人記録の保存パス (useRecordLogForm.ts) では元から除外されていたが、
-- チーム側に同じガードが移植されていなかったため冗長行が残存していた。
-- records.time が同等の情報を持つため、これらの split_times 行は意味を持たない。

DELETE FROM split_times st
USING records r, styles s
WHERE st.record_id = r.id
  AND r.style_id = s.id
  AND st.distance = s.distance;
