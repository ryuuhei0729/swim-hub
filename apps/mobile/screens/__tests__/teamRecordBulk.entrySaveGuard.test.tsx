// =============================================================================
// teamRecordBulk.entrySaveGuard.test.tsx
// =============================================================================
//
// Sprint Contract 検証観点 (このスプリントの前提となる既存挙動の回帰確認):
//   [仕様#3] 棄権・欠場した選手の行は、タイム未入力のまま保存すればその行は
//     登録されない (既存の `shouldSave = mr.time > 0` の挙動。
//     TeamRecordBulkFormScreen.tsx:760-763)
//   [仕様#2 前提] リレーとして検出された種目グループ (buildStyleEntries.ts の
//     Phase1/2 が is_relaying 4件連続パターンで検出) は1つの StyleEntry に
//     まとまり、4レグ構造のまま保存される。エントリー行マージ機能がこの構造を
//     壊さないことを保証する土台として、マージ前の現状の構造を固定する。
//
// トートロジー防止メモ: 「shouldSave の式をコピーして正しいと確認する」のではなく、
// 実際にコンポーネントを render → 保存ボタン押下 → supabase.from("records").insert()
// に渡された **実際のペイロード件数と user_id** を検証する (TeamRecordBulkFormScreen.
// invalidate.test.tsx と同じ実測方式)。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  const responses: Record<string, { data: unknown; error: unknown }> = {};
  const insertCalls: Array<{ table: string; payload: unknown }> = [];

  function makeSupabase() {
    return {
      from: (table: string) => {
        let op: string | null = null;
        const builder: {
          select: (..._a: unknown[]) => typeof builder;
          eq: (..._a: unknown[]) => typeof builder;
          order: (..._a: unknown[]) => typeof builder;
          in: (..._a: unknown[]) => typeof builder;
          insert: (payload: unknown) => typeof builder;
          delete: (..._a: unknown[]) => typeof builder;
          single: () => Promise<{ data: unknown; error: unknown }>;
          then: (resolve: (v: { data: unknown; error: unknown }) => void) => void;
        } = {
          select: (..._a) => {
            if (!op) op = "select";
            return builder;
          },
          eq: () => builder,
          order: () => builder,
          in: () => builder,
          insert: (payload: unknown) => {
            if (!op) op = "insert";
            insertCalls.push({ table, payload });
            return builder;
          },
          delete: (..._a) => {
            if (!op) op = "delete";
            return builder;
          },
          single: () =>
            Promise.resolve(
              op === "insert" && table === "records"
                ? { data: { id: `new-record-${insertCalls.length}` }, error: null }
                : (responses[`${op}:${table}`] ?? { data: null, error: null }),
            ),
          then: (resolve) => resolve(responses[`${op}:${table}`] ?? { data: null, error: null }),
        };
        return builder;
      },
    };
  }

  const teamMembers: Array<{ user_id: string; role: string; users: { id: string; name: string } }> =
    [{ user_id: "user-1", role: "admin", users: { id: "user-1", name: "太郎" } }];

  return {
    style,
    responses,
    insertCalls,
    teamMembers,
    supabase: makeSupabase(),
    routeParams: { competitionId: "comp-1", teamId: "team-1" },
    goBack: vi.fn(),
    navigate: vi.fn(),
    getStyles: vi.fn(),
    getAccessToken: vi.fn(async () => "test-access-token"),
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
  useTeamsQuery: () => ({
    members: mocks.teamMembers,
    isLoading: false,
  }),
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

describe("TeamRecordBulkFormScreen — 空タイム行は保存されない (仕様#3の回帰確認)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertCalls.length = 0;
    mocks.getStyles.mockResolvedValue([mocks.style]);
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
    mocks.responses["delete:records"] = { data: null, error: null };
  });

  it(
    "同一種目に2名の既存行があり、1名だけタイムが入っておりもう1名が time=0 の状態で保存すると、" +
      "records への insert は1回だけ発生し、未入力だった選手の user_id は含まれない" +
      "（人間の意図: 棄権・欠場した選手の行を空のまま保存しても記録が作られてはならない。" +
      "この防波堤は entries から補完される新規行にも同様に適用されるべき）",
    async () => {
      mocks.responses["select:records"] = {
        data: [
          {
            id: "record-1",
            user_id: "user-1",
            style_id: 2,
            time: 30.5,
            is_relaying: false,
            reaction_time: null,
            note: null,
            split_times: [],
            users: { id: "user-1", name: "太郎" },
          },
          {
            id: "record-2",
            user_id: "user-2",
            style_id: 2,
            time: 0,
            is_relaying: false,
            reaction_time: null,
            note: null,
            split_times: [],
            users: { id: "user-2", name: "次郎" },
          },
        ],
        error: null,
      };

      const queryClient = makeQueryClient();
      render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => {
        expect(screen.getByText("記録を保存")).toBeDefined();
      });
      fireEvent.click(screen.getByText("記録を保存"));

      await waitFor(() => {
        expect(mocks.goBack).toHaveBeenCalled();
      });

      const recordInserts = mocks.insertCalls.filter((c) => c.table === "records");
      expect(recordInserts).toHaveLength(1);
      const insertedUserIds = recordInserts.map((c) => (c.payload as { user_id: string }).user_id);
      expect(insertedUserIds).toEqual(["user-1"]);
      expect(insertedUserIds).not.toContain("user-2");
    },
  );
});

