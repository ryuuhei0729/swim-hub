/**
 * TeamRankings (web) — チーム記録ランキングタブ (QA Sprint Contract Phase B)
 *
 * 対象: apps/web/components/team/rankings/{TeamRankings,RankingFilters,RankingTable}.tsx
 *
 * Sprint Contract 検証観点:
 *   [V-01] 初期表示は既定条件 (Fr 100m / 長水路 / **男子** / チームの大会) で RPC を叩く
 *   [V-01b] 絞り込みは `<fieldset>` + ネイティブ radio のグループである
 *          (同一 `name` / `label for` ↔ `input id` / ちょうど1つが checked)
 *   [V-02] 取得結果が順位付き (同着は同順位・次は件数分スキップ) の表として描画される
 *   [V-03] ローディング / エラー / 空状態の3つが実装されている
 *   [V-03b] styles マスターが「取得成功だが種目軸が作れない」ときは空状態ではなく
 *           エラー + 再試行 (再試行が実際に再取得を走らせる)。
 *           対になる mobile 側: [V-M30]
 *   [V-04] エラー表示に生の PostgrestError 文字列を出さない (汎用文言へフォールバック)
 *   [V-05] 空状態が「条件に一致なし」と「チームに記録が無い」に分かれる
 *   [V-05b] `hasAnyRecord` は RLS 下の素クエリなので teamCompetitions のときだけ
 *           信用する。allCompetitions では常に「条件に一致なし」に寄せる
 *   [V-06] 種目/距離/水路/性別/対象の 5 つの絞り込みが RPC 引数に反映される
 *   [V-07] 距離の選択肢は styles マスター由来 (25m / 1500m を落とさない)
 *   [V-08] 種目を変えて同距離が無い場合はその種目の最短距離に落ちる
 *   [V-09] allCompetitions を選ぶと露出拡大の注意書きが出る
 *   [V-19] ソート UI が存在しない (並び順の定義元は RPC の ORDER BY のみ)
 *   [V-08b] gender 未設定 (users.gender=0) のユーザーが男子ランキングに載るのは
 *           ユーザーが受容した**仕様**であって不具合ではない
 *
 * モック方針:
 *   Supabase クライアントだけをフェイクにし、TeamRankings → useTeamRankingsQuery →
 *   TeamRankingsAPI → rpc() の経路はすべて実物を通す。
 *   フェイクは RPC 名と引数を記録するので「UI 操作がサーバー引数に届いたか」を
 *   直接 assert できる (引数を捨てるモックにしない)。
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import messages from "@apps/shared/messages/ja.json";
import TeamRankings from "@/components/team/rankings/TeamRankings";
import { styleKeys } from "@apps/shared/hooks/queries/keys";

// private バケットの署名付きURL解決はこのテストの関心外
vi.mock("@/lib/image-url", () => ({
  getSignedImageUrl: vi.fn().mockResolvedValue(null),
}));

const TEAM_ID = "team-kingfisher";

// ---------------------------------------------------------------------------
// styles マスター (ローカル実 DB の public.styles 22 行の実測値)
//   docker exec supabase_db_swim-hub psql -U postgres -d postgres \
//     -c "select id, style, distance from public.styles order by id;"
// ---------------------------------------------------------------------------
const STYLE_ROWS = [
  { id: 1, style: "Fr", distance: 25 },
  { id: 2, style: "Fr", distance: 50 },
  { id: 3, style: "Fr", distance: 100 },
  { id: 4, style: "Fr", distance: 200 },
  { id: 5, style: "Fr", distance: 400 },
  { id: 6, style: "Fr", distance: 800 },
  { id: 7, style: "Fr", distance: 1500 },
  { id: 8, style: "Br", distance: 25 },
  { id: 9, style: "Br", distance: 50 },
  { id: 10, style: "Br", distance: 100 },
  { id: 11, style: "Br", distance: 200 },
  { id: 12, style: "Ba", distance: 25 },
  { id: 13, style: "Ba", distance: 50 },
  { id: 14, style: "Ba", distance: 100 },
  { id: 15, style: "Ba", distance: 200 },
  { id: 16, style: "Fly", distance: 25 },
  { id: 17, style: "Fly", distance: 50 },
  { id: 18, style: "Fly", distance: 100 },
  { id: 19, style: "Fly", distance: 200 },
  { id: 20, style: "IM", distance: 100 },
  { id: 21, style: "IM", distance: 200 },
  { id: 22, style: "IM", distance: 400 },
].map((row) => ({ ...row, name: `db-name-${row.id}`, name_jp: `db-name-jp-${row.id}` }));

/** RPC が返す1行 (snake_case) */
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

interface FakeOptions {
  /** RPC の戻り値。関数を渡すと引数に応じて返す値を変えられる */
  rankings?:
    | Array<Record<string, unknown>>
    | ((args: Record<string, unknown>) => Array<Record<string, unknown>>);
  rankingsError?: unknown;
  stylesError?: unknown;
  /**
   * styles マスターの戻り行。空配列 = マスターが取れたのに種目軸を作れない異常。
   *
   * **関数を渡すと `from("styles")` の呼び出しごとに評価される**ので、
   * 「セッション中にマスターが縮んだ」状態を作れる (invalidate と組み合わせる)。
   */
  stylesRows?: Array<Record<string, unknown>> | (() => Array<Record<string, unknown>>);
  /** hasAnyRecord の判定に使う records の件数 */
  recordCount?: number;
  /** hasAnyRecord のメンバー一覧 */
  memberIds?: string[];
}

interface FakeSupabase {
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
  /** `from(table)` の呼び出し履歴。refetch が実際に走ったかの判定に使う */
  fromCalls: string[];
  client: never;
}

