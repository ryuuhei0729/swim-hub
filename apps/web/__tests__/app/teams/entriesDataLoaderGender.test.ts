/**
 * EntriesDataLoader.tsx (teams/[teamId]/competitions/[competitionId]/entries/_server) —
 * gender 追加の検証 [チップ化スプリント PM裁定 W10]
 *
 * Sprint Contract:
 *   `EntriesDataLoader.tsx` の team_memberships select() に `gender` が含まれ、
 *   `EntriesClient` に渡る `activeMembers` の各要素にも `gender` が反映される
 *   こと。理由: 共有 `MemberSelectModal` の性別グルーピング (`useMemberGroupSort`)
 *   が `users.gender` を参照するため、ここが欠けているとエントリー画面だけ
 *   チップが無言でグルーピング不能 (WV-08 のフォールバックに常に落ちる) になる。
 *
 * モック方針・ヘルパーは entriesDataLoaderMemberSort.test.ts と同一
 * (queue + thenable builder)。並び順の回帰は既存ファイルが持つため、本ファイルは
 * gender 追加のみを対象にする。
 *
 * [WV-10] を参照。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetServerUser = vi.fn();
const mockCreateAuthenticatedServerClient = vi.fn();
const mockGetBestTimesForUsers = vi.fn();
const mockGetLocale = vi.fn().mockResolvedValue("ja");

vi.mock("@/lib/supabase-server-auth", () => ({
  createAuthenticatedServerClient: mockCreateAuthenticatedServerClient,
}));
vi.mock("@/lib/supabase-server", () => ({
  getServerUser: mockGetServerUser,
}));
vi.mock("next-intl/server", () => ({
  getLocale: mockGetLocale,
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: vi.fn().mockImplementation(() => ({
    getBestTimesForUsers: mockGetBestTimesForUsers,
  })),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock(
  "../../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/entries/_client/EntriesClient",
  () => ({
    default: (props: unknown) => ({ type: "EntriesClientMock", props }),
  }),
);

async function loadEntriesDataLoader() {
  const mod = await import(
    "../../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/entries/_server/EntriesDataLoader"
  );
  return mod.default;
}

type QueuedResponse = { data: unknown; error: unknown };

function buildQueueSupabaseMock(queues: Record<string, QueuedResponse[]>) {
  const selectCallsByTable: Record<string, string[]> = {};
  const consumed: Record<string, number> = {};
  const from = vi.fn((table: string) => {
    const idx = consumed[table] ?? 0;
    consumed[table] = idx + 1;
    const list = queues[table] ?? [];
    const response = list[idx] ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn((q: string) => {
      (selectCallsByTable[table] ??= []).push(q);
      return builder;
    });
    builder.eq = vi.fn(() => builder);
    builder.in = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.single = vi.fn(() => Promise.resolve(response));
    (builder as { then: unknown }).then = (
      onFulfilled?: (value: QueuedResponse) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(response).then(onFulfilled, onRejected);
    return builder;
  });
  return { from, selectCallsByTable };
}

const futureDate = "2099-01-01";

const validCompetitionRow = {
  id: "comp-1",
  user_id: "user-1",
  team_id: "team-1",
  title: "テスト大会",
  date: futureDate,
  end_date: null,
  place: null,
  pool_type: 0,
  entry_status: "open",
  note: null,
  created_at: "2020-01-01T00:00:00Z",
  team: { id: "team-1", name: "チーム" },
};

const memberRow = (userId: string, name: string, gender: number, role = "user") => ({
  id: `membership-${userId}`,
  user_id: userId,
  role,
  is_swimmer: true,
  users: { id: userId, name, birthday: null, gender },
});

describe("EntriesDataLoader — gender の追加 [WV-10, PM裁定W10]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({ id: "user-1" });
    mockGetLocale.mockResolvedValue("ja");
    mockGetBestTimesForUsers.mockResolvedValue(new Map());
  });

  it("[WV-10] team_memberships の一覧取得 select() 文字列に gender が含まれる（未select化の検出）", async () => {
    const { from, selectCallsByTable } = buildQueueSupabaseMock({
      team_memberships: [
        { data: { id: "m-1", role: "admin" }, error: null },
        { data: [], error: null },
      ],
      competitions: [{ data: validCompetitionRow, error: null }],
      entries: [{ data: [], error: null }],
      styles: [{ data: [], error: null }],
    });
    mockCreateAuthenticatedServerClient.mockResolvedValue({ from });

    const EntriesDataLoader = await loadEntriesDataLoader();
    await EntriesDataLoader({ teamId: "team-1", competitionId: "comp-1", returnOrigin: "admin" });

    const memberSelects = selectCallsByTable.team_memberships ?? [];
    expect(memberSelects.length).toBeGreaterThanOrEqual(2);
    expect(memberSelects[1]).toContain("gender");
  });

  it("[WV-10] DB の gender 値 (0=男性/1=女性) が activeMembers の各要素にそのまま反映される", async () => {
    const male = memberRow("u-male", "タロウ", 0);
    const female = memberRow("u-female", "ハナコ", 1);

    const { from } = buildQueueSupabaseMock({
      team_memberships: [
        { data: { id: "m-1", role: "admin" }, error: null },
        { data: [male, female], error: null },
      ],
      competitions: [{ data: validCompetitionRow, error: null }],
      entries: [{ data: [], error: null }],
      styles: [{ data: [], error: null }],
    });
    mockCreateAuthenticatedServerClient.mockResolvedValue({ from });

    const EntriesDataLoader = await loadEntriesDataLoader();
    const result = (await EntriesDataLoader({
      teamId: "team-1",
      competitionId: "comp-1",
      returnOrigin: "admin",
    })) as {
      props: { activeMembers: Array<{ user_id: string; gender?: number }> };
    };

    const byId = new Map(result.props.activeMembers.map((m) => [m.user_id, m.gender]));
    expect(byId.get("u-male")).toBe(0);
    expect(byId.get("u-female")).toBe(1);
  });
});
