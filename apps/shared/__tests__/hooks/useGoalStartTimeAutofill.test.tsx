// Sprint Contract (goal start time autofill): useGoalStartTimeAutofill
// mobile GoalFormScreen.test.tsx「v7 A」系のシナリオをフック単位で再現 + web 用の S9 (開閉・resetSignal)。
// 方針: getBestTimes は引数・呼び出し回数を assert。fixture には「避けるべき行」(別水路・リレーのみ・別種目) を含める。
// onApply はレンダーごとに別関数 (inline) を渡し、identity の変化で再適用されないことも固定する。
// 壊したら赤: 水路条件の脱落 / 古い応答で上書き / 編集モード初期の上書き / 手入力キーの保護脱落 /
//   active=false で取得 / 開き直しで基準・手入力・キャッシュを持ち越す
import * as React from "react";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BestTime } from "../../types/ui";

const h = vi.hoisted(() => ({
  getBestTimes: vi.fn(),
  ctor: vi.fn(),
}));
vi.mock("../../api/records", () => ({
  RecordAPI: class {
    constructor(supabase: unknown) {
      h.ctor(supabase);
    }
    getBestTimes = h.getBestTimes;
  },
}));

import { recordKeys } from "../../hooks/queries/keys";
import { useGoalStartTimeAutofill } from "../../hooks/useGoalStartTimeAutofill";

const bt = (o: Partial<BestTime> & { id: string; style_id: number; pool_type: number; time: number }): BestTime => ({
  created_at: "",
  is_relaying: false,
  style: { name_jp: "x", distance: 100 },
  ...o,
});
const BESTS: BestTime[] = [
  bt({ id: "s1-short", style_id: 1, pool_type: 0, time: 55 }),
  bt({ id: "s1-long", style_id: 1, pool_type: 1, time: 58, relayingTime: { id: "r", time: 50, created_at: "" } }),
  bt({ id: "s2-long", style_id: 2, pool_type: 1, time: 27 }),
  bt({ id: "s2-short-relay", style_id: 2, pool_type: 0, time: 20, is_relaying: true }),
];

type Props = {
  active: boolean;
  isInitialized: boolean;
  isEdit: boolean;
  styleId: string;
  poolType: number | undefined;
  resetSignal: unknown;
};
const BASE: Props = { active: true, isInitialized: true, isEdit: false, styleId: "", poolType: undefined, resetSignal: "s0" };
const SUPABASE = { tag: "supabase" } as never;

let qc: QueryClient;
function mount(initial: Partial<Props> = {}, opts: { strict?: boolean; client?: QueryClient } = {}) {
  qc = opts.client ?? new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const onApply = vi.fn();
  const wrapper = ({ children }: { children: React.ReactNode }) => {
    const inner = <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    return opts.strict ? <React.StrictMode>{inner}</React.StrictMode> : inner;
  };
  const r = renderHook(
    (p: Props) =>
      useGoalStartTimeAutofill({
        supabase: SUPABASE,
        ...p,
        // レンダーごとに別の関数 (identity が変わっても再適用しない)
        onApply: (v: number | null) => onApply(v),
      }),
    { initialProps: { ...BASE, ...initial }, wrapper },
  );
  let current: Props = { ...BASE, ...initial };
  const update = async (patch: Partial<Props>) => {
    current = { ...current, ...patch };
    r.rerender(current);
    await settle();
  };
  return { ...r, onApply, update };
}
const settle = () =>
  act(async () => {
    await new Promise((res) => setTimeout(res, 60));
  });
const applied = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.map((c) => c[0]);

function deferred() {
  const pending: Array<(v: BestTime[]) => void> = [];
  h.getBestTimes.mockImplementation(() => new Promise<BestTime[]>((res) => pending.push(res)));
  const resolveAll = async (v: BestTime[] = BESTS) => {
    await act(async () => {
      pending.forEach((f) => f(v));
      await new Promise((res) => setTimeout(res, 60));
    });
  };
  return { pending, resolveAll };
}

beforeEach(() => {
  h.getBestTimes.mockReset();
  h.ctor.mockReset();
  h.getBestTimes.mockResolvedValue(BESTS);
});

