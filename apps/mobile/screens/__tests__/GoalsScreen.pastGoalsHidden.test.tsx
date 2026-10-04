// =============================================================================
// GoalsScreen.pastGoalsHidden.test.tsx  (Contract v6: 過去の日付の目標は目標タブに表示しない)
// 期待値はリテラル。今日は Date の fake で固定 (2026-10-04)。壊したら赤: 境界を <= にする (今日が消える) /
//   competition===null を除外する / 達成率を全件取得に戻す / 判定を表示分だけにする / UTC 変換で日付がずれる
// =============================================================================
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  calls: [] as string[],
  judge: vi.fn(),
  getGoals: vi.fn(),
  getSelectableCompetitions: vi.fn(),
  calculateGoalProgress: vi.fn(),
  deleteGoal: vi.fn(),
  getStyles: vi.fn(),
  navigate: vi.fn(),
  userId: "user-1" as string | undefined,
  // 実 AuthProvider と同じく supabase は参照が安定していること (毎回新規だと useFocusEffect の callback が変わり無限に再実行される)
  supabase: {},
  focusCallbacks: new Set<() => void>(),
  refresh: null as null | (() => Promise<void>),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: h.supabase, user: h.userId ? { id: h.userId } : null }),
}));
vi.mock("@apps/shared/api/goals", () => ({
  GoalAPI: class {
    updateAllMilestoneStatuses = h.judge;
    getGoals = h.getGoals;
    getSelectableCompetitions = h.getSelectableCompetitions;
    calculateGoalProgress = h.calculateGoalProgress;
    deleteGoal = h.deleteGoal;
  },
}));
vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: class {
    getStyles = h.getStyles;
  },
}));
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: h.navigate }),
  useFocusEffect: (cb: () => void) => {
    React.useEffect(() => {
      h.focusCallbacks.add(cb);
      cb();
      return () => {
        h.focusCallbacks.delete(cb);
      };
    }, [cb]);
  },
}));
vi.mock("@/hooks/usePullToRefresh", () => ({
  usePullToRefresh: (refresh: () => Promise<void>) => {
    h.refresh = refresh;
    return { refreshing: false, handleRefresh: refresh };
  },
}));

import { Alert } from "react-native";
import { GoalsScreen } from "../GoalsScreen";


const STYLE = { id: 1, name_jp: "100m 自由形", name: "100m Freestyle", style: "Fr", distance: 100 };
const goal = (id: string, compId: string | null, status = "active") => ({
  id, user_id: "user-1", competition_id: compId, style_id: 1, target_time: 60, start_time: null,
  status, achieved_at: null, reflection_note: null, created_at: "", updated_at: "",
});
const comp = (id: string, title: string, date: string) => ({ id, title, date, team_id: null, pool_type: 0 });

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}><GoalsScreen /></QueryClientProvider>);
}
const flush = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 60)); }); };
const setNow = (y: number, m: number, d: number, hh = 12, mm = 0) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(y, m - 1, d, hh, mm, 0));
};

/** 目標3件 + 大会3件 (昨日/今日/明日) を返す設定にする */
function setup(goals: ReturnType<typeof goal>[], comps: ReturnType<typeof comp>[]) {
  h.getGoals.mockImplementation(async () => goals);
  h.getSelectableCompetitions.mockResolvedValue(comps);
}

