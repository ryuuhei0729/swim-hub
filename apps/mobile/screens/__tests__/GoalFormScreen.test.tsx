// =============================================================================
// screens/__tests__/GoalFormScreen.test.tsx  (S1, S2, S6, U5, Boundary / Contract v4: M3 M4 L2 /
//   目標の初期タイム全廃 Contract v2: SC1 SC5 / v3: D9 / v4: V4-1 ベストタイムラベル)
// =============================================================================
// 方針: GoalAPI / RecordAPI のモックは呼び出し引数を assert。
//   ベストタイムラベル (testID goal-best-time-label) はエントリーと同じ出し方 (useBestTimesQuery +
//   getBestTimeForEntry、isRelaying=false)。RecordAPI.getBestTimes は BestTime[] (aggregateBestTimes の形) を返す。
//   文言は「t(forms.recordLog.<labelKey>): formatTimeBest(time)」(ja: 「ベストタイム: 58.00」等)。目標タイム欄の下。
//   種目が未選択・水路が未確定・一覧が取得中 / 失敗・該当なしのときは出さない (「記録なし」「—」は無い)。
// 何を壊したら赤くなるべきか:
//   - 水路が未確定 (大会未選択) でもラベルを出す / 短水路 (0) を未確定扱いにする -> 赤
//   - 種目・水路を変えてもラベルが変わらない / isRelaying を true で引く (引継が先に出る) -> 赤
//   - createGoal / updateGoal に初期タイムや poolType を渡す -> 赤
//   - savingRef を外す -> 二重タップで createGoal 2回 -> 赤
// =============================================================================
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  getSelectableCompetitions: vi.fn(),
  getGoalWithMilestones: vi.fn(),
  getBestTimes: vi.fn(),
  createCompetition: vi.fn(),
  updateCompetition: vi.fn(),
  getStyles: vi.fn(),
  goBack: vi.fn(),
  dispatch: vi.fn(),
  preventRemove: { prevent: false as boolean, cb: null as null | ((a: { data: { action: unknown } }) => void) },
  params: {} as { goalId?: string },
  supabase: {},
  user: { id: "u1" },
  pickDate: "2099-12-31",
  pickEndDate: "2100-01-02",
  dateProps: [] as Array<{ label: string; minDate?: Date; value: string }>,
}));

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    TextInput: ({ onChangeText, value, editable, testID, ...props }: { onChangeText?: (t: string) => void; value?: string; editable?: boolean; testID?: string } & Record<string, unknown>) =>
      React.createElement("input", {
        type: "text", ...props, "data-testid": testID, value, disabled: editable === false,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
      }),
  };
});

vi.mock("@/contexts/AuthProvider", () => ({ useAuth: () => ({ supabase: h.supabase, user: h.user }) }));
vi.mock("@apps/shared/api/goals", () => ({
  GoalAPI: class {
    createGoal = h.createGoal;
    updateGoal = h.updateGoal;
    getSelectableCompetitions = h.getSelectableCompetitions;
    getGoalWithMilestones = h.getGoalWithMilestones;
  },
}));
vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    getBestTimes = h.getBestTimes;
    createCompetition = h.createCompetition;
    updateCompetition = h.updateCompetition;
  },
}));
vi.mock("@apps/shared/api/styles", () => ({ StyleAPI: class { getStyles = h.getStyles; } }));
// `@/components/records` の barrel は画像・権限まわりの部品も読み込む (expo-modules-core の createPermissionHook を要求する)。
// GoalFormScreen が使うのは mobile 用ラッパーの getBestTimeForEntry (labelKey に forms.recordLog. を前置する) だけなので、
// CompetitionTabFormScreen.*.test.tsx と同じく、それだけを本物で返す
vi.mock("@/components/records", async () => {
  const { getBestTimeForEntry } = await import("@/components/records/bestTimeForEntry");
  return { getBestTimeForEntry };
});
vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({ teams: [{ team_id: "t1", teams: { name: "Aチーム" } }], isLoading: false }),
}));
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: h.goBack, dispatch: h.dispatch }),
  useRoute: () => ({ params: h.params }),
  usePreventRemove: (prevent: boolean, cb: (a: { data: { action: unknown } }) => void) => {
    h.preventRemove.prevent = prevent;
    h.preventRemove.cb = cb;
  },
}));
vi.mock("@/components/forms/StyleChipSelector", () => ({
  StyleChipSelector: ({ styles, onChange, value }: { styles: Array<{ id: number }>; onChange: (id: string) => void; value: string }) => (
    <div data-value={value}>
      {styles.map((s) => (
        <button key={s.id} data-testid={`style-${s.id}`} onClick={() => onChange(String(s.id))}>{`style-${s.id}`}</button>
      ))}
    </div>
  ),
}));
vi.mock("@/components/ui/DatePickerField", () => ({
  // 開始日 / 終了日を label で区別する (v7: 新規大会は2列の日付欄)。終了日のみ testid 'end-date-field'
  // DatePickerField に label prop は無い (ラベルは親の Text)。終了日欄は allowClear で識別する
  DatePickerField: ({ value, onChange, minDate, allowClear }: { value: string; onChange: (d: string) => void; minDate?: Date; allowClear?: boolean }) => {
    const isEnd = !!allowClear;
    h.dateProps.push({ label: isEnd ? "end" : "start", minDate, value });
    return (
      <button data-testid={isEnd ? "end-date-field" : "date-field"} data-value={value} onClick={() => onChange(isEnd ? h.pickEndDate : h.pickDate)}>
        {isEnd ? "end" : "date"}
      </button>
    );
  },
}));
vi.mock("@/components/ui/SlideUpModal", () => ({
  SlideUpModal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? <div data-testid="sheet">{children}</div> : null),
}));

