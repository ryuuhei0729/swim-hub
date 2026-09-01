// =============================================================================
// MyPageScreen.waToggleAdjacency.test.tsx
// =============================================================================
// mobile UI フィードバック #5: 「WAポイントで比較」トグルを一括入力ボタンの右へ移動。
//
// Sprint Contract 検証観点:
//   [V-ADJ-01] WAポイント表示トグルボタンが実際に画面上に存在する
//   [V-ADJ-02] トグルボタンと一括入力ボタンが同じ直近の親コンテナ内に配置されている
//     (「隣に存在する」ことの構造的検証。離れた場所に置かれていないことを保証する)
//   [V-ADJ-03] info アイコン (WaPointsInfoTooltip) もトグルと同じコンテナ内に一緒に
//     移動している
//
// トートロジー防止メモ: このテストはコンテナ構造 (親子関係) のみを見る。
// トグルの ON/OFF による表示切り替え自体は
// `MyPageScreen.waPointsGenderWiring.test.tsx` が別途検証している。
// =============================================================================

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { createTableDispatchSupabase } from "./utils/tableSupabaseMock";

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
  usePullToRefresh: (refresh: () => Promise<unknown>) => ({ refreshing: false, handleRefresh: refresh }),
}));

vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
}));
vi.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: vi.fn() },
  SaveFormat: { JPEG: "jpeg", PNG: "png", WEBP: "webp" },
}));

const apiMocks = vi.hoisted(() => ({
  getMyTeams: vi.fn(),
  getBestTimes: vi.fn(),
}));

vi.mock("@apps/shared/api/teams", () => ({
  TeamCoreAPI: class {
    getMyTeams = apiMocks.getMyTeams;
  },
  TeamMembersAPI: class {},
  TeamAnnouncementsAPI: class {},
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    getBestTimes = apiMocks.getBestTimes;
  },
}));

const USER_ID = "user-1";
let supabaseMock: ReturnType<typeof createTableDispatchSupabase>;

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: supabaseMock.client, user: { id: USER_ID } }),
}));

import { MyPageScreen } from "../MyPageScreen";

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("[V-ADJ] MyPageScreen — WAポイントトグルは一括入力ボタンの隣に配置される", () => {
  it("[V-ADJ-01/02/03] トグル・info アイコン・一括入力ボタンが同一の直近の親コンテナ内にある", async () => {
    supabaseMock = createTableDispatchSupabase({
      userId: USER_ID,
      tables: { users: { data: { id: USER_ID, name: "テストユーザー", gender: 0 } } },
    });
    apiMocks.getMyTeams.mockResolvedValue([]);
    apiMocks.getBestTimes.mockResolvedValue([]);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const { container } = render(<MyPageScreen />, { wrapper: createWrapper(queryClient) });

    // このリポジトリの Pressable モックは accessibilityLabel を aria-label に変換しない
    // (既存テストの複数箇所に同種の注記あり) ため、属性セレクタで直接取得する。
    await screen.findByText("一括入力");
    const bulkInputButton = container.querySelector(
      '[accessibilitylabel="ベストタイムを一括入力する"]',
    ) as HTMLElement;
    expect(bulkInputButton).toBeTruthy();
    // testID も (Testing Library 標準の data-testid ではなく) 生の testid 属性として
    // 転記される (`getByRawTestId` は本ファイル内の他テストと同じ回避策)。
    const toggleButton = container.querySelector(
      '[testid="best-times-wa-points-toggle-mypage"]',
    ) as HTMLElement;
    const infoIcon = container.querySelector(
      '[testid="best-times-wa-info-mypage"]',
    ) as HTMLElement;
    expect(toggleButton).toBeTruthy();
    expect(infoIcon).toBeTruthy();

    // bulkInputButton から親方向に何ホップ遡れば target を子孫として含む祖先に
    // 到達するかを数える。「隣にある」なら極めて少ないホップ数で到達できるはずで、
    // 別セクションに離れて配置されている場合は section/ScrollView まで遡る必要があり
    // ホップ数が大きくなる。
    function hopsToAncestorContaining(from: HTMLElement, target: HTMLElement): number {
      let hops = 0;
      for (let cur: HTMLElement | null = from; cur; cur = cur.parentElement, hops++) {
        if (cur.contains(target)) return hops;
      }
      throw new Error("target を含む祖先が見つかりません");
    }

    // 正しい配置 (bestTimeHeaderActions 内で bulkInputButton と waToggleWrapper が
    // 兄弟) では、bulkInputButton の直近の親 (bestTimeHeaderActions) が既に
    // トグル/info アイコンを子孫として含む。よって 2 ホップ以内で到達できるはず。
    expect(hopsToAncestorContaining(bulkInputButton, toggleButton)).toBeLessThanOrEqual(2);
    expect(hopsToAncestorContaining(bulkInputButton, infoIcon)).toBeLessThanOrEqual(2);
  });
});
