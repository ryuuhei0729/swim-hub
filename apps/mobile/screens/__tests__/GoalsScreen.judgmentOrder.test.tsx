// =============================================================================
// screens/__tests__/GoalsScreen.judgmentOrder.test.tsx  (S7, S9, D7, S3 一覧からの削除)
// =============================================================================
// 順序保証: 呼び出しログ calls に各モックが push し、['judge','invalidate','fetch'] を厳密に比較。
//   judge     = GoalAPI.updateAllMilestoneStatuses (userId 引数も assert)
//   invalidate= queryClient.invalidateQueries (queryKey が goalKeys.all であることを assert)
//   fetch     = GoalAPI.getGoals
// 実 QueryClientProvider (retry:false)。useFocusEffect は「登録された callback を mount 時と
// fireFocus() で実行する」制御可能な実装に差し替える (実機のフォーカス復帰を再現)。
// 実装に合わせた期待 (Contract v3 / App Dev 報告 A11): 判定は mount 時だけでなく **フォーカスのたび** に
//   走る (目標タブとして常時マウントされるため)。並行実行は inFlightRef で1周に相乗り。
// 何を壊したら赤くなるべきか:
//   - judge と fetch を並列化 / 順序入れ替え -> 順序 assert 赤
//   - invalidate 忘れ                         -> invalidate assert 赤
//   - inFlightRef 削除                        -> 並行ケース (judge 1回) 赤
//   - judge の例外を握りつぶさない             -> 判定例外でも一覧表示 赤
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
function goal(id: string, over: Record<string, unknown> = {}) {
  return {
    id, user_id: "user-1", competition_id: `c-${id}`, style_id: 1, target_time: 60, start_time: null,
    status: "active", achieved_at: null, reflection_note: null, created_at: "", updated_at: "", ...over,
  };
}
const comp = (id: string, title: string) => ({ id, title, date: "2026-12-01", team_id: null, pool_type: 0 });

let qc: QueryClient;
const invalidateKeys: unknown[] = [];

function renderScreen() {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  const orig = qc.invalidateQueries.bind(qc);
  vi.spyOn(qc, "invalidateQueries").mockImplementation(((filters: { queryKey?: unknown }) => {
    h.calls.push("invalidate");
    invalidateKeys.push(filters?.queryKey);
    return orig(filters as never);
  }) as never);
  return render(
    <QueryClientProvider client={qc}>
      <GoalsScreen />
    </QueryClientProvider>,
  );
}
// react-query の通知は setTimeout(0) でバッチされるため、act を複数回に分けて待つ (1回では未描画のまま assert してしまう)
const flush = async () => {
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
};
const byLabel = (l: string) => Array.from(document.querySelectorAll(`[accessibilitylabel="${l}"]`)) as HTMLElement[];
const fireFocus = () => act(async () => { h.focusCallbacks.forEach((cb) => cb()); await new Promise((r) => setTimeout(r, 30)); });

