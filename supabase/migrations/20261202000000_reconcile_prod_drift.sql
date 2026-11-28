-- =============================================================================
-- 本番 (SwimHub-prod) にだけ残っていた古い定義を、migration を全部流した状態の定義に揃える
--
-- 2026-11-28 に本番のスキーマ (supabase db dump --linked) と、全 migration を空の DB に流した
-- スキーマを比べて見つかったずれ。本番の migration 履歴では該当の migration は適用済みだが、
-- 中身が古い (適用後に migration ファイルが書き換えられたとみられる。推測)。
-- 開発環境・ローカル・CI のように既に正しい定義になっている DB では、作り直すだけで何も変わらない。
--
-- 1. replace_practice_logs: 本番では認可ガードが無く、anon にも EXECUTE があった。
--    SECURITY DEFINER で RLS を通らないので、未ログインでも任意の練習のログを消して書き換えられた。
--    20260618000000 / 20260619000000 / 20260621000000 の後の定義に戻し、PUBLIC / anon の EXECUTE を外す
-- 2. request_join_team / reactivate_own_membership: 招待コードを btrim せずに照合し、
--    例外時に SQLERRM をそのまま返していた。20260706000000 の定義に戻す
-- 3. team_memberships の UPDATE ポリシー: 本人の更新の WITH CHECK に
--    status = 'approved' AND left_at IS NOT NULL が無く、メンバーが自分の行を pending に書き換えられた
--    (承認待ち一覧への紛れ込み)。20260706000000 の定義に戻す
-- 4. milestone_achievements: practice_log_id / record_id の FK が無かった (20260115020000 の定義では
--    ON DELETE SET NULL)。消えた練習ログ・記録を指す ID を NULL にしてから FK を張る
-- 5. set_published_at: 本番にだけある、どのトリガからも使われていない関数。削除する
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. replace_practice_logs
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.replace_practice_logs(p_practice_id uuid, p_logs_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_log_data jsonb;
  v_practice_log_id uuid;
  v_time_data jsonb;
  v_tag_id uuid;
  v_result jsonb;
  v_error_message text;
  v_index integer := 0;
  v_swim_category "public"."swim_category_enum";
  -- 認可用
  v_caller uuid;
  v_practice_owner uuid;
  v_practice_team_id uuid;
  v_target_user_id uuid;
  v_authorized boolean;
  -- W-1: 挿入したログIDを insert ループ順に蓄積し、成功レスポンスで返す
  v_log_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  -- トランザクション開始（関数全体が自動的にトランザクション内で実行される）

  -- ===========================================================================
  -- 認可ガード (DELETE より前に必ず実施。SECURITY DEFINER のため RLS は効かない)
  -- ===========================================================================
  v_caller := auth.uid();

  -- 未認証 (anon) は拒否。anon への GRANT は剥奪済みだが二重防御。
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'authentication required'
    );
  END IF;

  -- 対象 practice を引く
  SELECT p.user_id, p.team_id
    INTO v_practice_owner, v_practice_team_id
    FROM public.practices p
   WHERE p.id = p_practice_id;

  -- 存在しない practice は拒否 (情報漏洩を避けるため一般的なメッセージ)
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'practice not found or not authorized'
    );
  END IF;

  -- (a) 個人練習 (team_id IS NULL): 呼び出し元が所有者であること
  -- (b) チーム練習 (team_id IS NOT NULL): 呼び出し元がその team の active admin であること
  --     既存 practices DELETE/UPDATE RLS と同型:
  --       user_id = auth.uid() OR is_team_admin(team_id, auth.uid())
  IF v_practice_team_id IS NULL THEN
    v_authorized := (v_practice_owner = v_caller);
  ELSE
    v_authorized := (v_practice_owner = v_caller)
                    OR public.is_team_admin(v_practice_team_id, v_caller);
  END IF;

  IF NOT v_authorized THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'not authorized to modify this practice'
    );
  END IF;

  -- 入力データのバリデーション
  -- 1. p_logs_dataが配列であることを確認
  IF jsonb_typeof(p_logs_data) != 'array' THEN
    v_result := jsonb_build_object(
      'success', false,
      'error', 'p_logs_data must be a JSON array',
      'field', 'p_logs_data',
      'index', -1
    );
    RETURN v_result;
  END IF;

  -- 2. 配列が空でないことを確認
  IF jsonb_array_length(p_logs_data) = 0 THEN
    v_result := jsonb_build_object(
      'success', false,
      'error', 'p_logs_data must be a non-empty array',
      'field', 'p_logs_data',
      'index', -1
    );
    RETURN v_result;
  END IF;

  -- ===========================================================================
  -- p_logs_data の各 user_id が「許可された対象」であることを事前検証。
  -- DELETE より前に全件チェックし、1件でも不正なら DELETE に到達させない。
  --   個人練習: 本人 (= 所有者) のみ。
  --   チーム練習: その team の active メンバーのみ
  --              (records RLS 代理 INSERT 条件と同型)。
  -- ===========================================================================
  v_index := 0;
  FOR v_log_data IN SELECT * FROM jsonb_array_elements(p_logs_data)
  LOOP
    -- user_id の存在・型・UUID 検証 (後段ループと同じ規約)
    IF v_log_data->'user_id' IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'user_id is required',
        'field', 'user_id',
        'index', v_index
      );
    END IF;

    IF jsonb_typeof(v_log_data->'user_id') != 'string' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'user_id must be a string',
        'field', 'user_id',
        'index', v_index
      );
    END IF;

    BEGIN
      v_target_user_id := (v_log_data->>'user_id')::uuid;
    EXCEPTION
      WHEN OTHERS THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'user_id must be a valid UUID',
          'field', 'user_id',
          'index', v_index
        );
    END;

    IF v_practice_team_id IS NULL THEN
      -- 個人練習: 本人のみ許可
      IF v_target_user_id <> v_practice_owner THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'not authorized: user_id is not allowed for this practice',
          'field', 'user_id',
          'index', v_index
        );
      END IF;
    ELSE
      -- チーム練習: その team の active メンバーのみ許可
      IF NOT EXISTS (
        SELECT 1
          FROM public.team_memberships tm
         WHERE tm.team_id = v_practice_team_id
           AND tm.user_id = v_target_user_id
           AND tm.is_active = true
      ) THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'not authorized: user_id is not an active member of the team',
          'field', 'user_id',
          'index', v_index
        );
      END IF;
    END IF;

    v_index := v_index + 1;
  END LOOP;

  -- 既存のpractice_logsと関連データを削除
  -- CASCADEにより、practice_timesとpractice_log_tagsも自動削除される
  DELETE FROM practice_logs
  WHERE practice_id = p_practice_id;

  -- 新しいログデータを挿入
  v_index := 0;
  FOR v_log_data IN SELECT * FROM jsonb_array_elements(p_logs_data)
  LOOP
    -- 各エントリのバリデーション
    -- user_idの存在と型チェック
    IF v_log_data->'user_id' IS NULL THEN
      v_result := jsonb_build_object(
        'success', false,
        'error', 'user_id is required',
        'field', 'user_id',
        'index', v_index
      );
      RETURN v_result;
    END IF;

    IF jsonb_typeof(v_log_data->'user_id') != 'string' THEN
      v_result := jsonb_build_object(
        'success', false,
        'error', 'user_id must be a string',
        'field', 'user_id',
        'index', v_index
      );
      RETURN v_result;
    END IF;

    -- user_idがUUIDに変換可能か確認
    BEGIN
      PERFORM (v_log_data->>'user_id')::uuid;
    EXCEPTION
      WHEN OTHERS THEN
        v_result := jsonb_build_object(
          'success', false,
          'error', 'user_id must be a valid UUID',
          'field', 'user_id',
          'index', v_index
        );
        RETURN v_result;
    END;

    -- styleの存在と型チェック
    IF v_log_data->'style' IS NULL THEN
      v_result := jsonb_build_object(
        'success', false,
        'error', 'style is required',
        'field', 'style',
        'index', v_index
      );
      RETURN v_result;
    END IF;

    IF jsonb_typeof(v_log_data->'style') != 'string' THEN
      v_result := jsonb_build_object(
        'success', false,
        'error', 'style must be a string',
        'field', 'style',
        'index', v_index
      );
      RETURN v_result;
    END IF;

    -- swim_categoryのバリデーション（オプショナル、デフォルト'Swim'）
    IF v_log_data->'swim_category' IS NULL THEN
      v_swim_category := 'Swim';
    ELSIF jsonb_typeof(v_log_data->'swim_category') != 'string' THEN
      v_result := jsonb_build_object(
        'success', false,
        'error', 'swim_category must be a string',
        'field', 'swim_category',
        'index', v_index
      );
      RETURN v_result;
    ELSE
      -- enum値の検証
      IF v_log_data->>'swim_category' NOT IN ('Swim', 'Pull', 'Kick') THEN
        v_result := jsonb_build_object(
          'success', false,
          'error', 'swim_category must be one of: Swim, Pull, Kick',
          'field', 'swim_category',
          'index', v_index
        );
        RETURN v_result;
      END IF;
      v_swim_category := (v_log_data->>'swim_category')::"public"."swim_category_enum";
    END IF;

    -- rep_countの存在と型チェック
    IF v_log_data->'rep_count' IS NULL THEN
      v_result := jsonb_build_object(
        'success', false,
        'error', 'rep_count is required',
        'field', 'rep_count',
        'index', v_index
      );
      RETURN v_result;
    END IF;

    IF jsonb_typeof(v_log_data->'rep_count') NOT IN ('number', 'string') THEN
      v_result := jsonb_build_object(
        'success', false,
        'error', 'rep_count must be a number or numeric string',
        'field', 'rep_count',
        'index', v_index
      );
      RETURN v_result;
    END IF;

    -- rep_countが整数に変換可能か確認
    BEGIN
      PERFORM (v_log_data->>'rep_count')::integer;
    EXCEPTION
      WHEN OTHERS THEN
        v_result := jsonb_build_object(
          'success', false,
          'error', 'rep_count must be a valid integer',
          'field', 'rep_count',
          'index', v_index
        );
        RETURN v_result;
    END;

    -- set_countの存在と型チェック
    IF v_log_data->'set_count' IS NULL THEN
      v_result := jsonb_build_object(
        'success', false,
        'error', 'set_count is required',
        'field', 'set_count',
        'index', v_index
      );
      RETURN v_result;
    END IF;

    IF jsonb_typeof(v_log_data->'set_count') NOT IN ('number', 'string') THEN
      v_result := jsonb_build_object(
        'success', false,
        'error', 'set_count must be a number or numeric string',
        'field', 'set_count',
        'index', v_index
      );
      RETURN v_result;
    END IF;

    -- set_countが整数に変換可能か確認
    BEGIN
      PERFORM (v_log_data->>'set_count')::integer;
    EXCEPTION
      WHEN OTHERS THEN
        v_result := jsonb_build_object(
          'success', false,
          'error', 'set_count must be a valid integer',
          'field', 'set_count',
          'index', v_index
        );
        RETURN v_result;
    END;

    -- distanceの存在と型チェック
    IF v_log_data->'distance' IS NULL THEN
      v_result := jsonb_build_object(
        'success', false,
        'error', 'distance is required',
        'field', 'distance',
        'index', v_index
      );
      RETURN v_result;
    END IF;

    IF jsonb_typeof(v_log_data->'distance') NOT IN ('number', 'string') THEN
      v_result := jsonb_build_object(
        'success', false,
        'error', 'distance must be a number or numeric string',
        'field', 'distance',
        'index', v_index
      );
      RETURN v_result;
    END IF;

    -- distanceが整数に変換可能か確認
    BEGIN
      PERFORM (v_log_data->>'distance')::integer;
    EXCEPTION
      WHEN OTHERS THEN
        v_result := jsonb_build_object(
          'success', false,
          'error', 'distance must be a valid integer',
          'field', 'distance',
          'index', v_index
        );
        RETURN v_result;
    END;

    -- practice_logsを挿入
    -- 修正10: circle (サークルタイム / 総秒数) を追加。任意フィールドのため NULL 安全に変換。
    INSERT INTO practice_logs (
      practice_id,
      user_id,
      style,
      swim_category,
      rep_count,
      set_count,
      distance,
      circle,
      note
    ) VALUES (
      p_practice_id,
      (v_log_data->>'user_id')::uuid,
      v_log_data->>'style',
      v_swim_category,
      (v_log_data->>'rep_count')::integer,
      (v_log_data->>'set_count')::integer,
      (v_log_data->>'distance')::integer,
      CASE
        WHEN v_log_data->'circle' IS NULL OR jsonb_typeof(v_log_data->'circle') = 'null'
          THEN NULL
        ELSE (v_log_data->>'circle')::numeric
      END,
      NULLIF(v_log_data->>'note', '')
    )
    RETURNING id INTO v_practice_log_id;

    -- W-1: 挿入したログIDを insert ループ順に蓄積 (= p_logs_data の順)。
    -- Web の index 突合はこの順序に依存する。
    v_log_ids := array_append(v_log_ids, v_practice_log_id);

    -- practice_timesを挿入（存在する場合）
    IF v_log_data->'practice_times' IS NOT NULL AND jsonb_array_length(v_log_data->'practice_times') > 0 THEN
      FOR v_time_data IN SELECT * FROM jsonb_array_elements(v_log_data->'practice_times')
      LOOP
        INSERT INTO practice_times (
          practice_log_id,
          user_id,
          set_number,
          rep_number,
          time
        ) VALUES (
          v_practice_log_id,
          (v_log_data->>'user_id')::uuid,
          (v_time_data->>'set_number')::integer,
          (v_time_data->>'rep_number')::integer,
          (v_time_data->>'time')::numeric
        );
      END LOOP;
    END IF;

    -- practice_log_tagsを挿入（存在する場合）
    IF v_log_data->'tag_ids' IS NOT NULL AND jsonb_array_length(v_log_data->'tag_ids') > 0 THEN
      FOR v_tag_id IN SELECT value::uuid FROM jsonb_array_elements_text(v_log_data->'tag_ids')
      LOOP
        INSERT INTO practice_log_tags (
          practice_log_id,
          practice_tag_id
        ) VALUES (
          v_practice_log_id,
          v_tag_id
        );
      END LOOP;
    END IF;

    -- インデックスをインクリメント
    v_index := v_index + 1;
  END LOOP;

  -- 成功レスポンスを返す
  -- W-1: log_ids を追加 (既存 success / message は維持: success だけ見る経路は不変)。
  v_result := jsonb_build_object(
    'success', true,
    'message', '練習ログを正常に保存しました',
    'log_ids', to_jsonb(v_log_ids)
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- エラーが発生した場合、ロールバックされ、エラーレスポンスを返す
    v_error_message := SQLERRM;
    v_result := jsonb_build_object(
      'success', false,
      'error', v_error_message
    );
    RETURN v_result;
END;
$function$

;

COMMENT ON FUNCTION public.replace_practice_logs(uuid, jsonb) IS 'practice_logsを原子性のある操作で置き換える。SECURITY DEFINER のため RLS をすり抜けるが、関数本体内で認可ガードを実施する: 個人練習は所有者のみ / チーム練習は active admin のみ、かつ各 user_id は個人=本人 / チーム=active メンバーに限定。anon は実行不可。成功時は挿入したログIDを p_logs_data 順で log_ids 配列として返す (代理動画アップロードの index 突合用)。circle (サークルタイム / 総秒数) は任意フィールドで、未指定時は NULL で保存される。';

REVOKE ALL ON FUNCTION "public"."replace_practice_logs"("uuid", "jsonb") FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."replace_practice_logs"("uuid", "jsonb") TO "authenticated", "service_role";

-- -----------------------------------------------------------------------------
-- 2. request_join_team / reactivate_own_membership
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_join_team(p_invite_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

;

COMMENT ON FUNCTION public.request_join_team(text) IS '招待コードを検証したうえで参加申請(pending)を作成する。SECURITY DEFINER のため RLS をすり抜けるが、
関数内で招待コードの一致・既存メンバーシップの状態(approved/pending/rejected/退会済み)を検証してから
INSERT/UPDATE する。team_memberships への自己 INSERT は RLS で禁止されているため、参加申請は必ずこの
関数を経由する(= 招待コード無しでの pending 行乱造 (#42) を防止)。';

CREATE OR REPLACE FUNCTION public.reactivate_own_membership(p_team_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

;

COMMENT ON FUNCTION public.reactivate_own_membership(uuid) IS '退会済み(approved かつ is_active=false かつ left_at 記録済み)の自分のメンバーシップを再アクティブ化する。
SECURITY DEFINER のため RLS をすり抜けるが、left_at IS NOT NULL を必須にすることで pending 行(left_at=NULL)
からの自己承認スキップ(#38 A2b)を防止する。';

REVOKE ALL ON FUNCTION "public"."request_join_team"("text") FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."reactivate_own_membership"("uuid") FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."request_join_team"("text") TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."reactivate_own_membership"("uuid") TO "authenticated", "service_role";

-- -----------------------------------------------------------------------------
-- 3. team_memberships の UPDATE ポリシー
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update team memberships" ON "public"."team_memberships";
CREATE POLICY "Users can update team memberships" ON "public"."team_memberships" FOR UPDATE
  USING (
    public.is_team_admin(team_id, (SELECT auth.uid()))
    OR user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.teams
      WHERE teams.id = team_memberships.team_id AND teams.created_by = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    public.is_team_admin(team_id, (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.teams
      WHERE teams.id = team_memberships.team_id AND teams.created_by = (SELECT auth.uid())
    )
    -- 本人の更新は退会 (approved のまま is_active=false・left_at 記録) だけ
    OR (
      user_id = (SELECT auth.uid())
      AND role = 'user'
      AND is_active = false
      AND status = 'approved'::public.membership_status_type
      AND left_at IS NOT NULL
      AND public.is_team_member(team_id, (SELECT auth.uid()))
    )
  );

-- -----------------------------------------------------------------------------
-- 4. milestone_achievements の FK
-- -----------------------------------------------------------------------------
UPDATE "public"."milestone_achievements" ma
SET "practice_log_id" = NULL
WHERE ma."practice_log_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "public"."practice_logs" pl WHERE pl."id" = ma."practice_log_id");

UPDATE "public"."milestone_achievements" ma
SET "record_id" = NULL
WHERE ma."record_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "public"."records" r WHERE r."id" = ma."record_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.milestone_achievements'::regclass
      AND conname = 'milestone_achievements_practice_log_id_fkey'
  ) THEN
    ALTER TABLE public.milestone_achievements
      ADD CONSTRAINT milestone_achievements_practice_log_id_fkey
      FOREIGN KEY (practice_log_id) REFERENCES public.practice_logs(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.milestone_achievements'::regclass
      AND conname = 'milestone_achievements_record_id_fkey'
  ) THEN
    ALTER TABLE public.milestone_achievements
      ADD CONSTRAINT milestone_achievements_record_id_fkey
      FOREIGN KEY (record_id) REFERENCES public.records(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. set_published_at (トリガから使われていればここで失敗する。CASCADE は付けない)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS "public"."set_published_at"();