describe("自動入力 (mobile: 種目を選ぶと『種目 × 水路』のベストが入る)", () => {
  it("長水路で種目1: 長水路の 58 が入る (短水路 55 とリレー引き継ぎ 50 は選ばない)。取得は1回・引数なし", async () => {
    const { onApply, update } = mount();
    await update({ styleId: "1", poolType: 1 });
    expect(applied(onApply)).toEqual([58]);
    expect(h.getBestTimes).toHaveBeenCalledTimes(1);
    expect(h.getBestTimes).toHaveBeenCalledWith();
  });

  it("RecordAPI は渡した supabase で生成される", async () => {
    const { update } = mount();
    await update({ styleId: "1", poolType: 1 });
    expect(h.ctor).toHaveBeenCalledWith(SUPABASE);
  });

  it("短水路 (pool_type=0) は falsy として取りこぼさず 55", async () => {
    const { onApply, update } = mount();
    await update({ styleId: "1", poolType: 0 });
    expect(applied(onApply)).toEqual([55]);
  });

  it("水路の取り違え: 長水路 (1) を選んだとき 55 (短水路) は入らない", async () => {
    const { onApply, update } = mount();
    await update({ styleId: "1", poolType: 1 });
    expect(applied(onApply)).not.toContain(55);
  });

  it("種目を先に選び、後から水路が決まっても (揃った時点で) 入る。水路未確定の間は何も呼ばない", async () => {
    const { onApply, update } = mount();
    await update({ styleId: "1", poolType: undefined });
    expect(onApply).not.toHaveBeenCalled();
    await update({ poolType: 1 });
    expect(applied(onApply)).toEqual([58]);
  });

  it("水路が決まっても種目が空の間は何も呼ばない", async () => {
    const { onApply, update } = mount();
    await update({ styleId: "", poolType: 0 });
    expect(onApply).not.toHaveBeenCalled();
  });

  it("isInitialized=false の間は呼ばない。true になったら入る", async () => {
    const { onApply, update } = mount({ isInitialized: false });
    await update({ styleId: "1", poolType: 1 });
    expect(onApply).not.toHaveBeenCalled();
    await update({ isInitialized: true });
    expect(applied(onApply)).toEqual([58]);
  });

  it("onApply の identity が変わる再レンダーでは再適用しない", async () => {
    const { onApply, update, rerender } = mount();
    await update({ styleId: "1", poolType: 1 });
    rerender({ ...BASE, styleId: "1", poolType: 1 });
    rerender({ ...BASE, styleId: "1", poolType: 1 });
    await settle();
    expect(applied(onApply)).toEqual([58]);
  });

  it("time が 0 のベストしか無ければ null (0 を初期タイムに入れない)", async () => {
    h.getBestTimes.mockResolvedValue([bt({ id: "z", style_id: 1, pool_type: 0, time: 0 })]);
    const { onApply, update } = mount();
    await update({ styleId: "1", poolType: 0 });
    expect(applied(onApply)).toEqual([null]);
  });
});

describe("種目・水路の変更", () => {
  it("種目を変えると入れ直す (1:長水路 58 -> 2:長水路 27)", async () => {
    const { onApply, update } = mount();
    await update({ styleId: "1", poolType: 1 });
    await update({ styleId: "2" });
    expect(applied(onApply)).toEqual([58, 27]);
    expect(h.getBestTimes).toHaveBeenCalledTimes(1);
  });

  it("大会変更 (別の水路): 長水路 58 -> 短水路 55", async () => {
    const { onApply, update } = mount();
    await update({ styleId: "1", poolType: 1 });
    await update({ poolType: 0 });
    expect(applied(onApply)).toEqual([58, 55]);
  });

  it("大会変更 (同じ水路): キーが変わらないので再適用しない", async () => {
    const { onApply, update } = mount();
    await update({ styleId: "1", poolType: 1 });
    await update({ poolType: 1 });
    expect(applied(onApply)).toEqual([58]);
  });

  it("新規大会の水路切替: 短水路 55 -> 長水路 58 -> 短水路 55。リレーのみの種目2 短水路は null", async () => {
    const { onApply, update } = mount();
    await update({ styleId: "1", poolType: 0 });
    await update({ poolType: 1 });
    await update({ poolType: 0 });
    await update({ styleId: "2" });
    expect(applied(onApply)).toEqual([55, 58, 55, null]);
  });

  it("水路が undefined (大会選択解除) になっても何も呼ばず、短水路に倒さない", async () => {
    const { onApply, update } = mount();
    await update({ styleId: "1", poolType: 1 });
    await update({ poolType: undefined });
    expect(applied(onApply)).toEqual([58]);
  });
});