beforeEach(() => {
  h.calls.length = 0;
  invalidateKeys.length = 0;
  h.userId = "user-1";
  h.focusCallbacks.clear();
  h.judge.mockReset().mockImplementation(async () => { h.calls.push("judge"); });
  h.getGoals.mockReset().mockImplementation(async () => { h.calls.push("fetch"); return [goal("g1", { competition_id: "c1" })]; });
  h.getSelectableCompetitions.mockReset().mockResolvedValue([comp("c1", "テスト大会")]);
  h.calculateGoalProgress.mockReset().mockResolvedValue(50);
  h.deleteGoal.mockReset().mockResolvedValue(undefined);
  h.getStyles.mockReset().mockResolvedValue([STYLE]);
  h.navigate.mockReset();
  vi.mocked(Alert.alert).mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("S7 mount 時の 判定 -> invalidate -> 取得", () => {
  it("calls が厳密に ['judge','invalidate','fetch'] (各1回)。judge は userId 引数、invalidate は goalKeys.all", async () => {
    renderScreen();
    await flush();
    expect(h.calls).toEqual(["judge", "invalidate", "fetch"]);
    expect(h.judge).toHaveBeenCalledTimes(1);
    expect(h.judge).toHaveBeenCalledWith("user-1");
    expect(invalidateKeys).toEqual([["goals"]]);
  });

  it("judge 未解決の間は fetch が呼ばれず、解決後に取得される (並列化検出)", async () => {
    let release!: () => void;
    h.judge.mockImplementation(() => new Promise<void>((r) => { h.calls.push("judge"); release = r; }));
    renderScreen();
    await flush();
    expect(h.calls).toEqual(["judge"]);
    expect(h.getGoals).not.toHaveBeenCalled();
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 30)); });
    expect(h.calls).toEqual(["judge", "invalidate", "fetch"]);
  });

  it("判定前キャッシュ (未達成) があっても、判定後は invalidate により achieved 側の最新が表示される", async () => {
    renderScreen();
    // 判定前の古いキャッシュを仕込む (staleTime 5分内の古い一覧)
    qc.setQueryData(["goals", "list", undefined], { goals: [goal("g1", { status: "active", competition_id: "c1" })], competitions: [comp("c1", "テスト大会")] });
    h.getGoals.mockImplementation(async () => { h.calls.push("fetch"); return [goal("g1", { status: "achieved", competition_id: "c1" })]; });
    await flush();
    await waitFor(() => expect(screen.getByText("達成！")).toBeTruthy());
  });

  it("判定が reject しても一覧は表示される (エラー画面にならない)", async () => {
    h.judge.mockImplementation(async () => { h.calls.push("judge"); throw new Error("SECRET_RAW_JUDGE"); });
    renderScreen();
    await flush();
    expect(screen.getByText("テスト大会")).toBeTruthy();
    expect(screen.queryByText("目標一覧の取得に失敗しました")).toBeNull();
    expect(document.body.textContent).not.toContain("SECRET_RAW_JUDGE");
  });

  it("userId が無い間は判定も取得も走らない", async () => {
    h.userId = undefined;
    renderScreen();
    await flush();
    expect(h.judge).not.toHaveBeenCalled();
    expect(h.getGoals).not.toHaveBeenCalled();
  });

  it("判定中に unmount してもクラッシュせず、その後 judge が解決しても取得・例外が起きない", async () => {
    let release!: () => void;
    h.judge.mockImplementation(() => new Promise<void>((r) => { h.calls.push("judge"); release = r; }));
    const { unmount } = renderScreen();
    await flush();
    unmount();
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 30)); });
    expect(h.calls).toEqual(["judge", "invalidate"]);
    expect(h.getGoals).not.toHaveBeenCalled();
  });
});

describe("フォーカス / pull-to-refresh / 並行防止 (inFlightRef)", () => {
  it("pull-to-refresh -> 再度 judge -> invalidate -> fetch の順で1周する", async () => {
    renderScreen();
    await flush();
    h.calls.length = 0;
    await act(async () => { await h.refresh!(); });
    await flush();
    expect(h.calls).toEqual(["judge", "invalidate", "fetch"]);
  });

  it("フォーカスのたびに1周する (目標タブ再訪で最新化)", async () => {
    renderScreen();
    await flush();
    h.calls.length = 0;
    await fireFocus();
    expect(h.calls).toEqual(["judge", "invalidate", "fetch"]);
  });

  it("判定中に focus と pull-to-refresh が重なっても judge は1回だけ (同じ1周に相乗り)", async () => {
    let release!: () => void;
    h.judge.mockImplementation(() => new Promise<void>((r) => { h.calls.push("judge"); release = r; }));
    renderScreen();
    await flush();
    await act(async () => {
      h.focusCallbacks.forEach((cb) => cb());
      void h.refresh!();
      void h.refresh!();
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(h.judge).toHaveBeenCalledTimes(1);
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 30)); });
    expect(h.calls.filter((c) => c === "judge")).toHaveLength(1);
    expect(h.calls.filter((c) => c === "invalidate")).toHaveLength(1);
  });

  it("1周が終わった後の次の refresh は新しい judge を走らせる (inFlight が解放される)", async () => {
    renderScreen();
    await flush();
    await act(async () => { await h.refresh!(); });
    await act(async () => { await h.refresh!(); });
    expect(h.judge).toHaveBeenCalledTimes(3);
  });
});

