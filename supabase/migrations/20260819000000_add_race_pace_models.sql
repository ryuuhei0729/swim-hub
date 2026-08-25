-- =============================================================================
-- 目標タイムから理想LAPを算出するための LAP統計テーブル (race_pace_models)
-- =============================================================================
--
-- 背景:
--   Result of Swimming (result.swim.or.jp) から収集したレース結果の LAP を
--   条件別に集計し、「目標タイムを入れると理想LAPが出る」機能の元データにする。
--   生データ (レース1本1本) は本番DBには置かず、集計済みの統計のみを保存する。
--   個人を識別できる情報 (選手名/所属) は収集段階で破棄しており、本テーブルにも
--   一切入らない。
--
-- 設計判断:
--   (1) laps を JSONB にした理由
--       参照パターンが「1行取って全LAPをそのまま使う」だけで、LAP単位の検索・
--       集計・結合が発生しない。JSONB なら1往復で済み、再生成も行の置換1回で
--       原子的に終わる (子テーブルだと delete+insert の整合管理が必要)。
--       LAP は順序を持つ固定の値オブジェクトであり、独立した実体ではない。
--       「lap2 の比率を bucket 横断で比較する」ような分析はローカルの DuckDB 層
--       の責務で、本番DBに持たせない。
--       → 本番SQLでLAP単位の検索が必要になった時点で
--         race_pace_model_laps へ正規化する。
--
--   (2) pool_type は records.pool_type と同じ 0=短水路(25m) / 1=長水路(50m)
--       収集側は可読性のため 25|50 で持つが、変換は export 層1箇所に閉じている。
--
--   (3) stroke は styles.style と同じ 'fr'|'br'|'ba'|'fly'|'im'
--       新しい語彙を作らない。リレーは LAP比率の意味が違う (引き継ぎスタート)
--       ため収集段階で除外しており、本テーブルには入らない。
--
--   (4) split_interval を持つ理由
--       Result of Swimming の LAP 粒度は長水路・短水路とも常に 50m で、
--       25m split は存在しない (実測確認済み)。よって当面は常に 50 だが、
--       粒度の違うサンプルが同一グループに混ざると比率が壊れるため、
--       unique 制約のキーに含めておく。後から追加すると unique index の
--       作り直しと全行の再キー付けが必要になり、smallint 1カラムより高くつく。
--
--   (5) min_time_ms / max_time_ms / center_time_ms
--       time bucket の下限・上限 (両端含む) と代表値。
--       center は bucket 間の線形補間の重み付けに使う。
--
-- セキュリティ:
--   本テーブルは全ユーザー共通の参照データ (マスタ相当) であり、
--   authenticated に SELECT のみ許可する。書き込みは service_role
--   (RLS をバイパスする) 経由のバッチのみ。
--   ★ initial_schema.sql:2249-2250 の
--     ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO "anon"
--     ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO "authenticated"
--   により、新規テーブルは作成時点で anon と authenticated の両方に
--   ALL (INSERT/UPDATE/DELETE/**TRUNCATE**/...) が付いてしまう。
--
--   ここで重要なのは **TRUNCATE は RLS の対象外** という点。
--   RLS を有効にして INSERT/UPDATE/DELETE ポリシーを作らなければ
--   行の書き換えは防げるが、TRUNCATE は行レベルではなくテーブルレベルの
--   操作なので RLS を通らず、ログイン済みユーザーがテーブルを丸ごと
--   空にできてしまう (ローカルで実証済み: INSERT は RLS で拒否されるが
--   TRUNCATE は成功した)。
--
--   したがって anon だけでなく **authenticated からも REVOKE ALL** し、
--   必要な SELECT だけを付け直す。
--
-- 冪等性: CREATE TABLE IF NOT EXISTS / DROP POLICY IF EXISTS を使う。
--         REVOKE は未付与でもエラーにならない。
-- =============================================================================

