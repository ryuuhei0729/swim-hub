-- =============================================================================
-- Issue #38 (A2b): pending メンバーの自己承認スキップ を封じる
-- Issue #42        : 招待コード無しでの参加申請（pending 行）乱造を封じる
--
-- 背景 (20260705000000 時点の残存穴):
--   - team_memberships の自己 UPDATE は role='user' のみに制約されており、
--     status / is_active は無制約。pending ユーザーが自分の行を直接
--     UPDATE team_memberships SET status='approved', is_active=true
--     WHERE user_id=auth.uid() することで、管理者の承認を経ずに
--     approved かつ active になれてしまう（自己承認スキップ = A2b）。
--   - team_memberships の自己 INSERT は role='user', status='pending',
--     is_active=false に制約されているが、招待コードの正当性チェックは
--     一切ない。任意のユーザーが任意の team_id を指定して pending 行を
--     いくらでも INSERT できてしまう（招待コード無しの参加申請乱造 = #42）。
--
-- 対策方針:
--   1. RLS だけでは (a) 招待コードの検証 (#42) と (b) 更新前の left_at 等
--      「今の DB の状態」を安全に参照すること (A2b) の両方を満たせない
--      （自テーブルへの生 SELECT を RLS 内で行うと再帰する。過去の
--      20260705000000 で実証済み）ため、最小限の SECURITY DEFINER RPC を
--      2本導入する。
--        - request_join_team(p_invite_code)      … 招待コード検証込みの参加申請
--        - reactivate_own_membership(p_team_id)  … 退会済みメンバーの再加入
--      いずれも「関数内で認可ガードを実施し、RLS はすり抜けるが自前で守る」
--      という 20260618000000 (replace_practice_logs) と同型のパターン。
--   2. team_memberships の自己 INSERT 枝を撤去する。これにより招待コード
--      無しでの pending 行 INSERT は RLS 層で完全に不可能になり、参加申請は
--      必ず request_join_team 経由（= 有効な招待コードが必須）になる。
--   3. team_memberships の自己 UPDATE 枝を
--        user_id=auth.uid() AND role='user' AND is_active=false
--        AND is_team_member(team_id, auth.uid())
--      に絞る。
--        - is_team_member(...) は「今 DB 上で is_active=true な行を持つか」を
--          判定する SECURITY DEFINER 関数（既存・RLS 回避用）。UPDATE 文の
--          コマンド開始時点のスナップショットを見るため、これは「更新前
--          (OLD) の自分が承認済みアクティブメンバーだったか」の判定として
--          機能する（is_team_admin が同じ WITH CHECK 内で管理者自身の行を
--          更新する場合に安全に使えているのと同じ理屈）。
--        - 結果: この自己 UPDATE 枝で許可されるのは「今まさに承認済み
--          アクティブなメンバーが is_active=false にする」= leave() の
--          ケースのみ。pending / rejected / 退会済み(approved & inactive) の
--          行は is_team_member が false を返すため、この枝を一切通れない。
--        - これにより「pending 行を自己 UPDATE で
--          status='approved', is_active=false, left_at=<偽の過去日> に
--          偽装してから reactivate_own_membership を呼ぶ」という二段階の
--          A2b 回避シナリオも同時に塞がれる（そもそも pending 行は
--          この自己 UPDATE 枝を一切通過できないため）。
--        - 再申請 (rejected→pending) や再アクティブ化 (approved/inactive→
--          approved/active) は request_join_team / reactivate_own_membership
--          という SECURITY DEFINER RPC 経由に一本化したため、直接の
--          自己 UPDATE では不要になった（RPC は RLS をバイパスする）。
--        - is_team_admin 枝・teams.created_by 枝は従来どおり無制約
--          （承認/拒否/ロール変更/管理者自身の更新は影響を受けない）。
--
-- 各正規フローが壊れない根拠:
--   - join()        : request_join_team RPC に一本化。新規/再申請/退会済み
--                      再加入のいずれも RPC 内で完結し、RLS の INSERT/UPDATE
--                      ポリシーには依存しない。
--   - reactivateMembership(): reactivate_own_membership RPC に一本化。
--                      「approved かつ is_active=false かつ left_at が
--                      記録済み（= leave()/remove() を経由して退会した）」
--                      行のみ再アクティブ化できる。left_at が NULL の
--                      pending 行はこのガードで弾かれる。
--   - leave()        : 自己 UPDATE (is_active=false, left_at=today) のまま。
--                      新しい自己 UPDATE 枝 (role='user' AND is_active=false
--                      AND is_team_member(...)) を満たすため引き続き動作する。
--   - approve()/reject(): is_team_admin 枝 (無制約) 経由で従来どおり動作。
--   - createTeam()   : teams.created_by=auth.uid() 枝 (無制約) 経由で
--                      従来どおり動作。自己 INSERT 枝の削除の影響を受けない。
--
-- 申し送り (本番適用前に要確認):
--   本番 DB に「status='approved' AND is_active=false AND left_at IS NULL」
--   という行が既に存在する場合、その行は reactivate_own_membership の
--   ガードを満たせず再アクティブ化不可になる。理論上は remove()/leave() が
--   必ず left_at を設定するため発生しないはずだが、過去の不整合データが
--   無いか QA / PM 側でご確認いただきたい。
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. request_join_team: 招待コード検証込みの参加申請 RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."request_join_team"("p_invite_code" "text")
RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    SET search_path = public
    AS $$
DECLARE
  v_caller uuid;
  v_team_id uuid;
  v_existing public.team_memberships%ROWTYPE;
  v_membership public.team_memberships%ROWTYPE;
  v_today date := current_date;
BEGIN
  v_caller := auth.uid();

  -- 未認証 (anon) は拒否。anon への GRANT は剥奪済みだが二重防御。
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '認証が必要です');
  END IF;

  IF p_invite_code IS NULL OR btrim(p_invite_code) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', '招待コードが正しくありません');
  END IF;

  -- 招待コードでチームを検索（一致するチームが無い場合は情報を絞ったエラーにする）
  -- 空白判定 (btrim = '') と揃えるため、照合も btrim 済みの値で行う
  SELECT t.id INTO v_team_id
  FROM public.teams t
  WHERE t.invite_code = btrim(p_invite_code)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '招待コードが正しくありません');
  END IF;

  -- 既存メンバーシップの有無で分岐
  SELECT * INTO v_existing
  FROM public.team_memberships tm
  WHERE tm.team_id = v_team_id
    AND tm.user_id = v_caller;

  IF FOUND THEN
    IF v_existing.status = 'approved' AND v_existing.is_active = true THEN
      RETURN jsonb_build_object('success', false, 'error', '既にこのチームに参加しています');

    ELSIF v_existing.status = 'pending' THEN
      RETURN jsonb_build_object('success', false, 'error', '既に参加申請中です。承認をお待ちください');

    ELSIF v_existing.status = 'rejected' THEN
      -- 拒否された場合は再申請（pendingに更新）
      UPDATE public.team_memberships
      SET status = 'pending',
          is_active = false,
          joined_at = v_today,
          left_at = NULL
      WHERE id = v_existing.id
      RETURNING * INTO v_membership;

      RETURN jsonb_build_object('success', true, 'membership', to_jsonb(v_membership));

    ELSIF v_existing.status = 'approved' AND v_existing.is_active = false THEN
      -- 退会済みメンバーが招待コードを使って再加入 = 再アクティブ化。
      -- 招待コードの提示により参加意思を再確認済みのため即時反映する
      -- （reactivate_own_membership と異なり left_at の状態は問わない。
      --   join() は常に招待コードの正当性検証を経ているため安全）。
      UPDATE public.team_memberships
      SET status = 'approved',
          is_active = true,
          joined_at = v_today,
          left_at = NULL
      WHERE id = v_existing.id
      RETURNING * INTO v_membership;

      RETURN jsonb_build_object('success', true, 'membership', to_jsonb(v_membership));

    ELSE
      RETURN jsonb_build_object('success', false, 'error', '参加申請に失敗しました');
    END IF;
  END IF;

  -- 新しいメンバーシップを作成（承認待ち）
  INSERT INTO public.team_memberships (team_id, user_id, role, status, is_active, joined_at, left_at)
  VALUES (v_team_id, v_caller, 'user', 'pending', false, v_today, NULL)
  RETURNING * INTO v_membership;

  RETURN jsonb_build_object('success', true, 'membership', to_jsonb(v_membership));

