/**
 * teams/[teamId]/competitions/[competitionId]/entries/ — 管理者権限ガード
 *
 * Sprint Contract (人間が確定した仕様 #1, #6):
 *   `entries/_server/EntriesDataLoader.tsx` は records/ の
 *   `RecordDataLoader.tsx` と同型のガードを持つ。
 *     - membership が無い → notFound
 *     - role !== "admin" → redirect
 *     - 大会日が過去 → redirect（仕様#6: 今日は可、過去のみ不可）
 *     - entry_status: closed は redirect しない（静的バナーのみ、仕様#6）
 *
 * 実測 (2026-08-12, Phase B):
 *   `EntriesDataLoader.tsx:141-161` を直接確認し、上記4条件の分岐を実装コードから
 *   引用してテストの期待値を作った。next/navigation の redirect/notFound は
 *   Next.js 実行時には例外をthrowして描画を中断する制御フロー関数のため、
 *   テストでも同様に throw するモックを用意し、「呼ばれたら処理が止まる」という
 *   実際の意味を保つ。
 *
 * このテストファイルは server component を直接 `await` 呼び出しして検証する
 * (このリポジトリに server loader のユニットテスト前例は無いため新規に確立する)。
 * ブラウザ実機でのURL直打ち確認 (V-08) は別途 Playwright で行う (このテストの
 * 対象外)。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetServerUser = vi.fn();
const mockCreateAuthenticatedServerClient = vi.fn();
const mockGetBestTimesForUsers = vi.fn();

vi.mock("@/lib/supabase-server-auth", () => ({
  getServerUser: mockGetServerUser,
  createAuthenticatedServerClient: mockCreateAuthenticatedServerClient,
}));
vi.mock("@/lib/supabase-server", () => ({
  getServerUser: mockGetServerUser,
}));

vi.mock("next-intl/server", () => ({
  getLocale: vi.fn().mockResolvedValue("ja"),
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: vi.fn().mockImplementation(() => ({
    getBestTimesForUsers: mockGetBestTimesForUsers,
  })),
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

// EntriesClient (巨大なclientコンポーネント) は実際にレンダリングしない。
// admin正常系では「EntriesClientにどのpropsが渡るか」だけを検証すればよいため、
// JSX生成のみ許可し中身は評価しないようにモック化する。
vi.mock(
  "../../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/entries/_client/EntriesClient",
  () => ({
    default: (props: unknown) => ({ type: "EntriesClientMock", props }),
  }),
);

// vi.mock はファイル先頭で hoist されるため、動的 import で対象モジュールを読む
async function loadEntriesDataLoader() {
  const mod = await import(
    "../../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/entries/_server/EntriesDataLoader"
  );
  return mod.default;
}

type ChainResponse = { data: unknown; error: unknown };

/**
 * 指定した table 名ごとに異なる終端レスポンスを返す最小限の supabase チェーンモック。
 *
 * EntriesDataLoader は "team_memberships" テーブルを2回 (自分の権限確認用に
 * `.single()`、メンバー一覧用に `.order()`) 別々のチェーンで呼ぶため、
 * `.single()` 用と `.order()` 用のレスポンスを個別に設定できるようにする
 * (table名だけで分岐すると2つのクエリが混同される)。
 */
function buildSupabaseMock(
  responses: Record<string, { single?: ChainResponse; order?: ChainResponse }>,
) {
  const defaultResponse: ChainResponse = { data: null, error: null };
  const from = vi.fn((table: string) => {
    const tableResponses = responses[table] ?? {};
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = vi.fn(chain);
    builder.eq = vi.fn(chain);
    builder.order = vi.fn(() => Promise.resolve(tableResponses.order ?? defaultResponse));
    builder.single = vi.fn(() => Promise.resolve(tableResponses.single ?? defaultResponse));
    return builder;
  });
  return { from };
}

