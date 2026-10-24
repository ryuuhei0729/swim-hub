/**
 * apps/web/__tests__/goals/goalFormBestTimeLabel.test.tsx
 *
 * 目標の作成 (GoalCreateModal) / 編集 (GoalEditModal) フォーム — Sprint Contract v4。
 *  - 初期タイム欄は無い (SC1)。createGoal / updateGoal に初期タイムも CreateGoalInput.poolType も渡さない (SC5 / D9)
 *  - V4-1 ベストタイムラベル: エントリーと同じ出し方 (useBestTimesQuery + getBestTimeForEntry、isRelaying=false)。
 *    data-testid="goal-best-time-label"、文言は「forms.recordLog.<labelKey>: <formatTimeBest(time)>」、緑の丸いラベル。
 *    同じ水路 → 別の水路 (bestTimeLong / bestTimeShort) の順。目標タイム入力欄の右 (狭い幅では下に折り返す)。
 *    種目が未選択・水路が未確定・ベスト一覧が取得中 / 失敗・該当なしのときは要素ごと出さない (「記録なし」「—」は無い)
 *  - V4-2 新規大会の入力: 1行目に開始日・終了日、2行目に大会名 (1行全部)、3行目に場所と水路の切り替えボタン
 *    (大会記録の登録と同じ並び。水路の select は無い)。
 *    終了日を保存する (作成: competitionData.endDate / 編集: createCompetition・updateCompetition の end_date)。
 *    終了日 < 開始日は alert(forms.competition.end_date_error) で保存しない
 *  - 残す観点: 大会作成 (既存・新規)、大会未選択では保存しない、保存失敗時の再送、開き直し・別の目標の編集
 *
 * RecordAPI.getBestTimes は BestTime[] (aggregateBestTimes の形) を返すモック。DatePicker は値を変えられる入力欄に差し替える。
 * next-intl は key をそのまま返す passthrough (値付きは `key:{json}`)。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { format } from "date-fns";
import type { GoalWithMilestones, Style, Competition } from "@apps/shared/types";

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return {
    ...original,
    useTranslations: (namespace?: string) => {
      const t = (key: string, values?: Record<string, unknown>) => {
        const full = namespace ? `${namespace}.${key}` : key;
        return values ? `${full}:${JSON.stringify(values)}` : full;
      };
      t.raw = () => ["日", "月", "火", "水", "木", "金", "土"];
      return t as unknown as ReturnType<typeof original.useTranslations>;
    },
    useLocale: () => "ja",
  };
});

const SUPABASE = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }) };
vi.mock("@/contexts", () => ({ useAuth: () => ({ supabase: SUPABASE, user: { id: "u1" }, subscription: null }) }));
vi.mock("@apps/shared/hooks/queries/teams", () => ({ useTeamsQuery: () => ({ teams: [] }) }));
vi.mock("@apps/shared/hooks/queries/user", () => ({ useUserProfileQuery: () => ({ data: null, isLoading: false }) }));

const mocks = vi.hoisted(() => ({
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  getSelectableCompetitions: vi.fn(),
  getBestTimes: vi.fn(),
  createCompetition: vi.fn(),
  updateCompetition: vi.fn(),
  datePickerProps: [] as Array<{ testId?: string; minDate?: Date; value: string }>,
}));
vi.mock("@apps/shared/api/goals", () => ({
  GoalAPI: vi.fn().mockImplementation(function () {
    return {
      createGoal: mocks.createGoal,
      updateGoal: mocks.updateGoal,
      getSelectableCompetitions: mocks.getSelectableCompetitions,
    };
  }),
}));
vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: vi.fn().mockImplementation(function () {
    return {
      getBestTimes: mocks.getBestTimes,
      createCompetition: mocks.createCompetition,
      updateCompetition: mocks.updateCompetition,
    };
  }),
}));
// DatePicker は値を変えられる入力欄にする (渡された data-testid・label・minDate を観測する)
vi.mock("@/components/ui/DatePicker", () => ({
  default: (props: { value: string; onChange: (d: string) => void; minDate?: Date; label?: string; "data-testid"?: string }) => {
    mocks.datePickerProps.push({ testId: props["data-testid"], minDate: props.minDate, value: props.value });
    return (
      <input
        type="text"
        aria-label={props.label}
        data-testid={props["data-testid"] ?? "date-pick"}
        value={props.value ?? ""}
        onChange={(e) => props.onChange(e.target.value)}
      />
    );
  },
}));

import GoalCreateModal from "../../app/[locale]/(authenticated)/goals/_components/GoalCreateModal";
import GoalEditModal from "../../app/[locale]/(authenticated)/goals/_components/GoalEditModal";

// id: 1-7 = 自由形 / 8-11 = 平泳ぎ (StyleChipSelector の styleIdToCodeKey 規約)
const S_50FR: Style = { id: 1, name_jp: "50m 自由形", name: "50m Fr", style: "Fr", distance: 50 };
const S_100FR: Style = { id: 2, name_jp: "100m 自由形", name: "100m Fr", style: "Fr", distance: 100 };
const S_200FR: Style = { id: 3, name_jp: "200m 自由形", name: "200m Fr", style: "Fr", distance: 200 };
const S_100BR: Style = { id: 8, name_jp: "100m 平泳ぎ", name: "100m Br", style: "Br", distance: 100 };
const STYLES = [S_50FR, S_100FR, S_200FR, S_100BR];
const COMP_SHORT = { id: "c1", title: "短水路杯", date: "2099-11-01", pool_type: 0, team_id: null } as unknown as Competition;
const COMP_LONG = { id: "c2", title: "長水路杯", date: "2099-12-01", pool_type: 1, team_id: null } as unknown as Competition;

/** RecordAPI.getBestTimes の1行 (aggregateBestTimes の形: 種目 × 水路ごとに1件。引継は非リレーの行に relayingTime で付く) */
const bt = (style: Style, pool_type: number, time: number, extra: Record<string, unknown> = {}) => ({
  id: `${style.id}-${pool_type}`, created_at: "", is_relaying: false, style_id: style.id,
  style: { name_jp: style.name_jp, distance: style.distance }, pool_type, time, ...extra,
});
// 100m Fr: 短水路 55 (それより速い引継 50 が付く) / 長水路 58。50m Fr: 長水路 27 だけ。100m Br: 短水路 1:05.50 だけ。200m Fr: 無し
const BESTS = [
  bt(S_100FR, 0, 55, { relayingTime: { id: "r", time: 50, created_at: "" } }),
  bt(S_100FR, 1, 58),
  bt(S_50FR, 1, 27),
  bt(S_100BR, 0, 65.5),
];

