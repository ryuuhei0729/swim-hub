-- =============================================================================
-- リレーのチーム記録テーブル (relay_records / relay_record_legs)
-- =============================================================================
--
-- 型契約: apps/shared/types/relayRecord.ts (PM 確定)。この DDL は同ファイルの
-- `RelayRecord` / `RelayRecordLeg` と 1:1 対応する。フィールドの追加・削除は
-- 型契約側と同時に行うこと。
--
-- 【なぜ新しいテーブルが必要か】
--   現状リレー1本は `records` の個別4行として保存され、DB 全体で relay に関係する
--   列は `records.is_relaying` / `entries.is_relaying` の boolean 2つだけ。組を
--   識別する ID も第N泳者の情報も総合タイムの列も無い。読み取り時に
--   「created_at 昇順で4行連続 かつ is_relaying が [false,true,true,true] かつ
--   style_id の組が RELAY_EVENTS に一致」というヒューリスティック
--   (apps/web/.../records/_client/buildStyleEntries.ts の Phase 1) で復元している。
--   このため:
--     - 取得順に依存する。ランキングは ORDER BY time で引くので4連続の並びが崩れ、
--       別チームの泳者が混ざった架空の総合タイムが算出される (エラーは出ない)
--     - 同一大会に2チーム出すと8行がインターリーブして誤ペアリングする
--     - 3人/5人の変則編成は4連続前提なので崩れる
--     - 総合タイムがレグの単純和しか表現できず、公式記録とのズレを持てない
--   よってリレー1本を1行として持つテーブルを新設し、`records` の既存4行は
--   **置換せず上に被せる** (個人の「引き継ぎありベストタイム」機能を壊さない)。
--
-- 【なぜ relay_event_id 列を持たないか】
--   `RelayEventId` の列挙は apps/shared/utils/relayEvents.ts が唯一の定義元で、
--   これを DB の CHECK 制約に写すと「shared の型 / DB CHECK」の二重管理になる
--   (CLAUDE.md「同一のドメイン対応表を2箇所にハードコードするな」)。
--   DB は分解済みの事実 (`relay_kind` + `leg_distance`) だけを持ち、書き込み時に
--   shared の `fromRelayEventId()` が `RelayEventId` をこの2列へ分解する。
--   逆方向 (この2列から `RelayEventId` を復元する関数) は**用意していない**。
--   ランキング表示は `relay_kind` / `leg_distance` をそのまま i18n の
--   `teams.ranking.relay.eventLabel` に流し込むため、`RelayEventId` を経由する
--   必要が無く、呼び出し元が 0 件だったので削除した。必要になった時点で
--   `apps/shared/utils/relayEvents.ts` に追加すること
--   (この2列があれば復元は一意に決まる。列を増やす理由にはならない)。
--
-- 実装規約:
--   先例は 20260819000000_add_race_pace_models.sql。
--   CREATE TABLE IF NOT EXISTS / DROP POLICY IF EXISTS で冪等にし、
--   REVOKE は未付与でもエラーにならない。
--   **本 migration は DDL と REVOKE/GRANT のみ。既存データを書き換える DML
--   (INSERT/UPDATE/DELETE/TRUNCATE) は一切含まない。**
--   既存の `is_relaying` records からの移行は
--   `scripts/backfill-relay-records.ts` (dry-run 付き) で別途行う。
--
-- デプロイ順序:
--   新規テーブルの追加のみで既存のテーブル・関数・データに触れないため順序不問。
--   ただしアプリ側の保存処理はこのテーブルの存在を前提にするため
--   「migration 先 → コード後」で出すこと。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- relay_records: リレー1本 = 1行
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."relay_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,

    "team_id" "uuid" NOT NULL,
    "competition_id" "uuid",

    "relay_kind" "text" NOT NULL,
    "leg_distance" integer NOT NULL,
    "leg_count" smallint DEFAULT 4 NOT NULL,
    "pool_type" smallint NOT NULL,
    "gender_category" "text" NOT NULL,

    "total_time" numeric(10,2) NOT NULL,

    -- 既定値を auth.uid() にしている理由:
    --   クライアントは created_by を送らない。送らせるとクライアントの認証 state
    --   (React の AuthProvider) が真であることに依存してしまい、state が未ハイドレート
    --   なだけで「保存できたのに誰が入れたか分からない」状態が生まれる。
    --   JWT の subject が唯一の真実なので DB 側で埋める。
    --   service_role のバッチ (scripts/backfill-relay-records.ts) では auth.uid() が
    --   NULL になるため NULL が入る。**NOT NULL にしてはいけない** (バックフィルが
    --   「誰か1人の管理者」を代表として詰め込む設計になり、その1人の退会で
    --   全リレー記録が道連れになる)。
    "created_by" "uuid" DEFAULT "auth"."uid"(),

    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),

    CONSTRAINT "relay_records_pkey" PRIMARY KEY ("id"),

    -- チームを消したらそのチームのリレー記録も消す (チーム記録なので個人には残らない)
    CONSTRAINT "relay_records_team_id_fkey" FOREIGN KEY ("team_id")
        REFERENCES "public"."teams"("id") ON DELETE CASCADE,
    -- 大会に紐づかないリレー記録も許容する (列は nullable のまま) が、
    -- **大会を削除したらその大会のリレー記録も削除する**。
    -- SET NULL にすると到達不能なゴースト行が残る: 記録入力画面は
    -- `.eq("competition_id", competitionId)` で引くので競技が消えた行には
    -- 永久に到達できず、リレー記録の削除 UI も存在しない。一方 RPC は
    -- competition_id IS NULL の行を意図的に含めるため、ランキングには
    -- 「大会: なし」で出続ける。既存の「大会削除で紐づく records も削除」という
    -- 製品挙動 (delete_competition_with_records) とも整合させる。
    CONSTRAINT "relay_records_competition_id_fkey" FOREIGN KEY ("competition_id")
        REFERENCES "public"."competitions"("id") ON DELETE CASCADE,
    -- 🚨 ON DELETE CASCADE にしてはいけない。
    --   public.users.id は auth.users(id) ON DELETE CASCADE を持つので、
    --   **管理者1人が退会機能を使うだけで、その人が代理入力した全チーム・全大会の
    --   リレー記録が他メンバーの区間タイムごと消える** (エラーも履歴も残らない。
    --   ローカル実測で relay_records 1行 → 0行、relay_record_legs 2行 → 0行)。
    --   スキーマ内の他の created_by 5本 (announcements / competitions / practices /
    --   teams / team_groups) はすべて SET NULL であり、そちらに揃える。
    --   この列は RLS の判定に使っておらず、消す理由が無い。
    --   下の relay_record_legs.user_id を「行を消すとリレー1本が3レグに欠ける」
    --   理由で SET NULL にしているのと同じ判断。
    CONSTRAINT "relay_records_created_by_fkey" FOREIGN KEY ("created_by")
        REFERENCES "public"."users"("id") ON DELETE SET NULL,

    CONSTRAINT "relay_records_relay_kind_check"
        CHECK (("relay_kind" = ANY (ARRAY['free'::"text", 'medley'::"text"]))),
    -- ★ records.pool_type には CHECK が無く 0/1 以外の異常値が理論上存在しうる。
    --   新表では必ず張る (ランキングの水路バケツに異常値が混ざるのを防ぐ)。
    CONSTRAINT "relay_records_pool_type_check"
        CHECK (("pool_type" = ANY (ARRAY[0, 1]))),
    CONSTRAINT "relay_records_gender_category_check"
        CHECK (("gender_category" = ANY (ARRAY['male'::"text", 'female'::"text", 'mixed'::"text"]))),
    CONSTRAINT "relay_records_leg_distance_check" CHECK (("leg_distance" > 0)),
    CONSTRAINT "relay_records_leg_count_check" CHECK (("leg_count" BETWEEN 2 AND 8)),
    CONSTRAINT "relay_records_total_time_check" CHECK (("total_time" > 0))
);