import { Alert } from "react-native";
import { GoalFormScreen } from "../GoalFormScreen";

const STYLES = [
  { id: 1, name_jp: "100m 自由形", name: "100m Fr", style: "Fr", distance: 100 },
  { id: 2, name_jp: "50m 自由形", name: "50m Fr", style: "Fr", distance: 50 },
  { id: 3, name_jp: "200m 自由形", name: "200m Fr", style: "Fr", distance: 200 },
];
const COMPS = [
  { id: "c1", title: "短水路杯", date: "2099-11-01", pool_type: 0, team_id: null, place: null },
  { id: "c2", title: "長水路杯", date: "2099-12-01", pool_type: 1, team_id: null, place: null },
  { id: "c3", title: "チーム杯", date: "2099-12-15", pool_type: 0, team_id: "t1", place: null },
];
/** RecordAPI.getBestTimes の1行 (aggregateBestTimes の形: 種目 × 水路ごとに1件。引継は非リレーの行に relayingTime で付く) */
const bt = (styleIndex: number, pool_type: number, time: number, extra: Record<string, unknown> = {}) => {
  const style = STYLES[styleIndex]!;
  return {
    id: `${style.id}-${pool_type}`, created_at: "", is_relaying: false, style_id: style.id,
    style: { name_jp: style.name_jp, distance: style.distance }, pool_type, time, ...extra,
  };
};
// 種目1 (100m Fr): 短水路 55 (それより速い引継 50 が付く) / 長水路 58。種目2 (50m Fr): 長水路 27 だけ。種目3 (200m Fr): 無し
const BESTS = [
  bt(0, 0, 55, { relayingTime: { id: "r", time: 50, created_at: "" } }),
  bt(0, 1, 58),
  bt(1, 1, 27),
];

let qc: QueryClient;
function renderScreen(existing?: QueryClient) {
  qc = existing ?? new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={qc}><GoalFormScreen /></QueryClientProvider>);
}
const flush = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 50)); }); };
const byLabel = (l: string) => Array.from(document.querySelectorAll(`[accessibilitylabel="${l}"]`)) as HTMLElement[];
/** 新規大会の大会名欄 (切り出し前: '大会名' / 切り出し後: competition.form.namePlaceholder) */
const nameInput = () => (Array.from(document.querySelectorAll("input")).find((i) => ["大会名", "例: 全国大会, 対抗戦, タイムトライアル"].includes(i.placeholder)) ?? (() => { throw new Error("大会名欄が無い"); })()) as HTMLInputElement;
const poolBtn = (long: boolean) => (Array.from(document.querySelectorAll("button")).find((e) => (e.textContent ?? "").trim().startsWith(long ? "長水路" : "短水路")) ?? (() => { throw new Error("水路ボタンが無い"); })()) as HTMLElement;
const tid = (id: string) => screen.getByTestId(id) as HTMLInputElement;
const typeInto = (id: string, text: string) => {
  let acc = "";
  for (const ch of text) { acc += ch; fireEvent.change(tid(id), { target: { value: acc } }); }
};
async function pickCompetition(title: string) {
  fireEvent.click(byLabel("大会")[0]!);
  const opt = Array.from(document.querySelectorAll('[data-testid="sheet"] button')).find((b) => b.textContent?.includes(title))!;
  expect(opt, `ピッカーに ${title} が無い`).toBeTruthy();
  fireEvent.click(opt);
}
const submit = (label = "作成") => act(async () => { fireEvent.click(screen.getByText(label)); await new Promise((r) => setTimeout(r, 20)); });
const errorText = () => Array.from(document.querySelectorAll('[accessibilityrole="alert"]')).map((e) => e.textContent);

