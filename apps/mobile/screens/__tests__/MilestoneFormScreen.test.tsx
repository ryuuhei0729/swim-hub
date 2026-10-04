// =============================================================================
// screens/__tests__/MilestoneFormScreen.test.tsx  (S4, S5, U5, Boundary / Contract v4: M1 M2 L3 L4)
// =============================================================================
// 期待値のタイトルは ja のリテラル (shared formatMilestoneSummary の出力と1文字一致)。
// ゴールセット計算は shared 実物 (関数モックなし)、期待値は手計算リテラル (年齢は Date を固定して決定論化)。
// 壊したら赤: time_trial の ×1.01 / goalset 表示条件 (distance===100) / isMilestoneParamsSavable を通さない /
//   DEFAULT_* を複製せず共有参照をそのまま変更 / ゴールセット確定値のハードコード / createdMilestoneIdRef 削除
// =============================================================================
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DEFAULT_REPS_TIME_PARAMS, DEFAULT_SET_PARAMS, DEFAULT_TIME_PARAMS, MILESTONE_TEMPLATES } from "@apps/shared/constants/goals";

const h = vi.hoisted(() => ({
  getGoalWithMilestones: vi.fn(),
  createMilestone: vi.fn(),
  updateMilestone: vi.fn(),
  createTemplate: vi.fn(),
  goBack: vi.fn(),
  dispatch: vi.fn(),
  params: { goalId: "g1" } as { goalId: string; milestoneId?: string },
  preventRemove: { prevent: false as boolean, cb: null as null | ((a: { data: { action: unknown } }) => void) },
  profile: { birthday: "2010-06-15", gender: 0 } as { birthday: string | null; gender: number | null },
  supabase: {},
}));

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    useWindowDimensions: () => ({ width: 375, height: 812, scale: 1, fontScale: 1 }),
    TextInput: ({ onChangeText, value, editable, testID, ...props }: { onChangeText?: (t: string) => void; value?: string; editable?: boolean; testID?: string } & Record<string, unknown>) =>
      React.createElement("input", {
        type: "text", ...props, "data-testid": testID, value, disabled: editable === false,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
      }),
  };
});
vi.mock("@/contexts/AuthProvider", () => ({ useAuth: () => ({ supabase: h.supabase, user: { id: "u1" } }) }));
vi.mock("@apps/shared/api/goals", () => ({
  GoalAPI: class {
    getGoalWithMilestones = h.getGoalWithMilestones;
    createMilestone = h.createMilestone;
    updateMilestone = h.updateMilestone;
  },
}));
vi.mock("@apps/shared/hooks/queries/practiceLogTemplates", () => ({
  useCreatePracticeLogTemplateMutation: () => ({ mutateAsync: h.createTemplate, isPending: false }),
}));
vi.mock("@apps/shared/hooks/queries/user", () => ({
  useUserProfileQuery: () => ({ data: h.profile, isLoading: false }),
}));
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: h.goBack, dispatch: h.dispatch }),
  useRoute: () => ({ params: h.params }),
  usePreventRemove: (prevent: boolean, cb: (a: { data: { action: unknown } }) => void) => {
    h.preventRemove.prevent = prevent;
    h.preventRemove.cb = cb;
  },
}));
vi.mock("@/components/ui/DatePickerField", () => ({
  DatePickerField: ({ value, onChange }: { value: string; onChange: (d: string) => void }) => (
    <button data-testid="deadline-field" data-value={value} onClick={() => onChange("2099-05-05")}>deadline</button>
  ),
}));

import { Alert } from "react-native";
import { MilestoneFormScreen } from "../MilestoneFormScreen";

