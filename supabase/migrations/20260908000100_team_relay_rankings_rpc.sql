-- =============================================================================
-- チームリレーランキング RPC: get_team_relay_rankings
-- =============================================================================
-- 背景:
--   第1弾の get_team_record_rankings (20260907000000) と**同型**のリレー版。
--   relay_records / relay_record_legs の SELECT RLS は「承認済みかつアクティブな
--   チームメンバー」に限定されているため、素の SELECT でもチーム内のリレー記録は
--   読める。それでも RPC にする理由は3つある:
--     (1) レグの泳者名・アバターを出すには users を JOIN する必要があるが、
--         users の SELECT RLS は「自分」と「アクティブなチームを共有する相手」に
--         限られ、**退会したメンバー** (user_id は SET NULL されないが
--         team_memberships が is_active=false になる) の名前が読めなくなる。
--         リレーは過去のチーム記録なので、当時のメンバーの名前は表示したい。
--     (2) 返す列を allowlist で固定でき、レグの泳者名をチームのメンバーに縛れる。
--     (3) 第1弾と同じ呼び出し形状・同じ認可述語に揃えられる。
--
-- 実装規約:
--   get_team_record_rankings に倣う:
--   SECURITY DEFINER + SET search_path = public + 関数冒頭の認証・認可ガード +
--   REVOKE ALL FROM PUBLIC, anon + GRANT EXECUTE TO authenticated, service_role。
--
--   本 migration は関数定義 (DDL) と REVOKE/GRANT のみ。既存データを書き換える
--   DML (INSERT/UPDATE/DELETE/TRUNCATE) は一切含まない。
--
-- 情報露出の設計 (SECURITY DEFINER なので「返さない列」が防御線になる):
--   RETURNS TABLE の11列だけを返す。特に以下は意図的に返さない。
--     - relay_records.created_by (誰が代理入力したかは表示に不要)
--     - users.birthday / bio / google_calendar_refresh_token
--     - users.profile_image_path (ラップ表示はプロフィール画像を出さない。
--       表示しない列を返すと private バケットの相対パスだけが誰にも読まれずに
--       露出し続けるため、legs の jsonb_build_object から落としてある。
--       再び表示するならキーを1つ足すだけで戻せる)
--   レグ (泳者名・区間タイム・反応時間) は行を展開したときのラップ表示に必要なので
--   JSONB 配列 legs にまとめて返す。**通算タイムは返さない** —
--   apps/shared/utils/relayEvents.ts の calcCumulativeTimes() で導出する
--   (通算を DB や API に二重で持つと leg_time との整合を別途保つ必要が出る)。
--
-- なぜ集計モードの引数を持たないか:
--   第1弾は「1メンバー1行」(personalBest) と「全レース」(allRaces) を
--   p_aggregation で切り替えるが、リレーには「1チーム1行」の概念が無い
--   (同じチームが同じ種目で複数本泳ぐのが普通で、畳み込む単位が無い)。
--   当初 'teamBest' (最速1本) を用意したが、ROW_NUMBER() に PARTITION が無いため
--   p_gender_category = NULL (既定) では male/female/mixed をまたいで最速1本だけを
--   返し、「そのチームの最速」の意味が壊れていた (実測: male 205.00 が残り
--   mixed 210.00 が消えた)。UI から切り替える経路も 0 件の到達不能コードだったため
--   引数ごと削除した。性別区分ごとの最速を出すなら
--   PARTITION BY gender_category を含めて別途設計する。
--
-- デプロイ順序:
--   relay_records / relay_record_legs (20260908000000) の後。
--   同一の migration list で順序が保証される。
-- =============================================================================

-- 旧シグネチャ (p_aggregation を持つ 8 引数版) の掃除。
-- CREATE OR REPLACE は引数リストが違うと「置換」ではなく**別のオーバーロード**を
-- 作るため、両方が残って PostgREST の呼び出しが曖昧になる。
-- 未適用の環境では何もしない (IF EXISTS)。
DROP FUNCTION IF EXISTS "public"."get_team_relay_rankings"("uuid", "text", integer, smallint, "text", "text", integer, integer);

CREATE OR REPLACE FUNCTION "public"."get_team_relay_rankings"(
  "p_team_id"         "uuid",
  "p_relay_kind"      "text",
  "p_leg_distance"    integer,
  "p_pool_type"       smallint,
  "p_gender_category" "text"   DEFAULT NULL,
  "p_fiscal_year"     integer  DEFAULT NULL,
  "p_limit"           integer  DEFAULT 50
) RETURNS TABLE (
  "relay_record_id"   "uuid",
  "relay_kind"        "text",
  "leg_distance"      integer,
  "leg_count"         smallint,
  "pool_type"         smallint,
  "gender_category"   "text",
  "total_time"        numeric,
  "competition_id"    "uuid",
  "competition_title" "text",
  "competition_date"  "date",
  "relay_created_at"  timestamp with time zone,
  "legs"              "jsonb"
)
    LANGUAGE "plpgsql"
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $$
DECLARE
  v_caller uuid;
  v_limit integer;
