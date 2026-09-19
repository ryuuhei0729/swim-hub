// =============================================================================
// rankings.test.ts — TeamRankingsAPI (QA Sprint Contract Phase B)
// =============================================================================
//
// 対象: apps/shared/api/teams/rankings.ts
//
// Sprint Contract 検証観点:
//   [V-20] getRankings が RPC `get_team_record_rankings` を、契約どおりの
//          8引数 (p_team_id / p_scope / p_style_id / p_pool_type / p_gender /
//          p_aggregation / p_fiscal_year / p_limit) で1回だけ呼ぶ
//   [V-21] `GENDER_FILTER_TO_DB` (male→0 / female→1) が**全単射**である。
//          `?? 0` / `|| 0` 相当のフォールバックが無い。
//          ⚠️ 第3弾でユーザー依頼により「男女すべて」を廃止したので
//             `RankingGenderFilter` は `"male" | "female"` の2値になり、
//             **undefined / NULL の経路が型レベルで消えた**。
//             よって観点は「NULL を渡す」ではなく「2値が別々の DB 値に写る」。
//             RPC 側の `p_gender IS NULL = すべて` の実装は将来の復活用に残してある
//             (supabase/tests/11_... の V-DB-46c が引き続き守っている)
//   [V-22] period={kind:"allTime"} は p_fiscal_year=NULL、
//          {kind:"fiscalYear",year} はその年を渡す
//   [V-23] p_limit は TEAM_RANKING_FETCH_LIMIT (=500) 固定
//   [V-24] snake_case の RPC 行を camelCase の TeamRankingRecord に写す。
//          13列すべてを落とさない。
//          ⚠️ ユーザー依頼でランキング表にプロフィール画像を出さない方針になり、
//             `avatar_path` を RPC の RETURNS TABLE から削除した (14 → 13列)。
//             写像は **allowlist** なので、RPC が余分な列を返しても取り込まない
//             (本番にはまだ14列版の関数が残っているため、コードが先にデプロイ
//              されても `avatarPath` が型に混入しないことを [V-28] で固定する)
//   [V-25] (反転) canonical 化できない style / 0,1 以外の pool_type の行を
//          **除外しない**。表示専用の列の検証で行を落とすと順位の母集団が静かに欠ける。
//          canonical 化できない style は `as SwimStyle` で押し通さず null にする
//   [V-28] competition_* が null (一括登録記録) / record_created_at が null でも
//          **行を落とさない** (落とすと順位の母集団が静かに欠ける)
//   [V-29] エラーは加工せずそのまま re-throw する (UserFacingError に包まない)
//   [V-33] hasAnyRecord のメンバー述語は RPC と同じ (status=approved かつ is_active)。
//          リレーのレグ (is_relaying=true) は数えない
//
// トートロジー防止: 期待値の camelCase 行はプロダクションの写像関数を通さず、
// テスト側で手書きしたリテラルと toEqual で突き合わせる。

import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { TeamRankingsAPI, TEAM_RANKING_FETCH_LIMIT } from "../../api/teams/rankings";
import type { TeamRankingFilters, TeamRankingRecord } from "../../types";
import { createSupabaseMock } from "../utils/supabase-mock";
import type { MockQueryBuilder } from "../../__mocks__/supabase";

const TEAM_ID = "team-kingfisher";

/** 既定の絞り込み条件 (テストごとに必要な軸だけ上書きする) */
function filters(overrides: Partial<TeamRankingFilters> = {}): TeamRankingFilters {
  return {
    styleId: 3,
    poolType: 1,
    gender: "male",
    scope: "teamCompetitions",
    aggregation: "personalBest",
    period: { kind: "allTime" },
    ...overrides,
  };
}

/** RPC が返す1行 (snake_case)。テストで必要な列だけ上書きする */
function rpcRow(overrides: Record<string, unknown> = {}) {
  return {
    record_id: "rec-kingfisher-7",
    user_id: "usr-kingfisher-7",
    display_name: "セブン",
    time: 27.31,
    style_id: 3,
    style: "Fr",
    distance: 100,
    pool_type: 1,
    gender: 0,
    competition_id: "cmp-kingfisher-7",
    competition_title: "第7回記録会",
    competition_date: "2026-05-03",
    record_created_at: "2026-05-04T09:15:00+09:00",
    ...overrides,
  };
}

