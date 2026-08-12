// =============================================================================
// teamRecordBulk.entryPrefill.test.tsx
// =============================================================================
//
// Sprint Contract 検証観点 (mobile 側の受け入れテスト):
//   [仕様#1・最重要] entries.entry_time は記録タイムの入力欄には入れず、行の脇に
//     読み取り専用の参考ラベル (forms.recordLog.entryTimeLabel) としてのみ表示する。
//   [仕様#2] 既存記録を優先し、不足分だけエントリーから追加する。(user_id, style_id) の
//     組で重複排除する。リレー検出済みの StyleEntry には一切触れない。
//
// web 側の recordEntryPrefill.test.tsx (apps/web/__tests__/records/) と対になる
// mobile 版。実装は TeamRecordBulkFormScreen.tsx が
// `planEntryAdditionsForRecords` (shared) + `applyEntryAdditionsToStyleEntries`
// (mobile ローカル、web からの移植) を経由する。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react-native");
  return {
    ...actual,
    KeyboardAvoidingView: actual.View,
  };
});

const mocks = vi.hoisted(() => {
  const style = {
    id: 2,
    name_jp: "50m自由形",
    name: "50m Freestyle",
    style: "Fr",
    distance: 50,
  };
  const styleBreast = {
    id: 9,
    name_jp: "50m平泳ぎ",
    name: "50m Breaststroke",
    style: "Br",
    distance: 50,
  };

  const responses: Record<string, { data: unknown; error: unknown }> = {};

  function makeSupabase() {
    return {
      from: (table: string) => {
        let op: string | null = null;
        const builder: Record<string, unknown> = {
          select: (..._a: unknown[]) => {
            if (!op) op = "select";
            return builder;
          },
          eq: () => builder,
          order: () => builder,
          single: () => Promise.resolve(responses[`${op}:${table}`] ?? { data: null, error: null }),
          then: (resolve: (v: { data: unknown; error: unknown }) => void) =>
            resolve(responses[`${op}:${table}`] ?? { data: null, error: null }),
        };
        return builder;
      },
    };
  }

  return {
    style,
    styleBreast,
    responses,
    supabase: makeSupabase(),
    routeParams: { competitionId: "comp-1", teamId: "team-1" },
    goBack: vi.fn(),
    navigate: vi.fn(),
    getStyles: vi.fn(),
    getAccessToken: vi.fn(async () => "test-access-token"),
    teamMembers: [
      { user_id: "user-1", role: "admin", users: { id: "user-1", name: "太郎" } },
      { user_id: "user-2", role: "user", users: { id: "user-2", name: "次郎" } },
    ] as Array<{ user_id: string; role: string; users: { id: string; name: string } }>,
  };
});

vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mocks.routeParams }),
  useNavigation: () => ({ navigate: mocks.navigate, goBack: mocks.goBack }),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: mocks.supabase,
    subscription: null,
    user: { id: "user-1" },
    getAccessToken: mocks.getAccessToken,
  }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({ members: mocks.teamMembers, isLoading: false }),
}));

vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: class {
    getStyles = mocks.getStyles;
  },
}));

vi.mock("@/components/shared/VideoUploader", () => ({ VideoUploader: () => null }));
vi.mock("@/components/shared/PremiumBadge", () => ({ PremiumBadge: () => null }));
vi.mock("@/components/records/LapTimeDisplay", () => ({ LapTimeDisplay: () => null }));
vi.mock("@/components/teams/MemberSelectModal", () => ({ MemberSelectModal: () => null }));

import { TeamRecordBulkFormScreen } from "../TeamRecordBulkFormScreen";

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