describe("S9 状態表示 (一覧)", () => {
  it("ローディング: 初回の判定中は一覧クエリを開始せず、Loading 表示 (画面タイトルは表示しない)", async () => {
    h.judge.mockImplementation(() => new Promise<void>(() => {}));
    renderScreen();
    await flush();
    expect(screen.queryByText("目標管理")).toBeNull();
    expect(screen.getByText("Loading...")).toBeTruthy();
    expect(h.getGoals).not.toHaveBeenCalled();
  });

  it("[v7+] 一覧にも画面タイトル (目標管理) は表示されない (ヘッダーはナビ側/タブラベルのみ)", async () => {
    h.getGoals.mockImplementation(async () => [goal("g1", { competition_id: "c1" })]);
    renderScreen();
    await flush();
    expect(screen.getByText("テスト大会")).toBeTruthy();
    expect(screen.queryByText("目標管理")).toBeNull();
  });

  it("[L3] ローディングは fullScreen の LoadingSpinner (ダッシュボードと同じ): 全面コンテナ (flex:1) + 読み込み中の文言。初回の判定中と一覧取得中の両方", async () => {
    h.judge.mockImplementation(() => new Promise<void>(() => {}));
    renderScreen();
    await flush();
    expect(screen.getByText("読み込み中...")).toBeTruthy();
    const spinner = screen.getByText("Loading...");
    let n: HTMLElement | null = spinner.parentElement;
    let flexFill = false;
    while (n) { if (n.style.flex === "1 1 0%" || n.style.flexGrow === "1") { flexFill = true; break; } n = n.parentElement; }
    expect(flexFill).toBe(true);
  });

  it("[L3] GoalsScreen のローディング3箇所はすべて <LoadingSpinner fullScreen ...> (ソースの現在内容)", () => {
    const src = require("fs").readFileSync(require("path").resolve(__dirname, "../GoalsScreen.tsx"), "utf8") as string;
    expect((src.match(/<LoadingSpinner fullScreen/g) ?? []).length).toBe(3);
    expect(src).not.toMatch(/<LoadingSpinner\s*\/>/);
  });

  it("[タイトル削除] ローディング・エラー・空・一覧のすべてで『目標管理』の画面タイトルが描画されない", async () => {
    // ローディング
    h.judge.mockImplementation(() => new Promise<void>(() => {}));
    const a = renderScreen();
    await flush();
    expect(screen.queryByText("目標管理")).toBeNull();
    a.unmount();
    h.judge.mockResolvedValue(undefined);
    // エラー
    h.getGoals.mockImplementation(async () => { throw new Error("x"); });
    const b = renderScreen();
    await flush();
    expect(screen.getByText("目標一覧の取得に失敗しました")).toBeTruthy();
    expect(screen.queryByText("目標管理")).toBeNull();
    b.unmount();
    // 空
    h.getGoals.mockImplementation(async () => []);
    const c = renderScreen();
    await flush();
    expect(screen.getByText("目標がありません")).toBeTruthy();
    expect(screen.queryByText("目標管理")).toBeNull();
    c.unmount();
  });

  it("空: 目標0件で list.empty / emptyDesc と新規作成ボタン", async () => {
    h.getGoals.mockImplementation(async () => { h.calls.push("fetch"); return []; });
    renderScreen();
    await flush();
    expect(screen.getByText("目標がありません")).toBeTruthy();
    expect(screen.getByText("下のボタンから新規作成してください")).toBeTruthy();
    expect(byLabel("新規目標作成")).toHaveLength(1);
  });

  it("エラー: 取得失敗で固定文言 + 再試行。生エラーは画面に出ない。再試行で 判定->invalidate->取得 を1周 (A3)", async () => {
    h.getGoals.mockImplementation(async () => { h.calls.push("fetch"); throw new Error("SECRET_RAW_FETCH"); });
    renderScreen();
    await flush();
    expect(screen.getByText("目標一覧の取得に失敗しました")).toBeTruthy();
    expect(document.body.textContent).not.toContain("SECRET_RAW_FETCH");
    h.calls.length = 0;
    h.getGoals.mockImplementation(async () => { h.calls.push("fetch"); return [goal("g1", { competition_id: "c1" })]; });
    await act(async () => { fireEvent.click(screen.getByText("再試行")); await new Promise((r) => setTimeout(r, 50)); });
    expect(h.calls).toEqual(["judge", "invalidate", "fetch"]);
    expect(screen.getByText("テスト大会")).toBeTruthy();
  });
});

describe("v4 L6: エラー画面の再試行中はローディング表示 (修正前は赤でよい)", () => {
  it("再試行を押して判定が走っている間は、エラー画面を出し続けず Loading を表示する", async () => {
    h.getGoals.mockImplementation(async () => { h.calls.push("fetch"); throw new Error("x"); });
    renderScreen();
    await flush();
    expect(screen.getByText("目標一覧の取得に失敗しました")).toBeTruthy();
    let release!: () => void;
    h.judge.mockImplementation(() => new Promise<void>((r) => { release = r; }));
    await act(async () => { fireEvent.click(screen.getByText("再試行")); await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getByText("Loading...")).toBeTruthy();
    expect(screen.queryByText("目標一覧の取得に失敗しました")).toBeNull();
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 50)); });
  });
});