ALTER TABLE "public"."relay_records" OWNER TO "postgres";

COMMENT ON TABLE "public"."relay_records" IS
    'リレー1本を1行で持つチーム記録。records の is_relaying 4行は置換せず上に被せる (個人の引き継ぎありベストタイム機能を壊さないため)。relay_event_id 列は持たない: apps/shared/utils/relayEvents.ts の RelayEventId 列挙を DB の CHECK に写すと二重管理になるため、書き込み時に fromRelayEventId() が relay_kind × leg_distance へ分解する。逆方向の復元関数は呼び出し元が無いので用意していないが、この2列があれば一意に決まる。';

COMMENT ON COLUMN "public"."relay_records"."relay_kind" IS
    'free | medley。apps/shared/types/relayRecord.ts の RelayKind と同一。leg_distance と対で RelayEventId を一意に決める';
COMMENT ON COLUMN "public"."relay_records"."leg_distance" IS
    '1レグの距離(m)。25/50/100/200。合計距離ではない (合計は leg_distance * leg_count)';
COMMENT ON COLUMN "public"."relay_records"."leg_count" IS
    'レグ数。公式リレーは4だが3人/5人の変則編成も表現できるようにしている';
COMMENT ON COLUMN "public"."relay_records"."pool_type" IS
    '0: 短水路(25m), 1: 長水路(50m) — records.pool_type と同一。ランキングは厳密一致で絞るため正規化しない';
