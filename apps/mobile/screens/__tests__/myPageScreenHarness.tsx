// =============================================================================
// myPageScreenHarness.tsx
// MyPageScreen を render するテストの共通モック。QA (Evaluator) が所有するテスト支援コード。
// =============================================================================
//
// このファイルを import するだけで、下記モジュールが vi.mock される。
// 画面ごとに差し替えたい値は `harness` のプロパティを書き換える。
//
//   @react-navigation/native       useNavigation / useFocusEffect (マウント時に1回だけ発火)
//   @/hooks/usePullToRefresh       渡された refresh を harness.refreshAll に記録し、そのまま返す
//   expo-image-picker / expo-image-manipulator  ネイティブ API を空のスタブにする
//   @apps/shared/api/teams         TeamCoreAPI.getMyTeams
//   @apps/shared/api/records       RecordAPI.getBestTimes
//   @/contexts/AuthProvider        supabase (harness.supabase) / user (USER_ID)
//
// supabase は react-query のフックを実物のまま動かすため、テーブル名で応答を返す
// createTableDispatchSupabase (./utils/tableSupabaseMock) を各テストで作って harness.supabase に入れる。
//
// 🚨 テストファイル側で上記モジュールを vi.mock し直してはいけない。ファイル側の
//    vi.mock は巻き上げで先に登録され、このファイルの import 時に上書きされて
//    黙って無効になる (screenHarnesses.test.ts が検出する)。挙動を変えたいときは
//    harness にプロパティを足す。
//
// このファイルは `import { MyPageScreen } from "../MyPageScreen"` より前に import する。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { vi } from "vitest";

export const USER_ID = "user-1";

const harness = vi.hoisted(() => ({
  /** 未設定のまま render すると useAuth().supabase が null になり即座に落ちる */
  supabase: null as unknown,
  getMyTeams: vi.fn(),
  getBestTimes: vi.fn(),
  /** usePullToRefresh に渡された最新の refresh 関数 */
  refreshAll: null as null | (() => Promise<unknown>),
}));

vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn(), setOptions: vi.fn() }),
  useFocusEffect: (callback: () => void) => {
    React.useEffect(() => {
      callback();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  },
}));

vi.mock("@/hooks/usePullToRefresh", () => ({
  usePullToRefresh: (refresh: () => Promise<unknown>) => {
    harness.refreshAll = refresh;
    return { refreshing: false, handleRefresh: refresh };
  },
}));

vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
}));
vi.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: vi.fn() },
  SaveFormat: { JPEG: "jpeg", PNG: "png", WEBP: "webp" },
}));

vi.mock("@apps/shared/api/teams", () => ({
  TeamCoreAPI: class {
    getMyTeams = harness.getMyTeams;
  },
  TeamMembersAPI: class {},
  TeamAnnouncementsAPI: class {},
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    getBestTimes = harness.getBestTimes;
  },
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: harness.supabase, user: { id: USER_ID } }),
}));

export { harness };

export function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
