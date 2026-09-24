/**
 * TeamRankings (mobile) — QA Sprint Contract Phase B
 *
 * 対象: apps/mobile/components/teams/rankings/TeamRankings.tsx
 *
 * Sprint Contract 検証観点:
 *   [V-M20] 初期表示は web と同じ既定条件 (Fr 100m=styleId 3 / 長水路 / **男子** /
 *           チームの大会 / personalBest / 通算) で RPC を叩く = web/mobile パリティ
 *   [V-M21] ローディング / エラー / 空状態の3つが実装されている
 *   [V-M22] エラー表示に生の PostgrestError 文字列を出さない
 *   [V-M23] 絞り込みシートで「適用」した条件が RPC 引数に反映される
 *   [V-M24] 絞り込みバッジの件数が既定との差分数になる
 *   [V-M25] allCompetitions を選ぶと露出拡大の注意書きが本体側にも出る
 *   [V-M26] ソート UI を持たない
 *   [V-M27] styles マスターが取れないときはランキングを出さず RPC も叩かない
 *   [V-M28] 読み込み中に「エラー」表示を出さない (Developer 修正済み・現在 GREEN)
 *   [V-M29] allCompetitions では hasAnyRecord を信用せず「該当なし」に寄せる (web と対)
 *   [V-M30] styles の3状態を切り分ける (取得中=スピナー / 失敗=エラー /
 *           **取得成功だが軸が作れない=エラー + 再試行**)。
 *           ★ 最後の分岐は今回まさに退行した経路で、テストが無かった。
 *             「条件未確定はローディング側で扱う」だけにすると
 *             settled + staleTime 24時間 + 再試行なしで永久スピナーになる。
 *             対になる web 側: apps/web/__tests__/components/team/
 *             TeamRankings.test.tsx の [V-03b] (hasStyleMasterProblem)
 *
 * モック方針: Supabase クライアントだけをフェイクにし、
 * TeamRankings → useTeamRankingsQuery → TeamRankingsAPI → rpc() は実物を通す。
 * フェイクは RPC 引数を記録するので「UI 操作がサーバー引数に届いたか」を直接見られる。
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TeamRankings } from "../TeamRankings";
import { styleKeys } from "@apps/shared/hooks/queries/keys";
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

const TEAM_ID = "team-kingfisher";
const ranking = jaMessages.teams.ranking;

// ローカル実 DB の public.styles 22 行 (実測値)
const STYLE_ROWS = [
  [1, "Fr", 25],
  [2, "Fr", 50],
  [3, "Fr", 100],
  [4, "Fr", 200],
  [5, "Fr", 400],
  [6, "Fr", 800],
  [7, "Fr", 1500],
  [8, "Br", 25],
  [9, "Br", 50],
  [10, "Br", 100],
  [11, "Br", 200],
  [12, "Ba", 25],
  [13, "Ba", 50],
  [14, "Ba", 100],
  [15, "Ba", 200],
  [16, "Fly", 25],
  [17, "Fly", 50],
  [18, "Fly", 100],
  [19, "Fly", 200],
  [20, "IM", 100],
  [21, "IM", 200],
  [22, "IM", 400],
].map(([id, style, distance]) => ({
  id,
  style,
  distance,
  name: `db-name-${String(id)}`,
  name_jp: `db-name-jp-${String(id)}`,
}));

function rpcRow(overrides: Record<string, unknown> = {}) {
  return {
    record_id: "rec-kingfisher-7",
    user_id: "usr-kingfisher-7",
    display_name: "セブン",
    avatar_path: null,
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

interface FakeOptions {
  rankings?:
    | Array<Record<string, unknown>>
    | ((args: Record<string, unknown>) => Array<Record<string, unknown>>);
  rankingsError?: unknown;
  stylesError?: unknown;
  stylesPending?: boolean;
  /**
   * styles マスターの戻り行。空配列 = 取得は成功したが種目軸が作れない異常。
   *
   * **関数を渡すと `from("styles")` の呼び出しごとに評価される**ので、
   * 「セッション中にマスターが縮んだ」状態を作れる (invalidate と組み合わせる)。
   */
  stylesRows?: Array<Record<string, unknown>> | (() => Array<Record<string, unknown>>);
  recordCount?: number;
  memberIds?: string[];
}

function makeSupabase(options: FakeOptions = {}) {
  const {
    rankings = [],
    rankingsError = null,
    stylesError = null,
    stylesPending = false,
    stylesRows = STYLE_ROWS,
    recordCount = 5,
    memberIds = ["usr-kingfisher-7"],
  } = options;

  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  const makeThenable = (
    result: { data: unknown; error: unknown; count?: number },
    pending = false,
  ) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "order", "eq", "in", "is", "limit", "ilike"]) {
      builder[method] = vi.fn(() => builder);
    }
    builder.single = vi.fn(async () => result);
    builder.then = (
      onfulfilled?: ((value: typeof result) => unknown) | null,
      onrejected?: ((reason: unknown) => unknown) | null,
    ) =>
      pending
        ? new Promise(() => {})
        : Promise.resolve(result).then(onfulfilled, onrejected);
    return builder;
  };

  const fromCalls: string[] = [];
  const client = {
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      if (table === "styles") {
        const rows = typeof stylesRows === "function" ? stylesRows() : stylesRows;
        return makeThenable(
          { data: stylesError ? null : rows, error: stylesError },
          stylesPending,
        );
      }
      if (table === "team_memberships") {
        return makeThenable({
          data: memberIds.map((userId) => ({ user_id: userId })),
          error: null,
        });
      }
      if (table === "records") {
        return makeThenable({ data: null, error: null, count: recordCount });
      }
      return makeThenable({ data: [], error: null });
    }),
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (rankingsError) return { data: null, error: rankingsError };
      const data = typeof rankings === "function" ? rankings(args) : rankings;
      return { data, error: null };
    }),
  };

  return { rpcCalls, fromCalls, client: client as unknown as never };
}

const mocks = vi.hoisted(() => ({ supabase: { current: null as unknown } }));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: mocks.supabase.current, user: { id: "usr-kingfisher-7" } }),
}));

function renderRankings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <TeamRankings teamId={TEAM_ID} members={[]} />
    </QueryClientProvider>,
  );
  // `queryClient` を返すのは「セッション中に styles マスターが変わった」状態を
  // 作るため。`styles` は再取得トリガーが無いので invalidate 以外に到達できない。
  return { ...result, queryClient };
}

async function lastRpcArgs(fake: ReturnType<typeof makeSupabase>, atLeast = 1) {
  await waitFor(() => expect(fake.rpcCalls.length).toBeGreaterThanOrEqual(atLeast));
  return fake.rpcCalls.at(-1)?.args as Record<string, unknown>;
}

const FILTER_LABEL = jaMessages.common.listToolbar.filterButton;

/**
 * ツールバーの「絞り込み」ボタン。
 * バッジが付くと accessible name が「絞り込み3」になるため前方一致で取る
 * (`accessibilityLabel` は RN の API で、mobile の react-native モックは
 *  DOM の aria-label に変換しないため名前は textContent から計算される)。
 */
function filterButton(): HTMLElement {
  const button = screen
    .getAllByRole("button")
    .find((node) => (node.textContent ?? "").startsWith(FILTER_LABEL));
  if (!button) throw new Error("絞り込みボタンが見つからない (テストの前提が崩れている)");
  return button;
}

/** バッジ部分だけを取り出す (バッジ無しなら空文字) */
function filterBadgeText(): string {
  return (filterButton().textContent ?? "").slice(FILTER_LABEL.length);
}

/** 絞り込みシートを開く */
function openFilterSheet() {
  fireEvent.click(filterButton());
}

/**
 * ランキング取得 (RPC) 由来のエラー表示が出るまで待つ。
 *
 * ⚠️ 単に `getByText(ranking.error)` を待つと、styles 解決直後の
 * 「filters 未確定なのにエラー表示になる」中間コミット (下記
 * [V-M28] で実証しているバグ) を拾ってしまい、直後に消えて不安定になる。
 * RPC が実際に呼ばれたことを先に待つ。
 */
async function waitForRankingsError(fake: ReturnType<typeof makeSupabase>) {
  await waitFor(() => expect(fake.rpcCalls.length).toBeGreaterThanOrEqual(1));
  await waitFor(() => expect(screen.getByText(ranking.error)).toBeTruthy());
}

