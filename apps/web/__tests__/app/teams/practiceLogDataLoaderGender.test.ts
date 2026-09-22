/**
 * PracticeLogDataLoader.tsx (teams-admin/[teamId]/practices/[practiceId]/logs/_server) —
 * gender の配線検証 [WV-17, PM裁定 修正B, Reviewer指摘: EntriesDataLoaderとの非対称性]
 *
 * Sprint Contract:
 *   共有 `MemberSelectModal` の性別グルーピング (`useMemberGroupSort`) が機能するには
 *   `PracticeLogClient` に渡る `members[].users.gender` が実際に DB から select
 *   されている必要がある。`entriesDataLoaderGender.test.ts` が EntriesDataLoader 側を
 *   カバーしているのに対し、PracticeLogDataLoader 側には対になるテストが無い
 *   (Reviewer指摘)。本ファイルはその非対称性を解消する。
 *
 * モック方針は practiceLogDataLoaderMemberSort.test.ts / entriesDataLoaderGender.test.ts
 * と同型 (queue + thenable builder)。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetServerUser = vi.fn();
const mockCreateAuthenticatedServerClient = vi.fn();
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
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock(
  "../../../app/[locale]/(authenticated)/teams-admin/[teamId]/practices/[practiceId]/logs/_client/PracticeLogClient",
  () => ({
    default: (props: unknown) => ({ type: "PracticeLogClientMock", props }),
  }),
);

async function loadPracticeLogDataLoader() {
  const mod = await import(
    "../../../app/[locale]/(authenticated)/teams-admin/[teamId]/practices/[practiceId]/logs/_server/PracticeLogDataLoader"
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

const validPracticeRow = {
  id: "practice-1",
  user_id: "user-1",
  team_id: "team-1",
  date: "2026-01-01",
  place: null,
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

describe("PracticeLogDataLoader — gender の配線 [WV-17, PM裁定修正B]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({ id: "user-1" });
    mockGetLocale.mockResolvedValue("ja");
  });

  it("[WV-17] team_memberships の一覧取得 select() 文字列に gender が含まれる（未select化の検出）", async () => {
    const { from, selectCallsByTable } = buildQueueSupabaseMock({
      team_memberships: [
        { data: { id: "m-1", role: "admin" }, error: null },
        { data: [], error: null },
      ],
      practices: [{ data: validPracticeRow, error: null }],
      practice_logs: [{ data: [], error: null }],
      practice_tags: [{ data: [], error: null }],
      team_attendance: [{ data: [], error: null }],
    });
    mockCreateAuthenticatedServerClient.mockResolvedValue({ from });

    const PracticeLogDataLoader = await loadPracticeLogDataLoader();
    await PracticeLogDataLoader({ teamId: "team-1", practiceId: "practice-1" });

    const memberSelects = selectCallsByTable.team_memberships ?? [];
    expect(memberSelects.length).toBeGreaterThanOrEqual(2);
    expect(memberSelects[1]).toContain("gender");
  });

  it("[WV-17] DB の gender 値 (0=男性/1=女性) が members の各要素にそのまま反映される", async () => {
    const male = memberRow("u-male", "タロウ", 0);
    const female = memberRow("u-female", "ハナコ", 1);

    const { from } = buildQueueSupabaseMock({
      team_memberships: [
        { data: { id: "m-1", role: "admin" }, error: null },
        { data: [male, female], error: null },
      ],
      practices: [{ data: validPracticeRow, error: null }],
      practice_logs: [{ data: [], error: null }],
      practice_tags: [{ data: [], error: null }],
      team_attendance: [{ data: [], error: null }],
    });
    mockCreateAuthenticatedServerClient.mockResolvedValue({ from });

    const PracticeLogDataLoader = await loadPracticeLogDataLoader();
    const result = (await PracticeLogDataLoader({
      teamId: "team-1",
      practiceId: "practice-1",
    })) as {
      props: { members: Array<{ user_id: string; users: { gender?: number } }> };
    };

    const byId = new Map(result.props.members.map((m) => [m.user_id, m.users.gender]));
    expect(byId.get("u-male")).toBe(0);
    expect(byId.get("u-female")).toBe(1);
  });
});