beforeEach(() => {
  h.params = {};
  h.user = { id: "u1" };
  h.dateProps.length = 0;
  h.pickDate = "2099-12-31";
  h.pickEndDate = "2100-01-02";
  h.preventRemove.prevent = false;
  h.createGoal.mockReset().mockResolvedValue({ id: "new" });
  h.updateGoal.mockReset().mockResolvedValue({});
  h.getSelectableCompetitions.mockReset().mockResolvedValue(COMPS);
  h.getGoalWithMilestones.mockReset();
  h.getBestTimes.mockReset().mockResolvedValue(BESTS);
  h.createCompetition.mockReset().mockResolvedValue({ id: "newc" });
  h.updateCompetition.mockReset().mockResolvedValue({ id: "newc" });
  h.getStyles.mockReset().mockResolvedValue(STYLES);
  h.goBack.mockReset();
  vi.mocked(Alert.alert).mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("大会の選択肢の表記 (2026-10-15 ユーザー指定: 日付を先に出す)", () => {
  it("ピッカーの選択肢と、選んだあとの表示は「YYYY/MM/DD 大会名」の順", async () => {
    renderScreen();
    await flush();
    fireEvent.click(byLabel("大会")[0]!);
    const options = Array.from(document.querySelectorAll('[data-testid="sheet"] button')).map((b) => b.textContent);
    expect(options).toEqual(expect.arrayContaining(["2099/11/01 短水路杯", "2099/12/01 長水路杯", "2099/12/15 チーム杯"]));
    expect(options.some((o) => / - \d{4}\//.test(o ?? ""))).toBe(false);
    fireEvent.click(Array.from(document.querySelectorAll('[data-testid="sheet"] button')).find((b) => b.textContent === "2099/11/01 短水路杯")!);
    expect(screen.getByText("2099/11/01 短水路杯")).toBeTruthy();
  });
});

describe("S1 作成", () => {
  it("既存個人大会 + 種目 + 目標タイムで作成 -> createGoal が期待 input で1回、goBack", async () => {
    renderScreen();
    await flush();
    await pickCompetition("短水路杯");
    fireEvent.click(screen.getByTestId("style-1"));
    typeInto("goal-target-time", "1:00.00");
    await submit();
    expect(h.createGoal).toHaveBeenCalledTimes(1);
    const arg = h.createGoal.mock.calls[0]![0];
    expect(arg).toMatchObject({ userId: "u1", competitionId: "c1", competitionData: undefined, styleId: 1, targetTime: 60 });
    // [SC5] 初期タイムは渡さない / [D9] CreateGoalInput.poolType は削除
    expect(arg).not.toHaveProperty("startTime");
    expect(arg).not.toHaveProperty("poolType");
    await flush();
    expect(h.goBack).toHaveBeenCalledTimes(1);
  });

  it("チーム大会も選べ、ピッカーは 個人 / チーム名 でグルーピングされる", async () => {
    renderScreen();
    await flush();
    fireEvent.click(byLabel("大会")[0]!);
    const sheet = screen.getByTestId("sheet").textContent ?? "";
    expect(sheet.indexOf("個人")).toBeGreaterThanOrEqual(0);
    expect(sheet.indexOf("Aチーム")).toBeGreaterThan(sheet.indexOf("個人"));
    expect(sheet.indexOf("チーム杯")).toBeGreaterThan(sheet.indexOf("Aチーム"));
    await pickCompetition("チーム杯");
    fireEvent.click(screen.getByTestId("style-2"));
    typeInto("goal-target-time", "30.00");
    await submit();
    expect(h.createGoal.mock.calls[0]![0]).toMatchObject({ competitionId: "c3", styleId: 2, targetTime: 30 });
  });

  it("getSelectableCompetitions は今日の日付 (yyyy-MM-dd) を引数に呼ばれる", async () => {
    renderScreen();
    await flush();
    const arg = h.getSelectableCompetitions.mock.calls[0]![0] as string;
    expect(arg).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(arg).toBe(today);
  });

  it("新規大会に切替: createGoal は competitionData つき (水路は選んだもの)・competitionId 未指定・初期タイムと poolType なし", async () => {
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText("新規大会を作成"));
    fireEvent.change(nameInput(), { target: { value: "  新規杯  " } });
    fireEvent.click(screen.getByTestId("date-field"));
    fireEvent.click(poolBtn(true));
    fireEvent.click(screen.getByTestId("style-1"));
    typeInto("goal-target-time", "1:00.00");
    await submit();
    expect(h.createGoal).toHaveBeenCalledTimes(1);
    const arg = h.createGoal.mock.calls[0]![0];
    expect(arg.competitionId).toBeUndefined();
    expect(arg.competitionData).toEqual({ title: "新規杯", date: "2099-12-31", endDate: null, place: null, poolType: 1 });
    expect(arg).not.toHaveProperty("startTime");
    expect(arg).not.toHaveProperty("poolType");
    expect(h.createCompetition).not.toHaveBeenCalled();
  });

  it("大会未選択では保存できない: createGoal 未呼び出し + competitionRequired", async () => {
    renderScreen();
    await flush();
    fireEvent.click(screen.getByTestId("style-1"));
    typeInto("goal-target-time", "1:00.00");
    await submit();
    expect(h.createGoal).not.toHaveBeenCalled();
    expect(errorText()).toContain("大会を選択してください");
  });

  it("新規大会モードで大会名が空なら保存できない", async () => {
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText("新規大会を作成"));
    fireEvent.click(screen.getByTestId("style-1"));
    typeInto("goal-target-time", "1:00.00");
    await submit();
    expect(h.createGoal).not.toHaveBeenCalled();
    expect(errorText()).toContain("大会を選択してください");
  });

  it("種目未選択では保存できない", async () => {
    renderScreen();
    await flush();
    await pickCompetition("短水路杯");
    typeInto("goal-target-time", "1:00.00");
    await submit();
    expect(h.createGoal).not.toHaveBeenCalled();
    expect(errorText()).toContain("種目が選択されていません。");
  });

  it("二重タップで createGoal は1回だけ (savingRef)", async () => {
    let release!: () => void;
    h.createGoal.mockImplementation(() => new Promise((r) => { release = () => r({ id: "n" }); }));
    renderScreen();
    await flush();
    await pickCompetition("短水路杯");
    fireEvent.click(screen.getByTestId("style-1"));
    typeInto("goal-target-time", "1:00.00");
    await act(async () => {
      fireEvent.click(screen.getByText("作成"));
      fireEvent.click(screen.getByText("作成"));
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(h.createGoal).toHaveBeenCalledTimes(1);
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 30)); });
  });

  it("保存失敗: 固定文言 createFailed、生エラー非表示、入力は保持され再保存できる", async () => {
    h.createGoal.mockRejectedValueOnce(new Error("SECRET_RAW_RLS"));
    renderScreen();
    await flush();
    await pickCompetition("短水路杯");
    fireEvent.click(screen.getByTestId("style-1"));
    typeInto("goal-target-time", "1:00.00");
    await submit();
    expect(errorText()).toContain("目標の作成に失敗しました");
    expect(document.body.textContent).not.toContain("SECRET_RAW_RLS");
    expect(tid("goal-target-time").value).toBe("1:00.00");
    expect(h.goBack).not.toHaveBeenCalled();
    await submit();
    expect(h.createGoal).toHaveBeenCalledTimes(2);
  });
});