const style100 = { id: 1, name_jp: "100m 自由形", name: "100m Fr", style: "Fr", distance: 100 };
const style50 = { id: 2, name_jp: "50m 自由形", name: "50m Fr", style: "Fr", distance: 50 };
function goalFx(over: Record<string, unknown> = {}) {
  return {
    id: "g1", user_id: "u1", competition_id: "c1", style_id: 1, target_time: 60, start_time: null, status: "active",
    achieved_at: null, reflection_note: null, created_at: "", updated_at: "",
    competition: { id: "c1", title: "県大会", date: "2099-12-01", pool_type: 0, team_id: null },
    style: style100, milestones: [], ...over,
  };
}
const msFx = (over: Record<string, unknown> = {}) => ({
  id: "m1", goal_id: "g1", title: "既存タイトル", type: "time",
  params: { distance: 100, target_time: 83.45, style: "Fr", swim_category: "Swim" },
  deadline: "2099-01-02", status: "in_progress", achieved_at: null, reflection_done: false, reflection_note: null,
  created_at: "", updated_at: "", ...over,
});

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={qc}><MilestoneFormScreen /></QueryClientProvider>);
}
const flush = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 50)); }); };
const byLabel = (l: string) => Array.from(document.querySelectorAll(`[accessibilitylabel="${l}"]`)) as HTMLElement[];
const tid = (id: string) => screen.getByTestId(id) as HTMLInputElement;
const typeInto = (id: string, text: string) => { let acc = ""; for (const ch of text) { acc += ch; fireEvent.change(tid(id), { target: { value: acc } }); } };
const setNumber = (label: string, v: string) => fireEvent.change(byLabel(label)[0]!, { target: { value: v } });
const errorText = () => Array.from(document.querySelectorAll('[accessibilityrole="alert"]')).map((e) => e.textContent);
const submit = (label = "作成") => act(async () => { fireEvent.click(screen.getByText(label)); await new Promise((r) => setTimeout(r, 20)); });
const toggleTemplateSwitch = () => fireEvent.click(document.querySelector('[aria-label="テンプレートにも追加"]')!);

beforeEach(() => {
  h.params = { goalId: "g1" };
  h.preventRemove.prevent = false;
  h.profile = { birthday: "2010-06-15", gender: 0 };
  h.getGoalWithMilestones.mockReset().mockResolvedValue(goalFx());
  h.createMilestone.mockReset().mockResolvedValue({ id: "newm" });
  h.updateMilestone.mockReset().mockResolvedValue({});
  h.createTemplate.mockReset().mockResolvedValue({});
  h.goBack.mockReset();
  vi.mocked(Alert.alert).mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("S4 作成: 3 type", () => {
  it("time (既定): createMilestone が期待 params / 自動タイトル '50m × 1本: 30.00' / deadline null で1回", async () => {
    renderScreen();
    await flush();
    await submit();
    expect(h.createMilestone).toHaveBeenCalledTimes(1);
    expect(h.createMilestone).toHaveBeenCalledWith({
      goalId: "g1", title: "50m × 1本: 30.00", type: "time",
      params: { distance: 50, target_time: 30, style: "Fr", swim_category: "Swim" }, deadline: null,
    });
    await flush();
    expect(h.goBack).toHaveBeenCalledTimes(1);
  });

  it("reps_time: 練習平均タイム目標に切替 -> shared 既定値 + 自動タイトル", async () => {
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText("練習平均タイム目標"));
    await submit();
    expect(h.createMilestone).toHaveBeenCalledWith({
      goalId: "g1", title: "50m × 10本 @30.00 平均", type: "reps_time",
      params: { distance: 50, reps: 10, sets: 1, target_average_time: 30, style: "Fr", swim_category: "Swim", circle: 45 }, deadline: null,
    });
  });

  it("set: サークルイン目標に切替 -> 既定値 + 自動タイトル '200m × 4本 × 3セット (@2:20.00サークル) 完遂'", async () => {
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText("サークルイン目標"));
    await submit();
    expect(h.createMilestone).toHaveBeenCalledWith({
      goalId: "g1", title: "200m × 4本 × 3セット (@2:20.00サークル) 完遂", type: "set",
      params: { distance: 200, reps: 4, sets: 3, circle: 140, style: "Fr", swim_category: "Swim" }, deadline: null,
    });
  });

  it("タイトル入力済みはそのまま、空白のみは自動生成", async () => {
    renderScreen();
    await flush();
    fireEvent.change(byLabel("タイトル（任意、空欄の場合は自動生成）")[0]!, { target: { value: "自分の名前" } });
    await submit();
    expect(h.createMilestone.mock.calls[0]![0].title).toBe("自分の名前");
    cleanup(); h.createMilestone.mockClear();
    renderScreen();
    await flush();
    fireEvent.change(byLabel("タイトル（任意、空欄の場合は自動生成）")[0]!, { target: { value: "   " } });
    await submit();
    expect(h.createMilestone.mock.calls[0]![0].title).toBe("50m × 1本: 30.00");
  });

  it("目標タイムを編集して保存しても shared の DEFAULT_TIME_PARAMS (共有参照) を破壊しない", async () => {
    renderScreen();
    await flush();
    typeInto("milestone-target-time", "45.50");
    await submit();
    expect(h.createMilestone.mock.calls[0]![0].params.target_time).toBe(45.5);
    expect(DEFAULT_TIME_PARAMS).toEqual({ distance: 50, target_time: 30, style: "Fr", swim_category: "Swim" });
    expect(DEFAULT_REPS_TIME_PARAMS.reps).toBe(10);
    expect(DEFAULT_SET_PARAMS.circle).toBe(140);
  });

  it("二重タップで createMilestone は1回、失敗は固定文言 (生エラー非表示)", async () => {
    let release!: () => void;
    h.createMilestone.mockImplementation(() => new Promise((r) => { release = () => r({ id: "n" }); }));
    renderScreen();
    await flush();
    await act(async () => { fireEvent.click(screen.getByText("作成")); fireEvent.click(screen.getByText("作成")); await new Promise((r) => setTimeout(r, 20)); });
    expect(h.createMilestone).toHaveBeenCalledTimes(1);
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 30)); });

    cleanup();
    h.createMilestone.mockReset().mockRejectedValue(new Error("SECRET_RAW_MS"));
    renderScreen();
    await flush();
    await submit();
    expect(errorText()).toContain("マイルストーンの作成に失敗しました");
    expect(document.body.textContent).not.toContain("SECRET_RAW_MS");
  });
});

