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

import { QueryClient } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTableDispatchSupabase } from "./utils/tableSupabaseMock";
import { createWrapper, harness, USER_ID } from "./myPageScreenHarness";
import { MyPageScreen } from "../MyPageScreen";

let supabaseMock: ReturnType<typeof createTableDispatchSupabase>;


// トグルのラベル文言 (`mypage.bestTimesTable.waPointsToggleShort`) は文言変更スプリントで
// 「WAポイント」→「点数化」に変更された。表示文言は今後も変わりうるため、テキストではなく
// 実装が持つ安定した testID (`best-times-wa-points-toggle-mypage`) で取得する
// (react-native の `testID` はこのリポジトリの DOM モックでは `data-testid` ではなく
// 生の `testid` 属性としてそのまま転記される。他ファイルの `getByRawTestId` と同じ理由)。
function clickWaPointsToggle() {
  const toggle = document.querySelector('[testid="best-times-wa-points-toggle-mypage"]');
  if (!toggle) throw new Error('testid="best-times-wa-points-toggle-mypage" の要素が見つかりません');
  fireEvent.click(toggle);
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
  harness.supabase = supabaseMock.client;
  harness.getMyTeams.mockResolvedValue([]);
  harness.getBestTimes.mockResolvedValue([FR100_RECORD]);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(<MyPageScreen />, { wrapper: createWrapper(queryClient) });
}

describe("[V-GENDER-WIRING] MyPageScreen は profile.gender をそのまま BestTimesTable に配線する", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("[V-GENDER-WIRING-01] gender が undefined のユーザーは、WAポイントモードでも「—」のままで 542 は出ない (`?? 0` フォールバック検出)", async () => {
    setup(); // gender キーを含めない = profile.gender は undefined

    // データロード完了 (ベストタイム表が描画される) を待つ
    const timeCell = await screen.findByText("54.97");
    expect(timeCell).toBeTruthy();

    clickWaPointsToggle();

    await waitFor(() => {
      expect(screen.queryByText("542")).toBeNull();
    });
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("[V-GENDER-WIRING-02] gender=1 (女性) のユーザーは、WAポイントモードで男性基準の 542 ではなく女性基準の 763 が表示される", async () => {
    setup({ gender: 1 });

    await screen.findByText("54.97");
    clickWaPointsToggle();

    await waitFor(() => {
      expect(screen.getByText("763")).toBeTruthy();
    });
    expect(screen.queryByText("542")).toBeNull();
  });

  it("[V-GENDER-WIRING-03] gender=0 (男性) を明示指定したユーザーは、WAポイントモードで 542 が表示される (回帰確認)", async () => {
    setup({ gender: 0 });

    await screen.findByText("54.97");
    clickWaPointsToggle();

    await waitFor(() => {
      expect(screen.getByText("542")).toBeTruthy();
    });
    expect(screen.queryByText("763")).toBeNull();
  });
});
