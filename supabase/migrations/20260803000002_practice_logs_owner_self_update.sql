-- ============================================
-- practice_logs: ログ所有者本人による UPDATE を許可 (プロダクト判断)
-- ============================================
--
-- 背景:
--   20260620000000 の UPDATE ポリシーは「本人」を practices.user_id
--   (= 練習の作成者) と定義しており、practice_logs.user_id (= ログの所有者)
--   ではなかった。このため、コーチが選手の練習ログを代理入力した場合
--   (teams-admin の一括入力 = replace_practice_logs RPC 経由、正規機能)、
--   選手本人が自分のログ (例: 動画) を更新できないという不整合があった。
--   apps/web/lib/video-authz.ts の authorizePracticeLogVideoMutation は
--   practice_logs.user_id を「本人」として早期 ok:true を返す一方、RLS は
--   0 行更新でブロックしており、認可判定と RLS の定義が食い違っていた。
--
--   プロダクト判断: 選手にも自分のログ (practice_logs.user_id = 本人) の
--   更新 (動画削除を含む) を許可する。
--
-- 影響範囲の確認 (このポリンシーは UPDATE のみを扱う):
--   - コーチの一括入力は replace_practice_logs RPC
--     (20260618000000_secure_replace_practice_logs.sql, SECURITY DEFINER) 経由で
--     DELETE + INSERT を行っており、RLS を経由しない (関数内で独自に
--     admin/所有権/メンバー認可を行っている)。よって本変更はコーチの
--     一括入力フローに影響しない。
--   - records の UPDATE ポリシー (20260129000000_optimize_rls_policies.sql:195-217)
--     は既に「本人 = records.user_id」であり、本変更は practice_logs にも同名の
--     「本人 = practice_logs.user_id」枝を追加するものである。
--     ただし records と完全に同型になるわけではない (2026-08-03 QA 実測)。
--     records の本人枝は team_memberships を一切参照しないため、退会済み
--     (is_active=false) メンバーでも自分の record を無条件に自己 UPDATE できる。
--     一方 practice_logs の本人枝は、SELECT ポリジー
--     (20260210000000_allow_team_practice_logs_viewing.sql の is_team_member、
--     is_active=true を要求) が UPDATE 対象行を可視化する前提条件になっているため、
--     退会済みメンバーは自分の practice_log が UPDATE 対象として見えず 0 行になる
--     (詳細は下記 WITH CHECK の項を参照)。つまり「本人が自分のログを更新できる」
--     という点は現役メンバーについては records と揃うが、退会済みメンバーに
--     ついては揃わない非対称が残る。これは実装バグではなくプロダクト判断事項
--     として報告する (退会済みメンバーにも自己 UPDATE を許可するかは未決定)。
--
-- 実装方針:
--   ログ所有者判定は practice の内容に依存しないため、既存の
--   `EXISTS (SELECT 1 FROM practices p WHERE p.id = practice_logs.practice_id ...)`
--   の外側 (トップレベル) に OR 条件として追加する。
--   既存の2枝 (練習作成者本人 / チーム管理者による代理) は維持する。
--
-- WITH CHECK の検討:
--   従来 WITH CHECK が無く、USING が更新後の行にもそのまま適用される
--   (PostgreSQL の仕様: WITH CHECK 省略時は USING 式が WITH CHECK としても使われる)。
--   - user_id の付け替え: 新設したログ所有者枝は
--     `practice_logs.user_id = (select auth.uid())` を要求するため、
--     更新後の行で user_id を他人の id に書き換えると、この枝は
--     (select auth.uid()) と一致しなくなり素通りできない。
--     他の2枝 (練習作成者本人 / admin代理) も caller が practice 作成者や
--     当該 team の admin であることを要求するため、ログ所有者 (一般ユーザー)
--     には通常成立しない。→ user_id の付け替えは元から防がれる。
--   - practice_id の付け替え: 上記の user_id チェックだけでは、
--     「user_id は自分のままで practice_id だけ他人の練習 (他チームの練習を含む) に
--     付け替える」ことを防げない。ログ所有者枝は practice の内容を一切見ないため、
--     USING をそのまま WITH CHECK に流用すると、practice_id を任意の値に
--     書き換えても枝が素通りしてしまう (他チームの練習へのログ付け替え・
--     データ汚染のリスク)。
--     → 塞ぐ方向を選択し、明示的な WITH CHECK を追加する。ログ所有者枝は
--       「更新後の practice_id が (a) 自分が作成した practice、または
--       (b) 自分が active member であるチームの practice」である場合のみ許可する。
--       これにより、無関係な他チームの練習へのログ付け替えを防ぎつつ、
--       通常操作 (video_path 更新のみで practice_id 不変) は従来どおり通る。
--       (practice 作成者本人 / admin代理の既存2枝は、WITH CHECK でも USING と
--       同じ条件をそのまま適用し、挙動を変えない)

DROP POLICY IF EXISTS "Users can update own practice_logs" ON public.practice_logs;
DROP POLICY IF EXISTS "Practice logs update policy" ON public.practice_logs;

CREATE POLICY "Practice logs update policy" ON public.practice_logs
FOR UPDATE
USING (
  -- ログ所有者本人 (practice の内容に依存しないため EXISTS の外側)
  practice_logs.user_id = (select auth.uid())
  OR
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
)
WITH CHECK (
  (
    -- ログ所有者本人: 更新後の practice_id が「自分が作成した practice」または
    -- 「自分が active member であるチームの practice」であることを追加で要求し、
    -- 無関係な他チームの練習へのログ付け替えを防ぐ。
    practice_logs.user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.practices p2
      WHERE p2.id = practice_logs.practice_id
      AND (
        p2.user_id = (select auth.uid())
        OR
        (
          p2.team_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.team_memberships tm
            WHERE tm.team_id = p2.team_id
            AND tm.user_id = (select auth.uid())
            AND tm.is_active = true
          )
        )
      )
    )
  )
  OR
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
