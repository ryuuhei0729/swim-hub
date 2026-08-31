/**
 * teams/[teamId]/competitions/[competitionId]/records/_server/RecordDataLoader.tsx
 * — 管理者権限ガードの回帰テスト
 *
 * Sprint Contract (このスプリントの人間確定仕様には権限ガードの変更は含まれない):
 *   「エントリー行を初期値として反映する」機能を追加しても、既存の
 *   admin 限定ガード (非 admin は redirect / membership 無しは notFound) が
 *   後退しないことを保証する。Planner 実測 (RecordDataLoader.tsx:164-172) の
 *   裏取りを兼ねる。
 *
 * 実測パターンは `entryBulkAdminGuard.test.ts` (前スプリント、EntriesDataLoader 用) を
 * 踏襲する。server component (async 関数) を直接 await 呼び出しし、
 * next/navigation の redirect/notFound を「呼ばれたら例外を投げて描画を中断する」
 * 制御フロー関数として模倣する。
 *
 * 人間の意図: 今回の変更は「entries を6番目の並列クエリとして追加する」だけであり、
 * admin チェック自体のコード行 (:170) は触らない設計。もし Developer が entries 取得を
 * 追加する際にガード分岐の位置や条件式を誤って変更した場合、このテストで検出する。
 *
 * 🔴 追記 (2026-08-30, 項目3 実装完了に伴う修正): Web Developer が並行して項目3
 * (サーバー redirect() の locale 対応) を実装済みで、RecordDataLoader.tsx は既に
 * `redirect` を `@/i18n/navigation` から import している。この関数は最終的に
 * Next.js 本体の redirect() (next/dist/client/components/redirect.js) を呼ぶが、
 * `vi.mock("next/navigation", ...)` で用意した `redirect` モックは一切 intercept
 * されない (実測: モックした redirect ではなく本物の Next.js redirect が投げる
 * `Error { message: "NEXT_REDIRECT", digest: "NEXT_REDIRECT;replace;<url>;307;" }`
 * が観測された)。理由は RecordDataLoader.tsx 自身がもう "next/navigation" から
 * redirect を import していないため (@/i18n/navigation 経由になった) で、
 * vi.mock("next/navigation") 側の redirect モックを呼ぶ経路がそもそも無い。
 * そのため本ファイルは "next/navigation" の redirect モックを廃止し、Next.js が
 * 公式に提供するテスト用ヘルパー `getURLFromRedirectError` / `isRedirectError`
 * (next/dist/client/components/redirect, redirect-error) で本物の redirect() が
 * 投げたエラーから遷移先 URL を抽出して検証する方式に切り替えた。notFound は
 * 引き続き "next/navigation" から直接 import されている (next-intl は notFound を
 * ラップしない) ため、notFound のモックは変更していない。
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

// RecordClient (巨大な client component) は本テストの対象外。
// admin 正常系では「呼ばれたことそのもの」だけ確認できればよい。
vi.mock(
  "../../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/RecordClient",
  () => ({
    default: (props: unknown) => ({ type: "RecordClientMock", props }),
  }),
);

async function loadRecordDataLoader() {
  const mod = await import(
    "../../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_server/RecordDataLoader"
  );
  return mod.default;
}

type ChainResponse = { data: unknown; error: unknown };

/**
 * table 名ごとに single()/order() の終端レスポンスを個別に設定できる最小限の
 * supabase チェーンモック。RecordDataLoader は team_memberships を2回
 * (自分の権限確認用 .single() / メンバー一覧用 .order()) 別チェーンで呼ぶため、
 * table 名だけでは区別できない。
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

const validCompetitionRow = {
  id: "comp-1",
  user_id: "user-1",
  team_id: "team-1",
  title: "テスト大会",
  date: "2026-01-01",
  end_date: null,
  place: null,
  pool_type: 0,
  note: null,
  created_at: "2020-01-01T00:00:00Z",
  team: { id: "team-1", name: "チーム" },
};

describe("RecordDataLoader — 管理者権限ガード (既存挙動の回帰確認)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({ id: "user-1" });
    mockGetLocale.mockResolvedValue("ja");
  });

  it(
    "非 admin (role: 'user') がアクセスすると /ja/teams/{teamId}?tab=competitions へ redirect される " +
      "（人間の意図・項目3: redirect() は @/i18n/navigation 経由になり next-intl が locale を" +
      "先頭に付与する。locale が付いても /teams/ (非admin) と /teams-admin/ (admin専用) の" +
      "判別が維持されていることを toHaveBeenCalledWith の完全一致 + not.toHaveBeenCalledWith で" +
      "保証する。検出力を落とさない）",
    async () => {
      mockCreateAuthenticatedServerClient.mockResolvedValue(
        buildSupabaseMock({
          team_memberships: { single: { data: { id: "m-1", role: "user" }, error: null } },
        }),
      );

      const RecordDataLoader = await loadRecordDataLoader();

      const url = await captureRedirectUrl(() =>
        RecordDataLoader({ teamId: "team-1", competitionId: "comp-1" }),
      );
      expect(url).toBe("/ja/teams/team-1?tab=competitions");
      expect(url).not.toBe("/teams/team-1?tab=competitions");
      expect(url).not.toBe("/ja/teams-admin/team-1?tab=competitions");
    },
  );

  it(
    "🔴 locale が 'en' の場合は /en/teams/{teamId}?tab=competitions へ redirect される " +
      "（人間の意図: getLocale() の戻り値が実際に反映されることの確認。locale を" +
      "'ja' 決め打ちで実装すると本テストだけが赤くなり、上のテストとは別の観点で" +
      "検出できる）",
    async () => {
      mockGetLocale.mockResolvedValue("en");

      mockCreateAuthenticatedServerClient.mockResolvedValue(
        buildSupabaseMock({
          team_memberships: { single: { data: { id: "m-1", role: "user" }, error: null } },
        }),
      );

      const RecordDataLoader = await loadRecordDataLoader();

      const url = await captureRedirectUrl(() =>
        RecordDataLoader({ teamId: "team-1", competitionId: "comp-1" }),
      );
      expect(url).toBe("/en/teams/team-1?tab=competitions");
      expect(url).not.toBe("/ja/teams/team-1?tab=competitions");
    },
  );

  it("チームメンバーシップが存在しない場合は notFound になる", async () => {
    mockCreateAuthenticatedServerClient.mockResolvedValue(
      buildSupabaseMock({
        team_memberships: { single: { data: null, error: null } },
      }),
    );

    const RecordDataLoader = await loadRecordDataLoader();

    await expect(
      RecordDataLoader({ teamId: "team-1", competitionId: "comp-1" }),
    ).rejects.toThrow(NotFoundSignal);
  });

  it("大会が存在しない (もしくは team_id が一致しない) 場合は notFound になる", async () => {
    mockCreateAuthenticatedServerClient.mockResolvedValue(
      buildSupabaseMock({
        team_memberships: {
          single: { data: { id: "m-1", role: "admin" }, error: null },
          order: { data: [], error: null },
        },
        competitions: { single: { data: null, error: { message: "not found" } } },
        records: { order: { data: [], error: null } },
        styles: { order: { data: [], error: null } },
      }),
    );

    const RecordDataLoader = await loadRecordDataLoader();

    await expect(
      RecordDataLoader({ teamId: "team-1", competitionId: "comp-1" }),
    ).rejects.toThrow(NotFoundSignal);
  });

  it(
    "admin かつ大会が存在する場合は redirect も notFound もされず RecordClient に処理が渡る" +
      "（人間の意図: admin ガード自体の過剰検出が無いことの非退行確認。エントリー機能の" +
      "追加後もこの正常系が壊れていないことを Phase B で再実行して確認する）",
    async () => {
      mockCreateAuthenticatedServerClient.mockResolvedValue(
        buildSupabaseMock({
          team_memberships: {
            single: { data: { id: "m-1", role: "admin" }, error: null },
            order: { data: [], error: null },
          },
          competitions: { single: { data: validCompetitionRow, error: null } },
          records: { order: { data: [], error: null } },
          styles: { order: { data: [], error: null } },
        }),
      );

      const RecordDataLoader = await loadRecordDataLoader();
      // redirect() が呼ばれていれば NEXT_REDIRECT が投げられ await が reject するため、
      // 正常に result を受け取れたこと自体が「redirect されなかった」ことの証明になる。
      const result = await RecordDataLoader({ teamId: "team-1", competitionId: "comp-1" });

      expect(mockNotFound).not.toHaveBeenCalled();
      expect(result).toBeTruthy();
    },
  );

  it(
    "【Critical回帰・単一障害点の防止】entries の取得が失敗しても記録入力フォームは" +
      "開ける (notFound/redirect されず RecordClient に処理が渡り、entries は空配列に" +
      "フォールバックする)（人間の意図: entries はエントリー初期反映・参考ラベル表示のための" +
      "補助データに過ぎない。この機能追加前は記録入力画面が依存していなかった entries の" +
      "取得失敗が、画面全体を落とす新たな単一障害点になってはならない。mobile 側で" +
      "実際に `throw entriesRes.error` により記録入力に進めなくなる Critical が" +
      "発生した前例があるため、web 側でも同じ回帰が起きないことをここで固定する)",
    async () => {
      mockCreateAuthenticatedServerClient.mockResolvedValue(
        buildSupabaseMock({
          team_memberships: {
            single: { data: { id: "m-1", role: "admin" }, error: null },
            order: { data: [], error: null },
          },
          competitions: { single: { data: validCompetitionRow, error: null } },
          records: {
            order: {
              data: [
                {
                  id: "record-1",
                  user_id: "user-1",
                  style_id: 2,
                  time: 30.0,
                  video_path: null,
                  note: null,
                  is_relaying: false,
                  reaction_time: null,
                  pool_type: null,
                  team_id: "team-1",
                  split_times: [],
                  users: { id: "user-1", name: "太郎" },
                  styles: { id: 2, name_jp: "自由形50m", distance: 50 },
                },
              ],
              error: null,
            },
          },
          styles: { order: { data: [], error: null } },
          // entries の取得自体が失敗する (RLS エラー・ネットワークエラー等を想定)
          entries: {
            order: { data: null, error: { message: "entries fetch failed" } },
          },
        }),
      );

      const RecordDataLoader = await loadRecordDataLoader();
      const result = (await RecordDataLoader({
        teamId: "team-1",
        competitionId: "comp-1",
      })) as { props: { entries: unknown[]; existingRecords: unknown[] } };

      // redirect/notFound されず、記録入力フォーム (RecordClientMock) に処理が渡る
      // (redirect() が呼ばれていれば NEXT_REDIRECT で await が reject するため、
      // 正常に result を受け取れたこと自体が redirect されなかった証明)
      expect(mockNotFound).not.toHaveBeenCalled();
      expect(result).toBeTruthy();

      // entries は空配列にフォールバックする (初期反映は諦めるが画面は落とさない)
      expect(result.props.entries).toEqual([]);
      // 既存記録は entries の失敗に影響されず、そのまま RecordClient に渡る
      // (=既存記録の入力・編集は続行できる)
      expect(result.props.existingRecords).toHaveLength(1);
    },
  );
});