describe("バリデーション (Boundary)", () => {
  async function fillValid() {
    renderScreen();
    await flush();
    await pickCompetition("短水路杯");
    fireEvent.click(screen.getByTestId("style-1"));
  }
  it.each([
    ["空", ""],
    ["0", "0"],
    ["3601 秒 (60:01)", "60:01"],
    ["不正形式", "abc"],
  ])("目標タイム %s -> 保存不可 + targetTimeInvalid", async (_n, raw) => {
    await fillValid();
    if (raw) typeInto("goal-target-time", raw);
    await submit();
    expect(h.createGoal).not.toHaveBeenCalled();
    expect(errorText()).toContain("目標タイムを正しく入力してください（0秒超〜60分以内）");
  });

  it("3600 秒 (60:00) ちょうどは保存できる", async () => {
    await fillValid();
    typeInto("goal-target-time", "60:00");
    await submit();
    expect(h.createGoal).toHaveBeenCalledTimes(1);
    expect(h.createGoal.mock.calls[0]![0].targetTime).toBe(3600);
  });

  it("[SC1] 初期タイム欄 (入力欄・ラベル) が無い。タイムの入力欄は目標タイムの1つだけ", async () => {
    renderScreen();
    await flush();
    expect(screen.queryByTestId("goal-start-time")).toBeNull();
    expect(document.body.textContent).not.toContain("初期タイム");
    expect(byLabel("初期タイム（任意）")).toHaveLength(0);
    // 新規大会モードでなければ、テキスト入力は目標タイムだけ
    expect(Array.from(document.querySelectorAll("input")).map((i) => i.getAttribute("data-testid"))).toEqual(["goal-target-time"]);
  });

  it("[v4 L2] 目標タイムに途中入力 ('1:') が残ったままの保存も拒否される", async () => {
    await fillValid();
    typeInto("goal-target-time", "1:");
    await submit();
    expect(h.createGoal).not.toHaveBeenCalled();
  });

  it("[v4 M3] 新規大会の日付に DatePickerField.minDate=今日 が渡る", async () => {
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText("新規大会を作成"));
    const last = [...h.dateProps].reverse().find((d) => d.label === "start")!;
    expect(last.minDate).toBeInstanceOf(Date);
    const now = new Date();
    expect(last.minDate!.getFullYear()).toBe(now.getFullYear());
    expect(last.minDate!.getMonth()).toBe(now.getMonth());
    expect(last.minDate!.getDate()).toBe(now.getDate());
  });

  it("[v4 M3] 新規大会の過去日は保存拒否 (competitionDatePast)。今日は可", async () => {
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText("新規大会を作成"));
    fireEvent.change(nameInput(), { target: { value: "過去杯" } });
    fireEvent.click(screen.getByTestId("style-1"));
    typeInto("goal-target-time", "1:00.00");
    h.pickDate = "2000-01-01";
    fireEvent.click(screen.getByTestId("date-field"));
    await submit();
    expect(h.createGoal).not.toHaveBeenCalled();
    expect(errorText()).toContain("新規大会の日付は今日以降を選択してください");

    const now = new Date();
    h.pickDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    fireEvent.click(screen.getByTestId("date-field"));
    await submit();
    expect(h.createGoal).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// Contract v4 V4-1: 目標タイム欄の下のベストタイムラベル (testID goal-best-time-label)
// =============================================================================
// mobile の react-native モックは View / Text の testID を data-testid に変換しないため、属性 testid で引く。
const bestLabel = () => document.querySelector('[testid="goal-best-time-label"]') as HTMLElement | null;
const bestText = () => bestLabel()?.textContent?.trim() ?? null;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 80)); });
const pickStyle = async (id: number) => { fireEvent.click(screen.getByTestId(`style-${id}`)); await settle(); };

describe("V4-1 ベストタイムラベル: 出さないとき", () => {
  it("開いた直後 (種目・大会とも未選択) は出さない", async () => {
    renderScreen();
    await flush();
    expect(bestLabel()).toBeNull();
  });

  it("種目だけ (大会未選択 = 水路不明) では出さない (短水路に倒さない)。大会を選ぶと出る", async () => {
    renderScreen();
    await flush();
    await pickStyle(1);
    expect(bestLabel()).toBeNull();
    await pickCompetition("長水路杯");
    await settle();
    expect(bestText()).toBe("ベストタイム: 58.00");
  });

  it("大会だけ (種目未選択) では出さない。種目を選ぶと出る", async () => {
    renderScreen();
    await flush();
    await pickCompetition("長水路杯");
    await settle();
    expect(bestLabel()).toBeNull();
    await pickStyle(1);
    expect(bestText()).toBe("ベストタイム: 58.00");
  });

  it("どの水路にもベストが無い種目 (200m Fr) は出さない (「記録なし」「—」も出さない)", async () => {
    renderScreen();
    await flush();
    await pickCompetition("長水路杯");
    await pickStyle(3);
    expect(bestLabel()).toBeNull();
    expect(document.body.textContent).not.toMatch(/記録なし|—/);
  });

  it("ベスト一覧の取得中は出さず、届くと出す", async () => {
    let resolve!: (v: unknown[]) => void;
    h.getBestTimes.mockImplementation(() => new Promise((r) => (resolve = r)));
    renderScreen();
    await flush();
    await pickCompetition("長水路杯");
    await pickStyle(1);
    expect(bestLabel()).toBeNull();
    await act(async () => { resolve(BESTS); await new Promise((r) => setTimeout(r, 80)); });
    expect(bestText()).toBe("ベストタイム: 58.00");
  });

  it("ベスト一覧の取得に失敗したら出さない。アラート・エラー文言・生エラーは出さず、そのまま保存できる", async () => {
    h.getBestTimes.mockRejectedValue(new Error("SECRET_RAW_BT"));
    renderScreen();
    await flush();
    await pickCompetition("長水路杯");
    await pickStyle(1);
    expect(bestLabel()).toBeNull();
    expect(errorText()).toEqual([]);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/SECRET_RAW_BT|—/);
    typeInto("goal-target-time", "1:00.00");
    await submit();
    expect(h.createGoal).toHaveBeenCalledTimes(1);
    expect(h.createGoal.mock.calls[0]![0]).toMatchObject({ competitionId: "c2", styleId: 1, targetTime: 60 });
  });
});

