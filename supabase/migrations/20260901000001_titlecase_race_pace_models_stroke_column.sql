-- =============================================================================
-- race_pace_models.stroke をタイトルケースに統一 (GitHub Issue #13 追補)
-- =============================================================================
--
-- 背景:
--   20260901000000 で styles.style をタイトルケースに移行した際、
--   apps/shared/utils/racePace/types.ts の `Stroke` 型を `SwimStyle`
--   (タイトルケース) の型エイリアスに統一した。ところが race_pace_models
--   テーブルは別の CHECK 制約 (race_pace_models_stroke_check,
--   20260819000000_add_race_pace_models.sql:89-90) で独立に
--   'fr'|'br'|'ba'|'fly'|'im' (小文字) を強制しており、そちらは未移行のまま
--   だった。結果、TypeScript の `Stroke` 型はタイトルケースを主張するのに
--   DB の実データは小文字のまま、という「型と実データの意味的な乖離」が
--   生まれる (検出手段は apps/shared/api/racePaceModels.ts の
--   unchecked cast (`row.stroke as Stroke`) しかなく、tsc では検出できない)。
--   これは今スプリントが解消しようとしている「静かな乖離」そのものであるため、
--   PM 裁定により race_pace_models 側も同じ移行を行う。
--
--   20260819000000_add_race_pace_models.sql:26 と :108 のコメント
--   (「stroke は styles.style と同じ 'fr'|'br'|'ba'|'fly'|'im'」) は
--   適用済み migration のため書き換えない。本ファイルでその記述が
--   古くなったことを明示し、本ファイル側の COMMENT ON COLUMN で
--   最新の値集合を上書きする。
--
-- 投入経路:
--   race_pace_models への書き込みは service_role のバッチのみ
--   (result-of-swimming/src/export/toSupabase.ts が
--   INSERT ... ON CONFLICT で投入する)。ローカル dev DB は0行だが、
--   本番に投入済みの行が存在する可能性があるため、0行でも N行でも
--   安全に動く UPDATE ... WHERE stroke = '<旧値>' の形にする
--   (DELETE/TRUNCATE は使わない)。
--
-- デプロイ順序について (styles 側 20260901000000 の訂正と同じ注意が必要):
--   apps/shared/api/racePaceModels.ts の getModels は stroke の絞り込みを
--   .eq から .ilike (大文字小文字非依存) に変更済みだが、これが救うのは
--   「新コード (ilike 版) × 旧データ (小文字)」の組み合わせのみ。逆方向の
--   「旧コード (.eq 版) × 新データ (本 migration 適用後のタイトルケース)」は
--   救えず、旧コードは 0 件・エラーなしで静かに理想LAP検索に失敗する。
--   正しい手順は「アプリケーションコード (ilike 版) を100%ロールアウトして
--   から本 migration を適用する」順序を厳守すること。ilike 化は移行期の
--   暫定措置であり恒久固定ではない。result-of-swimming の投入コードが
--   完全にタイトルケースへ追従したことを確認できたら .eq に戻す選択肢がある。
--
-- 冪等性・トランザクション境界:
--   20260901000000 と同型: DROP → UPDATE (5文、0件ヒットでも安全) → ADD を
--   1トランザクションに収める。途中で失敗した場合に CHECK 制約が存在しない
--   中間状態が残らないようにする。再実行しても (既にタイトルケースの行に
--   対しては) 0件更新になるだけで安全に繰り返し適用できる。
--
-- スコープ外:
--   result-of-swimming/ 側のコード修正 (src/parser/enums.ts の
--   STROKE_BY_CODE 等、小文字を前提にした投入元コード) は別 Developer の
--   担当であり、本 migration には含めない。DB 側の値集合を先にタイトルケースへ
--   倒すため、result-of-swimming が小文字のまま次回バッチ投入すると
--   CHECK 制約違反で INSERT が失敗するようになる (サイレントに壊れるより安全)。
-- =============================================================================

BEGIN;

ALTER TABLE "public"."race_pace_models" DROP CONSTRAINT IF EXISTS "race_pace_models_stroke_check";

UPDATE "public"."race_pace_models" SET "stroke" = 'Fr' WHERE "stroke" = 'fr';
UPDATE "public"."race_pace_models" SET "stroke" = 'Br' WHERE "stroke" = 'br';
UPDATE "public"."race_pace_models" SET "stroke" = 'Ba' WHERE "stroke" = 'ba';
UPDATE "public"."race_pace_models" SET "stroke" = 'Fly' WHERE "stroke" = 'fly';
UPDATE "public"."race_pace_models" SET "stroke" = 'IM' WHERE "stroke" = 'im';

ALTER TABLE "public"."race_pace_models"
  ADD CONSTRAINT "race_pace_models_stroke_check"
  CHECK (("stroke" = ANY (ARRAY['Fr'::"text", 'Br'::"text", 'Ba'::"text", 'Fly'::"text", 'IM'::"text"])));

COMMENT ON COLUMN "public"."race_pace_models"."stroke" IS
    'styles.style と同一 (Fr/Br/Ba/Fly/IM)。Issue #13 でタイトルケースに統一 (20260901000001)。リレーは含まない';

COMMIT;