BEGIN
  -- ---------------------------------------------------------------------------
  -- 認証ガード: 未認証は拒否する
  -- ---------------------------------------------------------------------------
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 入力値ガード
  --
  -- ⚠️ NULL を必ず先に弾くこと。SQL の三値論理では
  --   `NULL NOT IN ('free', 'medley')` は FALSE ではなく **NULL** で、
  --   plpgsql の IF は NULL を偽として扱うためガードを素通りしてしまう
  --   (第1弾で実測済み)。その結果 p_relay_kind := NULL は
  --   `rr.relay_kind = NULL` としてどの行にもマッチせず「エラーではなく空の
  --   ランキング」に化ける。
  -- ---------------------------------------------------------------------------
  IF p_relay_kind IS NULL OR p_relay_kind NOT IN ('free', 'medley') THEN
    RAISE EXCEPTION 'invalid relay_kind: %', COALESCE(p_relay_kind, 'NULL');
  END IF;

  -- p_gender_category は NULL が「すべて」の意味を持つ**唯一の**引数。
  -- よって NULL は許すが、非 NULL の未知値は弾く (静かに 0 件を返さない)。
  --
  -- 🚨 **NULL は現在 UI からは到達しない。死んだ分岐ではない。**
  -- 第4弾で `RelayRankingGenderFilter` (apps/shared/types/teamRelayRanking.ts) から
  -- `all` を削除し、UI は男子/女子/混合の3択になったため必ず非 NULL が来る。
  -- 将来「すべて」を戻すとき migration を要らなくするための意図的な保持である。
  -- pgTAP V-DB-64h (`NULL は例外にしない`) がこの「NULL を弾かない」性質を
  -- 検証しているので、NULL を弾く形に変えないこと
  -- (supabase/tests/12_team_relay_rankings_rpc.test.sql)。
  IF p_gender_category IS NOT NULL
     AND p_gender_category NOT IN ('male', 'female', 'mixed') THEN
    RAISE EXCEPTION 'invalid gender_category: %', p_gender_category;
  END IF;

  -- 絞り込みの軸そのものが NULL の場合も例外にする。
  -- `rr.leg_distance = NULL` / `rr.pool_type = NULL` はどの行にもマッチしないため、
  -- 放置すると呼び出し側のバグ (引数の渡し漏れ・undefined の混入) が
  -- 「エラーではなく空のランキング」に化けて気付けない。
  IF p_leg_distance IS NULL THEN
    RAISE EXCEPTION 'p_leg_distance is required';
  END IF;

  IF p_pool_type IS NULL THEN
    RAISE EXCEPTION 'p_pool_type is required';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 認可ガード: 呼び出し元が p_team_id の「承認済みかつアクティブな」メンバーであること。
  --
  -- 既存の public.is_team_member() は使わない。あれは is_active しか見ておらず
  -- status を見ないため、承認待ち (status='pending') の申請者まで通ってしまう。
  -- 参加申請は招待コードさえあれば誰でも作れる (request_join_team) ので、
  -- is_active だけを条件にするとチーム管理者の承認前にチームのリレー記録が
  -- 見えてしまう。relay_records の SELECT ポリシーと同一の述語にする。
  --
  -- team_memberships.is_active は boolean NULL 許容 (DEFAULT true) のため
  -- `= true` ではなく `IS TRUE` で書く。
  -- ---------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1
    FROM public.team_memberships tm
    WHERE tm.team_id = p_team_id
      AND tm.user_id = v_caller
      AND tm.status = 'approved'::public.membership_status_type
      AND tm.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'not an approved active member of the team';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 件数上限: 負数・0・巨大値・NULL でも例外にせずクランプする
  -- ---------------------------------------------------------------------------
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);

  RETURN QUERY
  WITH base AS (
    SELECT
      rr.id              AS relay_record_id,
      rr.relay_kind      AS relay_kind,
      rr.leg_distance    AS leg_distance,
      rr.leg_count       AS leg_count,
      rr.pool_type       AS pool_type,
      rr.gender_category AS gender_category,
      rr.total_time      AS total_time,
      c.id               AS competition_id,
      c.title            AS competition_title,
      c.date             AS competition_date,
      rr.created_at      AS relay_created_at
    FROM public.relay_records rr
      -- competitions は LEFT JOIN。competition_id IS NULL のリレー記録を
      -- 落とさないため。ここを INNER JOIN にするとそれらが静かに 0 件になる。
      --
      -- ⚠️ **現状 competition_id IS NULL の行を生む経路は 0 件である。**
      --    アプリ (RecordClient / TeamRecordBulkFormScreen) は常に大会 id を送り、
      --    バックフィルは competition_id が NULL のグループを推測せずスキップし、
      --    FK は ON DELETE **CASCADE** なので大会削除で NULL 化されることもない
      --    (以前 SET NULL だったため「大会削除で NULL 化された行」を含める、と
      --     書いていたがその経路は消滅した)。
      --    したがってこの LEFT JOIN は「大会に紐づかないリレー記録を直接入力する」
      --    機能 (第4弾以降) のための**予約**である。予約を撤回するなら
      --    competition_id NOT NULL 化と TeamRelayRankingRecord.relayCreatedAt の
      --    撤去まで一緒に倒すこと (片方だけ残すと死んだ分岐になる)。
      LEFT JOIN public.competitions c ON c.id = rr.competition_id
    WHERE rr.team_id = p_team_id
      AND rr.relay_kind = p_relay_kind
      AND rr.leg_distance = p_leg_distance
      -- 水路は厳密一致。relay_records.pool_type には CHECK (0,1) を張ってあるが、
      -- CASE WHEN pool_type = 1 THEN 1 ELSE 0 END のような正規化はしない
      -- (第1弾と同じ方針。異常値が片方のバケツに静かに混入するのを防ぐ)。
      AND rr.pool_type = p_pool_type
      -- p_gender_category IS NULL は「すべての性別区分」を意味する。
      --
      -- 🚨 **この NULL 分岐は現在 UI からは到達しない。削除しないこと。**
      -- 理由と保持の根拠は上の引数バリデーション部のコメントと同じ。
      -- pgTAP V-DB-64i (`NULL は male/female/mixed を区別せず全部返す`) が
      -- この枝の挙動そのものを検証している。
      AND (p_gender_category IS NULL OR rr.gender_category = p_gender_category)
      -- 年度 (日本の年度: 4/1〜翌3/31)。判定には competitions.date を使い
      -- relay_records.created_at は使わない (登録日は実施日ではない)。
      -- 大会に紐づかない記録は年度が決まらないので、p_fiscal_year 指定時は
      -- c.date が NULL となり述語が NULL → 除外される (それが正しい挙動)。
      AND (
        p_fiscal_year IS NULL
        OR (
          c.date >= make_date(p_fiscal_year, 4, 1)
          AND c.date <= make_date(p_fiscal_year + 1, 3, 31)
        )
      )
  )
  SELECT
    x.relay_record_id,
    x.relay_kind,
    x.leg_distance,
    x.leg_count,
    x.pool_type,
    x.gender_category,
    x.total_time,
    x.competition_id,
    x.competition_title,
    x.competition_date,
    x.relay_created_at,
    -- レグは leg_index 昇順の JSONB 配列で返す。
    -- 行が展開されたときのラップ表示 (区間タイム + 通算) に使う。
    -- **通算タイムは含めない** — calcCumulativeTimes() で導出する
    -- (DB に二重保存しないのが本スプリントの設計)。
    -- レグが 0 件のリレー記録 (親だけ残った異常データ) でも行を落とさないよう
    -- COALESCE で空配列にする。
    COALESCE(
      (
        -- 並び順は必ず数値の leg_index で決める。
        -- `ORDER BY leg->>'legIndex'` (JSONB からの text 抽出) にすると
        -- 文字列比較になり、レグ数が2桁に増えた瞬間 "10" < "2" で静かに崩れる。
        SELECT jsonb_agg(legs_src.leg ORDER BY legs_src.leg_index ASC)
        FROM (
          SELECT
            l.leg_index AS leg_index,
            jsonb_build_object(
              'legId',        l.id,
              'legIndex',     l.leg_index,
              'userId',       l.user_id,
              'displayName',  u.name,
              'styleId',      l.style_id,
              'style',        s.style,
              'legTime',      l.leg_time,
              'reactionTime', l.reaction_time
            ) AS leg
          FROM public.relay_record_legs l
            -- 泳者は退会で user_id が SET NULL されうるので LEFT JOIN。
            -- レグの行自体は残す (4レグが3レグに欠けると通算が壊れる)。
            --
            -- 🚨 ここが SECURITY DEFINER で users を読む唯一の箇所であり、
            --    **行の母集団を team_memberships で縛らないと任意ユーザーの本名が
            --    露出する** (実測: 素の users SELECT は RLS で0行なのに、
            --    非メンバーの user_id を持つレグを入れると RPC 経由で本名が返った)。
            --    第1弾の get_team_record_rankings は
            --    `JOIN team_member m ON m.user_id = r.user_id` で母集団を縛っていた。
            --    返す列の allowlist は母集団が拘束されていなければ意味を持たない。
            --    所属条件は LEFT JOIN の ON 句に置く。非メンバーの user_id を持つ
            --    レグは **行が落ちるのではなく displayName が NULL になる**
            --    (レグ自体を落とすと通算タイムの積み上げがずれる)。
            --
            --    ⚠️ この JOIN は **u.name (displayName) のためにまだ必要**である。
            --    profile_image_path は legs から落としたが、u を使う列が
            --    displayName 1つに減っただけで JOIN と EXISTS の所属条件は
            --    引き続き露出の防御線そのものなので外さないこと。
            --
            -- ⚠️ status / is_active は条件に含めない。退会は MembersAPI.leave() /
            --    remove() が is_active=false に更新して team_memberships の行を
            --    **残す**実装なので、含めると退会したメンバーの名前が過去の
            --    チーム記録から消える。述語は「行が存在するか」だけ。
            LEFT JOIN public.users u
              ON u.id = l.user_id
             AND EXISTS (
                   SELECT 1
                   FROM public.team_memberships tm_leg
                   WHERE tm_leg.team_id = p_team_id
                     AND tm_leg.user_id = l.user_id
                 )
            JOIN public.styles s ON s.id = l.style_id
          WHERE l.relay_record_id = x.relay_record_id
        ) legs_src
      ),
      '[]'::jsonb
    ) AS legs
  FROM base x
  -- 並びは total_time → 大会日 → id で決定的にする。
  -- (同着の同順位付与は表示側の assignCompetitionRanks が行う)
  ORDER BY x.total_time ASC, x.competition_date ASC NULLS LAST, x.relay_record_id ASC
  LIMIT v_limit;
