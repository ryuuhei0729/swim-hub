-- =============================================================================
-- 修正10: replace_practice_logs に circle (サークルタイム / 総秒数) の保存を追加
-- =============================================================================
-- 背景:
--   practice_logs.circle (numeric(10,2), 総秒数) は実在し、本人入力経路は直接
--   insert で circle を保存している。しかし代理一括 (bulk) 経路が使う RPC
--   replace_practice_logs は p_logs_data に circle を含めても INSERT 列に circle が
--   無いため、コーチが代理一括入力したサークルタイムが無音破棄されていた。
--
-- 対策:
--   RPC 本体の最新定義 (log_ids 返却を含む) 20260619000000 を全文ベースにコピーし、
--   CREATE OR REPLACE FUNCTION する。差分は最小:
--     1. INSERT 列に circle を追加。
--     2. VALUES は NULL 安全に変換:
--        CASE WHEN v_log_data->'circle' IS NULL
--               OR jsonb_typeof(v_log_data->'circle') = 'null'
--             THEN NULL
--             ELSE (v_log_data->>'circle')::numeric END
--   circle は任意フィールド (未指定 = NULL)。後方互換: circle を含まない呼び出しは
--   従来どおり circle = NULL で保存される。
--
-- 保持 (20260619000000 から変更しない):
--   - 認可ガード (個人=所有者 / チーム=active admin)。
--   - 事前 user_id 検証ループ (個人=本人 / チーム=active メンバー)。
--   - log_ids の insert ループ順蓄積と成功レスポンスでの返却 (代理動画 index 突合用)。
--   - GRANT / REVOKE (anon 剥奪) / SECURITY DEFINER / OWNER / COMMENT。
--
-- 注意:
--   - 既存 migration (20260618 / 20260619 / 20260620) は改変しない。
--   - 20260620000000 は practice_logs の UPDATE RLS ポリシーであり、関数本体とは別物。
--     関数の最新本体は 20260619000000 のため、本 migration はそれをベースにする。
--   - supabase-schema.ts の Returns は Json のまま型変更不要。
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
$$;

ALTER FUNCTION "public"."replace_practice_logs"("p_practice_id" "uuid", "p_logs_data" "jsonb") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."replace_practice_logs"("p_practice_id" "uuid", "p_logs_data" "jsonb") IS 'practice_logsを原子性のある操作で置き換える。SECURITY DEFINER のため RLS をすり抜けるが、関数本体内で認可ガードを実施する: 個人練習は所有者のみ / チーム練習は active admin のみ、かつ各 user_id は個人=本人 / チーム=active メンバーに限定。anon は実行不可。成功時は挿入したログIDを p_logs_data 順で log_ids 配列として返す (代理動画アップロードの index 突合用)。circle (サークルタイム / 総秒数) は任意フィールドで、未指定時は NULL で保存される。';

-- ===========================================================================
-- 権限の再設定: anon への GRANT を剥奪し、authenticated には EXECUTE のみ付与。
-- service_role は従来どおり (サーバー側の信頼済み呼び出し用)。
-- ===========================================================================
REVOKE ALL ON FUNCTION "public"."replace_practice_logs"("p_practice_id" "uuid", "p_logs_data" "jsonb") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."replace_practice_logs"("p_practice_id" "uuid", "p_logs_data" "jsonb") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."replace_practice_logs"("p_practice_id" "uuid", "p_logs_data" "jsonb") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."replace_practice_logs"("p_practice_id" "uuid", "p_logs_data" "jsonb") TO "service_role";
