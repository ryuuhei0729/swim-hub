// =============================================================================
// hooks/__tests__/useExpiredGoalCheck.test.tsx  (S8, D7, U4, A4)
// =============================================================================
// Dashboard の期限切れチェック本体。順序: judge -> getExpiredGoals -> (目標0件なら) getExpiredMilestones。
// 壊したら赤: 判定を getExpired* の後に回す / 目標とマイルストーンの優先逆転 / ガードを state 化して再実行 /
//   スキップで次を出す / 保存後に次を取らない
// StrictMode: renderHook の wrapper では effect の二重実行が起きない (実測) ため、StrictMode ケースはコンポーネント経由の render で検証している。
// 1回ガードは userId 変化・再レンダーでも検証。unmount ケースの getExpired* 回数 (<=1) は React 18 では判別力が弱い。
// =============================================================================
import * as React from "react";
import { render, renderHook, act, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  calls: [] as string[],
  judge: vi.fn(),
  getExpiredGoals: vi.fn(),
  getExpiredMilestones: vi.fn(),
}));
vi.mock("@apps/shared/api/goals", () => ({
  GoalAPI: class {
    updateAllMilestoneStatuses = h.judge;
    getExpiredGoals = h.getExpiredGoals;
    getExpiredMilestones = h.getExpiredMilestones;
  },
}));

import { useExpiredGoalCheck } from "../useExpiredGoalCheck";

const supabase = {} as never;
const goal = (id: string) => ({ id, milestones: [] }) as never;
const ms = (id: string) => ({ id }) as never;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

beforeEach(() => {
  h.calls.length = 0;
  h.judge.mockReset().mockImplementation(async () => { h.calls.push("judge"); });
  h.getExpiredGoals.mockReset().mockImplementation(async () => { h.calls.push("goals"); return []; });
  h.getExpiredMilestones.mockReset().mockImplementation(async () => { h.calls.push("milestones"); return []; });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("起動時チェック", () => {
  it("期限切れ目標あり: calls=['judge','goals']、先頭1件のみ、マイルストーンは取らない", async () => {
    h.getExpiredGoals.mockImplementation(async () => { h.calls.push("goals"); return [goal("g1"), goal("g2"), goal("g3")]; });
    const { result } = renderHook(() => useExpiredGoalCheck(supabase, "u1"));
    await settle();
    expect(h.calls).toEqual(["judge", "goals"]);
    expect(h.judge).toHaveBeenCalledWith("u1");
    expect((result.current.expiredGoal as unknown as { id: string }).id).toBe("g1");
    expect(result.current.expiredMilestone).toBeNull();
  });

  it("目標0件でマイルストーンあり: calls=['judge','goals','milestones']、先頭1件", async () => {
    h.getExpiredMilestones.mockImplementation(async () => { h.calls.push("milestones"); return [ms("m1"), ms("m2")]; });
    const { result } = renderHook(() => useExpiredGoalCheck(supabase, "u1"));
    await settle();
    expect(h.calls).toEqual(["judge", "goals", "milestones"]);
    expect(result.current.expiredGoal).toBeNull();
    expect((result.current.expiredMilestone as unknown as { id: string }).id).toBe("m1");
  });

  it("両方なし: どちらも null", async () => {
    const { result } = renderHook(() => useExpiredGoalCheck(supabase, "u1"));
    await settle();
    expect(result.current.expiredGoal).toBeNull();
    expect(result.current.expiredMilestone).toBeNull();
  });

  it("judge が reject しても getExpired* に進み、結果を返す", async () => {
    h.judge.mockImplementation(async () => { h.calls.push("judge"); throw new Error("boom"); });
    h.getExpiredGoals.mockImplementation(async () => { h.calls.push("goals"); return [goal("g1")]; });
    const { result } = renderHook(() => useExpiredGoalCheck(supabase, "u1"));
    await settle();
    expect(h.calls).toEqual(["judge", "goals"]);
    expect(result.current.expiredGoal).not.toBeNull();
  });

  it("getExpiredGoals が失敗してもクラッシュせず、モーダルは出ない", async () => {
    h.getExpiredGoals.mockRejectedValue(new Error("SECRET"));
    const { result } = renderHook(() => useExpiredGoalCheck(supabase, "u1"));
    await settle();
    expect(result.current.expiredGoal).toBeNull();
    expect(result.current.expiredMilestone).toBeNull();
  });

  it("userId 未確定の間は何も呼ばず、確定後に1回だけ走る。以後の userId 変化・再レンダーでは再実行しない (U4 1回ガード)", async () => {
    const { rerender } = renderHook(({ uid }: { uid: string | undefined }) => useExpiredGoalCheck(supabase, uid), {
      initialProps: { uid: undefined as string | undefined },
    });
    await settle();
    expect(h.judge).not.toHaveBeenCalled();
    rerender({ uid: "u1" });
    await settle();
    expect(h.judge).toHaveBeenCalledTimes(1);
    rerender({ uid: "u1" });
    rerender({ uid: "u2" });
    await settle();
    expect(h.judge).toHaveBeenCalledTimes(1);
    expect(h.getExpiredGoals).toHaveBeenCalledTimes(1);
  });

  it("判定中に unmount しても、解決後に console.error が出ず、getExpired* は判定の続きで1回ずつ以内しか呼ばれない", async () => {
    let release!: () => void;
    h.judge.mockImplementation(() => new Promise<void>((r) => { release = r; }));
    const errSpy = vi.mocked(console.error);
    const { unmount } = renderHook(() => useExpiredGoalCheck(supabase, "u1"));
    await settle();
    unmount();
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 30)); });
    expect(errSpy).not.toHaveBeenCalled();
    expect(h.getExpiredGoals.mock.calls.length).toBeLessThanOrEqual(1);
    expect(h.getExpiredMilestones.mock.calls.length).toBeLessThanOrEqual(1);
    expect(h.judge).toHaveBeenCalledTimes(1);
  });
});