END;
$$;

ALTER FUNCTION "public"."get_team_relay_rankings"("p_team_id" "uuid", "p_relay_kind" "text", "p_leg_distance" integer, "p_pool_type" smallint, "p_gender_category" "text", "p_fiscal_year" integer, "p_limit" integer) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_team_relay_rankings"("p_team_id" "uuid", "p_relay_kind" "text", "p_leg_distance" integer, "p_pool_type" smallint, "p_gender_category" "text", "p_fiscal_year" integer, "p_limit" integer) IS
  'チームのリレー記録 (relay_records) を 種類 × 1レグ距離 × 水路 [× 性別区分] で総合タイムの速い順に並べて返す。p_gender_category = NULL は「すべての性別区分」を意味するが、**現在の UI からは到達しない** (男子/女子/混合の3択で必ず非 NULL を渡す)。将来「すべて」を戻すとき migration を 要らなくするための意図的な保持であり、pgTAP V-DB-64h / V-DB-64i が検証しているので削除しないこと。集計モードの引数は持たない (リレーには「1チーム1行」の概念が無く、常に全レースを列挙する)。SECURITY DEFINER で users の RLS をバイパスするため (退会メンバーの名前を当時のチーム記録として表示するため)、(1) 呼び出し元が承認済みかつアクティブなチームメンバーであることを関数内で検証し、(2) レグの泳者名を p_team_id の team_memberships に行を持つユーザーに限定し (非メンバーの user_id は displayName が NULL になる)、(3) 返す列を11列 + legs に限定している (relay_records.created_by、users.birthday/bio/google_calendar_refresh_token/profile_image_path は返さない。プロフィール画像はラップ表示に出さないため legs に avatarPath を含めない)。レグの通算タイムは返さない (apps/shared/utils/relayEvents.ts の calcCumulativeTimes で導出する)。anon は実行不可。';

-- ===========================================================================
-- 権限: PUBLIC / anon の実行を剥奪し、authenticated には EXECUTE のみ付与。
-- service_role は従来どおり (サーバー側の信頼済み呼び出し用)。
-- ===========================================================================
REVOKE ALL ON FUNCTION "public"."get_team_relay_rankings"("p_team_id" "uuid", "p_relay_kind" "text", "p_leg_distance" integer, "p_pool_type" smallint, "p_gender_category" "text", "p_fiscal_year" integer, "p_limit" integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_team_relay_rankings"("p_team_id" "uuid", "p_relay_kind" "text", "p_leg_distance" integer, "p_pool_type" smallint, "p_gender_category" "text", "p_fiscal_year" integer, "p_limit" integer) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."get_team_relay_rankings"("p_team_id" "uuid", "p_relay_kind" "text", "p_leg_distance" integer, "p_pool_type" smallint, "p_gender_category" "text", "p_fiscal_year" integer, "p_limit" integer) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_team_relay_rankings"("p_team_id" "uuid", "p_relay_kind" "text", "p_leg_distance" integer, "p_pool_type" smallint, "p_gender_category" "text", "p_fiscal_year" integer, "p_limit" integer) TO "service_role";