describe("TeamRecordBulkFormScreen — エントリー行の初期反映 (仕様#1・仕様#2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStyles.mockResolvedValue([mocks.style, mocks.styleBreast]);
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
    mocks.responses["select:records"] = { data: [], error: null };
    mocks.teamMembers.length = 0;
    mocks.teamMembers.push(
      { user_id: "user-1", role: "admin", users: { id: "user-1", name: "太郎" } },
      { user_id: "user-2", role: "user", users: { id: "user-2", name: "次郎" } },
    );
  });

  it(
    "既存記録が無い大会でエントリーが1件あると、参考ラベル (forms.recordLog.entryTimeLabel) が" +
      "表示される一方、タイム入力欄 (placeholder: 例: 1:30.50) は空欄のまま初期表示される" +
      "（人間の意図: entries.entry_time を記録タイム入力欄に紛れ込ませない、という" +
      "最重要契約の mobile 側確認）",
    async () => {
      mocks.responses["select:entries"] = {
        data: [
          { id: "entry-1", user_id: "user-1", style_id: 2, entry_time: 83.45, note: null, users: { id: "user-1", name: "太郎" } },
        ],
        error: null,
      };

      const queryClient = makeQueryClient();
      render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      // 参考ラベルが表示される (実際の i18n 文言 + フォーマット済みタイム)。
      // ラベルと値は別々の Text ノードとして描画されるため body 全体のテキストで照合する
      // (祖先要素をすべて辿ると複数要素が条件を満たし getByText が一意に決まらないため)
      await waitFor(() => {
        expect(document.body.textContent).toMatch(/エントリータイム:/);
        expect(document.body.textContent).toMatch(/1:23\.45/);
      });

      // タイム入力欄は空欄のまま (entry_time がそのまま入力値になっていない)
      const timeInput = screen.getByPlaceholderText("例: 1:30.50") as HTMLInputElement;
      expect(timeInput.value).toBe("");
    },
  );

  it(
    "既存記録がある (user_id, style_id) の組には、同じ組のエントリーがあっても行が" +
      "重複追加されない一方、記録の無い組は不足分として追加される (仕様#2)",
    async () => {
      mocks.responses["select:records"] = {
        data: [
          {
            id: "record-1",
            user_id: "user-1",
            style_id: 2,
            time: 27.5,
            is_relaying: false,
            reaction_time: null,
            note: null,
            split_times: [],
            users: { id: "user-1", name: "太郎" },
          },
        ],
        error: null,
      };
      mocks.responses["select:entries"] = {
        data: [
          // user-1 は既に記録あり → 追加されない
          { id: "entry-1", user_id: "user-1", style_id: 2, entry_time: 83.45, note: null, users: { id: "user-1", name: "太郎" } },
          // user-2 は記録なし → 不足分として追加される
          { id: "entry-2", user_id: "user-2", style_id: 2, entry_time: 90.0, note: null, users: { id: "user-2", name: "次郎" } },
        ],
        error: null,
      };

      const queryClient = makeQueryClient();
      render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      const timeInputs = (await screen.findAllByPlaceholderText(
        "例: 1:30.50",
      )) as HTMLInputElement[];
      // 太郎(既存, タイム保持) + 次郎(エントリー由来, 未入力) の2件
      expect(timeInputs).toHaveLength(2);
      const values = timeInputs.map((el) => el.value);
      expect(values).toContain("27.50");
      expect(values).toContain("");
    },
  );

  it(
    "【PM確定仕様 2026-08-12 修正3・web/mobile パリティ確認 (2026-08-12着地確認済み)】" +
      "既存記録由来の行であっても、(user_id, style_id) に一致するエントリーがあれば" +
      "参考ラベルが表示される (人間の意図: 前スプリントで web と mobile の挙動が" +
      "分岐して Critical になった前例があるため、web 側の recordEntryPrefill.test.tsx の" +
      "同名テストと assertion の形を揃えて固定する。mobile の stampExistingEntryTimeReferences " +
      "[buildStyleEntries.ts] が web と完全一致することを PM が diff で確認済み)",
    async () => {
      mocks.responses["select:records"] = {
        data: [
          {
            id: "record-1",
            user_id: "user-1",
            style_id: 2,
            time: 27.5,
            is_relaying: false,
            reaction_time: null,
            note: null,
            split_times: [],
            users: { id: "user-1", name: "太郎" },
          },
        ],
        error: null,
      };
      mocks.responses["select:entries"] = {
        data: [
          { id: "entry-1", user_id: "user-1", style_id: 2, entry_time: 83.45, note: null, users: { id: "user-1", name: "太郎" } },
        ],
        error: null,
      };

      const queryClient = makeQueryClient();
      render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      // 既存記録の行 (太郎, time=27.5) にもエントリーの参考ラベルが付く
      await waitFor(() => {
        expect(document.body.textContent).toMatch(/エントリータイム:/);
        expect(document.body.textContent).toMatch(/1:23\.45/);
      });

      // タイム入力値そのものは既存の結果タイムのまま (参考ラベルの追加が入力値を上書きしない)
      const timeInput = screen.getByPlaceholderText("例: 1:30.50") as HTMLInputElement;
      expect(timeInput.value).toBe("27.50");
    },
  );

  it(
    "リレー検出済みの StyleEntry と別種目のエントリーが同時にあっても、リレーカードの" +
      "泳者選択 (4名) は変化せず、エントリー由来行は別カードとして追加される" +
      "(仕様#2 リレー不可侵)",
    async () => {
      mocks.responses["select:records"] = {
        data: [
          { time: 27.5, is_relaying: false, user_id: "user-a" },
          { time: 28.7, is_relaying: true, user_id: "user-b" },
          { time: 28.3, is_relaying: true, user_id: "user-c" },
          { time: 27.6, is_relaying: true, user_id: "user-d" },
        ].map((r, idx) => ({
          id: `relay-record-${idx}`,
          user_id: r.user_id,
          style_id: 2,
          time: r.time,
          is_relaying: r.is_relaying,
          reaction_time: null,
          note: null,
          split_times: [],
          users: { id: r.user_id, name: `選手${idx}` },
        })),
        error: null,
      };
      mocks.responses["select:entries"] = {
        data: [
          { id: "entry-1", user_id: "user-2", style_id: 9, entry_time: 45.0, note: null, users: { id: "user-2", name: "次郎" } },
        ],
        error: null,
      };
      const queryClient = makeQueryClient();
      render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      // リレーカードの4名の泳者選択 (mobile はネイティブ select ではなく Pressable +
      // モーダルのピッカーボタンに選択中の氏名を表示する) がそのまま残っている
      await waitFor(() => {
        expect(screen.getByText("選手0")).toBeDefined();
        expect(screen.getByText("選手1")).toBeDefined();
        expect(screen.getByText("選手2")).toBeDefined();
        expect(screen.getByText("選手3")).toBeDefined();
      });

      // 平泳ぎのエントリー由来行が別カードとして追加され、未入力のまま
      const timeInputs = screen.getAllByPlaceholderText(
        "例: 1:30.50",
      ) as HTMLInputElement[];
      expect(timeInputs).toHaveLength(1);
      expect(timeInputs[0].value).toBe("");
    },
  );
});