describe("該当なし・取得失敗", () => {
  it("該当なし (その水路にベストが無い) は null を渡して空にする", async () => {
    h.getBestTimes.mockResolvedValue([bt({ id: "x", style_id: 1, pool_type: 1, time: 58 })]);
    const { onApply, update } = mount();
    await update({ styleId: "1", poolType: 0 });
    expect(applied(onApply)).toEqual([null]);
  });

  it("取得失敗: onApply を呼ばない (値を変えない)。isLoadingBest は false に戻る", async () => {
    h.getBestTimes.mockRejectedValue(new Error("fail"));
    const { onApply, update, result } = mount();
    await update({ styleId: "1", poolType: 1 });
    expect(onApply).not.toHaveBeenCalled();
    expect(result.current.isLoadingBest).toBe(false);
    expect(h.getBestTimes).toHaveBeenCalledTimes(1);
  });

  it("取得失敗中に種目を変え、再取得が成功すると、そのときの種目のベストが入る", async () => {
    h.getBestTimes.mockRejectedValue(new Error("fail"));
    const { onApply, update } = mount();
    await update({ styleId: "1", poolType: 1 });
    await update({ styleId: "2" });
    expect(onApply).not.toHaveBeenCalled();
    h.getBestTimes.mockResolvedValue(BESTS);
    await act(async () => {
      await qc.refetchQueries();
      await new Promise((res) => setTimeout(res, 60));
    });
    expect(applied(onApply)).toEqual([27]);
  });
});

describe("手入力の保護 (markTouched)", () => {
  it("同じ種目 × 水路のあいだは手入力 (markTouched) 後に上書きしない", async () => {
    const { onApply, update, result } = mount();
    await update({ styleId: "1", poolType: 1 });
    act(() => result.current.markTouched());
    await update({ poolType: 1 });
    expect(applied(onApply)).toEqual([58]);
  });

  it("取得中に手入力 -> 取得完了しても上書きしない。その後に種目を変えると入る", async () => {
    const { resolveAll } = deferred();
    const { onApply, update, result } = mount();
    await update({ styleId: "1", poolType: 1 });
    act(() => result.current.markTouched());
    await resolveAll();
    expect(onApply).not.toHaveBeenCalled();
    await update({ styleId: "2" });
    expect(applied(onApply)).toEqual([27]);
  });

  it("種目を変えると手入力済みでも入れ直す (1:58 -> 手入力 -> 2:27)", async () => {
    const { onApply, update, result } = mount();
    await update({ styleId: "1", poolType: 1 });
    act(() => result.current.markTouched());
    await update({ styleId: "2" });
    expect(applied(onApply)).toEqual([58, 27]);
  });

  it("手入力した種目に戻ってきても入れ直す (1:58 -> 手入力 -> 2:27 -> 1:58)", async () => {
    const { onApply, update, result } = mount();
    await update({ styleId: "1", poolType: 1 });
    act(() => result.current.markTouched());
    await update({ styleId: "2" });
    await update({ styleId: "1" });
    expect(applied(onApply)).toEqual([58, 27, 58]);
  });

  it("手入力した水路に戻ってきても入れ直す (長水路 58 -> 手入力 -> 短水路 55 -> 長水路 58)", async () => {
    const { onApply, update, result } = mount();
    await update({ styleId: "1", poolType: 1 });
    act(() => result.current.markTouched());
    await update({ poolType: 0 });
    await update({ poolType: 1 });
    expect(applied(onApply)).toEqual([58, 55, 58]);
  });
});