COMMENT ON COLUMN "public"."relay_records"."gender_category" IS
    'male | female | mixed。users.gender からの導出ではなく保存値。導出にするとメンバーがプロフィールの性別を変えたとき過去のリレー記録が黙って別区分へ移動し、user_id が退会で SET NULL になると導出そのものが不能になる。書き込み時に4レグの gender から prefill する';
COMMENT ON COLUMN "public"."relay_records"."total_time" IS
    '公式の総合タイム(秒)。relay_record_legs.leg_time の総和と一致するのが正常だが、**総和ではなくこの保存値を正とする** (公式記録が総和と 1/100 秒ずれる場合があるため)。SUM() で再計算して上書きしないこと';
COMMENT ON COLUMN "public"."relay_records"."competition_id" IS
    '紐づく大会。大会削除で ON DELETE CASCADE でこの行も消える (SET NULL にすると記録入力画面から到達できないゴースト行がランキングに残るため)。NULL 可なのは大会に紐づかないリレー記録を将来許容するため';
COMMENT ON COLUMN "public"."relay_records"."created_by" IS
    '入力した管理者の users.id。既定値は auth.uid() で、クライアントは送らない (クライアントの認証 state に依存させない)。service_role のバッチ (バックフィル) では auth.uid() が NULL なので NULL が入る = 入力者不明。退会時は ON DELETE SET NULL で、チーム記録としての行は残す。RLS の判定には使わない (判定は team_id 側の管理者述語で行う)';

-- -----------------------------------------------------------------------------
-- relay_record_legs: 1レグ = 1行。第N泳者 = leg_index + 1
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."relay_record_legs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,

    "relay_record_id" "uuid" NOT NULL,
    "leg_index" smallint NOT NULL,
    "user_id" "uuid",
    "style_id" integer NOT NULL,

    "leg_time" numeric(10,2) NOT NULL,
    "reaction_time" numeric(10,2),

    "record_id" "uuid",

    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),

    CONSTRAINT "relay_record_legs_pkey" PRIMARY KEY ("id"),

    CONSTRAINT "relay_record_legs_relay_record_id_fkey" FOREIGN KEY ("relay_record_id")
        REFERENCES "public"."relay_records"("id") ON DELETE CASCADE,
    -- 退会時はレグの泳者だけを NULL 化し、チーム記録としての行は残す
    CONSTRAINT "relay_record_legs_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "public"."users"("id") ON DELETE SET NULL,
    CONSTRAINT "relay_record_legs_style_id_fkey" FOREIGN KEY ("style_id")
        REFERENCES "public"."styles"("id"),
    -- 元になった records 行を消してもリレー記録は残す
    CONSTRAINT "relay_record_legs_record_id_fkey" FOREIGN KEY ("record_id")
        REFERENCES "public"."records"("id") ON DELETE SET NULL,

    -- leg_count の上限 8 に合わせる (0-based なので 0..7)
    CONSTRAINT "relay_record_legs_leg_index_check"
        CHECK (("leg_index" >= 0) AND ("leg_index" < 8)),
    CONSTRAINT "relay_record_legs_leg_time_check" CHECK (("leg_time" > 0)),
    -- 同じリレーに同じ第N泳者が2行existしない
    CONSTRAINT "relay_record_legs_relay_record_id_leg_index_key"
        UNIQUE ("relay_record_id", "leg_index")
);