describe("v4 M1 保存前検証 (0/空 params は保存不可)", () => {
  it("time: 目標タイム空 -> 保存不可 + timeInvalid", async () => {
    renderScreen();
    await flush();
    typeInto("milestone-target-time", "abc");
    await submit();
    expect(h.createMilestone).not.toHaveBeenCalled();
    expect(errorText()).toContain("有効なタイム形式で入力してください（例: 1:14.28 または 74.28）");
  });

  it.each([
    ["reps_time", "練習平均タイム目標", "本数", "0"],
    ["reps_time", "練習平均タイム目標", "セット数", ""],
    ["set", "サークルイン目標", "本数", "0"],
    ["set", "サークルイン目標", "セット数", "0"],
  ])("%s: %s で '%s' を '%s' にすると保存不可 (達成判定が 0/0=NaN になる)", async (_t, typeLabel, field, value) => {
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText(typeLabel));
    setNumber(field, value);
    await submit();
    expect(h.createMilestone).not.toHaveBeenCalled();
    expect(errorText().length).toBeGreaterThan(0);
    expect(errorText().length).toBeGreaterThan(0);
  });

  it("[v5 L-c] reps_time は circle=0 (分も秒も 0) でも保存できる (達成判定・要約文は circle を使わない)", async () => {
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText("練習平均タイム目標"));
    setNumber("サークル(分)", "0");
    setNumber("サークル(秒)", "0");
    await submit();
    expect(h.createMilestone).toHaveBeenCalledTimes(1);
    expect(h.createMilestone.mock.calls[0]![0].params.circle).toBe(0);
  });

  it("set: サークル合計 0 (分も秒も 0) は保存不可", async () => {
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText("サークルイン目標"));
    setNumber("サークル(分)", "0");
    setNumber("サークル(秒)", "0");
    await submit();
    expect(h.createMilestone).not.toHaveBeenCalled();
  });

  it("[境界] 本数 1 / セット数 1 は保存できる", async () => {
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText("サークルイン目標"));
    setNumber("本数", "1");
    setNumber("セット数", "1");
    await submit();
    expect(h.createMilestone).toHaveBeenCalledTimes(1);
    expect(h.createMilestone.mock.calls[0]![0].params).toMatchObject({ reps: 1, sets: 1 });
  });
});