describe("V4-1 ベストタイムラベル: 出し方 (エントリーと同じ)", () => {
  it("同じ水路のベストを出す: 長水路杯 + 種目1 は『ベストタイム: 58.00』、短水路杯に変えると『ベストタイム: 55.00』(引継の 50.00 は出さない = isRelaying は false)", async () => {
    renderScreen();
    await flush();
    await pickCompetition("長水路杯");
    await pickStyle(1);
    expect(bestText()).toBe("ベストタイム: 58.00");
    await pickCompetition("短水路杯");
    await settle();
    expect(bestText()).toBe("ベストタイム: 55.00");
  });

  it("同じ水路に無ければ別の水路のベストを出し、出どころを書く (短水路杯 + 種目2 → 『ベストタイム(長水路): 27.00』)", async () => {
    renderScreen();
    await flush();
    await pickCompetition("短水路杯");
    await pickStyle(2);
    expect(bestText()).toBe("ベストタイム(長水路): 27.00");
  });

  it("1分を超えるベストは M:SS.cc (長水路 65.5 → 『ベストタイム: 1:05.50』)", async () => {
    h.getBestTimes.mockResolvedValue([bt(0, 1, 65.5)]);
    renderScreen();
    await flush();
    await pickCompetition("長水路杯");
    await pickStyle(1);
    expect(bestText()).toBe("ベストタイム: 1:05.50");
  });

  it("種目を変えるとその種目のベストに切り替わり、目標タイム欄の値は変わらない", async () => {
    renderScreen();
    await flush();
    await pickCompetition("長水路杯");
    await pickStyle(1);
    typeInto("goal-target-time", "1:00.00");
    await pickStyle(2);
    expect(bestText()).toBe("ベストタイム: 27.00");
    expect(tid("goal-target-time").value).toBe("1:00.00");
  });

  it("新規大会の水路を切り替えると入れ替わる (短水路 55 -> 長水路 58 -> 短水路 55)。目標タイム欄の値は変わらない", async () => {
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText("新規大会を作成"));
    await pickStyle(1);
    typeInto("goal-target-time", "59.00");
    expect(bestText()).toBe("ベストタイム: 55.00");
    fireEvent.click(poolBtn(true));
    await settle();
    expect(bestText()).toBe("ベストタイム: 58.00");
    fireEvent.click(poolBtn(false));
    await settle();
    expect(bestText()).toBe("ベストタイム: 55.00");
    expect(tid("goal-target-time").value).toBe("59.00");
  });

  it("既存 ↔ 新規の切替で水路が変わると入れ替わる (長水路杯 58 -> 新規 (既定 短水路) 55)", async () => {
    renderScreen();
    await flush();
    await pickCompetition("長水路杯");
    await pickStyle(1);
    expect(bestText()).toBe("ベストタイム: 58.00");
    fireEvent.click(screen.getByText("新規大会を作成"));
    await settle();
    expect(bestText()).toBe("ベストタイム: 55.00");
  });

  it("位置は目標タイム欄の下 (同じ縦並びの列で入力欄の後ろ)。見た目は大会記録入力の bestTimeBadge と同じ緑の丸いラベル", async () => {
    renderScreen();
    await flush();
    await pickCompetition("長水路杯");
    await pickStyle(1);
    const target = tid("goal-target-time");
    const label = bestLabel()!;
    expect(label, "ラベルが無い").not.toBeNull();
    let node: HTMLElement | null = target.parentElement;
    while (node && !node.contains(label)) node = node.parentElement;
    expect(node).not.toBeNull();
    expect(node!.style.flexDirection).not.toBe("row");
    expect(node!.querySelectorAll("input")).toHaveLength(1);
    expect(target.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(node!.textContent).toContain("目標タイム");
    // CompetitionTabFormScreen の bestTimeBadge (green-100 の背景・丸み 9999) と同じ
    expect(label.style.backgroundColor).toBe("rgb(220, 252, 231)");
    expect(label.style.borderRadius).toBe("9999px");
  });
});

