/**
 * apps/web/__tests__/goals/goalFormStartTimeAutofill.test.tsx
 *
 * Sprint Contract (goal start time autofill) S1-S12: web の目標作成 (GoalCreateModal) / 編集 (GoalEditModal) の
 * 初期タイム自動入力。フック単体の挙動は apps/shared/__tests__/hooks/useGoalStartTimeAutofill.test.tsx が担保し、
 * ここは「モーダルへの配線」(markTouched / key={resetKey} / 保存拒否 / 開閉) を見る。
 * fixture には避けるべき行 (別水路・リレーのみ・time=0・別種目) を必ず含め、getBestTimes は呼び出し回数を assert する。
 *
 * 壊したら赤:
 *   - markTouched の配線を外す            -> 手入力が上書きされる (C-S4 / E-S4)
 *   - key={startTimeResetKey} を外す       -> 'abc' が残る (C-S10 / E-S10)
 *   - startTimeInvalid による保存拒否を外す -> 不正入力で createGoal / updateGoal が呼ばれる (C-S11 / E-S11)
 *   - isInitialized / resetSignal の配線    -> 編集で開いた直後に上書き / 別 goal で開き直すと上書き (E-S6 / E-S9)
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { GoalWithMilestones, Style, Competition } from "@apps/shared/types";

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return {
    ...original,
    useTranslations: (namespace?: string) => {
      const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
      t.raw = () => ["日", "月", "火", "水", "木", "金", "土"];
      return t as unknown as ReturnType<typeof original.useTranslations>;
    },
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
}));
vi.mock("@apps/shared/api/goals", () => ({
  GoalAPI: vi.fn().mockImplementation(() => ({
    createGoal: mocks.createGoal,
    updateGoal: mocks.updateGoal,
    getSelectableCompetitions: mocks.getSelectableCompetitions,
  })),
}));
vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: vi.fn().mockImplementation(() => ({
    getBestTimes: mocks.getBestTimes,
    createCompetition: mocks.createCompetition,
    updateCompetition: mocks.updateCompetition,
  })),
}));
vi.mock("@/components/ui/DatePicker", () => ({
  default: () => <div data-testid="date-pick" />,
}));

import GoalCreateModal from "../../app/[locale]/(authenticated)/goals/_components/GoalCreateModal";
import GoalEditModal from "../../app/[locale]/(authenticated)/goals/_components/GoalEditModal";

// id: 1-7 = 自由形 / 8-11 = 平泳ぎ (StyleChipSelector の styleIdToCodeKey 規約)
const S_50FR: Style = { id: 1, name_jp: "50m 自由形", name: "50m Fr", style: "Fr", distance: 50 };
const S_100FR: Style = { id: 2, name_jp: "100m 自由形", name: "100m Fr", style: "Fr", distance: 100 };
const S_100BR: Style = { id: 8, name_jp: "100m 平泳ぎ", name: "100m Br", style: "Br", distance: 100 };
const STYLES = [S_50FR, S_100FR, S_100BR];
const COMP_SHORT = { id: "c1", title: "短水路杯", date: "2099-11-01", pool_type: 0, team_id: null } as unknown as Competition;
const COMP_LONG = { id: "c2", title: "長水路杯", date: "2099-12-01", pool_type: 1, team_id: null } as unknown as Competition;

const bt = (o: Record<string, unknown>) => ({
  id: "b", created_at: "", is_relaying: false, style: { name_jp: "x", distance: 100 }, ...o,
});
// 100Fr(2): 短 55 / 長 58 (引き継ぎ 50 は採らない)   50Fr(1): 長 27 / 短はリレーのみ(20)   100Br(8): 短は time=0
const BESTS = [
  bt({ id: "s2-short", style_id: 2, pool_type: 0, time: 55 }),
  bt({ id: "s2-long", style_id: 2, pool_type: 1, time: 58, relayingTime: { id: "r", time: 50, created_at: "" } }),
  bt({ id: "s1-long", style_id: 1, pool_type: 1, time: 27 }),
  bt({ id: "s1-short-relay", style_id: 1, pool_type: 0, time: 20, is_relaying: true }),
  bt({ id: "s8-short-zero", style_id: 8, pool_type: 0, time: 0 }),
];

const goalFx = (o: Record<string, unknown> = {}) =>
  ({
    id: "g1", user_id: "u1", competition_id: "c1", style_id: 2, target_time: 60, start_time: 70, status: "active",
    achieved_at: null, reflection_note: null, created_at: "", updated_at: "",
    competition: COMP_SHORT, style: S_100FR, milestones: [], ...o,
  }) as unknown as GoalWithMilestones & { competition: Competition };

let qc: QueryClient;
let spies: Array<{ mockRestore: () => void }> = [];
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });
const startInput = () => screen.getByTestId("goal-start-time") as HTMLInputElement;
const startVal = () => startInput().value;
const compSelect = () => screen.getAllByRole("combobox")[0]!;
const errorTexts = () => screen.queryAllByText("goals.paramsForm.timeInvalid");

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
async function retype(user: User, text: string) {
  await user.clear(startInput());
  await user.type(startInput(), text);
}
/** 取得を保留し、resolve 時に渡す配列を後から決める */
function deferredBests() {
  const pending: Array<(v: unknown[]) => void> = [];
  mocks.getBestTimes.mockImplementation(() => new Promise((res) => pending.push(res as (v: unknown[]) => void)));
  return async (v: unknown[] = BESTS) => {
    await act(async () => { pending.forEach((f) => f(v)); await new Promise((r) => setTimeout(r, 60)); });
  };
}