describe("テンプレート / 期限 / テンプレートにも追加", () => {
  it("time_trial: 目標タイム 60 -> 60.6 (×1.01)、100m・Fr・Swim が目標から入り、タイトルはテンプレ名", async () => {
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText("タイムトライアル"));
    await submit();
    expect(h.createMilestone).toHaveBeenCalledWith({
      goalId: "g1", title: "タイムトライアル", type: "time",
      params: { distance: 100, target_time: 60.6, style: "Fr", swim_category: "Swim" }, deadline: null,
    });
  });

  it("time_trial: 目標タイム 83.45 -> 84.28 (小数第2位で丸め。浮動小数のゴミを残さない)", async () => {
    h.getGoalWithMilestones.mockResolvedValue(goalFx({ target_time: 83.45 }));
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText("タイムトライアル"));
    await submit();
    expect(h.createMilestone.mock.calls[0]![0].params.target_time).toBe(84.28);
  });

  it("ゴールセットテンプレートは目標種目が 100m のときだけ表示 (50m では出ない)", async () => {
    renderScreen();
    await flush();
    expect(screen.queryByText("ゴールセット")).not.toBeNull();
    cleanup();
    h.getGoalWithMilestones.mockResolvedValue(goalFx({ style: style50, style_id: 2 }));
    renderScreen();
    await flush();
    expect(screen.queryByText("ゴールセット")).toBeNull();
    expect(screen.queryByText("タイムトライアル")).not.toBeNull();
  });

  it("[v4 L3] 目標の種目コードが canonical に正規化できないときは time_trial を適用せずエラー (非 canonical を書かない)", async () => {
    h.getGoalWithMilestones.mockResolvedValue(goalFx({ style: { ...style100, style: "xx" } }));
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText("タイムトライアル"));
    expect(errorText()).toContain("マイルストーンの作成に失敗しました");
    await submit();
    // テンプレートは適用されていない (既定値のまま)。非 canonical の種目コードはどの経路でも保存されない
    for (const call of h.createMilestone.mock.calls) {
      expect(call[0].title).not.toBe("タイムトライアル");
      expect(call[0].params.style).toBe("Fr");
    }
    expect(JSON.stringify(h.createMilestone.mock.calls)).not.toContain('"xx"');
  });

  it("期限: 『目標の期限と揃える』で大会日 (yyyy-MM-dd) が入り、保存の deadline にそのまま渡る (TZ でずれない)", async () => {
    renderScreen();
    await flush();
    expect(screen.getByTestId("deadline-field").getAttribute("data-value")).toBe("");
    fireEvent.click(screen.getByText("目標の期限と揃える"));
    expect(screen.getByTestId("deadline-field").getAttribute("data-value")).toBe("2099-12-01");
    await submit();
    expect(h.createMilestone.mock.calls[0]![0].deadline).toBe("2099-12-01");
  });

  it("期限: 大会情報なし (competition null) では揃えるボタンが disabled", async () => {
    h.getGoalWithMilestones.mockResolvedValue(goalFx({ competition: null }));
    renderScreen();
    await flush();
    const btn = screen.getByText("目標の期限と揃える").closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("テンプレートにも追加: ON の reps_time で createTemplate が期待引数で1回、OFF では呼ばれない、time 型にはスイッチが無い", async () => {
    renderScreen();
    await flush();
    expect(document.querySelector('[aria-label="テンプレートにも追加"]')).toBeNull();
    fireEvent.click(screen.getByText("練習平均タイム目標"));
    await submit();
    expect(h.createTemplate).not.toHaveBeenCalled();

    cleanup(); h.createMilestone.mockClear();
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText("練習平均タイム目標"));
    toggleTemplateSwitch();
    await submit();
    expect(h.createTemplate).toHaveBeenCalledTimes(1);
    expect(h.createTemplate).toHaveBeenCalledWith({
      name: "50m × 10本 @30.00 平均", style: "Fr", swim_category: "Swim", distance: 50, rep_count: 10, set_count: 1, circle: 45,
    });
  });

  it("[v4 L4] テンプレート作成だけ失敗 -> 編集して再保存: createMilestone は1回のまま、updateMilestone で現在値を反映しテンプレート作成を再試行", async () => {
    h.createTemplate.mockRejectedValueOnce(new Error("tpl fail"));
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText("サークルイン目標"));
    toggleTemplateSwitch();
    await submit();
    expect(h.createMilestone).toHaveBeenCalledTimes(1);
    expect(errorText()).toContain("マイルストーンの作成に失敗しました");
    fireEvent.change(byLabel("タイトル（任意、空欄の場合は自動生成）")[0]!, { target: { value: "編集後タイトル" } });
    setNumber("本数", "5");
    await submit();
    expect(h.createMilestone).toHaveBeenCalledTimes(1);
    expect(h.updateMilestone).toHaveBeenCalledTimes(1);
    const [id, values] = h.updateMilestone.mock.calls[0]!;
    expect(id).toBe("newm");
    expect(values.title).toBe("編集後タイトル");
    expect(values.params.reps).toBe(5);
    expect(h.createTemplate).toHaveBeenCalledTimes(2);
    expect(h.createTemplate.mock.calls[1]![0]).toMatchObject({ name: "編集後タイトル", rep_count: 5 });
  });
});

