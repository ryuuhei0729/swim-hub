-- ============================================
-- practice_logs / practice_times: チーム管理者による代理 INSERT / DELETE ポリシーを追加
-- ============================================
--
-- 背景:
--   今スプリントで「チーム管理者も他メンバーの練習を編集できる」仕様が実装され、
--   practices の UPDATE (既存: user_id = auth.uid() OR is_team_admin(team_id, auth.uid()))、
--   practice_logs の UPDATE (20260620000000 で追加、20260803000002 で本人枝を追加して統合)
--   はいずれも代理更新済みだが、practice_logs / practice_times の INSERT と DELETE は
--   オーナー限定のまま (initial_schema.sql:1741 practice_logs DELETE, :1747 practice_times
--   DELETE, :1769 practice_logs INSERT, :1775 practice_times INSERT) だった。
--
--   このため、管理者が他メンバーの練習でメニューを追加/削除したり、既存タイムを
--   持つメニューを編集 (apps/shared/api/practices.ts の replacePracticeTimes は
--   DELETE + INSERT で実装されており、削除だけでなく通常編集でも発火する) したり
--   すると RLS が 0 行で拒否していた。従来は無言で捨てられていたが、
--   delete 系に「0 行なら throw」ガードが入ったことで、今は保存がエラーになる。
--
-- 方針:
--   20260620000000 (practice_logs UPDATE の代理ポリシー) と同型で統合する。
--   - practice_logs は team_id を直接持たないため、所属 practice 経由で team を辿る:
--       practice_logs.practice_id -> practices.team_id
--   - 本人 (従来の owner: practices.user_id = caller) は従来どおり許可。
--   - 代理: practice.team_id IS NOT NULL かつ caller が当該 team の active admin
--     (is_active=true AND role='admin') かつ practice_logs.user_id (対象行の所有者)
--     がその team の active member であること。
--   - team_id NULL (個人練習) は本人のみ (代理ブロックは team_id IS NOT NULL を要求)。
--   - practice_times は practice_log_id -> practice_logs -> practices の2段で辿る
--     必要があるため、既存の DELETE ポリシー (initial_schema.sql:1747) と同じ
--     JOIN 構造 (practice_logs "pl" JOIN practices "p") を踏襲し、対象行の所有者は
--     pl.user_id (紐づく practice_log の所有者) で判定する。
--
--   既存 migration は改変せず、ここでオーナー限定ポリシーを DROP し、統合版を作成する
--   (20260620000000 と同じ流儀: 代理ポリシーを別建てにせず 1 本に統合)。
--
-- 注意:
--   - UPDATE は対象外 (20260620000000 / 20260803000002 で対応済み)。
--   - practice_logs の UPDATE ポリシーには 20260803000002 で「ログ所有者本人」枝が
--     追加されているが、これは選手本人による自己更新 (動画削除等) のためのもので、
--     INSERT / DELETE には適用しない (代理入力の INSERT/DELETE は
--     practice.team_id 経由の admin 代理のみが対象)。

-- ============================================
-- practice_logs: DELETE
-- ============================================
DROP POLICY IF EXISTS "Users can delete own practice_logs" ON public.practice_logs;
DROP POLICY IF EXISTS "Practice logs delete policy" ON public.practice_logs;

CREATE POLICY "Practice logs delete policy" ON public.practice_logs
FOR DELETE USING (
  EXISTS (
    SELECT 1
    FROM public.practices p
    WHERE p.id = practice_logs.practice_id
    AND (
      -- 本人 (従来の owner: 練習の作成者)
      p.user_id = (select auth.uid())
      OR
      -- チーム管理者による代理 DELETE
      (
        p.team_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.team_memberships tm
          WHERE tm.team_id = p.team_id
          AND tm.user_id = (select auth.uid())
          AND tm.role = 'admin'
          AND tm.is_active = true
        )
        AND EXISTS (
          SELECT 1 FROM public.team_memberships tm
          WHERE tm.team_id = p.team_id
          AND tm.user_id = practice_logs.user_id
          AND tm.is_active = true
        )
      )
    )
  )
);

-- ============================================
-- practice_logs: INSERT
-- ============================================
DROP POLICY IF EXISTS "Users can insert own practice_logs" ON public.practice_logs;
DROP POLICY IF EXISTS "Practice logs insert policy" ON public.practice_logs;

CREATE POLICY "Practice logs insert policy" ON public.practice_logs
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.practices p
    WHERE p.id = practice_logs.practice_id
    AND (
      -- 本人 (従来の owner: 練習の作成者)
      p.user_id = (select auth.uid())
      OR
      -- チーム管理者による代理 INSERT
      (
        p.team_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.team_memberships tm
          WHERE tm.team_id = p.team_id
          AND tm.user_id = (select auth.uid())
          AND tm.role = 'admin'
          AND tm.is_active = true
        )
        AND EXISTS (
          SELECT 1 FROM public.team_memberships tm
          WHERE tm.team_id = p.team_id
          AND tm.user_id = practice_logs.user_id
          AND tm.is_active = true
        )
      )
    )
  )
);

-- ============================================
-- practice_times: DELETE
-- ============================================
DROP POLICY IF EXISTS "Users can delete own practice_times" ON public.practice_times;
DROP POLICY IF EXISTS "Practice times delete policy" ON public.practice_times;

CREATE POLICY "Practice times delete policy" ON public.practice_times
FOR DELETE USING (
  EXISTS (
    SELECT 1
    FROM public.practice_logs pl
    JOIN public.practices p ON p.id = pl.practice_id
    WHERE pl.id = practice_times.practice_log_id
    AND (
      -- 本人 (従来の owner: 練習の作成者)
      p.user_id = (select auth.uid())
      OR
      -- チーム管理者による代理 DELETE (対象行の所有者は紐づく practice_log の所有者)
      (
        p.team_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.team_memberships tm
          WHERE tm.team_id = p.team_id
          AND tm.user_id = (select auth.uid())
          AND tm.role = 'admin'
          AND tm.is_active = true
        )
        AND EXISTS (
          SELECT 1 FROM public.team_memberships tm
          WHERE tm.team_id = p.team_id
          AND tm.user_id = pl.user_id
          AND tm.is_active = true
        )
      )
    )
  )
);

-- ============================================
-- practice_times: INSERT
-- ============================================
DROP POLICY IF EXISTS "Users can insert own practice_times" ON public.practice_times;
DROP POLICY IF EXISTS "Practice times insert policy" ON public.practice_times;

CREATE POLICY "Practice times insert policy" ON public.practice_times
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.practice_logs pl
    JOIN public.practices p ON p.id = pl.practice_id
    WHERE pl.id = practice_times.practice_log_id
    AND (
      -- 本人 (従来の owner: 練習の作成者)
      p.user_id = (select auth.uid())
      OR
      -- チーム管理者による代理 INSERT (対象行の所有者は紐づく practice_log の所有者)
      (
        p.team_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.team_memberships tm
          WHERE tm.team_id = p.team_id
          AND tm.user_id = (select auth.uid())
          AND tm.role = 'admin'
          AND tm.is_active = true
        )
        AND EXISTS (
          SELECT 1 FROM public.team_memberships tm
          WHERE tm.team_id = p.team_id
          AND tm.user_id = pl.user_id
          AND tm.is_active = true
        )
      )
    )
  )
);