ALTER TABLE "public"."relay_record_legs" OWNER TO "postgres";

COMMENT ON TABLE "public"."relay_record_legs" IS
    'リレーの1レグ = 1行。第N泳者 = leg_index + 1。親 relay_records の削除で CASCADE 削除される。';

COMMENT ON COLUMN "public"."relay_record_legs"."leg_index" IS
    '0-based。第N泳者 = leg_index + 1。これまで TypeScript 上にしか存在しなかった情報を永続化する';
COMMENT ON COLUMN "public"."relay_record_legs"."user_id" IS
    '泳者の users.id。退会時は ON DELETE SET NULL でチーム記録の行は残す (行を消すとリレー1本が3レグに欠ける)';
COMMENT ON COLUMN "public"."relay_record_legs"."style_id" IS
    'そのレグの個人種目 styles.id。メドレーリレーでは4レグで別々の値になる (背→平→バタ→自)';
COMMENT ON COLUMN "public"."relay_record_legs"."leg_time" IS
    '区間タイム(秒)。**通算タイムではない。** 通算は apps/shared/utils/relayEvents.ts の calcCumulativeTimes() で導出する。過去に通算値が混入して lap が崩れた前科があるので、ここに通算値を入れないこと';
COMMENT ON COLUMN "public"."relay_record_legs"."reaction_time" IS
    '反応時間(秒)。第2泳者以降は引き継ぎなので records.reaction_time と同じ意味';
COMMENT ON COLUMN "public"."relay_record_legs"."record_id" IS
    '元になった records 行。既存の is_relaying records は置換せず上に被せるため、個人の引き継ぎありベストタイム機能を壊さない。scripts/backfill-relay-records.ts の冪等性判定にも使う';

-- -----------------------------------------------------------------------------
-- updated_at 自動更新トリガー (既存表と同じ update_updated_at_column を踏襲)
--
-- 実測: initial_schema.sql:1354-1399 で announcements/competitions/entries/
-- practice_logs/records/split_times/team_memberships/teams/users 等が
-- `BEFORE UPDATE ... FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()`
-- を付けている。同じ規約に合わせる。
-- CREATE TRIGGER に IF NOT EXISTS が無いので DROP TRIGGER IF EXISTS を前置する。
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "update_relay_records_updated_at" ON "public"."relay_records";
CREATE TRIGGER "update_relay_records_updated_at"
    BEFORE UPDATE ON "public"."relay_records"
    FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

DROP TRIGGER IF EXISTS "update_relay_record_legs_updated_at" ON "public"."relay_record_legs";
CREATE TRIGGER "update_relay_record_legs_updated_at"
    BEFORE UPDATE ON "public"."relay_record_legs"
    FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

-- -----------------------------------------------------------------------------
-- インデックス
-- -----------------------------------------------------------------------------
-- ランキングのクエリ形状:
--   WHERE team_id = ? AND relay_kind = ? AND leg_distance = ? AND pool_type = ?
--         [AND gender_category = ?]
--   ORDER BY total_time ASC
--
-- 列順は「常に等値で絞る4列 → 任意で等値になる1列 → 並び替えの1列」。
-- ⚠️ ORDER BY までインデックスで解決できるのは gender_category を**指定した場合だけ**。
--    既定の gender_category = NULL (すべて) では gender_category が範囲スキャンに
--    なるため total_time は index order で出てこず、ソートが別途必要になる
--    (プレフィックス4列での絞り込みには効く)。「常に ORDER BY まで解決できる」と
--    書くのは誤りなので、そう読めるコメントを置かないこと。
--    NULL 指定時も index order を得たいなら
--    (team_id, relay_kind, leg_distance, pool_type, total_time) を別に張る必要が
--    あるが、1チームの1種目の行数は多くても数十なので現時点では過剰。
CREATE INDEX IF NOT EXISTS "relay_records_ranking_idx"
    ON "public"."relay_records"
    ("team_id", "relay_kind", "leg_distance", "pool_type", "gender_category", "total_time");

-- 大会詳細から「この大会のリレー記録」を引く。
-- 大会削除時の ON DELETE **CASCADE** の逆引き (どの relay_records を消すか) にも
-- 効くのでインデックス自体は必要。SET NULL ではないので文言を取り違えないこと。
CREATE INDEX IF NOT EXISTS "relay_records_competition_id_idx"
    ON "public"."relay_records" ("competition_id");

