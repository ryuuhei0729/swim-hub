-- swim_category_enum型を作成
CREATE TYPE "public"."swim_category_enum" AS ENUM ('Swim', 'Pull', 'Kick');

-- practice_logsテーブルにswim_categoryカラムを追加
ALTER TABLE "public"."practice_logs"
ADD COLUMN IF NOT EXISTS "swim_category" "public"."swim_category_enum" DEFAULT 'Swim' NOT NULL;

-- 既存データにデフォルト値'Swim'を設定（念のため）
UPDATE "public"."practice_logs"
SET "swim_category" = 'Swim'
WHERE "swim_category" IS NULL;

-- コメントを追加
COMMENT ON COLUMN "public"."practice_logs"."swim_category" IS '泳法カテゴリ: Swim=通常泳法, Pull=プル, Kick=キック';

-- replace_practice_logs関数を更新
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
BEGIN
  -- トランザクション開始（関数全体が自動的にトランザクション内で実行される）
  
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
  
  -- 既存のpractice_logsと関連データを削除
  -- CASCADEにより、practice_timesとpractice_log_tagsも自動削除される
  DELETE FROM practice_logs
  WHERE practice_id = p_practice_id;
  
  -- 新しいログデータを挿入
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

COMMENT ON FUNCTION "public"."replace_practice_logs"("p_practice_id" "uuid", "p_logs_data" "jsonb") IS 'practice_logsを原子性のある操作で置き換える。既存のログを削除してから新しいログを挿入する。トランザクション内で実行されるため、エラー時は自動的にロールバックされる。swim_categoryフィールドをサポート。';