describe("L5 StrictMode (開発時の effect 二重実行・cleanup 再実行)", () => {
  it("<StrictMode> でも判定は1回だけで、結果 (期限切れ目標) が表示される (isMountedRef を cleanup 後に true へ戻す)", async () => {
    h.getExpiredGoals.mockImplementation(async () => { h.calls.push("goals"); return [goal("g1")]; });
    // renderHook + wrapper では StrictMode の effect 二重実行が起きない (実測) ため、コンポーネント経由で render する
    function Probe() {
      const state = useExpiredGoalCheck(supabase, "u1");
      return <span data-testid="probe">{(state.expiredGoal as unknown as { id: string } | null)?.id ?? "none"}</span>;
    }
    const view = render(<React.StrictMode><Probe /></React.StrictMode>);
    await settle();
    expect(h.judge).toHaveBeenCalledTimes(1);
    expect(h.getExpiredGoals).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("probe").textContent).toBe("g1");
  });
});

describe("スキップ (A4) と連続表示", () => {
  it("skipGoal: 閉じるだけ。そのマウント中は getExpired* を追加で呼ばず、次を出さない", async () => {
    h.getExpiredGoals.mockImplementation(async () => { h.calls.push("goals"); return [goal("g1"), goal("g2")]; });
    const { result } = renderHook(() => useExpiredGoalCheck(supabase, "u1"));
    await settle();
    h.calls.length = 0;
    act(() => result.current.skipGoal());
    await settle();
    expect(result.current.expiredGoal).toBeNull();
    expect(result.current.expiredMilestone).toBeNull();
    expect(h.calls).toEqual([]);
  });

  it("skipMilestone も同様", async () => {
    h.getExpiredMilestones.mockImplementation(async () => { h.calls.push("milestones"); return [ms("m1"), ms("m2")]; });
    const { result } = renderHook(() => useExpiredGoalCheck(supabase, "u1"));
    await settle();
    h.calls.length = 0;
    act(() => result.current.skipMilestone());
    await settle();
    expect(result.current.expiredMilestone).toBeNull();
    expect(h.calls).toEqual([]);
  });

  it("handleGoalSaved: 保存後だけ getExpiredGoals を再取得して次の目標を連続表示。尽きたらマイルストーンへ", async () => {
    const queue = [[goal("g1"), goal("g2")], [goal("g2")], []];
    h.getExpiredGoals.mockImplementation(async () => { h.calls.push("goals"); return queue.shift() ?? []; });
    h.getExpiredMilestones.mockImplementation(async () => { h.calls.push("milestones"); return [ms("m9")]; });
    const { result } = renderHook(() => useExpiredGoalCheck(supabase, "u1"));
    await settle();
    expect((result.current.expiredGoal as unknown as { id: string }).id).toBe("g1");
    await act(async () => { await result.current.handleGoalSaved(); });
    expect((result.current.expiredGoal as unknown as { id: string }).id).toBe("g2");
    await act(async () => { await result.current.handleGoalSaved(); });
    expect(result.current.expiredGoal).toBeNull();
    expect((result.current.expiredMilestone as unknown as { id: string }).id).toBe("m9");
    expect(h.judge).toHaveBeenCalledTimes(1);
  });

  it("handleMilestoneSaved: 次の期限切れマイルストーンを出し、尽きたら null", async () => {
    const queue = [[ms("m1"), ms("m2")], [ms("m2")], []];
    h.getExpiredMilestones.mockImplementation(async () => { h.calls.push("milestones"); return queue.shift() ?? []; });
    const { result } = renderHook(() => useExpiredGoalCheck(supabase, "u1"));
    await settle();
    expect((result.current.expiredMilestone as unknown as { id: string }).id).toBe("m1");
    await act(async () => { await result.current.handleMilestoneSaved(); });
    expect((result.current.expiredMilestone as unknown as { id: string }).id).toBe("m2");
    await act(async () => { await result.current.handleMilestoneSaved(); });
    expect(result.current.expiredMilestone).toBeNull();
  });

  it("保存後の再取得が失敗したらモーダルを閉じる (無限ループ・クラッシュしない)", async () => {
    h.getExpiredGoals.mockImplementationOnce(async () => [goal("g1")]);
    const { result } = renderHook(() => useExpiredGoalCheck(supabase, "u1"));
    await settle();
    h.getExpiredGoals.mockRejectedValue(new Error("x"));
    await act(async () => { await result.current.handleGoalSaved(); });
    expect(result.current.expiredGoal).toBeNull();
  });
});