const label = () => screen.queryByTestId("goal-best-time-label");
const labelText = () => label()?.textContent?.trim() ?? null;
const bestLabel = (key: string, time: string) => `forms.recordLog.${key}: ${time}`;
const targetInput = () => screen.getByPlaceholderText("goals.form.targetTimePlaceholder") as HTMLInputElement;
const compSelect = () => screen.getAllByRole("combobox")[0]!;
const poolButton = (value: 0 | 1) => screen.getByTestId(`goal-new-competition-pool-type-${value}`);
const startDate = () => screen.getByTestId("goal-new-competition-date") as HTMLInputElement;
const endDate = () => screen.getByTestId("goal-new-competition-end-date") as HTMLInputElement;
const today = () => format(new Date(), "yyyy-MM-dd");

let qc: QueryClient;
let spies: Array<{ mockRestore: () => void }> = [];
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

type User = ReturnType<typeof userEvent.setup>;
async function pickStyle(user: User, distance: number, stroke: "Fr" | "Br") {
  // 現在の距離に無い泳法のチップは描画されないので、その場合は先に距離を合わせる
  if (!screen.queryByTestId(`goal-style-stroke-${stroke}`)) {
    await user.click(screen.getByTestId(`goal-style-distance-${distance}`));
  }
  await user.click(screen.getByTestId(`goal-style-stroke-${stroke}`));
  await user.click(screen.getByTestId(`goal-style-distance-${distance}`));
  await settle();
}
async function pickCompetition(user: User, id: string) {
  await user.selectOptions(compSelect(), id);
  await settle();
}
const setDate = async (el: HTMLInputElement, value: string) => {
  fireEvent.change(el, { target: { value } });
  await settle();
};

