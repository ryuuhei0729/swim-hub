-- =============================================================================
-- チーム記録ランキング RPC: get_team_record_rankings
-- =============================================================================
-- 背景:
--   チームタブに「種目 × 距離 × 水路」でメンバーの記録を速い順に並べるランキングを
--   追加する。ランキングは「同じチームのメンバー全員の記録」を横断して集計する必要が
--   あるが、records の SELECT RLS は
--     - 自分の記録 (auth.uid() = user_id)
--     - チームメイトの個人記録 (team_id IS NULL かつ shares_active_team)
--     - 自分が所属するチームのチーム記録 (records.team_id = 所属チーム)
--   の3ポリシーに分かれており、「メンバーが他チームや個人で出場した大会の記録」
--   (allCompetitions スコープ) はクライアントからの素の SELECT では取得できない。
--   そのため SECURITY DEFINER の RPC で RLS をバイパスし、代わりに
--   「返す列」と「呼び出せる人」をこの関数の中で厳密に絞る。
--
-- 実装規約:
--   既存 RPC delete_competition_with_records (20260826000000) /
--   replace_practice_logs (20260618000000) に倣う:
--   SECURITY DEFINER + SET search_path = public + 関数冒頭の認証・認可ガード +
--   REVOKE ALL FROM PUBLIC, anon + GRANT EXECUTE TO authenticated, service_role。
--
--   本 migration は関数定義 (DDL) と REVOKE/GRANT のみ。既存データを書き換える
--   DML (INSERT/UPDATE/DELETE/TRUNCATE) は一切含まない。
--
-- 情報露出の設計 (SECURITY DEFINER なので「返さない列」が防御線になる):
--   RETURNS TABLE の13列だけを返す。特に以下は意図的に返さない。
--     - records.note / video_path / video_thumbnail_path / reaction_time
--       (本人が非公開前提で入れているメモ・動画・リアクションタイム)
--     - users.birthday / bio / google_calendar_refresh_token
--       (誕生日は個人情報、refresh_token は認証情報)
--     - users.profile_image_path (ランキング表はプロフィール画像を表示しない。
--       表示しない列を返すと private バケットの相対パスだけが誰にも読まれずに
--       露出し続けるため、返す側から落とす。再び表示するなら RETURNS TABLE に
--       1列足して base / 最終 SELECT に写すだけで戻せる)
--   users から取るのは name (display_name) と gender の2列のみ。
--   display_name は users.name から取る (列名が異なるので注意)。
--
-- デプロイ順序:
--   この migration は新規関数の追加のみで既存の関数・テーブル・データに触れないため
--   順序不問。ただしアプリ側 UI はこの関数の存在を前提にするため、
--   「migration 先 → コード後」で出すとタブが空振りせず済む。
-- =============================================================================

-- 旧リビジョン (avatar_path を含む 14 列版) の掃除。
-- CREATE OR REPLACE FUNCTION は **戻り値の型を変えられない**
-- (`cannot change return type of existing function`) ため、RETURNS TABLE から
-- 列を落とすときは DROP が必要になる。引数リストは変わっていないので
-- オーバーロードは増えず、DROP → CREATE で置き換わる。
-- 本番はこの migration をまだ適用していないので影響は無く、
-- 14 列版を適用済みのローカル DB だけがここで作り直される (IF EXISTS)。
DROP FUNCTION IF EXISTS "public"."get_team_record_rankings"("uuid", "text", integer, smallint, smallint, "text", integer, integer);

CREATE OR REPLACE FUNCTION "public"."get_team_record_rankings"(
  "p_team_id"     "uuid",
  "p_scope"       "text",
  "p_style_id"    integer,
  "p_pool_type"   smallint,
  "p_gender"      smallint DEFAULT NULL,
  "p_aggregation" "text"   DEFAULT 'personalBest',
  "p_fiscal_year" integer  DEFAULT NULL,
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
      AND (
        p_fiscal_year IS NULL
        OR (
          c.date >= make_date(p_fiscal_year, 4, 1)
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

ALTER FUNCTION "public"."get_team_record_rankings"("p_team_id" "uuid", "p_scope" "text", "p_style_id" integer, "p_pool_type" smallint, "p_gender" smallint, "p_aggregation" "text", "p_fiscal_year" integer, "p_limit" integer) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_team_record_rankings"("p_team_id" "uuid", "p_scope" "text", "p_style_id" integer, "p_pool_type" smallint, "p_gender" smallint, "p_aggregation" "text", "p_fiscal_year" integer, "p_limit" integer) IS
  'チームメンバーの大会記録を種目(styles.id) × 水路で速い順に並べて返す。scope=teamCompetitions はそのチームの大会 (competitions.team_id) の記録のみ、scope=allCompetitions は大会所属を問わずメンバーの記録を集計する。リレーのレグ (is_relaying=true) は引き継ぎスタートで速く出るため常に除外する。p_gender = NULL は「男女すべて」を意味するが、**現在の UI からは到達しない** (男子/女子の2択で必ず 0 か 1 を渡す)。将来「すべて」を戻すとき migration を 要らなくするための意図的な保持であり、pgTAP V-DB-46c が検証しているので削除しないこと。SECURITY DEFINER で records/users の RLS をバイパスするため、(1) 呼び出し元が承認済みかつアクティブなチームメンバーであることを関数内で検証し、(2) 返す列をランキング表示に必要な13列に限定している (records.note/video_path/video_thumbnail_path/reaction_time、users.birthday/bio/google_calendar_refresh_token/profile_image_path は返さない。プロフィール画像はランキング表に表示しないため avatar_path は返す側から落としてある)。anon は実行不可。';

-- ===========================================================================
-- 権限: PUBLIC / anon の実行を剥奪し、authenticated には EXECUTE のみ付与。
-- service_role は従来どおり (サーバー側の信頼済み呼び出し用)。
-- ===========================================================================
REVOKE ALL ON FUNCTION "public"."get_team_record_rankings"("p_team_id" "uuid", "p_scope" "text", "p_style_id" integer, "p_pool_type" smallint, "p_gender" smallint, "p_aggregation" "text", "p_fiscal_year" integer, "p_limit" integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_team_record_rankings"("p_team_id" "uuid", "p_scope" "text", "p_style_id" integer, "p_pool_type" smallint, "p_gender" smallint, "p_aggregation" "text", "p_fiscal_year" integer, "p_limit" integer) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."get_team_record_rankings"("p_team_id" "uuid", "p_scope" "text", "p_style_id" integer, "p_pool_type" smallint, "p_gender" smallint, "p_aggregation" "text", "p_fiscal_year" integer, "p_limit" integer) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_team_record_rankings"("p_team_id" "uuid", "p_scope" "text", "p_style_id" integer, "p_pool_type" smallint, "p_gender" smallint, "p_aggregation" "text", "p_fiscal_year" integer, "p_limit" integer) TO "service_role";