describe("レース (取得中に A -> B -> C)", () => {
  it("取得中は onApply が呼ばれず、データ到着後に最後の種目 C のベストだけが入る。取得は1回", async () => {
    const { resolveAll } = deferred();
    const { onApply, update } = mount();
    await update({ styleId: "1", poolType: 1 });
    await update({ styleId: "2" });
    await update({ styleId: "1" });
    await update({ styleId: "2" });
    expect(onApply).not.toHaveBeenCalled();
    await resolveAll();
    expect(applied(onApply)).toEqual([27]);
    expect(h.getBestTimes).toHaveBeenCalledTimes(1);
  });
});

describe("編集モードの基準", () => {
  it("開いた直後 (取得完了後も) onApply を呼ばない", async () => {
    const { onApply, update } = mount({ isEdit: true, styleId: "1", poolType: 0 });
    await settle();
    expect(onApply).not.toHaveBeenCalled();
    await update({});
    expect(onApply).not.toHaveBeenCalled();
    expect(h.getBestTimes).toHaveBeenCalledTimes(1);
  });

  it("取得が遅くても (データ未着のまま描画 -> 到着) 上書きしない", async () => {
    const { resolveAll } = deferred();
    const { onApply, update } = mount({ isEdit: true, styleId: "1", poolType: 0 });
    await settle();
    expect(onApply).not.toHaveBeenCalled();
    await resolveAll();
    expect(onApply).not.toHaveBeenCalled();
    await update({});
    expect(onApply).not.toHaveBeenCalled();
  });

  it("goal の読み込み完了 (isInitialized false -> true) 後も、その時点の種目・水路を基準にするだけで上書きしない", async () => {
    const { onApply, update } = mount({ isEdit: true, isInitialized: false });
    await settle();
    await update({ isInitialized: true, styleId: "1", poolType: 0 });
    expect(onApply).not.toHaveBeenCalled();
  });

  it("ユーザーが種目を変えたときだけ入る (種目2 短水路はリレーのみ -> null)。種目1 に戻すと 55", async () => {
    const { onApply, update } = mount({ isEdit: true, styleId: "1", poolType: 0 });
    await settle();
    await update({ styleId: "2" });
    expect(applied(onApply)).toEqual([null]);
    await update({ styleId: "1" });
    expect(applied(onApply)).toEqual([null, 55]);
  });

  it("ユーザーが大会 (水路) を変えたときだけ入る (短水路 -> 長水路 58)", async () => {
    const { onApply, update } = mount({ isEdit: true, styleId: "1", poolType: 0 });
    await settle();
    await update({ poolType: 1 });
    expect(applied(onApply)).toEqual([58]);
  });

  it("基準記録後、取得完了前に種目を変えると、到着後にその種目のベストが入る", async () => {
    const { resolveAll } = deferred();
    const { onApply, update } = mount({ isEdit: true, styleId: "1", poolType: 1 });
    await update({ styleId: "2" });
    expect(onApply).not.toHaveBeenCalled();
    await resolveAll();
    expect(applied(onApply)).toEqual([27]);
  });
});

describe("鮮度 (古いキャッシュを使わない)", () => {
  const key = [...recordKeys.all, "bestTimesForForm"];

  it("古いベスト (60) がキャッシュ済みでも使わず、新しい取得 (58) が届いてから入る。getBestTimes が呼ばれる", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    // 開く前に取得済みだったことを updatedAt の明示注入で決定的に作る (実時間待ちに依存しない)
    client.setQueryData(key, [bt({ id: "old", style_id: 1, pool_type: 1, time: 60 })], { updatedAt: 1 });
    const keepAlive = new QueryObserver(client, { queryKey: key, queryFn: () => [], gcTime: Infinity, enabled: false }).subscribe(() => {});
    const { resolveAll } = deferred();
    const { onApply, update } = mount({}, { client });
    await update({ styleId: "1", poolType: 1 });
    expect(onApply).not.toHaveBeenCalled();
    expect(h.getBestTimes).toHaveBeenCalledTimes(1);
    await resolveAll([bt({ id: "new", style_id: 1, pool_type: 1, time: 58 })]);
    expect(applied(onApply)).toEqual([58]);
    keepAlive();
  });

  it("クエリは recordKeys.all 配下の bestTimesForForm で、goalKeys の invalidate では再取得されない", async () => {
    const { update } = mount();
    await update({ styleId: "1", poolType: 1 });
    expect(qc.getQueryCache().find({ queryKey: key })).toBeDefined();
    const before = h.getBestTimes.mock.calls.length;
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ["goals"] });
      await new Promise((res) => setTimeout(res, 60));
    });
    expect(h.getBestTimes.mock.calls.length).toBe(before);
  });
});

