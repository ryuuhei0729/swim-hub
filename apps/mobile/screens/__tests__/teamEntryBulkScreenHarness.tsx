// =============================================================================
// teamEntryBulkScreenHarness.tsx
// TeamEntryBulkFormScreen を render するテストの共通モック。QA (Evaluator) が所有するテスト支援コード。
// =============================================================================
//
// このファイルを import するだけで、下記モジュールが vi.mock される。
// 画面ごとに差し替えたい値は `harness` のプロパティを書き換える。
//
//   @react-navigation/native          useRoute (harness.routeParams) / useNavigation / usePreventRemove (no-op)
//   @/contexts/AuthProvider           supabase (harness.supabase) / user (harness.currentUserId)
//   @apps/shared/hooks/queries/teams  useTeamsQuery の members (harness.members)
//   @apps/shared/api/styles           getStyles
//   @apps/shared/api/entries          createBulkEntries / updateEntry / deleteBulkEntries
//   @apps/shared/api/records          getBestTimesForUsers
//   MemberSelectModal                 描画せず props を harness.memberSelectProps に記録する
//
// 🚨 テストファイル側で上記モジュールを vi.mock し直してはいけない。ファイル側の
//    vi.mock は巻き上げで先に登録され、このファイルの import 時に上書きされて
//    黙って無効になる (screenHarnesses.test.ts が検出する)。挙動を変えたいときは
//    harness にプロパティを足す。
//
// このファイルは `import { TeamEntryBulkFormScreen } from "../TeamEntryBulkFormScreen"` より前に import する。
// harness の値はテストファイル内で持ち越される (自動ではリセットしない)。
// 各ファイルの beforeEach で、そのファイルが前提にする値を明示的に設定すること。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { vi } from "vitest";

type TeamMember = {
  user_id: string;
  role: string;
  is_swimmer?: boolean;
  users: { id: string; name: string };
};

const harness = vi.hoisted(() => {
  /** `"select:<table>"` をキーにした supabase の応答表。order() と single() がここから引く */
  const responses: Record<string, { data: unknown; error: unknown }> = {};

  const supabase = {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      const respond = () => Promise.resolve(responses[`select:${table}`] ?? { data: null, error: null });
      builder.select = vi.fn(chain);
      builder.eq = vi.fn(chain);
      builder.order = vi.fn(respond);
      builder.single = vi.fn(respond);
      return builder;
    },
  };

  return {
    responses,
    supabase,
    routeParams: { competitionId: "comp-1", teamId: "team-1" } as Record<string, unknown>,
    currentUserId: "admin-1",
    /** useTeamsQuery の members。毎回同じ参照を返す (本物の React Query と同じ) */
    members: [
      { user_id: "admin-1", role: "admin", users: { id: "admin-1", name: "管理者" } },
      { user_id: "user-1", role: "user", users: { id: "user-1", name: "選手A" } },
    ] as TeamMember[],
    memberSelectProps: [] as Array<{ members: Array<{ user_id: string }> }>,
    goBack: vi.fn(),
    navigate: vi.fn(),
    getStyles: vi.fn(),
    getBestTimesForUsers: vi.fn(),
    createBulkEntries: vi.fn().mockResolvedValue([]),
    updateEntry: vi.fn().mockResolvedValue({}),
    deleteBulkEntries: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: harness.routeParams }),
  useNavigation: () => ({ navigate: harness.navigate, goBack: harness.goBack }),
  usePreventRemove: () => undefined,
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: harness.supabase, user: { id: harness.currentUserId } }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({ members: harness.members, isLoading: false }),
}));

vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: class {
    getStyles = harness.getStyles;
  },
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: class {
    createBulkEntries = harness.createBulkEntries;
    updateEntry = harness.updateEntry;
    deleteBulkEntries = harness.deleteBulkEntries;
  },
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    getBestTimesForUsers = harness.getBestTimesForUsers;
  },
}));

vi.mock("@/components/teams/MemberSelectModal", () => ({
  MemberSelectModal: (props: { members: Array<{ user_id: string }> }) => {
    harness.memberSelectProps.push(props);
    return null;
  },
}));

export { harness };

export const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};