beforeEach(() => {
  mocks.createGoal.mockReset().mockResolvedValue({ id: "new" });
  mocks.updateGoal.mockReset().mockResolvedValue({});
  mocks.getSelectableCompetitions.mockReset().mockResolvedValue([COMP_SHORT, COMP_LONG]);
  mocks.getBestTimes.mockReset().mockResolvedValue(BESTS);
  mocks.createCompetition.mockReset().mockResolvedValue({ id: "newc" });
  mocks.updateCompetition.mockReset().mockResolvedValue({ id: "newc" });
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  spies = [vi.spyOn(window, "alert").mockImplementation(() => {}), vi.spyOn(console, "error").mockImplementation(() => {})];
});
afterEach(() => { cleanup(); spies.forEach((s) => s.mockRestore()); });

// ============================== 作成 ==============================
describe("GoalCreateModal: 初期タイムの自動入力", () => {
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
  const typeTarget = async (user: User) => {
    await user.type(screen.getByPlaceholderText("goals.form.targetTimePlaceholder"), "1:00.00");
  };

  it("[C-S1/S12] 長水路杯 + 100m Fr を選ぶと 58.00 が入り、保存される startTime=58 は表示と一致 (短水路 55・引き継ぎ 50 は選ばない)", async () => {
    const user = userEvent.setup();
    await open();
    await pickCompetition(user, "c2");
    await pickStyle(user, 100, "Fr");
    expect(startVal()).toBe("58.00");
    expect(mocks.getBestTimes).toHaveBeenCalledTimes(1);
    expect(mocks.getBestTimes).toHaveBeenCalledWith();
    await typeTarget(user);
    await submit(user);
    expect(mocks.createGoal).toHaveBeenCalledTimes(1);
    expect(mocks.createGoal.mock.calls[0]![0]).toMatchObject({ competitionId: "c2", styleId: 2, startTime: 58, poolType: 1 });
  });

  it("[C-S1/S3] 短水路杯 (pool_type=0) は falsy として取りこぼさず 55.00", async () => {
    const user = userEvent.setup();
    await open();
    await pickCompetition(user, "c1");
    await pickStyle(user, 100, "Fr");
    expect(startVal()).toBe("55.00");
  });

  it("[C-S1] 新規大会 (既定は短水路) でも入り、水路を長水路へ切り替えると入れ直す (55 -> 58 -> 55)", async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getByLabelText("goals.form.newCompetitionRadio"));
    await pickStyle(user, 100, "Fr");
    expect(startVal()).toBe("55.00");
    const poolSelect = screen.getAllByRole("combobox")[0]!;
    await user.selectOptions(poolSelect, "1");
    await settle();
    expect(startVal()).toBe("58.00");
    await user.selectOptions(poolSelect, "0");
    await settle();
    expect(startVal()).toBe("55.00");
  });

  it("[C-S2] 「ベストタイムから取得」ボタンが無く、初期タイム欄は disabled にならない (自動入力後も)", async () => {
    const user = userEvent.setup();
    await open();
    expect(screen.queryByText("goals.form.getBestTimeButton")).toBeNull();
    expect(startInput().disabled).toBe(false);
    await pickCompetition(user, "c2");
    await pickStyle(user, 100, "Fr");
    expect(startVal()).toBe("58.00");
    expect(screen.queryByText("goals.form.getBestTimeButton")).toBeNull();
    expect(startInput().disabled).toBe(false);
    await retype(user, "1:10.00");
    expect(startVal()).toBe("1:10.00");
  });

  it("[C-S3] リレー引き継ぎだけの種目 (50m Fr 短水路) は空。time=0 の種目 (100m Br 短水路) も空 (0 も 20 も入らない)", async () => {
    const user = userEvent.setup();
    await open();
    await pickCompetition(user, "c1");
    await pickStyle(user, 50, "Fr");
    expect(startVal()).toBe("");
    await pickStyle(user, 100, "Br");
    expect(startVal()).toBe("");
    expect(mocks.getBestTimes).toHaveBeenCalledTimes(1);
  });

  it("[C-S5] 大会未選択では入らない (短水路に倒さない)。大会を選ぶと入る", async () => {
    const user = userEvent.setup();
    await open();
    await pickStyle(user, 100, "Fr");
    expect(startVal()).toBe("");
    await pickCompetition(user, "c2");
    expect(startVal()).toBe("58.00");
  });

  it("[C-S4] 同じ種目 × 水路のあいだは手入力を上書きしない。種目を変えると入れ直し、手入力した種目に戻ってきても入れ直す", async () => {
    const user = userEvent.setup();
    await open();
    await pickCompetition(user, "c2");
    await pickStyle(user, 100, "Fr");
    expect(startVal()).toBe("58.00");
    await retype(user, "1:10.00");
    await settle();
    expect(startVal()).toBe("1:10.00");
    await pickCompetition(user, "c2"); // 同じ水路の大会を選び直しても上書きしない
    expect(startVal()).toBe("1:10.00");
    await pickStyle(user, 50, "Fr");
    expect(startVal()).toBe("27.00");
    await pickStyle(user, 100, "Fr");
    expect(startVal()).toBe("58.00");
  });

  it("[C-S4] 大会 (水路) を変えると手入力済みでも入れ直す (長水路杯 -> 短水路杯)", async () => {
    const user = userEvent.setup();
    await open();
    await pickCompetition(user, "c2");
    await pickStyle(user, 100, "Fr");
    await retype(user, "1:10.00");
    await pickCompetition(user, "c1");
    expect(startVal()).toBe("55.00");
  });

  it("[C-S4] ベスト無しは空にする。アラート・エラー表示は出ない", async () => {
    const user = userEvent.setup();
    await open();
    await pickCompetition(user, "c1");
    await retype(user, "1:10.00");
    await pickStyle(user, 50, "Fr"); // 短水路はリレーのみ
    expect(startVal()).toBe("");
    expect(window.alert).not.toHaveBeenCalled();
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    expect(errorTexts()).toHaveLength(0);
  });

  it("[C-S7] 取得失敗: 手入力した値を変えない。アラート・エラー表示・生エラーは出ない。placeholder は通常に戻る", async () => {
    mocks.getBestTimes.mockRejectedValue(new Error("SECRET_RAW_BT"));
    const user = userEvent.setup();
    await open();
    await pickCompetition(user, "c2");
    await retype(user, "1:10.00");
    await pickStyle(user, 100, "Fr");
    expect(startVal()).toBe("1:10.00");
    expect(window.alert).not.toHaveBeenCalled();
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    expect(errorTexts()).toHaveLength(0);
    expect(document.body.textContent).not.toContain("SECRET_RAW_BT");
    expect(startInput().placeholder).toBe("goals.form.startTimePlaceholder");
  });

  it("[C-S8] 取得中に種目を 100Fr -> 50Fr -> 100Fr -> 50Fr と変えても、データ到着後は最後の種目 (50Fr 長水路 27) が入る。取得は1回", async () => {
    const resolve = deferredBests();
    const user = userEvent.setup();
    await open();
    await pickCompetition(user, "c2");
    await pickStyle(user, 100, "Fr");
    await pickStyle(user, 50, "Fr");
    await pickStyle(user, 100, "Fr");
    await pickStyle(user, 50, "Fr");
    expect(startVal()).toBe("");
    await resolve();
    expect(startVal()).toBe("27.00");
    expect(mocks.getBestTimes).toHaveBeenCalledTimes(1);
  });

  it("[C-S8] 取得中の初期タイム欄の placeholder は common.loading。完了で通常に戻る", async () => {
    const resolve = deferredBests();
    const user = userEvent.setup();
    await open();
    await pickCompetition(user, "c2");
    await pickStyle(user, 100, "Fr");
    expect(startInput().placeholder).toBe("common.loading");
    await resolve();
    expect(startInput().placeholder).toBe("goals.form.startTimePlaceholder");
  });

  it("[C-S4] 取得中に手入力すると、取得完了しても上書きしない", async () => {
    const resolve = deferredBests();
    const user = userEvent.setup();
    await open();
    await pickCompetition(user, "c2");
    await pickStyle(user, 100, "Fr");
    await user.type(startInput(), "1:10.00");
    await resolve();
    expect(startVal()).toBe("1:10.00");
  });

  describe("[C-S9] 開閉", () => {
    it("開いていない間 (/goals を開いただけ) は getBestTimes を呼ばない", async () => {
      render(ui(false));
      await settle();
      expect(mocks.getBestTimes).not.toHaveBeenCalled();
      expect(screen.queryByTestId("goal-start-time")).toBeNull();
    });

    it("× ボタンで閉じて開き直すと、前回の種目・値は空に戻り、新しく取得したデータ (57) を使う。取得は開くたびに1回", async () => {
      const user = userEvent.setup();
      const { rerender } = render(ui());
      await settle();
      await pickCompetition(user, "c2");
      await pickStyle(user, 100, "Fr");
      expect(startVal()).toBe("58.00");
      await user.click(screen.getByRole("button", { name: "goals.create.closeAriaLabel" }));
      rerender(ui(false));
      await settle();
      mocks.getBestTimes.mockResolvedValue([bt({ id: "n", style_id: 2, pool_type: 1, time: 57 })]);
      rerender(ui(true));
      await settle();
      expect(startVal()).toBe("");
      await pickCompetition(user, "c2");
      await pickStyle(user, 100, "Fr");
      expect(startVal()).toBe("57.00");
      expect(mocks.getBestTimes).toHaveBeenCalledTimes(2);
    });

    it("prop だけで閉じて開き直す (フォーム状態が残る場合): 前回の自動入力済みキー・手入力の記録を持ち越さず、新データ (57) で入れ直す", async () => {
      const user = userEvent.setup();
      const { rerender } = render(ui());
      await settle();
      await pickCompetition(user, "c2");
      await pickStyle(user, 100, "Fr");
      await retype(user, "1:10.00"); // 手入力 (touched)
      rerender(ui(false));
      await settle();
      mocks.getBestTimes.mockResolvedValue([bt({ id: "n", style_id: 2, pool_type: 1, time: 57 })]);
      rerender(ui(true));
      await settle();
      expect(mocks.getBestTimes).toHaveBeenCalledTimes(2);
      expect(startVal()).toBe("57.00");
    });
  });

  it("[C-S10] 'abc' が残っていても (ベストが無い -> 空の null→null)、自動入力で欄が作り直され 'abc' が消える", async () => {
    const user = userEvent.setup();
    await open();
    await pickCompetition(user, "c1");
    await pickStyle(user, 100, "Br"); // 短水路は time=0 -> 空
    await user.type(startInput(), "abc");
    expect(startVal()).toBe("abc");
    // 長水路杯へ (100m Br の長水路ベストは無い): 中間の非 null 状態を挟まず null -> null で入れ直す
    await pickCompetition(user, "c2");
    expect(startVal()).toBe("");
  });

  it("[C-S11] 'abc' が残る間は保存できず (createGoal 未呼び出し・alert)、欄にエラー表示。直せば保存でき startTime は表示と一致", async () => {
    const user = userEvent.setup();
    await open();
    await pickCompetition(user, "c1");
    await pickStyle(user, 100, "Fr");
    await typeTarget(user);
    await retype(user, "abc");
    await submit(user);
    expect(mocks.createGoal).not.toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledWith("goals.create.startTimeInvalid");
    expect(errorTexts().length).toBeGreaterThan(0);
    await retype(user, "1:10.00");
    expect(errorTexts()).toHaveLength(0);
    await submit(user);
    expect(mocks.createGoal).toHaveBeenCalledTimes(1);
    expect(mocks.createGoal.mock.calls[0]![0].startTime).toBe(70);
  });

  it("[C-S11/S12] 空欄にして保存すると startTime=null (不正入力フラグが残らない)", async () => {
    const user = userEvent.setup();
    await open();
    await pickCompetition(user, "c1");
    await pickStyle(user, 100, "Fr");
    await typeTarget(user);
    await retype(user, "abc");
    await user.clear(startInput());
    await submit(user);
    expect(mocks.createGoal).toHaveBeenCalledTimes(1);
    expect(mocks.createGoal.mock.calls[0]![0].startTime).toBeNull();
  });

  it("[C-S11] 不正入力のあと種目を変えて自動入力されれば、そのまま保存できる (復旧不能にならない)", async () => {
    const user = userEvent.setup();
    await open();
    await pickCompetition(user, "c1");
    await pickStyle(user, 100, "Fr");
    await typeTarget(user);
    await retype(user, "abc");
    await submit(user);
    expect(mocks.createGoal).not.toHaveBeenCalled();
    await pickStyle(user, 100, "Br"); // 空
    await pickStyle(user, 100, "Fr"); // 55
    expect(startVal()).toBe("55.00");
    await submit(user);
    expect(mocks.createGoal).toHaveBeenCalledTimes(1);
    expect(mocks.createGoal.mock.calls[0]![0].startTime).toBe(55);
  });
});