describe("TeamRankings (mobile)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // [V-M20] web とのパリティ: 既定条件
  // -------------------------------------------------------------------------
  it("[V-M20] 初期表示の RPC 引数が web と同じ既定条件になる", async () => {
    const fake = makeSupabase({ rankings: [rpcRow()] });
    mocks.supabase.current = fake.client;

    renderRankings();

    const args = await lastRpcArgs(fake);
    expect(fake.rpcCalls[0]?.name).toBe("get_team_record_rankings");
    expect(args).toEqual({
      p_team_id: TEAM_ID,
      p_scope: "teamCompetitions",
      // ⚠️ 第2弾 (要望4) で既定距離が 100m → 50m。実 DB で Fr 50m = styles.id 2
      p_style_id: 2,
      p_pool_type: 1,
      // ユーザー依頼で「男女すべて」を廃止し男子 (users.gender=0) を既定にした
      p_gender: 0,
      p_aggregation: "personalBest",
      // migration 20260909000000 で追加。通算は `null` + `false`
      p_fiscal_year: null,
      p_fiscal_year_or_earlier: false,
      p_limit: 500,
    });
  });

  // ⚠️ 第2弾で要約の末尾に**期間**が付いた (`通算` / `2026年度`)。
  //    `集計` は要約に出ない — 個人種目限定の軸なので、リレーと個人で
  //    要約の項目数が変わらないようにしてある (PM 未裁定の観察として報告済み)。
  it("[V-M20] ツールバーの要約に 種目 / 水路 / 性別 / 期間 が出る", async () => {
    const fake = makeSupabase({ rankings: [rpcRow()] });
    mocks.supabase.current = fake.client;

    renderRankings();

    // 第3弾で「男女すべて」を廃止し男子を既定にした
    await waitFor(() =>
      expect(
        screen.getByText(
          `50m自由形 / ${jaMessages.common.poolTypeLong} / ${ranking.gender.male} / ${ranking.period.allTime}`,
        ),
      ).toBeTruthy(),
    );
  });

  it("[V-M20] 件数表示に取得件数が出る", async () => {
    const fake = makeSupabase({
      rankings: [1, 2, 3, 4, 5, 6, 7].map((n) =>
        rpcRow({ record_id: `rec-${n}`, user_id: `usr-${n}`, time: 27 + n / 100 }),
      ),
    });
    mocks.supabase.current = fake.client;

    renderRankings();

    await waitFor(() => expect(screen.getByText("7件")).toBeTruthy());
  });

  // -------------------------------------------------------------------------
  // [V-M21][V-M27] ローディング
  // -------------------------------------------------------------------------
  it("[V-M21] styles マスター取得中はローディング文言だけを出す", () => {
    const fake = makeSupabase({ stylesPending: true });
    mocks.supabase.current = fake.client;

    renderRankings();

    expect(screen.getByText(ranking.loading)).toBeTruthy();
    expect(screen.queryByText(ranking.error)).toBeNull();
    expect(
      screen.queryAllByRole("button").filter((node) => (node.textContent ?? "").startsWith(FILTER_LABEL)),
    ).toHaveLength(0);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // [V-M22] エラー
  // -------------------------------------------------------------------------
  it("[V-M22] RPC エラー時に汎用文言と再試行ボタンを出し、生のエラー文字列は出さない", async () => {
    const leakyMessage =
      'permission denied for function public.get_team_record_rankings (policy "team_rankings_select")';
    const fake = makeSupabase({ rankingsError: { code: "42501", message: leakyMessage } });
    mocks.supabase.current = fake.client;

    const { container } = renderRankings();

    await waitForRankingsError(fake);
    expect(screen.getByRole("button", { name: ranking.retry })).toBeTruthy();

    const rendered = container.textContent ?? "";
    expect(rendered).not.toContain("get_team_record_rankings");
    expect(rendered).not.toContain("policy");
    expect(rendered).not.toContain("permission denied");
  });

  it("[V-M22] 再試行ボタンで RPC が再実行される", async () => {
    const fake = makeSupabase({ rankingsError: { code: "42501", message: "boom" } });
    mocks.supabase.current = fake.client;

    renderRankings();

    await waitForRankingsError(fake);
    const callsBefore = fake.rpcCalls.length;

    fireEvent.click(screen.getByRole("button", { name: ranking.retry }));

    await waitFor(() => expect(fake.rpcCalls.length).toBeGreaterThan(callsBefore));
  });

  // -------------------------------------------------------------------------
  // [V-M30] styles の3状態を「取得中 / 失敗 / 取れたが軸が作れない」に切り分ける
  //
  // 「条件未確定はローディング側で扱う」だけだと、`stylesQuery` が **成功して0行**
  // のときに永久スピナーになる: settled + staleTime 24時間 + 再試行トリガー無しで
  // 復帰手段が無い。データ側の異常なのでエラー + 再試行に寄せるのが正しい。
  //
  //   stylesQuery.isPending → LoadingSpinner   (再試行ボタンは出さない)
  //   stylesQuery.isError   → エラー + 再試行
  //   filters === null      → エラー + 再試行  ← ここが「永久スピナー」から変わった
  //
  // ⚠️ isPending を最初に見る順序が保たれている限り、[V-M28] の「偽エラーが
  //    1フレーム挟まらない」は両立する (下の [V-M28] が緑であることで担保)。
  // -------------------------------------------------------------------------
  // ⚠️ **[V-M30] は 2026-09-08 に期待値が反転した。**
  //    旧: styles が使えない → エラー + 再試行 (タブ全体が止まる)
  //    新: **個人種目だけが不可で、リレーは使える**。web の
  //        `TeamRankings.test.tsx [V-03b]` と対。
  //    リレーの軸は `RELAY_EVENTS` (静的定義) 由来で RPC も styles を引かないので、
  //    ここでタブ全体を止めるのは無関係なマスターの失敗による退行だった。
  //
  //    ⚠️ 2つの文言 (`fetchFailed` / `empty`) は**末尾が完全に共通**なので
  //       `toContain` で見ると区別できない。`getByText` は exact 一致なのでそれを使い、
  //       もう一方が出ていないことも対で見る。
  it("[V-M30] 🚨 styles が空でもリレーの問い合わせが走る (タブ全体が止まらない)", async () => {
    const fake = makeSupabase({ stylesRows: [], rankings: [] });
    mocks.supabase.current = fake.client;

    renderRankings();

    // リレーの RPC が呼ばれる = リレーが実際に使える
    await waitFor(() => expect(fake.rpcCalls.length).toBeGreaterThanOrEqual(1));
    expect(fake.rpcCalls.map((call) => call.name)).toEqual(["get_team_relay_rankings"]);
    expect(fake.rpcCalls[0]?.args).toMatchObject({
      p_relay_kind: "free",
      p_leg_distance: 100,
      p_pool_type: 1,
      p_gender_category: "male",
    });

    // エラー画面には落ちない (永久スピナーでないことは RPC が走ったことで示される)
    expect(screen.queryByText(ranking.error)).toBeNull();
  });

  it("[V-M30] 🚨 styles が空のときは『登録されていない』文言で、再試行ボタンを出さない", async () => {
    const fake = makeSupabase({ stylesRows: [], rankings: [] });
    mocks.supabase.current = fake.client;

    renderRankings();

    await waitFor(() =>
      expect(screen.getByText(ranking.individualUnavailable.empty)).toBeTruthy(),
    );
    // もう一方の文言ではない (末尾が共通なので対で見る)
    expect(screen.queryByText(ranking.individualUnavailable.fetchFailed)).toBeNull();
    // 空は再試行しても直らないのでボタンを出さない
    expect(screen.queryByRole("button", { name: ranking.retry })).toBeNull();
  });

  it("[V-M30] canonical 化できない種目しか無いマスターでも同じ扱い (空と同一経路)", async () => {
    const fake = makeSupabase({
      stylesRows: [
        { id: 91, style: "MEDLEY", distance: 100, name: "n91", name_jp: "j91" },
        { id: 92, style: "Fr", distance: 0, name: "n92", name_jp: "j92" },
      ],
      rankings: [],
    });
    mocks.supabase.current = fake.client;

    renderRankings();

    await waitFor(() =>
      expect(screen.getByText(ranking.individualUnavailable.empty)).toBeTruthy(),
    );
    expect(screen.queryByRole("button", { name: ranking.retry })).toBeNull();
    expect(screen.queryByText(ranking.error)).toBeNull();
    await waitFor(() =>
      expect(fake.rpcCalls.map((call) => call.name)).toEqual(["get_team_relay_rankings"]),
    );
  });

  it("[V-M30] 🚨 取得失敗のときだけ再試行ボタンが出て、実際に styles を再取得する", async () => {
    const fake = makeSupabase({ stylesError: { code: "42501", message: "boom" }, rankings: [] });
    mocks.supabase.current = fake.client;

    renderRankings();
    await waitFor(() =>
      expect(screen.getByText(ranking.individualUnavailable.fetchFailed)).toBeTruthy(),
    );
    expect(screen.queryByText(ranking.individualUnavailable.empty)).toBeNull();

    const stylesFetchesBefore = fake.fromCalls.filter((t) => t === "styles").length;
    expect(stylesFetchesBefore).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("button", { name: ranking.retry }));

    // refetch が走れば styles テーブルへの問い合わせが1回増える。
    // 増えないなら「押しても何も起きないボタン」= 永久に復帰できない
    await waitFor(() =>
      expect(fake.fromCalls.filter((t) => t === "styles").length).toBeGreaterThan(
        stylesFetchesBefore,
      ),
    );
  });

  it("[V-M30] styles が正常なときは通知そのものが出ない (常時表示になっていない)", async () => {
    const fake = makeSupabase({ rankings: [] });
    mocks.supabase.current = fake.client;

    renderRankings();
    await waitFor(() => expect(fake.rpcCalls.length).toBeGreaterThanOrEqual(1));

    expect(screen.queryByText(ranking.individualUnavailable.empty)).toBeNull();
    expect(screen.queryByText(ranking.individualUnavailable.fetchFailed)).toBeNull();
    // 個人種目の RPC が走る (リレーへ倒れていない)
    expect(fake.rpcCalls.map((call) => call.name)).toEqual(["get_team_record_rankings"]);
  });

  it("[V-M30] 取得中はスピナーのみで、再試行ボタンを出さない (エラーと混同しない)", () => {
    const fake = makeSupabase({ stylesPending: true });
    mocks.supabase.current = fake.client;

    renderRankings();

    expect(screen.getByText(ranking.loading)).toBeTruthy();
    expect(screen.queryByText(ranking.error)).toBeNull();
    expect(screen.queryByRole("button", { name: ranking.retry })).toBeNull();
  });

  // ⚠️ **この項目も反転した (2026-09-08)。** 旧: styles 取得失敗 → エラー表示 +
  //    絞り込みボタンも出さない。新: 個人種目だけ不可の通知を出し、**絞り込みは
  //    出してリレーを選べる**。[V-M30] と対で、こちらは「絞り込みボタンが残る」
  //    という否定形が本体。
  it("[V-M27] 🚨 styles マスターが取れなくても絞り込みボタンは出る (リレーを選べる)", async () => {
    const fake = makeSupabase({ stylesError: { code: "42501", message: "boom" }, rankings: [] });
    mocks.supabase.current = fake.client;

    renderRankings();

    await waitFor(() =>
      expect(screen.getByText(ranking.individualUnavailable.fetchFailed)).toBeTruthy(),
    );
    // 絞り込みボタンが消えていない (消えるとリレーへ切り替える手段が無くなる)
    expect(
      screen
        .queryAllByRole("button")
        .filter((node) => (node.textContent ?? "").startsWith(FILTER_LABEL)).length,
    ).toBeGreaterThanOrEqual(1);
    // 個人種目の RPC は叩かない / リレーの RPC は叩く
    await waitFor(() =>
      expect(fake.rpcCalls.map((call) => call.name)).toEqual(["get_team_relay_rankings"]),
    );
    expect(screen.queryByText(ranking.error)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // [V-M21] 空状態 2 種
  // -------------------------------------------------------------------------
  it("[V-M21] チームに記録があるが条件に一致しない場合は「該当なし」を出す", async () => {
    const fake = makeSupabase({ rankings: [], recordCount: 5 });
    mocks.supabase.current = fake.client;

    renderRankings();

    await waitFor(() => expect(screen.getByText(ranking.empty.noMatchTitle)).toBeTruthy());
    expect(screen.queryByText(ranking.empty.noRecordsTitle)).toBeNull();
  });

  it("[V-M21] チームに大会記録が1件も無い場合は「記録なし」を出す", async () => {
    const fake = makeSupabase({ rankings: [], recordCount: 0 });
    mocks.supabase.current = fake.client;

    renderRankings();

    await waitFor(() => expect(screen.getByText(ranking.empty.noRecordsTitle)).toBeTruthy());
    expect(screen.queryByText(ranking.empty.noMatchTitle)).toBeNull();
  });

  it("[V-M21] 0 件でも絞り込みボタンは操作できる (条件を変えて抜け出せる)", async () => {
    const fake = makeSupabase({ rankings: [], recordCount: 0 });
    mocks.supabase.current = fake.client;

    renderRankings();

    await waitFor(() => expect(screen.getByText(ranking.empty.noRecordsTitle)).toBeTruthy());
    openFilterSheet();
    expect(screen.getByRole("button", { name: "個人メドレー" })).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // [V-M23][V-M24][V-M25] 絞り込みの適用
  // -------------------------------------------------------------------------
  it("[V-M23] シートで適用した条件が RPC 引数に反映される", async () => {
    const fake = makeSupabase({ rankings: [rpcRow()] });
    mocks.supabase.current = fake.client;

    renderRankings();
    await lastRpcArgs(fake);

    openFilterSheet();
    fireEvent.click(screen.getByRole("button", { name: "個人メドレー" }));
    fireEvent.click(screen.getByRole("button", { name: "短水路" }));
    fireEvent.click(screen.getByRole("button", { name: ranking.gender.female }));
    fireEvent.click(screen.getByRole("button", { name: "すべての大会" }));
    fireEvent.click(screen.getByRole("button", { name: jaMessages.common.bottomSheet.apply }));

    const args = await lastRpcArgs(fake, 2);
    expect(args).toMatchObject({
      // Fr 100m → 個人メドレー は 100m が存在するので維持 (styles.id = 20)
      p_style_id: 20,
      p_pool_type: 0,
      p_gender: 1,
      p_scope: "allCompetitions",
    });
  });

  it("[V-M23] シートで適用すると要約行も更新される", async () => {
    const fake = makeSupabase({ rankings: [rpcRow()] });
    mocks.supabase.current = fake.client;

    renderRankings();
    await lastRpcArgs(fake);

    openFilterSheet();
    fireEvent.click(screen.getByRole("button", { name: "バタフライ" }));
    fireEvent.click(screen.getByRole("button", { name: ranking.gender.male }));
    fireEvent.click(screen.getByRole("button", { name: jaMessages.common.bottomSheet.apply }));

    await waitFor(() =>
      expect(
        screen.getByText(
          `50mバタフライ / ${jaMessages.common.poolTypeLong} / ${ranking.gender.male} / ${ranking.period.allTime}`,
        ),
      ).toBeTruthy(),
    );
  });

  it("[V-M24] 既定条件では絞り込みバッジを出さない", async () => {
    const fake = makeSupabase({ rankings: [rpcRow()] });
    mocks.supabase.current = fake.client;

    renderRankings();

    await lastRpcArgs(fake);

    expect(filterBadgeText()).toBe("");
  });

  it("[V-M24] 3 軸を変えるとバッジに 3 が出る", async () => {
    const fake = makeSupabase({ rankings: [rpcRow()] });
    mocks.supabase.current = fake.client;

    renderRankings();
    await lastRpcArgs(fake);

    openFilterSheet();
    fireEvent.click(screen.getByRole("button", { name: "短水路" }));
    fireEvent.click(screen.getByRole("button", { name: ranking.gender.female }));
    fireEvent.click(screen.getByRole("button", { name: "すべての大会" }));
    fireEvent.click(screen.getByRole("button", { name: jaMessages.common.bottomSheet.apply }));

    await waitFor(() => expect(filterBadgeText()).toBe("3"));
  });

  it("[V-M25] すべての大会を選ぶと本体側にも注意書きが出る (既定では出ない)", async () => {
    const fake = makeSupabase({ rankings: [rpcRow()] });
    mocks.supabase.current = fake.client;

    renderRankings();
    await lastRpcArgs(fake);

    expect(screen.queryByText(ranking.scope.allCompetitionsNote)).toBeNull();

    openFilterSheet();
    fireEvent.click(screen.getByRole("button", { name: "すべての大会" }));
    fireEvent.click(screen.getByRole("button", { name: jaMessages.common.bottomSheet.apply }));

    await waitFor(() => expect(screen.getByText(ranking.scope.allCompetitionsNote)).toBeTruthy());
  });

  it("[V-M07] ランキング表示で署名付き URL の取得が 1 件も発生しない (アバター撤去)", async () => {
    signedImageUrlSpy.mockClear();
    const fake = makeSupabase({
      rankings: [
        rpcRow({ record_id: "rec-alpha", user_id: "usr-alpha", display_name: "アルファ", time: 27.31 }),
        rpcRow({ record_id: "rec-bravo", user_id: "usr-bravo", display_name: "ブラボー", time: 28.44 }),
        rpcRow({ record_id: "rec-charlie", user_id: "usr-charlie", display_name: "チャーリー", time: 29.07 }),
      ],
    });
    mocks.supabase.current = fake.client;

    renderRankings();
    await waitFor(() => expect(screen.getByText("アルファ")).toBeTruthy());

    // 3 行描画されても署名付き URL の取得は 0 件
    expect(signedImageUrlSpy).toHaveBeenCalledTimes(0);
    expect(document.querySelectorAll("img")).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // [V-M26] ソート UI を持たない
  // -------------------------------------------------------------------------
  it("[V-M26] ツールバーのボタンは「絞り込み」だけ (並べ替えボタンが無い)", async () => {
    const fake = makeSupabase({
      rankings: [
        rpcRow({ record_id: "rec-alpha", user_id: "usr-alpha", time: 27.31 }),
        rpcRow({ record_id: "rec-bravo", user_id: "usr-bravo", time: 28.44 }),
        rpcRow({ record_id: "rec-charlie", user_id: "usr-charlie", time: 29.07 }),
      ],
    });
    mocks.supabase.current = fake.client;

    renderRankings();

    await waitFor(() => expect(screen.getByText("3件")).toBeTruthy());

    // -----------------------------------------------------------------------
    // ⚠️ クエリを **ツールバー配下にスコープする**。
    //
    // 第3弾で「個人種目 / リレー」のサブビュー切替が追加された。実装は
    // `accessibilityRole="radiogroup"` / `"radio"` を使っているが、
    // `apps/mobile/__mocks__/react-native.ts` の Pressable モックは
    // accessibilityRole を無視して常に `<button>` を返すため、
    // `screen.getAllByRole("button")` に切替ボタン2件が混入する
    // (モックの方が実機より緩い既知のズレ。実機では radio として読まれる)。
    //
    // ここで期待値に2件足して逃げると、このテストの意図
    // 「**ツールバーに並べ替えボタンが無い**」がぼやける
    // (ツールバーに sort ボタンが増えても、切替ボタンを1つ消せば緑になる)。
    // ツールバー = 絞り込みボタンを含む行、に限定して数える。
    // -----------------------------------------------------------------------
    const filterButton = screen.getByRole("button", {
      name: jaMessages.common.listToolbar.filterButton,
    });
    const toolbar = filterButton.parentElement;
    if (!toolbar) {
      throw new Error("絞り込みボタンの親 (ツールバー) が見つかりません");
    }

    // スコープが本当にツールバー行かを固定する: 絞り込み条件サマリーが同じ行にある
    // (親を1段たどっただけの何か別の div を掴んでいないことの担保)
    const toolbarSummary = within(toolbar).getByText(new RegExp(jaMessages.common.poolTypeLong));
    expect(toolbarSummary.textContent).toContain(ranking.gender.male);

    const toolbarButtons = within(toolbar)
      .getAllByRole("button")
      .map((node) => node.textContent);
    expect(toolbarButtons).toEqual([jaMessages.common.listToolbar.filterButton]);

    // 並べ替えに使われうる文言がツールバーに1つも無いこと (否定形)。
    // 「並べ替え」ボタンが別ラベルで足された場合も拾えるよう文言を列挙する
    for (const label of [
      jaMessages.common.listToolbar.sortButton,
      ranking.col.time,
      ranking.col.name,
      ranking.col.date,
    ]) {
      expect(within(toolbar).queryByText(label)).toBeNull();
    }

    // ⚠️ **「個人種目 / リレー」のサブビュー切替は廃止された (2026-09-08)。**
    //    種目チップの7択 (個人5 + リレー2) の選択そのものがモードを決めるので、
    //    トグルを残すと「個人種目を選んでいるのにリレー表示」という矛盾した
    //    組み合わせが表現可能になる。i18n キー `relay.view.*` も削除済み。
    //    ここでは**トグルが復活していないこと**を否定形で押さえる
    expect(screen.queryByText("個人種目")).toBeNull();
    expect(screen.queryByText("リレー")).toBeNull();
  });

  it("[V-M26] 表示順は RPC が返した順序そのままである", async () => {
    const fake = makeSupabase({
      rankings: [
        rpcRow({ record_id: "rec-third", user_id: "usr-3", display_name: "サード", time: 29.07 }),
        rpcRow({ record_id: "rec-first", user_id: "usr-1", display_name: "ファースト", time: 27.31 }),
        rpcRow({ record_id: "rec-second", user_id: "usr-2", display_name: "セカンド", time: 28.44 }),
      ],
    });
    mocks.supabase.current = fake.client;

    renderRankings();

    await waitFor(() => expect(screen.getByText("サード")).toBeTruthy());

    const names = screen
      .getAllByText(/^(サード|ファースト|セカンド)$/)
      .map((node) => node.textContent);
    expect(names).toEqual(["サード", "ファースト", "セカンド"]);
  });

  it("同着は同順位で次の順位が件数分スキップされる (1, 2, 2, 4)", async () => {
    const fake = makeSupabase({
      rankings: [
        rpcRow({ record_id: "rec-alpha", user_id: "usr-a", time: 27.31 }),
        rpcRow({ record_id: "rec-bravo", user_id: "usr-b", time: 28.44 }),
        rpcRow({ record_id: "rec-charlie", user_id: "usr-c", time: 28.44 }),
        rpcRow({ record_id: "rec-delta", user_id: "usr-d", time: 29.07 }),
      ],
    });
    mocks.supabase.current = fake.client;

    renderRankings();

    await waitFor(() => expect(screen.getByText("4件")).toBeTruthy());

    // 順位バッジ 1 / 2 / 2 / 4。3 位は欠番
    expect(screen.getAllByText("2")).toHaveLength(2);
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.queryByText("3")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // [V-M28] ★ RED: 読み込み中に偽のエラー表示が挟まる (mobile 固有の実装バグ)
  //
  // 原因 (プロダクションコードの構造):
  //   TeamRankings.tsx は絞り込み条件を `useState<TeamRankingFilters | null>(null)`
  //   + `useEffect` で後から確定させている。そのため
  //     「styles の取得が終わった」かつ「まだ effect が走っていない」
  //   という中間コミットが必ず 1 回発生し、そこでは
  //     if (stylesQuery.isError || defaultFilters === null || filters === null)
  //   の 3 番目の条件だけが真になって RankingErrorView が描画される。
  //   何も失敗していないのに、赤い alert-circle アイコン +
  //   「ランキングの取得に失敗しました」+「再試行」ボタンが 1 フレーム表示される。
  //
  //   web (`apps/web/components/team/rankings/TeamRankings.tsx`) は同じ問題を
  //     const filters = selectedFilters ?? defaultFilters ?? undefined;
  //   とレンダー中に導出することで回避している。mobile も同じ形にすれば消える
  //   (state + effect ではなく導出にする)。
  //
  // 検出方法: MutationObserver で **コミットされた全 DOM 状態**を記録する。
  //   setTimeout ポーリングだと取りこぼすが、MutationObserver は各 DOM 変更の
  //   直後に microtask として発火するため、タイミングに依存せず全状態を拾える。
  // -------------------------------------------------------------------------
  it("[V-M28] styles の読み込み完了から一覧表示までの間に「取得に失敗しました」を表示しない", async () => {
    // `let x: (() => void) | null = null` にすると TS が Promise executor 内の代入を
    // 追えず null に絞り込み、`x?.()` が never 呼び出しになる。definite assignment で回避する
    let resolveStyles!: () => void;
    const stylesGate = new Promise<void>((resolve) => {
      resolveStyles = resolve;
    });

    const rpcCalls: Array<Record<string, unknown>> = [];
    const makeThenable = (
      result: { data: unknown; error: unknown; count?: number },
      wait?: Promise<void>,
    ) => {
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "order", "eq", "in", "is", "limit", "ilike"]) {
        builder[method] = vi.fn(() => builder);
      }
      builder.then = (
        onfulfilled?: ((value: typeof result) => unknown) | null,
        onrejected?: ((reason: unknown) => unknown) | null,
      ) => (wait ? wait.then(() => result) : Promise.resolve(result)).then(onfulfilled, onrejected);
      return builder;
    };

    const client = {
      from: vi.fn((table: string) =>
        table === "styles"
          ? makeThenable({ data: STYLE_ROWS, error: null }, stylesGate)
          : makeThenable({ data: [], error: null, count: 0 }),
      ),
      rpc: vi.fn(async (_name: string, args: Record<string, unknown>) => {
        rpcCalls.push(args);
        return { data: [rpcRow()], error: null };
      }),
    };
    mocks.supabase.current = client as unknown as never;

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <TeamRankings teamId={TEAM_ID} members={[]} />
      </QueryClientProvider>,
    );

    // コミットされた DOM 状態をすべて記録する
    const committedStates: string[] = [container.textContent ?? ""];
    const observer = new MutationObserver(() => {
      committedStates.push(container.textContent ?? "");
    });
    observer.observe(container, { subtree: true, childList: true, characterData: true });

    resolveStyles();
    await waitFor(() => expect(screen.getByText("セブン")).toBeTruthy());
    observer.disconnect();

    // 前提: 一度も失敗していない (RPC は成功、styles も成功)
    expect(rpcCalls.length).toBeGreaterThanOrEqual(1);

    const errorStates = committedStates.filter((state) => state.includes(ranking.error));
    expect(
      errorStates,
      [
        "読み込みの途中で「エラー」状態が描画されました。",
        "何も失敗していないのに再試行ボタン付きのエラー画面が一瞬表示されます。",
        "観測されたコミット状態:",
        ...committedStates.map((state, index) => `  [${index}] ${state.slice(0, 90)}`),
      ].join("\n"),
    ).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // [V-M29] ★ RED: allCompetitions で「チームに大会記録がありません」が嘘になる
  //
  // Contract 変更 (Reviewer M-3) で「`hasAnyRecord` を信用できるのは
  // `teamCompetitions` のときだけ」が確定し、**web には反映済み**です
  // (`apps/web/components/team/rankings/TeamRankings.tsx:94`):
  //
  //     const canTrustHasAnyRecord = filters?.scope === "teamCompetitions";
  //     const hasAnyRecordQuery = useTeamHasAnyRecordQuery(supabase, teamId, {
  //       enabled: isEmptyResult && canTrustHasAnyRecord,
  //     });
  //
  // mobile 側は `enabled: isEmptyResult` のままで、スコープを見ていません
  // (`apps/mobile/components/teams/rankings/TeamRankings.tsx:100-102`)。
  //
  // なぜ嘘になるか: `hasAnyRecord` は RLS 下の素のクエリなので、メンバーが
  // **別チームの**チーム大会で出した記録 (`records.team_id` が他チーム) を
  // 数えられません。その記録は SECURITY DEFINER の RPC が allCompetitions で
  // 返せるため、false を「記録が1件もない」と読むと
  // 「チームに大会記録がありません」と出したのに種目を変えると記録が出る、
  // という自己矛盾した表示になります。
  //
  // 修正方法 (web と同じ 2 行):
  //   const canTrustHasAnyRecord = filters.scope === "teamCompetitions";
  //   enabled: isEmptyResult && canTrustHasAnyRecord
  //   emptyVariant={canTrustHasAnyRecord && hasAnyRecordQuery.data === false
  //     ? "noRecords" : "noMatch"}
  // -------------------------------------------------------------------------
  it("[V-M29] allCompetitions では hasAnyRecord=false でも「該当なし」に寄せる (web とのパリティ)", async () => {
    const fake = makeSupabase({ rankings: [], recordCount: 0 });
    mocks.supabase.current = fake.client;

    const { container } = renderRankings();

    // 対照: teamCompetitions では「チームに記録なし」が正しい
    await waitFor(() => expect(screen.getByText(ranking.empty.noRecordsTitle)).toBeTruthy());

    openFilterSheet();
    fireEvent.click(screen.getByRole("button", { name: "すべての大会" }));
    fireEvent.click(screen.getByRole("button", { name: jaMessages.common.bottomSheet.apply }));
    await waitFor(() => expect(fake.rpcCalls.length).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(screen.getByText(ranking.scope.allCompetitionsNote)).toBeTruthy());

    const rendered = container.textContent ?? "";
    expect(
      rendered.includes(ranking.empty.noRecordsTitle),
      [
        "allCompetitions スコープで「チームに大会記録がありません」と断定しています。",
        "hasAnyRecord は RLS 下の素クエリなので他チーム大会の記録を数えられず、この断定は嘘になりえます。",
        "web は teamCompetitions のときだけ hasAnyRecord を信用する形に修正済みです。",
        `実際の描画: ${rendered.slice(0, 160)}`,
      ].join("\n"),
    ).toBe(false);
    expect(rendered).toContain(ranking.empty.noMatchTitle);
  });

  // -------------------------------------------------------------------------
  // [V-M31] 空状態文言の真理値表 (web と**対**で同じ表を持つ)
  //
  // 対になる web 側: apps/web/__tests__/components/team/TeamRankings.test.tsx の
  // 「[V-05c] 空状態文言の真理値表」。H-2 (大会名の "-" vs common.none) で潰した
  // web/mobile の非対称が hasAnyRecord という別フィールドで再生産されたため、
  // 同じ表を両方に置いて片方だけ変わったら必ずどちらかが赤くなるようにする。
  //
  //   scope             | hasAnyRecord | 期待文言
  //   ------------------+--------------+-----------
  //   teamCompetitions  | false        | noRecords  (チームに大会記録がありません)
  //   teamCompetitions  | true         | noMatch    (該当する記録がありません)
  //   allCompetitions   | false        | noMatch    ← 信用できないので断定しない
  //   allCompetitions   | true         | noMatch
  // -------------------------------------------------------------------------
  describe("[V-M31] 空状態文言の真理値表 (web と対)", () => {
    it.each([
      ["teamCompetitions", 0, "noRecords"],
      ["teamCompetitions", 5, "noMatch"],
    ] as const)(
      "scope=%s / records=%i 件 → %s",
      async (_scope, recordCount, expected) => {
        const fake = makeSupabase({ rankings: [], recordCount });
        mocks.supabase.current = fake.client;

        renderRankings();

        const expectedTitle =
          expected === "noRecords" ? ranking.empty.noRecordsTitle : ranking.empty.noMatchTitle;
        const forbiddenTitle =
          expected === "noRecords" ? ranking.empty.noMatchTitle : ranking.empty.noRecordsTitle;
        await waitFor(() => expect(screen.getByText(expectedTitle)).toBeTruthy());
        expect(screen.queryByText(forbiddenTitle)).toBeNull();
      },
    );

    it.each([0, 5])(
      "scope=allCompetitions / records=%i 件 → noMatch (hasAnyRecord を信用しない)",
      async (recordCount) => {
        const fake = makeSupabase({ rankings: [], recordCount });
        mocks.supabase.current = fake.client;

        renderRankings();
        await waitFor(() => expect(fake.rpcCalls.length).toBeGreaterThanOrEqual(1));

        openFilterSheet();
        fireEvent.click(screen.getByRole("button", { name: "すべての大会" }));
        fireEvent.click(screen.getByRole("button", { name: jaMessages.common.bottomSheet.apply }));
        await waitFor(() => expect(fake.rpcCalls.length).toBeGreaterThanOrEqual(2));

        await waitFor(() => expect(screen.getByText(ranking.empty.noMatchTitle)).toBeTruthy());
        expect(screen.queryByText(ranking.empty.noRecordsTitle)).toBeNull();
      },
    );
  });

  // -------------------------------------------------------------------------
  // [V-M32] 🚨 リレー種目 ⇄ 個人種目の往復 (絞り込みシート経由)
  //
  // 種目軸の統合 (2026-09-08) で、リレーは「サブビュー切替」ではなく
  // **種目チップの選択**で表示される。旧 `TeamRelayRankings.test.tsx` の
  // 絞り込み系 ([V-MR-05] / [V-MR-06]) をここへ移設したもの。
  // web の `TeamRankings.test.tsx [V-RL-F]` と対。
  // -------------------------------------------------------------------------
  describe("[V-M32] リレー種目 ⇄ 個人種目の往復", () => {
    /** リレー RPC の1行 (個人種目の行とは形が違う) */
    function relayRpcRow(overrides: Record<string, unknown> = {}) {
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
        legs: [],
        ...overrides,
      };
    }

    /**
     * 個人種目とリレーで別の行を返す fake。
     * RPC 名を問わず同じ配列を返す fake だと、リレーを選んだ瞬間に
     * 個人種目の行が描かれる偽陽性が起きる。
     */
    function makeDualSupabase() {
      return makeSupabase({
        rankings: (args) => ("p_relay_kind" in args ? [relayRpcRow()] : [rpcRow()]),
      });
    }

    /** シートを開いてチップを押し、適用する */
    function applyChips(...labels: string[]) {
      openFilterSheet();
      for (const label of labels) {
        fireEvent.click(screen.getByRole("button", { name: label }));
      }
      fireEvent.click(screen.getByRole("button", { name: jaMessages.common.bottomSheet.apply }));
    }

    it("🚨 フリーリレーを選んで適用するとリレーの RPC を叩く (往復の片道)", async () => {
      const fake = makeDualSupabase();
      mocks.supabase.current = fake.client;

      renderRankings();
      await waitFor(() => expect(fake.rpcCalls.length).toBeGreaterThanOrEqual(1));
      expect(fake.rpcCalls[0]?.name).toBe("get_team_record_rankings");

      applyChips("フリーリレー");

      await waitFor(() => expect(fake.rpcCalls.at(-1)?.name).toBe("get_team_relay_rankings"));
      expect(fake.rpcCalls.at(-1)?.args).toMatchObject({
        p_relay_kind: "free",
        // 個人種目 Fr 50m (既定) から引き継がれた1レグ距離
        p_leg_distance: 50,
        p_pool_type: 1,
        p_gender_category: "male",
        p_fiscal_year: null,
        p_fiscal_year_or_earlier: false,
      });
    });

    it("🚨 個人種目に戻すと個人の RPC に戻る (往復の帰り道)", async () => {
      const fake = makeDualSupabase();
      mocks.supabase.current = fake.client;

      renderRankings();
      await waitFor(() => expect(fake.rpcCalls.length).toBeGreaterThanOrEqual(1));

      applyChips("フリーリレー");
      await waitFor(() => expect(fake.rpcCalls.at(-1)?.name).toBe("get_team_relay_rankings"));

      applyChips("自由形");
      await waitFor(() => expect(fake.rpcCalls.at(-1)?.name).toBe("get_team_record_rankings"));
      expect(fake.rpcCalls.at(-1)?.args).toMatchObject({ p_style_id: 2 });
    });

    it("メドレーリレーでは 200m のチップが消える (公式種目に無い)", async () => {
      const fake = makeDualSupabase();
      mocks.supabase.current = fake.client;

      renderRankings();
      await waitFor(() => expect(fake.rpcCalls.length).toBeGreaterThanOrEqual(1));

      // `× 4` を直書きしない (relay.legDistanceOption の補間で組む)
      const chipLabel = (distance: number, legCount = 4) =>
        ranking.relay.legDistanceOption
          .replace("{distance}", String(distance))
          .replace("{legCount}", String(legCount));

      applyChips("フリーリレー");
      openFilterSheet();
      expect(screen.getByRole("button", { name: chipLabel(200) })).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "メドレーリレー" }));

      await waitFor(() =>
        expect(screen.queryByRole("button", { name: chipLabel(200) })).toBeNull(),
      );
      // ⚠️ 長水路 (既定) では `25m × 4` が元から無い ([V-P2-61])
      for (const distance of [50, 100]) {
        expect(screen.getByRole("button", { name: chipLabel(distance) })).toBeTruthy();
      }
      expect(screen.queryByRole("button", { name: chipLabel(25) })).toBeNull();
    });

    it("🚨 混合のまま個人種目に戻すと男子に正規化される (画面と条件が食い違わない)", async () => {
      const fake = makeDualSupabase();
      mocks.supabase.current = fake.client;

      renderRankings();
      await waitFor(() => expect(fake.rpcCalls.length).toBeGreaterThanOrEqual(1));

      applyChips("フリーリレー", "混合");
      await waitFor(() =>
        expect(fake.rpcCalls.at(-1)?.args).toMatchObject({ p_gender_category: "mixed" }),
      );

      applyChips("自由形");

      // RPC は 0=男子 / 1=女子。mixed が男子に正規化されている
      await waitFor(() => expect(fake.rpcCalls.at(-1)?.args).toMatchObject({ p_gender: 0 }));
      // シートにも混合チップが無い
      openFilterSheet();
      expect(screen.queryByRole("button", { name: "混合" })).toBeNull();
    });

    it("🚨 リレー中の scope 差分はバッジに数えない (消せないバッジを作らない)", async () => {
      const fake = makeDualSupabase();
      mocks.supabase.current = fake.client;

      renderRankings();
      await waitFor(() => expect(fake.rpcCalls.length).toBeGreaterThanOrEqual(1));

      // 個人種目で対象大会を既定から変える → バッジ 1
      applyChips("すべての大会");
      await waitFor(() => expect(filterBadgeText()).toBe("1"));

      // リレーへ切り替える。scope は保持されるが**画面に出ていない**ので
      // 数えるのは種目の 1 だけ
      applyChips("フリーリレー");
      await waitFor(() => expect(fake.rpcCalls.at(-1)?.name).toBe("get_team_relay_rankings"));
      expect(filterBadgeText()).toBe("1");

      // 個人に戻すと scope の選択が復元され、バッジも 1 に戻る
      applyChips("自由形");
      await waitFor(() => expect(fake.rpcCalls.at(-1)?.name).toBe("get_team_record_rankings"));
      expect(filterBadgeText()).toBe("1");
      openFilterSheet();
      // 勝手に狭まっていない
      expect(screen.getByRole("button", { name: "すべての大会" })).toBeTruthy();
    });
  });


  // -------------------------------------------------------------------------
  // [V-M33] 🚨 派生フォールバックの担保 = 4つの消費側すべてが `active.state` を読む
  //
  // Reviewer 申し送り。`filterState` (= ユーザーが選んだ生の値) と
  // `active.state` (= 今のマスターで成立する値) は**セッション中に styles が
  // 縮んだときに食い違う**。食い違ったときに片方でも `filterState` を読むと
  //   - 要約 … 存在しない条件を表示する
  //   - バッジ … 消せないバッジになる
  //   - シート seed … 開くと「消えた種目」が選択済みに見える
  //   - クエリ … 画面に出ている条件と別の条件で問い合わせる
  // のいずれかが起きる。**どれも例外を投げない**ので静かに壊れる。
  //
  // 食い違う状態の作り方 (4箇所それぞれが**区別できる観測値**を持つ):
  //   selectedState = {Fr, 400m} を作る → styles マスターを空にする
  //   → filterState は {Fr, 400m} のまま / active.state はリレー既定
  //     {free, 100m×4, 長水路, 男子}
  //
  // ⚠️ `styles` は再取得トリガーが無いので invalidate で縮ませる
  //    (React Query の正規の機構。実運用でも別画面からの invalidate や
  //     再マウントで同じ経路を通る)。
  // -------------------------------------------------------------------------
  describe("[V-M33] 4つの消費側すべてが active.state を読む", () => {
    function relayRpcRow(overrides: Record<string, unknown> = {}) {
      return {
        relay_record_id: "rr-kingfisher-m33",
        relay_kind: "free",
        leg_distance: 100,
        leg_count: 4,
        pool_type: 1,
        gender_category: "male",
        total_time: 214.55,
        competition_id: null,
        competition_title: null,
        competition_date: null,
        relay_created_at: "2026-05-04T09:15:00+09:00",
        legs: [],
        ...overrides,
      };
    }

    /**
     * `filterState !== active.state` の状態を作る。
     * 戻り値の `fake` で RPC 名/引数を、DOM で要約・バッジ・シートを観測する。
     */
    async function reachDivergedState() {
      let stylesCalls = 0;
      const fake = makeSupabase({
        // 1回目は完全なマスター、2回目以降は空
        stylesRows: () => {
          stylesCalls += 1;
          return stylesCalls === 1 ? STYLE_ROWS : [];
        },
        rankings: (args) => ("p_relay_kind" in args ? [relayRpcRow()] : [rpcRow()]),
      });
      mocks.supabase.current = fake.client;

      const { queryClient } = renderRankings();
      await waitFor(() => expect(fake.rpcCalls.length).toBeGreaterThanOrEqual(1));

      // ユーザーが Fr 400m を選ぶ (= selectedState が非 null になる)
      openFilterSheet();
      fireEvent.click(screen.getByRole("button", { name: "400m" }));
      fireEvent.click(screen.getByRole("button", { name: jaMessages.common.bottomSheet.apply }));
      await waitFor(() => expect(fake.rpcCalls.at(-1)?.args).toMatchObject({ p_style_id: 5 }));

      const before = fake.fromCalls.filter((table) => table === "styles").length;
      expect(before).toBe(1);

      // セッション中にマスターが空になる
      await queryClient.invalidateQueries({ queryKey: styleKeys.list() });
      // 🚨 空振り防止: 再取得が実際に起きたことを確認する。起きていなければ
      //    食い違う状態に到達しておらず、以降の assert は全部トートロジーになる
      await waitFor(() =>
        expect(
          fake.fromCalls.filter((table) => table === "styles").length,
          "invalidate 後に styles の再取得が起きていない (状態に到達していない)",
        ).toBeGreaterThan(before),
      );
      // 個人種目のチップが消えている = マスターが空になったことの実証
      await waitFor(() => expect(screen.queryByText("自由形")).toBeNull());

      return fake;
    }

    /**
     * 要約テキストのノード。`accessibilityLabel` が
     * 「{ランキング}: {要約}」の形なので、その接頭辞で1つに絞る。
     *
     * ⚠️ `getByText` に述語を渡すと祖先の div も全部マッチする
     *    (textContent は子孫を含むため)。ノードを特定してから中身を見る。
     */
    function summaryNode(): HTMLElement {
      const prefix = `${ranking.title}: `;
      // ⚠️ RN モックは `accessibilityLabel` を DOM の `aria-label` に変換しないので
      //    `getByLabelText` では取れない。小文字化された属性で引く
      const candidates = Array.from(document.querySelectorAll("[accessibilitylabel]")).filter(
        (el) => (el.getAttribute("accessibilitylabel") ?? "").startsWith(prefix),
      );
      // 同じラベルが祖先にも付くので、最も内側 (子孫に同属性を持たない) を採る
      const leaf = candidates.find((el) => el.querySelector("[accessibilitylabel]") === null);
      if (!leaf) throw new Error("要約ノードが見つからない (テストの前提が崩れている)");
      return leaf as HTMLElement;
    }

    it("🚨 消費側①要約: リレー既定を表示する (消えた 400m 自由形を表示しない)", async () => {
      await reachDivergedState();

      // `buildSummary(active.state)` = 100m × 4 / フリーリレー / 長水路 / 男子。
      // 期待値は本番のビルダーでは作らず、i18n キーの断片で見る。
      //
      // 🚨 **表示テキストと `accessibilityLabel` の両方を見る。**
      //    要約は `buildSummary(...)` を2回呼んでおり (ラベル用と表示用)、
      //    片方だけ `filterState` に戻すミューテーションは
      //    もう片方だけを見ていると緑のまま通る (実測で確認した穴)。
      const node = summaryNode();
      const expectedDistance = ranking.relay.legDistanceOption
        .replace("{distance}", "100")
        .replace("{legCount}", "4");

      for (const [label, text] of [
        ["表示テキスト", node.textContent ?? ""],
        ["accessibilityLabel", node.getAttribute("accessibilitylabel") ?? ""],
      ] as const) {
        expect(text, label).toContain(ranking.relay.kind.free);
        expect(text, label).toContain(expectedDistance);
        // 🚨 `filterState` を読んでいたら「400m」と「自由形」が出る
        expect(text, label).not.toContain("400m");
        expect(text, label).not.toContain(jaMessages.practice.styles.Fr);
      }
      // ラベルはセクション名を前置する (スクリーンリーダー向け)
      expect(node.getAttribute("accessibilitylabel")).toContain(`${ranking.title}: `);
    });

    it("🚨 消費側②バッジ: リレー既定との差分 0 なのでバッジが付かない", async () => {
      await reachDivergedState();

      // `active.state` はリレー既定そのものなので差分 0。
      // `filterState` ({Fr,400m}) を読むと既定と違うのでバッジが付く
      expect(filterBadgeText()).toBe("");
    });

    it("🚨 消費側③シート seed: 開くとリレーが選択済みになる (消えた種目が選択済みに見えない)", async () => {
      await reachDivergedState();

      openFilterSheet();

      // シートは `filterState={active.state}` で seed される
      const relayChip = screen.getByRole("button", { name: ranking.relay.kind.free });
      expect(relayChip.style.backgroundColor).toBe("rgb(37, 99, 235)"); // chipSelected
      // 400m のチップは選択肢自体に無い (リレーの距離は 25/50/100/200)
      expect(screen.queryByRole("button", { name: "400m" })).toBeNull();
    });

    it("🚨 消費側④クエリ: リレーの RPC だけを叩く (個人 RPC を叩かない)", async () => {
      const fake = await reachDivergedState();

      await waitFor(() => expect(fake.rpcCalls.at(-1)?.name).toBe("get_team_relay_rankings"));
      expect(fake.rpcCalls.at(-1)?.args).toMatchObject({
        p_relay_kind: "free",
        p_leg_distance: 100,
        p_pool_type: 1,
        p_gender_category: "male",
      });
    });

    it("マスターが復活すると `selectedState` が蘇る (派生値なので破壊していない)", async () => {
      // 上の4件が「常に既定へ戻す」実装でも緑になるので対で置く。
      // `selectedState` を破壊していないことの実証
      let stylesCalls = 0;
      const fake = makeSupabase({
        stylesRows: () => {
          stylesCalls += 1;
          return stylesCalls === 2 ? [] : STYLE_ROWS;
        },
        rankings: (args) => ("p_relay_kind" in args ? [relayRpcRow()] : [rpcRow()]),
      });
      mocks.supabase.current = fake.client;

      const { queryClient } = renderRankings();
      await waitFor(() => expect(fake.rpcCalls.length).toBeGreaterThanOrEqual(1));

      openFilterSheet();
      fireEvent.click(screen.getByRole("button", { name: "400m" }));
      fireEvent.click(screen.getByRole("button", { name: jaMessages.common.bottomSheet.apply }));
      await waitFor(() => expect(fake.rpcCalls.at(-1)?.args).toMatchObject({ p_style_id: 5 }));

      // 空になる → リレーへ倒れる
      await queryClient.invalidateQueries({ queryKey: styleKeys.list() });
      await waitFor(() => expect(fake.rpcCalls.at(-1)?.name).toBe("get_team_relay_rankings"));

      // 復活する → ユーザーの選択 (Fr 400m) が戻る
      await queryClient.invalidateQueries({ queryKey: styleKeys.list() });
      await waitFor(() => expect(fake.rpcCalls.at(-1)?.name).toBe("get_team_record_rankings"));
      expect(fake.rpcCalls.at(-1)?.args).toMatchObject({ p_style_id: 5 });
      expect(filterBadgeText()).toBe("1");
    });

    it("派生フォールバック先が `defaultState` である (無条件のリレーではない)", () => {
      // 🚨 唯一残すソース走査。`buildDefaultRelayRankingFilters` へ「簡素化」されると
      //    groups 非空 (= 個人種目が使える) でも**説明なしでリレーへ飛ばされる**。
      //    この形は挙動でも [V-M32] 系で捕まるが、意図を明示するために
      //    実ファイル1本だけ固定する (合成文字列への assert はしない)。
      const source = readFileSync(path.resolve(__dirname, "../TeamRankings.tsx"), "utf8");
      expect(source).toContain("toRankingQueryTarget(styleGroups, defaultState)");
      expect(source).not.toContain("buildDefaultRelayRankingFilters");
    });
  });

  // -------------------------------------------------------------------------
  // [V-P2-67] 🚨 要約に `集計` は allRaces のときだけ出す
  //
  // PM 裁定 (2026-09-09)。既定の `各自のベスト` は「畳み込んでいない普通の
  // 順位表」という**不在の情報**しかなく、常時表示にすると要約が5項目になって
  // 溢れる (App Dev 実測: 4項目で 238dp / 利用可能 218dp)。
  // 一方 `全レース` は**同一メンバーが複数行に出る**状態で表の意味が変わるため、
  // シートを閉じると気付けないのは実害。
  //
  // ⚠️ 幅の面でも条件付きが有利: 長いのは既定側 (de の `Persönliche Bestzeit`
  //    20字) で、出す側の `Alle Rennen` は 11字。
  //
  // ⚠️ **`期間` は既定 (`通算`) でも常時表示のまま**という非対称が正しい。
  //    「いつの記録か」は既定でも情報がある。
  // -------------------------------------------------------------------------
  describe("[V-P2-67] 要約の集計は allRaces のときだけ", () => {
    function summaryText(): string {
      const prefix = `${ranking.title}: `;
      const candidates = Array.from(document.querySelectorAll("[accessibilitylabel]")).filter(
        (el) => (el.getAttribute("accessibilitylabel") ?? "").startsWith(prefix),
      );
      const leaf = candidates.find((el) => el.querySelector("[accessibilitylabel]") === null);
      if (!leaf) throw new Error("要約ノードが見つからない");
      return leaf.textContent ?? "";
    }

    it("🚨 既定 (personalBest) では『各自のベスト』を含まない", async () => {
      const fake = makeSupabase({ rankings: [rpcRow()] });
      mocks.supabase.current = fake.client;

      renderRankings();
      await waitFor(() => expect(fake.rpcCalls.length).toBeGreaterThanOrEqual(1));

      const text = summaryText();
      expect(text).not.toContain(ranking.aggregation.personalBest);
      // 他の4項目は出ている (要約そのものが空なのではない)
      expect(text).toContain(ranking.period.allTime);
      expect(text).toContain(jaMessages.common.poolTypeLong);
      expect(text).toContain(ranking.gender.male);
    });

    it("🚨 allRaces に変えると『全レース』が要約に現れる", async () => {
      const fake = makeSupabase({ rankings: [rpcRow()] });
      mocks.supabase.current = fake.client;

      renderRankings();
      await waitFor(() => expect(fake.rpcCalls.length).toBeGreaterThanOrEqual(1));

      openFilterSheet();
      fireEvent.click(screen.getByRole("button", { name: ranking.aggregation.allRaces }));
      fireEvent.click(screen.getByRole("button", { name: jaMessages.common.bottomSheet.apply }));

      await waitFor(() =>
        expect(fake.rpcCalls.at(-1)?.args).toMatchObject({ p_aggregation: "allRaces" }),
      );
      expect(summaryText()).toContain(ranking.aggregation.allRaces);
    });

    it("🚨 personalBest に戻すと『全レース』が消える (残留しない)", async () => {
      const fake = makeSupabase({ rankings: [rpcRow()] });
      mocks.supabase.current = fake.client;

      renderRankings();
      await waitFor(() => expect(fake.rpcCalls.length).toBeGreaterThanOrEqual(1));

      openFilterSheet();
      fireEvent.click(screen.getByRole("button", { name: ranking.aggregation.allRaces }));
      fireEvent.click(screen.getByRole("button", { name: jaMessages.common.bottomSheet.apply }));
      await waitFor(() => expect(summaryText()).toContain(ranking.aggregation.allRaces));

      openFilterSheet();
      fireEvent.click(screen.getByRole("button", { name: ranking.aggregation.personalBest }));
      fireEvent.click(screen.getByRole("button", { name: jaMessages.common.bottomSheet.apply }));

      await waitFor(() =>
        expect(fake.rpcCalls.at(-1)?.args).toMatchObject({ p_aggregation: "personalBest" }),
      );
      expect(summaryText()).not.toContain(ranking.aggregation.allRaces);
    });

    it("🚨 `期間` は既定 (通算) でも常時表示 (集計との非対称が意図どおり)", async () => {
      // 「既定は出さない」を `period` にも広げる退行を検出する。
      // `通算` は「全期間を見ている」という**実在する情報**なので出す
      const fake = makeSupabase({ rankings: [rpcRow()] });
      mocks.supabase.current = fake.client;

      renderRankings();
      await waitFor(() => expect(fake.rpcCalls.length).toBeGreaterThanOrEqual(1));

      expect(summaryText()).toContain(ranking.period.allTime);
    });

    it("要約の numberOfLines が 3 である (en/de の最悪ケースで末尾が切れない)", () => {
      // App Dev 実測: en/de の「2023年度以前 + 全レース」が 500dp / 539dp で
      // 2行 (436dp) に収まらず、**切れるのは末尾の集計** = 気付けない情報そのもの。
      // ⚠️ `numberOfLines` は**上限**なので、収まるケース (232〜423dp = 2行) の
      //    高さは変わらない
      const source = readFileSync(path.resolve(__dirname, "../TeamRankings.tsx"), "utf8");
      expect(source).toContain("numberOfLines={3}");
    });
  });


  // -------------------------------------------------------------------------
  // [V-P2-41] 🚨 取得上限に達したことの明示 (mobile 個人)
  //
  // ⚠️ **`PAGE_SIZE` が web (50) と違い mobile は 20** で、`RankingList.tsx` が
  //    独自に持っている。「注記と『さらに表示』が同時に出る」は
  //    **`PAGE_SIZE` が違えば別の条件**なので、web で緑でも mobile は無保護。
  //
  // ⚠️ mobile の注記に testID は無いので**文言 (i18n キーの補間結果) で引く**。
  // -------------------------------------------------------------------------
  describe("[V-P2-41] 取得上限に達したことの明示", () => {
    const TRUNCATED = ranking.truncatedNote.replace("{limit}", "500");

    const manyRows = (n: number) =>
      Array.from({ length: n }, (_, index) =>
        rpcRow({
          record_id: `rec-bulk-${index}`,
          user_id: `usr-bulk-${index}`,
          display_name: `QA Bulk ${index}`,
          time: 25 + index / 100,
        }),
      );

    it("🚨 500 件 (上限) 返ると切り詰め注記が出る", async () => {
      const fake = makeSupabase({ rankings: manyRows(500) });
      mocks.supabase.current = fake.client;

      renderRankings();

      await waitFor(() => expect(screen.getByText(TRUNCATED)).toBeTruthy());
    });

    it("🚨 499 件では出ない (上限未満で誤発火しない)", async () => {
      const fake = makeSupabase({ rankings: manyRows(499) });
      mocks.supabase.current = fake.client;

      renderRankings();

      // 件数表示が出るまで待ってから否定形を見る
      await waitFor(() =>
        expect(screen.getByText(ranking.resultCount.replace("{count}", "499"))).toBeTruthy(),
      );
      expect(screen.queryByText(TRUNCATED)).toBeNull();
    });

    it("🚨 上限到達時は注記と「さらに表示」が同時に出る (PAGE_SIZE=20 でも同居)", async () => {
      // web は PAGE_SIZE 50 / mobile は 20。**別の条件なので別に見る**
      const fake = makeSupabase({ rankings: manyRows(500) });
      mocks.supabase.current = fake.client;

      renderRankings();

      await waitFor(() => expect(screen.getByText(TRUNCATED)).toBeTruthy());
      expect(screen.getByRole("button", { name: ranking.showMore })).toBeTruthy();
    });

    it("0 件では出ない (空状態と混ざらない)", async () => {
      const fake = makeSupabase({ rankings: [], recordCount: 5 });
      mocks.supabase.current = fake.client;

      renderRankings();

      await waitFor(() => expect(screen.getByText(ranking.empty.noMatchTitle)).toBeTruthy());
      expect(screen.queryByText(TRUNCATED)).toBeNull();
    });
  });

});