describe("isLoadingBest", () => {
  it("取得中は true、完了で false", async () => {
    const { resolveAll } = deferred();
    const { update, result } = mount();
    await update({ styleId: "1", poolType: 1 });
    expect(result.current.isLoadingBest).toBe(true);
    await resolveAll();
    expect(result.current.isLoadingBest).toBe(false);
  });
});

describe("resetKey", () => {
  it("onApply を呼ぶたびに 1 ずつ増える (null を渡したときも)。呼ばれない更新では増えない", async () => {
    const { onApply, update, result } = mount();
    const r0 = result.current.resetKey;
    await update({ styleId: "1", poolType: 1 });
    expect(applied(onApply)).toEqual([58]);
    expect(result.current.resetKey).toBe(r0 + 1);
    await update({ poolType: 1 });
    expect(result.current.resetKey).toBe(r0 + 1);
    await update({ styleId: "2", poolType: 0 });
    expect(applied(onApply)).toEqual([58, null]);
    expect(result.current.resetKey).toBe(r0 + 2);
    await update({ styleId: "1" });
    expect(result.current.resetKey).toBe(r0 + 3);
  });

  it("onApply が呼ばれなければ増えない (取得失敗・編集モードの基準記録)", async () => {
    h.getBestTimes.mockRejectedValue(new Error("fail"));
    const a = mount();
    const a0 = a.result.current.resetKey;
    await a.update({ styleId: "1", poolType: 1 });
    expect(a.result.current.resetKey).toBe(a0);
    h.getBestTimes.mockResolvedValue(BESTS);
    const b = mount({ isEdit: true, styleId: "1", poolType: 0 });
    const b0 = b.result.current.resetKey;
    await settle();
    expect(b.result.current.resetKey).toBe(b0);
  });
});