describe("TeamRecordBulkFormScreen — リレー検出された StyleEntry の構造保持 (仕様#2 前提の回帰確認)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertCalls.length = 0;
    mocks.getStyles.mockResolvedValue([mocks.style]);
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
    mocks.responses["delete:records"] = { data: null, error: null };
  });

  it(
    "is_relaying=[false,true,true,true] の4件連続レコードが1つの種目カードにまとまり、" +
      "保存すると records への insert が4件発生する (1件に潰れたり分裂して欠落しない)" +
      "（人間の意図: リレー検出された StyleEntry に将来のエントリーマージ機能が触れては" +
      "ならない、という仕様の前提となる現状の4レグ保存構造を固定する）",
    async () => {
      mocks.responses["select:records"] = {
        data: [
          { time: 27.5, is_relaying: false, user_id: "user-0" },
          { time: 28.7, is_relaying: true, user_id: "user-1" },
          { time: 28.3, is_relaying: true, user_id: "user-2" },
          { time: 27.6, is_relaying: true, user_id: "user-3" },
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

      const queryClient = makeQueryClient();
      render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => {
        expect(screen.getByText("記録を保存")).toBeDefined();
      });
      fireEvent.click(screen.getByText("記録を保存"));

      await waitFor(() => {
        expect(mocks.goBack).toHaveBeenCalled();
      });

      const recordInserts = mocks.insertCalls.filter((c) => c.table === "records");
      expect(recordInserts).toHaveLength(4);
    },
  );
});

describe("TeamRecordBulkFormScreen — 非 admin の権限ガード (既存挙動の回帰確認)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertCalls.length = 0;
    mocks.getStyles.mockResolvedValue([mocks.style]);
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
    mocks.responses["select:records"] = { data: [], error: null };
    mocks.responses["delete:records"] = { data: null, error: null };
  });

  it(
    "role: 'user' (非admin) の場合、記録保存フォームは表示されず保存ボタンも存在しない" +
      "（人間の意図: この機能はエントリー行の初期反映だけを追加するものであり、" +
      "既存の isCurrentUserAdmin による client 側ガードを後退させてはならない）",
    async () => {
      mocks.teamMembers.length = 0;
      mocks.teamMembers.push({ user_id: "user-1", role: "user", users: { id: "user-1", name: "太郎" } });

      const queryClient = makeQueryClient();
      render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => {
        expect(screen.getByText("大会一覧に戻る")).toBeDefined();
      });
      expect(screen.queryByText("記録を保存")).toBeNull();
    },
  );
});
