-- =============================================================================
-- practice_log_tags を原子性のある操作で置き換える関数
-- 作成日: 2025年11月5日
-- =============================================================================

-- 既存の関数を削除（存在する場合）
DROP FUNCTION IF EXISTS replace_practice_log_tags(UUID, UUID[]);

-- practice_log_tags を置き換える関数
-- この関数は、既存のタグを削除してから新しいタグを挿入する操作を
-- 単一のトランザクション内で実行します
-- SECURITY INVOKER を使用することで、呼び出し元の権限で実行され、
-- 既存のRLSポリシーが適用されます
CREATE OR REPLACE FUNCTION replace_practice_log_tags(
  p_practice_log_id UUID,
  p_tag_ids UUID[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  -- 既存のタグをすべて削除
  DELETE FROM practice_log_tags
  WHERE practice_log_id = p_practice_log_id;
  
  -- 新しいタグを挿入（空の配列の場合は何もしない）
  IF array_length(p_tag_ids, 1) > 0 THEN
    INSERT INTO practice_log_tags (practice_log_id, practice_tag_id)
    SELECT p_practice_log_id, unnest(p_tag_ids);
  END IF;
END;
$$;

-- 関数の説明を追加
COMMENT ON FUNCTION replace_practice_log_tags(UUID, UUID[]) IS 
'practice_log_tags を原子性のある操作で置き換える。既存のタグを削除してから新しいタグを挿入する。';

-- SECURITY INVOKER を使用することで、関数は呼び出し元の権限で実行され、
-- 既存のRLSポリシーが適用されます。これにより、ユーザーは自分の練習記録または
-- 所属チームの練習記録のタグのみを操作できます

-- =============================================================================
-- マイグレーション完了
-- =============================================================================

