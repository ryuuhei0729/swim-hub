/**
 * TeamRelayRankings (web) — リレー記録ランキングのサブビュー (QA Sprint Contract Phase B / 第3弾)
 *
 * 対象:
 *   apps/web/components/team/rankings/TeamRelayRankings.tsx
 *   apps/web/components/team/rankings/RelayRankingFilters.tsx
 *   apps/web/components/team/rankings/RelayRankingTable.tsx
 *
 * Sprint Contract 検証観点:
 *   [V-RL-01] 初期表示は既定条件 (free / 100m / 長水路 / **男子**) で RPC を叩く。
 *             引数は 7 キーで `p_aggregation` を含まない (PM 裁定で廃止)
 *   [V-RL-01b] 絞り込みは `<fieldset>` + ネイティブ radio のグループである。
 *             同一 `name` でグループ化され `label for` ↔ `input id` が対応する
 *   [V-RL-02] ローディング / エラー / 空状態2種 の4状態が排他に出る
 *   [V-RL-03] エラー表示に生の PostgrestError 文字列を出さない。
 *             ただし `UserFacingError` は素通しする (対テスト)
 *   [V-RL-04] 空状態が「条件に一致なし」と「チームにリレー記録が無い」に分かれる
 *   [V-RL-05] 絞り込み (種類 / 1レグ距離 / 水路 / 性別区分) が RPC 引数に反映される
 *   [V-RL-06] 種類を medley に変えると `200m × 4` が選択肢から消え、
 *             200m 選択中なら 25m に落ちる。距離ラベルは `legDistanceOption`
 *             ("{distance}m × {legCount}") 由来で `× 4` のハードコードではない
 *   [V-RL-07] 行を展開するとレグの 泳者 / 泳法 / 区間 / 通算 が出る。
 *             **通算は区間タイムの積み上げ**であり RPC の値をそのまま出していない
 *   [V-RL-08] 退会した泳者 (displayName=null) のレグでも行が欠けない
 *   [V-RL-09] レグ 0 件のリレー記録は行を落とさず「ラップ無し」の文言を出す
 *   [V-RL-10] 並べ替え UI が無い (並び順の定義元は RPC の ORDER BY のみ)
 *   [V-RL-11] 大会に紐づかない行は `common.none` と作成日時フォールバックで出る
 *
 * モック方針:
 *   Supabase クライアントだけをフェイクにし、TeamRelayRankings →
 *   useTeamRelayRankingsQuery → TeamRelayRankingsAPI → rpc() は実物を通す。
 *   フェイクは RPC 名と**引数を捨てずに記録する**ので「UI 操作がサーバー引数に
 *   届いたか」を直接 assert できる。
 *
 * トートロジー防止:
 *   期待値 (通算タイム・順位・ラベル) はすべてリテラルで書く。
 *   プロダクションの `calcCumulativeTimes` / `assignCompetitionRanks` を
 *   テスト内で呼んで期待値を作らない。
 *   fixture の総合タイムは 3:34.55 / 3:38.07 / 3:41.20 のように
 *   互いの部分文字列にならない値を選ぶ。
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import messages from "@apps/shared/messages/ja.json";
import { UserFacingError } from "@apps/shared/utils/userFacingError";
import { buildDefaultRelayRankingFilters } from "@apps/shared/utils/relayRankingAxis";
import type { TeamRelayRankingFilters } from "@apps/shared/types";
import TeamRelayRankings from "@/components/team/rankings/TeamRelayRankings";

// private バケットの署名付きURL解決はこのテストの関心外
vi.mock("@/lib/image-url", () => ({
  getSignedImageUrl: vi.fn().mockResolvedValue(null),
}));

const TEAM_ID = "team-petrel";
const relay = messages.teams.ranking.relay;

/** RPC が返すレグ (RPC 側で camelCase を組んでいる) */
function rpcLeg(overrides: Record<string, unknown> = {}) {
  return {
    legId: "leg-petrel-alpha",
    legIndex: 0,
    userId: "usr-petrel-alpha",
    displayName: "アルファ",
    styleId: 3,
    style: "Fr",
    legTime: 53.4,
    reactionTime: null,
    ...overrides,
  };
}

/**
 * 4 レグ (区間 53.40 / 54.20 / 53.55 / 53.40 → 総合 214.55 = 3:34.55)。
 * 通算の期待値: 53.40 / 1:47.60 / 2:41.15 / 3:34.55
 */
function fourLegs() {
  return [
    rpcLeg({ legId: "leg-petrel-first", legIndex: 0, displayName: "アルファ", legTime: 53.4 }),
    rpcLeg({
      legId: "leg-petrel-second",
      legIndex: 1,
      userId: "usr-petrel-bravo",
      displayName: "ブラボー",
      legTime: 54.2,
      reactionTime: 0.31,
    }),
    rpcLeg({
      legId: "leg-petrel-third",
      legIndex: 2,
      userId: "usr-petrel-charlie",
      displayName: "チャーリー",
      legTime: 53.55,
      reactionTime: 0.28,
    }),
    rpcLeg({
      legId: "leg-petrel-fourth",
      legIndex: 3,
      userId: "usr-petrel-delta",
      displayName: "デルタ",
      legTime: 53.4,
      reactionTime: 0.33,
    }),
  ];
}

