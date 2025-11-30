-- =============================================================================
-- マイグレーション: 練習ログの原子性のある置き換えRPC関数
-- 問題: 編集モードで既存データを削除してから新規作成する際、作成が失敗するとデータ損失が発生する
-- 解決: トランザクション内で削除と挿入を実行するRPC関数を作成
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
BEGIN
  -- トランザクション開始（関数全体が自動的にトランザクション内で実行される）
  
  -- 既存のpractice_logsと関連データを削除
  -- CASCADEにより、practice_timesとpractice_log_tagsも自動削除される
  DELETE FROM practice_logs
  WHERE practice_id = p_practice_id;
  
  -- 新しいログデータを挿入
  FOR v_log_data IN SELECT * FROM jsonb_array_elements(p_logs_data)
  LOOP
    -- practice_logsを挿入
    INSERT INTO practice_logs (
      practice_id,
      user_id,
      style,
      rep_count,
      set_count,
      distance,
      note
    ) VALUES (
      p_practice_id,
      (v_log_data->>'user_id')::uuid,
      v_log_data->>'style',
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

COMMENT ON FUNCTION "public"."replace_practice_logs"("p_practice_id" "uuid", "p_logs_data" "jsonb") IS 'practice_logsを原子性のある操作で置き換える。既存のログを削除してから新しいログを挿入する。トランザクション内で実行されるため、エラー時は自動的にロールバックされる。';

