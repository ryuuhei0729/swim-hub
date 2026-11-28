-- =============================================================================
-- 使われていないテーブル・列を削除し、テンプレートのタグ ID が宙に浮かないようにする
--
-- 1. user_sessions: 認証は Supabase Auth が担っており、どのアプリからも読み書きされていない
--    (本番0行、2026-11-28 確認)。created_at_ts / updated_at_ts という重複列まであった。
-- 2. practice_log_tags.updated_at: 中間テーブルの行は追加と削除しかされず、更新されない。
--    列・更新トリガ・インデックスを削除する。
-- 3. practice_log_templates.tag_ids (uuid[]): 配列なので FK が効かず、タグを削除すると
--    存在しない ID が残っていた。タグ削除時に配列から外すトリガを付け、既存の宙に浮いた ID も消す。
-- 4. generate_weekly_usage_report の除外リスト: user_sessions を外し、
--    20261201000001 で作った user_secrets (集計しない秘密の値) を入れる。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. user_sessions
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS "public"."user_sessions";

-- -----------------------------------------------------------------------------
-- 2. practice_log_tags.updated_at
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "update_practice_log_tags_updated_at" ON "public"."practice_log_tags";
DROP INDEX IF EXISTS "public"."idx_practice_log_tags_updated_at";
ALTER TABLE "public"."practice_log_tags" DROP COLUMN IF EXISTS "updated_at";

-- -----------------------------------------------------------------------------
-- 3. practice_log_templates.tag_ids
-- -----------------------------------------------------------------------------
UPDATE "public"."practice_log_templates" t
SET "tag_ids" = COALESCE(
  (SELECT array_agg(tag_id ORDER BY ord)
   FROM unnest(t."tag_ids") WITH ORDINALITY AS u(tag_id, ord)
   WHERE EXISTS (SELECT 1 FROM "public"."practice_tags" pt WHERE pt."id" = u.tag_id)),
  '{}'::uuid[])
WHERE EXISTS (
  SELECT 1 FROM unnest(t."tag_ids") AS u(tag_id)
  WHERE NOT EXISTS (SELECT 1 FROM "public"."practice_tags" pt WHERE pt."id" = u.tag_id)
);

CREATE OR REPLACE FUNCTION "public"."remove_deleted_tag_from_templates"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public
    AS $$
BEGIN
  UPDATE public.practice_log_templates
  SET tag_ids = array_remove(tag_ids, OLD.id)
  WHERE user_id = OLD.user_id
    AND OLD.id = ANY (tag_ids);
  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION "public"."remove_deleted_tag_from_templates"() IS
  'practice_tags の AFTER DELETE トリガ。持ち主のテンプレートの tag_ids から削除されたタグを外す';

REVOKE ALL ON FUNCTION "public"."remove_deleted_tag_from_templates"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE TRIGGER "remove_deleted_tag_from_templates"
  AFTER DELETE ON "public"."practice_tags"
  FOR EACH ROW EXECUTE FUNCTION "public"."remove_deleted_tag_from_templates"();

-- -----------------------------------------------------------------------------
-- 4. 週次レポートの除外リスト
--    分類の定義元はこの関数の中の定数配列だけなので、関数を作り直す。本体を写すと
--    別の migration が同じ関数を変えたときに上書きしてしまうため、現在の定義の該当箇所だけを置き換える。
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_old text := pg_get_functiondef('public.generate_weekly_usage_report(date)'::regprocedure);
  v_new text;
BEGIN
  v_new := replace(
    v_old,
    $q$'processed_webhook_events', 'contact_rate_limit_daily_usage', 'user_sessions',$q$,
    $q$'processed_webhook_events', 'contact_rate_limit_daily_usage', 'user_secrets',$q$
  );
  IF v_new = v_old THEN
    RAISE EXCEPTION 'generate_weekly_usage_report の除外リストが想定の形ではありません。migration を見直してください';
  END IF;
  EXECUTE v_new;
END;
$$;