/** RPC が返す1行 (snake_case) */
function rpcRow(overrides: Record<string, unknown> = {}) {
  return {
    relay_record_id: "rr-petrel-fastest",
    relay_kind: "free",
    leg_distance: 100,
    leg_count: 4,
    pool_type: 1,
    gender_category: "male",
    total_time: 214.55,
    competition_id: "cmp-petrel-spring",
    competition_title: "ペトレル春季記録会",
    competition_date: "2026-05-03",
    relay_created_at: "2026-05-04T09:15:00+09:00",
    legs: fourLegs(),
    ...overrides,
  };
}

interface FakeOptions {
  rankings?:
    | Array<Record<string, unknown>>
    | ((args: Record<string, unknown>) => Array<Record<string, unknown>>);
  rankingsError?: unknown;
  /** relay_records の件数 (空状態2種の出しわけに使う) */
  relayRecordCount?: number;
}

interface FakeSupabase {
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
  /** `.eq()` の列名・値を捨てずに記録する */
  eqCalls: Array<{ table: string; column: string; value: unknown }>;
  fromCalls: string[];
  client: never;
}

function makeSupabase(options: FakeOptions = {}): FakeSupabase {
  const { rankings = [], rankingsError = null, relayRecordCount = 7 } = options;

  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const eqCalls: Array<{ table: string; column: string; value: unknown }> = [];
  const fromCalls: string[] = [];

  const makeThenable = (table: string, result: { data: unknown; error: unknown; count?: number }) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "order", "in", "is", "limit", "not", "ilike"]) {
      builder[method] = vi.fn(() => builder);
    }
    // eq は引数を捨てない (サーバー絞り込みとクライアント filter を区別するため)
    builder.eq = vi.fn((column: string, value: unknown) => {
      eqCalls.push({ table, column, value });
      return builder;
    });
    builder.single = vi.fn(async () => result);
    builder.maybeSingle = vi.fn(async () => result);
    builder.then = (
      onfulfilled?: ((value: typeof result) => unknown) | null,
      onrejected?: ((reason: unknown) => unknown) | null,
    ) => Promise.resolve(result).then(onfulfilled, onrejected);
    return builder;
  };

  const client = {
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      if (table === "relay_records") {
        return makeThenable(table, { data: null, error: null, count: relayRecordCount });
      }
      return makeThenable(table, { data: [], error: null });
    }),
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (rankingsError) return { data: null, error: rankingsError };
      const data = typeof rankings === "function" ? rankings(args) : rankings;
      return { data, error: null };
    }),
  };

  return { rpcCalls, eqCalls, fromCalls, client: client as unknown as never };
}

const mocks = vi.hoisted(() => ({ supabase: { current: null as unknown } }));

vi.mock("@/contexts", () => ({
  useAuth: () => ({ supabase: mocks.supabase.current, user: { id: "usr-petrel-alpha" } }),
}));

/**
 * 絞り込み条件は **親 (`./TeamRankings.tsx`) が保持する**。
 *
 * ⚠️ **種目軸の統合 (2026-09-08) でこのコンポーネントは絞り込みを描画しなくなった。**
 *    個人5種目 + リレー2種類の7択ラジオ1つが親側にあり、リレーを選んだときだけ
 *    親がこのコンポーネントを結果カラムに mount する。よって
 *      - `onFiltersChange` prop は撤去された (ここから条件を変える経路が無い)
 *      - 絞り込み UI (`team-relay-rankings-{kind,leg-distance,...}`) は存在しない
 *    絞り込み UI 経由の検証は親の
 *    `./TeamRankings.test.tsx` の `[V-RL-F]` に移した。
 *    選択肢の並び・距離の引き継ぎ規則そのものは
 *    `apps/shared/__tests__/utils/rankingEventAxis.test.ts` が定義元。
 *
 * ここで検証するのは「渡された条件をそのまま RPC に流し、結果を描く」ことである。
 */
