-- ============================================
-- practice_logs: チーム管理者による代理 UPDATE ポリシーを追加
-- ============================================
--
-- 背景 (Critical C-1):
--   practice_logs の UPDATE RLS は従来オーナー限定の 1 本のみ
--   (`Users can update own practice_logs` = practices.user_id = auth.uid())。
--   records は 20260129000000 で「本人 OR 当該 team の active admin (対象 owner が
--   active member)」の代理 UPDATE を許可済みだが、practice_logs には同等の代理
--   ポリシーが無かった。
--
--   このため、練習作成者でない admin (複数 admin チームで別 admin が作成した練習)
--   が代理動画 (video_path) を付けようとすると RLS で 0 行更新・エラー無しになり、
--   API ルートが {success:true} を返す無音 false-success が発生していた。
--
-- 方針:
--   records の代理 UPDATE ポリシー (20260129000000:195-217) と同型で統合する。
--   practice_logs は team_id を直接持たないため、所属 practice 経由で team を辿る:
--     practice_logs.practice_id -> practices.team_id
--   - 本人 (従来の owner: practices.user_id = caller) は従来どおり許可。
--   - 代理: practice.team_id IS NOT NULL かつ caller が当該 team の active admin
--     (is_active=true AND role='admin') かつ practice_logs.user_id (行の所有者)
--     がその team の active member であること。
--   - team_id NULL (個人練習) は本人のみ (代理ブロックは team_id IS NOT NULL を要求)。
--
--   既存 migration は改変せず、ここでオーナー限定ポリシーを DROP し、統合版を作成する
--   (records と同じ流儀: 代理ポリシーを別建てにせず 1 本に統合)。
--
-- 注意:
--   - 従来の owner 判定は practices.user_id (= 練習の作成者) を見ていた。
--     practice_logs.user_id (= ログの所有者 = 動画が紐づくメンバー) とは異なるため、
--     本人フローを壊さないよう「practices.user_id = caller」の条件を維持する。
--   - INSERT/DELETE は replace_practice_logs RPC (SECURITY DEFINER + 関数内認可)
--     経由のため UPDATE のみで十分。video_path 更新は UPDATE。

DROP POLICY IF EXISTS "Users can update own practice_logs" ON public.practice_logs;
DROP POLICY IF EXISTS "Practice logs update policy" ON public.practice_logs;

CREATE POLICY "Practice logs update policy" ON public.practice_logs
FOR UPDATE USING (
  EXISTS (
    SELECT 1
    FROM public.practices p
    WHERE p.id = practice_logs.practice_id
    AND (
      -- 本人 (従来の owner: 練習の作成者)
      p.user_id = (select auth.uid())
      OR
      -- チーム管理者による代理 UPDATE
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