// ============================== 編集 ==============================
describe("GoalEditModal: 初期タイムの自動入力", () => {
  const ui = (goal = goalFx(), isOpen = true) => (
    <QueryClientProvider client={qc}>
      <GoalEditModal isOpen={isOpen} onClose={() => {}} onSuccess={async () => {}} goal={goal} styles={STYLES} />
    </QueryClientProvider>
  );
  const open = async (goal = goalFx()) => {
    const r = render(ui(goal));
    await settle();
    return r;
  };
  const submit = (user: User) => user.click(screen.getByRole("button", { name: "goals.edit.submitButton" }));

  it("[E-S6] 開いた直後 (ベスト取得の完了後も) 保存済みの 1:10.00 のまま。何も触らず更新すると startTime=70", async () => {
    const user = userEvent.setup();
    await open();
    await settle();
    expect(mocks.getBestTimes).toHaveBeenCalledTimes(1);
    expect(startVal()).toBe("1:10.00");
    await submit(user);
    expect(mocks.updateGoal).toHaveBeenCalledTimes(1);
    expect(mocks.updateGoal.mock.calls[0]![1]).toMatchObject({ competitionId: "c1", styleId: 2, startTime: 70 });
  });

  it("[E-S6] 取得が遅くても (データ未着のまま描画 -> 到着) 保存済みの値は残り、更新で startTime=70", async () => {
    const resolve = deferredBests();
    const user = userEvent.setup();
    await open();
    expect(startVal()).toBe("1:10.00");
    await resolve();
    expect(startVal()).toBe("1:10.00");
    await submit(user);
    expect(mocks.updateGoal.mock.calls[0]![1].startTime).toBe(70);
  });

  it("[E-S1/S3/S12] 種目を変えたときだけ入る (50m Fr 短水路はリレーのみ -> 空)。100m Fr に戻すと 55.00 で、保存される startTime=55 は表示と一致", async () => {
    const user = userEvent.setup();
    await open();
    await pickStyle(user, 50, "Fr");
    expect(startVal()).toBe("");
    await pickStyle(user, 100, "Fr");
    expect(startVal()).toBe("55.00");
    await submit(user);
    expect(mocks.updateGoal.mock.calls[0]![1]).toMatchObject({ styleId: 2, startTime: 55 });
  });

  it("[E-S1/S3] 100m Br (短水路は time=0) へ変えると空になる (0 は入らない)", async () => {
    const user = userEvent.setup();
    await open();
    await pickStyle(user, 100, "Br");
    expect(startVal()).toBe("");
  });

  it("[E-S1/S12] 大会を長水路杯に変えたときだけ入れ直す (58.00)。updateGoal.startTime=58", async () => {
    const user = userEvent.setup();
    await open();
    await pickCompetition(user, "c2");
    expect(startVal()).toBe("58.00");
    await submit(user);
    expect(mocks.updateGoal.mock.calls[0]![1]).toMatchObject({ competitionId: "c2", startTime: 58 });
  });

  it("[E-S2] ボタンが無く、欄は disabled でない (自動入力後も)", async () => {
    const user = userEvent.setup();
    await open();
    expect(screen.queryByText("goals.form.getBestTimeButton")).toBeNull();
    expect(startInput().disabled).toBe(false);
    await pickCompetition(user, "c2");
    expect(startInput().disabled).toBe(false);
  });

  it("[E-S4] 手入力は同じ種目 × 水路のあいだ上書きされず、種目を変えると入れ直す", async () => {
    const user = userEvent.setup();
    await open();
    await retype(user, "1:05.00");
    await pickCompetition(user, "c1"); // 同じ大会の選び直し
    expect(startVal()).toBe("1:05.00");
    await pickStyle(user, 50, "Fr");
    expect(startVal()).toBe("");
    await pickStyle(user, 100, "Fr");
    expect(startVal()).toBe("55.00");
  });

  it("[E-S4] 取得中に種目を変えて手入力すると、取得完了しても上書きしない (markTouched の配線)", async () => {
    const resolve = deferredBests();
    const user = userEvent.setup();
    await open();
    await pickStyle(user, 50, "Fr");
    await retype(user, "1:10.00");
    await resolve();
    expect(startVal()).toBe("1:10.00");
  });

  it("[E-S7] 取得失敗: 値を変えず (1:10.00)、アラート・エラー表示は出ない", async () => {
    mocks.getBestTimes.mockRejectedValue(new Error("SECRET_RAW_BT"));
    const user = userEvent.setup();
    await open();
    await pickStyle(user, 50, "Fr");
    expect(startVal()).toBe("1:10.00");
    expect(window.alert).not.toHaveBeenCalled();
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    expect(document.body.textContent).not.toContain("SECRET_RAW_BT");
  });

  it("[E-S8] 取得中に種目を 50 -> 100 -> 50 と変えても最後 (50m Fr 長水路 27) のベストが入る。取得は1回", async () => {
    const resolve = deferredBests();
    const user = userEvent.setup();
    await open();
    await pickCompetition(user, "c2");
    await pickStyle(user, 50, "Fr");
    await pickStyle(user, 100, "Fr");
    await pickStyle(user, 50, "Fr");
    await resolve();
    expect(startVal()).toBe("27.00");
    expect(mocks.getBestTimes).toHaveBeenCalledTimes(1);
  });

  describe("[E-S9] 開き直し", () => {
    it("別の目標 (50m Fr / 長水路杯 / 保存済み 1:39.00) で開き直しても上書きしない。取得は開くたびに1回", async () => {
      const { rerender } = render(ui());
      await settle();
      rerender(ui(goalFx(), false));
      await settle();
      const other = goalFx({ id: "g2", competition_id: "c2", competition: COMP_LONG, style_id: 1, style: S_50FR, start_time: 99 });
      rerender(ui(other, true));
      await settle();
      await settle();
      expect(startVal()).toBe("1:39.00");
      expect(mocks.getBestTimes).toHaveBeenCalledTimes(2);
    });

    it("変更して × で閉じ、同じ目標を開き直すと保存済みの値 (1:10.00) に戻り、上書きしない", async () => {
      const user = userEvent.setup();
      const goal = goalFx();
      const { rerender } = render(ui(goal));
      await settle();
      await pickStyle(user, 50, "Fr");
      expect(startVal()).toBe("");
      await user.click(screen.getByRole("button", { name: "goals.edit.closeAriaLabel" }));
      rerender(ui(goal, false));
      await settle();
      rerender(ui(goal, true));
      await settle();
      await settle();
      expect(startVal()).toBe("1:10.00");
    });

    it("開き直したら、以前のデータ (58) ではなく新しく取得したデータ (57) を使う", async () => {
      const user = userEvent.setup();
      mocks.getBestTimes.mockResolvedValue([bt({ id: "o", style_id: 2, pool_type: 1, time: 58 })]);
      const goal = goalFx();
      const { rerender } = render(ui(goal));
      await settle();
      rerender(ui(goal, false));
      await settle();
      mocks.getBestTimes.mockResolvedValue([bt({ id: "n", style_id: 2, pool_type: 1, time: 57 })]);
      rerender(ui(goal, true));
      await settle();
      expect(startVal()).toBe("1:10.00");
      await pickCompetition(user, "c2");
      expect(startVal()).toBe("57.00");
      expect(mocks.getBestTimes).toHaveBeenCalledTimes(2);
    });
  });

  it("[E-S10] 'abc' が残っていても (空 -> 空)、自動入力で欄が作り直される", async () => {
    const user = userEvent.setup();
    await open();
    await pickStyle(user, 100, "Br"); // 短水路は time=0 -> 空 (距離が同じなので泳法チップ1回で切り替わる)
    await user.type(startInput(), "abc");
    expect(startVal()).toBe("abc");
    await pickCompetition(user, "c2"); // 100m Br の長水路ベストは無い: null -> null
    expect(startVal()).toBe("");
  });

  it("[E-S11] 'abc' が残る間は更新できず (updateGoal 未呼び出し・role=alert の startTimeInvalid・欄のエラー)。直せば更新できる", async () => {
    const user = userEvent.setup();
    await open();
    await retype(user, "abc");
    await submit(user);
    expect(mocks.updateGoal).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("goals.edit.validation.startTimeInvalid");
    expect(errorTexts().length).toBeGreaterThan(0);
    await retype(user, "1:20.00");
    expect(errorTexts()).toHaveLength(0);
    await submit(user);
    expect(mocks.updateGoal).toHaveBeenCalledTimes(1);
    expect(mocks.updateGoal.mock.calls[0]![1].startTime).toBe(80);
  });

  it("[E-S11 / Reviewer W2] 'abc' 入力中に親の goal 参照だけが変わる再レンダー (初期値 null の目標) でも、表示に 'abc' が残ったまま startTime=null で保存されない", async () => {
    const user = userEvent.setup();
    const goal = goalFx({ start_time: null });
    const { rerender } = render(ui(goal));
    await settle();
    await user.type(startInput(), "abc");
    expect(startVal()).toBe("abc");
    rerender(ui({ ...goal })); // 内容は同じで参照だけ新しい (親の再取得を想定)
    await settle();
    const displayed = startVal();
    await submit(user);
    const saved = mocks.updateGoal.mock.calls.length > 0;
    // 「abc が見えているのに黙って start_time=null で保存された」状態だけを禁じる
    expect(displayed === "abc" && saved, `表示='${displayed}' 保存=${saved}`).toBe(false);
    if (saved) expect(mocks.updateGoal.mock.calls[0]![1].startTime).toBeNull();
  });

  it("[E-S11/S12] 空欄にして更新すると startTime=null", async () => {
    const user = userEvent.setup();
    await open();
    await retype(user, "abc");
    await user.clear(startInput());
    await submit(user);
    expect(mocks.updateGoal.mock.calls[0]![1].startTime).toBeNull();
  });
});
