-- =============================================================================
-- 大会の水路 (competitions.pool_type) を変更したら、その大会の記録の水路も追従させる
-- =============================================================================
-- 不具合:
--   短水路の大会で記録を登録したあと、大会を長水路に変更しても、記録
--   (records.pool_type / relay_records.pool_type) は短水路のまま残っていた。
--   記録は大会とは別に自前の pool_type 列を持っており、記録の保存時にしか
--   大会の水路が書き込まれないため。大会の基本情報だけを編集する経路
--   (ダッシュボード / 大会一覧 / チーム大会編集 / モバイル) では記録が更新されず、
--   チーム大会では他メンバーの記録は RLS 上そもそもクライアントから更新できない。
--
-- 対応:
--   competitions.pool_type が変わったら、同じ competition_id を持つ records と
--   relay_records の pool_type を DB トリガーで揃える。クライアントの全経路を
--   個別に直すより取りこぼしが無い。
--
-- SECURITY DEFINER にする理由:
--   チーム大会では管理者が大会の水路を変えたとき、他メンバー所有の records も
--   揃える必要があるが、records の UPDATE RLS は本人行しか許さない。
--   トリガーが走るのは competitions の UPDATE が RLS
--   ("Users can update own competitions": 個人大会は所有者 / チーム大会は admin)
--   を通過した後だけなので、その大会に紐づく記録の水路を揃える権限は
--   大会を編集できる人に対して与えて問題ない。更新するのは pool_type のみ。
--
-- relay_records.pool_type には CHECK (pool_type IN (0, 1)) があるため、
-- 万一それ以外の値が大会に入った場合に大会の更新ごと失敗させないよう、
-- relay_records 側は 0/1 のときだけ追従させる。
-- =============================================================================

CREATE OR REPLACE FUNCTION "public"."sync_record_pool_type_with_competition"()
RETURNS "trigger"
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    SET search_path = public
    AS $$
BEGIN
  IF NEW.pool_type IS DISTINCT FROM OLD.pool_type THEN
    UPDATE public.records
       SET pool_type = NEW.pool_type
     WHERE competition_id = NEW.id
       AND pool_type IS DISTINCT FROM NEW.pool_type;

    IF NEW.pool_type IN (0, 1) THEN
      UPDATE public.relay_records
         SET pool_type = NEW.pool_type
       WHERE competition_id = NEW.id
         AND pool_type IS DISTINCT FROM NEW.pool_type;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."sync_record_pool_type_with_competition"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."sync_record_pool_type_with_competition"() IS
  '大会の水路 (competitions.pool_type) 変更時に、その大会の records / relay_records の pool_type を追従させるトリガー関数。competitions の UPDATE RLS を通過した後にのみ走るため SECURITY DEFINER で他メンバーの記録も更新する。';

-- トリガー関数は直接呼び出させない
REVOKE ALL ON FUNCTION "public"."sync_record_pool_type_with_competition"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."sync_record_pool_type_with_competition"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."sync_record_pool_type_with_competition"() FROM "authenticated";

DROP TRIGGER IF EXISTS "competitions_sync_record_pool_type" ON "public"."competitions";
CREATE TRIGGER "competitions_sync_record_pool_type"
  AFTER UPDATE OF "pool_type" ON "public"."competitions"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."sync_record_pool_type_with_competition"();

-- -----------------------------------------------------------------------------
-- 既存データの補正: この不具合で大会と水路がずれたまま残っている記録を揃える
-- -----------------------------------------------------------------------------
UPDATE public.records r
   SET pool_type = c.pool_type
  FROM public.competitions c
 WHERE r.competition_id = c.id
   AND r.pool_type IS DISTINCT FROM c.pool_type
   AND c.pool_type IS NOT NULL;

UPDATE public.relay_records rr
   SET pool_type = c.pool_type
  FROM public.competitions c
 WHERE rr.competition_id = c.id
   AND rr.pool_type IS DISTINCT FROM c.pool_type
   AND c.pool_type IN (0, 1);
