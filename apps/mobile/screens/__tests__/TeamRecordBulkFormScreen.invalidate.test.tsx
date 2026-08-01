// =============================================================================
// TeamRecordBulkFormScreen.invalidate.test.tsx
// =============================================================================
//
// Sprint Contract 検証観点 (B-2 の姉妹バグ):
//   チーム一括登録 (TeamRecordBulkFormScreen) の保存後 invalidate は
//   ["calendar"] と teamKeys.competitions(teamId) のみで、recordKeys.lists() が
//   欠落している。姉妹画面 TeamPracticeLogBulkFormScreen.tsx は practiceKeys.lists() を
//   正しく invalidate しており、これは非対称バグ (同一クラスの欠陥)。
//   → 対象メンバーの記録一覧 (大会タブ) キャッシュが最新化されない (V-03)。
//
// トートロジー防止メモ: 「invalidateQueries が呼ばれること」ではなく
// 「recordKeys.lists() 配下のキーが invalidate 対象に含まれること」を実際の
// QueryClient 経由で検証する。修正前のコードではこのテストは FAIL する。
//
// 実装上の注意: この画面は supabase.from(...) を直接叩く (shared API 経由ではない) ため、
// チェーン可能かつ thenable な最小限の supabase フェイクを用意する。
// 既存レコードを1件 (split_times 無し・非リレー) 用意し、buildStyleEntriesFromExisting
// (実装済みの純粋関数) が time>0 の memberRecord を再構築することを利用して、
// UI 操作 (種目/メンバー選択) なしで即座に保存可能な状態を作る
// (この画面のフルインタラクションE2Eは実機/Playwright 側で別途行う)。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { recordKeys, teamKeys } from "@apps/shared/hooks/queries/keys";

// react-native の静的モックには KeyboardAvoidingView が含まれないため、
// この画面専用に補完する (RecordFormScreen.standalone.test.tsx と同じ方針。
// 共有モック __mocks__/react-native.ts 自体は変更しない)
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

  const existingRecord = {
    id: "record-1",
    user_id: "user-1",
    style_id: 2,
    time: 30.5,
    is_relaying: false,
    reaction_time: null,
    note: null,
    split_times: [] as { id: string; distance: number; split_time: number }[],
    users: { id: "user-1", name: "太郎" },
  };

  // supabase.from(table)...の呼び出しシーケンス (select/insert/delete) ごとにレスポンスを
  // 切り替えられる最小のチェーン可能 + thenable フェイク。
  const responses: Record<string, { data: unknown; error: unknown }> = {};

  function makeSupabase() {
    return {
      from: (table: string) => {
        let op: string | null = null;
        const builder: {
          select: (..._a: unknown[]) => typeof builder;
          eq: (..._a: unknown[]) => typeof builder;
          order: (..._a: unknown[]) => typeof builder;
          in: (..._a: unknown[]) => typeof builder;
          insert: (..._a: unknown[]) => typeof builder;
          delete: (..._a: unknown[]) => typeof builder;
          single: () => Promise<{ data: unknown; error: unknown }>;
          then: (
            resolve: (v: { data: unknown; error: unknown }) => void,
          ) => void;
        } = {
          select: (..._a) => {
            if (!op) op = "select";
            return builder;
          },
          eq: () => builder,
          order: () => builder,
          in: () => builder,
          insert: (..._a) => {
            if (!op) op = "insert";
            return builder;
          },
          delete: (..._a) => {
            if (!op) op = "delete";
            return builder;
          },
          single: () =>
            Promise.resolve(responses[`${op}:${table}`] ?? { data: null, error: null }),
          then: (resolve) => resolve(responses[`${op}:${table}`] ?? { data: null, error: null }),
        };
        return builder;
      },
    };
  }

  return {
    style,
    existingRecord,
    responses,
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
    subscription: null, // isPremium=false -> 代理動画アップロード分岐は通らない
    user: { id: "user-1" },
    getAccessToken: mocks.getAccessToken,
  }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({
    members: [{ user_id: "user-1", role: "admin", users: { id: "user-1", name: "太郎" } }],
    isLoading: false,
  }),
}));

vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: class {
    getStyles = mocks.getStyles;
  },
}));

// 本テストの検証対象外の重量コンポーネントを薄いスタブに差し替える
// (RecordFormScreen.standalone.test.tsx と同じ方針)
vi.mock("@/components/shared/VideoUploader", () => ({
  VideoUploader: () => null,
}));
vi.mock("@/components/shared/PremiumBadge", () => ({
  PremiumBadge: () => null,
}));
vi.mock("@/components/records/LapTimeDisplay", () => ({
  LapTimeDisplay: () => null,
}));
vi.mock("@/components/teams/MemberSelectModal", () => ({
  MemberSelectModal: () => null,
}));

import { TeamRecordBulkFormScreen } from "../TeamRecordBulkFormScreen";

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("TeamRecordBulkFormScreen — 保存成功後のキャッシュ無効化 (V-03)", () => {
  let queryClient: QueryClient;
  let invalidateSpy: MockInstance<QueryClient["invalidateQueries"]>;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    mocks.getStyles.mockResolvedValue([mocks.style]);
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
    mocks.responses["select:records"] = { data: [mocks.existingRecord], error: null };
    mocks.responses["delete:records"] = { data: null, error: null };
    mocks.responses["insert:records"] = { data: { id: "new-record-1" }, error: null };
  });

  it(
    "[V-03] 既存メンバー記録の再保存後、大会タブが購読する recordKeys.lists() 配下が " +
      "invalidate される (従来は calendar / teamKeys.competitions のみ)",
    async () => {
      render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      // 既存の1件 (time=30.5, split_times無し) が buildStyleEntriesFromExisting で
      // 再構築され、UI 操作なしで保存可能な状態になっている
      await waitFor(() => {
        expect(screen.getByText("記録を保存")).toBeDefined();
      });

      fireEvent.click(screen.getByText("記録を保存"));

      await waitFor(() => {
        const invalidatedListsKey = invalidateSpy.mock.calls.some(([arg]) => {
          const key = (arg as { queryKey?: unknown[] } | undefined)?.queryKey;
          return Array.isArray(key) && JSON.stringify(key) === JSON.stringify(recordKeys.lists());
        });
        expect(invalidatedListsKey).toBe(true);
      });
    },
  );

  it("[非退行] calendar キャッシュも引き続き無効化される", async () => {
    render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });
    await waitFor(() => {
      expect(screen.getByText("記録を保存")).toBeDefined();
    });
    fireEvent.click(screen.getByText("記録を保存"));

    await waitFor(() => {
      const invalidatedCalendar = invalidateSpy.mock.calls.some(([arg]) => {
        const key = (arg as { queryKey?: unknown[] } | undefined)?.queryKey;
        return Array.isArray(key) && JSON.stringify(key) === JSON.stringify(["calendar"]);
      });
      expect(invalidatedCalendar).toBe(true);
    });
  });

  it("[非退行] teamKeys.competitions(teamId) も引き続き無効化される", async () => {
    render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });
    await waitFor(() => {
      expect(screen.getByText("記録を保存")).toBeDefined();
    });
    fireEvent.click(screen.getByText("記録を保存"));

    await waitFor(() => {
      const invalidatedTeamCompetitions = invalidateSpy.mock.calls.some(([arg]) => {
        const key = (arg as { queryKey?: unknown[] } | undefined)?.queryKey;
        return (
          Array.isArray(key) &&
          JSON.stringify(key) === JSON.stringify(teamKeys.competitions("team-1"))
        );
      });
      expect(invalidatedTeamCompetitions).toBe(true);
    });
  });
});
