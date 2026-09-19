-- =============================================================================
-- チーム記録 / リレー記録ランキング RPC: 「その年度以前」バケットの追加
-- =============================================================================
-- 背景:
--   ランキングの期間絞り込みが「通算 / 明示年度3つ / **N年度以前**」の
--   プルダウンになった (ユーザー要望)。第1弾の両 RPC は `p_fiscal_year` を
--   単一の整数で受け
--     c.date >= make_date(y, 4, 1) AND c.date <= make_date(y + 1, 3, 31)
--   と**上下両端を閉じて**絞るため、「以前」= 下端を持たない開区間を渡す手段が
--   存在しなかった。そこで両 RPC に `p_fiscal_year_or_earlier boolean` を足す。
--
--     p_fiscal_year IS NULL                  → 通算 (boolean は無視)
--     p_fiscal_year = Y, or_earlier = false  → FY Y のみ (現状の挙動と同一)
--     p_fiscal_year = Y, or_earlier = true   → c.date <= make_date(Y+1,3,31) のみ
--
-- 🚨 CREATE OR REPLACE では引数を足せない (**別シグネチャのオーバーロードが
--    増える**)。オーバーロードが2つあると PostgREST は
--    「Could not choose the best candidate function」で 300 を返し、
--    ランキングタブが丸ごと落ちる。よって**旧シグネチャを DROP FUNCTION で
--    明示的に落としてから**新シグネチャを作る。第1弾で戻り値型を変えたときと
--    同じ罠 (20260907000000:44-51 のコメント)。
--
-- ⚠️ DROP FUNCTION は**その関数に付いた権限も一緒に落とす**ので、
--    REVOKE ALL FROM PUBLIC / anon と GRANT EXECUTE TO authenticated,
--    service_role を新シグネチャに付け直している (下部)。付け直しを忘れると
--    authenticated が EXECUTE を失い、ランキングが 42501 で落ちる。
--
-- 関数本体は 20260907000000 / 20260908000100 の定義をそのまま持ち込み、
-- **引数1つ・ガード1つ・年度述語1つ**だけを変えている (差分は機械的に生成し、
-- 元定義との diff がこの3点のみであることを実測で確認した)。
--
-- 本 migration は関数定義 (DDL) と REVOKE/GRANT のみ。既存データを書き換える
-- DML (INSERT/UPDATE/DELETE/TRUNCATE) は一切含まない。
--
-- デプロイ順序:
--   **migration 先 → コード後。**
--   アプリ側は `p_fiscal_year_or_earlier` を名前付き引数で常に送るので、
--   旧シグネチャのままの DB にコードを先に出すと PostgREST が
--   「function does not exist」を返してランキングが落ちる。逆順 (migration 先) は
--   boolean に DEFAULT false があるため旧コードからの呼び出しがそのまま通る。
--
--   ⚠️ 本番未適用の migration はこれで **4本** になる (適用順):
--     1. 20260907000000_team_record_rankings_rpc.sql      (個人ランキング RPC)
--     2. 20260908000000_add_relay_records.sql             (relay_records テーブル)
--     3. 20260908000100_team_relay_rankings_rpc.sql       (リレーランキング RPC)
--     4. 20260909000000_team_rankings_fiscal_year_or_earlier.sql  (本 migration)
--   1〜3 を飛ばして 4 だけを当てることはできない (DROP 対象の関数が存在しない
--   のは IF EXISTS で無害だが、CREATE が参照する relay_records が無い)。
-- =============================================================================

-- =============================================================================
-- 個人種目ランキング
-- =============================================================================

DROP FUNCTION IF EXISTS "public"."get_team_record_rankings"("uuid", "text", integer, smallint, smallint, "text", integer, integer);

