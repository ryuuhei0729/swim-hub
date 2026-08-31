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
 *
 * 🔴 追記 (2026-08-30, 項目3 実装完了に伴う修正): Web Developer が並行して項目3
 * (サーバー redirect() の locale 対応) を実装済みで、PracticeLogDataLoader.tsx は
 * 既に `redirect` を `@/i18n/navigation` から import している。この関数は最終的に
 * Next.js 本体の redirect() を呼ぶが、`vi.mock("next/navigation", ...)` で用意した
 * `redirect` モックは一切 intercept されない (実測: 本物の Next.js redirect が投げる
 * `Error { message: "NEXT_REDIRECT", digest: "NEXT_REDIRECT;replace;<url>;307;" }`
 * が観測された。PracticeLogDataLoader.tsx 自身がもう "next/navigation" から redirect
 * を import していないため)。そのため本ファイルは "next/navigation" の redirect
 * モックを廃止し、Next.js が公式に提供するテスト用ヘルパー `getURLFromRedirectError` /
 * `isRedirectError` (next/dist/client/components/redirect, redirect-error) で本物の
 * redirect() が投げたエラーから遷移先 URL を抽出して検証する方式に切り替えた。
 * notFound は引き続き "next/navigation" から直接 import されているため変更していない。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getURLFromRedirectError } from "next/dist/client/components/redirect";
import { isRedirectError } from "next/dist/client/components/redirect-error";

const mockGetServerUser = vi.fn();
const mockCreateAuthenticatedServerClient = vi.fn();
// beforeEach で "ja" に戻す。locale を可変にすることで getLocale() の戻り値が
// そのまま redirect() に反映されることを検証できる (locale決め打ち実装の検出用)。
const mockGetLocale = vi.fn().mockResolvedValue("ja");

vi.mock("@/lib/supabase-server-auth", () => ({
  createAuthenticatedServerClient: mockCreateAuthenticatedServerClient,
}));
vi.mock("@/lib/supabase-server", () => ({
  getServerUser: mockGetServerUser,
}));

// V-5 (Phase A 実測): このモックが無い状態で PracticeLogDataLoader.tsx に
// getLocale() を追加すると、実物の next-intl/server#getLocale が呼ばれ
// 「`getLocale` is not supported in Client Components.」という原因不明の
// エラーで4件全部が落ちることを実測済み (recordAdminGuard.test.ts /
// entryBulkAdminGuard.test.ts には既にこのモックがあり、この2本は無症状だった)。
// 項目3 (サーバー redirect() の locale 対応) で本ファイルが redirect の
// import を `@/i18n/navigation` に切り替え getLocale() を新規追加する際、
// このモックが欠けたままだと同じ壊れ方をする。将来の回帰を検出するため
// 恒久的に追加しておく。
vi.mock("next-intl/server", () => ({
  getLocale: mockGetLocale,
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
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
    mockGetLocale.mockResolvedValue("ja");
  });

  it(
    "非 admin (role: 'user') がアクセスすると /ja/teams/{teamId}?tab=practices へ redirect される " +
      "（人間の意図: この分岐は方式Eの変更対象7箇所に含まれない。/teams-admin/ に" +
      "書き換えてしまうと非adminが管理者専用ルートへ送られ404になる退行を生むため、" +
      "現状のまま固定する。項目3で redirect() が @/i18n/navigation 経由になり locale prefix が" +
      "付与されても /teams/ と /teams-admin/ の判別が維持されることを完全一致 + " +
      "not.toHaveBeenCalledWith で保証する)",
    async () => {
      mockCreateAuthenticatedServerClient.mockResolvedValue(
        buildSupabaseMock({
          team_memberships: { single: { data: { id: "m-1", role: "user" }, error: null } },
        }),
      );

      const PracticeLogDataLoader = await loadPracticeLogDataLoader();

      const url = await captureRedirectUrl(() =>
        PracticeLogDataLoader({ teamId: "team-1", practiceId: "practice-1" }),
      );
      expect(url).toBe("/ja/teams/team-1?tab=practices");
      expect(url).not.toBe("/teams/team-1?tab=practices");
      expect(url).not.toBe("/ja/teams-admin/team-1?tab=practices");
      expect(url).not.toBe("/teams-admin/team-1?tab=practices");
    },
  );

  it(
    "🔴 locale が 'en' の場合は /en/teams/{teamId}?tab=practices へ redirect される " +
      "（getLocale() の戻り値が実際に反映されることの確認。'ja' 決め打ち実装の検出）",
    async () => {
      mockGetLocale.mockResolvedValue("en");
      mockCreateAuthenticatedServerClient.mockResolvedValue(
        buildSupabaseMock({
          team_memberships: { single: { data: { id: "m-1", role: "user" }, error: null } },
        }),
      );

      const PracticeLogDataLoader = await loadPracticeLogDataLoader();

      const url = await captureRedirectUrl(() =>
        PracticeLogDataLoader({ teamId: "team-1", practiceId: "practice-1" }),
      );
      expect(url).toBe("/en/teams/team-1?tab=practices");
      expect(url).not.toBe("/ja/teams/team-1?tab=practices");
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
      // redirect() が呼ばれていれば NEXT_REDIRECT で await が reject するため、
      // 正常に result を受け取れたこと自体が redirect されなかった証明になる。
      const result = await PracticeLogDataLoader({ teamId: "team-1", practiceId: "practice-1" });

      expect(mockNotFound).not.toHaveBeenCalled();
      expect(result).toBeTruthy();
    },
  );
});