describe("V4-1 / SC5 編集モード: 保存済みの目標のベストを出し、初期タイムを渡さない", () => {
  const goalFx = () => ({
    id: "g1", user_id: "u1", competition_id: "c1", style_id: 1, target_time: 60, status: "active",
    achieved_at: null, reflection_note: null, created_at: "", updated_at: "",
    competition: { id: "c1", title: "短水路杯", date: "2099-11-01", pool_type: 0, team_id: null },
    style: STYLES[0], milestones: [],
  });
  beforeEach(() => {
    h.params = { goalId: "g1" };
    h.getGoalWithMilestones.mockResolvedValue(goalFx());
  });

  it("開くと保存済みの大会 (短水路杯) × 種目1 の『ベストタイム: 55.00』を出す", async () => {
    renderScreen();
    await flush();
    await settle();
    expect(bestText()).toBe("ベストタイム: 55.00");
  });

  it("種目を変えるとラベルだけが変わり (短水路の種目2 は長水路のベストを出す)、目標タイム欄は保存済みの 1:00.00 のまま", async () => {
    renderScreen();
    await flush();
    await settle();
    await pickStyle(2);
    expect(bestText()).toBe("ベストタイム(長水路): 27.00");
    expect(tid("goal-target-time").value).toBe("1:00.00");
  });

  it("大会を長水路杯に変えると『ベストタイム: 58.00』", async () => {
    renderScreen();
    await flush();
    await settle();
    await pickCompetition("長水路杯");
    await settle();
    expect(bestText()).toBe("ベストタイム: 58.00");
  });

  it("何も触らず更新: updateGoal('g1', { competitionId, styleId, targetTime }) だけを渡す (初期タイムを含まない)", async () => {
    renderScreen();
    await flush();
    await settle();
    await submit("更新");
    expect(h.updateGoal).toHaveBeenCalledTimes(1);
    expect(h.updateGoal.mock.calls[0]).toEqual(["g1", { competitionId: "c1", styleId: 1, targetTime: 60 }]);
  });
});

// =============================================================================
// v7 C: 新規大会の入力欄 (ダッシュボードの大会作成と同じ UI) + 終了日
// =============================================================================
describe("v7 C: 新規大会の開始日・終了日・大会名・場所・水路", () => {
  const openNew = async () => { renderScreen(); await flush(); fireEvent.click(screen.getByText("新規大会を作成")); };
  const fillValid = async () => {
    fireEvent.change(nameInput(), { target: { value: "新規杯" } });
    fireEvent.click(screen.getByTestId("date-field"));
    fireEvent.click(screen.getByTestId("style-1"));
    typeInto("goal-target-time", "1:00.00");
  };

  it("開始日・終了日・大会名・場所・水路 (短/長) の入力欄がある。終了日は任意表示", async () => {
    await openNew();
    expect(screen.getByTestId("date-field")).toBeTruthy();
    expect(screen.getByTestId("end-date-field")).toBeTruthy();
    expect(nameInput()).toBeTruthy();
    expect(Array.from(document.querySelectorAll("input")).some((i) => ["場所（任意）", "例: 東京アクアティクスセンター"].includes(i.placeholder))).toBe(true);
    expect(poolBtn(false)).toBeTruthy();
    expect(poolBtn(true)).toBeTruthy();
    const text = document.body.textContent ?? "";
    expect(text).toContain("開始日");
    expect(text).toContain("終了日");
    expect(text).toContain("大会名");
    expect(text).toContain("水路");
  });

  it("作成: 終了日を入れると createGoal の competitionData に endDate が厳密一致で入る", async () => {
    await openNew();
    await fillValid();
    fireEvent.click(screen.getByTestId("end-date-field"));
    await submit();
    expect(h.createGoal).toHaveBeenCalledTimes(1);
    expect(h.createGoal.mock.calls[0]![0].competitionData).toEqual({
      title: "新規杯", date: "2099-12-31", endDate: "2100-01-02", place: null, poolType: 0,
    });
  });

  it("作成: 終了日が未入力なら endDate は null", async () => {
    await openNew();
    await fillValid();
    await submit();
    expect(h.createGoal.mock.calls[0]![0].competitionData.endDate).toBeNull();
  });

  it("終了日 < 開始日は保存不可: createGoal 未呼び出し + competition.form.endBeforeStart", async () => {
    await openNew();
    await fillValid();
    h.pickEndDate = "2099-12-30";
    fireEvent.click(screen.getByTestId("end-date-field"));
    await submit();
    expect(h.createGoal).not.toHaveBeenCalled();
    expect(errorText().join("|") + document.body.textContent).toContain("終了日は開始日以降の日付を指定してください");
  });

  it("終了日 = 開始日は可", async () => {
    await openNew();
    await fillValid();
    h.pickEndDate = "2099-12-31";
    fireEvent.click(screen.getByTestId("end-date-field"));
    await submit();
    expect(h.createGoal.mock.calls[0]![0].competitionData.endDate).toBe("2099-12-31");
  });

  it("終了日の DatePicker の minDate は開始日", async () => {
    await openNew();
    fireEvent.click(screen.getByTestId("date-field")); // start = 2099-12-31
    const end = [...h.dateProps].reverse().find((d) => d.label === "end")!;
    expect(end.minDate).toBeInstanceOf(Date);
    expect(end.minDate!.getFullYear()).toBe(2099);
    expect(end.minDate!.getMonth()).toBe(11);
    expect(end.minDate!.getDate()).toBe(31);
  });

  it("開始日 < 今日は保存不可 (v4 M3 維持)", async () => {
    await openNew();
    await fillValid();
    h.pickDate = "2000-01-01";
    fireEvent.click(screen.getByTestId("date-field"));
    await submit();
    expect(h.createGoal).not.toHaveBeenCalled();
    expect(errorText().length).toBeGreaterThan(0);
  });

  describe("編集モード: createCompetition / updateCompetition に end_date", () => {
    beforeEach(() => {
      h.params = { goalId: "g1" };
      h.getGoalWithMilestones.mockResolvedValue({
        id: "g1", user_id: "u1", competition_id: "c9", style_id: 1, target_time: 60, status: "active",
        achieved_at: null, reflection_note: null, created_at: "", updated_at: "",
        competition: { id: "c9", title: "元の大会", date: "2099-01-01", pool_type: 0, team_id: null },
        style: STYLES[0], milestones: [],
      });
    });

    it("終了日あり: createCompetition の引数に end_date が厳密に入る / 終了日なしは null", async () => {
      h.updateGoal.mockRejectedValueOnce(new Error("x"));
      await openNew();
      await flush();
      fireEvent.change(nameInput(), { target: { value: "新大会" } });
      fireEvent.click(screen.getByTestId("date-field"));
      fireEvent.click(screen.getByTestId("end-date-field"));
      await submit("更新");
      expect(h.createCompetition).toHaveBeenCalledTimes(1);
      expect(h.createCompetition.mock.calls[0]![0]).toMatchObject({ title: "新大会", date: "2099-12-31", end_date: "2100-01-02", pool_type: 0 });

      cleanup();
      h.createCompetition.mockClear();
      h.updateGoal.mockResolvedValue({});
      await openNew();
      await flush();
      fireEvent.change(nameInput(), { target: { value: "新大会2" } });
      fireEvent.click(screen.getByTestId("date-field"));
      await submit("更新");
      expect(h.createCompetition.mock.calls[0]![0].end_date).toBeNull();
    });

    it("[M-A] 終了日だけ変えた再保存でも updateCompetition(作成済み id, {end_date: 新しい値}) が呼ばれ、createCompetition は1回のまま", async () => {
      h.updateGoal.mockRejectedValueOnce(new Error("x"));
      await openNew();
      await flush();
      fireEvent.change(nameInput(), { target: { value: "新大会" } });
      fireEvent.click(screen.getByTestId("date-field"));
      fireEvent.click(screen.getByTestId("end-date-field")); // 2100-01-02
      await submit("更新");
      expect(h.updateCompetition).not.toHaveBeenCalled();
      h.pickEndDate = "2100-02-03";
      fireEvent.click(screen.getByTestId("end-date-field"));
      await submit("更新");
      expect(h.createCompetition).toHaveBeenCalledTimes(1);
      expect(h.updateCompetition).toHaveBeenCalledTimes(1);
      const [id, updates] = h.updateCompetition.mock.calls[0]!;
      expect(id).toBe("newc");
      expect(updates).toMatchObject({ end_date: "2100-02-03" });
      expect(h.updateGoal.mock.calls[1]![1].competitionId).toBe("newc");
    });
  });
});

