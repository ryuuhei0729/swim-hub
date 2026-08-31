// =============================================================================
// MyPageScreen.waPointsGenderWiring.test.tsx
// =============================================================================
// MyPageScreen — gender 配線 (呼び出し元レベル) の防衛テスト
//
// ## 背景
// web 版に同種の穴が実際にあった (`apps/web/__tests__/components/team/
// MemberDetailModalGenderWiring.test.tsx` 参照): `<BestTimesTable ... gender={x ?? 0} />`
// のような実装ミスは、BestTimesTable 単体テストだけでは検出できない (gender を直接
// props として渡すため)。呼び出し元 (MyPageScreen) が `profile?.gender` を握り潰さず
// 実際に配線しているかどうかは、呼び出し元レベルで別途検証する必要がある。
//
// `users.gender` の DB デフォルトは 0 (男性)。`?? 0` が入ると、gender が
// 未設定 (undefined) の女性ユーザーが「不明」として扱われず「男性」として WA ポイントが
// 計算され、もっともらしいが誤った数値が静かに表示される。
//
// ## このテストが pin する挙動
// - [V-GENDER-WIRING-01] profile.gender が undefined のとき (users テーブルの fixture に
//   gender キーを含めない)、WAポイントモードに切り替えても「—」のままで、
//   男性基準の点数 (542) は出ない。
// - [V-GENDER-WIRING-02] profile.gender = 1 (女性) のとき、男性基準の 542 ではなく
//   女性基準の 763 が表示される。
// - [V-GENDER-WIRING-03] profile.gender = 0 (男性) を明示指定したときは 542 が表示される
//   (回帰確認: 正常系を壊していないこと)。
//
// ## 期待値の作成方法 (トートロジー回避)
// 542 / 763 は node -e で P = floor(1000 * (B/T)^3) を独立に計算したハードコード値
// (T=54.97, SCM 100m自由形: 男子base=44.84 / 女子base=50.25)。BestTimesTable や
// waPoints.ts の実装を呼び出して期待値を生成していない。
//
// ## モック方針
// `screens/__tests__/MyPageScreen.refreshDrift.test.tsx` (前任 QA 確立) と同じ
// `createTableDispatchSupabase` + `RecordAPI.getBestTimes` モックの実物 react-query
// フック経由で MyPageScreen をレンダリングする (useUserQuery/useBestTimesQuery 自体は
// モックしない)。
// =============================================================================

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

// ProfileEditModal はバレル export (@/components/profile) 経由で
// expo-image-picker に依存する AvatarUpload を eager import する。
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

const FR100_RECORD = {
  id: "rec-1",
  time: 54.97,
  created_at: "2020-01-01T00:00:00.000Z",
  pool_type: 0,
  is_relaying: false,
  note: null,
  style_id: 1,
  style: { name_jp: "100m自由形", distance: 100 },
  competition: { title: "テスト大会", date: "2020-01-01" },
};

function setup(usersFixtureOverrides: Record<string, unknown> = {}) {
  supabaseMock = createTableDispatchSupabase({
    userId: USER_ID,
    tables: {
      users: { data: { id: USER_ID, name: "テストユーザー", ...usersFixtureOverrides } },
    },
  });
  apiMocks.getMyTeams.mockResolvedValue([]);
  apiMocks.getBestTimes.mockResolvedValue([FR100_RECORD]);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(<MyPageScreen />, { wrapper: createWrapper(queryClient) });
}

describe("[V-GENDER-WIRING] MyPageScreen は profile.gender をそのまま BestTimesTable に配線する", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("[V-GENDER-WIRING-01] gender が undefined のユーザーは、WAポイントモードでも「—」のままで 542 は出ない (`?? 0` フォールバック検出)", async () => {
    setup(); // gender キーを含めない = profile.gender は undefined

    // データロード完了 (ベストタイム表が描画される) を待つ
    const timeCell = await screen.findByText("54.97");
    expect(timeCell).toBeTruthy();

    fireEvent.click(screen.getByText("WAポイント"));

    await waitFor(() => {
      expect(screen.queryByText("542")).toBeNull();
    });
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("[V-GENDER-WIRING-02] gender=1 (女性) のユーザーは、WAポイントモードで男性基準の 542 ではなく女性基準の 763 が表示される", async () => {
    setup({ gender: 1 });

    await screen.findByText("54.97");
    fireEvent.click(screen.getByText("WAポイント"));

    await waitFor(() => {
      expect(screen.getByText("763")).toBeTruthy();
    });
    expect(screen.queryByText("542")).toBeNull();
  });

  it("[V-GENDER-WIRING-03] gender=0 (男性) を明示指定したユーザーは、WAポイントモードで 542 が表示される (回帰確認)", async () => {
    setup({ gender: 0 });

    await screen.findByText("54.97");
    fireEvent.click(screen.getByText("WAポイント"));

    await waitFor(() => {
      expect(screen.getByText("542")).toBeTruthy();
    });
    expect(screen.queryByText("763")).toBeNull();
  });
});