describe("一覧の内容", () => {
  it("competition===null (選択可能大会に無い): '大会情報なし' + editUnavailableReason、編集ボタン無し、削除ボタン有り", async () => {
    h.getSelectableCompetitions.mockResolvedValue([]);
    renderScreen();
    await flush();
    expect(screen.getByText("大会情報なし")).toBeTruthy();
    expect(screen.getByText("大会情報がないため編集できません")).toBeTruthy();
    expect(byLabel("編集")).toHaveLength(0);
    expect(byLabel("削除")).toHaveLength(1);
  });

  it("competition あり: 編集ボタン有り。チーム大会でもタイトルが解決される", async () => {
    h.getSelectableCompetitions.mockResolvedValue([{ ...comp("c1", "チーム大会X"), team_id: "t1" }]);
    renderScreen();
    await flush();
    expect(screen.getByText("チーム大会X")).toBeTruthy();
    expect(byLabel("編集")).toHaveLength(1);
  });

  it("達成率: null -> '未設定'、reject -> '0%'、数値 -> 'N%'", async () => {
    h.getGoals.mockImplementation(async () => [
      goal("g1", { competition_id: "c1" }), goal("g2", { competition_id: "c1" }), goal("g3", { competition_id: "c1" }),
    ]);
    h.calculateGoalProgress.mockImplementation(async (id: string) => {
      if (id === "g1") return null;
      if (id === "g2") throw new Error("boom");
      return 75;
    });
    renderScreen();
    await flush();
    expect(screen.getByText("未設定")).toBeTruthy();
    expect(screen.getByText("0%")).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy();
  });

  it("達成率は目標ごとに並列取得: 3件を未解決のままにしても3件とも呼び出しが開始される (逐次 await でない)", async () => {
    h.getGoals.mockImplementation(async () => [goal("g1", { competition_id: "c1" }), goal("g2", { competition_id: "c1" }), goal("g3", { competition_id: "c1" })]);
    h.calculateGoalProgress.mockImplementation(() => new Promise(() => {}));
    renderScreen();
    await flush();
    expect(h.calculateGoalProgress.mock.calls.map((c) => c[0]).sort()).toEqual(["g1", "g2", "g3"]);
  });

  it("achieved の目標は達成バッジ。active には出ない", async () => {
    h.getGoals.mockImplementation(async () => [goal("g1", { status: "achieved", competition_id: "c1" }), goal("g2", { competition_id: "c1" })]);
    renderScreen();
    await flush();
    expect(screen.getAllByText("達成！")).toHaveLength(1);
  });

  it("遷移: カード -> GoalDetail {goalId}、新規 -> GoalForm {}、編集 -> GoalForm {goalId}", async () => {
    renderScreen();
    await flush();
    fireEvent.click(byLabel("テスト大会 100m 自由形")[0]!);
    expect(h.navigate).toHaveBeenLastCalledWith("GoalDetail", { goalId: "g1" });
    fireEvent.click(byLabel("新規目標作成")[0]!);
    expect(h.navigate).toHaveBeenLastCalledWith("GoalForm", {});
    fireEvent.click(byLabel("編集")[0]!);
    expect(h.navigate).toHaveBeenLastCalledWith("GoalForm", { goalId: "g1" });
  });
});

describe("S3 一覧からの削除", () => {
  const pressDelete = () => { fireEvent.click(byLabel("削除")[0]!); };
  const confirm = async () => {
    const buttons = vi.mocked(Alert.alert).mock.calls[0]![2] as Array<{ style?: string; onPress?: () => Promise<void> }>;
    await act(async () => { await buttons.find((b) => b.style === "destructive")!.onPress!(); });
  };

  it("削除タップ -> 確認ダイアログ。キャンセル側には onPress が無く deleteGoal は呼ばれない", async () => {
    renderScreen();
    await flush();
    pressDelete();
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = vi.mocked(Alert.alert).mock.calls[0]!;
    expect([title, message]).toEqual(["削除", "この目標を削除しますか？"]);
    expect((buttons as Array<{ style?: string; onPress?: unknown }>).find((b) => b.style === "cancel")!.onPress).toBeUndefined();
    expect(h.deleteGoal).not.toHaveBeenCalled();
  });

  it("確認 OK -> deleteGoal('g1') が1回 -> goalKeys.all を invalidate", async () => {
    renderScreen();
    await flush();
    invalidateKeys.length = 0;
    pressDelete();
    await confirm();
    expect(h.deleteGoal).toHaveBeenCalledTimes(1);
    expect(h.deleteGoal).toHaveBeenCalledWith("g1");
    expect(invalidateKeys).toEqual([["goals"]]);
  });

  it("deleteGoal が throw (RLS 0行相当) -> 固定文言で通知。生エラーは出さず握りつぶさない", async () => {
    h.deleteGoal.mockRejectedValue(new Error("SECRET_RAW_RLS"));
    renderScreen();
    await flush();
    pressDelete();
    await confirm();
    expect(Alert.alert).toHaveBeenCalledTimes(2);
    const [t2, m2] = vi.mocked(Alert.alert).mock.calls[1]!;
    expect(m2).toBe("目標の削除に失敗しました");
    expect(String(t2) + String(m2)).not.toContain("SECRET_RAW_RLS");
  });
});