describe("S2 編集", () => {
  const goalFx = (over: Record<string, unknown> = {}) => ({
    id: "g1", user_id: "u1", competition_id: "c9", style_id: 1, target_time: 60, status: "active",
    achieved_at: null, reflection_note: null, created_at: "", updated_at: "",
    competition: { id: "c9", title: "過去の短水路杯", date: "2000-01-01", pool_type: 0, team_id: null },
    style: STYLES[0], milestones: [], ...over,
  });
  beforeEach(() => { h.params = { goalId: "g1" }; h.getGoalWithMilestones.mockResolvedValue(goalFx()); });

  it("既存値がプリフィルされ、過去日の既存大会も選択済みで表示される", async () => {
    renderScreen();
    await flush();
    expect(tid("goal-target-time").value).toBe("1:00.00");
    expect(screen.queryByTestId("goal-start-time")).toBeNull();
    expect(document.body.textContent).toContain("過去の短水路杯");
  });

  it("更新 -> updateGoal('g1', {competitionId, styleId, targetTime}) の引数 assert (初期タイムを含まない)", async () => {
    renderScreen();
    await flush();
    typeInto("goal-target-time", "");
    fireEvent.change(tid("goal-target-time"), { target: { value: "" } });
    typeInto("goal-target-time", "59.50");
    await submit("更新");
    expect(h.updateGoal).toHaveBeenCalledTimes(1);
    expect(h.updateGoal.mock.calls[0]).toEqual(["g1", { competitionId: "c9", styleId: 1, targetTime: 59.5 }]);
  });

  it("更新失敗: 固定文言 updateFailed。生エラーは出ない", async () => {
    h.updateGoal.mockRejectedValue(new Error("SECRET_RAW_UPD"));
    renderScreen();
    await flush();
    await submit("更新");
    expect(errorText()).toContain("目標の更新に失敗しました");
    expect(document.body.textContent).not.toContain("SECRET_RAW_UPD");
  });

  it("competition===null の目標を goalId 直指定で開いても編集不可 (editUnavailableReason)", async () => {
    h.getGoalWithMilestones.mockResolvedValue(goalFx({ competition: null }));
    renderScreen();
    await flush();
    expect(document.body.textContent).toContain("大会情報がないため編集できません");
    expect(screen.queryByText("更新")).toBeNull();
  });

  it("目標が見つからない (null) -> notFound 固定文言", async () => {
    h.getGoalWithMilestones.mockResolvedValue(null);
    renderScreen();
    await flush();
    expect(document.body.textContent).toContain("目標が見つかりませんでした");
  });

  it("[v4 M4] 編集で新規大会に切替 -> createCompetition 成功後 updateGoal 失敗 -> 再タップでも createCompetition は1回のまま (孤児大会/重複作成なし)", async () => {
    h.updateGoal.mockRejectedValueOnce(new Error("x"));
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText("新規大会を作成"));
    fireEvent.change(nameInput(), { target: { value: "新大会" } });
    fireEvent.click(screen.getByTestId("date-field"));
    await submit("更新");
    expect(h.createCompetition).toHaveBeenCalledTimes(1);
    expect(h.updateGoal).toHaveBeenCalledTimes(1);
    await submit("更新");
    expect(h.createCompetition).toHaveBeenCalledTimes(1);
    expect(h.updateGoal).toHaveBeenCalledTimes(2);
    expect(h.updateGoal.mock.calls[1]![1].competitionId).toBe("newc");
  });
});