describe("EntriesDataLoader — 管理者権限ガード (Phase B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({ id: "user-1" });
    mockGetBestTimesForUsers.mockResolvedValue(new Map());
  });

  it(
    "非 admin (role: 'user') のメンバーがアクセスすると " +
      "/teams/{teamId}?tab=competitions へ redirect される [V-08 相当・ユニット版]",
    async () => {
      mockCreateAuthenticatedServerClient.mockResolvedValue(
        buildSupabaseMock({
          team_memberships: { single: { data: { id: "m-1", role: "user" }, error: null } },
        }),
      );

      const EntriesDataLoader = await loadEntriesDataLoader();

      await expect(
        EntriesDataLoader({ teamId: "team-1", competitionId: "comp-1" }),
      ).rejects.toThrow(RedirectSignal);
      expect(mockRedirect).toHaveBeenCalledWith("/teams/team-1?tab=competitions");
    },
  );

  it("チームメンバーシップが存在しない場合は notFound になる [V-09]", async () => {
    mockCreateAuthenticatedServerClient.mockResolvedValue(
      buildSupabaseMock({
        team_memberships: { single: { data: null, error: null } },
      }),
    );

    const EntriesDataLoader = await loadEntriesDataLoader();

    await expect(EntriesDataLoader({ teamId: "team-1", competitionId: "comp-1" })).rejects.toThrow(
      NotFoundSignal,
    );
  });

  it(
    "admin だが大会日が過去の場合は redirect される " +
      "（人間の意図: 仕様#6『大会日が過去なら不可。今日は可』のserver側ガード）",
    async () => {
      const pastDate = "2000-01-01"; // 十分に過去の固定日付
      mockCreateAuthenticatedServerClient.mockResolvedValue(
        buildSupabaseMock({
          team_memberships: { single: { data: { id: "m-1", role: "admin" }, error: null } },
          competitions: {
            single: {
              data: {
                id: "comp-1",
                user_id: "user-1",
                team_id: "team-1",
                title: "大会",
                date: pastDate,
                end_date: null,
                place: null,
                pool_type: 0,
                entry_status: "open",
                note: null,
                created_at: "2020-01-01T00:00:00Z",
                team: { id: "team-1", name: "チーム" },
              },
              error: null,
            },
          },
        }),
      );

      const EntriesDataLoader = await loadEntriesDataLoader();

      await expect(
        EntriesDataLoader({ teamId: "team-1", competitionId: "comp-1" }),
      ).rejects.toThrow(RedirectSignal);
      expect(mockRedirect).toHaveBeenCalledWith("/teams/team-1?tab=competitions");
    },
  );

  it(
    "admin かつ entry_status: 'closed' でも redirect されない " +
      "（人間の意図: 仕様#6『closedでも管理者は入力可（静的バナーのみ）』。" +
      "closedを理由にサーバー側で弾いてしまう過剰実装を検出する）",
    async () => {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
        today.getDate(),
      ).padStart(2, "0")}`;

      mockCreateAuthenticatedServerClient.mockResolvedValue(
        buildSupabaseMock({
          team_memberships: {
            single: { data: { id: "m-1", role: "admin" }, error: null },
            order: { data: [], error: null },
          },
          competitions: {
            single: {
              data: {
                id: "comp-1",
                user_id: "user-1",
                team_id: "team-1",
                title: "大会",
                date: todayStr,
                end_date: null,
                place: null,
                pool_type: 0,
                entry_status: "closed",
                note: null,
                created_at: "2020-01-01T00:00:00Z",
                team: { id: "team-1", name: "チーム" },
              },
              error: null,
            },
          },
          entries: { order: { data: [], error: null } },
          styles: { order: { data: [], error: null } },
        }),
      );

      const EntriesDataLoader = await loadEntriesDataLoader();
      const result = await EntriesDataLoader({ teamId: "team-1", competitionId: "comp-1" });

      expect(mockRedirect).not.toHaveBeenCalled();
      expect(mockNotFound).not.toHaveBeenCalled();
      expect(result).toBeTruthy();
    },
  );

  // V-10（非adminがAPI越しに他人のエントリーを作成→拒否）は
  // server loader (画面ガード) ではなく API 層の責務。
  // 重複実装を避けるため apps/shared/__tests__/api/entries.test.ts の
  // 「管理者権限を持たないユーザーが呼び出すとエラーになる」に検証を一本化する。
});
