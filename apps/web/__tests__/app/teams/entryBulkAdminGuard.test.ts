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
 *
 * 🔴 追記 (2026-08-30, 項目3 実装完了に伴う修正): Web Developer が並行して項目3
 * (サーバー redirect() の locale 対応) を実装済みで、EntriesDataLoader.tsx は既に
 * `redirect` を `@/i18n/navigation` から import している。この関数は最終的に
 * Next.js 本体の redirect() を呼ぶが、`vi.mock("next/navigation", ...)` で用意した
 * `redirect` モックは一切 intercept されない (実測: 本物の Next.js redirect が投げる
 * `Error { message: "NEXT_REDIRECT", digest: "NEXT_REDIRECT;replace;<url>;307;" }`
 * が観測された。EntriesDataLoader.tsx 自身がもう "next/navigation" から redirect を
 * import していないため)。そのため本ファイルは "next/navigation" の redirect モックを
 * 廃止し、Next.js が公式に提供するテスト用ヘルパー `getURLFromRedirectError` /
 * `isRedirectError` (next/dist/client/components/redirect, redirect-error) で本物の
 * redirect() が投げたエラーから遷移先 URL を抽出して検証する方式に切り替えた。
 * notFound は引き続き "next/navigation" から直接 import されているため変更していない。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getURLFromRedirectError } from "next/dist/client/components/redirect";
import { isRedirectError } from "next/dist/client/components/redirect-error";

const mockGetServerUser = vi.fn();
const mockCreateAuthenticatedServerClient = vi.fn();
const mockGetBestTimesForUsers = vi.fn();
// beforeEach で "ja" に戻す。locale を可変にすることで getLocale() の戻り値が
// そのまま redirect() に反映されることを検証できる (locale決め打ち実装の検出用)。
const mockGetLocale = vi.fn().mockResolvedValue("ja");

vi.mock("@/lib/supabase-server-auth", () => ({
  getServerUser: mockGetServerUser,
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

class NotFoundSignal extends Error {
  constructor() {
    super("NOT_FOUND");
  }
}

const mockNotFound = vi.fn(() => {
  throw new NotFoundSignal();
});

vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
}));

/** 本物の redirect() が投げたエラーから遷移先 URL を抽出する (Next.js公式ヘルパー経由) */
async function captureRedirectUrl(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (!isRedirectError(error)) {
      throw error;
    }
    const url = getURLFromRedirectError(error);
    if (url === null) {
      throw new Error("getURLFromRedirectError returned null (not a redirect error?)");
    }
    return url;
  }
  throw new Error("redirect() が呼ばれず、正常にコンポーネントが返った (期待に反する)");
}

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
    mockGetLocale.mockResolvedValue("ja");
  });

  it(
    "非 admin (role: 'user') のメンバーがアクセスすると " +
      "/ja/teams/{teamId}?tab=competitions へ redirect される [V-08 相当・ユニット版] " +
      "（人間の意図・項目3: redirect() が @/i18n/navigation 経由になり locale prefix が" +
      "付与されても /teams/ (非admin) と /teams-admin/ (admin過去日弾き) の判別が" +
      "維持されることを完全一致 + not.toHaveBeenCalledWith で保証する）",
    async () => {
      mockCreateAuthenticatedServerClient.mockResolvedValue(
        buildSupabaseMock({
          team_memberships: { single: { data: { id: "m-1", role: "user" }, error: null } },
        }),
      );

      const EntriesDataLoader = await loadEntriesDataLoader();

      const url = await captureRedirectUrl(() =>
        EntriesDataLoader({ teamId: "team-1", competitionId: "comp-1" }),
      );
      expect(url).toBe("/ja/teams/team-1?tab=competitions");
      expect(url).not.toBe("/teams/team-1?tab=competitions");
      expect(url).not.toBe("/ja/teams-admin/team-1?tab=competitions");
    },
  );

  it(
    "🔴 locale が 'en' の場合、非 admin の redirect 先は /en/teams/{teamId}?tab=competitions " +
      "（getLocale() の戻り値が実際に反映されることの確認。'ja' 決め打ち実装の検出）",
    async () => {
      mockGetLocale.mockResolvedValue("en");
      mockCreateAuthenticatedServerClient.mockResolvedValue(
        buildSupabaseMock({
          team_memberships: { single: { data: { id: "m-1", role: "user" }, error: null } },
        }),
      );

      const EntriesDataLoader = await loadEntriesDataLoader();

      const url = await captureRedirectUrl(() =>
        EntriesDataLoader({ teamId: "team-1", competitionId: "comp-1" }),
      );
      expect(url).toBe("/en/teams/team-1?tab=competitions");
      expect(url).not.toBe("/ja/teams/team-1?tab=competitions");
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
    "admin だが大会日が過去の場合は /ja/teams-admin/team-1?tab=competitions へ redirect される " +
      "（人間の意図: 仕様#6『大会日が過去なら不可。今日は可』のserver側ガード。" +
      "方式E [2026-08-25確定]: この過去日ガードは role !== 'admin' チェック [:148, 変更禁止] " +
      "を通過した *admin 確定後* の弾き出しであり、role ガードとは異なり戻り先は " +
      "/teams-admin/ に固定してよい。role ガード自体 [非admin用の /teams/] とこの過去日ガード " +
      "[admin用の /teams-admin/] を同じ文字列と誤って混同していないかを区別するテスト。" +
      "項目3で locale prefix が付いても /teams-admin/ と /teams/ の判別を維持する)",
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

      const url = await captureRedirectUrl(() =>
        EntriesDataLoader({ teamId: "team-1", competitionId: "comp-1" }),
      );
      // 方式E: 過去日ガードは admin 確定後の弾き出しなので teams-admin/ に固定する
      // (role !== "admin" ガード [:140 の別テスト] とは異なる文字列になることを明示的に区別する)
      expect(url).toBe("/ja/teams-admin/team-1?tab=competitions");
      expect(url).not.toBe("/teams-admin/team-1?tab=competitions");
      expect(url).not.toBe("/ja/teams/team-1?tab=competitions");
      expect(url).not.toBe("/teams/team-1?tab=competitions");
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
      // redirect() が呼ばれていれば NEXT_REDIRECT で await が reject するため、
      // 正常に result を受け取れたこと自体が redirect されなかった証明になる。
      const result = await EntriesDataLoader({ teamId: "team-1", competitionId: "comp-1" });

      expect(mockNotFound).not.toHaveBeenCalled();
      expect(result).toBeTruthy();
    },
  );

  // V-10（非adminがAPI越しに他人のエントリーを作成→拒否）は
  // server loader (画面ガード) ではなく API 層の責務。
  // 重複実装を避けるため apps/shared/__tests__/api/entries.test.ts の
  // 「管理者権限を持たないユーザーが呼び出すとエラーになる」に検証を一本化する。
});
