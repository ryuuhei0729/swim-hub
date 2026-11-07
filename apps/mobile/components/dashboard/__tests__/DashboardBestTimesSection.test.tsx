// =============================================================================
// DashboardBestTimesSection (ホームのベストタイム欄)
// =============================================================================
// 2026-11-07 にマイページのベストタイム欄をホームへ移した。マイページ側にあった次の3本の観点を
// ここで引き継ぐ (元のファイルは MyPageScreen から欄が無くなったので削除した):
//   - MyPageScreen.waPointsGenderWiring.test.tsx  [V-GENDER-WIRING-01/02/03]
//   - MyPageScreen.waPointsInfoIcon.test.tsx      [V-PI-01/02]
//   - MyPageScreen.waToggleAdjacency.test.tsx     [V-ADJ-01/02/03]
//
// gender の期待値 542 / 763 は元のテストと同じく、P = floor(1000 * (B/T)^3) を独立に計算した
// ハードコード値 (T=54.97, SCM 100m自由形: 男子base=44.84 / 女子base=50.25)。
// useUserQuery / useBestTimesQuery は実物を動かし、supabase (users) と RecordAPI.getBestTimes だけを差し替える。
// =============================================================================

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import jaMessages from "@apps/shared/messages/ja.json";
import { createTableDispatchSupabase } from "../../../screens/__tests__/utils/tableSupabaseMock";

const USER_ID = "user-1";

const h = vi.hoisted(() => ({
  supabase: null as unknown,
  getBestTimes: vi.fn(),
  getMyTeams: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: h.navigate }),
}));
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: h.supabase, user: { id: USER_ID } }),
}));
vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    getBestTimes = h.getBestTimes;
  },
}));
vi.mock("@apps/shared/api/teams", () => ({
  TeamCoreAPI: class {
    getMyTeams = h.getMyTeams;
  },
  TeamMembersAPI: class {},
  TeamAnnouncementsAPI: class {},
}));

import { DashboardBestTimesSection } from "../DashboardBestTimesSection";

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

function setup(usersFixtureOverrides: Record<string, unknown> = {}, bestTimes: unknown = [FR100_RECORD]) {
  const supabaseMock = createTableDispatchSupabase({
    userId: USER_ID,
    tables: { users: { data: { id: USER_ID, name: "テストユーザー", ...usersFixtureOverrides } } },
  });
  h.supabase = supabaseMock.client;
  h.getMyTeams.mockResolvedValue([]);
  if (bestTimes instanceof Error) h.getBestTimes.mockRejectedValue(bestTimes);
  else h.getBestTimes.mockResolvedValue(bestTimes);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DashboardBestTimesSection />
    </QueryClientProvider>,
  );
}

const rawTestId = (container: HTMLElement, id: string) =>
  container.querySelector(`[testid="${id}"]`) as HTMLElement | null;

beforeEach(() => {
  h.navigate.mockReset();
});

describe("[V-GENDER-WIRING] profile.gender をそのまま BestTimesTable に渡す (`?? 0` で男性に倒さない)", () => {
  it("[01] gender が undefined のユーザーは、点数化しても「—」のままで男性基準の 542 は出ない", async () => {
    const { container } = setup();
    await screen.findByText("54.97");
    fireEvent.click(rawTestId(container, "best-times-wa-points-toggle")!);
    await waitFor(() => expect(screen.queryByText("542")).toBeNull());
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("[02] gender=1 (女性) は女性基準の 763 を出し、男性基準の 542 は出さない", async () => {
    const { container } = setup({ gender: 1 });
    await screen.findByText("54.97");
    fireEvent.click(rawTestId(container, "best-times-wa-points-toggle")!);
    await waitFor(() => expect(screen.getByText("763")).toBeTruthy());
    expect(screen.queryByText("542")).toBeNull();
  });

  it("[03] gender=0 (男性) は 542 を出す (回帰確認)", async () => {
    const { container } = setup({ gender: 0 });
    await screen.findByText("54.97");
    fireEvent.click(rawTestId(container, "best-times-wa-points-toggle")!);
    await waitFor(() => expect(screen.getByText("542")).toBeTruthy());
    expect(screen.queryByText("763")).toBeNull();
  });
});

describe("[V-PI] 点数化の横の info アイコン", () => {
  it("[01/02] タップすると pointsInfoAriaLabel / pointsInfo を出し、旧 WA 専用の文言にフォールバックしない", async () => {
    const { container } = setup({ gender: 0 });
    await screen.findByText("54.97");
    fireEvent.click(rawTestId(container, "best-times-wa-info")!);

    const modal = container.querySelector('[animationtype="none"]');
    expect(modal).toBeTruthy();
    const spans = Array.from(modal!.querySelectorAll("span")).filter((el) => !el.hasAttribute("data-testid"));
    expect(spans[0]!.textContent).toBe(jaMessages.mypage.bestTimesTable.pointsInfoAriaLabel);
    expect(spans[1]!.textContent).toBe(jaMessages.mypage.bestTimesTable.pointsInfo);
    expect(spans[0]!.textContent).not.toBe(jaMessages.teams.waPointsCompare.infoAriaLabel);
    expect(spans[1]!.textContent).not.toContain("World Aquatics");
  });
});

describe("[V-ADJ] 点数化・info アイコンは一括入力ボタンの隣に置く", () => {
  it("[01/02/03] 一括入力ボタンの直近の祖先 (2ホップ以内) にトグルと info アイコンがある", async () => {
    const { container } = setup({ gender: 0 }, []);
    await screen.findByText("一括入力");
    const bulkInputButton = container.querySelector(
      '[accessibilitylabel="ベストタイムを一括入力する"]',
    ) as HTMLElement;
    const toggle = rawTestId(container, "best-times-wa-points-toggle")!;
    const info = rawTestId(container, "best-times-wa-info")!;
    expect(bulkInputButton && toggle && info).toBeTruthy();

    const hops = (from: HTMLElement, target: HTMLElement) => {
      let n = 0;
      for (let cur: HTMLElement | null = from; cur; cur = cur.parentElement, n++) {
        if (cur.contains(target)) return n;
      }
      throw new Error("target を含む祖先が無い");
    };
    expect(hops(bulkInputButton, toggle)).toBeLessThanOrEqual(2);
    expect(hops(bulkInputButton, info)).toBeLessThanOrEqual(2);
  });
});

describe("見出し・一括入力・エラー", () => {
  it("見出しは「Best Time」で、「マイページで見る」は出さない", async () => {
    setup({ gender: 0 });
    await screen.findByText("54.97");
    expect(screen.getByText("Best Time")).toBeTruthy();
    expect(screen.queryByText(/マイページで見る/)).toBeNull();
  });

  it("一括入力ボタンでベストタイム一括入力画面を開く", async () => {
    setup({ gender: 0 });
    fireEvent.click(await screen.findByText("一括入力"));
    expect(h.navigate).toHaveBeenCalledWith("BulkBestTime");
  });

  it("ベストタイムの取得に失敗したら、生のエラーではなく固定の文言を出す", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setup({ gender: 0 }, new Error("SECRET_RAW_DB_ERROR"));
    await waitFor(() =>
      expect(screen.getByText(jaMessages.mypage.mobile.bestTimesFetchFailed)).toBeTruthy(),
    );
    expect(screen.queryByText(/SECRET_RAW_DB_ERROR/)).toBeNull();
  });
});
