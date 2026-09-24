-- =============================================================================
-- team_memberships.is_swimmer カラム追加マイグレーション (Issue #49)
-- =============================================================================
-- 「泳者として登録しない」チェックボックス用。true = 泳者 (既定)、false = 非泳者。
-- 非泳者はベストタイム一覧本体・大会エントリー候補・練習記録入力候補から除外される
-- (除外処理自体は apps/shared/utils/swimmerFilter.ts に集約、本 migration の範囲外)。
--
-- DEFAULT true のみで完結させる設計であり、バックフィル DML は書かない。
-- 既存メンバーは migration 適用後も全員 is_swimmer=true (泳者) のままになる。
--
-- RLS は変更しない。既存の管理者向け UPDATE 枝は列を限定していないため、
-- is_swimmer の管理者更新は追加の RLS 変更なしで通る。自己脱退枝への便乗変更
-- (Issue #50 スコープ) は今回は行わない。
-- =============================================================================

ALTER TABLE "public"."team_memberships"
ADD COLUMN IF NOT EXISTS "is_swimmer" boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN "public"."team_memberships"."is_swimmer" IS '泳者フラグ。false の場合、ベストタイム一覧本体・大会エントリー候補・練習記録入力候補から除外される (出欠確認には引き続き表示)。DEFAULT true のため既存メンバーは全員泳者のまま。';
