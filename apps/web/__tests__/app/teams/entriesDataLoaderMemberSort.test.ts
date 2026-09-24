/**
 * EntriesDataLoader.tsx (teams/[teamId]/competitions/[competitionId]/entries/_server) —
 * メンバー一覧の年上順ソート検証 [並び順スプリント]
 *
 * Sprint Contract:
 *   - members (team_memberships 一覧、新規追加の選択候補) は年上順（生年月日昇順、
 *     未設定は末尾）で EntriesClient に渡る
 *   - select() に birthday が含まれることを、クエリ引数を捨てないモックで実測する
 *
 * admin ガード自体の回帰は entryBulkAdminGuard.test.ts が既に持つため、本ファイルは
 * メンバー並び順・select 内容のみを対象にする。モック方針は
 * recordDataLoaderMemberSort.test.ts と同型 (queue + thenable builder)。
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

/**
 * table 名 → 呼び出し順(queue) で応答を切り替える最小限の supabase チェーンモック。
 * 終端メソッドに関わらず (thenable のため) await した瞬間に queue の応答を返す。
 */
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

// 十分未来の日付 (過去日ガードで redirect されないように)
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

const memberRow = (userId: string, name: string, birthday: string | null, role = "user") => ({
  id: `membership-${userId}`,
  user_id: userId,
  role,
  is_swimmer: true,
  users: { id: userId, name, birthday },
});

describe("EntriesDataLoader — メンバー一覧の年上順ソート [並び順スプリント]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({ id: "user-1" });
    mockGetLocale.mockResolvedValue("ja");
    mockGetBestTimesForUsers.mockResolvedValue(new Map());
  });

  it("team_memberships の一覧取得 select() 文字列に birthday が含まれる（未select化の検出）", async () => {
    const { from, selectCallsByTable } = buildQueueSupabaseMock({
      team_memberships: [
        { data: { id: "m-1", role: "admin" }, error: null }, // 1回目: 権限確認
        { data: [], error: null }, // 2回目: メンバー一覧
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
    expect(memberSelects[1]).toContain("birthday");
  });

  it("年上順（生年月日昇順）で activeMembers が EntriesClient に渡る。管理者でも先頭固定にはならない", async () => {
    const younger = memberRow("u-younger", "ジロウ", "2012-04-01", "admin");
    const older = memberRow("u-older", "タロウ", "2008-04-01", "user");
    const noBirthday = memberRow("u-none", "サブロウ", null, "user");

    const { from } = buildQueueSupabaseMock({
      team_memberships: [
        { data: { id: "m-1", role: "admin" }, error: null },
        // 望ましい並びと異なる順で DB から返す
        { data: [younger, older, noBirthday], error: null },
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
      props: { activeMembers: Array<{ user_id: string }> };
    };

    expect(result.props.activeMembers.map((m) => m.user_id)).toEqual([
      "u-older",
      "u-younger",
      "u-none",
    ]);
  });
});
