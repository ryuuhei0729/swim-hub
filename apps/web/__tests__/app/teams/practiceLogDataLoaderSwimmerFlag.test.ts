/**
 * PracticeLogDataLoader.tsx (teams-admin/[teamId]/practices/[practiceId]/logs/_server) —
 * is_swimmer の配線検証 [チップ化スプリント PM裁定 W7, Issue #49 適用漏れ修正]
 *
 * Sprint Contract:
 *   `PracticeLogClient.tsx` は `excludeNonSwimmers(members)` を候補提示の直前に
 *   適用するよう修正された (W7)。しかしこのフィルタは `members[].is_swimmer` が
 *   実際に DB から select されて渡ってこない限り効果を持たない
 *   (`excludeNonSwimmers` は `is_swimmer !== false` で判定するため、
 *    select していない undefined は「泳者」として扱われ、誰も除外されない)。
 *
 *   [QA実測, Phase B 2026-09-22] `PracticeLogDataLoader.tsx` の team_memberships
 *   select() 文字列に `is_swimmer` が含まれていないことを確認した (grep 実測、
 *   217行全文に is_swimmer の参照が1件も無い)。つまり本番では
 *   `PracticeLogClient` に渡る `members[].is_swimmer` が常に `undefined` になり、
 *   コンポーネント側のフィルタは配線上は正しくても実データでは非泳者を
 *   1人も除外できない (Critical: 「読み取り側だけ直して書き込み/取得側を
 *   放置」のパターン。EntriesDataLoader/RecordDataLoader は既に is_swimmer を
 *   select 済みで対照的)。
 *
 * このテストは現時点で red になる (production の実装漏れを pin する)。
 * Developer が select() に is_swimmer を追加すれば green になる。
 *
 * モック方針は practiceLogDataLoaderMemberSort.test.ts と同型。
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

const memberRow = (userId: string, name: string, isSwimmer: boolean, role = "user") => ({
  id: `membership-${userId}`,
  user_id: userId,
  role,
  is_swimmer: isSwimmer,
  users: { id: userId, name, birthday: null },
});

describe("PracticeLogDataLoader — is_swimmer の配線 [WV-07, PM裁定W7]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({ id: "user-1" });
    mockGetLocale.mockResolvedValue("ja");
  });

  it("[WV-07] team_memberships の一覧取得 select() 文字列に is_swimmer が含まれる（未select化の検出）", async () => {
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
    expect(memberSelects[1]).toContain("is_swimmer");
  });

  it("[WV-07] DB の is_swimmer=false が members の各要素にそのまま反映される (PracticeLogClient のフィルタが実際に機能するための前提)", async () => {
    const swimmer = memberRow("u-swimmer", "太郎", true);
    const nonSwimmer = memberRow("u-nonswimmer", "非泳者花子", false);

    const { from } = buildQueueSupabaseMock({
      team_memberships: [
        { data: { id: "m-1", role: "admin" }, error: null },
        { data: [swimmer, nonSwimmer], error: null },
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
    })) as { props: { members: Array<{ user_id: string; is_swimmer?: boolean }> } };

    const byId = new Map(result.props.members.map((m) => [m.user_id, m.is_swimmer]));
    expect(byId.get("u-swimmer")).toBe(true);
    expect(byId.get("u-nonswimmer")).toBe(false);
  });
});