/** 上の rpcRow に対応する camelCase の期待値 (手書き) */
const EXPECTED_RECORD: TeamRankingRecord = {
  recordId: "rec-kingfisher-7",
  userId: "usr-kingfisher-7",
  displayName: "セブン",
  time: 27.31,
  styleId: 3,
  style: "Fr",
  distance: 100,
  poolType: 1,
  gender: 0,
  competitionId: "cmp-kingfisher-7",
  competitionTitle: "第7回記録会",
  competitionDate: "2026-05-03",
  recordCreatedAt: "2026-05-04T09:15:00+09:00",
};

/**
 * `select(..., { count: "exact", head: true })` の戻り値に count を載せる。
 * createSupabaseMock の TableResponse は count を扱わないため then を差し替える。
 */
function withCount(count: number | null) {
  return (builder: MockQueryBuilder) => {
    builder.then = ((
      onfulfilled?: ((value: { data: unknown; error: unknown; count?: number }) => unknown) | null,
    ) =>
      Promise.resolve({
        data: null,
        error: null,
        count: count === null ? undefined : count,
      }).then(onfulfilled)) as typeof builder.then;
  };
}

describe("TeamRankingsAPI", () => {
  let supabaseMock: ReturnType<typeof createSupabaseMock>;
  let api: TeamRankingsAPI;
  let rpc: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock = createSupabaseMock();
    rpc = supabaseMock.client.rpc as unknown as Mock;
    api = new TeamRankingsAPI(supabaseMock.client);
  });

  describe("定数", () => {
    it("[V-23] TEAM_RANKING_FETCH_LIMIT は 500 (RPC 側のクランプ上限と一致)", () => {
      expect(TEAM_RANKING_FETCH_LIMIT).toBe(500);
    });
  });

  describe("getRankings — RPC 引数", () => {
    beforeEach(() => {
      rpc.mockResolvedValue({ data: [], error: null });
    });

    it("[V-20] RPC 名と 9 引数が契約どおりで、1回だけ呼ばれる", async () => {
      await api.getRankings(TEAM_ID, filters({ styleId: 7, poolType: 0, scope: "allCompetitions" }));

      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith("get_team_record_rankings", {
        p_team_id: TEAM_ID,
        p_scope: "allCompetitions",
        p_style_id: 7,
        p_pool_type: 0,
        p_gender: 0,
        p_aggregation: "personalBest",
        // ⚠️ migration 20260909000000 で `p_fiscal_year_or_earlier` が増えた。
        //    `periodToRpcArgs` (`api/teams/rankingPeriod.ts`) が唯一の定義元で、
        //    通算は `{p_fiscal_year: null, p_fiscal_year_or_earlier: false}`。
        //    **`null` ではなく `false`** を送る (boolean の NULL は RPC 側の
        //    三値論理で述語を無効化しかけるため。pgTAP V-DB-91 が対で担保)
        p_fiscal_year: null,
        p_fiscal_year_or_earlier: false,
        p_limit: 500,
      });
    });

    // ---------------------------------------------------------------------
    // [V-21] GENDER_FILTER_TO_DB の全単射性
    //
    // `GENDER_FILTER_TO_DB` は export されていないので、**観測可能な唯一の面**
    // (RPC に渡る `p_gender`) を通して写像を確かめる。
    // `users.gender` は integer NOT NULL DEFAULT 0 CHECK (0 or 1) で 0=男性 / 1=女性。
    // ---------------------------------------------------------------------
    it.each([
      ["male", 0],
      ["female", 1],
    ] as const)("[V-21] gender='%s' は p_gender=%i を渡す", async (gender, expected) => {
      await api.getRankings(TEAM_ID, filters({ gender }));

      expect((rpc.mock.calls[0]?.[1] as Record<string, unknown>).p_gender).toBe(expected);
    });

    it("[V-21] male と female が**異なる** DB 値に写る (全単射: 片方に潰れていない)", async () => {
      await api.getRankings(TEAM_ID, filters({ gender: "male" }));
      const maleArg = (rpc.mock.calls[0]?.[1] as Record<string, unknown>).p_gender;

      rpc.mockClear();
      await api.getRankings(TEAM_ID, filters({ gender: "female" }));
      const femaleArg = (rpc.mock.calls[0]?.[1] as Record<string, unknown>).p_gender;

      // 2値の集合が {0, 1} と厳密一致する (どちらかが 0 に丸められていない)
      expect(new Set([maleArg, femaleArg])).toEqual(new Set([0, 1]));
      expect(maleArg).not.toBe(femaleArg);
    });

    it("[V-21] p_gender は number であり NULL / undefined を渡さない", async () => {
      // 「すべて」を廃止した結果 NULL の経路は型レベルで消えている。
      // ここが null / undefined になるのは写像の引き漏らし (キー不足) のとき
      for (const gender of ["male", "female"] as const) {
        rpc.mockClear();
        await api.getRankings(TEAM_ID, filters({ gender }));
        const arg = (rpc.mock.calls[0]?.[1] as Record<string, unknown>).p_gender;

        expect(typeof arg, `gender=${gender}`).toBe("number");
        expect(arg, `gender=${gender}`).not.toBeNull();
        expect(arg, `gender=${gender}`).not.toBeUndefined();
      }
    });

    it("[V-21] 🚨 実装に undefined / null を 0 に丸める分岐が無い (ソース実測)", () => {
      // `GENDER_FILTER_TO_DB[filters.gender] ?? 0` のようなフォールバックを足すと、
      // 将来キーを1つ足し忘れたときに「未知の性別が静かに男子として集計される」。
      // `Record<RankingGenderFilter, number>` は網羅を型で強制するので
      // フォールバックは不要であり、あってはいけない。
      const source = readFileSync(
        path.resolve(__dirname, "../../api/teams/rankings.ts"),
        "utf8",
      );
      const code = source
        .split("\n")
        .filter((line) => {
          const trimmed = line.trimStart();
          return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
        })
        .join("\n");

      // 写像そのものが Record で、キーは male / female のちょうど2つ
      expect(code).toMatch(
        /const GENDER_FILTER_TO_DB:\s*Record<RankingGenderFilter,\s*number>\s*=\s*\{\s*male:\s*0,\s*female:\s*1,\s*\}/,
      );
      // p_gender にフォールバックを付けていない
      expect(code).toContain("p_gender: GENDER_FILTER_TO_DB[filters.gender],");
      expect(code).not.toMatch(/GENDER_FILTER_TO_DB\[[^\]]*\]\s*\?\?/);
      expect(code).not.toMatch(/GENDER_FILTER_TO_DB\[[^\]]*\]\s*\|\|/);
      expect(code).not.toMatch(/p_gender:[^,\n]*\?\?\s*0/);
    });

    it("[V-22] period=allTime は p_fiscal_year=null を渡す", async () => {
      await api.getRankings(TEAM_ID, filters({ period: { kind: "allTime" } }));

      expect((rpc.mock.calls[0]?.[1] as Record<string, unknown>).p_fiscal_year).toBeNull();
    });

    it("[V-22] period=fiscalYear は year をそのまま p_fiscal_year に渡す", async () => {
      await api.getRankings(TEAM_ID, filters({ period: { kind: "fiscalYear", year: 2024 } }));

      expect((rpc.mock.calls[0]?.[1] as Record<string, unknown>).p_fiscal_year).toBe(2024);
    });

    it("[V-20] aggregation は指定値をそのまま渡す (allRaces も RPC に届く)", async () => {
      await api.getRankings(TEAM_ID, filters({ aggregation: "allRaces" }));

      expect((rpc.mock.calls[0]?.[1] as Record<string, unknown>).p_aggregation).toBe("allRaces");
    });

    it("[V-20] 認可のための追加テーブルクエリを挟まない (認可は RPC 内で完結)", async () => {
      await api.getRankings(TEAM_ID, filters());

      // team_memberships を引いて自前で権限判定していたら、
      // 「RPC 内の述語」と「クライアントの述語」が二重管理になる
      expect(supabaseMock.getBuilderHistory("team_memberships")).toHaveLength(0);
      expect(supabaseMock.getBuilderHistory("records")).toHaveLength(0);
    });
  });

  describe("getRankings — 戻り値の写像", () => {
    it("[V-24] 13 列すべてを camelCase に写す", async () => {
      rpc.mockResolvedValue({ data: [rpcRow()], error: null });

      const result = await api.getRankings(TEAM_ID, filters());

      expect(result).toEqual([EXPECTED_RECORD]);
    });

    it("[V-24] RPC が返した並び順を変えない (順位の定義元は RPC の ORDER BY)", async () => {
      rpc.mockResolvedValue({
        data: [
          rpcRow({ record_id: "rec-slow", time: 33.02 }),
          rpcRow({ record_id: "rec-fast", time: 27.31 }),
          rpcRow({ record_id: "rec-mid", time: 29.07 }),
        ],
        error: null,
      });

      const result = await api.getRankings(TEAM_ID, filters());

      expect(result.map((record) => record.recordId)).toEqual(["rec-slow", "rec-fast", "rec-mid"]);
    });

    it("[V-28] competition_id/title/date が null の行 (一括登録記録) も落とさない", async () => {
      rpc.mockResolvedValue({
        data: [
          rpcRow({
            record_id: "rec-bulk",
            competition_id: null,
            competition_title: null,
            competition_date: null,
          }),
        ],
        error: null,
      });

      const result = await api.getRankings(TEAM_ID, filters());

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        recordId: "rec-bulk",
        competitionId: null,
        competitionTitle: null,
        competitionDate: null,
      });
    });

    it("[V-28] record_created_at が null でも行を落とさない (created_at は NOT NULL 制約が無い)", async () => {
      rpc.mockResolvedValue({
        data: [rpcRow({ record_id: "rec-no-created-at", record_created_at: null })],
        error: null,
      });

      const result = await api.getRankings(TEAM_ID, filters());

      expect(result).toHaveLength(1);
      expect(result[0]?.recordCreatedAt).toBeNull();
    });

    // -----------------------------------------------------------------------
    // 🚨 観点の作り直し (2026-09-08)
    //
    // 旧テストは「`avatar_path` が null でも行を落とさない」だったが、
    // **列そのものが RPC から消えたので観点が消滅した**。
    // 期待値を消すだけだと、代わりに守るべき不変条件が無くなる。
    //
    // 残すべき本質は **写像が allowlist であること**。
    // 両 migration は**本番未適用**なので、コードが先にデプロイされると
    // 本番の RPC は 14 列版のまま `avatar_path` を返し続ける。
    // 写像が「返ってきた列を素通しする」形だと、型に無い `avatarPath` が
    // オブジェクトに混入し (TS は実行時に消してくれない)、
    // 表示側が古い形に依存できてしまう。
    // -----------------------------------------------------------------------
    it("[V-28] RPC が余分な列を返しても写像が取り込まない (デプロイ順序に依らない)", async () => {
      // 本番に残っている 14 列版 (avatar_path 付き) の応答を再現する
      rpc.mockResolvedValue({
        data: [
          {
            ...rpcRow({ record_id: "rec-legacy-shape" }),
            avatar_path: "avatars/legacy.webp",
          },
        ],
        error: null,
      });

      const result = await api.getRankings(TEAM_ID, filters());

      expect(result).toHaveLength(1);
      // 行は落とさない (母集団を欠かせない)
      expect(result[0]?.recordId).toBe("rec-legacy-shape");
      // が、avatarPath は取り込まない
      expect(Object.keys(result[0] ?? {})).not.toContain("avatarPath");
      expect(result[0]).toEqual({ ...EXPECTED_RECORD, recordId: "rec-legacy-shape" });
    });

    it("[V-28] 写像の結果が 13 キーちょうどである (余剰キー / 欠落キーを検出)", async () => {
      rpc.mockResolvedValue({ data: [rpcRow()], error: null });

      const result = await api.getRankings(TEAM_ID, filters());

      expect(Object.keys(result[0] ?? {}).sort()).toEqual(
        [
          "recordId",
          "userId",
          "displayName",
          "time",
          "styleId",
          "style",
          "distance",
          "poolType",
          "gender",
          "competitionId",
          "competitionTitle",
          "competitionDate",
          "recordCreatedAt",
        ].sort(),
      );
    });

    it("[V-28] 写像のコードに avatar_path / avatarPath が現れない (ソース実測)", () => {
      const source = readFileSync(
        path.resolve(__dirname, "../../api/teams/rankings.ts"),
        "utf8",
      );
      const code = source
        .split("\n")
        .filter((line) => {
          const trimmed = line.trimStart();
          return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
        })
        .join("\n");

      expect(code).not.toContain("avatar_path");
      expect(code).not.toContain("avatarPath");
      expect(code).not.toContain("profile_image_path");
    });

    it("data が null のときは空配列を返す", async () => {
      rpc.mockResolvedValue({ data: null, error: null });

      await expect(api.getRankings(TEAM_ID, filters())).resolves.toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // [V-25 反転] 異常値の行でも落とさない (順位の母集団を欠かせない)
  //
  // Phase B レビューで `toRankingRecord` の行除外は**撤去された**。理由は2つ:
  //   1. `pool_type` の検証は到達不能だった。RPC は `r.pool_type = p_pool_type` の
  //      厳密一致で絞るため、返る値は呼び出し側が渡した値と恒等になる。
  //      「発火しないが、もし発火したら順位表から行を消す」コードだった
  //   2. `style` / `pool_type` は**順位の決定に一切使われない表示専用の列**。
  //      表示専用の列の検証を理由に行を落とすと、順位の母集団が静かに欠ける
  //      (`recordCreatedAt` が null でも行を落とさないのと同じ機構)
  //
  // 🚨 このブロックを「もう除外しないから」で削除してはいけない。
  //    将来誰かが「異常データを弾こう」と除外を再導入したとき、
  //    ランキングから人が消えるのに誰も気づけなくなる。
  //    **ガードは反対向きに必要** なので、ここでは「行が落ちないこと」を pin する。
  //
  // 型契約もこれに合わせて緩められている (`apps/shared/types/teamRanking.ts`):
  //   style: SwimStyle | null   (canonical 化できなければ null をそのまま持つ)
  //   poolType: number          (PoolType に狭めない = 再検証しない)
  // ---------------------------------------------------------------------------
  describe("getRankings — 異常値の行でも落とさない (順位の母集団を欠かせない)", () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it("[V-25] canonical 化できない style の行も残り、style が null になる (行数は入力と一致)", async () => {
      rpc.mockResolvedValue({
        data: [
          rpcRow({ record_id: "rec-canonical-alpha", style: "Fr" }),
          rpcRow({ record_id: "rec-relay-abbrev", style: "FR" }),
          rpcRow({ record_id: "rec-unknown-style", style: "MEDLEY" }),
          rpcRow({ record_id: "rec-canonical-bravo", style: "IM", style_id: 21, distance: 200 }),
        ],
        error: null,
      });

      const result = await api.getRankings(TEAM_ID, filters());

      // 1件も落ちない
      expect(result.map((record) => record.recordId)).toEqual([
        "rec-canonical-alpha",
        "rec-relay-abbrev",
        "rec-unknown-style",
        "rec-canonical-bravo",
      ]);
      // canonical 化できたものは canonical 値、できなかったものは null
      expect(result.map((record) => record.style)).toEqual(["Fr", null, null, "IM"]);
    });

    it("[V-25] canonical 化できない style を `as SwimStyle` で押し通していない (null になる)", async () => {
      rpc.mockResolvedValue({
        data: [rpcRow({ record_id: "rec-unknown-style", style: "MEDLEY" })],
        error: null,
      });

      const result = await api.getRankings(TEAM_ID, filters());

      // キャストで素通しすると "MEDLEY" がそのまま入り、下流の
      // `practice.styles.MEDLEY` が未定義キーとして表示に漏れる
      expect(result[0]?.style).toBeNull();
      expect(result[0]?.style).not.toBe("MEDLEY");
    });

    it("[V-25] legacy 小文字 'fr' の行は canonical Fr に救済される", async () => {
      rpc.mockResolvedValue({
        data: [rpcRow({ record_id: "rec-legacy", style: "fr" })],
        error: null,
      });

      const result = await api.getRankings(TEAM_ID, filters());

      expect(result).toHaveLength(1);
      expect(result[0]?.style).toBe("Fr");
    });

    it.each([2, -1, 7])(
      "[V-25] pool_type=%i の行も残り、値がそのまま入る (再検証しない)",
      async (poolType) => {
        rpc.mockResolvedValue({
          data: [
            rpcRow({ record_id: "rec-odd-pool", pool_type: poolType }),
            rpcRow({ record_id: "rec-normal-pool", pool_type: 1 }),
          ],
          error: null,
        });

        const result = await api.getRankings(TEAM_ID, filters());

        expect(result.map((record) => record.recordId)).toEqual([
          "rec-odd-pool",
          "rec-normal-pool",
        ]);
        expect(result[0]?.poolType).toBe(poolType);
      },
    );

    it("[V-25] pool_type=0 (短水路) もそのまま通る", async () => {
      rpc.mockResolvedValue({
        data: [rpcRow({ record_id: "rec-short-course", pool_type: 0 })],
        error: null,
      });

      const result = await api.getRankings(TEAM_ID, filters({ poolType: 0 }));

      expect(result).toHaveLength(1);
      expect(result[0]?.poolType).toBe(0);
    });

    it("[V-25] 異常値の行が混ざっても行数が RPC の戻り行数と厳密に一致する", async () => {
      // 「何行返ってきたか」= 「何行表示されるか」でなければ順位が嘘になる。
      // 除外が再導入されたら、ここが最初に赤くなる
      rpc.mockResolvedValue({
        data: [
          rpcRow({ record_id: "rec-1", style: "Fr", pool_type: 1 }),
          rpcRow({ record_id: "rec-2", style: "FR", pool_type: 1 }),
          rpcRow({ record_id: "rec-3", style: "Fr", pool_type: 2 }),
          rpcRow({ record_id: "rec-4", style: "", pool_type: -1 }),
          rpcRow({ record_id: "rec-5", style: "MEDLEY", pool_type: 7 }),
        ],
        error: null,
      });

      const result = await api.getRankings(TEAM_ID, filters());

      expect(result).toHaveLength(5);
      expect(result.map((record) => record.recordId)).toEqual([
        "rec-1",
        "rec-2",
        "rec-3",
        "rec-4",
        "rec-5",
      ]);
      // 到達不能な検証のためのログも出さない (ログ経路ごと撤去されている)
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe("getRankings — エラー", () => {
    it("[V-29] RPC のエラーオブジェクトをそのまま re-throw する (同一参照)", async () => {
      const rpcError = { code: "42501", message: "boom", details: null, hint: null };
      rpc.mockResolvedValue({ data: null, error: rpcError });

      // 文言ではなく「同じオブジェクトが飛んでくる」ことで検証する
      // (生エラー文字列を肯定形の期待値に書かない)
      await expect(api.getRankings(TEAM_ID, filters())).rejects.toBe(rpcError);
    });

    it("[V-29] エラー時は空配列で握り潰さない", async () => {
      rpc.mockResolvedValue({ data: [], error: { code: "P0001", message: "boom" } });

      await expect(api.getRankings(TEAM_ID, filters())).rejects.toBeTruthy();
    });
  });

  describe("hasAnyRecord", () => {
    it("[V-33] メンバー述語が RPC と同じ (team_id / status=approved / is_active=true)", async () => {
      supabaseMock.queueTable("team_memberships", [
        { data: [{ user_id: "usr-alpha" }, { user_id: "usr-bravo" }, { user_id: "usr-charlie" }] },
      ]);
      supabaseMock.queueTable("records", [{ data: null, configure: withCount(5) }]);

      await api.hasAnyRecord(TEAM_ID);

      const membershipBuilder = supabaseMock.getBuilder("team_memberships");
      const eqCalls = membershipBuilder.eq.mock.calls;
      expect(eqCalls).toEqual(
        expect.arrayContaining([
          ["team_id", TEAM_ID],
          ["status", "approved"],
          ["is_active", true],
        ]),
      );
      // 述語が3つだけ (余分な絞り込みで母集団が狭まっていない)
      expect(eqCalls).toHaveLength(3);
    });

    it("[V-33] records は承認済みメンバーの user_id に限定し、リレーのレグを除外する", async () => {
      supabaseMock.queueTable("team_memberships", [
        { data: [{ user_id: "usr-alpha" }, { user_id: "usr-bravo" }, { user_id: "usr-charlie" }] },
      ]);
      supabaseMock.queueTable("records", [{ data: null, configure: withCount(5) }]);

      const result = await api.hasAnyRecord(TEAM_ID);

      const recordsBuilder = supabaseMock.getBuilder("records");
      expect(recordsBuilder.in).toHaveBeenCalledWith("user_id", [
        "usr-alpha",
        "usr-bravo",
        "usr-charlie",
      ]);
      expect(recordsBuilder.eq).toHaveBeenCalledWith("is_relaying", false);
      expect(recordsBuilder.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
      expect(result).toBe(true);
    });

    it("[V-33] 承認済みメンバーが 0 人なら records を引かずに false を返す", async () => {
      supabaseMock.queueTable("team_memberships", [{ data: [] }]);

      const result = await api.hasAnyRecord(TEAM_ID);

      expect(result).toBe(false);
      expect(supabaseMock.getBuilderHistory("records")).toHaveLength(0);
    });

    it("[V-33] count=0 のとき false を返す", async () => {
      supabaseMock.queueTable("team_memberships", [{ data: [{ user_id: "usr-alpha" }] }]);
      supabaseMock.queueTable("records", [{ data: null, configure: withCount(0) }]);

      await expect(api.hasAnyRecord(TEAM_ID)).resolves.toBe(false);
    });

    it("[V-33] count が取得できない (null) とき false を返す (「記録が無い」側に倒す)", async () => {
      supabaseMock.queueTable("team_memberships", [{ data: [{ user_id: "usr-alpha" }] }]);
      supabaseMock.queueTable("records", [{ data: null, configure: withCount(null) }]);

      await expect(api.hasAnyRecord(TEAM_ID)).resolves.toBe(false);
    });

    it("memberships 取得エラーはそのまま re-throw する", async () => {
      const membershipError = { code: "42501", message: "boom" };
      supabaseMock.queueTable("team_memberships", [{ data: null, error: membershipError }]);

      await expect(api.hasAnyRecord(TEAM_ID)).rejects.toBe(membershipError);
    });

    it("records 取得エラーはそのまま re-throw する", async () => {
      const recordsError = { code: "42501", message: "boom" };
      supabaseMock.queueTable("team_memberships", [{ data: [{ user_id: "usr-alpha" }] }]);
      supabaseMock.queueTable("records", [{ data: null, error: recordsError }]);

      await expect(api.hasAnyRecord(TEAM_ID)).rejects.toBe(recordsError);
    });

    it("RPC は呼ばない (SECURITY DEFINER を空状態判定に使わない)", async () => {
      supabaseMock.queueTable("team_memberships", [{ data: [{ user_id: "usr-alpha" }] }]);
      supabaseMock.queueTable("records", [{ data: null, configure: withCount(3) }]);

      await api.hasAnyRecord(TEAM_ID);

      expect(rpc).not.toHaveBeenCalled();
    });
  });
});
