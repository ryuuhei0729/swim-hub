-- =============================================================================
-- 種目マスタ (styles) の削除でユーザーの記録・エントリーが消えないようにする
--
-- 変更前: records.style_id / entries.style_id は ON DELETE CASCADE。styles を1行消すと
--   全ユーザーのその種目の記録とエントリーが消える (split_times なども連鎖して消える)。
--   goals.style_id / relay_record_legs.style_id は既に NO ACTION で、扱いが揃っていなかった。
-- 変更後: records / entries も NO ACTION にそろえる。参照されている種目は削除できない。
-- =============================================================================

ALTER TABLE "public"."records" DROP CONSTRAINT "records_style_id_fkey";
ALTER TABLE "public"."records"
  ADD CONSTRAINT "records_style_id_fkey" FOREIGN KEY ("style_id") REFERENCES "public"."styles"("id");

ALTER TABLE "public"."entries" DROP CONSTRAINT "entries_style_id_fkey";
ALTER TABLE "public"."entries"
  ADD CONSTRAINT "entries_style_id_fkey" FOREIGN KEY ("style_id") REFERENCES "public"."styles"("id");