CREATE OR REPLACE FUNCTION "public"."get_team_record_rankings"(
  "p_team_id"     "uuid",
  "p_scope"       "text",
  "p_style_id"    integer,
  "p_pool_type"   smallint,
  "p_gender"      smallint DEFAULT NULL,
  "p_aggregation" "text"   DEFAULT 'personalBest',
  "p_fiscal_year" integer  DEFAULT NULL,
  "p_fiscal_year_or_earlier" boolean DEFAULT false,
  "p_limit"       integer  DEFAULT 50
) RETURNS TABLE (
  "record_id"         "uuid",
  "user_id"           "uuid",
  "display_name"      "text",
  "time"              numeric,
  "style_id"          integer,
  "style"             "text",
  "distance"          integer,
  "pool_type"         smallint,
  "gender"            smallint,
  "competition_id"    "uuid",
  "competition_title" "text",
  "competition_date"  "date",
  "record_created_at" timestamp with time zone
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
  -- 入力値ガード: 未知の scope / aggregation は「全件返す」等の危険な既定値に
  -- 落とさず例外にする (静かに別の意味のランキングを返さない)。
  --
  -- ⚠️ NULL を必ず先に弾くこと。SQL の三値論理では
  --   `NULL NOT IN ('teamCompetitions', 'allCompetitions')` は FALSE ではなく **NULL** で、
  --   plpgsql の IF は NULL を偽として扱うためガードを素通りしてしまう。
  --   その結果 p_scope := NULL は WHERE 側の
  --   `(p_scope = 'allCompetitions' OR c.team_id = p_team_id)` で
  --   teamCompetitions 相当に、p_aggregation := NULL は
  --   `(p_aggregation = 'allRaces' OR rn = 1)` で personalBest 相当に落ち、
  --   例外も出ないまま「別の意味のランキング」を返す (実測で確認済み)。
  -- ---------------------------------------------------------------------------
  IF p_scope IS NULL OR p_scope NOT IN ('teamCompetitions', 'allCompetitions') THEN
    RAISE EXCEPTION 'invalid scope: %', COALESCE(p_scope, 'NULL');
  END IF;

  IF p_aggregation IS NULL OR p_aggregation NOT IN ('personalBest', 'allRaces') THEN
    RAISE EXCEPTION 'invalid aggregation: %', COALESCE(p_aggregation, 'NULL');
  END IF;

  -- 絞り込みの軸そのものが NULL の場合も例外にする。
  -- `r.style_id = NULL` / `r.pool_type = NULL` はどの行にもマッチしないため、
  -- 放置すると呼び出し側のバグ (引数の渡し漏れ・undefined の混入) が
  -- 「エラーではなく空のランキング」に化けて気付けない。
  IF p_style_id IS NULL THEN
    RAISE EXCEPTION 'p_style_id is required';
  END IF;

  IF p_pool_type IS NULL THEN
    RAISE EXCEPTION 'p_pool_type is required';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 「以前」は年度が指定されているときだけ意味を持つ。
  --
  -- p_fiscal_year IS NULL は「通算」(期間で絞らない) であり、そこに
  -- or_earlier = true を重ねると **同じ引数の組が2つの意味を持つ**。
  -- 黙って通算に落とすと呼び出し側のバグ (year の渡し漏れ) が「エラーではなく
  -- 別の意味のランキング」に化けて気付けないので、p_scope / p_aggregation の
  -- 既存ガードと同じ形で例外にする。
  --
  -- ⚠️ COALESCE で boolean の NULL を潰すこと。三値論理では
  --    `NULL AND p_fiscal_year IS NULL` が NULL になり、plpgsql の IF は NULL を
  --    偽として扱うのでガードを素通りする (第1弾で `NULL NOT IN` を踏んでいる)。
  -- ---------------------------------------------------------------------------
  IF COALESCE(p_fiscal_year_or_earlier, false) AND p_fiscal_year IS NULL THEN
    RAISE EXCEPTION 'p_fiscal_year is required when p_fiscal_year_or_earlier is true';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 認可ガード: 呼び出し元が p_team_id の「承認済みかつアクティブな」メンバーであること。
  --
  -- 既存の public.is_team_member() は使わない。あれは is_active しか見ておらず
  -- status を見ないため、承認待ち (status='pending') の申請者まで通ってしまう。
  -- 参加申請は招待コードさえあれば誰でも作れる (request_join_team) ので、
  -- is_active だけを条件にするとチーム管理者の承認前にメンバー全員のタイムが
  -- 見えてしまう。ここでは status='approved' を必須にする。
  --
  -- team_memberships.is_active は boolean NULL 許容 (DEFAULT true) のため
  -- `= true` ではなく `IS TRUE` で書く。`= true` でも NULL は NULL 判定で
  -- 結果的に除外されるが、「NULL を除外する意図」を明示する。
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
  -- (UI の「さらに表示」がクライアント側のページングなので、上限は 500 で十分)
  -- ---------------------------------------------------------------------------
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);

  RETURN QUERY
  WITH team_member AS (
    -- 集計対象のメンバー。認可ガードと同一の述語 (承認済み かつ アクティブ) を使う。
    -- 「見える人」と「集計される人」の定義が乖離すると、退会済み・承認待ちの
    -- ユーザーのタイムが静かにランキングへ混ざる。
    SELECT tm.user_id
    FROM public.team_memberships tm
    WHERE tm.team_id = p_team_id
      AND tm.status = 'approved'::public.membership_status_type
      AND tm.is_active IS TRUE
  ),
  base AS (
    SELECT
      r.id                        AS record_id,
      r.user_id                   AS user_id,
      u.name                      AS display_name,
      r."time"                    AS "time",
      r.style_id                  AS style_id,
      s.style                     AS style,
      s.distance                  AS distance,
      r.pool_type                 AS pool_type,
      u.gender::smallint          AS gender,
      c.id                        AS competition_id,
      c.title                     AS competition_title,
      c.date                      AS competition_date,
      r.created_at                AS record_created_at
    FROM public.records r
      JOIN public.styles s ON s.id = r.style_id
      JOIN public.users u ON u.id = r.user_id
      JOIN team_member m ON m.user_id = r.user_id
      -- competitions は LEFT JOIN で結合する。
      -- allCompetitions スコープでは competition_id IS NULL の記録
      -- (ベストタイムの一括登録で作られる、大会に紐づかない記録) を必ず含める
      -- 必要がある。ここを INNER JOIN にすると一括登録分が静かに 0 件になる。
      -- teamCompetitions スコープでは下の WHERE 句の c.team_id = p_team_id が
      -- 未結合行 (c.team_id IS NULL → 述語が NULL → 偽) を落とすため、
      -- 結果は「INNER JOIN ... AND c.team_id = p_team_id」と同一になる。
      -- スコープごとにクエリ本体を2本持つと絞り込み条件が片方だけ更新されて
      -- 静かに乖離するため、1本に畳んで述語で切り替える。
      LEFT JOIN public.competitions c ON c.id = r.competition_id
    WHERE r.style_id = p_style_id
      -- 水路は厳密一致。records.pool_type は smallint NOT NULL だが CHECK 制約が
      -- 無いため 0/1 以外の行が理論上存在しうる。
      -- CASE WHEN pool_type = 1 THEN 1 ELSE 0 END のような正規化はしない
      -- (異常値が短水路のランキングに静かに混入する)。厳密一致なら異常値は
      -- どちらのバケツにも入らず、かつ例外にもならない。
      AND r.pool_type = p_pool_type
      -- リレーのレグは除外する。第2〜4泳者は引き継ぎスタートで約0.6秒速く出るため、
      -- 個人種目のランキングに混ぜると「速い順」が静かに嘘になる。
      -- apps/shared/api/records.ts の getBestTimesForUsers と
      -- apps/shared/utils/waPoints.ts の WA ポイント集計も同じ理由で除外している。
      AND r.is_relaying = false
      -- p_gender IS NULL は「男女すべて」を意味する (0/1 の絞り込みではない)。
      --
      -- 🚨 **この NULL 分岐は現在 UI からは到達しない。死んだコードではない。**
      -- 第4弾で `RankingGenderFilter` (apps/shared/types/teamRanking.ts) から
      -- `all` を削除し、UI は男子/女子の2択になったため p_gender には必ず 0 か 1 が
      -- 入る。それでも分岐を残しているのは、将来「男女すべて」を戻すときに
      -- migration を要らなくするためであり、**意図的な保持である**。
      -- pgTAP の V-DB-46c / V-DB-44g / V-DB-44i
      -- (supabase/tests/11_team_record_rankings_rpc.test.sql) がこの枝を検証して
      -- いるので、「呼び出し元が NULL を送らない」を理由に削除しないこと。
      AND (p_gender IS NULL OR u.gender = p_gender)
      -- スコープ:
      --   teamCompetitions … competitions.team_id がこのチームの大会に限定する。
      --     ⚠️ records.team_id では絞らない。records.team_id を書き込む経路が
      --     2:2 に割れており (web の大会タブ useCompetitionTabSave.ts と
      --     ダッシュボード useDashboardHandlers.ts は team_id を送らない /
      --     TeamCompetitions.tsx と mobile は送る)、records.team_id で絞ると
      --     同じチーム大会でも web 由来の記録だけが静かに落ちる。
      --   allCompetitions … 大会所属を問わない (他チーム・個人で出場した大会や
      --     一括登録のベストタイムも含む。RLS では見えない範囲まで露出するため、
      --     UI 側で注意書きを表示する)。
      AND (p_scope = 'allCompetitions' OR c.team_id = p_team_id)
      -- 年度 (日本の年度: 4/1〜翌3/31)。判定には competitions.date を使い
      -- records.created_at は使わない (一括登録記録は登録日しか持たないため、
      -- 過去のベストタイムを今日入れると嘘の年度に入る)。
      -- 大会に紐づかない記録は年度が決まらないので、p_fiscal_year 指定時は
      -- c.date が NULL となり述語が NULL → 除外される (それが正しい挙動)。
      --
      -- p_fiscal_year_or_earlier = true のときは**下端を持たない**
      -- (「2023年度以前」= c.date <= 2024-03-31)。UI の期間プルダウンが
      -- 「明示年度3つ + 以前バケット1つ」になったため開区間が必要になった。
      -- 第1弾は上下両端を閉じる形しか無く、開区間を渡す手段が存在しなかった。
      --
      -- ⚠️ **NULL 対策として load-bearing なのは2段目の COALESCE だけ。**
      --    or_earlier = NULL のとき1段目は NULL (偽扱い) になるが、
      --    2段目の `NOT COALESCE(NULL, false)` が true になって exact 範囲を
      --    正しく選ぶ。つまり**1段目の COALESCE を足しても何も守っていない**
      --    (防御的な冗長として残してあるだけ)。ここを見て「NULL 対策済み」と
      --    安心しないこと — 守っているのは2段目である。
      --
      -- ⚠️ **c.date IS NULL (一括登録記録) は or_earlier でも除外される。**
      --    述語が c.date の上にあるので `NULL <= date` → NULL → 偽になり、
      --    自動的に落ちる。通算 (p_fiscal_year IS NULL) のときだけ含まれる。
      --    「年度が決まらない記録は年度で絞れない」という意図した挙動であり、
      --    UI 側は年度選択時に注意書きを出す。
      AND (
        p_fiscal_year IS NULL
        OR (
          COALESCE(p_fiscal_year_or_earlier, false)
          AND c.date <= make_date(p_fiscal_year + 1, 3, 31)
        )
        OR (
          NOT COALESCE(p_fiscal_year_or_earlier, false)
          AND c.date >= make_date(p_fiscal_year, 4, 1)
          AND c.date <= make_date(p_fiscal_year + 1, 3, 31)
        )
      )
  ),
  ranked AS (
    -- personalBest (1メンバー1行) と allRaces (全行) を1本のクエリで表現する。
    -- 同一メンバーが同タイムを複数持つ場合でも順序が揺れないよう、
    -- PARTITION 内の ORDER BY を time → 大会日 → record_id まで指定して
    -- 「どの1件が残るか」を決定的にする (record_id は一意なので必ず決着する)。
    SELECT
      b.*,
      ROW_NUMBER() OVER (
        PARTITION BY b.user_id
        ORDER BY b."time" ASC, b.competition_date ASC NULLS LAST, b.record_id ASC
      ) AS user_race_rank
    FROM base b
  )
  SELECT
    x.record_id,
    x.user_id,
    x.display_name,
    x."time",
    x.style_id,
    x.style,
    x.distance,
    x.pool_type,
    x.gender,
    x.competition_id,
    x.competition_title,
    x.competition_date,
    x.record_created_at
  FROM ranked x
  WHERE p_aggregation = 'allRaces' OR x.user_race_rank = 1
  -- 全体の並びも time → 大会日 → record_id で決定的にする。
  -- (同着の同順位付与は表示側の assignCompetitionRanks が行う)
  ORDER BY x."time" ASC, x.competition_date ASC NULLS LAST, x.record_id ASC
  LIMIT v_limit;
