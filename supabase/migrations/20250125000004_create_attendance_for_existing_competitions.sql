-- =============================================================================
-- 既存のチーム大会に対して出欠レコードを生成
-- =============================================================================

-- 既存のチーム大会で出欠レコードがないものに対して自動生成
INSERT INTO team_attendance (competition_id, user_id, status)
SELECT c.id, tm.user_id, NULL
FROM competitions c
CROSS JOIN team_memberships tm
WHERE c.team_id IS NOT NULL
  AND tm.team_id = c.team_id
  AND tm.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM team_attendance ta
    WHERE ta.competition_id = c.id
    AND ta.user_id = tm.user_id
  );

-- 既存のチーム練習で出欠レコードがないものに対して自動生成（念のため）
INSERT INTO team_attendance (practice_id, user_id, status)
SELECT p.id, tm.user_id, NULL
FROM practices p
CROSS JOIN team_memberships tm
WHERE p.team_id IS NOT NULL
  AND tm.team_id = p.team_id
  AND tm.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM team_attendance ta
    WHERE ta.practice_id = p.id
    AND ta.user_id = tm.user_id
  );