-- 親 → 子の取得 (leg_index 昇順で並べる)
CREATE INDEX IF NOT EXISTS "relay_record_legs_relay_record_id_idx"
    ON "public"."relay_record_legs" ("relay_record_id", "leg_index");

-- 「このメンバーが出たリレー」の逆引き (退会時の SET NULL にも効く)
CREATE INDEX IF NOT EXISTS "relay_record_legs_user_id_idx"
    ON "public"."relay_record_legs" ("user_id");

-- バックフィルの冪等性判定 (record_id を参照する行が既にあるか) と
-- records 削除時の SET NULL
CREATE INDEX IF NOT EXISTS "relay_record_legs_record_id_idx"
    ON "public"."relay_record_legs" ("record_id");

-- =============================================================================
-- RLS
-- =============================================================================
-- 🚨 既存の public.is_team_member() / public.is_team_admin() は使わない。
--    実測 (initial_schema.sql:165-178, 212-227) で両者とも `is_active = true`
--    しか見ておらず `status` を見ていない。参加申請は招待コードさえあれば誰でも
--    作れる (request_join_team) ので、is_active だけを条件にすると承認待ち
--    (status='pending') の申請者にチームのリレー記録が見えてしまう。
--    第1弾の RPC get_team_record_rankings (20260907000000) と同じ
--    「status='approved' AND is_active IS TRUE」の述語をインラインで書く。
--
--    team_memberships.is_active は boolean NULL 許容 (DEFAULT true) のため
--    `= true` ではなく `IS TRUE` で書く (NULL を除外する意図の明示)。
-- =============================================================================

ALTER TABLE "public"."relay_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."relay_record_legs" ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- relay_records: SELECT はチームメンバー、書き込みはチーム管理者
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Team members can view relay records" ON "public"."relay_records";
CREATE POLICY "Team members can view relay records"
    ON "public"."relay_records"
    FOR SELECT
    TO "authenticated"
    USING (
        EXISTS (
            SELECT 1
            FROM "public"."team_memberships" tm
            WHERE tm."team_id" = "relay_records"."team_id"
              AND tm."user_id" = (SELECT "auth"."uid"())
              AND tm."status" = 'approved'::"public"."membership_status_type"
              AND tm."is_active" IS TRUE
        )
    );

DROP POLICY IF EXISTS "Team admins can insert relay records" ON "public"."relay_records";
CREATE POLICY "Team admins can insert relay records"
    ON "public"."relay_records"
    FOR INSERT
    TO "authenticated"
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM "public"."team_memberships" tm
            WHERE tm."team_id" = "relay_records"."team_id"
              AND tm."user_id" = (SELECT "auth"."uid"())
              AND tm."role" = 'admin'
              AND tm."status" = 'approved'::"public"."membership_status_type"
              AND tm."is_active" IS TRUE
        )
    );

DROP POLICY IF EXISTS "Team admins can update relay records" ON "public"."relay_records";
CREATE POLICY "Team admins can update relay records"
    ON "public"."relay_records"
    FOR UPDATE
    TO "authenticated"
    USING (
        EXISTS (
            SELECT 1
            FROM "public"."team_memberships" tm
            WHERE tm."team_id" = "relay_records"."team_id"
              AND tm."user_id" = (SELECT "auth"."uid"())
              AND tm."role" = 'admin'
              AND tm."status" = 'approved'::"public"."membership_status_type"
              AND tm."is_active" IS TRUE
        )
    )
    -- USING だけでは「他チームの team_id へ付け替える UPDATE」を防げない
    -- (USING は更新前の行、WITH CHECK は更新後の行に効く)
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM "public"."team_memberships" tm
            WHERE tm."team_id" = "relay_records"."team_id"
              AND tm."user_id" = (SELECT "auth"."uid"())
              AND tm."role" = 'admin'
              AND tm."status" = 'approved'::"public"."membership_status_type"
              AND tm."is_active" IS TRUE
        )
    );