describe("v5 M-A: 編集で新規大会 -> updateGoal 失敗 -> 入力を直して再保存", () => {
  const goalFx = () => ({
    id: "g1", user_id: "u1", competition_id: "c9", style_id: 1, target_time: 60, status: "active",
    achieved_at: null, reflection_note: null, created_at: "", updated_at: "",
    competition: { id: "c9", title: "元の大会", date: "2099-01-01", pool_type: 0, team_id: null },
    style: STYLES[0], milestones: [],
  });
  beforeEach(() => { h.params = { goalId: "g1" }; h.getGoalWithMilestones.mockResolvedValue(goalFx()); });

  it("大会名を直して再保存: createCompetition は1回のみ、updateCompetition(作成済み id, 直した値) が1回、updateGoal は作成済み id", async () => {
    h.updateGoal.mockRejectedValueOnce(new Error("rls"));
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText("新規大会を作成"));
    fireEvent.change(nameInput(), { target: { value: "新大会A" } });
    fireEvent.click(screen.getByTestId("date-field"));
    await submit("更新");
    expect(h.createCompetition).toHaveBeenCalledTimes(1);
    expect(h.updateCompetition).not.toHaveBeenCalled();

    fireEvent.change(nameInput(), { target: { value: "新大会B(修正)" } });
    await submit("更新");
    expect(h.createCompetition).toHaveBeenCalledTimes(1);
    expect(h.updateCompetition).toHaveBeenCalledTimes(1);
    const [id, updates] = h.updateCompetition.mock.calls[0]!;
    expect(id).toBe("newc");
    expect(updates).toMatchObject({ title: "新大会B(修正)", date: "2099-12-31", pool_type: 0 });
    expect(h.updateGoal).toHaveBeenCalledTimes(2);
    expect(h.updateGoal.mock.calls[1]![1].competitionId).toBe("newc");
  });

  it("日付・水路を直した場合も updateCompetition に反映される", async () => {
    h.updateGoal.mockRejectedValueOnce(new Error("rls"));
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText("新規大会を作成"));
    fireEvent.change(nameInput(), { target: { value: "新大会" } });
    fireEvent.click(screen.getByTestId("date-field"));
    await submit("更新");
    h.pickDate = "2099-06-06";
    fireEvent.click(screen.getByTestId("date-field"));
    fireEvent.click(poolBtn(true));
    await submit("更新");
    expect(h.updateCompetition.mock.calls[0]![1]).toMatchObject({ date: "2099-06-06", pool_type: 1 });
  });

  it("入力が変わっていなければ updateCompetition は呼ばれない (作成済み大会をそのまま再利用)", async () => {
    h.updateGoal.mockRejectedValueOnce(new Error("rls"));
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText("新規大会を作成"));
    fireEvent.change(nameInput(), { target: { value: "新大会" } });
    fireEvent.click(screen.getByTestId("date-field"));
    await submit("更新");
    await submit("更新");
    expect(h.createCompetition).toHaveBeenCalledTimes(1);
    expect(h.updateCompetition).not.toHaveBeenCalled();
    expect(h.updateGoal).toHaveBeenCalledTimes(2);
    expect(h.updateGoal.mock.calls[1]![1].competitionId).toBe("newc");
  });
});

describe("U5 破棄確認 (usePreventRemove)", () => {
  it("未編集では prevent=false、編集すると true、保存成功後は false に戻る", async () => {
    renderScreen();
    await flush();
    expect(h.preventRemove.prevent).toBe(false);
    typeInto("goal-target-time", "1:00.00");
    expect(h.preventRemove.prevent).toBe(true);
    await pickCompetition("短水路杯");
    fireEvent.click(screen.getByTestId("style-1"));
    await submit();
    await flush();
    expect(h.preventRemove.prevent).toBe(false);
    expect(h.goBack).toHaveBeenCalledTimes(1);
  });

  it("コールバックは破棄確認ダイアログ (discardTitle/discardMessage) を出し、'破棄' で元の action を dispatch する", async () => {
    renderScreen();
    await flush();
    typeInto("goal-target-time", "1:00.00");
    const action = { type: "GO_BACK" };
    h.preventRemove.cb!({ data: { action } });
    const [title, msg, buttons] = vi.mocked(Alert.alert).mock.calls[0]!;
    expect([title, msg]).toEqual(["入力内容が保存されていません", "入力内容が保存されていません。このまま閉じますか？"]);
    (buttons as Array<{ style?: string; onPress?: () => void }>).find((b) => b.style === "destructive")!.onPress!();
    expect(h.dispatch).toHaveBeenCalledWith(action);
  });
});