beforeEach(() => {
  h.calls.length = 0;
  h.userId = "user-1";
  h.focusCallbacks.clear();
  h.judge.mockReset().mockResolvedValue(undefined);
  h.getGoals.mockReset();
  h.getSelectableCompetitions.mockReset().mockResolvedValue([]);
  h.calculateGoalProgress.mockReset().mockResolvedValue(50);
  h.deleteGoal.mockReset().mockResolvedValue(undefined);
  h.getStyles.mockReset().mockResolvedValue([STYLE]);
  h.navigate.mockReset();
  vi.mocked(Alert.alert).mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  setNow(2026, 10, 4);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

const comps3 = [comp("cY", "昨日大会", "2026-10-03"), comp("cT", "今日大会", "2026-10-04"), comp("cF", "明日大会", "2026-10-05")];
const goals3 = [goal("gY", "cY"), goal("gT", "cT"), goal("gF", "cF")];

describe("v6: 過去の日付の目標は目標タブに表示しない (境界 = 今日 2026-10-04)", () => {
  it("昨日 (10-03) は出ない / 今日 (10-04) は出る / 明日 (10-05) は出る", async () => {
    setup(goals3, comps3);
    renderScreen();
    await flush();
    expect(screen.queryByText("昨日大会")).toBeNull();
    expect(screen.getByText("今日大会")).toBeTruthy();
    expect(screen.getByText("明日大会")).toBeTruthy();
  });

  it.each(["active", "achieved", "cancelled"])("status=%s でも、過去なら出ない・今日なら出る", async (status) => {
    setup([goal("gY", "cY", status), goal("gT", "cT", status)], comps3);
    renderScreen();
    await flush();
    expect(screen.queryByText("昨日大会")).toBeNull();
    expect(screen.getByText("今日大会")).toBeTruthy();
  });

  it("competition===null (大会が見えない) の目標は表示されたまま: 大会情報なし + 編集不可理由 + 削除できる", async () => {
    setup([goal("gN", "cMissing"), goal("gY", "cY")], comps3);
    renderScreen();
    await flush();
    expect(screen.getByText("大会情報なし")).toBeTruthy();
    expect(screen.queryByText("昨日大会")).toBeNull();
    const del = Array.from(document.querySelectorAll('[accessibilitylabel="削除"]')) as HTMLElement[];
    expect(del).toHaveLength(1);
    fireEvent.click(del[0]!);
    const buttons = vi.mocked(Alert.alert).mock.calls[0]![2] as Array<{ style?: string; onPress?: () => Promise<void> }>;
    await act(async () => { await buttons.find((b) => b.style === "destructive")!.onPress!(); });
    expect(h.deleteGoal).toHaveBeenCalledWith("gN");
  });

  it("全部が過去なら既存の空状態 (新しい文言は足さない)", async () => {
    setup([goal("gY", "cY", "achieved"), goal("gY2", "cY2")], [comp("cY", "昨日大会", "2026-10-03"), comp("cY2", "先月大会", "2026-09-01")]);
    renderScreen();
    await flush();
    expect(screen.getByText("目標がありません")).toBeTruthy();
    expect(screen.getByText("下のボタンから新規作成してください")).toBeTruthy();
  });

  it("達成率の問い合わせは表示する目標の id だけ (非表示の gY では呼ばれない)", async () => {
    setup(goals3, comps3);
    renderScreen();
    await flush();
    const ids = h.calculateGoalProgress.mock.calls.map((c) => c[0]).sort();
    expect(ids).toEqual(["gF", "gT"]);
  });

  it("達成判定は従来どおり呼ばれる (非表示の目標があっても userId 引数で1回)", async () => {
    setup(goals3, comps3);
    renderScreen();
    await flush();
    expect(h.judge).toHaveBeenCalledTimes(1);
    expect(h.judge).toHaveBeenCalledWith("user-1");
  });

  it("目標カードの遷移・達成バッジは表示する目標だけに対して従来どおり働く", async () => {
    setup([goal("gY", "cY", "achieved"), goal("gT", "cT", "achieved")], comps3);
    renderScreen();
    await flush();
    expect(screen.getAllByText("達成！")).toHaveLength(1);
    fireEvent.click((document.querySelectorAll('[accessibilitylabel="今日大会 100m 自由形"]')[0]) as HTMLElement);
    expect(h.navigate).toHaveBeenLastCalledWith("GoalDetail", { goalId: "gT" });
  });
});

describe("v6: ローカル時刻の深夜帯でも境界がずれない (yyyy-MM-dd をタイムゾーンでずらさない)", () => {
  it.each([
    ["00:30", 0, 30],
    ["23:30", 23, 30],
  ])("今日 = 2026-10-04 %s: 昨日は非表示・今日は表示", async (_label, hh, mm) => {
    cleanup();
    setNow(2026, 10, 4, hh, mm);
    setup(goals3, comps3);
    renderScreen();
    await flush();
    expect(screen.queryByText("昨日大会")).toBeNull();
    expect(screen.getByText("今日大会")).toBeTruthy();
    expect(screen.getByText("明日大会")).toBeTruthy();
  });

  it("日付の跨ぎ: 今日 = 2026-10-05 00:30 になれば 10-04 の大会は非表示、10-05 は表示", async () => {
    cleanup();
    setNow(2026, 10, 5, 0, 30);
    setup(goals3, comps3);
    renderScreen();
    await flush();
    expect(screen.queryByText("今日大会")).toBeNull();
    expect(screen.getByText("明日大会")).toBeTruthy();
  });

  it("月・年の境界 (今日 = 2027-01-01): 2026-12-31 は非表示、2027-01-01 は表示", async () => {
    cleanup();
    setNow(2027, 1, 1, 0, 30);
    setup(
      [goal("gA", "cA"), goal("gB", "cB")],
      [comp("cA", "大晦日大会", "2026-12-31"), comp("cB", "元日大会", "2027-01-01")],
    );
    renderScreen();
    await flush();
    expect(screen.queryByText("大晦日大会")).toBeNull();
    expect(screen.getByText("元日大会")).toBeTruthy();
  });
});

describe("v6: アプリを開いたまま日付が変わった場合", () => {
  it("今日=10/04 で描画 -> 時計を 10/05 に進める -> フォーカス (判定->invalidate->再取得の1周) で、10/04 の大会の目標が一覧から消える", async () => {
    setup(goals3, comps3);
    renderScreen();
    await flush();
    expect(screen.getByText("今日大会")).toBeTruthy();
    expect(screen.getByText("明日大会")).toBeTruthy();

    // 日付が変わる (サーバーのデータは同じまま = React Query の structural sharing で参照が変わらない状況)
    vi.setSystemTime(new Date(2026, 9, 5, 0, 30, 0));
    await act(async () => { h.focusCallbacks.forEach((cb) => cb()); });
    await flush();

    expect(h.getGoals.mock.calls.length).toBeGreaterThanOrEqual(2); // 再取得の1周が実際に走った
    expect(screen.queryByText("今日大会")).toBeNull();
    expect(screen.getByText("明日大会")).toBeTruthy();
  });
});
