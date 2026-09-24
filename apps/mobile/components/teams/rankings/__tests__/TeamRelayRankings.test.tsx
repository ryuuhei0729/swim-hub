/**
 * TeamRelayRankings (mobile) — リレー記録ランキングのサブビュー
 *                               (QA Sprint Contract Phase B / 第3弾)
 *
 * 対象:
 *   apps/mobile/components/teams/rankings/TeamRelayRankings.tsx
 *   apps/mobile/components/teams/rankings/RelayRankingFilterSheet.tsx
 *   apps/mobile/components/teams/rankings/RelayRankingList.tsx
 *
 * Sprint Contract 検証観点 (web 側の [V-RL-*] と対にする):
 *   [V-MR-01] 初期表示は **web と同じ既定条件** (free / 100m / 長水路 / **男子**)
 *             で RPC を叩く = web/mobile パリティ。
 *             引数は 6 キーで `p_aggregation` を含まない (PM 裁定で廃止)
 *   [V-MR-02] ローディング / エラー / 空状態2種 が排他に出る
 *   [V-MR-03] エラー表示に生の PostgrestError 文字列を出さない。
 *             `UserFacingError` は素通しする (対テスト)
 *   [V-MR-04] 空状態が「条件に一致なし」と「チームにリレー記録が無い」に分かれる
 *   [V-MR-05] 絞り込みシートで「適用」した条件が RPC 引数に反映される
 *   [V-MR-06] 種類を medley に変えると `200m × 4` が消え、200m 選択中なら 25m に落ちる
 *             (web の [V-RL-06] と同じ結果になること)。距離チップのラベルは
 *             `legDistanceOption` 由来で `× 4` のハードコードではない
 *   [V-MR-07] 行を展開するとレグの 泳者 / 泳法 / 区間 / 通算 が出る。
 *             通算は区間タイムの積み上げ
 *   [V-MR-08] 退会した泳者のレグでも行が欠けない
 *   [V-MR-09] レグ 0 件のリレー記録は行を落とさず「ラップ無し」の文言を出す
 *   [V-MR-10] 並べ替えボタンがツールバーに無い
 *   [V-MR-11] 大会に紐づかない行は `common.none` と作成日時フォールバックで出る
 *
 * モック方針:
 *   Supabase クライアントだけをフェイクにし、TeamRelayRankings →
 *   useTeamRelayRankingsQuery → TeamRelayRankingsAPI → rpc() は実物を通す。
 *   フェイクは RPC 引数と `.eq()` の列名・値を捨てずに記録する。
 *
 * 第3弾 (ランキング UI 改修) での更新:
 *   ユーザー依頼で「すべて」を廃止し **男子を既定**にし、距離チップを
 *   「25m × 4」形式にした。mobile は既に ChipGroup (実質ラジオ) なので
 *   選択肢の値とラベルだけが変わる。
 *
 * ⚠️ `apps/mobile/__mocks__/react-native.ts` の Pressable モックは
 *    accessibilityRole を無視して常に `<button>` を返す (モックの方が実機より緩い)。
 *    よってボタンの列挙は**必ずスコープを絞る**。
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserFacingError } from "@apps/shared/utils/userFacingError";
import type { TeamRelayRankingFilters } from "@apps/shared/types";
import { buildDefaultRelayRankingFilters } from "@apps/shared/utils/relayRankingAxis";
import { TeamRelayRankings } from "../TeamRelayRankings";
import jaMessages from "../../../../../shared/messages/ja.json";

// ⚠️ ランキング系のコンポーネントは **プロフィール画像を描画しない**ので
//    `useSignedImageUrl` を import しない (ユーザー依頼で撤去済み)。
//    モックは「呼ばれないこと」の観測点として残す。
//    行あたり1件の署名付き URL 取得が復活したらここが 0 でなくなる
//    (呼び出し回数の assert は下の describe 内で行う)。
const signedImageUrlSpy = vi.hoisted(() => vi.fn(() => ({ url: null, isLoading: false })));

vi.mock("@/hooks/useSignedImageUrl", () => ({
  useSignedImageUrl: signedImageUrlSpy,
}));

const TEAM_ID = "team-petrel";
const relay = jaMessages.teams.ranking.relay;

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
  rankingsPending?: boolean;
  relayRecordCount?: number;
}

function makeSupabase(options: FakeOptions = {}) {
  const {
    rankings = [],
    rankingsError = null,
    rankingsPending = false,
    relayRecordCount = 7,
  } = options;

  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const eqCalls: Array<{ table: string; column: string; value: unknown }> = [];
  const fromCalls: string[] = [];

  const makeThenable = (
    table: string,
    result: { data: unknown; error: unknown; count?: number },
  ) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "order", "in", "is", "limit", "ilike"]) {
      builder[method] = vi.fn(() => builder);
    }
    // eq は引数を捨てない (サーバー絞り込みとクライアント filter を区別するため)
    builder.eq = vi.fn((column: string, value: unknown) => {
      eqCalls.push({ table, column, value });
      return builder;
    });
    builder.single = vi.fn(async () => result);
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
      if (rankingsPending) return new Promise(() => {});
      if (rankingsError) return { data: null, error: rankingsError };
      const data = typeof rankings === "function" ? rankings(args) : rankings;
      return { data, error: null };
    }),
  };

  return { rpcCalls, eqCalls, fromCalls, client: client as unknown as never };
}

const mocks = vi.hoisted(() => ({ supabase: { current: null as unknown } }));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: mocks.supabase.current, user: { id: "usr-petrel-alpha" } }),
}));

/**
 * ⚠️ **種目軸の統合 (2026-09-08) でこのコンポーネントは結果を描くだけになった。**
 *
 * 統合前は「個人種目 / リレー」のサブビューごとに絞り込みがあり、
 * このコンポーネントがツールバー・要約・絞り込みシートを持っていた。
 * 統合後は親 `./TeamRankings.tsx` が7択 (個人5 + リレー2) の1つの絞り込みを持ち、
 * リレーを選んだときだけ `filters` を射影して渡す。よって
 *   - `selectedFilters` / `onFiltersChange` prop は撤去された
 *   - ツールバー / 要約 / 絞り込みシート / バッジはここに存在しない
 * 絞り込み経由の検証は親の `./TeamRankings.test.tsx` に移した。
 * 選択肢の並びと引き継ぎ規則は
 * `apps/shared/__tests__/utils/rankingEventAxis.test.ts` が定義元。
 *
 * ここで検証するのは「渡された条件をそのまま RPC に流し、結果を描く」ことである。
 */
