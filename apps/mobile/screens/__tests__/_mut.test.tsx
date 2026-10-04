// =============================================================================
// screens/__tests__/GoalFormScreen.test.tsx  (S1, S2, S6, U5, Boundary / Contract v4: M3 M4 L2 の仕様で記述)
// =============================================================================
// 方針: GoalAPI / RecordAPI のモックは呼び出し引数を assert。getBestTimes の fixture には「避けるべき行」
//   (別水路・リレー引継ぎのみ) を必ず含める (含めないと水路/リレー判定が無保護になる)。
// 注: v4 の仕様 (M3 過去日拒否 / M4 孤児大会防止 / L2 不正タイム保存拒否 / L3) は修正前は赤でよい。
// 何を壊したら赤くなるべきか:
//   - ベスト検索の pool_type 比較を緩める (`==` / `?? 0`) -> 長水路大会で短水路ベストが入る -> 赤
//   - is_relaying 除外を外す -> リレー引継ぎのみの種目で値が入る -> 赤
//   - savingRef を外す -> 二重タップで createGoal 2回 -> 赤
// =============================================================================
import * as React from "react";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
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
  bestResolvers: [] as Array<() => void>,
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
import { GoalFormScreen } from "../__mut__/GoalFormScreen_guard";

const STYLES = [
  { id: 1, name_jp: "100m 自由形", name: "100m Fr", style: "Fr", distance: 100 },
  { id: 2, name_jp: "50m 自由形", name: "50m Fr", style: "Fr", distance: 50 },
];
const COMPS = [
  { id: "c1", title: "短水路杯", date: "2099-11-01", pool_type: 0, team_id: null, place: null },
  { id: "c2", title: "長水路杯", date: "2099-12-01", pool_type: 1, team_id: null, place: null },
  { id: "c3", title: "チーム杯", date: "2099-12-15", pool_type: 0, team_id: "t1", place: null },
];
const bt = (o: Record<string, unknown>) => ({
  id: "b", created_at: "", is_relaying: false, style: { name_jp: "x", distance: 100 }, ...o,
});

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
  h.bestResolvers.length = 0;
  h.preventRemove.prevent = false;
  h.createGoal.mockReset().mockResolvedValue({ id: "new" });
  h.updateGoal.mockReset().mockResolvedValue({});
  h.getSelectableCompetitions.mockReset().mockResolvedValue(COMPS);
  h.getGoalWithMilestones.mockReset();
  h.getBestTimes.mockReset().mockResolvedValue([]);
  h.createCompetition.mockReset().mockResolvedValue({ id: "newc" });
  h.updateCompetition.mockReset().mockResolvedValue({ id: "newc" });
  h.getStyles.mockReset().mockResolvedValue(STYLES);
  h.goBack.mockReset();
  vi.mocked(Alert.alert).mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("S1 作成", () => {
  it("既存個人大会 + 種目 + 目標タイムで作成 -> createGoal が期待 input で1回、goBack", async () => {
    renderScreen();
    await flush();
    await pickCompetition("短水路杯");
    fireEvent.click(screen.getByTestId("style-1"));
    typeInto("goal-target-time", "1:00.00");
    await submit();
    expect(h.createGoal).toHaveBeenCalledTimes(1);
    expect(h.createGoal).toHaveBeenCalledWith({
      userId: "u1", competitionId: "c1", competitionData: undefined, styleId: 1, targetTime: 60, startTime: null, poolType: 0,
    });
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

  it("新規大会に切替: createGoal は competitionData つき・competitionId 未指定・poolType は選んだ水路", async () => {
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
    expect(arg.poolType).toBe(1);
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

  it("初期タイム 0 / 3601 秒 -> 保存不可 + startTimeInvalid", async () => {
    for (const raw of ["0", "60:01"]) {
      cleanup();
      h.createGoal.mockClear();
      await fillValid();
      typeInto("goal-target-time", "1:00.00");
      typeInto("goal-start-time", raw);
      await submit();
      expect(h.createGoal, raw).not.toHaveBeenCalled();
      expect(errorText(), raw).toContain("開始タイムを正しく入力してください（0秒超〜60分以内）");
    }
  });

  it("[v4 L2] 初期タイムに不正な文字列が残ったままの保存は拒否される (黙って null 保存しない)", async () => {
    await fillValid();
    typeInto("goal-target-time", "1:00.00");
    typeInto("goal-start-time", "abc");
    await submit();
    expect(h.createGoal).not.toHaveBeenCalled();
    expect(errorText().length).toBeGreaterThan(0);
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
// v7 A: 初期タイムの自動入力 (「ベストタイムから取得」ボタンとロックは廃止)
// =============================================================================
// 条件: 種目 × 対象大会の水路 (===) のベスト。リレー引き継ぎ (is_relaying) 除外。水路未確定なら入れない。
// fixture は「避けるべき行」(別水路・リレーのみ・別種目) を必ず含める。
// 壊したら赤: 水路条件の脱落 / 古い応答を捨てない / 編集モード初期表示での上書き / ボタンやロックの残存
const BESTS = [
  bt({ id: "s1-short", style_id: 1, pool_type: 0, time: 55 }),
  bt({ id: "s1-long", style_id: 1, pool_type: 1, time: 58, relayingTime: { id: "r", time: 50, created_at: "" } }),
  bt({ id: "s2-long", style_id: 2, pool_type: 1, time: 27 }),
  bt({ id: "s2-short-relay", style_id: 2, pool_type: 0, time: 20, is_relaying: true }),
];
const startVal = () => tid("goal-start-time").value;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 80)); });
const pickStyle = async (id: number) => { fireEvent.click(screen.getByTestId(`style-${id}`)); await settle(); };

describe("v7 A: 初期タイムの自動入力", () => {
  beforeEach(() => { h.getBestTimes.mockResolvedValue(BESTS); });

  it("「ベストタイムから取得」ボタンが存在しない。初期タイム欄は常に編集可能 (自動入力後も disabled でない)", async () => {
    renderScreen();
    await flush();
    expect(screen.queryByText("ベストタイムから取得")).toBeNull();
    await pickCompetition("長水路杯");
    await pickStyle(1);
    expect(startVal()).toBe("58.00");
    expect(tid("goal-start-time").disabled).toBe(false);
    typeInto("goal-start-time", "1:10.00");
    expect(startVal()).toBe("1:10.00");
  });

  it("種目を選ぶと『その種目 × 対象大会の水路』のベストだけが入る (長水路: 短水路 55 とリレーは選ばない)", async () => {
    renderScreen();
    await flush();
    await pickCompetition("長水路杯");
    await pickStyle(1);
    expect(startVal()).toBe("58.00");
  });

  it("短水路大会 (pool_type=0): 0 を falsy として取りこぼさず 55.00 が入る", async () => {
    renderScreen();
    await flush();
    await pickCompetition("短水路杯");
    await pickStyle(1);
    expect(startVal()).toBe("55.00");
  });

  it("種目を先に選び、後から大会を選んでも (種目と大会が揃った時点で) 自動入力される", async () => {
    renderScreen();
    await flush();
    await pickStyle(1);
    expect(startVal()).toBe("");
    await pickCompetition("長水路杯");
    await settle();
    expect(startVal()).toBe("58.00");
  });

  it("種目を変えると入れ直す: 直前の手入力も上書きされる (style1 長水路 58 -> 手入力 -> style2 長水路 27)", async () => {
    renderScreen();
    await flush();
    await pickCompetition("長水路杯");
    await pickStyle(1);
    typeInto("goal-start-time", "9:99.00");
    fireEvent.change(tid("goal-start-time"), { target: { value: "1:10.00" } });
    await pickStyle(2);
    expect(startVal()).toBe("27.00");
  });

  it("手入力した種目に戻ってきても入れ直す: style1 (58) -> 手入力 -> style2 (27) -> style1 に戻すと 58 (手入力済みキーの『上書きしない』が残って B の値のままにならない)", async () => {
    renderScreen();
    await flush();
    await pickCompetition("長水路杯");
    await pickStyle(1);
    expect(startVal()).toBe("58.00");
    fireEvent.change(tid("goal-start-time"), { target: { value: "" } });
    typeInto("goal-start-time", "1:10.00");
    await pickStyle(2);
    expect(startVal()).toBe("27.00");
    await pickStyle(1);
    expect(startVal()).toBe("58.00");
  });

  it("手入力のあと、同じ種目・同じ大会のまま他の操作 (大会再選択で同じ水路) をしても勝手に上書きしない", async () => {
    renderScreen();
    await flush();
    await pickCompetition("長水路杯");
    await pickStyle(1);
    fireEvent.change(tid("goal-start-time"), { target: { value: "" } });
    typeInto("goal-start-time", "1:10.00");
    await settle();
    expect(startVal()).toBe("1:10.00");
  });

  it("既存大会を選び直すと入れ直す (長水路杯 58 -> 短水路杯 55)", async () => {
    renderScreen();
    await flush();
    await pickCompetition("長水路杯");
    await pickStyle(1);
    expect(startVal()).toBe("58.00");
    await pickCompetition("短水路杯");
    await settle();
    expect(startVal()).toBe("55.00");
  });

  it("新規大会の水路を切り替えると入れ直す (短水路 55 -> 長水路 58 -> 短水路 55)。リレーのみの種目 2 短水路は空", async () => {
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText("新規大会を作成"));
    await pickStyle(1);
    expect(startVal()).toBe("55.00");
    fireEvent.click(poolBtn(true));
    await settle();
    expect(startVal()).toBe("58.00");
    fireEvent.click(poolBtn(false));
    await settle();
    expect(startVal()).toBe("55.00");
    await pickStyle(2); // 短水路の style2 はリレー引き継ぎのみ -> 該当なし
    expect(startVal()).toBe("");
  });

  it("既存 ↔ 新規の切替で水路が変わる場合も入れ直す (長水路杯 58 -> 新規 (既定 短水路) 55)", async () => {
    renderScreen();
    await flush();
    await pickCompetition("長水路杯");
    await pickStyle(1);
    expect(startVal()).toBe("58.00");
    fireEvent.click(screen.getByText("新規大会を作成"));
    await settle();
    expect(startVal()).toBe("55.00");
  });

  it("該当なし (その水路にベストが無い) は初期タイムを空にし、アラート・エラーは出さない", async () => {
    h.getBestTimes.mockResolvedValue([bt({ id: "x", style_id: 1, pool_type: 1, time: 58 })]);
    renderScreen();
    await flush();
    await pickCompetition("短水路杯");
    typeInto("goal-start-time", "1:10.00");
    await pickStyle(1);
    expect(startVal()).toBe("");
    expect(errorText()).toEqual([]);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("取得失敗: 初期タイムは据え置き (手入力値が残る)、アラート・エラーは出さない、生エラー非表示", async () => {
    h.getBestTimes.mockRejectedValue(new Error("SECRET_RAW_BT"));
    renderScreen();
    await flush();
    await pickCompetition("長水路杯");
    typeInto("goal-start-time", "1:10.00");
    await pickStyle(1);
    expect(startVal()).toBe("1:10.00");
    expect(errorText()).toEqual([]);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("SECRET_RAW_BT");
  });

  it("大会未選択 (水路不明) では入らない。短水路にフォールバックして入れない", async () => {
    renderScreen();
    await flush();
    await pickStyle(1);
    expect(startVal()).toBe("");
  });

  it("種目を素早く A -> B と切り替え、応答の順序を入れ替えても (A が後着) 最終的に B のベストになる", async () => {
    const pending: Array<() => void> = [];
    h.getBestTimes.mockImplementation(() => new Promise((r) => { pending.push(() => r(BESTS)); }));
    renderScreen();
    await flush();
    await pickCompetition("長水路杯");
    fireEvent.click(screen.getByTestId("style-1"));
    fireEvent.click(screen.getByTestId("style-2"));
    await settle();
    // 新しい問い合わせ (最後) から先に解決し、古い問い合わせを後から解決する
    await act(async () => { [...pending].reverse().forEach((f) => f()); await new Promise((r) => setTimeout(r, 80)); });
    expect(startVal()).toBe("27.00");
  });

  it("[H1 回帰] 初期タイムに 'abc' -> 保存拒否 -> 種目の選び直しで自動入力 -> そのまま保存できる (復旧不能にならない)", async () => {
    renderScreen();
    await flush();
    await pickCompetition("短水路杯");
    await pickStyle(1);
    typeInto("goal-target-time", "1:00.00");
    typeInto("goal-start-time", "abc");
    await submit();
    expect(h.createGoal).not.toHaveBeenCalled();
    expect(errorText().length).toBeGreaterThan(0);
    await pickStyle(2); // 短水路の style2 はリレーのみ -> 空。もう一度 style1 で自動入力
    await pickStyle(1);
    expect(startVal()).toBe("55.00");
    await submit();
    expect(h.createGoal).toHaveBeenCalledTimes(1);
    expect(h.createGoal.mock.calls[0]![0].startTime).toBe(55);
  });

  it("初期タイムを空にして保存すると startTime=null (不正入力フラグが残らない)", async () => {
    renderScreen();
    await flush();
    await pickCompetition("短水路杯");
    await pickStyle(1);
    typeInto("goal-target-time", "1:00.00");
    typeInto("goal-start-time", "abc");
    fireEvent.change(tid("goal-start-time"), { target: { value: "" } });
    await submit();
    expect(h.createGoal.mock.calls[0]![0].startTime).toBeNull();
  });
});

describe("v7 A (編集モード): 開いた直後は保存済みの初期タイムを上書きしない", () => {
  const goalFx = () => ({
    id: "g1", user_id: "u1", competition_id: "c1", style_id: 1, target_time: 60, start_time: 70, status: "active",
    achieved_at: null, reflection_note: null, created_at: "", updated_at: "",
    competition: { id: "c1", title: "短水路杯", date: "2099-11-01", pool_type: 0, team_id: null },
    style: STYLES[0], milestones: [],
  });
  beforeEach(() => {
    h.params = { goalId: "g1" };
    h.getGoalWithMilestones.mockResolvedValue(goalFx());
    h.getBestTimes.mockResolvedValue(BESTS); // style1 短水路のベストは 55 (保存済みは 70)
  });

  it("開いた直後 (ベスト取得の完了後も) 初期タイムは保存済みの 1:10.00 のまま", async () => {
    renderScreen();
    await flush();
    await settle();
    expect(startVal()).toBe("1:10.00");
  });

  it("開いた直後に何も触らず更新: updateGoal の startTime は保存済みの 70", async () => {
    renderScreen();
    await flush();
    await settle();
    await submit("更新");
    expect(h.updateGoal.mock.calls[0]![1].startTime).toBe(70);
  });

  it("ユーザーが種目を変えたときだけ自動入力される (style2 短水路はリレーのみ -> 空)。style1 に戻すと 55", async () => {
    renderScreen();
    await flush();
    await settle();
    await pickStyle(2);
    expect(startVal()).toBe("");
    await pickStyle(1);
    expect(startVal()).toBe("55.00");
  });

  it("ユーザーが大会を長水路杯に変えたときだけ入れ直す (58)", async () => {
    renderScreen();
    await flush();
    await settle();
    await pickCompetition("長水路杯");
    await settle();
    expect(startVal()).toBe("58.00");
  });
});

describe("v7 A (ベストの取得タイミング): 取得中・取得失敗中に種目を変える / 編集モードで取得が遅い", () => {
  it("ベスト取得中に種目を A -> B と変え、その後データが届くと B のベストが入る", async () => {
    let resolve!: () => void;
    h.getBestTimes.mockImplementation(() => new Promise((r) => { resolve = () => r(BESTS); }));
    renderScreen();
    await flush();
    await pickCompetition("長水路杯");
    await pickStyle(1);
    await pickStyle(2);
    expect(startVal()).toBe("");
    await act(async () => { resolve(); await new Promise((r) => setTimeout(r, 80)); });
    expect(startVal()).toBe("27.00");
  });

  it("ベスト取得失敗中に種目を変え、再取得で成功すると、そのときの種目のベストが入る", async () => {
    h.getBestTimes.mockRejectedValue(new Error("fail"));
    renderScreen();
    await flush();
    await pickCompetition("長水路杯");
    await pickStyle(1);
    await pickStyle(2);
    expect(startVal()).toBe("");
    h.getBestTimes.mockResolvedValue(BESTS);
    await act(async () => { await qc.refetchQueries(); await new Promise((r) => setTimeout(r, 80)); });
    expect(startVal()).toBe("27.00");
  });

  it("編集モードでベスト取得が遅い (データ未着のまま描画 -> 到着) 場合も、保存済みの初期タイムを上書きしない", async () => {
    h.params = { goalId: "g1" };
    h.getGoalWithMilestones.mockResolvedValue({
      id: "g1", user_id: "u1", competition_id: "c1", style_id: 1, target_time: 60, start_time: 70, status: "active",
      achieved_at: null, reflection_note: null, created_at: "", updated_at: "",
      competition: { id: "c1", title: "短水路杯", date: "2099-11-01", pool_type: 0, team_id: null },
      style: STYLES[0], milestones: [],
    });
    let resolve!: () => void;
    h.getBestTimes.mockImplementation(() => new Promise((r) => { resolve = () => r(BESTS); }));
    renderScreen();
    await flush();
    await settle();
    expect(startVal()).toBe("1:10.00");
    await act(async () => { resolve(); await new Promise((r) => setTimeout(r, 80)); });
    expect(startVal()).toBe("1:10.00");
    await submit("更新");
    expect(h.updateGoal.mock.calls[0]![1].startTime).toBe(70);
  });
});

describe("v7 M1/L1: ベストの鮮度と手入力の保護", () => {
  const placeholder = () => tid("goal-start-time").placeholder;

  it("[M1] 古いベストがキャッシュにある状態でフォームを開き直すと、古い値 (1:00.00) は入れず、新しい取得結果 (58.00) が届いて入る。開くたびに getBestTimes が呼ばれる", async () => {
    // 1回目: 古いベスト (60) で自動入力させ、そのクエリを別の observer で生かしておく (他画面が購読している状況)
    h.getBestTimes.mockResolvedValue([bt({ id: "old", style_id: 1, pool_type: 1, time: 60 })]);
    const first = renderScreen();
    await flush();
    await pickCompetition("長水路杯");
    await pickStyle(1);
    expect(startVal()).toBe("1:00.00");
    const shared = qc;
    const cached = shared.getQueryCache().getAll().find((q) => JSON.stringify(q.queryKey).includes("bestTimesForForm"));
    expect(cached, "ベスト用クエリが見つからない (キー名に bestTimesForForm を含む前提)").toBeTruthy();
    const keepAlive = new QueryObserver(shared, { queryKey: cached!.queryKey, queryFn: () => [], gcTime: Infinity, enabled: false }).subscribe(() => {});
    first.unmount();
    const callsBefore = h.getBestTimes.mock.calls.length;

    // 2回目: 新しい取得は遅延。届くまで古い値を入れない
    let resolve!: () => void;
    h.getBestTimes.mockImplementation(() => new Promise((r) => { resolve = () => r([bt({ id: "new", style_id: 1, pool_type: 1, time: 58 })]); }));
    renderScreen(shared);
    await flush();
    await pickCompetition("長水路杯");
    await pickStyle(1);
    expect(startVal()).not.toBe("1:00.00");
    expect(startVal()).toBe("");
    await act(async () => { resolve(); await new Promise((r) => setTimeout(r, 80)); });
    expect(startVal()).toBe("58.00");
    expect(h.getBestTimes.mock.calls.length).toBeGreaterThan(callsBefore);
    keepAlive();
  });

  it("[L1] 種目と大会が揃い取得中に手入力 -> 取得完了しても手入力が残る。その後に種目を変えると自動入力される", async () => {
    let resolve!: () => void;
    h.getBestTimes.mockImplementation(() => new Promise((r) => { resolve = () => r(BESTS); }));
    renderScreen();
    await flush();
    await pickCompetition("長水路杯");
    await pickStyle(1);
    typeInto("goal-start-time", "1:10.00");
    await act(async () => { resolve(); await new Promise((r) => setTimeout(r, 80)); });
    expect(startVal()).toBe("1:10.00");
    await pickStyle(2);
    expect(startVal()).toBe("27.00");
  });

  it("[L1] 取得中は初期タイム欄の placeholder が読み込み中の文言、取得完了で通常の placeholder に戻る", async () => {
    let resolve!: () => void;
    h.getBestTimes.mockImplementation(() => new Promise((r) => { resolve = () => r(BESTS); }));
    renderScreen();
    await flush();
    await pickCompetition("長水路杯");
    await pickStyle(1);
    expect(placeholder()).toBe("読み込み中...");
    await act(async () => { resolve(); await new Promise((r) => setTimeout(r, 80)); });
    expect(placeholder()).toBe("2.00.00");
  });

  it("[L1] ベスト取得が失敗したら placeholder は通常に戻る (読み込み中の文言が残らない)。初期タイムは変えない", async () => {
    h.getBestTimes.mockRejectedValue(new Error("fail"));
    renderScreen();
    await flush();
    await pickCompetition("長水路杯");
    await pickStyle(1);
    await settle();
    expect(placeholder()).toBe("2.00.00");
    expect(startVal()).toBe("");
  });

  it("[L2] 目標系の invalidate (goalKeys.all) でベスト用クエリが再取得されない", async () => {
    h.getBestTimes.mockResolvedValue(BESTS);
    renderScreen();
    await flush();
    await pickCompetition("長水路杯");
    await pickStyle(1);
    const before = h.getBestTimes.mock.calls.length;
    await act(async () => { await qc.invalidateQueries({ queryKey: ["goals"] }); await new Promise((r) => setTimeout(r, 80)); });
    expect(h.getBestTimes.mock.calls.length).toBe(before);
  });
});

// =============================================================================
// v7 B: 目標タイムと初期タイムは同じ行 (構造)
// =============================================================================
describe("v7 B: 目標タイムと初期タイムが同じ行 (同じ親の横並び)", () => {
  it("2つの入力欄の最も近い共通祖先が flexDirection: row で、他の入力欄を含まない。目標が左 (先)、初期が右 (後)", async () => {
    renderScreen();
    await flush();
    const target = tid("goal-target-time");
    const start = tid("goal-start-time");
    let node: HTMLElement | null = target.parentElement;
    while (node && !node.contains(start)) node = node.parentElement;
    expect(node).not.toBeNull();
    expect(node!.style.flexDirection).toBe("row");
    expect(node!.querySelectorAll("input")).toHaveLength(2);
    expect(target.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("ラベルは各欄の上: 目標タイム / 初期タイム (任意) のラベル文言が各入力欄より前にある", async () => {
    renderScreen();
    await flush();
    const text = (el: Element) => el.textContent ?? "";
    const row = (() => { let n: HTMLElement | null = tid("goal-target-time").parentElement; while (n && !n.contains(tid("goal-start-time"))) n = n.parentElement; return n!; })();
    expect(text(row)).toContain("目標タイム");
    expect(text(row)).toContain("初期タイム（任意）");
    expect(text(row).indexOf("目標タイム")).toBeLessThan(text(row).indexOf("初期タイム（任意）"));
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
        id: "g1", user_id: "u1", competition_id: "c9", style_id: 1, target_time: 60, start_time: 70, status: "active",
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
    id: "g1", user_id: "u1", competition_id: "c9", style_id: 1, target_time: 60, start_time: 70, status: "active",
    achieved_at: null, reflection_note: null, created_at: "", updated_at: "",
    competition: { id: "c9", title: "過去の短水路杯", date: "2000-01-01", pool_type: 0, team_id: null },
    style: STYLES[0], milestones: [], ...over,
  });
  beforeEach(() => { h.params = { goalId: "g1" }; h.getGoalWithMilestones.mockResolvedValue(goalFx()); });

  it("既存値がプリフィルされ、過去日の既存大会も選択済みで表示される", async () => {
    renderScreen();
    await flush();
    expect(tid("goal-target-time").value).toBe("1:00.00");
    expect(tid("goal-start-time").value).toBe("1:10.00");
    expect(document.body.textContent).toContain("過去の短水路杯");
  });

  it("更新 -> updateGoal('g1', {competitionId, styleId, targetTime, startTime}) の引数 assert", async () => {
    renderScreen();
    await flush();
    typeInto("goal-target-time", "");
    fireEvent.change(tid("goal-target-time"), { target: { value: "" } });
    typeInto("goal-target-time", "59.50");
    await submit("更新");
    expect(h.updateGoal).toHaveBeenCalledTimes(1);
    expect(h.updateGoal).toHaveBeenCalledWith("g1", { competitionId: "c9", styleId: 1, targetTime: 59.5, startTime: 70 });
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
    id: "g1", user_id: "u1", competition_id: "c9", style_id: 1, target_time: 60, start_time: 70, status: "active",
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