beforeEach(() => {
  mocks.createGoal.mockReset().mockResolvedValue({ id: "new" });
  mocks.updateGoal.mockReset().mockResolvedValue({});
  mocks.getSelectableCompetitions.mockReset().mockResolvedValue([COMP_SHORT, COMP_LONG]);
  mocks.getBestTimes.mockReset().mockResolvedValue(BESTS);
  mocks.createCompetition.mockReset().mockResolvedValue({ id: "newc" });
  mocks.updateCompetition.mockReset().mockResolvedValue({ id: "newc" });
  mocks.datePickerProps.length = 0;
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  spies = [vi.spyOn(window, "alert").mockImplementation(() => {}), vi.spyOn(console, "error").mockImplementation(() => {})];
});
afterEach(() => { cleanup(); spies.forEach((s) => s.mockRestore()); });

// ============================== 作成 ==============================
describe("GoalCreateModal", () => {
  const ui = (isOpen = true) => (
    <QueryClientProvider client={qc}>
      <GoalCreateModal isOpen={isOpen} onClose={() => {}} onSuccess={async () => {}} styles={STYLES} />
    </QueryClientProvider>
  );
  const open = async () => {
    const r = render(ui());
    await settle();
    return r;
  };
  const submit = (user: User) => user.click(screen.getByRole("button", { name: "goals.create.submitButton" }));
  const openNewCompetition = async (user: User) => {
    await open();
    await user.click(screen.getByLabelText("goals.form.newCompetitionRadio"));
    await settle();
  };

  it("[SC1] 初期タイム欄 (ラベル・placeholder・入力欄) が無く、タイム入力欄は目標タイムの1つだけ", async () => {
    await open();
    expect(screen.queryByTestId("goal-start-time")).toBeNull();
    expect(screen.queryByText("goals.form.startTimeLabel")).toBeNull();
    expect(screen.queryByPlaceholderText("goals.form.startTimePlaceholder")).toBeNull();
    expect(screen.getAllByPlaceholderText("goals.form.targetTimePlaceholder")).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(/startTime|initialTime/);
  });

  it("既存大会の選択肢は「YYYY/MM/DD 大会名」の順 (2026-10-15 ユーザー指定: 日付を先に出す)", async () => {
    await open();
    const labels = Array.from(compSelect().querySelectorAll("option"))
      .filter((o) => o.value !== "")
      .map((o) => o.textContent?.replace(/\s+/g, " ").trim());
    expect(labels).toEqual(expect.arrayContaining(["2099/11/01 短水路杯", "2099/12/01 長水路杯"]));
    expect(labels.some((l) => / - \d{4}\//.test(l ?? ""))).toBe(false);
  });

  describe("V4-1 ベストタイムラベル", () => {
    it("種目も大会も未選択・種目だけ (大会未選択 = 水路が未確定) のときは出さない。大会を選ぶと出る", async () => {
      const user = userEvent.setup();
      await open();
      expect(label()).toBeNull();
      await pickStyle(user, 100, "Fr");
      expect(label()).toBeNull();
      await pickCompetition(user, "c2");
      expect(labelText()).toBe(bestLabel("bestTimeLabel", "58.00"));
    });

    it("大会だけ (種目が未選択) のときは出さない。種目を選ぶと出る", async () => {
      const user = userEvent.setup();
      await open();
      await pickCompetition(user, "c2");
      expect(label()).toBeNull();
      await pickStyle(user, 100, "Fr");
      expect(labelText()).toBe(bestLabel("bestTimeLabel", "58.00"));
    });

    it("同じ水路のベストを出す: 長水路杯 + 100m Fr は 58.00、短水路杯に変えると 55.00 (引継の 50.00 は出さない = isRelaying は false)", async () => {
      const user = userEvent.setup();
      await open();
      await pickCompetition(user, "c2");
      await pickStyle(user, 100, "Fr");
      expect(labelText()).toBe(bestLabel("bestTimeLabel", "58.00"));
      await pickCompetition(user, "c1");
      expect(labelText()).toBe(bestLabel("bestTimeLabel", "55.00"));
    });

    it("同じ水路に無ければ別の水路のベストを出し、出どころをラベルに書く (短水路杯 + 50m Fr → bestTimeLong 27.00 / 長水路杯 + 100m Br → bestTimeShort 1:05.50)", async () => {
      const user = userEvent.setup();
      await open();
      await pickCompetition(user, "c1");
      await pickStyle(user, 50, "Fr");
      expect(labelText()).toBe(bestLabel("bestTimeLong", "27.00"));
      await pickCompetition(user, "c2");
      await pickStyle(user, 100, "Br");
      expect(labelText()).toBe(bestLabel("bestTimeShort", "1:05.50"));
    });

    it("どの水路にもベストが無い種目 (200m Fr) は要素ごと出さない (「記録なし」「—」は出さない)", async () => {
      const user = userEvent.setup();
      await open();
      await pickCompetition(user, "c2");
      await pickStyle(user, 200, "Fr");
      expect(label()).toBeNull();
      expect(document.body.textContent).not.toMatch(/goals\.detail\.noRecord|—/);
    });

    it("種目を変えるとその種目のベストに切り替わり、目標タイム欄の値は変わらない", async () => {
      const user = userEvent.setup();
      await open();
      await pickCompetition(user, "c2");
      await pickStyle(user, 100, "Fr");
      await user.type(targetInput(), "1:00.00");
      expect(labelText()).toBe(bestLabel("bestTimeLabel", "58.00"));
      await pickStyle(user, 50, "Fr");
      expect(labelText()).toBe(bestLabel("bestTimeLabel", "27.00"));
      expect(targetInput().value).toBe("1:00.00");
    });

    it("新規大会 (既定は短水路) でも出て、水路ボタンで入れ替わる (55 → 58 → 55)。目標タイム欄の値は変わらない", async () => {
      const user = userEvent.setup();
      await openNewCompetition(user);
      await pickStyle(user, 100, "Fr");
      await user.type(targetInput(), "59.00");
      expect(labelText()).toBe(bestLabel("bestTimeLabel", "55.00"));
      await user.click(poolButton(1));
      await settle();
      expect(labelText()).toBe(bestLabel("bestTimeLabel", "58.00"));
      await user.click(poolButton(0));
      await settle();
      expect(labelText()).toBe(bestLabel("bestTimeLabel", "55.00"));
      expect(targetInput().value).toBe("59.00");
    });

    it("ベスト一覧の取得中は出さず、届くと出す", async () => {
      let resolve!: (v: unknown[]) => void;
      mocks.getBestTimes.mockImplementation(() => new Promise((r) => (resolve = r)));
      const user = userEvent.setup();
      await open();
      await pickCompetition(user, "c2");
      await pickStyle(user, 100, "Fr");
      expect(label()).toBeNull();
      await act(async () => { resolve(BESTS); await new Promise((r) => setTimeout(r, 60)); });
      expect(labelText()).toBe(bestLabel("bestTimeLabel", "58.00"));
    });

    it("ベスト一覧の取得に失敗したら出さない。アラート・エラー表示・生エラーは出さず、そのまま保存できる", async () => {
      mocks.getBestTimes.mockRejectedValue(new Error("SECRET_RAW_BT"));
      const user = userEvent.setup();
      await open();
      await pickCompetition(user, "c2");
      await pickStyle(user, 100, "Fr");
      expect(label()).toBeNull();
      expect(window.alert).not.toHaveBeenCalled();
      expect(screen.queryAllByRole("alert")).toHaveLength(0);
      expect(document.body.textContent).not.toMatch(/SECRET_RAW_BT|—/);
      await user.type(targetInput(), "1:00.00");
      await submit(user);
      expect(mocks.createGoal).toHaveBeenCalledTimes(1);
      expect(mocks.createGoal.mock.calls[0]![0]).toMatchObject({ competitionId: "c2", styleId: 2, targetTime: 60 });
    });

    it("見た目は大会記録入力と同じ緑の丸いラベル (text-xs text-green-800 bg-green-100 px-3 py-1 rounded-full)", async () => {
      const user = userEvent.setup();
      await open();
      await pickCompetition(user, "c2");
      await pickStyle(user, 100, "Fr");
      const classes = label()!.className.split(/\s+/);
      for (const c of ["text-xs", "text-green-800", "bg-green-100", "px-3", "py-1", "rounded-full"]) expect(classes, c).toContain(c);
    });

    it("目標タイム欄の右 (DOM 上で入力欄の後ろ、折り返せる flex-wrap の同じ行) にあり、種目・大会の入力とは別のまとまり", async () => {
      const user = userEvent.setup();
      await open();
      await pickCompetition(user, "c2");
      await pickStyle(user, 100, "Fr");
      const input = targetInput();
      const lbl = label()!;
      expect(input.compareDocumentPosition(lbl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      let common: HTMLElement | null = input.parentElement;
      while (common && !common.contains(lbl)) common = common.parentElement;
      expect(common).not.toBeNull();
      expect(common!.className.split(/\s+/)).toEqual(expect.arrayContaining(["flex", "flex-wrap"]));
      expect(common!.contains(compSelect())).toBe(false);
      expect(common!.contains(screen.getByTestId("goal-style-stroke-Fr"))).toBe(false);
    });

    it("開いていない間はラベルが無い。× で閉じて開き直すと種目・大会が空に戻りラベルは無く、選び直すと出る", async () => {
      const user = userEvent.setup();
      const { rerender } = render(ui(false));
      await settle();
      expect(label()).toBeNull();
      rerender(ui(true));
      await settle();
      await pickCompetition(user, "c2");
      await pickStyle(user, 100, "Fr");
      expect(labelText()).toBe(bestLabel("bestTimeLabel", "58.00"));
      await user.click(screen.getByRole("button", { name: "goals.create.closeAriaLabel" }));
      rerender(ui(false));
      await settle();
      rerender(ui(true));
      await settle();
      expect(label()).toBeNull();
      await pickCompetition(user, "c1");
      await pickStyle(user, 100, "Fr");
      expect(labelText()).toBe(bestLabel("bestTimeLabel", "55.00"));
    });
  });

  describe("V4-2 新規大会の入力", () => {
    it("1行目に開始日・終了日 (grid-cols-2)、2行目に大会名 (1行全部)、3行目に場所と水路の切り替えボタン。水路の select は無い", async () => {
      const user = userEvent.setup();
      await openNewCompetition(user);
      const start = startDate();
      const end = endDate();
      expect(start.getAttribute("aria-label")).toBe("forms.competition.start_date_label");
      expect(end.getAttribute("aria-label")).toBe("forms.competition.end_date_label");
      expect(start.parentElement).toBe(end.parentElement);
      expect(start.parentElement!.className.split(/\s+/)).toContain("grid-cols-2");

      const name = screen.getByPlaceholderText("goals.form.competitionNamePlaceholder");
      const place = screen.getByPlaceholderText("goals.form.competitionPlacePlaceholder");
      const group = screen.getByTestId("goal-new-competition-pool-type");
      expect(group.getAttribute("role")).toBe("group");
      // 場所と水路ボタンは同じ行 (共通の親に大会名は入らない = 大会名は1行全部)
      let row: HTMLElement | null = group.parentElement;
      while (row && !row.contains(place)) row = row.parentElement;
      expect(row).not.toBeNull();
      expect(row!.contains(name)).toBe(false);
      expect(name.parentElement!.contains(group)).toBe(false);
      expect(within(group).getAllByRole("button")).toHaveLength(2);
      // 並び: 日付 → 大会名 → 場所 → 水路ボタン
      expect(end.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(name.compareDocumentPosition(place) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(place.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(screen.getByText("forms.competition.name_label")).toBeInTheDocument();
      expect(screen.getByText("forms.competition.place_label")).toBeInTheDocument();
      expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    });

    it("水路ボタンは既定が短水路 (aria-pressed)。押した方だけが押下状態になる", async () => {
      const user = userEvent.setup();
      await openNewCompetition(user);
      expect(poolButton(0).getAttribute("aria-pressed")).toBe("true");
      expect(poolButton(1).getAttribute("aria-pressed")).toBe("false");
      await user.click(poolButton(1));
      expect(poolButton(0).getAttribute("aria-pressed")).toBe("false");
      expect(poolButton(1).getAttribute("aria-pressed")).toBe("true");
    });

    it("開始日の minDate は今日、終了日の minDate は開始日", async () => {
      const user = userEvent.setup();
      await openNewCompetition(user);
      await setDate(startDate(), "2099-12-01");
      const lastOf = (id: string) => [...mocks.datePickerProps].reverse().find((p) => p.testId === id)!;
      expect(format(lastOf("goal-new-competition-date").minDate!, "yyyy-MM-dd")).toBe(today());
      expect(format(lastOf("goal-new-competition-end-date").minDate!, "yyyy-MM-dd")).toBe("2099-12-01");
    });
  });

  describe("[SC5] 保存 (大会作成・種目選択・保存失敗時の再送)", () => {
    it("既存大会: createGoal は大会 id・種目・目標タイムで1回呼ばれ、初期タイムと poolType を渡さない", async () => {
      const user = userEvent.setup();
      await open();
      await pickCompetition(user, "c2");
      await pickStyle(user, 100, "Fr");
      await user.type(targetInput(), "1:00.00");
      await submit(user);
      expect(mocks.createGoal).toHaveBeenCalledTimes(1);
      const arg = mocks.createGoal.mock.calls[0]![0];
      expect(arg).toMatchObject({ userId: "u1", competitionId: "c2", competitionData: undefined, styleId: 2, targetTime: 60 });
      expect(arg).not.toHaveProperty("startTime");
      // D9: CreateGoalInput.poolType は削除 (水路は大会側にだけある)
      expect(arg).not.toHaveProperty("poolType");
    });

    it("新規大会: competitionData は {大会名, 開始日, 終了日=null, 場所=null, 選んだ水路} と厳密一致し、competitionId・初期タイム・poolType を渡さない", async () => {
      const user = userEvent.setup();
      await openNewCompetition(user);
      await user.type(screen.getByPlaceholderText("goals.form.competitionNamePlaceholder"), "新規杯");
      await setDate(startDate(), "2099-12-01");
      await user.click(poolButton(1));
      await pickStyle(user, 100, "Fr");
      await user.type(targetInput(), "1:00.00");
      await submit(user);
      expect(mocks.createGoal).toHaveBeenCalledTimes(1);
      const arg = mocks.createGoal.mock.calls[0]![0];
      expect(arg.competitionId).toBeUndefined();
      expect(arg.competitionData).toEqual({ title: "新規杯", date: "2099-12-01", endDate: null, place: null, poolType: 1 });
      expect(arg).toMatchObject({ styleId: 2, targetTime: 60 });
      expect(arg).not.toHaveProperty("startTime");
      expect(arg).not.toHaveProperty("poolType");
    });

    it("[V4-2] 新規大会の終了日を保存する (competitionData.endDate)。終了日 = 開始日も保存できる", async () => {
      const user = userEvent.setup();
      await openNewCompetition(user);
      await user.type(screen.getByPlaceholderText("goals.form.competitionNamePlaceholder"), "2日間杯");
      await user.type(screen.getByPlaceholderText("goals.form.competitionPlacePlaceholder"), "県立プール");
      await setDate(startDate(), "2099-12-01");
      await setDate(endDate(), "2099-12-03");
      await pickStyle(user, 100, "Fr");
      await user.type(targetInput(), "1:00.00");
      await submit(user);
      expect(mocks.createGoal.mock.calls[0]![0].competitionData).toEqual({
        title: "2日間杯", date: "2099-12-01", endDate: "2099-12-03", place: "県立プール", poolType: 0,
      });

      cleanup();
      mocks.createGoal.mockClear();
      await openNewCompetition(user);
      await user.type(screen.getByPlaceholderText("goals.form.competitionNamePlaceholder"), "単日杯");
      await setDate(startDate(), "2099-12-01");
      await setDate(endDate(), "2099-12-01");
      await pickStyle(user, 100, "Fr");
      await user.type(targetInput(), "1:00.00");
      await submit(user);
      expect(mocks.createGoal).toHaveBeenCalledTimes(1);
      expect(mocks.createGoal.mock.calls[0]![0].competitionData.endDate).toBe("2099-12-01");
    });

    it("[V4-2] 終了日 < 開始日は alert(forms.competition.end_date_error) で保存しない。直せば保存できる", async () => {
      const user = userEvent.setup();
      await openNewCompetition(user);
      await user.type(screen.getByPlaceholderText("goals.form.competitionNamePlaceholder"), "逆転杯");
      await setDate(startDate(), "2099-12-03");
      await setDate(endDate(), "2099-12-01");
      await pickStyle(user, 100, "Fr");
      await user.type(targetInput(), "1:00.00");
      await submit(user);
      expect(window.alert).toHaveBeenCalledWith("forms.competition.end_date_error");
      expect(mocks.createGoal).not.toHaveBeenCalled();

      await setDate(endDate(), "2099-12-04");
      await submit(user);
      expect(mocks.createGoal).toHaveBeenCalledTimes(1);
      expect(mocks.createGoal.mock.calls[0]![0].competitionData).toMatchObject({ date: "2099-12-03", endDate: "2099-12-04" });
    });

    it("大会未選択では保存しない (大会の select は required。ネイティブ検証か competitionRequired のどちらかで止まる)", async () => {
      const user = userEvent.setup();
      await open();
      await pickStyle(user, 100, "Fr");
      await user.type(targetInput(), "1:00.00");
      await submit(user);
      expect(mocks.createGoal).not.toHaveBeenCalled();
    });

    it("保存失敗: 固定文言 createFailed で通知し、入力を保ったまま再送できる", async () => {
      mocks.createGoal.mockRejectedValueOnce(new Error("SECRET_RAW_RLS"));
      const user = userEvent.setup();
      await open();
      await pickCompetition(user, "c2");
      await pickStyle(user, 100, "Fr");
      await user.type(targetInput(), "1:00.00");
      await submit(user);
      expect(window.alert).toHaveBeenCalledWith("goals.create.createFailed");
      expect(document.body.textContent).not.toContain("SECRET_RAW_RLS");
      expect(targetInput().value).toBe("1:00.00");
      await submit(user);
      expect(mocks.createGoal).toHaveBeenCalledTimes(2);
      expect(mocks.createGoal.mock.calls[1]![0]).toMatchObject({ competitionId: "c2", styleId: 2, targetTime: 60 });
    });
  });
});

// ============================== 編集 ==============================
describe("GoalEditModal", () => {
  const goalFx = (o: Record<string, unknown> = {}) =>
    ({
      id: "g1", user_id: "u1", competition_id: "c1", style_id: 2, target_time: 60, status: "active",
      achieved_at: null, reflection_note: null, created_at: "", updated_at: "",
      competition: COMP_SHORT, style: S_100FR, milestones: [], ...o,
    }) as unknown as GoalWithMilestones & { competition: Competition };
  const ui = (goal = goalFx(), isOpen = true) => (
    <QueryClientProvider client={qc}>
      <GoalEditModal isOpen={isOpen} onClose={() => {}} onSuccess={async () => {}} goal={goal} styles={STYLES} />
    </QueryClientProvider>
  );
  const open = async (goal = goalFx()) => {
    const r = render(ui(goal));
    await settle();
    await settle();
    return r;
  };
  const submit = (user: User) => user.click(screen.getByRole("button", { name: "goals.edit.submitButton" }));
  const openNewCompetition = async (user: User) => {
    await open();
    await user.click(screen.getByLabelText("goals.form.newCompetitionRadio"));
    await user.type(screen.getByPlaceholderText("goals.form.competitionNamePlaceholder"), "新大会");
    await settle();
  };

  it("[SC1] 初期タイム欄が無い。目標タイム欄には保存済みの 1:00.00", async () => {
    await open();
    expect(screen.queryByTestId("goal-start-time")).toBeNull();
    expect(screen.queryByText("goals.form.startTimeLabel")).toBeNull();
    expect(screen.getAllByPlaceholderText("goals.form.targetTimePlaceholder")).toHaveLength(1);
    expect(targetInput().value).toBe("1:00.00");
  });

  it("[V4-1] 開くと保存済みの大会 (短水路杯) × 種目 (100m Fr) のベスト 55.00 を出す", async () => {
    await open();
    expect(labelText()).toBe(bestLabel("bestTimeLabel", "55.00"));
  });

  it("[V4-1] 大会を長水路杯に変えると 58.00、種目を 50m Fr に変えると 27.00。目標タイム欄は 1:00.00 のまま", async () => {
    const user = userEvent.setup();
    await open();
    await pickCompetition(user, "c2");
    expect(labelText()).toBe(bestLabel("bestTimeLabel", "58.00"));
    await pickStyle(user, 50, "Fr");
    expect(labelText()).toBe(bestLabel("bestTimeLabel", "27.00"));
    expect(targetInput().value).toBe("1:00.00");
  });

  it("[V4-1] 別の目標 (50m Fr / 長水路杯) で開き直すと、その目標のベスト (27.00) を出す (前の目標の 55.00 ではない)", async () => {
    const { rerender } = render(ui());
    await settle();
    await settle();
    expect(labelText()).toBe(bestLabel("bestTimeLabel", "55.00"));
    rerender(ui(goalFx(), false));
    await settle();
    const other = goalFx({ id: "g2", competition_id: "c2", competition: COMP_LONG, style_id: 1, style: S_50FR, target_time: 26 });
    rerender(ui(other, true));
    await settle();
    await settle();
    expect(labelText()).toBe(bestLabel("bestTimeLabel", "27.00"));
  });

  it("[SC5] 何も触らず更新: updateGoal('g1', { competitionId, styleId, targetTime }) だけを渡す (初期タイムを含まない)", async () => {
    const user = userEvent.setup();
    await open();
    await submit(user);
    expect(mocks.updateGoal).toHaveBeenCalledTimes(1);
    expect(mocks.updateGoal.mock.calls[0]).toEqual(["g1", { competitionId: "c1", styleId: 2, targetTime: 60 }]);
  });

  it("[V4-1] ベスト一覧の取得に失敗してもラベルを出さずに更新できる", async () => {
    mocks.getBestTimes.mockRejectedValue(new Error("SECRET_RAW_BT"));
    const user = userEvent.setup();
    await open();
    expect(label()).toBeNull();
    expect(document.body.textContent).not.toMatch(/SECRET_RAW_BT|—/);
    await submit(user);
    expect(mocks.updateGoal.mock.calls[0]).toEqual(["g1", { competitionId: "c1", styleId: 2, targetTime: 60 }]);
  });

  describe("[V4-2] 新規大会の終了日 (createCompetition / updateCompetition の end_date)", () => {
    it("終了日あり: createCompetition の入力に end_date が入り、updateGoal は作成した大会の id を使う。終了日なしは end_date=null", async () => {
      const user = userEvent.setup();
      await openNewCompetition(user);
      await setDate(startDate(), "2099-12-01");
      await setDate(endDate(), "2099-12-03");
      await submit(user);
      expect(mocks.createCompetition).toHaveBeenCalledTimes(1);
      expect(mocks.createCompetition.mock.calls[0]![0]).toMatchObject({ title: "新大会", date: "2099-12-01", end_date: "2099-12-03", pool_type: 0 });
      expect(mocks.updateGoal.mock.calls[0]![1].competitionId).toBe("newc");

      cleanup();
      mocks.createCompetition.mockClear();
      await openNewCompetition(user);
      await setDate(startDate(), "2099-12-01");
      await submit(user);
      expect(mocks.createCompetition.mock.calls[0]![0]).toMatchObject({ date: "2099-12-01", end_date: null });
    });

    it("終了日 < 開始日は alert(forms.competition.end_date_error) で、大会も目標も保存しない", async () => {
      const user = userEvent.setup();
      await openNewCompetition(user);
      await setDate(startDate(), "2099-12-03");
      await setDate(endDate(), "2099-12-01");
      await submit(user);
      expect(window.alert).toHaveBeenCalledWith("forms.competition.end_date_error");
      expect(mocks.createCompetition).not.toHaveBeenCalled();
      expect(mocks.updateGoal).not.toHaveBeenCalled();
    });

    it("updateGoal 失敗後に終了日だけ直して再送: createCompetition は1回のまま、updateCompetition(作成済み id, { end_date: 新しい値 })", async () => {
      mocks.updateGoal.mockRejectedValueOnce(new Error("rls"));
      const user = userEvent.setup();
      await openNewCompetition(user);
      await setDate(startDate(), "2099-12-01");
      await setDate(endDate(), "2099-12-02");
      await submit(user);
      expect(mocks.createCompetition).toHaveBeenCalledTimes(1);
      expect(mocks.updateCompetition).not.toHaveBeenCalled();
      await setDate(endDate(), "2099-12-05");
      await submit(user);
      expect(mocks.createCompetition).toHaveBeenCalledTimes(1);
      expect(mocks.updateCompetition).toHaveBeenCalledTimes(1);
      const [id, updates] = mocks.updateCompetition.mock.calls[0]!;
      expect(id).toBe("newc");
      expect(updates).toMatchObject({ end_date: "2099-12-05" });
      expect(mocks.updateGoal.mock.calls.at(-1)![1].competitionId).toBe("newc");
    });
  });
});
