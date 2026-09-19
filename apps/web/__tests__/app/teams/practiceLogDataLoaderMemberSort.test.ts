/**
 * PracticeLogDataLoader.tsx (teams-admin/[teamId]/practices/[practiceId]/logs/_server) —
 * メンバー一覧の年上順ソート検証 [並び順スプリント]
 *
 * Sprint Contract:
 *   - members (team_memberships 一覧) は年上順（生年月日昇順、未設定は末尾）で
 *     PracticeLogClient に渡る
 *   - select() に birthday が含まれることを、クエリ引数を捨てないモックで実測する
 *
 * admin ガード自体の回帰は practiceLogAdminGuard.test.ts が既に持つため、本ファイルは
 * メンバー並び順・select 内容のみを対象にする。モック方針は
 * recordDataLoaderMemberSort.test.ts と同型 (queue + thenable builder)。
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

const memberRow = (userId: string, name: string, birthday: string | null, role = "user") => ({
  id: `membership-${userId}`,
  user_id: userId,
  role,
  users: { id: userId, name, birthday },
});

describe("PracticeLogDataLoader — メンバー一覧の年上順ソート [並び順スプリント]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({ id: "user-1" });
    mockGetLocale.mockResolvedValue("ja");
  });

  it("team_memberships の一覧取得 select() 文字列に birthday が含まれる（未select化の検出）", async () => {
    const { from, selectCallsByTable } = buildQueueSupabaseMock({
      team_memberships: [
        { data: { id: "m-1", role: "admin" }, error: null }, // 1回目: 権限確認
        { data: [], error: null }, // 2回目: メンバー一覧
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
    expect(memberSelects[1]).toContain("birthday");
  });

  it("年上順（生年月日昇順）で members が PracticeLogClient に渡る。管理者でも先頭固定にはならない", async () => {
    const younger = memberRow("u-younger", "ジロウ", "2012-04-01", "admin");
    const older = memberRow("u-older", "タロウ", "2008-04-01", "user");
    const noBirthday = memberRow("u-none", "サブロウ", null, "user");

    const { from } = buildQueueSupabaseMock({
      team_memberships: [
        { data: { id: "m-1", role: "admin" }, error: null },
        // 望ましい並びと異なる順で DB から返す
        { data: [younger, older, noBirthday], error: null },
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
    })) as { props: { members: Array<{ user_id: string }> } };

    expect(result.props.members.map((m) => m.user_id)).toEqual(["u-older", "u-younger", "u-none"]);
  });
});