END;
$$;

ALTER FUNCTION "public"."get_team_record_rankings"("p_team_id" "uuid", "p_scope" "text", "p_style_id" integer, "p_pool_type" smallint, "p_gender" smallint, "p_aggregation" "text", "p_fiscal_year" integer, "p_fiscal_year_or_earlier" boolean, "p_limit" integer) OWNER TO "postgres";
COMMENT ON FUNCTION "public"."get_team_record_rankings"("p_team_id" "uuid", "p_scope" "text", "p_style_id" integer, "p_pool_type" smallint, "p_gender" smallint, "p_aggregation" "text", "p_fiscal_year" integer, "p_fiscal_year_or_earlier" boolean, "p_limit" integer) IS
  'チームメンバーの大会記録を種目(styles.id) × 水路で速い順に並べて返す。scope=teamCompetitions はそのチームの大会 (competitions.team_id) の記録のみ、scope=allCompetitions は大会所属を問わずメンバーの記録を集計する。リレーのレグ (is_relaying=true) は引き継ぎスタートで速く出るため常に除外する。p_gender = NULL は「男女すべて」を意味するが、**現在の UI からは到達しない** (男子/女子の2択で必ず 0 か 1 を渡す)。将来「すべて」を戻すとき migration を 要らなくするための意図的な保持であり、pgTAP V-DB-46c が検証しているので削除しないこと。SECURITY DEFINER で records/users の RLS をバイパスするため、(1) 呼び出し元が承認済みかつアクティブなチームメンバーであることを関数内で検証し、(2) 返す列をランキング表示に必要な13列に限定している (records.note/video_path/video_thumbnail_path/reaction_time、users.birthday/bio/google_calendar_refresh_token/profile_image_path は返さない。プロフィール画像はランキング表に表示しないため avatar_path は返す側から落としてある)。p_fiscal_year_or_earlier = true は「その年度以前すべて」(下端なし。c.date <= make_date(p_fiscal_year + 1, 3, 31)) を意味し、p_fiscal_year が NULL のときは例外になる (通算と意味が二重になるため)。anon は実行不可。';
