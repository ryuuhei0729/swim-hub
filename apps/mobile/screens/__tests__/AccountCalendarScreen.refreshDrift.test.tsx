// =============================================================================
// AccountCalendarScreen.refreshDrift.test.tsx
// =============================================================================
//
// Sprint Contract 検証観点: [V-04] 「画面と子孫が依存する全クエリ」に漏れがないこと。
// 2026-11-09 に設定画面 (SettingsScreen) をアカウントタブ配下の3画面に分けたとき、
// カレンダー記録色を持つのはこの画面になったので、旧 SettingsScreen.refreshDrift から移した。
// AccountCalendarScreen の refreshAll が、子孫コンポーネント CalendarColorSettings が持つ
// calendarColorKeys.settings(userId) クエリを尽くしているかを、
// DashboardScreen.refreshDrift.test.tsx と同一の「観測ベース・非ハードコード」手法で検証する。
//
// トートロジー防止メモ: 期待する queryKey の一覧は書かない。render 後に実測した
// active query 集合そのものを期待値として使う。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import React from "react";
import type { Query } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTableDispatchSupabase } from "./utils/tableSupabaseMock";

vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn(), setOptions: vi.fn() }),
}));

const captured = vi.hoisted(() => ({
  refreshAll: null as null | (() => Promise<unknown>),
}));

vi.mock("@/hooks/usePullToRefresh", () => ({
  usePullToRefresh: (refresh: () => Promise<unknown>) => {
    captured.refreshAll = refresh;
    return { refreshing: false, handleRefresh: refresh };
  },
}));

// AccountCalendarScreen の子孫のうち本テストの関心事 (query 網羅性) と無関係な
// ネイティブ依存の重い設定セクションはスタブする (react-native-svg / expo-*)。
vi.mock("@/components/settings/GoogleCalendarSyncSettings", () => ({
  GoogleCalendarSyncSettings: () => null,
}));
vi.mock("@/components/settings/IOSCalendarSyncSettings", () => ({
  IOSCalendarSyncSettings: () => null,
}));

const apiMocks = vi.hoisted(() => ({
  getMyTeams: vi.fn(),
}));

vi.mock("@apps/shared/api/teams", () => ({
  TeamCoreAPI: class {
    getMyTeams = apiMocks.getMyTeams;
  },
  TeamMembersAPI: class {},
  TeamAnnouncementsAPI: class {},
}));

const USER_ID = "user-1";
let supabaseMock: ReturnType<typeof createTableDispatchSupabase>;

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: supabaseMock.client,
    user: { id: USER_ID },
    subscription: null,
    signOut: vi.fn(),
    refreshSubscription: vi.fn(),
  }),
}));

import { AccountCalendarScreen } from "../AccountCalendarScreen";

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

async function waitForQuiescence(queryClient: QueryClient) {
  await waitFor(
    () => {
      const stillPending = queryClient
        .getQueryCache()
        .getAll()
        .some((q) => q.getObserversCount() > 0 && q.state.fetchStatus === "fetching");
      expect(stillPending).toBe(false);
    },
    { timeout: 5000 },
  );
}

/** observer を持ち、かつ既に一度でも成功フェッチ済みの query のみを対象にする
 * (enabled:false のまま observer だけ持つクエリを誤検出しないため。
 *  詳細は DashboardScreen.refreshDrift.test.tsx のコメント参照) */
function activeQueries(queryClient: QueryClient): Query[] {
  return queryClient
    .getQueryCache()
    .getAll()
    .filter((q) => q.getObserversCount() > 0 && q.state.dataUpdateCount > 0);
}

describe("AccountCalendarScreen — pull-to-refresh のクエリ網羅性 (ドリフト検出)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    captured.refreshAll = null;

    supabaseMock = createTableDispatchSupabase({
      userId: USER_ID,
      tables: {
        users: {
          data: {
            id: USER_ID,
            name: "テストユーザー",
            personal_practice_color: null,
            personal_competition_color: null,
          },
        },
        user_team_calendar_colors: { data: [] },
      },
    });
    apiMocks.getMyTeams.mockResolvedValue([]);

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it(
    "[ドリフト検出] refreshAll が、子孫 CalendarColorSettings の " +
      "calendarColorSettings クエリまで尽くせているかを実測する",
    async () => {
      render(<AccountCalendarScreen />, { wrapper: createWrapper(queryClient) });
      await waitForQuiescence(queryClient);

      const before = activeQueries(queryClient);
      expect(before.length).toBeGreaterThan(0);
      const beforeCounts = new Map(before.map((q) => [q.queryHash, q.state.dataUpdateCount]));

      expect(captured.refreshAll).not.toBeNull();
      await act(async () => {
        await captured.refreshAll!();
      });
      await waitForQuiescence(queryClient);

      const failures: string[] = [];
      for (const query of before) {
        const prevCount = beforeCounts.get(query.queryHash)!;
        if (query.state.dataUpdateCount <= prevCount) {
          failures.push(
            `queryKey=${JSON.stringify(query.queryKey)} が再取得されていない ` +
              `(dataUpdateCount: ${prevCount} → ${query.state.dataUpdateCount})`,
          );
        }
      }

      // Sprint Contract V-04 の期待は「漏れが無いこと」。
      expect(
        failures,
        `AccountCalendarScreen の refreshAll から漏れている active query:\n${failures.join("\n")}`,
      ).toEqual([]);
    },
  );
});