function renderRelayRankings(filters: TeamRelayRankingFilters = buildDefaultRelayRankingFilters()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <QueryClientProvider client={queryClient}>
        <TeamRelayRankings teamId={TEAM_ID} filters={filters} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

async function lastRpcArgs(fake: FakeSupabase, atLeast = 1) {
  await waitFor(() => expect(fake.rpcCalls.length).toBeGreaterThanOrEqual(atLeast));
  return fake.rpcCalls.at(-1)?.args as Record<string, unknown>;
}

describe("TeamRelayRankings (web)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // [V-RL-01] 初期表示の RPC 引数
  // -------------------------------------------------------------------------
  describe("[V-RL-01] 初期表示", () => {
    it("既定条件 (free / 100m / 長水路 / 男子 / 通算) で RPC を叩く", async () => {
      const fake = makeSupabase({ rankings: [rpcRow()] });
      mocks.supabase.current = fake.client;

      renderRelayRankings();

      const args = await lastRpcArgs(fake);
      expect(fake.rpcCalls[0]?.name).toBe("get_team_relay_rankings");
      expect(args).toEqual({
        p_team_id: TEAM_ID,
        p_relay_kind: "free",
        p_leg_distance: 100,
        p_pool_type: 1,
        // ユーザー依頼で「すべて」を廃止し男子を既定にした。
        // RPC 側の `p_gender_category IS NULL = すべて` の実装は将来の復活用に
        // 残っているが、UI からは NULL を送らない
        p_gender_category: "male",
        // migration 20260909000000 で追加。通算は `null` + `false`
        // (対応表の定義元は `api/teams/rankingPeriod.ts` の `periodToRpcArgs`)
        p_fiscal_year: null,
        p_fiscal_year_or_earlier: false,
        p_limit: 500,
      });
    });

    // ⚠️ **2つの観点を1つの assert に混ぜてはいけない** (PM 裁定 2026-09-09)。
    //    以前は「`p_aggregation` を含まない」と「引数がちょうど7つ」を同じ
    //    it で見ていたため、**正しい引数追加 (`p_fiscal_year_or_earlier`) が
    //    「長さ7のはずが8」でブロックされた**。pgTAP `V-DB-61c` で同型の問題を
    //    正しく処理したのと同じ方針で分ける。
    //      (a) `p_aggregation` の不在 … 総数に依存しない否定形。**観点の本体**
    //      (b) 引数セットの厳密一致  … シグネチャが変わるたびに更新する計器
    it("(a) RPC 引数に p_aggregation を含まない (PM 裁定で廃止された軸が復活していない)", async () => {
      // `p_aggregation='teamBest'` は既定の `p_gender_category=NULL` で
      // 男子・女子・混合をまたいで最速1本を返す壊れた挙動だった。
      // 復活させるなら PARTITION BY gender_category を伴う設計が必要。
      // ⚠️ ここでは**総数を見ない**。引数が増えてもこの観点は変わらない
      const fake = makeSupabase({ rankings: [rpcRow()] });
      mocks.supabase.current = fake.client;

      renderRelayRankings();
      const args = await lastRpcArgs(fake);

      expect(Object.keys(args)).not.toContain("p_aggregation");
    });

    it("(b) RPC 引数セットが契約どおり (名前と総数)", async () => {
      const fake = makeSupabase({ rankings: [rpcRow()] });
      mocks.supabase.current = fake.client;

      renderRelayRankings();
      const args = await lastRpcArgs(fake);

      expect(Object.keys(args).sort()).toEqual(
        [
          "p_team_id",
          "p_relay_kind",
          "p_leg_distance",
          "p_pool_type",
          "p_gender_category",
          "p_fiscal_year",
          "p_fiscal_year_or_earlier",
          "p_limit",
        ].sort(),
      );
    });

    it("styles マスターを取得しない (リレーの軸は静的定義から決まる)", async () => {
      const fake = makeSupabase({ rankings: [rpcRow()] });
      mocks.supabase.current = fake.client;

      renderRelayRankings();
      await lastRpcArgs(fake);

      expect(fake.fromCalls).not.toContain("styles");
    });

    it("結果があるときは hasAnyRelayRecord を問い合わせない (無駄な往復をしない)", async () => {
      const fake = makeSupabase({ rankings: [rpcRow()] });
      mocks.supabase.current = fake.client;

      renderRelayRankings();
      await waitFor(() => expect(screen.getByText("3:34.55")).toBeTruthy());

      expect(fake.fromCalls).not.toContain("relay_records");
    });
  });

  // -------------------------------------------------------------------------
  // [V-RL-02] 4 状態が排他に出る
  // -------------------------------------------------------------------------
  describe("[V-RL-02] ローディング / エラー / 空状態", () => {
    it("RPC 解決前はローディングだけを出す (表もエラーも空状態も出さない)", () => {
      const client = {
        from: vi.fn(() => {
          const builder: Record<string, unknown> = {};
          for (const method of ["select", "order", "eq", "in"]) {
            builder[method] = vi.fn(() => builder);
          }
          builder.then = () => new Promise(() => {});
          return builder;
        }),
        rpc: vi.fn(() => new Promise(() => {})),
      };
      mocks.supabase.current = client as unknown as never;

      renderRelayRankings();

      expect(screen.getByTestId("team-relay-rankings-loading")).toBeTruthy();
      expect(screen.queryByTestId("team-relay-rankings-error")).toBeNull();
      expect(screen.queryByTestId("team-relay-rankings-empty-no-match")).toBeNull();
      expect(screen.queryByTestId("team-relay-rankings-empty-no-records")).toBeNull();
    });

    it("読み込み中に「エラー」表示を出さない (偽エラーが1フレーム挟まらない)", () => {
      const client = {
        from: vi.fn(() => {
          const builder: Record<string, unknown> = {};
          for (const method of ["select", "order", "eq", "in"]) {
            builder[method] = vi.fn(() => builder);
          }
          builder.then = () => new Promise(() => {});
          return builder;
        }),
        rpc: vi.fn(() => new Promise(() => {})),
      };
      mocks.supabase.current = client as unknown as never;

      renderRelayRankings();

      expect(screen.queryByText(relay.error)).toBeNull();
      expect(screen.queryByTestId("team-relay-rankings-error")).toBeNull();
      // ⚠️ 絞り込みは親が描くのでここには無い。「読み込み中も絞り込みを操作できる」
      //    の検証は親の `./TeamRankings.test.tsx` [V-RL-F] に移した
      expect(screen.queryByTestId("team-relay-rankings-kind")).toBeNull();
      // 読み込み表示そのものは出る (無言で空白にならない)
      expect(screen.getByTestId("team-relay-rankings-loading")).toBeInTheDocument();
    });

    it("🚨 渡された条件をそのまま RPC に流す (このコンポーネントは条件を書き換えない)", async () => {
      // 絞り込みを持たなくなった代わりに、prop → RPC の透過性がこの
      // コンポーネントの責務になった。ここで正規化や既定値の再適用をすると
      // 「画面に出ている条件と問い合わせている条件が食い違う」状態が生まれる
      const fake = makeSupabase({ rankings: [] });
      mocks.supabase.current = fake.client;

      renderRelayRankings({
        ...buildDefaultRelayRankingFilters(),
        relayKind: "medley",
        legDistance: 50,
        poolType: 0,
        genderCategory: "mixed",
      });

      const args = await lastRpcArgs(fake);
      expect(args.p_relay_kind).toBe("medley");
      expect(args.p_leg_distance).toBe(50);
      expect(args.p_pool_type).toBe(0);
      expect(args.p_gender_category).toBe("mixed");
      expect(args.p_team_id).toBe(TEAM_ID);
    });

    it("性別区分 male / female / mixed のどれも NULL に落ちない", async () => {
      // `p_gender_category IS NULL` は RPC 側で「すべて」を意味する。
      // 3値のどれかが NULL に化けると、性別をまたいだ順位表が静かに出る
      for (const genderCategory of ["male", "female", "mixed"] as const) {
        const fake = makeSupabase({ rankings: [] });
        mocks.supabase.current = fake.client;

        const view = renderRelayRankings({
          ...buildDefaultRelayRankingFilters(),
          genderCategory,
        });
        const args = await lastRpcArgs(fake);

        expect(args.p_gender_category, genderCategory).toBe(genderCategory);
        expect(args.p_gender_category, genderCategory).not.toBeNull();
        view.unmount();
      }
    });

    it("結果があるときは件数を出し、エラー・空状態を出さない", async () => {
      const fake = makeSupabase({
        rankings: [
          rpcRow({ relay_record_id: "rr-petrel-a", total_time: 214.55 }),
          rpcRow({ relay_record_id: "rr-petrel-b", total_time: 218.07 }),
          rpcRow({ relay_record_id: "rr-petrel-c", total_time: 221.2 }),
        ],
      });
      mocks.supabase.current = fake.client;

      renderRelayRankings();

      await waitFor(() =>
        expect(screen.getByTestId("team-relay-rankings-result-count").textContent).toBe("3件"),
      );
      expect(screen.queryByTestId("team-relay-rankings-error")).toBeNull();
      expect(screen.queryByTestId("team-relay-rankings-empty-no-match")).toBeNull();
      expect(screen.queryByTestId("team-relay-rankings-loading")).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // [V-RL-03] 生エラーを出さない / UserFacingError は素通しする
  // -------------------------------------------------------------------------
  describe("[V-RL-03] エラー表示", () => {
    it("生の PostgrestError の message / details / hint を画面に出さない", async () => {
      const fake = makeSupabase({
        rankingsError: {
          message: 'relation "public.relay_records" does not exist',
          details: 'policy "Team members can view relay records"',
          hint: "check search_path",
          code: "42P01",
        },
      });
      mocks.supabase.current = fake.client;

      renderRelayRankings();

      await waitFor(() => expect(screen.getByTestId("team-relay-rankings-error")).toBeTruthy());

      // ⚠️ 生の文字列を肯定形で期待値に書かない。
      //    「テーブル名・ポリシー名・エラーコードが画面に無いこと」を否定形で見る
      const body = document.body.textContent ?? "";
      for (const leaked of ["relay_records", "does not exist", "42P01", "search_path", "policy"]) {
        expect(body).not.toContain(leaked);
      }
      // 汎用文言にフォールバックしている
      expect(screen.getByText(relay.error)).toBeTruthy();
    });

    it("UserFacingError は素通しする (全部を汎用文言に潰していない)", async () => {
      // 生エラーを隠す修正が「例外を全部同じ文言にする」だけになっていないことの対テスト。
      // これが無いと、意図してユーザーへ見せる文言も一緒に消える退行を検出できない
      const fake = makeSupabase({
        rankingsError: new UserFacingError("チームのリレー記録を表示する権限がありません"),
      });
      mocks.supabase.current = fake.client;

      renderRelayRankings();

      await waitFor(() =>
        expect(
          screen.getByText("チームのリレー記録を表示する権限がありません"),
        ).toBeTruthy(),
      );
      expect(screen.queryByText(relay.error)).toBeNull();
    });

    it("再試行ボタンが RPC を再実行する", async () => {
      const user = userEvent.setup();
      const fake = makeSupabase({ rankingsError: { message: "boom", code: "XX000" } });
      mocks.supabase.current = fake.client;

      renderRelayRankings();
      await waitFor(() => expect(screen.getByTestId("team-relay-rankings-retry")).toBeTruthy());

      const before = fake.rpcCalls.length;
      await user.click(screen.getByTestId("team-relay-rankings-retry"));

      await waitFor(() => expect(fake.rpcCalls.length).toBeGreaterThan(before));
    });
  });

  // -------------------------------------------------------------------------
  // [V-RL-04] 空状態 2 種の出しわけ
  // -------------------------------------------------------------------------
  describe("[V-RL-04] 空状態 2 種", () => {
    it("チームにリレー記録が 1 件も無いときは「チームにリレー記録がありません」", async () => {
      const fake = makeSupabase({ rankings: [], relayRecordCount: 0 });
      mocks.supabase.current = fake.client;

      renderRelayRankings();

      await waitFor(() =>
        expect(screen.getByTestId("team-relay-rankings-empty-no-records")).toBeTruthy(),
      );
      expect(screen.getByText(relay.empty.noRecordsTitle)).toBeTruthy();
      expect(screen.queryByTestId("team-relay-rankings-empty-no-match")).toBeNull();
    });

    it("リレー記録はあるが条件に一致しないときは「該当するリレー記録がありません」", async () => {
      const fake = makeSupabase({ rankings: [], relayRecordCount: 5 });
      mocks.supabase.current = fake.client;

      renderRelayRankings();

      await waitFor(() =>
        expect(screen.getByTestId("team-relay-rankings-empty-no-match")).toBeTruthy(),
      );
      expect(screen.getByText(relay.empty.noMatchTitle)).toBeTruthy();
      expect(screen.queryByTestId("team-relay-rankings-empty-no-records")).toBeNull();
    });

    it("hasAnyRelayRecord は team_id をサーバー側の絞り込み条件として渡す", async () => {
      const fake = makeSupabase({ rankings: [], relayRecordCount: 0 });
      mocks.supabase.current = fake.client;

      renderRelayRankings();
      await waitFor(() =>
        expect(screen.getByTestId("team-relay-rankings-empty-no-records")).toBeTruthy(),
      );

      expect(fake.eqCalls.filter((c) => c.table === "relay_records")).toEqual([
        { table: "relay_records", column: "team_id", value: TEAM_ID },
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // [V-RL-07] 行の展開
  // -------------------------------------------------------------------------
  describe("[V-RL-07] 行を展開してレグを見る", () => {
    it("既定ではレグが折りたたまれている", async () => {
      const fake = makeSupabase({ rankings: [rpcRow()] });
      mocks.supabase.current = fake.client;

      renderRelayRankings();
      await waitFor(() => expect(screen.getByText("3:34.55")).toBeTruthy());

      expect(screen.queryByTestId("team-relay-rankings-legs-rr-petrel-fastest")).toBeNull();
      expect(screen.queryByText(relay.legHeader.cumulative)).toBeNull();
      expect(
        screen.getByTestId("team-relay-rankings-toggle-rr-petrel-fastest").getAttribute("aria-expanded"),
      ).toBe("false");
    });

    it("展開すると 泳者 / 泳法 / 区間 / 通算 の 4 列と 4 レグが出る", async () => {
      const user = userEvent.setup();
      const fake = makeSupabase({ rankings: [rpcRow()] });
      mocks.supabase.current = fake.client;

      renderRelayRankings();
      await waitFor(() => expect(screen.getByText("3:34.55")).toBeTruthy());

      await user.click(screen.getByTestId("team-relay-rankings-toggle-rr-petrel-fastest"));

      const legs = await screen.findByTestId("team-relay-rankings-legs-rr-petrel-fastest");
      const scoped = within(legs);

      for (const header of [
        relay.legHeader.swimmer,
        relay.legHeader.style,
        relay.legHeader.legTime,
        relay.legHeader.cumulative,
      ]) {
        expect(scoped.getByText(header)).toBeTruthy();
      }

      // 第N泳者ラベルと泳者名 (4 レグすべて)
      for (const [num, name] of [
        [1, "アルファ"],
        [2, "ブラボー"],
        [3, "チャーリー"],
        [4, "デルタ"],
      ] as const) {
        expect(scoped.getByText(new RegExp(`第${num}泳者`))).toBeTruthy();
        expect(scoped.getByText(new RegExp(name))).toBeTruthy();
      }

      // 泳法は practice.styles.Fr の再利用 (relay 名前空間に複製していない)
      expect(scoped.getAllByText(messages.practice.styles.Fr)).toHaveLength(4);
    });

    it("通算タイムは区間タイムの積み上げである (区間の値をそのまま並べていない)", async () => {
      const user = userEvent.setup();
      const fake = makeSupabase({ rankings: [rpcRow()] });
      mocks.supabase.current = fake.client;

      renderRelayRankings();
      await waitFor(() => expect(screen.getByText("3:34.55")).toBeTruthy());

      await user.click(screen.getByTestId("team-relay-rankings-toggle-rr-petrel-fastest"));
      const legs = await screen.findByTestId("team-relay-rankings-legs-rr-petrel-fastest");

      // 区間 53.40 / 54.20 / 53.55 / 53.40 に対する通算の期待値はリテラルで書く
      // (calcCumulativeTimes を呼んで期待値を作るとトートロジーになる)
      const rows = within(legs).getAllByRole("row").slice(1); // 先頭はヘッダー行
      expect(rows).toHaveLength(4);

      const cells = rows.map((row) =>
        within(row)
          .getAllByRole("cell")
          .map((cell) => cell.textContent ?? ""),
      );

      // [泳者, 泳法, 区間, 通算]
      expect(cells.map((c) => c[2])).toEqual(["53.40", "54.20", "53.55", "53.40"]);
      expect(cells.map((c) => c[3])).toEqual(["53.40", "1:47.60", "2:41.15", "3:34.55"]);
    });

    it("通算の最終値が総合タイムと一致する (レグの和と保存値が一致する fixture)", async () => {
      const user = userEvent.setup();
      const fake = makeSupabase({ rankings: [rpcRow()] });
      mocks.supabase.current = fake.client;

      renderRelayRankings();
      await waitFor(() => expect(screen.getByText("3:34.55")).toBeTruthy());

      await user.click(screen.getByTestId("team-relay-rankings-toggle-rr-petrel-fastest"));
      const legs = await screen.findByTestId("team-relay-rankings-legs-rr-petrel-fastest");

      expect(within(legs).getAllByText("3:34.55")).toHaveLength(1);
    });

    it("総合タイムはレグの和で置き換えない (公式記録が和とずれる行でも保存値を出す)", async () => {
      // 区間の和は 214.55 (3:34.55) だが total_time は 214.5 (3:34.50)。
      // 表の総合タイム列は **保存値** を出すのが仕様
      const fake = makeSupabase({ rankings: [rpcRow({ total_time: 214.5 })] });
      mocks.supabase.current = fake.client;

      renderRelayRankings();

      const row = await screen.findByTestId("team-relay-rankings-row-rr-petrel-fastest");
      expect(within(row).getByText("3:34.50")).toBeTruthy();
      expect(within(row).queryByText("3:34.55")).toBeNull();
    });

    it("もう一度押すと折りたたまれる", async () => {
      const user = userEvent.setup();
      const fake = makeSupabase({ rankings: [rpcRow()] });
      mocks.supabase.current = fake.client;

      renderRelayRankings();
      await waitFor(() => expect(screen.getByText("3:34.55")).toBeTruthy());

      const toggle = screen.getByTestId("team-relay-rankings-toggle-rr-petrel-fastest");
      await user.click(toggle);
      await screen.findByTestId("team-relay-rankings-legs-rr-petrel-fastest");

      await user.click(toggle);
      await waitFor(() =>
        expect(screen.queryByTestId("team-relay-rankings-legs-rr-petrel-fastest")).toBeNull(),
      );
    });

    it("複数行のうち押した行だけが展開される", async () => {
      const user = userEvent.setup();
      const fake = makeSupabase({
        rankings: [
          rpcRow({ relay_record_id: "rr-petrel-one", total_time: 214.55 }),
          rpcRow({ relay_record_id: "rr-petrel-two", total_time: 218.07 }),
          rpcRow({ relay_record_id: "rr-petrel-three", total_time: 221.2 }),
        ],
      });
      mocks.supabase.current = fake.client;

      renderRelayRankings();
      await waitFor(() => expect(screen.getByText("3:41.20")).toBeTruthy());

      await user.click(screen.getByTestId("team-relay-rankings-toggle-rr-petrel-two"));

      await screen.findByTestId("team-relay-rankings-legs-rr-petrel-two");
      expect(screen.queryByTestId("team-relay-rankings-legs-rr-petrel-one")).toBeNull();
      expect(screen.queryByTestId("team-relay-rankings-legs-rr-petrel-three")).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // [V-RL-08] [V-RL-09] 欠損データの扱い
  // -------------------------------------------------------------------------
  describe("[V-RL-08] 退会した泳者", () => {
    it("displayName=null のレグでも 4 レグすべてが出る (行が欠けない)", async () => {
      const user = userEvent.setup();
      const legs = fourLegs();
      const retired = { ...rpcLeg(), legId: "leg-petrel-first", legIndex: 0, userId: null, displayName: null, legTime: 53.4 };
      const fake = makeSupabase({
        rankings: [rpcRow({ legs: [retired, ...legs.slice(1)] })],
      });
      mocks.supabase.current = fake.client;

      renderRelayRankings();
      await waitFor(() => expect(screen.getByText("3:34.55")).toBeTruthy());

      await user.click(screen.getByTestId("team-relay-rankings-toggle-rr-petrel-fastest"));
      const legsBlock = await screen.findByTestId("team-relay-rankings-legs-rr-petrel-fastest");

      const rows = within(legsBlock).getAllByRole("row").slice(1);
      expect(rows).toHaveLength(4);
      // 退会した泳者は専用の文言 (空文字にしない)
      expect(within(legsBlock).getByText(new RegExp(relay.retiredMember))).toBeTruthy();
    });

    it("退会レグがあっても通算の積み上げが崩れない", async () => {
      const user = userEvent.setup();
      const legs = fourLegs();
      const retired = { ...legs[1], userId: null, displayName: null };
      const fake = makeSupabase({
        rankings: [rpcRow({ legs: [legs[0], retired, legs[2], legs[3]] })],
      });
      mocks.supabase.current = fake.client;

      renderRelayRankings();
      await waitFor(() => expect(screen.getByText("3:34.55")).toBeTruthy());

      await user.click(screen.getByTestId("team-relay-rankings-toggle-rr-petrel-fastest"));
      const legsBlock = await screen.findByTestId("team-relay-rankings-legs-rr-petrel-fastest");

      const cumulatives = within(legsBlock)
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("cell")[3]?.textContent ?? "");

      expect(cumulatives).toEqual(["53.40", "1:47.60", "2:41.15", "3:34.55"]);
    });

    it("legs が legIndex の逆順で来ても昇順に整えて出す (境界で順序を確定させている)", async () => {
      const user = userEvent.setup();
      const fake = makeSupabase({ rankings: [rpcRow({ legs: [...fourLegs()].reverse() })] });
      mocks.supabase.current = fake.client;

      renderRelayRankings();
      await waitFor(() => expect(screen.getByText("3:34.55")).toBeTruthy());

      await user.click(screen.getByTestId("team-relay-rankings-toggle-rr-petrel-fastest"));
      const legsBlock = await screen.findByTestId("team-relay-rankings-legs-rr-petrel-fastest");

      const swimmerCells = within(legsBlock)
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("cell")[0]?.textContent ?? "");

      // Avatar が名前の頭文字を描くので、セルの先頭には頭文字が付く。
      // 検証したいのは並び順なので「第N泳者 / 名前」の部分だけを取り出す
      // (先頭 1 文字を落とすのではなく "第" 以降を切り出す = 頭文字の有無に依存しない)
      const normalized = swimmerCells.map((text) => {
        const stripped = text.replace(/\s/g, "");
        const start = stripped.indexOf("第");
        return start === -1 ? stripped : stripped.slice(start);
      });

      expect(normalized).toEqual([
        "第1泳者/アルファ",
        "第2泳者/ブラボー",
        "第3泳者/チャーリー",
        "第4泳者/デルタ",
      ]);
    });
  });

  describe("[V-RL-09] レグ 0 件のリレー記録", () => {
    it("行そのものは順位の母集団として残る", async () => {
      const fake = makeSupabase({
        rankings: [
          rpcRow({ relay_record_id: "rr-petrel-nolegs", total_time: 214.55, legs: [] }),
          rpcRow({ relay_record_id: "rr-petrel-withlegs", total_time: 218.07 }),
        ],
      });
      mocks.supabase.current = fake.client;

      renderRelayRankings();

      await waitFor(() =>
        expect(screen.getByTestId("team-relay-rankings-row-rr-petrel-nolegs")).toBeTruthy(),
      );
      expect(screen.getByTestId("team-relay-rankings-result-count").textContent).toBe("2件");
    });

    it("展開すると「ラップが登録されていない」旨の文言が出る (空の表を出さない)", async () => {
      const user = userEvent.setup();
      const fake = makeSupabase({
        rankings: [rpcRow({ relay_record_id: "rr-petrel-nolegs", legs: [] })],
      });
      mocks.supabase.current = fake.client;

      renderRelayRankings();
      await waitFor(() => expect(screen.getByText("3:34.55")).toBeTruthy());

      await user.click(screen.getByTestId("team-relay-rankings-toggle-rr-petrel-nolegs"));

      const legsBlock = await screen.findByTestId("team-relay-rankings-legs-rr-petrel-nolegs");
      expect(within(legsBlock).getByText(relay.noLegs)).toBeTruthy();
      expect(within(legsBlock).queryByText(relay.legHeader.cumulative)).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // [V-RL-10] 並べ替え UI が無い
  // -------------------------------------------------------------------------
  describe("[V-RL-10] 並べ替え UI を持たない", () => {
    it("列ヘッダーがボタンになっていない (押して並べ替えられない)", async () => {
      const fake = makeSupabase({
        rankings: [
          rpcRow({ relay_record_id: "rr-petrel-one", total_time: 214.55 }),
          rpcRow({ relay_record_id: "rr-petrel-two", total_time: 218.07 }),
          rpcRow({ relay_record_id: "rr-petrel-three", total_time: 221.2 }),
        ],
      });
      mocks.supabase.current = fake.client;

      renderRelayRankings();
      await waitFor(() => expect(screen.getByText("3:41.20")).toBeTruthy());

      for (const header of [
        relay.col.event,
        relay.col.time,
        relay.col.competition,
        relay.col.date,
      ]) {
        // 列ヘッダーがボタン / リンクになっていない
        expect(screen.queryByRole("button", { name: header })).toBeNull();

        const columnHeader = screen.getByRole("columnheader", { name: header });
        expect(columnHeader.querySelector("button")).toBeNull();
        expect(columnHeader.getAttribute("aria-sort")).toBeNull();
      }
      expect(screen.queryByText(messages.common.listToolbar.sortButton)).toBeNull();
    });

    it("表示順は RPC が返した順序そのままである (クライアント側で並べ替えない)", async () => {
      // RPC は総合タイム昇順で返す契約だが、あえて崩した順序を返して
      // クライアントが並べ替えないことを確認する
      const fake = makeSupabase({
        rankings: [
          rpcRow({ relay_record_id: "rr-petrel-third", total_time: 221.2 }),
          rpcRow({ relay_record_id: "rr-petrel-first", total_time: 214.55 }),
          rpcRow({ relay_record_id: "rr-petrel-second", total_time: 218.07 }),
        ],
      });
      mocks.supabase.current = fake.client;

      renderRelayRankings();
      await waitFor(() => expect(screen.getByText("3:41.20")).toBeTruthy());

      const bodyRows = screen
        .getAllByTestId(/^team-relay-rankings-row-/)
        .map((row) => row.getAttribute("data-testid"));

      expect(bodyRows).toEqual([
        "team-relay-rankings-row-rr-petrel-third",
        "team-relay-rankings-row-rr-petrel-first",
        "team-relay-rankings-row-rr-petrel-second",
      ]);
    });

    it("同着は同順位で、次順位が件数分スキップされる (1, 2, 2, 4)", async () => {
      const fake = makeSupabase({
        rankings: [
          rpcRow({ relay_record_id: "rr-petrel-r1", total_time: 214.55 }),
          rpcRow({ relay_record_id: "rr-petrel-r2", total_time: 218.07 }),
          rpcRow({ relay_record_id: "rr-petrel-r3", total_time: 218.07 }),
          rpcRow({ relay_record_id: "rr-petrel-r4", total_time: 221.2 }),
        ],
      });
      mocks.supabase.current = fake.client;

      renderRelayRankings();
      await waitFor(() => expect(screen.getByText("3:41.20")).toBeTruthy());

      const ranks = screen
        .getAllByTestId(/^team-relay-rankings-row-/)
        .map((row) => within(row).getAllByRole("cell")[0]?.textContent ?? "");

      expect(ranks).toEqual(["1", "2", "2", "4"]);
    });
  });

  // -------------------------------------------------------------------------
  // [V-RL-11] 大会に紐づかない行
  // -------------------------------------------------------------------------
  describe("[V-RL-11] 大会に紐づかないリレー記録", () => {
    it("大会名は common.none を再利用する (relay 名前空間に複製していない)", async () => {
      const fake = makeSupabase({
        rankings: [
          rpcRow({
            relay_record_id: "rr-petrel-nocomp",
            competition_id: null,
            competition_title: null,
            competition_date: null,
          }),
        ],
      });
      mocks.supabase.current = fake.client;

      renderRelayRankings();

      const row = await screen.findByTestId("team-relay-rankings-row-rr-petrel-nocomp");
      expect(within(row).getByText(messages.common.none)).toBeTruthy();
    });

    it("日付は relay_created_at にフォールバックする (空欄にしない)", async () => {
      const fake = makeSupabase({
        rankings: [
          rpcRow({
            relay_record_id: "rr-petrel-nocomp",
            competition_id: null,
            competition_title: null,
            competition_date: null,
            relay_created_at: "2026-05-04T09:15:00+09:00",
          }),
        ],
      });
      mocks.supabase.current = fake.client;

      renderRelayRankings();

      const row = await screen.findByTestId("team-relay-rankings-row-rr-petrel-nocomp");
      // ロケール ja の numeric 表記。年月日が全部出ていること (日付が消えていない)
      const dateCell = within(row).getAllByRole("cell")[4]?.textContent ?? "";
      expect(dateCell).toMatch(/2026/);
      expect(dateCell).not.toBe("");
    });

    it("competition_date / relay_created_at の両方が null でも行は残る", async () => {
      const fake = makeSupabase({
        rankings: [
          rpcRow({
            relay_record_id: "rr-petrel-nodate",
            competition_id: null,
            competition_title: null,
            competition_date: null,
            relay_created_at: null,
          }),
        ],
      });
      mocks.supabase.current = fake.client;

      renderRelayRankings();

      const row = await screen.findByTestId("team-relay-rankings-row-rr-petrel-nodate");
      expect(within(row).getByText("3:34.55")).toBeTruthy();
    });

    it("種目名は eventLabel の補間で 1レグ距離 × レグ数 × 種類 になる", async () => {
      const fake = makeSupabase({
        rankings: [
          rpcRow({
            relay_record_id: "rr-petrel-medley",
            relay_kind: "medley",
            leg_distance: 50,
            leg_count: 4,
          }),
        ],
      });
      mocks.supabase.current = fake.client;

      renderRelayRankings();

      const row = await screen.findByTestId("team-relay-rankings-row-rr-petrel-medley");
      // ja: "{distance}m×{legCount} {kind}" / kind = "メドレーリレー"
      expect(within(row).getByText(`50m×4 ${relay.kind.medley}`)).toBeTruthy();
    });

    it("leg_count が 4 でない変則編成もそのまま表示する", async () => {
      const fake = makeSupabase({
        rankings: [
          rpcRow({ relay_record_id: "rr-petrel-odd", leg_distance: 25, leg_count: 7 }),
        ],
      });
      mocks.supabase.current = fake.client;

      renderRelayRankings();

      const row = await screen.findByTestId("team-relay-rankings-row-rr-petrel-odd");
      expect(within(row).getByText(`25m×7 ${relay.kind.free}`)).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // [V-P2-44] 🚨 取得上限に達したことの明示 (リレー側)
  //
  // ⚠️ **定数が個人種目と別**である (`TEAM_RELAY_RANKING_FETCH_LIMIT`)。
  //    リレーは別ファイル・別コンポーネントが判定と描画を持っており、
  //    **個人側が緑でもリレー側は無保護**になる。
  //    Reviewer の「片方だけに fixture を通すともう片方の同型の退行を
  //    見逃す」(W-1 が生き残った理由) と同じ構造。
  //
  // ⚠️ 定数の**取り違え**は両方が 500 なので通常操作では観測差ゼロ。
  //    その検出は `TeamRelayRankingsTruncationLimit.test.tsx` が
  //    2つの定数に**別の値**をモックして担保する。
  // -------------------------------------------------------------------------
  describe("[V-P2-44] 取得上限に達したことの明示", () => {
    const manyRelayRows = (n: number) =>
      Array.from({ length: n }, (_, index) =>
        rpcRow({
          relay_record_id: `rr-bulk-${index}`,
          total_time: 200 + index / 100,
          legs: [],
        }),
      );

    it("🚨 500 件 (上限) 返ると切り詰め注記が出る", async () => {
      const fake = makeSupabase({ rankings: manyRelayRows(500) });
      mocks.supabase.current = fake.client;

      renderRelayRankings();

      await waitFor(() =>
        expect(screen.getByTestId("team-relay-rankings-truncated-note")).toBeInTheDocument(),
      );
      expect(screen.getByTestId("team-relay-rankings-truncated-note").textContent).toBe(
        messages.teams.ranking.truncatedNote.replace("{limit}", "500"),
      );
    });

    it("🚨 499 件では出ない (上限未満で誤発火しない)", async () => {
      const fake = makeSupabase({ rankings: manyRelayRows(499) });
      mocks.supabase.current = fake.client;

      renderRelayRankings();

      await waitFor(() =>
        expect(screen.getByTestId("team-relay-rankings-result-count")).toBeInTheDocument(),
      );
      expect(screen.queryByTestId("team-relay-rankings-truncated-note")).toBeNull();
    });

    it("🚨 上限到達時は注記と「さらに表示」が同時に出る", async () => {
      const fake = makeSupabase({ rankings: manyRelayRows(500) });
      mocks.supabase.current = fake.client;

      renderRelayRankings();

      await waitFor(() =>
        expect(screen.getByTestId("team-relay-rankings-truncated-note")).toBeInTheDocument(),
      );
      expect(screen.getByTestId("team-relay-rankings-show-more")).toBeInTheDocument();
    });

    it("0 件では出ない (空状態と混ざらない)", async () => {
      const fake = makeSupabase({ rankings: [], relayRecordCount: 3 });
      mocks.supabase.current = fake.client;

      renderRelayRankings();

      await waitFor(() =>
        expect(screen.getByTestId("team-relay-rankings-empty-no-match")).toBeInTheDocument(),
      );
      expect(screen.queryByTestId("team-relay-rankings-truncated-note")).toBeNull();
    });
  });

});