REVOKE ALL ON FUNCTION "public"."get_team_record_rankings"("p_team_id" "uuid", "p_scope" "text", "p_style_id" integer, "p_pool_type" smallint, "p_gender" smallint, "p_aggregation" "text", "p_fiscal_year" integer, "p_fiscal_year_or_earlier" boolean, "p_limit" integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_team_record_rankings"("p_team_id" "uuid", "p_scope" "text", "p_style_id" integer, "p_pool_type" smallint, "p_gender" smallint, "p_aggregation" "text", "p_fiscal_year" integer, "p_fiscal_year_or_earlier" boolean, "p_limit" integer) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."get_team_record_rankings"("p_team_id" "uuid", "p_scope" "text", "p_style_id" integer, "p_pool_type" smallint, "p_gender" smallint, "p_aggregation" "text", "p_fiscal_year" integer, "p_fiscal_year_or_earlier" boolean, "p_limit" integer) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_team_record_rankings"("p_team_id" "uuid", "p_scope" "text", "p_style_id" integer, "p_pool_type" smallint, "p_gender" smallint, "p_aggregation" "text", "p_fiscal_year" integer, "p_fiscal_year_or_earlier" boolean, "p_limit" integer) TO "service_role";


-- =============================================================================
-- リレーランキング
-- =============================================================================

DROP FUNCTION IF EXISTS "public"."get_team_relay_rankings"("uuid", "text", integer, smallint, "text", integer, integer);

CREATE OR REPLACE FUNCTION "public"."get_team_relay_rankings"(
  "p_team_id"         "uuid",
  "p_relay_kind"      "text",
  "p_leg_distance"    integer,
  "p_pool_type"       smallint,
  "p_gender_category" "text"   DEFAULT NULL,
  "p_fiscal_year"     integer  DEFAULT NULL,
  "p_fiscal_year_or_earlier" boolean DEFAULT false,
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
  -- 「以前」は年度が指定されているときだけ意味を持つ。
  --
  -- p_fiscal_year IS NULL は「通算」(期間で絞らない) であり、そこに
  -- or_earlier = true を重ねると **同じ引数の組が2つの意味を持つ**。
  -- 黙って通算に落とすと呼び出し側のバグ (year の渡し漏れ) が「エラーではなく
  -- 別の意味のランキング」に化けて気付けないので、p_scope / p_aggregation の
  -- 既存ガードと同じ形で例外にする。
  --
  -- ⚠️ COALESCE で boolean の NULL を潰すこと。三値論理では
  --    `NULL AND p_fiscal_year IS NULL` が NULL になり、plpgsql の IF は NULL を
  --    偽として扱うのでガードを素通りする (第1弾で `NULL NOT IN` を踏んでいる)。
  -- ---------------------------------------------------------------------------
  IF COALESCE(p_fiscal_year_or_earlier, false) AND p_fiscal_year IS NULL THEN
    RAISE EXCEPTION 'p_fiscal_year is required when p_fiscal_year_or_earlier is true';
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
      --
      -- p_fiscal_year_or_earlier = true のときは**下端を持たない**
      -- (「2023年度以前」= c.date <= 2024-03-31)。UI の期間プルダウンが
      -- 「明示年度3つ + 以前バケット1つ」になったため開区間が必要になった。
      -- 第1弾は上下両端を閉じる形しか無く、開区間を渡す手段が存在しなかった。
      --
      -- ⚠️ **NULL 対策として load-bearing なのは2段目の COALESCE だけ。**
      --    or_earlier = NULL のとき1段目は NULL (偽扱い) になるが、
      --    2段目の `NOT COALESCE(NULL, false)` が true になって exact 範囲を
      --    正しく選ぶ。つまり**1段目の COALESCE を足しても何も守っていない**
      --    (防御的な冗長として残してあるだけ)。ここを見て「NULL 対策済み」と
      --    安心しないこと — 守っているのは2段目である。
      --
      -- ⚠️ **c.date IS NULL (一括登録記録) は or_earlier でも除外される。**
      --    述語が c.date の上にあるので `NULL <= date` → NULL → 偽になり、
      --    自動的に落ちる。通算 (p_fiscal_year IS NULL) のときだけ含まれる。
      --    「年度が決まらない記録は年度で絞れない」という意図した挙動であり、
      --    UI 側は年度選択時に注意書きを出す。
      AND (
        p_fiscal_year IS NULL
        OR (
          COALESCE(p_fiscal_year_or_earlier, false)
          AND c.date <= make_date(p_fiscal_year + 1, 3, 31)
        )
        OR (
          NOT COALESCE(p_fiscal_year_or_earlier, false)
          AND c.date >= make_date(p_fiscal_year, 4, 1)
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

ALTER FUNCTION "public"."get_team_relay_rankings"("p_team_id" "uuid", "p_relay_kind" "text", "p_leg_distance" integer, "p_pool_type" smallint, "p_gender_category" "text", "p_fiscal_year" integer, "p_fiscal_year_or_earlier" boolean, "p_limit" integer) OWNER TO "postgres";
COMMENT ON FUNCTION "public"."get_team_relay_rankings"("p_team_id" "uuid", "p_relay_kind" "text", "p_leg_distance" integer, "p_pool_type" smallint, "p_gender_category" "text", "p_fiscal_year" integer, "p_fiscal_year_or_earlier" boolean, "p_limit" integer) IS
  'チームのリレー記録 (relay_records) を 種類 × 1レグ距離 × 水路 [× 性別区分] で総合タイムの速い順に並べて返す。p_gender_category = NULL は「すべての性別区分」を意味するが、**現在の UI からは到達しない** (男子/女子/混合の3択で必ず非 NULL を渡す)。将来「すべて」を戻すとき migration を 要らなくするための意図的な保持であり、pgTAP V-DB-64h / V-DB-64i が検証しているので削除しないこと。集計モードの引数は持たない (リレーには「1チーム1行」の概念が無く、常に全レースを列挙する)。SECURITY DEFINER で users の RLS をバイパスするため (退会メンバーの名前を当時のチーム記録として表示するため)、(1) 呼び出し元が承認済みかつアクティブなチームメンバーであることを関数内で検証し、(2) レグの泳者名を p_team_id の team_memberships に行を持つユーザーに限定し (非メンバーの user_id は displayName が NULL になる)、(3) 返す列を11列 + legs に限定している (relay_records.created_by、users.birthday/bio/google_calendar_refresh_token/profile_image_path は返さない。プロフィール画像はラップ表示に出さないため legs に avatarPath を含めない)。レグの通算タイムは返さない (apps/shared/utils/relayEvents.ts の calcCumulativeTimes で導出する)。p_fiscal_year_or_earlier = true は「その年度以前すべて」(下端なし。c.date <= make_date(p_fiscal_year + 1, 3, 31)) を意味し、p_fiscal_year が NULL のときは例外になる (通算と意味が二重になるため)。anon は実行不可。';
REVOKE ALL ON FUNCTION "public"."get_team_relay_rankings"("p_team_id" "uuid", "p_relay_kind" "text", "p_leg_distance" integer, "p_pool_type" smallint, "p_gender_category" "text", "p_fiscal_year" integer, "p_fiscal_year_or_earlier" boolean, "p_limit" integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_team_relay_rankings"("p_team_id" "uuid", "p_relay_kind" "text", "p_leg_distance" integer, "p_pool_type" smallint, "p_gender_category" "text", "p_fiscal_year" integer, "p_fiscal_year_or_earlier" boolean, "p_limit" integer) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."get_team_relay_rankings"("p_team_id" "uuid", "p_relay_kind" "text", "p_leg_distance" integer, "p_pool_type" smallint, "p_gender_category" "text", "p_fiscal_year" integer, "p_fiscal_year_or_earlier" boolean, "p_limit" integer) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_team_relay_rankings"("p_team_id" "uuid", "p_relay_kind" "text", "p_leg_distance" integer, "p_pool_type" smallint, "p_gender_category" "text", "p_fiscal_year" integer, "p_fiscal_year_or_earlier" boolean, "p_limit" integer) TO "service_role";
