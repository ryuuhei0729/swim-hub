/**
 * apps/web/__tests__/goals/webV4Fixes.test.tsx
 *
 * Contract v4 (mobile レビュー由来の web 側修正) の回帰ガード:
 *   M1 マイルストーン保存前検証 (0/空 params を保存しない: 作成・編集の両モーダル)
 *   M3 新規大会の日付は今日以降 (DatePicker.minDate + 過去日は保存拒否、今日は可)
 *   M4 編集で新規大会 -> updateGoal 失敗後の再送信で createCompetition を二重に呼ばない
 * 壊したら赤:
 *   - isMilestoneParamsSavable を通さない / 外す          -> M1 ケース赤
 *   - createdCompetitionIdRef を外す                      -> M4 ケース赤 (createCompetition が2回)
 *   - minDate を渡さない / 過去日判定を外す                -> M3 ケース赤
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { format } from "date-fns";
import type { GoalWithMilestones, Milestone, Style, Competition } from "@apps/shared/types";

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
vi.mock("@/contexts", () => ({ useAuth: () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }) }, user: { id: "u1" }, subscription: null }) }));
vi.mock("@apps/shared/hooks/queries/teams", () => ({ useTeamsQuery: () => ({ teams: [] }) }));
vi.mock("@apps/shared/hooks/queries/user", () => ({ useUserProfileQuery: () => ({ data: null, isLoading: false }) }));

const mocks = vi.hoisted(() => ({
  createMilestone: vi.fn(),
  updateMilestone: vi.fn(),
  updateGoal: vi.fn(),
  getSelectableCompetitions: vi.fn(),
  createCompetition: vi.fn(),
  updateCompetition: vi.fn(),
  datePickerProps: [] as Array<{ minDate?: Date }>,
  pickDate: "2000-01-01",
}));
vi.mock("@apps/shared/api/goals", () => ({
  GoalAPI: vi.fn().mockImplementation(() => ({
    createMilestone: mocks.createMilestone,
    updateMilestone: mocks.updateMilestone,
    updateGoal: mocks.updateGoal,
    getSelectableCompetitions: mocks.getSelectableCompetitions,
  })),
}));
vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: vi.fn().mockImplementation(() => ({ createCompetition: mocks.createCompetition, updateCompetition: mocks.updateCompetition, getBestTimes: vi.fn().mockResolvedValue([]) })),
}));
vi.mock("@swim-hub/shared/api", () => ({
  PracticeLogTemplateAPI: vi.fn().mockImplementation(() => ({ createTemplate: vi.fn().mockResolvedValue({}) })),
}));
vi.mock("@/components/ui/DatePicker", () => ({
  default: ({ onChange, minDate }: { onChange: (d: string) => void; minDate?: Date }) => {
    mocks.datePickerProps.push({ minDate });
    return <button type="button" data-testid="date-pick" onClick={() => onChange(mocks.pickDate)}>pick</button>;
  },
}));

import MilestoneCreateModal from "../../app/[locale]/(authenticated)/goals/_components/MilestoneCreateModal";
import MilestoneEditModal from "../../app/[locale]/(authenticated)/goals/_components/MilestoneEditModal";
import GoalEditModal from "../../app/[locale]/(authenticated)/goals/_components/GoalEditModal";

const style: Style = { id: 1, name_jp: "100m 自由形", name: "100m Fr", style: "Fr", distance: 100 };
const competition: Competition = { id: "c1", title: "県大会", date: "2099-12-01", pool_type: 0, team_id: null } as unknown as Competition;
const goal = {
  id: "g1", user_id: "u1", competition_id: "c1", style_id: 1, target_time: 60, start_time: 70, status: "active",
  achieved_at: null, reflection_note: null, created_at: "", updated_at: "", competition, style, milestones: [],
} as unknown as GoalWithMilestones & { competition: Competition };
const repsMilestone = {
  id: "m1", goal_id: "g1", title: "t", type: "reps_time",
  params: { distance: 50, reps: 6, sets: 3, target_average_time: 35, style: "Fr", swim_category: "Swim", circle: 90 },
  deadline: null, status: "in_progress", achieved_at: null, reflection_done: false, reflection_note: null, created_at: "", updated_at: "",
} as unknown as Milestone;

// フォームを直接 submit する。reps_time の既定 circle(秒)=45 は input step=10 の倍数でなく、実ブラウザ/jsdom では
// ネイティブ検証 (step mismatch) が submit ボタンのクリックを先にブロックする (既存の web 挙動)。本ファイルが検証するのは
// その後段の JS 検証 (isMilestoneParamsSavable) なので、ネイティブ検証を通さず submit イベントを発火する。
// 注意: これは「ネイティブ検証を通った後の JS 検証 (isMilestoneParamsSavable) だけ」を見るための submit。
// 実ブラウザで送信できるかは別テスト ([ネイティブ検証] 参照: 実 submit ボタンを user.click) が担保する。
const submitSkippingNativeValidation = async (_user?: ReturnType<typeof userEvent.setup>) => {
  await act(async () => { fireEvent.submit(document.querySelector("form")!); });
};

const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={qc()}>{ui}</QueryClientProvider>);

beforeEach(() => {
  mocks.createMilestone.mockReset().mockResolvedValue({});
  mocks.updateMilestone.mockReset().mockResolvedValue({});
  mocks.updateGoal.mockReset().mockResolvedValue({});
  mocks.createCompetition.mockReset().mockResolvedValue({ id: "newc" });
  mocks.updateCompetition.mockReset().mockResolvedValue({ id: "newc" });
  mocks.getSelectableCompetitions.mockReset().mockResolvedValue([competition]);
  mocks.datePickerProps.length = 0;
  mocks.pickDate = "2000-01-01";
  spies = [vi.spyOn(window, "alert").mockImplementation(() => {}), vi.spyOn(console, "error").mockImplementation(() => {})];
});
// vi.restoreAllMocks() はグローバルの ResizeObserver 等の setup モックまで巻き戻して後続テストを壊すため、自分の spy だけ戻す
let spies: Array<{ mockRestore: () => void }> = [];
afterEach(() => { cleanup(); spies.forEach((s) => s.mockRestore()); });

describe("M1 (web) マイルストーン保存前検証", () => {
  it("作成 reps_time: 本数を空にして作成 -> createMilestone 呼ばれず paramsInvalid の alert 表示。再入力で解除", async () => {
    const user = userEvent.setup();
    wrap(<MilestoneCreateModal isOpen onClose={() => {}} onSuccess={async () => {}} goalId="g1" goal={goal} styles={[style]} goalCompetitionDate="" />);
    await user.click(screen.getByLabelText("goals.milestoneForm.type.repsTime.label"));
    const reps = screen.getByLabelText("goals.paramsForm.repsLabel");
    await user.clear(reps);
    await submitSkippingNativeValidation(user);
    expect(mocks.createMilestone).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("goals.paramsForm.paramsInvalid");
    await user.type(reps, "4");
    expect(screen.queryByText("goals.paramsForm.paramsInvalid")).toBeNull();
  });

  it("作成 set: サークル 0 秒/0 分で作成 -> 保存されない", async () => {
    const user = userEvent.setup();
    wrap(<MilestoneCreateModal isOpen onClose={() => {}} onSuccess={async () => {}} goalId="g1" goal={goal} styles={[style]} goalCompetitionDate="" />);
    await user.click(screen.getByLabelText("goals.milestoneForm.type.set.label"));
    await user.clear(screen.getByLabelText("goals.paramsForm.circleMinLabel"));
    await user.clear(screen.getByLabelText("goals.paramsForm.circleSecLabel"));
    await submitSkippingNativeValidation(user);
    expect(mocks.createMilestone).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("goals.paramsForm.paramsInvalid");
  });

  it("[JS検証のみ・ネイティブ検証は迂回] 有効な既定値の reps_time は JS 検証を通る", async () => {
    const user = userEvent.setup();
    wrap(<MilestoneCreateModal isOpen onClose={() => {}} onSuccess={async () => {}} goalId="g1" goal={goal} styles={[style]} goalCompetitionDate="" />);
    await user.click(screen.getByLabelText("goals.milestoneForm.type.repsTime.label"));
    await submitSkippingNativeValidation(user);
    expect(mocks.createMilestone).toHaveBeenCalledTimes(1);
  });

  async function showParamsInvalid(user: ReturnType<typeof userEvent.setup>) {
    const view = wrap(<MilestoneCreateModal isOpen onClose={() => {}} onSuccess={async () => {}} goalId="g1" goal={goal} styles={[style]} goalCompetitionDate="" />);
    await user.click(screen.getByLabelText("goals.milestoneForm.type.repsTime.label"));
    await user.clear(screen.getByLabelText("goals.paramsForm.repsLabel"));
    await submitSkippingNativeValidation(user);
    expect(screen.getByRole("alert").textContent).toBe("goals.paramsForm.paramsInvalid");
    return view;
  }

  it("[v5 L-a] paramsInvalid は type 切替で消える", async () => {
    const user = userEvent.setup();
    await showParamsInvalid(user);
    await user.click(screen.getByLabelText("goals.milestoneForm.type.set.label"));
    expect(screen.queryByText("goals.paramsForm.paramsInvalid")).toBeNull();
  });

  it("[v5 L-a] paramsInvalid はテンプレート選択で消える", async () => {
    const user = userEvent.setup();
    await showParamsInvalid(user);
    await user.selectOptions(document.querySelector("select") as unknown as HTMLElement, "time_trial");
    expect(screen.queryByText("goals.paramsForm.paramsInvalid")).toBeNull();
  });

  it("[v5 L-a] paramsInvalid は閉じて (キャンセル) 開き直すと消える", async () => {
    const user = userEvent.setup();
    function Host() {
      const [open, setOpen] = React.useState(true);
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>reopen</button>
          <MilestoneCreateModal isOpen={open} onClose={() => setOpen(false)} onSuccess={async () => {}} goalId="g1" goal={goal} styles={[style]} goalCompetitionDate="" />
        </div>
      );
    }
    wrap(<Host />);
    await user.click(screen.getByLabelText("goals.milestoneForm.type.repsTime.label"));
    await user.clear(screen.getByLabelText("goals.paramsForm.repsLabel"));
    await submitSkippingNativeValidation(user);
    expect(screen.getByRole("alert").textContent).toBe("goals.paramsForm.paramsInvalid");
    await user.click(screen.getByRole("button", { name: "goals.milestoneCreate.cancelButton" }));
    await user.click(screen.getByText("reopen"));
    expect(screen.queryByText("goals.paramsForm.paramsInvalid")).toBeNull();
  });

  it("[v5 L-c] reps_time は circle=0 でも作成できる (達成判定は circle を使わない)", async () => {
    const user = userEvent.setup();
    wrap(<MilestoneCreateModal isOpen onClose={() => {}} onSuccess={async () => {}} goalId="g1" goal={goal} styles={[style]} goalCompetitionDate="" />);
    await user.click(screen.getByLabelText("goals.milestoneForm.type.repsTime.label"));
    await user.clear(screen.getByLabelText("goals.paramsForm.circleMinLabel"));
    await user.clear(screen.getByLabelText("goals.paramsForm.circleSecLabel"));
    await submitSkippingNativeValidation(user);
    expect(mocks.createMilestone).toHaveBeenCalledTimes(1);
  });

  it("[ネイティブ検証] reps_time の既定値のまま、実際の submit ボタンを click して createMilestone が呼ばれる (step mismatch で送信がブロックされない)", async () => {
    const user = userEvent.setup();
    wrap(<MilestoneCreateModal isOpen onClose={() => {}} onSuccess={async () => {}} goalId="g1" goal={goal} styles={[style]} goalCompetitionDate="" />);
    await user.click(screen.getByLabelText("goals.milestoneForm.type.repsTime.label"));
    const form = document.querySelector("form")!;
    const invalid = Array.from(form.elements).filter((e) => !(e as HTMLInputElement).validity?.valid);
    // 事実の捕捉: 既定値のままで検証エラーの input があってはならない (circle 秒 45 は step=10 の倍数でない)
    expect(invalid.map((e) => (e as HTMLElement).getAttribute("aria-label"))).toEqual([]);
    await user.click(screen.getByRole("button", { name: "goals.milestoneCreate.submitButton" }));
    expect(mocks.createMilestone).toHaveBeenCalledTimes(1);
  });

  it("編集 reps_time: 本数を空にして更新 -> updateMilestone 呼ばれず paramsInvalid", async () => {
    const user = userEvent.setup();
    wrap(<MilestoneEditModal isOpen onClose={() => {}} onSuccess={async () => {}} milestone={repsMilestone} styles={[style]} goalCompetitionDate="" />);
    const reps = await screen.findByLabelText("goals.paramsForm.repsLabel");
    await user.clear(reps);
    await submitSkippingNativeValidation(user);
    expect(mocks.updateMilestone).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("goals.paramsForm.paramsInvalid");
  });

  it("編集: 有効な値ならそのまま更新できる (非退行)", async () => {
    const user = userEvent.setup();
    wrap(<MilestoneEditModal isOpen onClose={() => {}} onSuccess={async () => {}} milestone={repsMilestone} styles={[style]} goalCompetitionDate="" />);
    await screen.findByLabelText("goals.paramsForm.repsLabel");
    await submitSkippingNativeValidation(user);
    expect(mocks.updateMilestone).toHaveBeenCalledTimes(1);
  });
});

describe("M3 / M4 (web) GoalEditModal の新規大会", () => {
  async function openNewCompetition(user: ReturnType<typeof userEvent.setup>) {
    wrap(<GoalEditModal isOpen onClose={() => {}} onSuccess={async () => {}} goal={goal} styles={[style]} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    await user.click(screen.getByLabelText("goals.form.newCompetitionRadio"));
    await user.type(screen.getByPlaceholderText("goals.form.competitionNamePlaceholder"), "新大会");
  }
  const submit = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "goals.edit.submitButton" }));
  const today = () => format(new Date(), "yyyy-MM-dd");

  it("[M3] 新規大会の DatePicker に minDate=今日 (時刻 0:00) が渡る", async () => {
    const user = userEvent.setup();
    await openNewCompetition(user);
    const last = mocks.datePickerProps[mocks.datePickerProps.length - 1]!;
    expect(last.minDate).toBeInstanceOf(Date);
    expect(format(last.minDate!, "yyyy-MM-dd")).toBe(today());
    expect(last.minDate!.getHours()).toBe(0);
  });

  it("[M3] 過去日は拒否 (alert competitionDatePast、createCompetition/updateGoal 未呼び出し)。今日は可", async () => {
    const user = userEvent.setup();
    await openNewCompetition(user);
    await user.click(screen.getByTestId("date-pick")); // 2000-01-01
    await submit(user);
    expect(window.alert).toHaveBeenCalledWith("goals.form.competitionDatePast");
    expect(mocks.createCompetition).not.toHaveBeenCalled();
    expect(mocks.updateGoal).not.toHaveBeenCalled();

    mocks.pickDate = today();
    await user.click(screen.getByTestId("date-pick"));
    await submit(user);
    expect(mocks.createCompetition).toHaveBeenCalledTimes(1);
    expect(mocks.updateGoal).toHaveBeenCalledTimes(1);
  });

  it("[v5 M-A] 失敗後に大会名を直して再送信 -> createCompetition は1回、updateCompetition(作成済み id, 直した値)、updateGoal は作成済み id。無変更なら updateCompetition は呼ばれない", async () => {
    const user = userEvent.setup();
    mocks.updateGoal.mockRejectedValueOnce(new Error("rls")).mockRejectedValueOnce(new Error("rls"));
    await openNewCompetition(user);
    mocks.pickDate = today();
    await user.click(screen.getByTestId("date-pick"));
    await submit(user);
    expect(mocks.createCompetition).toHaveBeenCalledTimes(1);
    // 無変更で再送信 -> updateCompetition なし
    await submit(user);
    expect(mocks.updateCompetition).not.toHaveBeenCalled();
    // 大会名を直して再送信
    const nameInput = screen.getByPlaceholderText("goals.form.competitionNamePlaceholder");
    await user.clear(nameInput);
    await user.type(nameInput, "修正後の大会");
    await submit(user);
    expect(mocks.createCompetition).toHaveBeenCalledTimes(1);
    expect(mocks.updateCompetition).toHaveBeenCalledTimes(1);
    const [id, updates] = mocks.updateCompetition.mock.calls[0]!;
    expect(id).toBe("newc");
    expect(updates).toMatchObject({ title: "修正後の大会" });
    expect(mocks.updateGoal.mock.calls.at(-1)![1].competitionId).toBe("newc");
  });

  it("[M4] createCompetition 成功 -> updateGoal 失敗 -> 再送信でも createCompetition は1回のまま、2回目の updateGoal は作成済み id を使う", async () => {
    const user = userEvent.setup();
    mocks.updateGoal.mockRejectedValueOnce(new Error("rls"));
    await openNewCompetition(user);
    mocks.pickDate = today();
    await user.click(screen.getByTestId("date-pick"));
    await submit(user);
    expect(mocks.createCompetition).toHaveBeenCalledTimes(1);
    expect(mocks.updateGoal).toHaveBeenCalledTimes(1);
    expect(window.alert).toHaveBeenCalledWith("goals.edit.updateFailed");
    await submit(user);
    expect(mocks.createCompetition).toHaveBeenCalledTimes(1);
    expect(mocks.updateGoal).toHaveBeenCalledTimes(2);
    expect(mocks.updateGoal.mock.calls[1]![1].competitionId).toBe("newc");
  });
});