describe("S5 ゴールセット計算モーダル (shared 実物)", () => {
  async function openGoalSet() {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText("ゴールセット"));
    await flush();
  }
  const confirmBtn = () => screen.getByText("この値を使用").closest("button") as HTMLButtonElement;

  it("男16歳・短水路大会・Fr・目標60秒: 結果 31.70 (手計算リテラル)。確定 -> 6本×3セット circle90 / practice_pool_type=0 がフォームに入る", async () => {
    await openGoalSet();
    expect(document.body.textContent).toContain("0:31.70".replace("0:", ""));
    fireEvent.click(confirmBtn());
    await flush();
    await submit();
    expect(h.createMilestone).toHaveBeenCalledTimes(1);
    expect(h.createMilestone.mock.calls[0]![0]).toMatchObject({
      type: "reps_time", title: "ゴールセット",
      params: { distance: 50, reps: 6, sets: 3, circle: 90, target_average_time: 31.7, style: "Fr", swim_category: "Swim", practice_pool_type: 0 },
    });
  });

  it("実施水路を長水路にすると 33.08 になり practice_pool_type=1 で保存される (確定値は MILESTONE_TEMPLATES 由来)", async () => {
    await openGoalSet();
    fireEvent.click(byLabel("長水路（50m）")[0]!);
    expect(document.body.textContent).toContain("33.08");
    fireEvent.click(confirmBtn());
    await flush();
    await submit();
    const p = h.createMilestone.mock.calls[0]![0].params;
    expect(p.practice_pool_type).toBe(1);
    expect(p.target_average_time).toBe(33.08);
    const tpl = MILESTONE_TEMPLATES.find((x) => x.id === "goalset_50m_6x3")!.defaultParams as { reps: number; sets: number; circle: number; distance: number };
    expect([p.distance, p.reps, p.sets, p.circle]).toEqual([tpl.distance, tpl.reps, tpl.sets, tpl.circle]);
  });

  it("年齢未設定: ageNotSetError を表示し、確定してもフォームに入らない", async () => {
    h.profile = { birthday: null, gender: 0 };
    await openGoalSet();
    expect(document.body.textContent).toContain("年齢が設定されていません。プロフィールで設定してください。");
    fireEvent.click(confirmBtn());
    await flush();
    expect(screen.getByText("ゴールセット", { selector: "span" })).toBeTruthy();
    expect(h.createMilestone).not.toHaveBeenCalled();
  });

  it("性別未設定: genderNotSetError", async () => {
    h.profile = { birthday: "2010-06-15", gender: null };
    await openGoalSet();
    expect(document.body.textContent).toContain("性別が設定されていません。プロフィールで設定してください。");
  });

  it("結果が 20 秒未満 (目標30秒 -> 14.26) は警告", async () => {
    h.getGoalWithMilestones.mockResolvedValue(goalFx({ target_time: 30 }));
    await openGoalSet();
    expect(document.body.textContent).toContain("計算結果が現実的でない可能性があります");
  });

  it("結果が範囲内 (31.70) は警告なし", async () => {
    await openGoalSet();
    expect(document.body.textContent).not.toContain("計算結果が現実的でない可能性があります");
  });
});