EXCEPTION
  WHEN OTHERS THEN
    -- SQLERRM をそのままクライアントに返すと内部実装の詳細が漏えいするため、
    -- 汎用メッセージのみ返し、詳細はサーバーログ (RAISE WARNING) に残す
    RAISE WARNING 'request_join_team failed: %', SQLERRM;
    RETURN jsonb_build_object('success', false, 'error', '処理中にエラーが発生しました');
END;
$$;

ALTER FUNCTION "public"."request_join_team"("p_invite_code" "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."request_join_team"("p_invite_code" "text") IS
  '招待コードを検証したうえで参加申請(pending)を作成する。SECURITY DEFINER のため RLS をすり抜けるが、
関数内で招待コードの一致・既存メンバーシップの状態(approved/pending/rejected/退会済み)を検証してから
INSERT/UPDATE する。team_memberships への自己 INSERT は RLS で禁止されているため、参加申請は必ずこの
関数を経由する(= 招待コード無しでの pending 行乱造 (#42) を防止)。';

REVOKE ALL ON FUNCTION "public"."request_join_team"("p_invite_code" "text") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."request_join_team"("p_invite_code" "text") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."request_join_team"("p_invite_code" "text") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."request_join_team"("p_invite_code" "text") TO "service_role";


-- -----------------------------------------------------------------------------
-- 2. reactivate_own_membership: 退会済みメンバーの再アクティブ化 RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."reactivate_own_membership"("p_team_id" "uuid")
RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    SET search_path = public
    AS $$
DECLARE
  v_caller uuid;
  v_existing public.team_memberships%ROWTYPE;
  v_membership public.team_memberships%ROWTYPE;
  v_today date := current_date;
BEGIN
  v_caller := auth.uid();

  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '認証が必要です');
  END IF;

  SELECT * INTO v_existing
  FROM public.team_memberships tm
  WHERE tm.team_id = p_team_id
    AND tm.user_id = v_caller;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'メンバーシップが見つかりません');
  END IF;

  -- A2b 対策: 「過去に承認され (approved)、現在は非アクティブ (is_active=false) で、
  -- かつ実際に退会処理 (leave()/remove()) を経由した (left_at が記録済み)」行のみ
  -- 再アクティブ化を許可する。pending 行は left_at が常に NULL のため、この条件を
  -- 満たせず弾かれる(= 承認スキップ不可)。
  IF NOT (
    v_existing.status = 'approved'
    AND v_existing.is_active = false
    AND v_existing.left_at IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '再アクティブ化できるメンバーシップではありません');
  END IF;

  UPDATE public.team_memberships
  SET status = 'approved',
      is_active = true,
      joined_at = v_today,
      left_at = NULL
  WHERE id = v_existing.id
  RETURNING * INTO v_membership;

  RETURN jsonb_build_object('success', true, 'membership', to_jsonb(v_membership));

EXCEPTION
  WHEN OTHERS THEN
    -- SQLERRM をそのままクライアントに返すと内部実装の詳細が漏えいするため、
    -- 汎用メッセージのみ返し、詳細はサーバーログ (RAISE WARNING) に残す
    RAISE WARNING 'reactivate_own_membership failed: %', SQLERRM;
    RETURN jsonb_build_object('success', false, 'error', '処理中にエラーが発生しました');
END;
$$;

ALTER FUNCTION "public"."reactivate_own_membership"("p_team_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."reactivate_own_membership"("p_team_id" "uuid") IS
  '退会済み(approved かつ is_active=false かつ left_at 記録済み)の自分のメンバーシップを再アクティブ化する。
SECURITY DEFINER のため RLS をすり抜けるが、left_at IS NOT NULL を必須にすることで pending 行(left_at=NULL)
からの自己承認スキップ(#38 A2b)を防止する。';

REVOKE ALL ON FUNCTION "public"."reactivate_own_membership"("p_team_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."reactivate_own_membership"("p_team_id" "uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."reactivate_own_membership"("p_team_id" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."reactivate_own_membership"("p_team_id" "uuid") TO "service_role";


-- -----------------------------------------------------------------------------
-- 3. team_memberships INSERT ポリシー差し替え: 自己参加申請枝を撤去
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert team memberships" ON "public"."team_memberships";

CREATE POLICY "Users can insert team memberships" ON "public"."team_memberships"
FOR INSERT WITH CHECK (
  -- チーム作成者枝のみ残す。createTeam() が role='admin', status='approved',
  -- is_active=true で INSERT する経路（teams.created_by = auth.uid() が
  -- 先行する teams INSERT で既に成立している）。
  EXISTS (
    SELECT 1
    FROM "public"."teams"
    WHERE "teams"."id" = "team_memberships"."team_id"
      AND "teams"."created_by" = (SELECT "auth"."uid"())
  )
  -- 自己参加申請枝は撤去。参加申請は request_join_team() RPC (SECURITY DEFINER)
  -- 経由に一本化し、招待コードの検証を必須にする(#42 対策)。
);


-- -----------------------------------------------------------------------------
-- 4. team_memberships UPDATE ポリシー差し替え: 自己更新枝を leave() 専用に縮小
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update team memberships" ON "public"."team_memberships";

CREATE POLICY "Users can update team memberships" ON "public"."team_memberships"
FOR UPDATE
USING (
  -- 行の読み取り許可条件（既存と同一）
  public.is_team_admin("team_memberships"."team_id", (SELECT "auth"."uid"()))
  OR
  ("user_id" = (SELECT "auth"."uid"()))
  OR
  (
    EXISTS (
      SELECT 1
      FROM "public"."teams"
      WHERE "teams"."id" = "team_memberships"."team_id"
        AND "teams"."created_by" = (SELECT "auth"."uid"())
    )
  )
)
WITH CHECK (
  -- チーム管理者枝: 承認/拒否/ロール変更等、role 変更を含む任意の更新を許可（従来どおり）。
  public.is_team_admin("team_memberships"."team_id", (SELECT "auth"."uid"()))
  OR
  -- チーム作成者枝: 同上。
  (
    EXISTS (
      SELECT 1
      FROM "public"."teams"
      WHERE "teams"."id" = "team_memberships"."team_id"
        AND "teams"."created_by" = (SELECT "auth"."uid"())
    )
  )
  OR
  -- 自己更新枝: leave() (is_active=false, left_at=today への自己更新) のみを許可する。
  --   - role='user' : admin への自己昇格を禁止（20260705000000 から継続）。
  --   - is_active=false : 自己 UPDATE での activate（承認済み化）を禁止。
  --   - status='approved' : leave() は status を変更しない (アクティブメンバーは
  --     常に approved) ため、更新後も approved のままであることを要求する。
  --     これが無いとアクティブメンバーが自分の行を status='pending' に書き換え、
  --     管理者の承認待ち一覧に偽の申請を注入できる (グリーフィング)。
  --   - left_at IS NOT NULL : leave() は必ず left_at を記録する。これが無いと
  --     left_at=NULL のまま退会状態を作れてしまい、reactivate_own_membership の
  --     「left_at IS NOT NULL = 実際に退会した行のみ」ガードとの整合が崩れる。
  --   - is_team_member(team_id, auth.uid()) : 「今 DB 上で is_active=true な
  --     行を持つ(=更新前は承認済みアクティブメンバーだった)」ことを要求する。
  --     SECURITY DEFINER 関数なので RLS を再帰させずに評価できる
  --     (is_team_admin が同じ理屈で既に使われているのと同型)。
  --     pending / rejected / 退会済み(approved & inactive) の行は
  --     is_team_member が false を返すため、この枝を一切通過できない。
  --     これにより「pending 行を自己 UPDATE で
  --     status='approved', is_active=false, left_at=<偽装日> にしてから
  --     reactivate_own_membership を呼ぶ」という二段階の承認スキップも
  --     未然に防止する。
  --   再申請 (rejected→pending) と再アクティブ化 (approved/inactive→
  --   approved/active) は request_join_team / reactivate_own_membership の
  --   SECURITY DEFINER RPC に一本化したため、この自己更新枝でサポートする
  --   必要はない。
  (
    "user_id" = (SELECT "auth"."uid"())
    AND "role" = 'user'
    AND "is_active" = false
    AND "status" = 'approved'
    AND "left_at" IS NOT NULL
    AND public.is_team_member("team_memberships"."team_id", (SELECT "auth"."uid"()))
  )
);