DROP POLICY IF EXISTS "Team admins can delete relay records" ON "public"."relay_records";
CREATE POLICY "Team admins can delete relay records"
    ON "public"."relay_records"
    FOR DELETE
    TO "authenticated"
    USING (
        EXISTS (
            SELECT 1
            FROM "public"."team_memberships" tm
            WHERE tm."team_id" = "relay_records"."team_id"
              AND tm."user_id" = (SELECT "auth"."uid"())
              AND tm."role" = 'admin'
              AND tm."status" = 'approved'::"public"."membership_status_type"
              AND tm."is_active" IS TRUE
        )
    );

-- -----------------------------------------------------------------------------
-- relay_record_legs: 親の team_id を EXISTS でたどる (split_times と同型)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Team members can view relay record legs" ON "public"."relay_record_legs";
CREATE POLICY "Team members can view relay record legs"
    ON "public"."relay_record_legs"
    FOR SELECT
    TO "authenticated"
    USING (
        EXISTS (
            SELECT 1
            FROM "public"."relay_records" rr
            JOIN "public"."team_memberships" tm ON tm."team_id" = rr."team_id"
            WHERE rr."id" = "relay_record_legs"."relay_record_id"
              AND tm."user_id" = (SELECT "auth"."uid"())
              AND tm."status" = 'approved'::"public"."membership_status_type"
              AND tm."is_active" IS TRUE
        )
    );

DROP POLICY IF EXISTS "Team admins can insert relay record legs" ON "public"."relay_record_legs";
CREATE POLICY "Team admins can insert relay record legs"
    ON "public"."relay_record_legs"
    FOR INSERT
    TO "authenticated"
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM "public"."relay_records" rr
            JOIN "public"."team_memberships" tm ON tm."team_id" = rr."team_id"
            WHERE rr."id" = "relay_record_legs"."relay_record_id"
              AND tm."user_id" = (SELECT "auth"."uid"())
              AND tm."role" = 'admin'
              AND tm."status" = 'approved'::"public"."membership_status_type"
              AND tm."is_active" IS TRUE
              -- 🚨 レグの泳者 (user_id) がそのチームの team_memberships に行を
              -- 持つことを要求する。これが無いと、チーム管理者が **任意の user_id** を
              -- レグに入れられ、SECURITY DEFINER の get_team_relay_rankings が
              -- users を JOIN するため **非メンバーの本名がランキングに露出する**
              -- (実測: 素の users SELECT は RLS で0行なのに RPC 経由では本名が返った)。
              -- 返す列の allowlist は、行の母集団が拘束されていなければ意味を持たない。
              --
              -- ⚠️ status / is_active は条件に含めない。退会は MembersAPI.leave() /
              --    remove() が is_active=false に更新して**行を残す**実装なので、
              --    含めると退会者を含む過去のリレーを編集保存できなくなり、
              --    レグ1本が入らずリレーが3レグに欠ける。
              --    述語は「team_memberships に行が存在するか」だけ。
              --
              -- この条件は EXISTS の**内側**に置く必要がある (rr がこのサブクエリの
              -- スコープにしか存在しないため。外に出すと
              -- `missing FROM-clause entry for table "rr"` で CREATE POLICY が落ちる)。
              AND (
                  "relay_record_legs"."user_id" IS NULL
                  OR EXISTS (
                      SELECT 1
                      FROM "public"."team_memberships" tm2
                      WHERE tm2."team_id" = rr."team_id"
                        AND tm2."user_id" = "relay_record_legs"."user_id"
                  )
              )
        )
    );