function renderRelayRankings(
  filters: TeamRelayRankingFilters = buildDefaultRelayRankingFilters(),
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TeamRelayRankings teamId={TEAM_ID} filters={filters} />
    </QueryClientProvider>,
  );
}

async function lastRpcArgs(fake: ReturnType<typeof makeSupabase>, atLeast = 1) {
  await waitFor(() => expect(fake.rpcCalls.length).toBeGreaterThanOrEqual(atLeast));
  return fake.rpcCalls.at(-1)?.args as Record<string, unknown>;
}


/** リレー1本のカード = 展開ボタンを持つ最上位 View。展開ボタンから親をたどる */
function cardOf(toggle: HTMLElement): HTMLElement {
  const card = toggle.parentElement;
  if (!card) throw new Error("展開ボタンの親カードが見つからない");
  return card;
}

function toggleFor(label: string): HTMLElement {
  return screen.getByRole("button", { name: label });
}

describe("TeamRelayRankings (mobile)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // [V-MR-01] web とのパリティ: 既定条件
  // -------------------------------------------------------------------------
  it("[V-MR-01] 初期表示の RPC 引数が web と同じ既定条件になる", async () => {
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
      // RPC 側の `p_gender_category IS NULL = すべて` は将来の復活用に残っている
      p_gender_category: "male",
      // migration 20260909000000 で追加。通算は `null` + `false`
      // (対応表の定義元は `api/teams/rankingPeriod.ts` の `periodToRpcArgs`)
      p_fiscal_year: null,
      p_fiscal_year_or_earlier: false,
      p_limit: 500,
    });
  });

  // ⚠️ **2つの観点を1つの assert に混ぜてはいけない** (PM 裁定 2026-09-09)。
  //    以前は「`p_aggregation` を含まない」と「引数がちょうど7つ」を同じ it で
  //    見ていたため、**正しい引数追加 (`p_fiscal_year_or_earlier`) が
  //    「長さ7のはずが8」でブロックされた**。pgTAP `V-DB-61c` で同型の問題を
  //    正しく処理したのと同じ方針で分ける。
  //      (a) `p_aggregation` の不在 … 総数に依存しない否定形。**観点の本体**
  //      (b) 引数セットの厳密一致  … シグネチャが変わるたびに更新する計器
  it("[V-MR-01] (a) RPC 引数に p_aggregation を含まない (廃止された軸が復活していない)", async () => {
    const fake = makeSupabase({ rankings: [rpcRow()] });
    mocks.supabase.current = fake.client;

    renderRelayRankings();
    const args = await lastRpcArgs(fake);

    // ⚠️ ここでは**総数を見ない**。引数が増えてもこの観点は変わらない
    expect(Object.keys(args)).not.toContain("p_aggregation");
  });

  it("[V-MR-01] (b) RPC 引数セットが契約どおり (名前と総数)", async () => {
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

  it("[V-MR-01] styles マスターを取得しない (リレーの軸は静的定義から決まる)", async () => {
    const fake = makeSupabase({ rankings: [rpcRow()] });
    mocks.supabase.current = fake.client;

    renderRelayRankings();
    await lastRpcArgs(fake);

    expect(fake.fromCalls).not.toContain("styles");
  });

  // -------------------------------------------------------------------------
  // [V-MR-02] 状態分岐
  // -------------------------------------------------------------------------
  it("[V-MR-02] RPC 解決前はローディングだけを出す (エラーも空状態も出さない)", () => {
    const fake = makeSupabase({ rankingsPending: true });
    mocks.supabase.current = fake.client;

    renderRelayRankings();

    expect(screen.getByText(jaMessages.teams.ranking.loading)).toBeTruthy();
    expect(screen.queryByText(relay.error)).toBeNull();
    expect(screen.queryByText(relay.empty.noMatchTitle)).toBeNull();
    expect(screen.queryByText(relay.empty.noRecordsTitle)).toBeNull();
  });

  it("[V-MR-02] 結果があるときは件数を出し、ローディング・エラー・空状態を出さない", async () => {
    const fake = makeSupabase({
      rankings: [
        rpcRow({ relay_record_id: "rr-petrel-a", total_time: 214.55 }),
        rpcRow({ relay_record_id: "rr-petrel-b", total_time: 218.07 }),
        rpcRow({ relay_record_id: "rr-petrel-c", total_time: 221.2 }),
      ],
    });
    mocks.supabase.current = fake.client;

    renderRelayRankings();

    await waitFor(() => expect(screen.getByText("3件")).toBeTruthy());
    expect(screen.queryByText(jaMessages.teams.ranking.loading)).toBeNull();
    expect(screen.queryByText(relay.error)).toBeNull();
    expect(screen.queryByText(relay.empty.noMatchTitle)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // [V-MR-03] エラー表示
  // -------------------------------------------------------------------------
  it("[V-MR-03] 生の PostgrestError の message / details / hint を画面に出さない", async () => {
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

    await waitFor(() => expect(screen.getByText(relay.error)).toBeTruthy());

    // 生の文字列を肯定形で期待値に書かない。漏れていないことを否定形で見る
    const body = document.body.textContent ?? "";
    for (const leaked of ["relay_records", "does not exist", "42P01", "search_path", "policy"]) {
      expect(body).not.toContain(leaked);
    }
  });

  it("[V-MR-03] UserFacingError は素通しする (全部を汎用文言に潰していない)", async () => {
    const fake = makeSupabase({
      rankingsError: new UserFacingError("チームのリレー記録を表示する権限がありません"),
    });
    mocks.supabase.current = fake.client;

    renderRelayRankings();

    await waitFor(() =>
      expect(screen.getByText("チームのリレー記録を表示する権限がありません")).toBeTruthy(),
    );
    expect(screen.queryByText(relay.error)).toBeNull();
  });

  it("[V-MR-03] 再試行ボタンが RPC を再実行する", async () => {
    const fake = makeSupabase({ rankingsError: { message: "boom", code: "XX000" } });
    mocks.supabase.current = fake.client;

    renderRelayRankings();
    await waitFor(() => expect(screen.getByText(relay.error)).toBeTruthy());

    const before = fake.rpcCalls.length;
    fireEvent.click(screen.getByRole("button", { name: jaMessages.teams.ranking.retry }));

    await waitFor(() => expect(fake.rpcCalls.length).toBeGreaterThan(before));
  });

  // -------------------------------------------------------------------------
  // [V-MR-04] 空状態 2 種
  // -------------------------------------------------------------------------
  it("[V-MR-04] チームにリレー記録が 1 件も無いときは「チームにリレー記録がありません」", async () => {
    const fake = makeSupabase({ rankings: [], relayRecordCount: 0 });
    mocks.supabase.current = fake.client;

    renderRelayRankings();

    await waitFor(() => expect(screen.getByText(relay.empty.noRecordsTitle)).toBeTruthy());
    expect(screen.getByText(relay.empty.noRecordsBody)).toBeTruthy();
    expect(screen.queryByText(relay.empty.noMatchTitle)).toBeNull();
  });

  it("[V-MR-04] リレー記録はあるが条件に一致しないときは「該当するリレー記録がありません」", async () => {
    const fake = makeSupabase({ rankings: [], relayRecordCount: 5 });
    mocks.supabase.current = fake.client;

    renderRelayRankings();

    await waitFor(() => expect(screen.getByText(relay.empty.noMatchTitle)).toBeTruthy());
    expect(screen.queryByText(relay.empty.noRecordsTitle)).toBeNull();
  });

  it("[V-MR-04] hasAnyRelayRecord は team_id をサーバー側の絞り込み条件として渡す", async () => {
    const fake = makeSupabase({ rankings: [], relayRecordCount: 0 });
    mocks.supabase.current = fake.client;

    renderRelayRankings();
    await waitFor(() => expect(screen.getByText(relay.empty.noRecordsTitle)).toBeTruthy());

    expect(fake.eqCalls.filter((c) => c.table === "relay_records")).toEqual([
      { table: "relay_records", column: "team_id", value: TEAM_ID },
    ]);
  });

  it("[V-MR-04] 結果があるときは hasAnyRelayRecord を問い合わせない", async () => {
    const fake = makeSupabase({ rankings: [rpcRow()] });
    mocks.supabase.current = fake.client;

    renderRelayRankings();
    await waitFor(() => expect(screen.getByText("3:34.55")).toBeTruthy());

    expect(fake.fromCalls).not.toContain("relay_records");
  });

  // -------------------------------------------------------------------------
  // [V-MR-05] 絞り込みシート → RPC 引数
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // [V-MR-06] 種類を変えたときの距離の引き継ぎ (web の [V-RL-06] と同じ結果)
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // [V-MR-07] 行の展開
  // -------------------------------------------------------------------------
  it("[V-MR-07] 既定ではレグが折りたたまれている", async () => {
    const fake = makeSupabase({ rankings: [rpcRow()] });
    mocks.supabase.current = fake.client;

    renderRelayRankings();
    await waitFor(() => expect(screen.getByText("3:34.55")).toBeTruthy());

    expect(screen.queryByText(relay.legHeader.cumulative)).toBeNull();
    // 折りたたみ中はボタンのラベルが「表示」側
    expect(screen.getByRole("button", { name: relay.expand })).toBeTruthy();
    expect(screen.queryByRole("button", { name: relay.collapse })).toBeNull();
  });

  it("[V-MR-07] 展開すると 泳者 / 泳法 / 区間 / 通算 の 4 見出しと 4 レグが出る", async () => {
    const fake = makeSupabase({ rankings: [rpcRow()] });
    mocks.supabase.current = fake.client;

    renderRelayRankings();
    await waitFor(() => expect(screen.getByText("3:34.55")).toBeTruthy());

    fireEvent.click(toggleFor(relay.expand));

    await waitFor(() => expect(screen.getByText(relay.legHeader.cumulative)).toBeTruthy());
    for (const header of [
      relay.legHeader.swimmer,
      relay.legHeader.style,
      relay.legHeader.legTime,
    ]) {
      expect(screen.getByText(header)).toBeTruthy();
    }

    for (const [num, name] of [
      [1, "アルファ"],
      [2, "ブラボー"],
      [3, "チャーリー"],
      [4, "デルタ"],
    ] as const) {
      expect(screen.getByText(`第${num}泳者`)).toBeTruthy();
      expect(screen.getByText(name)).toBeTruthy();
    }

    // 泳法は practice.styleAbbrev.Fr (公式略称) の再利用。
    //
    // 🚨 この assert だけでは**キーの差し替えを検出できない**。
    //    ja では `practice.styles.Fr` と `practice.styleAbbrev.Fr` がどちらも
    //    「自由形」で文字列が同一なので、`styleAbbrev` → `styles` に戻されても
    //    緑のまま通る (トートロジー)。このファイルの i18n モックは
    //    `apps/mobile/vitest.setup.ts` が ja.json 固定で解決するため、
    //    ロケールを変えて区別することもできない。
    //    **どちらのキー由来かの判別は
    //    `./RelayRankingList.legStyleLabel.test.tsx` (en / de / ja を切り替える
    //    専用の i18n モックを持つ) が担当する。**
    //    ここは「4 レグすべてに泳法ラベルが出ている」ことだけを見る。
    expect(screen.getAllByText(jaMessages.practice.styleAbbrev.Fr)).toHaveLength(4);
  });

  it("[V-MR-07] 通算タイムは区間タイムの積み上げである", async () => {
    const fake = makeSupabase({ rankings: [rpcRow()] });
    mocks.supabase.current = fake.client;

    renderRelayRankings();
    await waitFor(() => expect(screen.getByText("3:34.55")).toBeTruthy());

    fireEvent.click(toggleFor(relay.expand));
    await waitFor(() => expect(screen.getByText(relay.legHeader.cumulative)).toBeTruthy());

    // 期待値はリテラル (calcCumulativeTimes を呼んで作らない)。
    // 区間 53.40 / 54.20 / 53.55 / 53.40 → 通算 53.40 / 1:47.60 / 2:41.15 / 3:34.55
    for (const cumulative of ["1:47.60", "2:41.15"]) {
      expect(screen.getByText(cumulative)).toBeTruthy();
    }
    // 53.40 は区間 2 件 + 通算 1 件 = 3 箇所、3:34.55 は総合 + 通算最終 = 2 箇所
    expect(screen.getAllByText("53.40")).toHaveLength(3);
    expect(screen.getAllByText("3:34.55")).toHaveLength(2);
    // 区間の値をそのまま通算列に並べていたら 54.20 が 2 箇所になる
    expect(screen.getAllByText("54.20")).toHaveLength(1);
  });

  it("[V-MR-07] 総合タイムはレグの和で置き換えない (保存値を出す)", async () => {
    // 区間の和は 214.55 (3:34.55) だが total_time は 214.5 (3:34.50)
    const fake = makeSupabase({ rankings: [rpcRow({ total_time: 214.5 })] });
    mocks.supabase.current = fake.client;

    renderRelayRankings();

    await waitFor(() => expect(screen.getByText("3:34.50")).toBeTruthy());
    // 展開前は通算列が無いので 3:34.55 はどこにも出ない
    expect(screen.queryByText("3:34.55")).toBeNull();
  });

  it("[V-MR-07] もう一度押すと折りたたまれる", async () => {
    const fake = makeSupabase({ rankings: [rpcRow()] });
    mocks.supabase.current = fake.client;

    renderRelayRankings();
    await waitFor(() => expect(screen.getByText("3:34.55")).toBeTruthy());

    fireEvent.click(toggleFor(relay.expand));
    await waitFor(() => expect(screen.getByText(relay.legHeader.cumulative)).toBeTruthy());

    fireEvent.click(toggleFor(relay.collapse));
    await waitFor(() => expect(screen.queryByText(relay.legHeader.cumulative)).toBeNull());
  });

  it("[V-MR-07] 複数行のうち押した行だけが展開される", async () => {
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

    const toggles = screen.getAllByRole("button", { name: relay.expand });
    expect(toggles).toHaveLength(3);

    // 2 番目のカードだけ展開する
    const second = toggles[1];
    if (!second) throw new Error("2 番目の展開ボタンが無い");
    fireEvent.click(second);

    await waitFor(() => expect(screen.getAllByText(relay.legHeader.cumulative)).toHaveLength(1));
    // 展開されたのは押したカードの中である
    expect(within(cardOf(second)).getByText(relay.legHeader.cumulative)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: relay.expand })).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // [V-MR-08] 退会した泳者
  // -------------------------------------------------------------------------
  it("[V-MR-08] displayName=null のレグでも 4 レグすべてが出る (行が欠けない)", async () => {
    const legs = fourLegs();
    const first = legs[0];
    if (!first) throw new Error("fixture が壊れている");
    const retired = { ...first, userId: null, displayName: null };
    const fake = makeSupabase({ rankings: [rpcRow({ legs: [retired, ...legs.slice(1)] })] });
    mocks.supabase.current = fake.client;

    renderRelayRankings();
    await waitFor(() => expect(screen.getByText("3:34.55")).toBeTruthy());

    fireEvent.click(toggleFor(relay.expand));
    await waitFor(() => expect(screen.getByText(relay.legHeader.cumulative)).toBeTruthy());

    // 第1〜第4泳者ラベルが全部出ている
    for (const num of [1, 2, 3, 4]) {
      expect(screen.getByText(`第${num}泳者`)).toBeTruthy();
    }
    // 退会した泳者は専用の文言 (空文字にしない)
    expect(screen.getByText(relay.retiredMember)).toBeTruthy();
  });

  it("[V-MR-08] 退会レグがあっても通算の積み上げが崩れない", async () => {
    const legs = fourLegs();
    const second = legs[1];
    if (!second) throw new Error("fixture が壊れている");
    const retired = { ...second, userId: null, displayName: null };
    const fake = makeSupabase({
      rankings: [rpcRow({ legs: [legs[0], retired, legs[2], legs[3]] })],
    });
    mocks.supabase.current = fake.client;

    renderRelayRankings();
    await waitFor(() => expect(screen.getByText("3:34.55")).toBeTruthy());

    fireEvent.click(toggleFor(relay.expand));
    await waitFor(() => expect(screen.getByText(relay.legHeader.cumulative)).toBeTruthy());

    for (const cumulative of ["1:47.60", "2:41.15"]) {
      expect(screen.getByText(cumulative)).toBeTruthy();
    }
    expect(screen.getAllByText("3:34.55")).toHaveLength(2);
  });

  it("[V-MR-08] legs が legIndex の逆順で来ても昇順に整えて出す", async () => {
    const fake = makeSupabase({ rankings: [rpcRow({ legs: [...fourLegs()].reverse() })] });
    mocks.supabase.current = fake.client;

    renderRelayRankings();
    await waitFor(() => expect(screen.getByText("3:34.55")).toBeTruthy());

    fireEvent.click(toggleFor(relay.expand));
    await waitFor(() => expect(screen.getByText(relay.legHeader.cumulative)).toBeTruthy());

    // 「第N泳者」ラベルの描画順が昇順であること
    const legLabels = screen
      .getAllByText(/^第[1-4]泳者$/)
      .map((node) => node.textContent ?? "");
    expect(legLabels).toEqual(["第1泳者", "第2泳者", "第3泳者", "第4泳者"]);
  });

  // -------------------------------------------------------------------------
  // [V-MR-09] レグ 0 件
  // -------------------------------------------------------------------------
  it("[V-MR-09] レグ 0 件でも行は残り、展開すると「ラップ無し」の文言が出る", async () => {
    const fake = makeSupabase({
      rankings: [
        rpcRow({ relay_record_id: "rr-petrel-nolegs", total_time: 214.55, legs: [] }),
        rpcRow({ relay_record_id: "rr-petrel-withlegs", total_time: 218.07 }),
      ],
    });
    mocks.supabase.current = fake.client;

    renderRelayRankings();
    await waitFor(() => expect(screen.getByText("2件")).toBeTruthy());
    expect(screen.getByText("3:34.55")).toBeTruthy();

    const toggles = screen.getAllByRole("button", { name: relay.expand });
    const firstToggle = toggles[0];
    if (!firstToggle) throw new Error("展開ボタンが無い");
    fireEvent.click(firstToggle);

    await waitFor(() => expect(screen.getByText(relay.noLegs)).toBeTruthy());
    // レグの見出しは出さない (空の表を描かない)
    expect(screen.queryByText(relay.legHeader.cumulative)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // [V-MR-10] 並べ替え UI が無い
  // -------------------------------------------------------------------------

  it("[V-MR-10] 表示順は RPC が返した順序そのままである (クライアント側で並べ替えない)", async () => {
    // RPC は総合タイム昇順で返す契約だが、あえて崩した順序を返す
    const fake = makeSupabase({
      rankings: [
        rpcRow({ relay_record_id: "rr-petrel-third", total_time: 221.2 }),
        rpcRow({ relay_record_id: "rr-petrel-first", total_time: 214.55 }),
        rpcRow({ relay_record_id: "rr-petrel-second", total_time: 218.07 }),
      ],
    });
    mocks.supabase.current = fake.client;

    renderRelayRankings();
    await waitFor(() => expect(screen.getByText("3件")).toBeTruthy());

    const times = screen
      .getAllByText(/^3:\d\d\.\d\d$/)
      .map((node) => node.textContent ?? "");
    expect(times).toEqual(["3:41.20", "3:34.55", "3:38.07"]);
  });

  it("[V-MR-10] 同着は同順位で、次順位が件数分スキップされる (1, 2, 2, 4)", async () => {
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
    await waitFor(() => expect(screen.getByText("4件")).toBeTruthy());

    // 順位バッジは 1 桁の数字だけを持つ Text。件数表示 ("4件") とは別物
    const ranks = screen.getAllByText(/^[0-9]+$/).map((node) => node.textContent ?? "");
    expect(ranks).toEqual(["1", "2", "2", "4"]);
  });

  // -------------------------------------------------------------------------
  // [V-MR-11] 大会に紐づかない行
  // -------------------------------------------------------------------------
  it("[V-MR-11] 大会名は common.none を再利用する (relay 名前空間に複製していない)", async () => {
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

    await waitFor(() => expect(screen.getByText("3:34.55")).toBeTruthy());
    expect(screen.getByText(jaMessages.common.none)).toBeTruthy();
  });

  it("[V-MR-11] 日付は relay_created_at にフォールバックする (空欄にしない)", async () => {
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

    await waitFor(() => expect(screen.getByText("3:34.55")).toBeTruthy());
    expect(screen.getByText(/2026/)).toBeTruthy();
  });

  it("[V-MR-11] 種目名は eventLabel の補間で 1レグ距離 × レグ数 × 種類 になる", async () => {
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

    await waitFor(() => expect(screen.getByText(`50m×4 ${relay.kind.medley}`)).toBeTruthy());
  });

  it("[V-MR-11] leg_count が 4 でない変則編成もそのまま表示する", async () => {
    const fake = makeSupabase({
      rankings: [rpcRow({ relay_record_id: "rr-petrel-odd", leg_distance: 25, leg_count: 7 })],
    });
    mocks.supabase.current = fake.client;

    renderRelayRankings();

    await waitFor(() => expect(screen.getByText(`25m×7 ${relay.kind.free}`)).toBeTruthy());
  });

  // -------------------------------------------------------------------------
  // [V-P2-44] 🚨 取得上限に達したことの明示 (mobile リレー)
  //
  // ⚠️ **4象限のうちの1つ**。定数 (`TEAM_RELAY_RANKING_FETCH_LIMIT`)・
  //    コンポーネント (`RelayRankingList.tsx`)・`PAGE_SIZE` (20) がすべて
  //    個人種目 / web と独立なので、他の3象限が緑でもここは無保護。
  // -------------------------------------------------------------------------
  describe("[V-P2-44] 取得上限に達したことの明示", () => {
    // ⚠️ `truncatedNote` は `teams.ranking.truncatedNote` (relay.* 配下ではない)。
    //    リレーでも同じ文言を使うので個人種目と共通のキーを引く
    const TRUNCATED = jaMessages.teams.ranking.truncatedNote.replace("{limit}", "500");

    const manyRows = (n: number) =>
      Array.from({ length: n }, (_, index) =>
        rpcRow({
          relay_record_id: `rr-bulk-${index}`,
          total_time: 200 + index / 100,
          legs: [],
        }),
      );

    it("🚨 500 件 (上限) 返ると切り詰め注記が出る", async () => {
      const fake = makeSupabase({ rankings: manyRows(500) });
      mocks.supabase.current = fake.client;

      renderRelayRankings();

      await waitFor(() => expect(screen.getByText(TRUNCATED)).toBeTruthy());
    });

    it("🚨 499 件では出ない (上限未満で誤発火しない)", async () => {
      const fake = makeSupabase({ rankings: manyRows(499) });
      mocks.supabase.current = fake.client;

      renderRelayRankings();

      await waitFor(() =>
        expect(
          screen.getByText(jaMessages.teams.ranking.resultCount.replace("{count}", "499")),
        ).toBeTruthy(),
      );
      expect(screen.queryByText(TRUNCATED)).toBeNull();
    });

    it("🚨 上限到達時は注記と「さらに表示」が同時に出る (PAGE_SIZE=20)", async () => {
      const fake = makeSupabase({ rankings: manyRows(500) });
      mocks.supabase.current = fake.client;

      renderRelayRankings();

      await waitFor(() => expect(screen.getByText(TRUNCATED)).toBeTruthy());
      expect(
        screen.getByRole("button", { name: jaMessages.teams.ranking.showMore }),
      ).toBeTruthy();
    });
  });

});