describe("S9: active / resetSignal (web のモーダル常時マウント)", () => {
  it("active=false の間は取得しない・onApply も呼ばない。isLoadingBest も false", async () => {
    const { onApply, update, result } = mount({ active: false });
    await update({ styleId: "1", poolType: 1 });
    await settle();
    expect(h.getBestTimes).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
    expect(result.current.isLoadingBest).toBe(false);
  });

  it("active が false -> true になると取得して入る", async () => {
    const { onApply, update } = mount({ active: false, styleId: "1", poolType: 1 });
    await settle();
    expect(h.getBestTimes).not.toHaveBeenCalled();
    await update({ active: true });
    expect(h.getBestTimes).toHaveBeenCalledTimes(1);
    expect(applied(onApply)).toEqual([58]);
  });

  it("active が false になっても (閉じても) 既存の呼び出しは増えず、閉じている間にキー変更しても何も呼ばない", async () => {
    const { onApply, update } = mount();
    await update({ styleId: "1", poolType: 1 });
    await update({ active: false });
    await update({ styleId: "2" });
    expect(applied(onApply)).toEqual([58]);
    expect(h.getBestTimes).toHaveBeenCalledTimes(1);
  });

  it("開き直し (true->false->true): 前回の自動入力済みキー・手入力記録を持ち越さず、同じ種目 × 水路でも再度入る", async () => {
    const { onApply, update, result } = mount();
    await update({ styleId: "1", poolType: 1 });
    act(() => result.current.markTouched());
    await update({ active: false });
    await update({ active: true });
    expect(h.getBestTimes).toHaveBeenCalledTimes(2);
    expect(applied(onApply)).toEqual([58, 58]);
  });

  it("開き直したら、以前のデータではなく新しく取得したデータを使う (58 -> ベスト更新後 57)", async () => {
    const { onApply, update } = mount();
    await update({ styleId: "1", poolType: 1 });
    expect(applied(onApply)).toEqual([58]);
    await update({ active: false });
    const { resolveAll } = deferred();
    await update({ active: true });
    // 新しい取得が終わるまで古い 58 を再適用しない
    expect(applied(onApply)).toEqual([58]);
    await resolveAll([bt({ id: "new", style_id: 1, pool_type: 1, time: 57 })]);
    expect(applied(onApply)).toEqual([58, 57]);
    expect(h.getBestTimes).toHaveBeenCalledTimes(2);
  });

  it("開き直し (編集): 前回の基準を持ち越さない。別の goal (種目2) を開いても上書きせず基準だけ記録する", async () => {
    const { onApply, update } = mount({ isEdit: true, styleId: "1", poolType: 1 });
    await settle();
    await update({ active: false });
    await update({ active: true, styleId: "2" });
    expect(onApply).not.toHaveBeenCalled();
    // 基準 (2:1) の後でユーザーが変えたときだけ入る
    await update({ styleId: "1" });
    expect(applied(onApply)).toEqual([58]);
  });

  it("開き直し (編集): 取得が遅いまま閉じて別の goal で開き直しても上書きしない", async () => {
    const { resolveAll } = deferred();
    const { onApply, update } = mount({ isEdit: true, styleId: "1", poolType: 1 });
    await update({ active: false });
    await update({ active: true, styleId: "2" });
    await resolveAll();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("resetSignal の変化でリセット (作成): 自動入力済みキー・手入力記録を持ち越さず、同じキーでも再度入る", async () => {
    const { onApply, update, result } = mount();
    await update({ styleId: "1", poolType: 1 });
    act(() => result.current.markTouched());
    await update({ resetSignal: "s1" });
    expect(applied(onApply)).toEqual([58, 58]);
  });

  it("resetSignal の変化でリセット (編集): 別の goal に切り替わったら基準を取り直し、上書きしない", async () => {
    const { onApply, update } = mount({ isEdit: true, resetSignal: "g1", styleId: "1", poolType: 1 });
    await settle();
    await update({ resetSignal: "g2", styleId: "2" });
    expect(onApply).not.toHaveBeenCalled();
    await update({ styleId: "1" });
    expect(applied(onApply)).toEqual([58]);
  });

  it("resetSignal が変わらなければリセットしない (同じ値の再レンダーで再適用しない)", async () => {
    const { onApply, update } = mount({ resetSignal: { id: "g1" } as unknown });
    await update({ styleId: "1", poolType: 1 });
    await update({ styleId: "1" });
    expect(applied(onApply)).toEqual([58]);
  });
});

describe("StrictMode (RTL の render は既定で StrictMode ではないので明示)", () => {
  it("作成: 58 が入る。どの呼び出しも 58 で、取得は1回", async () => {
    const { onApply, update } = mount({}, { strict: true });
    await update({ styleId: "1", poolType: 1 });
    // StrictMode の effect 二重実行でも1回だけ適用される (refs でガードされている)
    expect(applied(onApply)).toEqual([58]);
    expect(h.getBestTimes).toHaveBeenCalledTimes(1);
  });

  it("編集: 開いた直後に上書きしない (mount 時 effect の二重実行で基準が壊れない)", async () => {
    const { onApply, update } = mount({ isEdit: true, styleId: "1", poolType: 0 }, { strict: true });
    await settle();
    await update({});
    expect(onApply).not.toHaveBeenCalled();
  });

  it("編集: StrictMode でも種目変更で入る", async () => {
    const { onApply, update } = mount({ isEdit: true, styleId: "1", poolType: 0 }, { strict: true });
    await settle();
    await update({ styleId: "2" });
    expect(applied(onApply).at(-1)).toBeNull();
    await update({ styleId: "1" });
    expect(applied(onApply).at(-1)).toBe(55);
  });
});