DROP POLICY IF EXISTS "Team admins can update relay record legs" ON "public"."relay_record_legs";
CREATE POLICY "Team admins can update relay record legs"
    ON "public"."relay_record_legs"
    FOR UPDATE
    TO "authenticated"
    USING (
        EXISTS (
            SELECT 1
            FROM "public"."relay_records" rr
            JOIN "public"."team_memberships" tm ON tm."team_id" = rr."team_id"
            WHERE rr."id" = "relay_record_legs"."relay_record_id"
              AND tm."user_id" = (SELECT "auth"."uid"())
              AND tm."role" = 'admin'
              AND tm."status" = 'approved'::"public"."membership_status_type"
              AND tm."is_active" IS TRUE
        )
    )
    -- WITH CHECK は更新**後**の行に効く。ここにも泳者の所属条件を置かないと、
    -- UPDATE で user_id を非メンバーに書き換える経路が残る (INSERT だけ塞いでも無意味)。
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM "public"."relay_records" rr
            JOIN "public"."team_memberships" tm ON tm."team_id" = rr."team_id"
            WHERE rr."id" = "relay_record_legs"."relay_record_id"
              AND tm."user_id" = (SELECT "auth"."uid"())
              AND tm."role" = 'admin'
              AND tm."status" = 'approved'::"public"."membership_status_type"
              AND tm."is_active" IS TRUE
              -- 🚨 レグの泳者 (user_id) がそのチームの team_memberships に行を
              -- 持つことを要求する。これが無いと、チーム管理者が **任意の user_id** を
              -- レグに入れられ、SECURITY DEFINER の get_team_relay_rankings が
              -- users を JOIN するため **非メンバーの本名がランキングに露出する**
              -- (実測: 素の users SELECT は RLS で0行なのに RPC 経由では本名が返った)。
              -- 返す列の allowlist は、行の母集団が拘束されていなければ意味を持たない。
              --
              -- ⚠️ status / is_active は条件に含めない。退会は MembersAPI.leave() /
              --    remove() が is_active=false に更新して**行を残す**実装なので、
              --    含めると退会者を含む過去のリレーを編集保存できなくなり、
              --    レグ1本が入らずリレーが3レグに欠ける。
              --    述語は「team_memberships に行が存在するか」だけ。
              --
              -- この条件は EXISTS の**内側**に置く必要がある (rr がこのサブクエリの
              -- スコープにしか存在しないため。外に出すと
              -- `missing FROM-clause entry for table "rr"` で CREATE POLICY が落ちる)。
              AND (
                  "relay_record_legs"."user_id" IS NULL
                  OR EXISTS (
                      SELECT 1
                      FROM "public"."team_memberships" tm2
                      WHERE tm2."team_id" = rr."team_id"
                        AND tm2."user_id" = "relay_record_legs"."user_id"
                  )
              )
        )
    );

DROP POLICY IF EXISTS "Team admins can delete relay record legs" ON "public"."relay_record_legs";
CREATE POLICY "Team admins can delete relay record legs"
    ON "public"."relay_record_legs"
    FOR DELETE
    TO "authenticated"
    USING (
        EXISTS (
            SELECT 1
            FROM "public"."relay_records" rr
            JOIN "public"."team_memberships" tm ON tm."team_id" = rr."team_id"
            WHERE rr."id" = "relay_record_legs"."relay_record_id"
              AND tm."user_id" = (SELECT "auth"."uid"())
              AND tm."role" = 'admin'
              AND tm."status" = 'approved'::"public"."membership_status_type"
              AND tm."is_active" IS TRUE
        )
    );

-- =============================================================================
-- 権限 (default privileges 由来の GRANT ALL を打ち消す)
-- =============================================================================
-- ★ initial_schema.sql:2249-2250 の
--     ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO "anon"
--     ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO "authenticated"
--   により、新規テーブルは作成時点で anon と authenticated の両方に
--   ALL (INSERT/UPDATE/DELETE/**TRUNCATE**/...) が付いてしまう。
--
--   **TRUNCATE は RLS の対象外** (行レベルではなくテーブルレベルの操作) なので、
--   RLS ポリシーを書いただけではログイン済みユーザーがテーブルを丸ごと空に
--   できてしまう (20260819000000 でローカル実証済み)。
--   したがって anon だけでなく authenticated からも REVOKE ALL し、
--   必要な DML 権限だけを付け直す (TRUNCATE は付けない)。
REVOKE ALL ON TABLE "public"."relay_records" FROM "anon";
REVOKE ALL ON TABLE "public"."relay_records" FROM "authenticated";
REVOKE ALL ON TABLE "public"."relay_record_legs" FROM "anon";
REVOKE ALL ON TABLE "public"."relay_record_legs" FROM "authenticated";

-- 行レベルの可否は上の RLS ポリシーが決める。ここでは TRUNCATE を含まない
-- 4つの DML だけを付け直す。
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."relay_records" TO "authenticated";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."relay_record_legs" TO "authenticated";

-- バックフィルスクリプト (scripts/backfill-relay-records.ts) 用
GRANT ALL ON TABLE "public"."relay_records" TO "service_role";
GRANT ALL ON TABLE "public"."relay_record_legs" TO "service_role";