function makeSupabase(options: FakeOptions = {}): FakeSupabase {
  const {
    rankings = [],
    rankingsError = null,
    stylesError = null,
    stylesRows = STYLE_ROWS,
    recordCount = 5,
    memberIds = ["usr-kingfisher-7"],
  } = options;

  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  const makeThenable = (result: { data: unknown; error: unknown; count?: number }) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "order", "eq", "in", "is", "limit", "not", "ilike"]) {
      builder[method] = vi.fn(() => builder);
    }
    builder.single = vi.fn(async () => result);
    builder.maybeSingle = vi.fn(async () => result);
    builder.then = (
      onfulfilled?: ((value: typeof result) => unknown) | null,
      onrejected?: ((reason: unknown) => unknown) | null,
    ) => Promise.resolve(result).then(onfulfilled, onrejected);
    return builder;
  };

  const fromCalls: string[] = [];
  const client = {
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      if (table === "styles") {
        const rows = typeof stylesRows === "function" ? stylesRows() : stylesRows;
        return makeThenable({ data: stylesError ? null : rows, error: stylesError });
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

vi.mock("@/contexts", () => ({
  useAuth: () => ({ supabase: mocks.supabase.current, user: { id: "usr-kingfisher-7" } }),
}));

function renderRankings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const result = render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <QueryClientProvider client={queryClient}>
        <TeamRankings teamId={TEAM_ID} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  // `queryClient` を返すのは「セッション中に styles マスターが変わった」状態を
  // 作るため。`styles` は `staleTime: Infinity` なので**再取得トリガーが無く**、
  // invalidate 以外にマスターが縮んだ状態へ到達する手段が無い。
  // (invalidate は React Query の正規の機構で、実運用でも別画面からの
  //  invalidate や再マウントで同じ経路を通る)
  return { ...result, queryClient };
}

/**
 * 絞り込みは `<fieldset data-testid="{name}">` + `<input type="radio"
 * data-testid="{name}-option-{value}">` の構成 (`./FilterRadioGroup.tsx`)。
 *
 * ⚠️ 旧 `<select>` 版の testid は `{name}-select` だったが radio 化で `-select` が
 *    落ちた。`userEvent.selectOptions` も使えない。
 */
const GROUP_TESTID = {
  // ⚠️ 種目軸の統合 (2026-09-08) で `team-rankings-style` → `team-rankings-event`。
  //    1つのグループが 個人5種目 + リレー2種類 の7択を持つようになったので
  //    「style」という名前が実体と合わなくなった
  event: "team-rankings-event",
  distance: "team-rankings-distance",
  poolType: "team-rankings-pool-type",
  gender: "team-rankings-gender",
  scope: "team-rankings-scope",
  // 第2弾で追加。⚠️ `period` は `<fieldset>` ではなく `<select>` なので
  // ここには入れない (`groupFor` は fieldset 前提のヘルパー)
  aggregation: "team-rankings-aggregation",
} as const;

type GroupKey = keyof typeof GROUP_TESTID;

function groupFor(key: GroupKey): HTMLElement {
  return screen.getByTestId(GROUP_TESTID[key]);
}

/** そのグループの radio の value を DOM 上の並び順で返す */
function optionValues(key: GroupKey): string[] {
  return [...groupFor(key).querySelectorAll('input[type="radio"]')].map(
    (input) => input.getAttribute("value") ?? "",
  );
}

/** そのグループの label 文言を DOM 上の並び順で返す */
function optionLabels(key: GroupKey): string[] {
  return [...groupFor(key).querySelectorAll("label")].map((label) => label.textContent ?? "");
}

/** そのグループで現在 checked の value (未選択なら null) */
function checkedValue(key: GroupKey): string | null {
  const checked = groupFor(key).querySelector('input[type="radio"]:checked');
  return checked?.getAttribute("value") ?? null;
}

/** 選択肢を選ぶ。input は sr-only なので **label をクリック**する (実ユーザーと同じ経路) */
async function chooseOption(key: GroupKey, value: string) {
  const input = screen.getByTestId(`${GROUP_TESTID[key]}-option-${value}`);
  const id = input.getAttribute("id");
  if (!id) throw new Error(`radio に id が無い (${key} / ${value})`);
  const label = document.querySelector(`label[for="${id}"]`);
  if (!label) throw new Error(`label[for="${id}"] が無い`);
  await userEvent.click(label);
}

/** RPC 呼び出しが n 回以上発生するのを待ってから最後の引数を返す */
async function lastRpcArgs(fake: FakeSupabase, atLeast = 1) {
  await waitFor(() => expect(fake.rpcCalls.length).toBeGreaterThanOrEqual(atLeast));
  return fake.rpcCalls.at(-1)?.args as Record<string, unknown>;
}

describe("TeamRankings (web)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // [V-01] 初期表示の RPC 引数
  // -------------------------------------------------------------------------
  describe("[V-01] 初期表示", () => {
    it("既定条件 (Fr 50m=styleId 2 / 長水路 / 男子=0 / チームの大会 / 通算 / 各自のベスト) で RPC を叩く", async () => {
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
        // 通算は `{p_fiscal_year: null, p_fiscal_year_or_earlier: false}`。
        // 対応表の定義元は `api/teams/rankingPeriod.ts` の `periodToRpcArgs`
        p_fiscal_year: null,
        p_fiscal_year_or_earlier: false,
        p_limit: 500,
      });
    });

    it("[V-03] styles マスター取得中はローディングを出す (表もエラーも空状態も出さない)", () => {
      // styles の Promise を解決させないことでローディング状態に固定する
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

      renderRankings();

      expect(screen.getByTestId("team-rankings-loading")).toBeInTheDocument();
      expect(screen.queryByTestId("team-rankings-error")).toBeNull();
      expect(screen.queryByTestId("team-rankings-empty-no-match")).toBeNull();
      expect(screen.queryByTestId("team-rankings-empty-no-records")).toBeNull();
      expect(screen.queryByRole("table")).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // [V-02] 表の描画と順位
  // -------------------------------------------------------------------------
  describe("[V-02] 順位付き表の描画", () => {
    it("同着は同順位で次の順位が件数分スキップされる (1, 2, 2, 4)", async () => {
      const fake = makeSupabase({
        rankings: [
          rpcRow({ record_id: "rec-alpha", display_name: "アルファ", time: 27.31 }),
          rpcRow({ record_id: "rec-bravo", display_name: "ブラボー", time: 28.44 }),
          rpcRow({ record_id: "rec-charlie", display_name: "チャーリー", time: 28.44 }),
          rpcRow({ record_id: "rec-delta", display_name: "デルタ", time: 29.07 }),
        ],
      });
      mocks.supabase.current = fake.client;

      renderRankings();

      await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());

      const rows = screen.getAllByRole("row").slice(1); // 先頭はヘッダー行
      expect(rows).toHaveLength(4);
      expect(rows.map((row) => row.querySelectorAll("td")[0]?.textContent)).toEqual([
        "1",
        "2",
        "2",
        "4",
      ]);
    });

    it("タイム・大会名・日付が表示される (タイムは分:秒.コンマ秒)", async () => {
      const fake = makeSupabase({
        rankings: [
          rpcRow({ record_id: "rec-alpha", display_name: "アルファ", time: 65.42 }),
        ],
      });
      mocks.supabase.current = fake.client;

      renderRankings();

      await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());

      const row = screen.getByTestId("team-rankings-row-rec-alpha");
      expect(within(row).getByText("アルファ")).toBeInTheDocument();
      expect(within(row).getByText("1:05.42")).toBeInTheDocument();
      expect(within(row).getByText("第7回記録会")).toBeInTheDocument();
      expect(within(row).getByText("2026/05/03")).toBeInTheDocument();
    });

    // 大会名の欠損時の文言は `common.none` (「なし」)。
    // 以前は web だけがハードコードの "-" で、mobile は `t("common.none")` を
    // 使っていたため、同じ行が web では「-」/ mobile では「なし」になっていた。
    // shared/messages の同一キーに統一されたので web/mobile が一致する。
    it("一括登録記録 (大会なし) は大会名が common.none になり、日付は記録の作成日にフォールバックする", async () => {
      const fake = makeSupabase({
        rankings: [
          rpcRow({
            record_id: "rec-bulk",
            competition_id: null,
            competition_title: null,
            competition_date: null,
            record_created_at: "2026-03-09T10:00:00+09:00",
          }),
        ],
      });
      mocks.supabase.current = fake.client;

      renderRankings();

      await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());

      const row = screen.getByTestId("team-rankings-row-rec-bulk");
      expect(within(row).getByText(messages.common.none)).toBeInTheDocument();
      // ハードコードの "-" に戻ったら赤くなる (mobile とのパリティ回帰防止)
      expect(within(row).queryByText("-")).toBeNull();
      // 日付フォールバックは仕様どおり (competitionDate が null なら created_at)
      expect(within(row).getByText("2026/03/09")).toBeInTheDocument();
    });

    it("大会日も作成日も無い行でも表から落ちない (順位の母集団が欠けない)", async () => {
      const fake = makeSupabase({
        rankings: [
          rpcRow({ record_id: "rec-fast", time: 27.31 }),
          rpcRow({
            record_id: "rec-dateless",
            time: 28.44,
            competition_id: null,
            competition_title: null,
            competition_date: null,
            record_created_at: null,
          }),
          rpcRow({ record_id: "rec-slow", time: 29.07 }),
        ],
      });
      mocks.supabase.current = fake.client;

      renderRankings();

      await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());

      expect(screen.getAllByRole("row").slice(1)).toHaveLength(3);
      expect(screen.getByTestId("team-rankings-row-rec-dateless")).toBeInTheDocument();
    });

    it("件数バッジに取得件数が出る", async () => {
      const fake = makeSupabase({
        rankings: [1, 2, 3, 4, 5, 6, 7].map((n) =>
          rpcRow({ record_id: `rec-${n}`, time: 27 + n / 100 }),
        ),
      });
      mocks.supabase.current = fake.client;

      renderRankings();

      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-result-count")).toHaveTextContent("7"),
      );
    });

    it("50 件を超えると「さらに表示」で追加描画される (初期は 50 行)", async () => {
      const fake = makeSupabase({
        rankings: Array.from({ length: 57 }, (_, index) =>
          rpcRow({ record_id: `rec-${index}`, time: 27 + index / 100 }),
        ),
      });
      mocks.supabase.current = fake.client;

      renderRankings();

      await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
      expect(screen.getAllByRole("row").slice(1)).toHaveLength(50);

      await userEvent.click(screen.getByTestId("team-rankings-show-more"));

      expect(screen.getAllByRole("row").slice(1)).toHaveLength(57);
      // クライアント側ページングなのでサーバーへの追加リクエストは発生しない
      expect(fake.rpcCalls).toHaveLength(1);
      expect(screen.queryByTestId("team-rankings-show-more")).toBeNull();
    });

    it("50 件以下では「さらに表示」を出さない", async () => {
      const fake = makeSupabase({
        rankings: Array.from({ length: 50 }, (_, index) =>
          rpcRow({ record_id: `rec-${index}`, time: 27 + index / 100 }),
        ),
      });
      mocks.supabase.current = fake.client;

      renderRankings();

      await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
      expect(screen.getAllByRole("row").slice(1)).toHaveLength(50);
      expect(screen.queryByTestId("team-rankings-show-more")).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // [V-19] ソート UI が無いこと (PM 裁定でソートは撤去)
  // -------------------------------------------------------------------------
  describe("[V-19] ソート UI を持たない", () => {
    it("列ヘッダーがボタンでなく、aria-sort も持たない", async () => {
      const fake = makeSupabase({
        rankings: [
          rpcRow({ record_id: "rec-alpha", time: 27.31 }),
          rpcRow({ record_id: "rec-bravo", time: 28.44 }),
        ],
      });
      mocks.supabase.current = fake.client;

      renderRankings();

      await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());

      const headers = screen.getAllByRole("columnheader");
      expect(headers.length).toBeGreaterThan(0);
      for (const header of headers) {
        expect(header.querySelector("button")).toBeNull();
        expect(header.getAttribute("aria-sort")).toBeNull();
      }
    });

    it("表内に並べ替え用のボタンが1つも無い (将来ソートが足されたら赤くなる)", async () => {
      const fake = makeSupabase({
        rankings: [rpcRow({ record_id: "rec-alpha", time: 27.31 })],
      });
      mocks.supabase.current = fake.client;

      renderRankings();

      await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());

      const table = screen.getByRole("table");
      expect(within(table).queryAllByRole("button")).toHaveLength(0);
    });

    it("表示順は RPC が返した順序そのままである (クライアント側で並べ替えない)", async () => {
      // あえて未ソートで返す。UI が並べ替えるとこの期待値が崩れる
      const fake = makeSupabase({
        rankings: [
          rpcRow({ record_id: "rec-third", display_name: "サード", time: 29.07 }),
          rpcRow({ record_id: "rec-first", display_name: "ファースト", time: 27.31 }),
          rpcRow({ record_id: "rec-second", display_name: "セカンド", time: 28.44 }),
        ],
      });
      mocks.supabase.current = fake.client;

      renderRankings();

      await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());

      const rows = screen.getAllByRole("row").slice(1);
      expect(rows.map((row) => row.getAttribute("data-testid"))).toEqual([
        "team-rankings-row-rec-third",
        "team-rankings-row-rec-first",
        "team-rankings-row-rec-second",
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // [V-03][V-04] エラー
  // -------------------------------------------------------------------------
  describe("[V-03][V-04] エラー状態", () => {
    it("RPC がエラーを返すとエラー表示と再試行ボタンが出る", async () => {
      const fake = makeSupabase({
        rankingsError: { code: "42501", message: "permission denied for function", hint: null },
      });
      mocks.supabase.current = fake.client;

      renderRankings();

      await waitFor(() => expect(screen.getByTestId("team-rankings-error")).toBeInTheDocument());
      expect(screen.getByTestId("team-rankings-retry")).toBeInTheDocument();
      expect(screen.queryByRole("table")).toBeNull();
    });

    it("[V-04] 生の PostgrestError 文字列 (関数名・ポリシー名) を画面に出さない", async () => {
      const leakyMessage =
        'permission denied for function public.get_team_record_rankings (policy "team_rankings_select")';
      const fake = makeSupabase({
        rankingsError: { code: "42501", message: leakyMessage, hint: null },
      });
      mocks.supabase.current = fake.client;

      renderRankings();

      await waitFor(() => expect(screen.getByTestId("team-rankings-error")).toBeInTheDocument());

      // 生の文字列が漏れていないことを否定形で検証する
      const errorBlock = screen.getByTestId("team-rankings-error");
      expect(errorBlock.textContent ?? "").not.toContain("get_team_record_rankings");
      expect(errorBlock.textContent ?? "").not.toContain("policy");
      expect(errorBlock.textContent ?? "").not.toContain("permission denied");
      // 汎用文言 (i18n の teams.ranking.error) にフォールバックしている
      expect(errorBlock.textContent ?? "").toBe(
        `${messages.teams.ranking.error}${messages.teams.ranking.retry}`,
      );
    });

    it("再試行ボタンで RPC が再実行される", async () => {
      const fake = makeSupabase({
        rankingsError: { code: "42501", message: "boom", hint: null },
      });
      mocks.supabase.current = fake.client;

      renderRankings();

      await waitFor(() => expect(screen.getByTestId("team-rankings-error")).toBeInTheDocument());
      const callsBefore = fake.rpcCalls.length;

      await userEvent.click(screen.getByTestId("team-rankings-retry"));

      await waitFor(() => expect(fake.rpcCalls.length).toBeGreaterThan(callsBefore));
    });

    // -----------------------------------------------------------------------
    // [V-03b] 🚨 styles マスターが使えないときも**リレーは使える**
    //
    // 統合前は「個人種目 / リレー」が別ビューだったので、styles の失敗は
    // 個人種目だけを止めていた。種目軸を1つに統合した結果、ここで
    // エラー画面に倒すと**無関係なマスターの失敗でランキングタブ全体が死ぬ**。
    // リレーは `RELAY_EVENTS` (静的定義) 由来で RPC も styles を引かないので、
    // 個人種目だけを不可にしてリレーを生かすのが正しい。
    //
    // ⚠️ 到達経路は実在する: `styles` は authenticated に TRUNCATE 権限が付いており、
    //    TRUNCATE は RLS を通らないので RLS では防げない (第3弾で実測済み)。
    //
    // 🚨 **「取得失敗」と「空」は別状態として扱う。** 取得失敗は再試行に意味が
    //    あるが、空は再試行しても同じ結果なので再試行ボタンを出してはいけない
    //    (直らないボタンを押させ続けることになる)。文言も別キーである。
    //
    // ⚠️ 2つの文言は**末尾が完全に共通**
    //    (「…個人種目のランキングを表示できません。リレーのランキングは表示できます。」)
    //    なので、`toContain` で見るとどちらでも通るトートロジーになる。
    //    **exact 一致で assert し、もう一方が出ていないことも exact で見る。**
    // -----------------------------------------------------------------------
    const UNAVAILABLE = messages.teams.ranking.individualUnavailable;

    /**
     * 通知ブロックの文言を exact で取る。
     *
     * ⚠️ ブロック直下には再試行ボタンも入るので、`textContent` をそのまま使うと
     *    「文言 + 再試行」になって exact 一致が成立しない。**`<p>` に限定する。**
     */
    function unavailableText(): string {
      const block = screen.getByTestId("team-rankings-individual-unavailable");
      const paragraph = block.querySelector("p");
      expect(paragraph, "通知ブロックに <p> が無い").not.toBeNull();
      return paragraph?.textContent ?? "";
    }

    it("[V-03b] styles マスターが空でもリレーの問い合わせが走る (タブ全体が死なない)", async () => {
      const fake = makeSupabase({ stylesRows: [], rankings: [] });
      mocks.supabase.current = fake.client;

      renderRankings();

      // 絞り込みは出る (エラー画面で潰さない)
      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-filters")).toBeInTheDocument(),
      );
      // リレーの RPC が呼ばれている = リレーが実際に使える
      await waitFor(() => expect(fake.rpcCalls.length).toBeGreaterThanOrEqual(1));
      expect(fake.rpcCalls.map((call) => call.name)).toEqual(["get_team_relay_rankings"]);
      // 個人種目の RPC は呼ばれない (条件が作れないので空振りさせない)
      expect(fake.rpcCalls.some((call) => call.name === "get_team_record_rankings")).toBe(false);

      // エラー画面・空状態には化けない
      expect(screen.queryByTestId("team-rankings-error")).toBeNull();
      expect(screen.queryByTestId("team-rankings-empty-no-records")).toBeNull();
      expect(screen.queryByTestId("team-rankings-empty-no-match")).toBeNull();
    });

    it("[V-03b] styles マスターが空のときは『登録されていない』文言で、再試行ボタンを出さない", async () => {
      const fake = makeSupabase({ stylesRows: [], rankings: [] });
      mocks.supabase.current = fake.client;

      renderRankings();
      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-individual-unavailable")).toBeInTheDocument(),
      );

      // 末尾が共通なので exact 一致で見る (toContain では区別できない)
      expect(unavailableText()).toBe(UNAVAILABLE.empty);
      expect(unavailableText()).not.toBe(UNAVAILABLE.fetchFailed);
      // 空は再試行しても直らないのでボタンを出さない
      expect(screen.queryByTestId("team-rankings-styles-retry")).toBeNull();
    });

    it("[V-03b] 種目グループがリレー2択だけになる (押しても何も起きないピルを出さない)", async () => {
      const fake = makeSupabase({ stylesRows: [], rankings: [] });
      mocks.supabase.current = fake.client;

      renderRankings();
      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-filters")).toBeInTheDocument(),
      );

      expect(optionValues("event")).toEqual(["relay:free", "relay:medley"]);
      expect(checkedValue("event")).toBe("relay:free");
      // 個人種目にしか無い軸 (対象大会スコープ) は出ない
      expect(screen.queryByTestId("team-rankings-scope")).toBeNull();
    });

    it("[V-03b] canonical 化できない種目しか無いマスターでも同じ扱い (空と同一経路)", async () => {
      const fake = makeSupabase({
        // distance<=0 と未知の種目コードだけ。どの行からも軸が作れない
        stylesRows: [
          { id: 91, style: "MEDLEY", distance: 100, name: "n91", name_jp: "j91" },
          { id: 92, style: "Fr", distance: 0, name: "n92", name_jp: "j92" },
        ],
        rankings: [],
      });
      mocks.supabase.current = fake.client;

      renderRankings();
      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-individual-unavailable")).toBeInTheDocument(),
      );

      expect(unavailableText()).toBe(UNAVAILABLE.empty);
      expect(screen.queryByTestId("team-rankings-styles-retry")).toBeNull();
      expect(screen.queryByTestId("team-rankings-error")).toBeNull();
      await waitFor(() =>
        expect(fake.rpcCalls.map((call) => call.name)).toEqual(["get_team_relay_rankings"]),
      );
    });

    it("[V-03b] styles の取得に失敗した場合も同様にリレーが使える", async () => {
      const fake = makeSupabase({
        stylesError: { code: "42501", message: "boom" },
        rankings: [],
      });
      mocks.supabase.current = fake.client;

      renderRankings();

      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-filters")).toBeInTheDocument(),
      );
      await waitFor(() =>
        expect(fake.rpcCalls.map((call) => call.name)).toEqual(["get_team_relay_rankings"]),
      );
      expect(screen.queryByTestId("team-rankings-error")).toBeNull();
      expect(optionValues("event")).toEqual(["relay:free", "relay:medley"]);
    });

    it("[V-03b] 🚨 取得失敗のときだけ再試行ボタンが出て、実際に styles を再取得する", async () => {
      // 「エラー画面は出るが再試行が何もしない」= 実質的に復帰できないのと同じ。
      // 対になる mobile 側: apps/mobile/components/teams/rankings/__tests__/
      // TeamRankings.test.tsx の [V-M30]
      const fake = makeSupabase({
        stylesError: { code: "42501", message: "boom" },
        rankings: [],
      });
      mocks.supabase.current = fake.client;

      renderRankings();
      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-individual-unavailable")).toBeInTheDocument(),
      );

      // 空のときとは別の文言 (exact)
      expect(unavailableText()).toBe(UNAVAILABLE.fetchFailed);
      expect(unavailableText()).not.toBe(UNAVAILABLE.empty);

      const retry = screen.getByTestId("team-rankings-styles-retry");
      const before = fake.fromCalls.filter((table) => table === "styles").length;
      expect(before).toBeGreaterThanOrEqual(1);

      await userEvent.click(retry);

      await waitFor(() =>
        expect(fake.fromCalls.filter((table) => table === "styles").length).toBeGreaterThan(before),
      );
    });

    it("[V-03b] styles が正常なときは通知そのものが出ない (常時表示になっていない)", async () => {
      // 否定形。通知が無条件に描画されていると上の assert が全部トートロジーになる
      const fake = makeSupabase({ rankings: [] });
      mocks.supabase.current = fake.client;

      renderRankings();
      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-filters")).toBeInTheDocument(),
      );

      expect(screen.queryByTestId("team-rankings-individual-unavailable")).toBeNull();
      expect(screen.queryByTestId("team-rankings-styles-retry")).toBeNull();
      // 個人種目の RPC が走る (リレーへ倒れていない)
      expect(fake.rpcCalls.map((call) => call.name)).toEqual(["get_team_record_rankings"]);
    });
  });

  // -------------------------------------------------------------------------
  // [V-05] 空状態 2種
  // -------------------------------------------------------------------------
  describe("[V-05] 空状態", () => {
    it("チームに記録があるが条件に一致しない場合は「該当なし」を出す", async () => {
      const fake = makeSupabase({ rankings: [], recordCount: 5 });
      mocks.supabase.current = fake.client;

      renderRankings();

      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-empty-no-match")).toBeInTheDocument(),
      );
      expect(screen.queryByTestId("team-rankings-empty-no-records")).toBeNull();
      expect(screen.getByText(messages.teams.ranking.empty.noMatchTitle)).toBeInTheDocument();
    });

    it("チームに大会記録が1件も無い場合は「記録なし」を出す", async () => {
      const fake = makeSupabase({ rankings: [], recordCount: 0 });
      mocks.supabase.current = fake.client;

      renderRankings();

      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-empty-no-records")).toBeInTheDocument(),
      );
      expect(screen.queryByTestId("team-rankings-empty-no-match")).toBeNull();
      expect(screen.getByText(messages.teams.ranking.empty.noRecordsTitle)).toBeInTheDocument();
    });

    it("承認済みメンバーが 0 人でも「記録なし」に落ちる (画面が空白にならない)", async () => {
      const fake = makeSupabase({ rankings: [], memberIds: [] });
      mocks.supabase.current = fake.client;

      renderRankings();

      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-empty-no-records")).toBeInTheDocument(),
      );
    });

    // -----------------------------------------------------------------------
    // [V-05b] `hasAnyRecord` を信用できるのは teamCompetitions のときだけ
    //
    // `hasAnyRecord` は RLS 下の素のクエリなので、メンバーが**別チームの**
    // チーム大会で出した記録 (`records.team_id` が他チーム) を数えられない。
    // その記録は SECURITY DEFINER の RPC が allCompetitions で返せるため、
    // false を「記録が1件もない」と読むと
    // 「チームに大会記録がありません」と出したのに種目を変えると記録が出る、
    // という嘘になる。断定できない側は「条件に一致なし」に寄せる。
    // -----------------------------------------------------------------------
    it("[V-05b] allCompetitions では hasAnyRecord=false でも「該当なし」に寄せる", async () => {
      const fake = makeSupabase({ rankings: [], recordCount: 0 });
      mocks.supabase.current = fake.client;

      renderRankings();

      // まず teamCompetitions では「チームに記録なし」が出る (対照)
      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-empty-no-records")).toBeInTheDocument(),
      );

      await chooseOption("scope", "allCompetitions");

      // スコープを広げた瞬間に「該当なし」側へ切り替わる
      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-empty-no-match")).toBeInTheDocument(),
      );
      expect(screen.queryByTestId("team-rankings-empty-no-records")).toBeNull();
      expect(screen.getByText(messages.teams.ranking.empty.noMatchTitle)).toBeInTheDocument();
    });

    it("[V-05b] allCompetitions では hasAnyRecord のクエリ自体を投げない", async () => {
      const fake = makeSupabase({
        rankings: [],
        recordCount: 0,
        // 既定を allCompetitions にはできないので、切り替え後の呼び出し状況で見る
      });
      mocks.supabase.current = fake.client;

      renderRankings();
      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-empty-no-records")).toBeInTheDocument(),
      );
      const membershipCallsBefore = (
        fake.client as unknown as { from: { mock: { calls: unknown[][] } } }
      ).from.mock.calls.filter((call) => call[0] === "team_memberships").length;

      await chooseOption("scope", "allCompetitions");
      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-empty-no-match")).toBeInTheDocument(),
      );

      const membershipCallsAfter = (
        fake.client as unknown as { from: { mock: { calls: unknown[][] } } }
      ).from.mock.calls.filter((call) => call[0] === "team_memberships").length;
      // 信用できないスコープでは追加で問い合わせない (無駄なクエリと誤判定の両方を防ぐ)
      expect(membershipCallsAfter).toBe(membershipCallsBefore);
    });

    // -----------------------------------------------------------------------
    // [V-05c] 空状態文言の真理値表 (mobile と**対**で同じ表を持つ)
    //
    // 対になる mobile 側: apps/mobile/components/teams/rankings/__tests__/
    // TeamRankings.test.tsx の「[V-M31] 空状態文言の真理値表」。
    // H-2 (大会名の "-" vs common.none) で潰した web/mobile の非対称が
    // hasAnyRecord という別フィールドで再生産されたため、同じ表を両方に置いて
    // 片方だけ変わったら必ずどちらかが赤くなるようにする。
    //
    //   scope             | hasAnyRecord | 期待文言
    //   ------------------+--------------+-----------
    //   teamCompetitions  | false        | noRecords  (チームに大会記録がありません)
    //   teamCompetitions  | true         | noMatch    (該当する記録がありません)
    //   allCompetitions   | false        | noMatch    ← 信用できないので断定しない
    //   allCompetitions   | true         | noMatch
    // -----------------------------------------------------------------------
    describe("[V-05c] 空状態文言の真理値表 (mobile と対)", () => {
      it.each([
        ["teamCompetitions", 0, "no-records"],
        ["teamCompetitions", 5, "no-match"],
      ] as const)("scope=%s / records=%i 件 → %s", async (_scope, recordCount, expected) => {
        const fake = makeSupabase({ rankings: [], recordCount });
        mocks.supabase.current = fake.client;

        renderRankings();

        await waitFor(() =>
          expect(screen.getByTestId(`team-rankings-empty-${expected}`)).toBeInTheDocument(),
        );
        const forbidden = expected === "no-records" ? "no-match" : "no-records";
        expect(screen.queryByTestId(`team-rankings-empty-${forbidden}`)).toBeNull();
      });

      it.each([0, 5])(
        "scope=allCompetitions / records=%i 件 → no-match (hasAnyRecord を信用しない)",
        async (recordCount) => {
          const fake = makeSupabase({ rankings: [], recordCount });
          mocks.supabase.current = fake.client;

          renderRankings();
          await lastRpcArgs(fake);

          await chooseOption("scope", "allCompetitions");

          await waitFor(() =>
            expect(screen.getByTestId("team-rankings-empty-no-match")).toBeInTheDocument(),
          );
          expect(screen.queryByTestId("team-rankings-empty-no-records")).toBeNull();
        },
      );
    });

    it("空状態でも絞り込みは操作できる (条件を変えて抜け出せる)", async () => {
      const fake = makeSupabase({ rankings: [], recordCount: 5 });
      mocks.supabase.current = fake.client;

      renderRankings();

      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-empty-no-match")).toBeInTheDocument(),
      );
      // fieldset の disabled は内包する radio をネイティブに無効化する
      // ⚠️ `disabled` prop は撤去された (2026-09-08)。`stylesQuery.isError` で
      //    駆動していたため、残すと**リレーのラジオまで無効化**されて
      //    styles 失敗時フォールバックが無意味になる。よって
      //    「常に操作できる」が仕様であり、この assert はその形で残す
      //    (`<fieldset disabled>` の実効性を pin していた項目は撤去した)。
      expect(groupFor("event")).toBeEnabled();
      expect(groupFor("distance")).toBeEnabled();
    });
  });

  // -------------------------------------------------------------------------
  // [V-SL] 2カラムレイアウトの出しわけ (ユーザー依頼: PC は左右分割)
  //
  // 判定軸は「**左カラムに絞り込み UI が描画されるか**」。
  //   filters === undefined (種目マスター読み込み中 / 取得失敗)
  //     → 左カラムに入るものが無いので **2カラムにせず全幅**
  //   filters あり (ランキングの pending / エラー / 空状態 / 表)
  //     → **右カラム**の中
  //
  // 🚨 実際の幅・左右同幅・折り返しは jsdom では判定できない
  //    (CSS 未適用・レイアウト非計算)。ヘッドレス Chromium で別途実測している。
  //    ここで見るのは **DOM 上の入れ子関係**だけ。
  // -------------------------------------------------------------------------
  describe("[V-SL] ローディング / エラー / 空状態が意図した側に入る", () => {
    /** 2カラムのグリッド要素 (絞り込みが描画されているときだけ存在する) */
    function splitGrid(): HTMLElement | null {
      const filters = screen.queryByTestId("team-rankings-filters");
      // filters → 左カラム div → グリッド
      return filters?.parentElement?.parentElement ?? null;
    }

    /** その要素が 2カラムのグリッド配下にあるか */
    function insideSplit(node: HTMLElement): boolean {
      let cur: HTMLElement | null = node;
      while (cur) {
        if ((cur.getAttribute("class") ?? "").includes("xl:grid-cols-2")) return true;
        cur = cur.parentElement;
      }
      return false;
    }

    it("種目マスター読み込み中は 2カラムにせず全幅でローディングを出す", () => {
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

      renderRankings();

      // 絞り込みが無い = 左カラムに入るものが無い
      expect(screen.queryByTestId("team-rankings-filters")).toBeNull();
      expect(insideSplit(screen.getByTestId("team-rankings-loading"))).toBe(false);
    });

    // ⚠️ **この項目は意図的に反転した (2026-09-08)。**
    //    旧仕様は「種目マスター取得失敗 → 全幅でエラー + 再試行・絞り込みなし」。
    //    リレーが styles に依存していないのに**タブ全体が死ぬ**退行だったため、
    //    「個人種目だけを不可にして 2カラムを維持し、リレーは使える」に変わった。
    //    全幅を維持するのは `isPending` の間だけである。
    it("🚨 種目マスター取得失敗でも 2カラムを維持し、通知は見出し直下の全幅に出る", async () => {
      const fake = makeSupabase({
        stylesError: { message: "boom", code: "XX000" },
        rankings: [],
      });
      mocks.supabase.current = fake.client;

      renderRankings();

      // 絞り込みは出る = 2カラムになっている
      await waitFor(() => expect(screen.getByTestId("team-rankings-filters")).toBeInTheDocument());
      expect(insideSplit(screen.getByTestId("team-rankings-filters"))).toBe(true);

      // 通知はカード全体に効く事実なので、カラムの中ではなく見出し直下の全幅
      const banner = screen.getByTestId("team-rankings-individual-unavailable");
      expect(insideSplit(banner)).toBe(false);
      expect(banner.getAttribute("role")).toBe("status");

      // ランキング取得エラーの枠には化けない (別の事象なので別の場所に出す)
      expect(screen.queryByTestId("team-rankings-error")).toBeNull();
    });

    it("🚨 種目マスター取得中だけは 2カラムにせず全幅でローディングを出す", async () => {
      // 取得中の `filterState` はリレーへフォールバックした値で**まだユーザーの
      // 選択ではない**。左カラムにリレー2択を出した直後に個人種目へ切り替わると
      // 選択肢がちらつくので、この状態だけ全幅にする
      const fake = makeSupabase({ rankings: [] });
      // styles を解決しない Promise にして isPending に留める
      const pendingClient = {
        ...(fake.client as unknown as Record<string, unknown>),
        from: (table: string) => {
          if (table === "styles") {
            const builder: Record<string, unknown> = {};
            for (const method of ["select", "order", "eq", "in", "is", "limit", "not", "ilike"]) {
              builder[method] = () => builder;
            }
            builder.then = () => new Promise(() => {});
            return builder;
          }
          return (fake.client as unknown as { from: (t: string) => unknown }).from(table);
        },
      };
      mocks.supabase.current = pendingClient;

      renderRankings();

      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-loading")).toBeInTheDocument(),
      );
      // 全幅 = グリッドの中に入っていない
      expect(insideSplit(screen.getByTestId("team-rankings-loading"))).toBe(false);
      expect(screen.queryByTestId("team-rankings-filters")).toBeNull();
      expect(screen.queryByTestId("team-rankings-individual-unavailable")).toBeNull();

      // 🚨 取得中は個人・リレーとも RPC を投げない (未確定の条件で空振りさせない)
      expect(fake.rpcCalls).toEqual([]);
    });

    it("絞り込みが出ているときの表は右カラム (グリッドの2番目の子) に入る", async () => {
      const fake = makeSupabase({ rankings: [rpcRow()] });
      mocks.supabase.current = fake.client;

      renderRankings();
      await waitFor(() => expect(screen.getByTestId("team-rankings-filters")).toBeInTheDocument());

      const grid = splitGrid();
      expect(grid).not.toBeNull();
      expect(grid?.getAttribute("class") ?? "").toContain("xl:grid-cols-2");

      const columns = [...(grid?.children ?? [])];
      expect(columns).toHaveLength(2);
      // 左 = 絞り込み / 右 = 表
      expect(columns[0]?.contains(screen.getByTestId("team-rankings-filters"))).toBe(true);
      expect(columns[1]?.contains(screen.getByTestId("team-rankings-row-rec-kingfisher-7"))).toBe(
        true,
      );
      // 左カラムに表が混ざっていない
      expect(columns[0]?.querySelector("table")).toBeNull();
    });

    it("空状態も右カラムに入る (絞り込みは左に残る)", async () => {
      const fake = makeSupabase({ rankings: [], recordCount: 0 });
      mocks.supabase.current = fake.client;

      renderRankings();
      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-empty-no-records")).toBeInTheDocument(),
      );

      const columns = [...(splitGrid()?.children ?? [])];
      expect(columns).toHaveLength(2);
      expect(columns[0]?.contains(screen.getByTestId("team-rankings-filters"))).toBe(true);
      expect(columns[1]?.contains(screen.getByTestId("team-rankings-empty-no-records"))).toBe(true);
    });

    it("ランキング取得のエラーも右カラムに入る (絞り込みで条件を変えられる)", async () => {
      const fake = makeSupabase({ rankingsError: { message: "boom", code: "XX000" } });
      mocks.supabase.current = fake.client;

      renderRankings();
      await waitFor(() => expect(screen.getByTestId("team-rankings-error")).toBeInTheDocument());

      const columns = [...(splitGrid()?.children ?? [])];
      expect(columns).toHaveLength(2);
      expect(columns[1]?.contains(screen.getByTestId("team-rankings-error"))).toBe(true);
    });

    it("両カラムに min-w-0 がある (表がカラムを食い破らない前提条件)", async () => {
      const fake = makeSupabase({ rankings: [rpcRow()] });
      mocks.supabase.current = fake.client;

      renderRankings();
      await waitFor(() => expect(screen.getByTestId("team-rankings-filters")).toBeInTheDocument());

      const columns = [...(splitGrid()?.children ?? [])];
      expect(columns).toHaveLength(2);
      for (const column of columns) {
        expect(column.getAttribute("class") ?? "").toContain("min-w-0");
      }
    });
  });

  // -------------------------------------------------------------------------
  // [V-06][V-07][V-08] 絞り込み
  // -------------------------------------------------------------------------
  describe("[V-06][V-07] 絞り込み", () => {
    async function setup() {
      const fake = makeSupabase({ rankings: [rpcRow()] });
      mocks.supabase.current = fake.client;
      renderRankings();
      await waitFor(() => expect(screen.getByTestId("team-rankings-filters")).toBeInTheDocument());
      return fake;
    }

    it("🚨 7 つの絞り込みグループが確定した順序で並ぶ (期間だけ select)", async () => {
      await setup();

      const filterBlock = screen.getByTestId("team-rankings-filters");

      // ⚠️ 第2弾 (要望1) で**期間だけ `<select>`** になった。
      //    選択肢が 通算 + 明示年度3つ + 以前バケット の5つで、ラジオの
      //    ピル5個は 320px で場所を取りすぎるため。他の6軸はラジオのまま。
      expect(filterBlock.querySelectorAll("select")).toHaveLength(1);
      expect(filterBlock.querySelector("select")?.getAttribute("data-testid")).toBe(
        "team-rankings-period-select",
      );
      expect(filterBlock.querySelectorAll("fieldset")).toHaveLength(6);

      // 🚨 順序は PM 裁定 (2026-09-09 の要望2 で差し替え):
      //      期間 → 性別 → 水路 → 種目 → 距離 → 対象 → 集計
      //    **`対象` と `集計` はどちらも個人種目限定**なので末尾に隣接させる。
      //    リレーモードでは末尾2つが一緒に消え、中央に穴が空かない。
      //    順序を入れ替えるとリレー切替時にグループの位置が飛ぶ。
      //
      //    `期間` は `<select>` なので fieldset の列挙には現れない。
      //    **DOM 上の実際の並び**を直接読んで7軸の順序を固定する
      //    (fieldset だけを数えると期間の位置がずれても気付けない)
      const ORDERED = [
        "team-rankings-period",
        "team-rankings-gender",
        "team-rankings-pool-type",
        "team-rankings-event",
        "team-rankings-distance",
        "team-rankings-scope",
        "team-rankings-aggregation",
      ];
      const rendered = [...filterBlock.children].map((node) =>
        node.getAttribute("data-testid"),
      );
      expect(rendered).toEqual(ORDERED);
    });

    it("[V-01b] 各グループの radio が同一 name でグループ化され label for ↔ id が対応する", async () => {
      await setup();

      for (const key of Object.keys(GROUP_TESTID) as GroupKey[]) {
        const inputs = [...groupFor(key).querySelectorAll('input[type="radio"]')];
        expect(inputs.length, `${key} の radio が無い`).toBeGreaterThan(0);

        // name が1種類 = ブラウザが排他選択・矢印キー移動を担保する単位
        expect(new Set(inputs.map((input) => input.getAttribute("name"))), key).toEqual(
          new Set([GROUP_TESTID[key]]),
        );

        for (const input of inputs) {
          const id = input.getAttribute("id");
          expect(id, `${key} の radio に id が無い`).toBeTruthy();
          const label = document.querySelector(`label[for="${id}"]`);
          expect(label, `label[for="${id}"] が無い`).not.toBeNull();
          expect((label?.textContent ?? "").length).toBeGreaterThan(0);
        }

        // ちょうど1つが checked (未選択・複数選択にならない)
        expect(
          groupFor(key).querySelectorAll('input[type="radio"]:checked'),
          `${key} の checked が1つでない`,
        ).toHaveLength(1);
      }
    });

    it("[V-01b] 各グループが fieldset + legend で項目名を持つ (role=group の accessible name)", async () => {
      await setup();

      const pairs: Array<[string, GroupKey]> = [
        [messages.teams.ranking.filter.style, "event"],
        [messages.teams.ranking.filter.distance, "distance"],
        [messages.teams.ranking.filter.poolType, "poolType"],
        [messages.teams.ranking.filter.gender, "gender"],
        [messages.teams.ranking.filter.scope, "scope"],
      ];
      for (const [legend, key] of pairs) {
        const fieldset = groupFor(key);
        expect(fieldset.tagName, key).toBe("FIELDSET");
        expect(fieldset.querySelector("legend")?.textContent, key).toBe(legend);
        expect(screen.getByRole("group", { name: legend })).toBe(fieldset);
      }
    });

    it("種目の選択肢が 7 択 (canonical 5 種目 → リレー2種類) である", async () => {
      await setup();

      const options = Array.from(
        groupFor("event").querySelectorAll('input[type="radio"]'),
      ).map((option) => option.getAttribute("value"));
      // 個人5種目は canonical (`SWIM_STYLES`) 順、リレーは free → medley
      expect(options).toEqual(["Fr", "Br", "Ba", "Fly", "IM", "relay:free", "relay:medley"]);
    });

    it("🚨 種目グループは fieldset 1つ / name 1つで、視覚的にだけ2行に割れている", async () => {
      await setup();

      const group = groupFor("event");

      // fieldset が1つ = radio group が1つ。**2つに分かれていたら矢印キーで
      // 7択を跨げず「1つの選択」という意味論が壊れる**
      expect(group.tagName).toBe("FIELDSET");
      expect(group.querySelectorAll("fieldset")).toHaveLength(0);

      const inputs = [...group.querySelectorAll('input[type="radio"]')];
      expect(inputs).toHaveLength(7);
      // name が1種類 = ブラウザが排他選択と矢印キー移動を1グループとして扱う
      expect(new Set(inputs.map((input) => input.getAttribute("name")))).toEqual(
        new Set(["team-rankings-event"]),
      );
      // checked も7択で1つだけ
      expect(group.querySelectorAll('input[type="radio"]:checked')).toHaveLength(1);

      // 視覚的な行は2つ。行は fieldset を分けずに div を並べて作る
      // noUncheckedIndexedAccess が有効なので添字アクセスは `| undefined` になる。
      // タプル型で受けて undefined を混ぜない
      const rows: [Element | null, Element | null] = [
        group.querySelector('[data-testid="team-rankings-event-row-0"]'),
        group.querySelector('[data-testid="team-rankings-event-row-1"]'),
      ];
      expect(rows[0], "1行目 (個人種目) が無い").not.toBeNull();
      expect(rows[1], "2行目 (リレー) が無い").not.toBeNull();
      expect(group.querySelector('[data-testid="team-rankings-event-row-2"]')).toBeNull();

      // 1行目 = 個人5種目、2行目 = リレー2種類 (DOM 順が矢印キーの巡回順になる)
      const valuesIn = (row: Element | null) =>
        [...(row?.querySelectorAll('input[type="radio"]') ?? [])].map((input) =>
          input.getAttribute("value"),
        );
      expect(valuesIn(rows[0])).toEqual(["Fr", "Br", "Ba", "Fly", "IM"]);
      expect(valuesIn(rows[1])).toEqual(["relay:free", "relay:medley"]);

      // 🚨 行の div は fieldset ではない (行ごとに fieldset を作っていない)
      for (const row of rows) {
        expect(row?.tagName, "行が fieldset になっている").toBe("DIV");
      }
    });

    it("🚨 他のグループは1行のまま (行分割が任意パラメータであることの否定形)", async () => {
      await setup();

      for (const key of ["distance", "poolType", "gender", "scope"] as const) {
        const group = groupFor(key);
        expect(
          group.querySelector(`[data-testid="${GROUP_TESTID[key]}-row-1"]`),
          `${key} が2行に割れている`,
        ).toBeNull();
        expect(
          group.querySelector(`[data-testid="${GROUP_TESTID[key]}-row-0"]`),
          `${key} の行が無い`,
        ).not.toBeNull();
      }
    });

    // [V-07] 1500m の欠落検出 + 🚨 長水路で 25m が落ちること ([V-P2-61])。
    //   ⚠️ **既定は長水路なので 25m は出ない。** 静的な [50..800] リストでは
    //      1500m が足りないという当初の観点は、短水路側で見る
    it("[V-07] 🚨 長水路 (既定) の Fr は 6 件で 25m を含まない", async () => {
      await setup();

      const options = Array.from(
        groupFor("distance").querySelectorAll('input[type="radio"]'),
      ).map((option) => Number(option.getAttribute("value")));
      // 50m プールで 25m のレースは成立しない (スタートとゴールが同じ壁)
      expect(options).toEqual([50, 100, 200, 400, 800, 1500]);
    });

    it("[V-07] 🚨 短水路に切り替えると 25m が現れて 7 件になる (1500m も残る)", async () => {
      await setup();

      await chooseOption("poolType", "0");

      await waitFor(() =>
        expect(
          Array.from(groupFor("distance").querySelectorAll('input[type="radio"]')).map((option) =>
            Number(option.getAttribute("value")),
          ),
        ).toEqual([25, 50, 100, 200, 400, 800, 1500]),
      );
    });

    it("[V-08] Fr 400m から Br に切り替えると 400m が無いので長水路の最短 50m (styleId 9) で RPC を叩く", async () => {
      const fake = await setup();

      await chooseOption("distance", "400");
      await waitFor(() => expect((fake.rpcCalls.at(-1)?.args ?? {}).p_style_id).toBe(5));

      await chooseOption("event", "Br");

      const args = await lastRpcArgs(fake, 3);
      // ⚠️ 長水路では 25m (styleId 8) が選択肢に無いので、最短は 50m (styleId 9)。
      //    短水路なら 8 になる ([V-P2-61] の帰結)
      expect(args.p_style_id).toBe(9);
      // 距離のラジオも 50m に追従する (表示と条件が食い違わない)
      expect(checkedValue("distance")).toBe("50");
    });

    it("[V-08] Fr 200m から Ba に切り替えると同距離を維持する (styleId 15)", async () => {
      const fake = await setup();

      await chooseOption("distance", "200");
      await waitFor(() => expect((fake.rpcCalls.at(-1)?.args ?? {}).p_style_id).toBe(4));

      await chooseOption("event", "Ba");

      const args = await lastRpcArgs(fake, 3);
      expect(args.p_style_id).toBe(15);
    });

    it("IM に切り替えると距離選択肢は 3 件 (25m/50m/800m は存在しない)", async () => {
      await setup();

      await chooseOption("event", "IM");

      const options = Array.from(
        groupFor("distance").querySelectorAll('input[type="radio"]'),
      ).map((option) => Number(option.getAttribute("value")));
      expect(options).toEqual([100, 200, 400]);
    });

    // -----------------------------------------------------------------------
    // 選択肢の並び順 (shared の RANKING_* 定数に集約された順序)
    //
    // 以前は web と mobile がそれぞれ配列を持ち、既に順序が乖離していた
    // (web: 0/1・all/male/female、mobile: 1/0・male/female/all)。
    // 現在は shared の 1 箇所を両プラットフォームが読む。
    // ⚠️ 期待値は shared の定数を import せずリテラルで直書きする (トートロジー防止)。
    //    mobile 側の同名テスト (RankingFilterSheet.test.tsx [V-M11]) と対で、
    //    片方だけ並びが変わったら必ずどちらかが赤くなる。
    // -----------------------------------------------------------------------
    it("水路の選択肢は 短水路(0) → 長水路(1) の順で、既定の選択は長水路", async () => {
      await setup();

      expect(optionValues("poolType")).toEqual(["0", "1"]);
      expect(optionLabels("poolType")).toEqual([
        messages.common.poolTypeShort,
        messages.common.poolTypeLong,
      ]);
      // 先頭 = 既定ではない。既定は選択状態 (checked) で示す
      expect(checkedValue("poolType")).toBe("1");
    });

    it("性別の選択肢は 男子 → 女子 の2択で、既定の選択は男子", async () => {
      // ユーザー依頼で「男女すべて」を廃止 (水泳は性別で分かれて実施されるので
      // 男女混在の順位表に競技上の意味が無い)。ja のラベルは競技表記の「男子/女子」
      await setup();

      expect(optionValues("gender")).toEqual(["male", "female"]);
      expect(optionLabels("gender")).toEqual([
        messages.teams.ranking.gender.male,
        messages.teams.ranking.gender.female,
      ]);
      expect(checkedValue("gender")).toBe("male");
    });

    it("廃止した「男女すべて」の選択肢が存在しない (否定形)", async () => {
      await setup();

      expect(optionValues("gender")).not.toContain("all");
      expect(screen.queryByTestId("team-rankings-gender-option-all")).toBeNull();
      // 旧ラベル「男女すべて」がどこにも描画されていない
      expect(document.body.textContent ?? "").not.toContain("男女すべて");
    });

    it("対象大会の選択肢は 狭い → 広い の順 (露出が広い allCompetitions を後ろに置く)", async () => {
      await setup();

      const options = Array.from(
        groupFor("scope").querySelectorAll('input[type="radio"]'),
      );
      expect(options.map((option) => option.getAttribute("value"))).toEqual([
        "teamCompetitions",
        "allCompetitions",
      ]);
    });

    it("[V-06] 水路を短水路に変えると p_pool_type=0 で RPC を叩く", async () => {
      const fake = await setup();

      await chooseOption("poolType", "0");

      const args = await lastRpcArgs(fake, 2);
      expect(args.p_pool_type).toBe(0);
    });

    it.each([
      ["male", 0],
      ["female", 1],
    ] as const)(
      "[V-06] 性別を %s にすると p_gender=%i で RPC を叩く",
      async (genderValue, expected) => {
        const fake = await setup();

        // ⚠️ radio は既に checked のものを再クリックしても change を発火しない。
        //    既定 (male) を検証するときだけ、一度 female へ動かしてから戻す
        //    = 実ユーザーが選び直す経路にする
        let expectedCalls = 1;
        if (checkedValue("gender") === genderValue) {
          const other = optionValues("gender").find((value) => value !== genderValue);
          if (!other) throw new Error("選択肢が1つしかない");
          await chooseOption("gender", other);
          expectedCalls += 1;
          await waitFor(() =>
            expect(fake.rpcCalls.length).toBeGreaterThanOrEqual(expectedCalls),
          );
        }

        await chooseOption("gender", genderValue);
        expectedCalls += 1;

        const args = await lastRpcArgs(fake, expectedCalls);
        expect(args.p_gender).toBe(expected);
      },
    );

    it("[V-06] 性別は男子 ⇄ 女子 を往復でき、どちらも NULL に落ちない", async () => {
      // 旧仕様の「男女すべて」(= p_gender:null) は廃止された。
      // 往復させて「片方に張り付かない」「NULL にならない」を対で見る
      const fake = await setup();

      await chooseOption("gender", "female");
      await waitFor(() => expect((fake.rpcCalls.at(-1)?.args ?? {}).p_gender).toBe(1));

      await chooseOption("gender", "male");
      await waitFor(() => expect((fake.rpcCalls.at(-1)?.args ?? {}).p_gender).toBe(0));

      for (const call of fake.rpcCalls) {
        expect(call.args.p_gender, JSON.stringify(call.args)).not.toBeNull();
        expect(typeof call.args.p_gender).toBe("number");
      }
    });

    it("[V-06] 対象を「すべての大会」にすると p_scope=allCompetitions で RPC を叩く", async () => {
      const fake = await setup();

      await chooseOption("scope", "allCompetitions");

      const args = await lastRpcArgs(fake, 2);
      expect(args.p_scope).toBe("allCompetitions");
    });

    it("[V-09] allCompetitions を選ぶと露出拡大の注意書きが出る (既定では出ない)", async () => {
      const fake = await setup();

      expect(screen.queryByTestId("team-rankings-scope-note")).toBeNull();

      await chooseOption("scope", "allCompetitions");

      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-scope-note")).toHaveTextContent(
          messages.teams.ranking.scope.allCompetitionsNote,
        ),
      );
      await lastRpcArgs(fake, 2);
    });

    it("絞り込みを変えると「さらに表示」の展開状態がリセットされる", async () => {
      const fake = makeSupabase({
        rankings: (args) =>
          Array.from({ length: 57 }, (_, index) =>
            rpcRow({
              record_id: `rec-${String(args.p_pool_type)}-${index}`,
              time: 27 + index / 100,
              pool_type: args.p_pool_type as number,
            }),
          ),
      });
      mocks.supabase.current = fake.client;
      renderRankings();

      await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
      await userEvent.click(screen.getByTestId("team-rankings-show-more"));
      expect(screen.getAllByRole("row").slice(1)).toHaveLength(57);

      await chooseOption("poolType", "0");

      await waitFor(() => expect(screen.getAllByRole("row").slice(1)).toHaveLength(50));
    });
  });

  // -------------------------------------------------------------------------
  // [V-08b] users.gender の既知の仕様 (不具合ではない)
  // -------------------------------------------------------------------------
  describe("[V-08b] gender 未入力ユーザーが男子ランキングに載るのは仕様", () => {
    /**
     * `users.gender` は `integer DEFAULT 0 NOT NULL` + `CHECK (gender IN (0,1))` で
     * 「未設定」を表現できず、オンボーディングも gender を必須検証していない。
     * よってプロフィール未入力のユーザーは 0 (男性) 扱いで男子ランキングに載る。
     *
     * ⚠️ これは**ユーザーが明示的に受容した仕様であって不具合ではない**。
     * ここでその挙動を pin するのは、将来「バグに見えるから」と勝手に除外
     * (gender IS NULL 相当のフィルタ追加など) されて母集団が静かに減るのを防ぐため。
     * 逆に「未設定」を表現できるようにする改修を入れる場合は、
     * このテストを消すのではなく PM 裁定の上で期待値を更新すること。
     */
    it("gender=0 の行は p_gender=0 (男性) の絞り込み結果に含まれる", async () => {
      const fake = makeSupabase({
        rankings: (args) =>
          args.p_gender === 0
            ? [rpcRow({ record_id: "rec-unset-gender", display_name: "未設定ユーザー", gender: 0 })]
            : [],
      });
      mocks.supabase.current = fake.client;

      renderRankings();
      await waitFor(() => expect(screen.getByTestId("team-rankings-filters")).toBeInTheDocument());

      await chooseOption("gender", "male");

      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-row-rec-unset-gender")).toBeInTheDocument(),
      );
    });

    // -----------------------------------------------------------------------
    // 🚨 観点の作り直し (PM 裁定 / 第3弾)
    //
    // 旧テストは「初期レンダーで `p_gender` が null であること」の assert だけで、
    // **「男女すべて」廃止で既定が男子になった時点で無意味になった**
    // (`p_gender=0` が正しい挙動になったので、期待値を 0 に書き換えると
    //  「既定が男子である」という別のテストの重複にしかならない)。
    //
    // 残すべき本質は **`GENDER_FILTER_TO_DB` (male→0 / female→1) の全単射性**
    // と **undefined / null を 0 に丸める分岐が無いこと**。
    // `RankingGenderFilter` が `"male" | "female"` になり undefined の経路は
    // 型レベルで消えたので、写像そのものの正しさが唯一の防御線になる。
    //
    // 「gender 未入力ユーザーが男子ランキングに出る」という別事実は
    // `users.gender NOT NULL DEFAULT 0` 由来で、上の V-08b が担っている。
    // (写像の単体検証は apps/shared/__tests__/teams/rankings.test.ts の [V-21]。
    //  こちらは **UI 操作から RPC 引数まで**の経路で同じことを確かめる)
    // -----------------------------------------------------------------------
    /** このブロック用の setup (V-06/V-07 ブロックの setup とはスコープが別) */
    async function setupFilters() {
      const fake = makeSupabase({ rankings: [rpcRow()] });
      mocks.supabase.current = fake.client;
      renderRankings();
      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-filters")).toBeInTheDocument(),
      );
      return fake;
    }

    it("gender の写像が全単射である: UI で選んだ2値が {0, 1} に1対1で写る", async () => {
      const fake = await setupFilters();

      // 既定が male なので初回 RPC の引数がそのまま male の写像結果
      const maleArg = fake.rpcCalls.at(-1)?.args.p_gender;
      expect(maleArg).toBe(0);

      await chooseOption("gender", "female");
      await waitFor(() => expect((fake.rpcCalls.at(-1)?.args ?? {}).p_gender).toBe(1));
      const femaleArg = fake.rpcCalls.at(-1)?.args.p_gender;

      // 集合として {0, 1} と厳密一致 = どちらかが 0 に丸められていない
      expect(new Set([maleArg, femaleArg])).toEqual(new Set([0, 1]));
      expect(maleArg).not.toBe(femaleArg);
    });

    it("選択肢のすべてが number の DB 値に写り、null / undefined を渡さない", async () => {
      // 写像のキーを1つ足し忘れると `GENDER_FILTER_TO_DB[gender]` が undefined になり、
      // `?? 0` が入っていれば「未知の性別が静かに男子として集計される」。
      // 選択肢を総当たりして、どれも number に写ることを確かめる
      const fake = await setupFilters();

      // 既定 (male) と同値のクリックは change を発火しないので、
      // 既定以外 → 既定 の順に回して全選択肢を1度は通す
      const values = optionValues("gender");
      const current = checkedValue("gender");
      for (const value of [...values.filter((v) => v !== current), ...values.filter((v) => v === current)]) {
        await chooseOption("gender", value);
        await waitFor(() =>
          expect(typeof (fake.rpcCalls.at(-1)?.args ?? {}).p_gender, value).toBe("number"),
        );
        expect((fake.rpcCalls.at(-1)?.args ?? {}).p_gender, value).not.toBeNull();
      }

      for (const call of fake.rpcCalls) {
        expect(call.args.p_gender, JSON.stringify(call.args)).not.toBeNull();
        expect(call.args.p_gender, JSON.stringify(call.args)).not.toBeUndefined();
      }
    });

    it("選択肢の値の集合が写像のキーと一致する (UI にあるのに写せない値が無い)", async () => {
      // UI の選択肢 ⊆ 写像のキー でないと undefined が RPC に流れる。
      // 逆 (写像にあるのに UI に無い) は死んだキーなので、集合の厳密一致で見る
      await setupFilters();

      expect(new Set(optionValues("gender"))).toEqual(new Set(["male", "female"]));
    });
  });

  // -------------------------------------------------------------------------
  // [V-10] 読み込み中に偽のエラー表示が挟まらないこと
  //
  // web は絞り込み条件をレンダー中に導出している
  //   const filters = selectedFilters ?? defaultFilters ?? undefined;
  // ため、「styles は取れたが条件が未確定」の中間状態でもエラーにはならない。
  //
  // mobile 版 (apps/mobile/components/teams/rankings/TeamRankings.tsx) は
  // 同じ値を useState + useEffect で確定させており、この中間コミットで
  // エラー画面を描画してしまう (mobile 側 [V-M28] が RED でそれを実証している)。
  // ここは「web が参照実装であること」を固定するテストなので、mobile を
  // web に寄せる修正が入っても壊れない。
  //
  // 検出方法: MutationObserver でコミットされた全 DOM 状態を記録する
  // (setTimeout ポーリングだと中間コミットを取りこぼす)。
  // -------------------------------------------------------------------------
  describe("[V-10] 読み込み中に偽のエラー表示を出さない", () => {
    it("styles 解決から表描画までの全コミットにエラー表示が現れない", async () => {
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
        for (const method of ["select", "order", "eq", "in", "is", "limit"]) {
          builder[method] = vi.fn(() => builder);
        }
        builder.then = (
          onfulfilled?: ((value: typeof result) => unknown) | null,
          onrejected?: ((reason: unknown) => unknown) | null,
        ) =>
          (wait ? wait.then(() => result) : Promise.resolve(result)).then(onfulfilled, onrejected);
        return builder;
      };

      mocks.supabase.current = {
        from: vi.fn((table: string) =>
          table === "styles"
            ? makeThenable({ data: STYLE_ROWS, error: null }, stylesGate)
            : makeThenable({ data: [], error: null, count: 0 }),
        ),
        rpc: vi.fn(async (_name: string, args: Record<string, unknown>) => {
          rpcCalls.push(args);
          return { data: [rpcRow({ display_name: "セブン" })], error: null };
        }),
      } as unknown as never;

      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const { container } = render(
        <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
          <QueryClientProvider client={queryClient}>
            <TeamRankings teamId={TEAM_ID} />
          </QueryClientProvider>
        </NextIntlClientProvider>,
      );

      const committedStates: string[] = [container.textContent ?? ""];
      const observer = new MutationObserver(() => {
        committedStates.push(container.textContent ?? "");
      });
      observer.observe(container, { subtree: true, childList: true, characterData: true });

      resolveStyles();
      await waitFor(() => expect(screen.getByText("セブン")).toBeInTheDocument());
      observer.disconnect();

      expect(rpcCalls.length).toBeGreaterThanOrEqual(1);

      const errorStates = committedStates.filter((state) =>
        state.includes(messages.teams.ranking.error),
      );
      expect(
        errorStates,
        [
          "読み込み途中でエラー表示が描画されました。観測されたコミット状態:",
          ...committedStates.map((state, index) => `  [${index}] ${state.slice(0, 90)}`),
        ].join("\n"),
      ).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // [V-RL-F] リレー種目を選んだときの絞り込みと往復
  //
  // 種目軸の統合 (2026-09-08) で、リレーの絞り込みは**この親の1つのグループ**に
  // 移った。旧 `TeamRelayRankings.test.tsx` の [V-RL-01b] / [V-RL-05] / [V-RL-06]
  // をここへ移設したもの (子はもう絞り込みを描かない)。
  //
  // 選択肢の並び・距離の引き継ぎ規則そのものの定義元は
  // `apps/shared/__tests__/utils/rankingEventAxis.test.ts`。ここで見るのは
  // **UI がその規則どおりに描き、その条件で実際に RPC を叩くか**である。
  // -------------------------------------------------------------------------
  describe("[V-RL-F] リレー種目を選んだときの絞り込みと往復", () => {
    /** リレー RPC の1行。個人種目の行とは形が違う */
    function relayRpcRow(overrides: Record<string, unknown> = {}) {
      return {
        relay_record_id: "rr-kingfisher-fastest",
        relay_kind: "free",
        leg_distance: 100,
        leg_count: 4,
        pool_type: 1,
        gender_category: "male",
        total_time: 214.55,
        competition_id: "cmp-kingfisher-spring",
        competition_title: "キングフィッシャー春季記録会",
        competition_date: "2026-05-03",
        relay_created_at: "2026-05-04T09:15:00+09:00",
        legs: [],
        ...overrides,
      };
    }

    /**
     * 個人種目とリレーで別の行を返す fake。
     * `makeSupabase` は RPC 名を問わず同じ配列を返すので、
     * リレーを選んだ瞬間に個人種目の行が描かれる偽陽性が起きる。
     */
    function makeDualSupabase() {
      const fake = makeSupabase({
        rankings: (args) =>
          "p_relay_kind" in args ? [relayRpcRow()] : [rpcRow()],
      });
      return fake;
    }

    async function setupRelay() {
      const fake = makeDualSupabase();
      mocks.supabase.current = fake.client;
      renderRankings();
      await waitFor(() => expect(screen.getByTestId("team-rankings-filters")).toBeInTheDocument());
      await chooseOption("event", "relay:free");
      return fake;
    }

    it("🚨 リレー種目を選ぶとリレーの RPC を叩き、リレーの表が描かれる (往復の片道)", async () => {
      const fake = await setupRelay();

      await waitFor(() =>
        expect(fake.rpcCalls.map((call) => call.name)).toContain("get_team_relay_rankings"),
      );
      const args = await lastRpcArgs(fake, 2);
      expect(args).toEqual({
        p_team_id: TEAM_ID,
        p_relay_kind: "free",
        // 個人種目 Fr 50m (既定) から引き継がれた距離
        p_leg_distance: 50,
        p_pool_type: 1,
        p_gender_category: "male",
        p_fiscal_year: null,
        p_fiscal_year_or_earlier: false,
        p_limit: 500,
      });

      // 結果カラムがリレーの表に入れ替わっている
      await waitFor(() =>
        expect(screen.getByTestId("team-relay-rankings")).toBeInTheDocument(),
      );
      // 個人種目の表は消えている (両方出ていない)
      expect(screen.queryByTestId("team-rankings-row-rec-kingfisher-7")).toBeNull();
    });

    it("🚨 個人種目に戻すと個人の RPC と表に戻る (往復の帰り道)", async () => {
      const fake = await setupRelay();
      await waitFor(() => expect(screen.getByTestId("team-relay-rankings")).toBeInTheDocument());

      await chooseOption("event", "Fr");

      await waitFor(() => expect(screen.queryByTestId("team-relay-rankings")).toBeNull());
      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-row-rec-kingfisher-7")).toBeInTheDocument(),
      );
      // 最後の RPC は個人種目側
      expect(fake.rpcCalls.at(-1)?.name).toBe("get_team_record_rankings");
    });

    it("距離の選択肢が `50m × 4` 形式になり、長水路の free は 3 件 (25m は落ちる)", async () => {
      await setupRelay();

      // ⚠️ 既定は長水路。リレーの `25m × 4` も個人の 25m と同じ理由で落ちる
      await waitFor(() => expect(optionValues("distance")).toEqual(["50", "100", "200"]));
      // ラベルは `relay.legDistanceOption` の補間。`× 4` を UI が直書きしていない
      const labels = optionLabels("distance");
      expect(labels[0]).toBe(
        messages.teams.ranking.relay.legDistanceOption
          .replace("{distance}", "50")
          .replace("{legCount}", "4"),
      );
      // 個人種目の素の `50m` にはなっていない
      expect(labels).not.toContain("50m");
    });

    it("🚨 短水路のリレーでは `25m × 4` が現れる (水路で落ちているだけ)", async () => {
      await setupRelay();
      await chooseOption("poolType", "0");

      await waitFor(() =>
        expect(optionValues("distance")).toEqual(["25", "50", "100", "200"]),
      );
      expect(optionLabels("distance")[0]).toBe(
        messages.teams.ranking.relay.legDistanceOption
          .replace("{distance}", "25")
          .replace("{legCount}", "4"),
      );
    });

    it("メドレーリレーに変えると 200m が選択肢から消える (公式種目に無い)", async () => {
      await setupRelay();
      await waitFor(() => expect(optionValues("distance")).toContain("200"));

      await chooseOption("event", "relay:medley");

      // 長水路なので 25m は元から無い
      await waitFor(() => expect(optionValues("distance")).toEqual(["50", "100"]));
    });

    it("200m を選んでからメドレーに変えると最短に落ちる (存在しない条件で 0 件にならない)", async () => {
      const fake = await setupRelay();
      await chooseOption("distance", "200");
      await waitFor(() => expect(checkedValue("distance")).toBe("200"));

      await chooseOption("event", "relay:medley");

      // ⚠️ 長水路の最短は 50m (25m は水路で落ちている)
      await waitFor(() => expect(checkedValue("distance")).toBe("50"));
      await waitFor(() => expect((fake.rpcCalls.at(-1)?.args ?? {}).p_leg_distance).toBe(50));
    });

    it("性別区分が 男子 → 女子 → 混合 の3択になり、個人には無い混合が選べる", async () => {
      await setupRelay();

      await waitFor(() => expect(optionValues("gender")).toEqual(["male", "female", "mixed"]));
      // legend もリレー用のキー (「性別」ではなく「性別区分」)
      expect(groupFor("gender").querySelector("legend")?.textContent).toBe(
        messages.teams.ranking.relay.filter.genderCategory,
      );
      // 廃止した「すべて」は無い
      expect(optionValues("gender")).not.toContain("all");
    });

    it("混合を選ぶと p_gender_category='mixed' が渡る (NULL に落ちない)", async () => {
      const fake = await setupRelay();

      await chooseOption("gender", "mixed");

      await waitFor(() => expect((fake.rpcCalls.at(-1)?.args ?? {}).p_gender_category).toBe("mixed"));
    });

    it("🚨 混合のまま個人種目に戻すと男子に正規化される (画面と条件が食い違わない)", async () => {
      const fake = await setupRelay();
      await chooseOption("gender", "mixed");
      await waitFor(() => expect(checkedValue("gender")).toBe("mixed"));

      await chooseOption("event", "Fr");

      // 表示も男子
      await waitFor(() => expect(checkedValue("gender")).toBe("male"));
      // 問い合わせ条件も男子 (RPC は 0=男子 / 1=女子)
      await waitFor(() => expect((fake.rpcCalls.at(-1)?.args ?? {}).p_gender).toBe(0));
      expect(optionValues("gender")).toEqual(["male", "female"]);
    });

    it("🚨 リレー中は対象大会グループが無く、個人に戻ると選択が復元される", async () => {
      await setupRelay();
      // リレーの RPC に scope 引数が無いので絞り込みにも出さない
      expect(screen.queryByTestId("team-rankings-scope")).toBeNull();

      await chooseOption("event", "Fr");
      await waitFor(() => expect(screen.getByTestId("team-rankings-scope")).toBeInTheDocument());
      expect(checkedValue("scope")).toBe("teamCompetitions");
    });

    it("🚨 すべての大会を選んでからリレーを経由しても、個人に戻ると選択が生きている", async () => {
      const fake = await makeDualSupabase();
      mocks.supabase.current = fake.client;
      renderRankings();
      await waitFor(() => expect(screen.getByTestId("team-rankings-filters")).toBeInTheDocument());

      await chooseOption("scope", "allCompetitions");
      await waitFor(() => expect(checkedValue("scope")).toBe("allCompetitions"));

      await chooseOption("event", "relay:free");
      await waitFor(() => expect(screen.queryByTestId("team-rankings-scope")).toBeNull());

      await chooseOption("event", "Fr");

      // 勝手に狭まっていない
      await waitFor(() => expect(checkedValue("scope")).toBe("allCompetitions"));
      await waitFor(() =>
        expect((fake.rpcCalls.at(-1)?.args ?? {}).p_scope ?? "allCompetitions").toBeTruthy(),
      );
    });

    it("水路はリレーでも同じ2択で、選択が引き継がれる", async () => {
      const fake = await setupRelay();
      expect(optionValues("poolType")).toEqual(["0", "1"]);

      await chooseOption("poolType", "0");

      await waitFor(() => expect((fake.rpcCalls.at(-1)?.args ?? {}).p_pool_type).toBe(0));

      await chooseOption("event", "Fr");
      await waitFor(() => expect(checkedValue("poolType")).toBe("0"));
    });

    it("リレー中も styles を取りに行かない追加の往復を作らない", async () => {
      const fake = await setupRelay();
      await waitFor(() =>
        expect(fake.rpcCalls.map((call) => call.name)).toContain("get_team_relay_rankings"),
      );

      // styles は初回の1回だけ (リレーへ切り替えても再取得しない)
      expect(fake.fromCalls.filter((table) => table === "styles")).toHaveLength(1);
    });
  });


  // -------------------------------------------------------------------------
  // [V-W1] 🚨 セッション中に styles マスターが変わったときの派生フォールバック
  //
  // `filterState = selectedState ?? defaultState` なので、**ユーザーが個人種目を
  // 選択済みだと `defaultState` のリレーへのフォールバックが効かない**。
  // この状態で styles が使えなくなると、旧実装では
  //   見出し直下: `empty` バナー (再試行ボタン**なし** — 意図的)
  //   結果カラム: 汎用エラー + `stylesQuery.refetch()` の**再試行ボタン**
  // が同一状態で上下に並んだ (押しても空が返るだけ = 避けると決めた
  // 「押しても直らないボタン」そのもの)。mobile は `active` がフォールバックするので
  // この状態にならない。web を mobile 側に揃える。
  //
  // ⚠️ **フォールバック先は無条件のリレーではない。**
  //      styles が空                          → リレー (フリー / 100m×4 / 長水路 / 男子)
  //      groups 非空・選択中の行だけ消滅        → **個人の既定 (100m 自由形)**
  //    2行目を「無条件でリレー」にすると、個人種目が使えるのに
  //    **説明なしで別種類のランキングへ飛ばされる**。
  //
  // ⚠️ `styles` は `staleTime: Infinity` で再取得トリガーが無いため、
  //    「セッション中にマスターが縮む」状態は invalidate でしか作れない。
  //    `stylesRows` に関数を渡して呼び出しごとに違う行を返す。
  // -------------------------------------------------------------------------
  describe("[V-W1] セッション中に styles が変わったときのフォールバック", () => {
    function relayRpcRow(overrides: Record<string, unknown> = {}) {
      return {
        relay_record_id: "rr-kingfisher-w1",
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
     * 1回目のフェッチでは `first`、2回目以降は `second` を返す styles fake。
     * 個人種目とリレーで別の行を返す RPC も併せて仕込む。
     */
    function makeShrinkingSupabase(
      first: Array<Record<string, unknown>>,
      second: Array<Record<string, unknown>>,
    ) {
      let calls = 0;
      const fake = makeSupabase({
        stylesRows: () => {
          calls += 1;
          return calls === 1 ? first : second;
        },
        rankings: (args) => ("p_relay_kind" in args ? [relayRpcRow()] : [rpcRow()]),
      });
      return fake;
    }

    it("🚨 個人種目を選択済みで styles が空になっても再試行ボタンが二重に出ない", async () => {
      const fake = makeShrinkingSupabase(STYLE_ROWS, []);
      mocks.supabase.current = fake.client;

      const { queryClient } = renderRankings();
      await waitFor(() => expect(screen.getByTestId("team-rankings-filters")).toBeInTheDocument());

      // ユーザーが個人種目を選択する (= selectedState が非 null になる)
      await chooseOption("event", "Br");
      await waitFor(() => expect(checkedValue("event")).toBe("Br"));

      const stylesFetchesBefore = fake.fromCalls.filter((table) => table === "styles").length;
      expect(stylesFetchesBefore).toBe(1);

      // セッション中にマスターが空になる
      await queryClient.invalidateQueries({ queryKey: styleKeys.list() });
      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-individual-unavailable")).toBeInTheDocument(),
      );
      // 🚨 空振り防止: invalidate が実際に再取得を起こしたことを確認する。
      //    起きていなければ「マスターが縮んだ状態」に到達しておらず、
      //    下の assert は全部トートロジーになる
      expect(
        fake.fromCalls.filter((table) => table === "styles").length,
        "invalidate 後に styles の再取得が起きていない (状態に到達していない)",
      ).toBeGreaterThan(stylesFetchesBefore);

      // バナーは `empty` で再試行ボタンを持たない
      const banner = screen.getByTestId("team-rankings-individual-unavailable");
      expect(banner.querySelector("p")?.textContent).toBe(
        messages.teams.ranking.individualUnavailable.empty,
      );
      expect(screen.queryByTestId("team-rankings-styles-retry")).toBeNull();

      // 🚨 結果カラム側にも再試行ボタンが出ていない (これが二重表示の検出点)
      expect(screen.queryByTestId("team-rankings-retry")).toBeNull();
      expect(screen.queryByTestId("team-rankings-error")).toBeNull();

      // リレーへ倒れて実際に問い合わせが走る
      await waitFor(() =>
        expect(fake.rpcCalls.map((call) => call.name)).toContain("get_team_relay_rankings"),
      );
    });

    it("🚨 groups 非空で選択中の行だけ消えたときは個人の既定へ倒れる (リレーへ飛ばさない)", async () => {
      // 1回目: Fr 25/100 + Br 100。ユーザーは Br 100m を選ぶ。
      // 2回目: Br の行が消え Fr だけ残る → 個人種目はまだ使えるので
      //        **リレーではなく Fr 100m** に倒れるのが正しい
      const first = [
        { id: 1, style: "Fr", distance: 25 },
        { id: 3, style: "Fr", distance: 100 },
        { id: 10, style: "Br", distance: 100 },
      ];
      const second = [
        { id: 1, style: "Fr", distance: 25 },
        { id: 3, style: "Fr", distance: 100 },
      ];
      const fake = makeShrinkingSupabase(first, second);
      mocks.supabase.current = fake.client;

      const { queryClient } = renderRankings();
      await waitFor(() => expect(screen.getByTestId("team-rankings-filters")).toBeInTheDocument());

      await chooseOption("event", "Br");
      await waitFor(() => expect(checkedValue("event")).toBe("Br"));
      await waitFor(() => expect((fake.rpcCalls.at(-1)?.args ?? {}).p_style_id).toBe(10));

      const stylesFetchesBefore = fake.fromCalls.filter((table) => table === "styles").length;
      await queryClient.invalidateQueries({ queryKey: styleKeys.list() });
      // 空振り防止 (上と同じ理由)
      await waitFor(() =>
        expect(
          fake.fromCalls.filter((table) => table === "styles").length,
          "invalidate 後に styles の再取得が起きていない",
        ).toBeGreaterThan(stylesFetchesBefore),
      );
      // Br のピルがマスターから消えたことを画面で確認する (前提の実証)
      await waitFor(() => expect(optionValues("event")).not.toContain("Br"));

      // 個人種目のランキングのまま (リレー表に飛んでいない)
      await waitFor(() => expect(fake.rpcCalls.at(-1)?.name).toBe("get_team_record_rankings"));
      expect(screen.queryByTestId("team-relay-rankings")).toBeNull();
      // 既定の Fr 100m (styleId 3) で問い合わせている
      await waitFor(() => expect((fake.rpcCalls.at(-1)?.args ?? {}).p_style_id).toBe(3));

      // 個人種目は使えるので通知バナーは出ない
      expect(screen.queryByTestId("team-rankings-individual-unavailable")).toBeNull();
      // エラーにも化けない
      expect(screen.queryByTestId("team-rankings-error")).toBeNull();
      expect(screen.queryByTestId("team-rankings-retry")).toBeNull();
    });

    it("マスターが縮まなければ選択は保持される (フォールバックが常時発火していない)", async () => {
      // 否定形。上の2件が「常に既定へ戻す」実装でも緑になるので対で置く
      const fake = makeShrinkingSupabase(STYLE_ROWS, STYLE_ROWS);
      mocks.supabase.current = fake.client;

      const { queryClient } = renderRankings();
      await waitFor(() => expect(screen.getByTestId("team-rankings-filters")).toBeInTheDocument());

      await chooseOption("event", "Br");
      await chooseOption("distance", "200");
      await waitFor(() => expect((fake.rpcCalls.at(-1)?.args ?? {}).p_style_id).toBe(11));

      await queryClient.invalidateQueries({ queryKey: styleKeys.list() });
      await waitFor(() => expect(screen.getByTestId("team-rankings-filters")).toBeInTheDocument());

      expect(checkedValue("event")).toBe("Br");
      expect(checkedValue("distance")).toBe("200");
      expect((fake.rpcCalls.at(-1)?.args ?? {}).p_style_id).toBe(11);
    });
  });



  // -------------------------------------------------------------------------
  // [V-P2-41〜43] 🚨 取得上限に達したことの明示
  //
  // `TEAM_RANKING_FETCH_LIMIT = 500` は RPC の `p_limit` のクランプ上限と同値。
  // `personalBest` は1人1行なので 500 に届くチームはまず無いが、
  // **`allRaces` は1人が何本も出るので現実的に到達する**。
  // 黙って切ると「自分の記録が無い」と読めるので明示が必要。
  //
  // ⚠️ **定数をモックしない。** 500 行の**行オブジェクト**は軽量で
  //    (`assignCompetitionRanks` は O(n)、表は `visibleRows` = 先頭 50 行しか
  //    描かない)、モックすると「実際の上限で発火するか」を検証できなくなる。
  //    PM が懸念した重さは DB フィクスチャの話で、ここには当たらない。
  //
  // ⚠️ `PAGE_SIZE` (50) < `TEAM_RANKING_FETCH_LIMIT` (500) なので、
  //    上限到達時は**切り詰め注記と「さらに表示」が同時に出る**。
  //    その同居が矛盾して見えないかは実機で確認する ([V-P2-45])。
  // -------------------------------------------------------------------------
  describe("[V-P2-41] 取得上限に達したことの明示", () => {
    /** n 件の RPC 行。タイムは昇順にして順位付与を素直にする */
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

      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-truncated-note")).toBeInTheDocument(),
      );
      // 文言は i18n キー由来で、上限の数値が補間されている
      expect(screen.getByTestId("team-rankings-truncated-note").textContent).toBe(
        messages.teams.ranking.truncatedNote.replace("{limit}", "500"),
      );
      // 支援技術に伝わる形 (静かに増える情報なので role=status)
      expect(screen.getByTestId("team-rankings-truncated-note").getAttribute("role")).toBe(
        "status",
      );
    });

    it("🚨 499 件では出ない (上限未満で誤発火しない)", async () => {
      const fake = makeSupabase({ rankings: manyRows(499) });
      mocks.supabase.current = fake.client;

      renderRankings();

      // 件数バッジが出るまで待ってから否定形を見る (描画前の null を誤読しない)
      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-result-count")).toBeInTheDocument(),
      );
      expect(screen.queryByTestId("team-rankings-truncated-note")).toBeNull();
    });

    it("🚨 上限到達時は切り詰め注記と「さらに表示」が同時に出る", async () => {
      // `PAGE_SIZE` (50) < 上限 (500) なので必ず同居する。
      // どちらかが排他になる実装だと、上限に達したときに追加表示ができなくなる
      const fake = makeSupabase({ rankings: manyRows(500) });
      mocks.supabase.current = fake.client;

      renderRankings();

      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-truncated-note")).toBeInTheDocument(),
      );
      expect(screen.getByTestId("team-rankings-show-more")).toBeInTheDocument();
    });

    it("allRaces でも personalBest でも同じ条件で出る (集計モード限定の分岐にしていない)", async () => {
      // `allRaces` のときだけ出す実装にすると、`personalBest` で 500 人を超える
      // 大規模チームで黙って切られる
      const fake = makeSupabase({ rankings: manyRows(500) });
      mocks.supabase.current = fake.client;

      renderRankings();
      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-truncated-note")).toBeInTheDocument(),
      );

      await chooseOption("aggregation", "allRaces");

      await waitFor(() =>
        expect((fake.rpcCalls.at(-1)?.args ?? {}).p_aggregation).toBe("allRaces"),
      );
      expect(screen.getByTestId("team-rankings-truncated-note")).toBeInTheDocument();
    });

    it("0 件でも注記は出ない (空状態と混ざらない)", async () => {
      const fake = makeSupabase({ rankings: [], recordCount: 5 });
      mocks.supabase.current = fake.client;

      renderRankings();

      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-empty-no-match")).toBeInTheDocument(),
      );
      expect(screen.queryByTestId("team-rankings-truncated-note")).toBeNull();
    });
  });

});
