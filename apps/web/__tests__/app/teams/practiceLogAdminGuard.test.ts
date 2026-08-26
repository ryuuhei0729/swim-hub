/**
 * teams-admin/[teamId]/practices/[practiceId]/logs/_server/PracticeLogDataLoader.tsx
 * — 管理者権限ガードの回帰テスト (V-11: 変更禁止3箇所のうちの1つ)
 *
 * Sprint Contract (方式E, 2026-08-25確定):
 *   このスプリントで変更するのは「保存成功後・戻るボタン (:551, :561) の遷移先」と
 *   「entries の過去日ガード (EntriesDataLoader.tsx:160)」の7箇所のみ。
 *   `PracticeLogDataLoader.tsx:174` の `role !== "admin"` ガードは明示的に変更禁止と
 *   確定している (非 admin にとって `/teams/` は正当な行き先であり、ここを
 *   `/teams-admin/` にすると非 admin が管理者専用ルートに送られ 404 になる退行を生む)。
 *
 * このリポジトリに PracticeLogDataLoader を直接呼び出すテストは存在しなかった
 * (Planner 実測)。`recordAdminGuard.test.ts` / `entryBulkAdminGuard.test.ts` と
 * 同型のパターン (server component を直接 await 呼び出しし、next/navigation の
 * redirect/notFound を「呼ばれたら例外を投げて描画を中断する」制御フロー関数として
 * 模倣する) を踏襲して新規に確立する。
 *
 * 目的: 後続スプリントで「戻り先を一律 teams-admin に統一する」ような一括置換が
 * 行われても、この変更禁止ガードだけは検出できるようにする (Sprint Contract に
 * 明記された「自動テストに落とせ」の要求)。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetServerUser = vi.fn();
const mockCreateAuthenticatedServerClient = vi.fn();

vi.mock("@/lib/supabase-server-auth", () => ({
  createAuthenticatedServerClient: mockCreateAuthenticatedServerClient,
}));
vi.mock("@/lib/supabase-server", () => ({
  getServerUser: mockGetServerUser,
}));

class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`REDIRECT:${url}`);
  }
}
class NotFoundSignal extends Error {
  constructor() {
    super("NOT_FOUND");
  }
}

const mockRedirect = vi.fn((url: string) => {
  throw new RedirectSignal(url);
});
const mockNotFound = vi.fn(() => {
  throw new NotFoundSignal();
});

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
  notFound: mockNotFound,
}));

// PracticeLogClient (巨大な client component) は本テストの対象外。
// admin 正常系では「呼ばれたことそのもの」だけ確認できればよい。
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

type ChainResponse = { data: unknown; error: unknown };

function buildSupabaseMock(
  responses: Record<string, { single?: ChainResponse; order?: ChainResponse; eq?: ChainResponse }>,
) {
  const defaultResponse: ChainResponse = { data: null, error: null };
  const from = vi.fn((table: string) => {
    const tableResponses = responses[table] ?? {};
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = vi.fn(chain);
    // team_attendance は select().eq() で終端する (single/order を呼ばない)ため、
    // eq() 自体が Promise を返せるようにしておく。他テーブルは eq() 後にさらに
    // .eq()/.single()/.order() が続くのでチェーンを返す。
    builder.eq = vi.fn(() =>
      tableResponses.eq ? Promise.resolve(tableResponses.eq) : builder,
    );
    builder.order = vi.fn(() => Promise.resolve(tableResponses.order ?? defaultResponse));
    builder.single = vi.fn(() => Promise.resolve(tableResponses.single ?? defaultResponse));
    return builder;
  });
  return { from };
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

describe("PracticeLogDataLoader — 管理者権限ガード (V-11: 変更禁止の回帰確認)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({ id: "user-1" });
  });

  it(
    "非 admin (role: 'user') がアクセスすると /teams/{teamId}?tab=practices へ redirect される " +
      "（人間の意図: この分岐は方式Eの変更対象7箇所に含まれない。/teams-admin/ に" +
      "書き換えてしまうと非adminが管理者専用ルートへ送られ404になる退行を生むため、" +
      "現状のまま固定する）",
    async () => {
      mockCreateAuthenticatedServerClient.mockResolvedValue(
        buildSupabaseMock({
          team_memberships: { single: { data: { id: "m-1", role: "user" }, error: null } },
        }),
      );

      const PracticeLogDataLoader = await loadPracticeLogDataLoader();

      await expect(
        PracticeLogDataLoader({ teamId: "team-1", practiceId: "practice-1" }),
      ).rejects.toThrow(RedirectSignal);
      expect(mockRedirect).toHaveBeenCalledWith("/teams/team-1?tab=practices");
      expect(mockRedirect).not.toHaveBeenCalledWith("/teams-admin/team-1?tab=practices");
    },
  );

  it("チームメンバーシップが存在しない場合は notFound になる", async () => {
    mockCreateAuthenticatedServerClient.mockResolvedValue(
      buildSupabaseMock({
        team_memberships: { single: { data: null, error: null } },
      }),
    );

    const PracticeLogDataLoader = await loadPracticeLogDataLoader();

    await expect(
      PracticeLogDataLoader({ teamId: "team-1", practiceId: "practice-1" }),
    ).rejects.toThrow(NotFoundSignal);
  });

  it("練習が存在しない (もしくは team_id が一致しない) 場合は notFound になる", async () => {
    mockCreateAuthenticatedServerClient.mockResolvedValue(
      buildSupabaseMock({
        team_memberships: {
          single: { data: { id: "m-1", role: "admin" }, error: null },
          order: { data: [], error: null },
        },
        practices: { single: { data: null, error: { message: "not found" } } },
        practice_logs: { order: { data: [], error: null } },
        practice_tags: { order: { data: [], error: null } },
        team_attendance: { eq: { data: [], error: null } },
      }),
    );

    const PracticeLogDataLoader = await loadPracticeLogDataLoader();

    await expect(
      PracticeLogDataLoader({ teamId: "team-1", practiceId: "practice-1" }),
    ).rejects.toThrow(NotFoundSignal);
  });

  it(
    "admin かつ練習が存在する場合は redirect も notFound もされず PracticeLogClient に処理が渡る" +
      "（人間の意図: admin ガード自体の過剰検出が無いことの非退行確認）",
    async () => {
      mockCreateAuthenticatedServerClient.mockResolvedValue(
        buildSupabaseMock({
          team_memberships: {
            single: { data: { id: "m-1", role: "admin" }, error: null },
            order: { data: [], error: null },
          },
          practices: { single: { data: validPracticeRow, error: null } },
          practice_logs: { order: { data: [], error: null } },
          practice_tags: { order: { data: [], error: null } },
          team_attendance: { eq: { data: [], error: null } },
        }),
      );

      const PracticeLogDataLoader = await loadPracticeLogDataLoader();
      const result = await PracticeLogDataLoader({ teamId: "team-1", practiceId: "practice-1" });

      expect(mockRedirect).not.toHaveBeenCalled();
      expect(mockNotFound).not.toHaveBeenCalled();
      expect(result).toBeTruthy();
    },
  );
});