CREATE TABLE IF NOT EXISTS "public"."race_pace_models" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,

    "gender" "text" NOT NULL,
    "pool_type" smallint NOT NULL,
    "stroke" "text" NOT NULL,
    "distance" integer NOT NULL,
    "split_interval" integer DEFAULT 50 NOT NULL,
    "age_category" "text" DEFAULT 'all'::"text" NOT NULL,

    "min_time_ms" integer NOT NULL,
    "max_time_ms" integer NOT NULL,
    "center_time_ms" integer NOT NULL,

    "sample_count" integer NOT NULL,
    "laps" "jsonb" NOT NULL,

    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,

    CONSTRAINT "race_pace_models_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "race_pace_models_gender_check"
        CHECK (("gender" = ANY (ARRAY['male'::"text", 'female'::"text"]))),
    CONSTRAINT "race_pace_models_pool_type_check"
        CHECK (("pool_type" = ANY (ARRAY[0, 1]))),
    CONSTRAINT "race_pace_models_stroke_check"
        CHECK (("stroke" = ANY (ARRAY['fr'::"text", 'br'::"text", 'ba'::"text", 'fly'::"text", 'im'::"text"]))),
    CONSTRAINT "race_pace_models_distance_check" CHECK (("distance" > 0)),
    CONSTRAINT "race_pace_models_split_interval_check" CHECK (("split_interval" > 0)),
    CONSTRAINT "race_pace_models_sample_count_check" CHECK (("sample_count" > 0)),
    -- bucket は [min, max] の閉区間。max < min は集計バグなので弾く
    CONSTRAINT "race_pace_models_time_range_check" CHECK (("min_time_ms" <= "max_time_ms")),
    CONSTRAINT "race_pace_models_center_in_range_check"
        CHECK (("center_time_ms" >= "min_time_ms") AND ("center_time_ms" <= "max_time_ms")),
    -- laps は必ず1件以上の配列
    CONSTRAINT "race_pace_models_laps_is_array_check"
        CHECK (("jsonb_typeof"("laps") = 'array') AND ("jsonb_array_length"("laps") > 0))
);

ALTER TABLE "public"."race_pace_models" OWNER TO "postgres";

COMMENT ON TABLE "public"."race_pace_models" IS
    '目標タイムから理想LAPを算出するための LAP統計。個人情報は含まない。書き込みは service_role のバッチのみ。';
COMMENT ON COLUMN "public"."race_pace_models"."pool_type" IS '0: 短水路(25m), 1: 長水路(50m) — records.pool_type と同一';
COMMENT ON COLUMN "public"."race_pace_models"."stroke" IS 'styles.style と同一 (fr/br/ba/fly/im)。リレーは含まない';
COMMENT ON COLUMN "public"."race_pace_models"."split_interval" IS 'LAP粒度(m)。Result of Swimming は常に 50';
COMMENT ON COLUMN "public"."race_pace_models"."age_category" IS '既定 all。学種別に分ける場合のみ 小学/中学/高校/大学/一般 等';
COMMENT ON COLUMN "public"."race_pace_models"."min_time_ms" IS 'time bucket の下限 (含む)';
COMMENT ON COLUMN "public"."race_pace_models"."max_time_ms" IS 'time bucket の上限 (含む)';
COMMENT ON COLUMN "public"."race_pace_models"."laps" IS
    '[{distance, ratioMedian, ratioP25, ratioP75, ratioMean, lapTimeMeanMs, lapTimeMedianMs}, ...] を距離昇順で保持';

-- 同一条件の bucket は1行だけ (再生成を冪等な upsert にするための自然キー)
CREATE UNIQUE INDEX IF NOT EXISTS "race_pace_models_natural_key_idx"
    ON "public"."race_pace_models"
    ("gender", "pool_type", "stroke", "distance", "split_interval", "age_category", "min_time_ms");

-- generateTargetLaps の検索: 条件で絞ってから目標タイムを含む bucket を引く
CREATE INDEX IF NOT EXISTS "race_pace_models_lookup_idx"
    ON "public"."race_pace_models"
    ("gender", "pool_type", "stroke", "distance", "age_category", "min_time_ms", "max_time_ms");

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE "public"."race_pace_models" ENABLE ROW LEVEL SECURITY;

-- 参照は全ログインユーザーに許可 (共通マスタ)
DROP POLICY IF EXISTS "Authenticated users can read race pace models" ON "public"."race_pace_models";
CREATE POLICY "Authenticated users can read race pace models"
    ON "public"."race_pace_models"
    FOR SELECT
    TO "authenticated"
    USING (true);

-- INSERT/UPDATE/DELETE ポリシーは意図的に作らない。
-- RLS 有効かつポリシー無しなので authenticated は書き込めず、
-- service_role は RLS をバイパスするためバッチのみが書き込める。

-- -----------------------------------------------------------------------------
-- 権限 (default privileges 由来の GRANT ALL を打ち消す)
-- -----------------------------------------------------------------------------
-- TRUNCATE は RLS を通らないため、authenticated からも必ず剥がす。
REVOKE ALL ON TABLE "public"."race_pace_models" FROM "anon";
REVOKE ALL ON TABLE "public"."race_pace_models" FROM "authenticated";

-- 参照だけ付け直す
GRANT SELECT ON TABLE "public"."race_pace_models" TO "authenticated";

-- バッチ投入用
GRANT ALL ON TABLE "public"."race_pace_models" TO "service_role";
