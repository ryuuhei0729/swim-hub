-- =============================================================================
-- practice_logs.style の既存小文字行をタイトルケースへ backfill (Issue #13 追補)
-- =============================================================================
--
-- 背景:
--   practice_logs.style は CHECK 制約の無い自由記述 text 列。書き込み側の
--   コードパスは修正済み (別 Developer 担当) だが、修正前に書き込まれた
--   既存行 (小文字 'fr'/'br'/'ba'/'fly'/'im') が残っている可能性があり、
--   Reviewer が具体的な破損経路を特定した:
--     - 一覧のフィルタが Set<string> に正規化せず投入するため
--       "Fr" と "fr" が別フィルタとして重複表示される
--     - getStyleOrderIndex("fr") が -1 を返し、ソート時に末尾へ弾かれる
--     - i18n は styles.Fr しか無いため t("styles.fr") が翻訳できない
--
-- 実測 (ローカル dev DB, 2026-09-01):
--   稼働中のローカル DB は practice_logs が 0 行 (supabase/config.toml の
--   [db.seed] enabled = false により db reset 時に seed が自動投入されないため)。
--   リポジトリ内の supabase/seed.sql (config.toml が指す唯一の seed ファイル) の
--   practice_logs INSERT を確認したところ、実データは2行のみでいずれも既に
--   'Fr' (タイトルケース) だった。想定外の値 (日本語・空文字・"freestyle" 等) は
--   見つかっていない。
--
--   別途、apps/mobile/scripts/screenshots/seed-demo.sh が投入する
--   supabase/test-data-2025.sql (デモ/ステージング用、本番とは別プロジェクト) は
--   practice_logs.style に日本語 ('自由形'/'平泳ぎ'/'背泳ぎ'/'バタフライ'/
--   '個人メドレー') を書き込む設計になっている。これは小文字5種とは全く別の
--   語彙であり、想定外の値としてここに記録するのみに留め、本 migration では
--   一切変換しない (対象は小文字5種のみ)。デモ/ステージング環境で該当する
--   語彙統一が必要かどうかは PM/QA が別途判断すること。
--
--   本番 DB の分布は未確認 (アクセス権限が無い)。以下の UPDATE は 0件でも
--   N件でも安全に動作する形にしてあるため、本番の実際の分布に依存せず適用できる。
--
-- 制約は追加しない:
--   practice_logs.style は自由記述という設計であり、CHECK 制約を足すのは
--   本スプリントのスコープを超える。かつ、上記の日本語行のように小文字5種
--   以外の値が実在しうる状況で CHECK を足すと migration 自体が失敗する。
--
-- 破壊的操作は含まない:
--   DELETE/TRUNCATE は使わない。対象は "style = '<小文字5種の1つ>'" に
--   完全一致する行のみの UPDATE。日本語・空文字・その他未知の値の行は
--   条件にマッチせず素通りする (触らない)。
--
-- 冪等性・トランザクション境界:
--   20260901000000/20260901000001 と同型: 単一トランザクションで
--   UPDATE (5文、0件ヒットでも安全) のみを行う。再実行しても
--   (既にタイトルケースの行に対しては) 0件更新になるだけで安全に繰り返し適用できる。
-- =============================================================================

BEGIN;

UPDATE "public"."practice_logs" SET "style" = 'Fr' WHERE "style" = 'fr';
UPDATE "public"."practice_logs" SET "style" = 'Br' WHERE "style" = 'br';
UPDATE "public"."practice_logs" SET "style" = 'Ba' WHERE "style" = 'ba';
UPDATE "public"."practice_logs" SET "style" = 'Fly' WHERE "style" = 'fly';
UPDATE "public"."practice_logs" SET "style" = 'IM' WHERE "style" = 'im';

COMMIT;
