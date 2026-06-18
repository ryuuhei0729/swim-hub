-- =============================================================================
-- Security fix (C-1): replace_practice_logs に認可ガードを追加
-- =============================================================================
-- 背景:
--   replace_practice_logs は SECURITY DEFINER (owner=postgres) のため RLS を
--   すり抜ける。従来は admin / 所有権 / team_membership のチェックが一切無く、
--   冒頭で DELETE FROM practice_logs WHERE practice_id = p_practice_id を実行し、
--   p_logs_data の各 user_id で任意に再 insert していた。
--   結果、任意の認証ユーザー (および anon キー保持者) が他チームの練習ログを
--   全削除・任意 user_id で捏造可能だった。
--
-- 対策:
--   1. 関数本体冒頭 (DELETE の前) に認可ガードを挿入。
--      - 個人練習 (team_id IS NULL): 呼び出し元が practice 所有者であること。
--      - チーム練習 (team_id IS NOT NULL): 呼び出し元がその team の active admin
--        であること (既存 is_team_admin と同型: is_active=true AND role='admin')。
--   2. p_logs_data の各 user_id が「許可された対象」であることを検証。
--      - 個人練習: 本人 (= 所有者) のみ。
--      - チーム練習: その team の active メンバーのみ
--        (records RLS の代理 INSERT 条件と同型)。
--   3. anon への GRANT を剥奪。authenticated には EXECUTE のみ付与。
--
-- 注意:
--   - 引数シグネチャ・戻り値形状 ({success, message} / {success, error}) は
--     web / mobile の呼び出し側が依存しているため変更しない。
--   - SECURITY DEFINER は維持 (RLS をすり抜けるが、ガードを関数内で実施するため
--     RLS には頼らない)。
--   - 既存の practices 認可パターン (20260616000000) と同型:
--       user_id = auth.uid()  OR  is_team_admin(team_id, auth.uid())
-- =============================================================================

CREATE OR REPLACE FUNCTION "public"."replace_practice_logs"(
  "p_practice_id" "uuid",
  "p_logs_data" "jsonb"
) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    SET search_path = public
    AS $$
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
    INSERT INTO practice_logs (
      practice_id,
      user_id,
      style,
      swim_category,
      rep_count,
      set_count,
      distance,
      note
    ) VALUES (
      p_practice_id,
      (v_log_data->>'user_id')::uuid,
      v_log_data->>'style',
      v_swim_category,
      (v_log_data->>'rep_count')::integer,
      (v_log_data->>'set_count')::integer,
      (v_log_data->>'distance')::integer,
      NULLIF(v_log_data->>'note', '')
    )
    RETURNING id INTO v_practice_log_id;

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
  v_result := jsonb_build_object(
    'success', true,
    'message', '練習ログを正常に保存しました'
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
$$;

ALTER FUNCTION "public"."replace_practice_logs"("p_practice_id" "uuid", "p_logs_data" "jsonb") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."replace_practice_logs"("p_practice_id" "uuid", "p_logs_data" "jsonb") IS 'practice_logsを原子性のある操作で置き換える。SECURITY DEFINER のため RLS をすり抜けるが、関数本体内で認可ガードを実施する: 個人練習は所有者のみ / チーム練習は active admin のみ、かつ各 user_id は個人=本人 / チーム=active メンバーに限定。anon は実行不可。';

-- ===========================================================================
-- 権限の再設定: anon への GRANT を剥奪し、authenticated には EXECUTE のみ付与。
-- service_role は従来どおり (サーバー側の信頼済み呼び出し用)。
-- ===========================================================================
REVOKE ALL ON FUNCTION "public"."replace_practice_logs"("p_practice_id" "uuid", "p_logs_data" "jsonb") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."replace_practice_logs"("p_practice_id" "uuid", "p_logs_data" "jsonb") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."replace_practice_logs"("p_practice_id" "uuid", "p_logs_data" "jsonb") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."replace_practice_logs"("p_practice_id" "uuid", "p_logs_data" "jsonb") TO "service_role";