describe("S4 編集", () => {
  beforeEach(() => {
    h.params = { goalId: "g1", milestoneId: "m1" };
    h.getGoalWithMilestones.mockResolvedValue(goalFx({ milestones: [msFx()] }));
  });

  it("プリフィル (タイトル / 目標タイム / 期限)。テンプレート選択とテンプレート追加スイッチは出ない", async () => {
    renderScreen();
    await flush();
    expect((byLabel("タイトル（任意、空欄の場合は自動生成）")[0] as HTMLInputElement).value).toBe("既存タイトル");
    expect(tid("milestone-target-time").value).toBe("1:23.45");
    expect(screen.getByTestId("deadline-field").getAttribute("data-value")).toBe("2099-01-02");
    expect(screen.queryByText("タイムトライアル")).toBeNull();
    expect(document.querySelector('[aria-label="テンプレートにも追加"]')).toBeNull();
  });

  it("更新 -> updateMilestone('m1', {type,title,params,deadline}) の引数 assert。createMilestone は呼ばれない", async () => {
    renderScreen();
    await flush();
    typeInto("milestone-target-time", "");
    fireEvent.change(tid("milestone-target-time"), { target: { value: "" } });
    typeInto("milestone-target-time", "1:20.00");
    await submit("更新");
    expect(h.createMilestone).not.toHaveBeenCalled();
    expect(h.updateMilestone).toHaveBeenCalledWith("m1", {
      type: "time", title: "既存タイトル",
      params: { distance: 100, target_time: 80, style: "Fr", swim_category: "Swim" }, deadline: "2099-01-02",
    });
  });

  it("編集対象のマイルストーンが目標に無い (別端末で削除済み) -> milestoneNotFound", async () => {
    h.getGoalWithMilestones.mockResolvedValue(goalFx({ milestones: [] }));
    renderScreen();
    await flush();
    expect(document.body.textContent).toContain("マイルストーンが見つかりませんでした");
  });

  it("目標が見つからない (null) -> notFound。取得失敗 -> 固定文言 + 再試行", async () => {
    h.getGoalWithMilestones.mockResolvedValue(null);
    renderScreen();
    await flush();
    expect(document.body.textContent).toContain("目標が見つかりませんでした");
    cleanup();
    h.getGoalWithMilestones.mockReset().mockRejectedValue(new Error("SECRET_RAW"));
    renderScreen();
    await flush();
    expect(document.body.textContent).toContain("目標詳細の取得に失敗しました");
    expect(document.body.textContent).not.toContain("SECRET_RAW");
  });

  it("更新失敗: 固定文言 milestoneEdit.updateFailed", async () => {
    h.updateMilestone.mockRejectedValue(new Error("SECRET_RAW_UPD"));
    renderScreen();
    await flush();
    await submit("更新");
    expect(errorText()).toContain("マイルストーンの更新に失敗しました");
    expect(document.body.textContent).not.toContain("SECRET_RAW_UPD");
  });
});

describe("U5 破棄確認", () => {
  it("未編集 false -> 編集後 true -> 保存成功後 false。コールバックは破棄ダイアログを出し '破棄' で元 action を dispatch", async () => {
    renderScreen();
    await flush();
    expect(h.preventRemove.prevent).toBe(false);
    typeInto("milestone-target-time", "40.00");
    expect(h.preventRemove.prevent).toBe(true);
    const action = { type: "GO_BACK" };
    h.preventRemove.cb!({ data: { action } });
    const buttons = vi.mocked(Alert.alert).mock.calls[0]![2] as Array<{ style?: string; onPress?: () => void }>;
    buttons.find((b) => b.style === "destructive")!.onPress!();
    expect(h.dispatch).toHaveBeenCalledWith(action);
    await submit();
    await flush();
    expect(h.preventRemove.prevent).toBe(false);
    expect(h.goBack).toHaveBeenCalledTimes(1);
  });
});
