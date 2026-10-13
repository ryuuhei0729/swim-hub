/**
 * RecordDataLoader — チーム代理入力の目標取得 (Sprint Contract goal_target_badge)
 *   - 目標は RPC get_team_competition_goal_targets を {p_team_id, p_competition_id} で「1回だけ」呼ぶ
 *     (メンバー数に依らない = N+1 にならない)
 *   - 取得結果は各行に competition_id が付与されて Client の goalTargets props に渡る
 *   - RPC のエラー / reject / rpc 関数が無い (未適用・旧モック) でもページは落ちず、goalTargets=[] で
 *     Client に処理が渡る (入力・保存を止めない)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetServerUser = vi.fn();
const mockCreateAuthenticatedServerClient = vi.fn();

vi.mock("@/lib/supabase-server-auth", () => ({
  createAuthenticatedServerClient: mockCreateAuthenticatedServerClient,
}));
vi.mock("@/lib/supabase-server", () => ({ getServerUser: mockGetServerUser }));
vi.mock("next-intl/server", () => ({
  getLocale: vi.fn().mockResolvedValue("ja"),
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("@/i18n/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("../../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/RecordClient", () => ({
  default: (props: unknown) => ({ type: "ClientMock", props }),
}));

type ChainResponse = { data: unknown; error: unknown };

function buildSupabase(rpc?: unknown) {
  const responses: Record<string, { single?: ChainResponse; order?: ChainResponse }> = {
    team_memberships: {
      single: { data: { id: "m-1", role: "admin" }, error: null },
      order: { data: [], error: null },
    },
    competitions: {
      single: {
        data: {
          id: "comp-1", user_id: "u", team_id: "team-1", title: "大会", date: "2999-01-01",
          end_date: null, place: null, pool_type: 0, entry_status: "open", note: null,
          created_at: "2020-01-01T00:00:00Z", team: { id: "team-1", name: "チーム" },
        },
        error: null,
      },
    },
    records: { order: { data: [], error: null } },
    entries: { order: { data: [], error: null } },
    styles: { order: { data: [], error: null } },
  };
  const from = vi.fn((table: string) => {
    const r = responses[table] ?? {};
    const b: Record<string, unknown> = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    b.order = vi.fn(() => Promise.resolve(r.order ?? { data: null, error: null }));
    b.single = vi.fn(() => Promise.resolve(r.single ?? { data: null, error: null }));
    return b;
  });
  return rpc === undefined ? { from } : { from, rpc };
}

async function run() {
  const mod = await import("../../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_server/RecordDataLoader");
  const result = (await mod.default({ teamId: "team-1", competitionId: "comp-1" })) as unknown as { props: { goalTargets?: unknown[] } };
  return result.props;
}

describe("RecordDataLoader — 目標取得", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({ id: "admin-1" });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("RPC を {p_team_id, p_competition_id} で1回だけ呼び、各行に competition_id を付けて props に渡す", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { user_id: "u1", style_id: 2, target_time: 28, status: "active" },
        { user_id: "u2", style_id: 2, target_time: 29, status: "cancelled" },
      ],
      error: null,
    });
    mockCreateAuthenticatedServerClient.mockResolvedValue(buildSupabase(rpc));
    const props = await run();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_team_competition_goal_targets", {
      p_team_id: "team-1",
      p_competition_id: "comp-1",
    });
    expect(props.goalTargets).toStrictEqual([
      { competition_id: "comp-1", user_id: "u1", style_id: 2, target_time: 28, status: "active" },
      { competition_id: "comp-1", user_id: "u2", style_id: 2, target_time: 29, status: "cancelled" },
    ]);
  });

  it("RPC が error を返しても落ちず、goalTargets=[] で続行する", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "P0001", message: "x" } });
    mockCreateAuthenticatedServerClient.mockResolvedValue(buildSupabase(rpc));
    const props = await run();
    expect(props.goalTargets).toEqual([]);
  });

  it("RPC が reject (ネットワーク断など) しても落ちず、goalTargets=[]", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("network"));
    mockCreateAuthenticatedServerClient.mockResolvedValue(buildSupabase(rpc));
    const props = await run();
    expect(props.goalTargets).toEqual([]);
  });

  it("supabase に rpc 関数が無い (旧モック・未適用相当) でも落ちず、goalTargets=[]", async () => {
    mockCreateAuthenticatedServerClient.mockResolvedValue(buildSupabase(undefined));
    const props = await run();
    expect(props.goalTargets).toEqual([]);
  });
});
