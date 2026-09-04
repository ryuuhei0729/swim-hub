-- =============================================================================
-- styles.style をタイトルケースに統一 (GitHub Issue #13)
-- =============================================================================
--
-- 背景:
--   styles.style は現在 'fr'|'br'|'ba'|'fly'|'im' (小文字) の CHECK 制約を持つ。
--   一方、practice_logs.style (CHECK 制約なし・自由記述) は既に "Fr"/"Ba"/"Br"/
--   "Fly"/"IM" (タイトルケース) で格納されており、種目コードのケーシングが
--   ドメインをまたいで矛盾していた (Issue #13)。人間の裁定によりタイトルケースに
--   統一する。
--
--   対象は styles テーブルの 22 行の固定マスターデータのみ。records.style_id /
--   entries.style_id は styles.id への integer FK であり、styles.style の
--   文字列値そのものを外部から参照しているユーザーデータは存在しない
--   (styles テーブルへの実行時 INSERT/UPDATE も存在しない。全アクセスは
--   .select() のみ)。よってこの migration は 22 行のマスター行を書き換えるだけで、
--   records/entries 側のデータには一切触れず、1件も壊れない。
--
-- 破壊的操作は含まない:
--   DELETE/TRUNCATE は使わない。既存 22 行を UPDATE で書き換えるのみ。
--   既存の initial_schema.sql (シード) は書き換えず、本ファイルで差分を表現する。
--
-- デプロイ順序について (訂正: Reviewer 指摘により、当初「順序不問」としていた
-- 記述は誤りだったため訂正する):
--   アプリケーションコード側 (apps/shared/api/goals.ts, apps/shared/api/styles.ts)
--   は styles.style の絞り込みを .eq から .ilike (大文字小文字非依存) に変更済み。
--   ただしこれが救うのは「新コード (ilike 版) × 旧データ (小文字)」の組み合わせ
--   のみである。ilike は大文字小文字を無視するため、新コードが送る値
--   ("Fr" 等) は旧データ ("fr" 等) にもマッチする。
--
--   逆方向の「旧コード (このコミット以前の .eq(..., toLowerCase()) 版) ×
--   新データ (本 migration 適用後のタイトルケース)」は救えない。旧コードは
--   小文字 ("fr") で問い合わせるため、タイトルケースに変換済みの行
--   ("Fr") とは一致せず、エラーも出ないまま 0 件を返す (milestone 達成判定・
--   種目別絞り込みが静かに機能しなくなる)。
--
--   したがって正しいデプロイ手順は「アプリケーションコード (ilike 版) を
--   100% ロールアウトしてから本 migration を適用する」順序を厳守すること。
--   逆順 (migration を先に適用してからコードをデプロイする) は採用しない。
--   ilike 化は移行期の暫定措置であり恒久固定ではない。旧コードが本番から
--   完全に消えたことを確認できたら .eq に戻し、インデックス効率を回復する
--   選択肢がある。
--
-- 冪等性・トランザクション境界:
--   DROP → UPDATE → ADD を1トランザクションに収め、途中で失敗した場合に
--   「CHECK 制約が存在しない」中間状態が残らないようにする。UPDATE は
--   WHERE style = '<旧値>' 方式で対象を絞っているため、再実行しても
--   (既にタイトルケースになっている行に対しては) 0件更新になるだけで安全に
--   繰り返し適用できる。
-- =============================================================================

BEGIN;

ALTER TABLE "public"."styles" DROP CONSTRAINT IF EXISTS "styles_style_check";

UPDATE "public"."styles" SET "style" = 'Fr' WHERE "style" = 'fr';
UPDATE "public"."styles" SET "style" = 'Br' WHERE "style" = 'br';
UPDATE "public"."styles" SET "style" = 'Ba' WHERE "style" = 'ba';
UPDATE "public"."styles" SET "style" = 'Fly' WHERE "style" = 'fly';
UPDATE "public"."styles" SET "style" = 'IM' WHERE "style" = 'im';

ALTER TABLE "public"."styles"
  ADD CONSTRAINT "styles_style_check"
  CHECK (("style" = ANY (ARRAY['Fr'::"text", 'Br'::"text", 'Ba'::"text", 'Fly'::"text", 'IM'::"text"])));

COMMIT;
