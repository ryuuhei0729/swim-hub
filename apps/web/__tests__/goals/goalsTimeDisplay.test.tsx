/**
 * apps/web/__tests__/goals/goalsTimeDisplay.test.tsx
 *
 * 目標管理画面 (web) の表示変更 (2026-10-13 ユーザー要望) を固定する。
 *  - 一覧カード: 1行目「日付 (YYYY/MM/DD) 大会名」、2行目「種目名 / 目標タイム (Best-0.01)」だけ。
 *    進捗バー・達成率 %・Before/After・残り日数は出さない
 *  - 詳細: 大会日 (YYYY/MM/DD) を大会名の左、水路 (短水路/長水路) を大会名の右に出し、種目を見出しにする /
 *    左に After (目標タイム)、右に Before (現在のベスト。控えめ) を並べて Before → After を
 *    左向きの矢印でつなぎ、その間に大会までの残り日数と目標までの残り秒数を出す /
 *    初期タイムは出さない (Sprint Contract v2 で全廃) /
 *    達成率はマイルストーン達成率だけ (computeMilestoneRatio)。0件は「未設定」で % もバーも出さない (D2)
 *  - マイルストーン: 期限と達成日を同じ行に並べる
 *
 * next-intl は key をそのまま返す passthrough (値付きは `key:{json}`)。
 * 「今日」は Date だけを偽装して固定する (React Query のタイマーは本物のまま)。
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { goalKeys } from "@apps/shared/hooks/queries/goals";
import type { GoalWithMilestones, Milestone, Style } from "@apps/shared/types";

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return {
    ...original,
    useTranslations: (namespace?: string) =>
      ((key: string, values?: Record<string, unknown>) => {
        const full = namespace ? `${namespace}.${key}` : key;
        return values ? `${full}:${JSON.stringify(values)}` : full;
      }) as unknown as ReturnType<typeof original.useTranslations>,
    useLocale: () => "ja",
  };
});

vi.mock("@/contexts", () => ({
  useAuth: () => ({ supabase: {}, subscription: null }),
}));

const mocks = vi.hoisted(() => ({
  getGoalCurrentBestTime: vi.fn(),
}));

vi.mock("@apps/shared/api/goals", () => ({
  GoalAPI: vi.fn().mockImplementation(function () {
    return {
      getGoalCurrentBestTime: mocks.getGoalCurrentBestTime,
      deleteGoal: vi.fn(),
      deleteMilestone: vi.fn(),
    };
  }),
}));

vi.mock(
  "../../app/[locale]/(authenticated)/goals/_components/MilestoneCreateModal",
  () => ({ default: () => null }),
);

import GoalList from "../../app/[locale]/(authenticated)/goals/_components/GoalList";
import GoalDetail from "../../app/[locale]/(authenticated)/goals/_components/GoalDetail";
import MilestoneList from "../../app/[locale]/(authenticated)/goals/_components/MilestoneList";

const TODAY = new Date(2026, 9, 13, 10, 0, 0); // 2026-10-13 (ローカル)

function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/**
 * 現在のベストの取得が終わり、その結果が描画に反映されるまで待つ。
 * 取得前後で表示が変わらないケース (「—」のまま・Best 差を出さないまま) は findByText では
 * 待てないため、クエリの状態を見てから act の中で React Query の通知 (setTimeout 0) を流す。
 */
async function settleCurrentBestTime(
  queryClient: QueryClient,
  goalId: string,
  status: "success" | "error",
) {
  await waitFor(() =>
    expect(queryClient.getQueryState(goalKeys.currentBestTime(goalId))?.status).toBe(status),
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

type ListGoal = React.ComponentProps<typeof GoalList>["goals"][number];

function listGoal(overrides: Partial<ListGoal> = {}): ListGoal {
  return {
    id: "goal-1",
    user_id: "user-1",
    competition_id: "comp-1",
    style_id: 1,
    target_time: 23.79,
    status: "active",
    achieved_at: null,
    reflection_note: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    competition: { title: "新水フェスティバル", date: "2026-02-11" },
    style: { name_jp: "50m自由形" },
    ...overrides,
  };
}

function renderList(goal: ListGoal) {
  const queryClient = newQueryClient();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <GoalList
        goals={[goal]}
        selectedGoalId={null}
        onSelectGoal={() => {}}
        onDeleteGoal={async () => {}}
        onEditGoal={() => {}}
      />
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

const fr50: Style = { id: 1, name_jp: "50m自由形", name: "50m Fr", style: "Fr", distance: 50 };

function detailGoal(overrides: Partial<GoalWithMilestones> = {}): GoalWithMilestones {
  return {
    id: "goal-1",
    user_id: "user-1",
    competition_id: "comp-1",
    style_id: 1,
    target_time: 23.79,
    status: "active",
    achieved_at: null,
    reflection_note: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    competition: { id: "comp-1", title: "新水フェスティバル", date: "2026-10-20", pool_type: 0 } as never,
    style: fr50,
    milestones: [],
    ...overrides,
  };
}

function competitionOn(date: string, endDate: string | null = null) {
  return { id: "comp-1", title: "大会", date, end_date: endDate, pool_type: 0 } as never;
}

function renderDetail(goal: GoalWithMilestones) {
  const queryClient = newQueryClient();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <GoalDetail goal={goal} styles={[fr50]} onUpdate={async () => {}} onDelete={async () => {}} />
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

function milestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: "ms-1",
    goal_id: "goal-1",
    title: "練習タイム：25秒台",
    type: "time",
    params: { distance: 50, target_time: 25.99, style: "Fr", swim_category: "Swim" },
    deadline: "2026-02-11",
    status: "achieved",
    achieved_at: "2026-02-10T03:00:00Z",
    reflection_done: false,
    reflection_note: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as Milestone;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(TODAY);
  mocks.getGoalCurrentBestTime.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("一覧カード: 日付・大会名 / 種目名・目標タイム (Best差) だけ", () => {
  it("1行目に日付 (YYYY/MM/DD) と大会名、2行目に種目名 (見出し) と目標タイム・Best差を出す", async () => {
    mocks.getGoalCurrentBestTime.mockResolvedValue(23.8);
    renderList(listGoal());

    const diff = await screen.findByText('goals.list.diffFromBest:{"diff":"-0.01"}');
    const date = screen.getByText("2026/02/11");
    const competition = screen.getByText("新水フェスティバル");
    const style = screen.getByRole("heading", { level: 3 });
    const target = screen.getByText("23.79");
    expect(style).toHaveTextContent("50m自由形");
    // 日付と大会名は同じ行、目標タイムと Best 差は同じ塊
    expect(date.parentElement).toBe(competition.parentElement);
    expect(target.parentElement).toBe(diff.parentElement);
    // 日付 → 大会名 の順
    expect(date.compareDocumentPosition(competition) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(mocks.getGoalCurrentBestTime).toHaveBeenCalledWith("goal-1");
  });

  it("進捗バー・達成率 %・Before/After・残り日数・残り秒数・現在のベストのラベルは出さない", async () => {
    mocks.getGoalCurrentBestTime.mockResolvedValue(23.8);
    const { container } = renderList(listGoal({ competition: { title: "大会", date: "2026-10-20" } }));

    await screen.findByText('goals.list.diffFromBest:{"diff":"-0.01"}');
    expect(container.querySelector(".bg-blue-600.h-2")).toBeNull();
    expect(container.textContent).not.toMatch(/%/);
    expect(screen.queryByTestId("goal-before")).not.toBeInTheDocument();
    expect(screen.queryByTestId("goal-after")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(
      /daysLeft|competitionToday|competitionFinished|remainingSeconds|targetReached|currentBest|noRecord/,
    );
  });

  it("目標がベストより遅い (既に上回っている) なら Best+x.xx", async () => {
    mocks.getGoalCurrentBestTime.mockResolvedValue(23.5);
    renderList(listGoal());

    expect(
      await screen.findByText('goals.list.diffFromBest:{"diff":"+0.29"}'),
    ).toBeInTheDocument();
  });

  it("記録が無ければ Best 差は出さない (目標タイムだけ)", async () => {
    mocks.getGoalCurrentBestTime.mockResolvedValue(null);
    const { queryClient } = renderList(listGoal());

    await settleCurrentBestTime(queryClient, "goal-1", "success");
    expect(screen.getByText("23.79")).toBeInTheDocument();
    expect(screen.queryByText(/diffFromBest/)).not.toBeInTheDocument();
  });

  it("大会情報が無い目標は API が値を返しても Best 差を出さない (水路が分からないベストで比べない)", async () => {
    mocks.getGoalCurrentBestTime.mockResolvedValue(23.8);
    const { queryClient } = renderList(listGoal({ competition: null }));

    await settleCurrentBestTime(queryClient, "goal-1", "success");
    expect(screen.getByText("goals.list.competitionInfoUnavailable")).toBeInTheDocument();
    expect(screen.getByText("23.79")).toBeInTheDocument();
    expect(screen.queryByText(/diffFromBest/)).not.toBeInTheDocument();
  });

  it("取得に失敗したら Best 差は出さない", async () => {
    mocks.getGoalCurrentBestTime.mockRejectedValue(new Error("network"));
    const { queryClient } = renderList(listGoal());

    await settleCurrentBestTime(queryClient, "goal-1", "error");
    expect(screen.getByText("23.79")).toBeInTheDocument();
    expect(screen.queryByText(/diffFromBest/)).not.toBeInTheDocument();
  });
});

describe("詳細: 現在のベストと目標までの残り", () => {
  it("左から After (目標タイム)・残り日数と残り秒数・Before (現在のベスト) の順に出す", async () => {
    mocks.getGoalCurrentBestTime.mockResolvedValue(23.8);
    renderDetail(detailGoal());

    const before = screen.getByTestId("goal-before");
    const gap = screen.getByTestId("goal-before-after-gap");
    const after = screen.getByTestId("goal-after");
    expect(await within(before).findByText("23.80")).toBeInTheDocument();
    expect(within(before).getByText("goals.detail.currentBest")).toBeInTheDocument();
    expect(within(after).getByText("goals.detail.targetTime")).toBeInTheDocument();
    expect(within(after).getByText("23.79")).toBeInTheDocument();
    expect(within(gap).getByText('goals.detail.daysLeft:{"days":7}')).toBeInTheDocument();
    // 23.80 - 23.79 の浮動小数の端数を出さない
    expect(
      within(gap).getByText('goals.detail.remainingSeconds:{"seconds":"0.01"}'),
    ).toBeInTheDocument();
    // 左 After → 右 Before (DOM 順 = flex の表示順)
    expect(after.compareDocumentPosition(gap) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(gap.compareDocumentPosition(before) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("1分を超える種目は現在のベストを M:SS.cc、残りを秒で出す", async () => {
    mocks.getGoalCurrentBestTime.mockResolvedValue(65.42);
    renderDetail(detailGoal({ target_time: 60 }));

    expect(await screen.findByText("1:05.42")).toBeInTheDocument();
    expect(screen.getByText('goals.detail.remainingSeconds:{"seconds":"5.42"}')).toBeInTheDocument();
  });

  it.each([
    ["目標と同タイム", 23.79],
    ["目標より速い", 23.5],
  ])("%s なら残り秒数ではなく targetReached", async (_label, current) => {
    mocks.getGoalCurrentBestTime.mockResolvedValue(current);
    renderDetail(detailGoal());

    expect(await screen.findByText("goals.detail.targetReached")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/remainingSeconds/);
  });

  it("記録が無ければ noRecord を出し、残り秒数は出さない", async () => {
    mocks.getGoalCurrentBestTime.mockResolvedValue(null);
    renderDetail(detailGoal());

    expect(await screen.findByText("goals.detail.noRecord")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/remainingSeconds|targetReached/);
  });

  it("大会情報が無い目標は API が値を返しても「—」(水路が分からないタイムを出さない)", async () => {
    mocks.getGoalCurrentBestTime.mockResolvedValue(23.8);
    const { queryClient } = renderDetail(detailGoal({ competition: null }));

    // 取得が終わった後も「—」のまま
    await settleCurrentBestTime(queryClient, "goal-1", "success");
    expect(within(screen.getByTestId("goal-before")).getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("23.80")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/remainingSeconds|targetReached/);
  });

  it("取得に失敗したら「—」", async () => {
    mocks.getGoalCurrentBestTime.mockRejectedValue(new Error("network"));
    const { queryClient } = renderDetail(detailGoal());

    await settleCurrentBestTime(queryClient, "goal-1", "error");
    expect(within(screen.getByTestId("goal-before")).getByText("—")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/remainingSeconds|targetReached|noRecord/);
  });
});

describe("詳細: 大会日までの残り日数", () => {
  it.each([
    ["7日後", "2026-10-20", 'goals.detail.daysLeft:{"days":7}'],
    ["明日", "2026-10-14", 'goals.detail.daysLeft:{"days":1}'],
    ["当日", "2026-10-13", "goals.detail.competitionToday"],
    ["過去", "2026-02-11", "goals.detail.competitionFinished"],
  ])("%s の大会 (%s) → %s", (_label, date, expected) => {
    mocks.getGoalCurrentBestTime.mockResolvedValue(null);
    renderDetail(detailGoal({ competition: competitionOn(date) }));

    expect(within(screen.getByTestId("goal-before-after-gap")).getByText(expected)).toBeInTheDocument();
  });

  it.each([
    ["開催中 (2日目)", "2026-10-12", "2026-10-14", "goals.detail.competitionToday"],
    ["最終日", "2026-10-11", "2026-10-13", "goals.detail.competitionToday"],
    ["初日", "2026-10-13", "2026-10-15", "goals.detail.competitionToday"],
    ["開始前", "2026-10-20", "2026-10-22", 'goals.detail.daysLeft:{"days":7}'],
    ["最終日の翌日", "2026-10-10", "2026-10-12", "goals.detail.competitionFinished"],
    ["終了日が不正なら開始日で判定", "2026-10-12", "not-a-date", "goals.detail.competitionFinished"],
  ])("複数日開催: %s (%s〜%s) → %s", (_label, start, end, expected) => {
    mocks.getGoalCurrentBestTime.mockResolvedValue(null);
    renderDetail(detailGoal({ competition: competitionOn(start, end) }));

    expect(within(screen.getByTestId("goal-before-after-gap")).getByText(expected)).toBeInTheDocument();
  });

  it("夜遅く (23:59) でも暦日で数える (時刻の端数で1日ずれない)", () => {
    vi.setSystemTime(new Date(2026, 9, 13, 23, 59, 0));
    mocks.getGoalCurrentBestTime.mockResolvedValue(null);
    renderDetail(detailGoal({ competition: competitionOn("2026-10-14") }));

    expect(screen.getByText('goals.detail.daysLeft:{"days":1}')).toBeInTheDocument();
  });

  it("サーバー描画では残り日数を出さない (サーバーとブラウザで「今日」がずれてもハイドレーションが食い違わない)", () => {
    const html = renderToString(
      <QueryClientProvider client={newQueryClient()}>
        <GoalDetail goal={detailGoal()} styles={[fr50]} onUpdate={async () => {}} onDelete={async () => {}} />
      </QueryClientProvider>,
    );

    expect(html).toContain("2026/10/20");
    expect(html).not.toMatch(/daysLeft|competitionToday|competitionFinished/);
  });
});

describe("詳細: 見出し・達成率 (初期タイムは出さない)", () => {
  it("種目を見出しにし、大会名は見出しにしない", async () => {
    mocks.getGoalCurrentBestTime.mockResolvedValue(23.8);
    renderDetail(detailGoal());

    await screen.findByText("23.80");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("50m自由形");
    expect(
      screen.getAllByRole("heading").some((h) => h.textContent?.includes("新水フェスティバル")),
    ).toBe(false);
    expect(screen.getByText("新水フェスティバル")).toBeInTheDocument();
  });

  it("大会日 (YYYY/MM/DD) は大会名の左に1箇所だけ出し、Before/After の中には出さない", async () => {
    mocks.getGoalCurrentBestTime.mockResolvedValue(23.8);
    const { container } = renderDetail(detailGoal());

    await screen.findByText("23.80");
    const date = screen.getByText("2026/10/20");
    const competition = screen.getByText("新水フェスティバル");
    expect(date.parentElement).toBe(competition.parentElement);
    expect(date.compareDocumentPosition(competition) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.textContent?.match(/2026\/10\/20|2026年10月20日/g)).toHaveLength(1);
    expect(screen.getByTestId("goal-after").contains(date)).toBe(false);
  });

  it("Before (右) には現在のベストのラベルと値だけを出し、初期タイムの行 (ラベル・値・未設定) は出さない", async () => {
    mocks.getGoalCurrentBestTime.mockResolvedValue(23.8);
    renderDetail(detailGoal());

    const before = screen.getByTestId("goal-before");
    await within(before).findByText("23.80");
    // 初期タイムの行が残っていれば「初期タイム 未設定」が足される
    expect(before.textContent).toBe("goals.detail.currentBest23.80");
  });

  it.each([
    [0, "(common.poolTypeShort)"],
    [1, "(common.poolTypeLong)"],
  ])("pool_type=%s の大会は大会名の右に %s を出す", (poolType, expected) => {
    mocks.getGoalCurrentBestTime.mockResolvedValue(null);
    renderDetail(
      detailGoal({
        competition: { id: "comp-1", title: "新水フェスティバル", date: "2026-10-20", pool_type: poolType } as never,
      }),
    );

    const competition = screen.getByText("新水フェスティバル");
    const pool = screen.getByText(expected);
    expect(pool.parentElement).toBe(competition.parentElement);
    expect(competition.compareDocumentPosition(pool) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("大会情報が無い目標は水路を出さない", () => {
    mocks.getGoalCurrentBestTime.mockResolvedValue(null);
    renderDetail(detailGoal({ competition: null }));

    expect(screen.getByText("goals.list.competitionInfoUnavailable")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/poolType/);
  });

  /** 「マイルストーン達成率」の行 (ラベルと値) と、ProgressBar の塗り (.bg-blue-600.h-2) */
  const ratioRow = () => screen.getByText("goals.detail.milestoneRatio").parentElement!;
  const bars = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>(".bg-blue-600.h-2"));

  it("[D2] マイルストーン0件: 達成率の行は「未設定」で % もバーも出さない。目標本体の達成率 (achievement) も出さない", async () => {
    mocks.getGoalCurrentBestTime.mockResolvedValue(23.8);
    const { container } = renderDetail(detailGoal({ milestones: [] }));

    await screen.findByText("23.80");
    expect(screen.queryByText("goals.detail.achievement")).not.toBeInTheDocument();
    expect(within(ratioRow()).getByText("goals.detail.notSet")).toBeInTheDocument();
    expect(ratioRow().textContent).not.toMatch(/%/);
    expect(bars(container)).toHaveLength(0);
  });

  it("[SC7] マイルストーン2件中1件達成: 達成率 50% とバー1本 (幅 50%)", async () => {
    mocks.getGoalCurrentBestTime.mockResolvedValue(23.8);
    const { container } = renderDetail(
      detailGoal({
        milestones: [
          milestone({ id: "m1" }),
          milestone({ id: "m2", status: "in_progress", achieved_at: null }),
        ],
      }),
    );

    await screen.findByText("23.80");
    expect(ratioRow().textContent).toContain("50%");
    expect(within(ratioRow()).queryByText("goals.detail.notSet")).not.toBeInTheDocument();
    expect(bars(container)).toHaveLength(1);
    expect(bars(container)[0]!.style.width).toBe("50%");
  });

  it("[SC7] マイルストーンがあって達成0件は 0% とバー (0件の「未設定」とは区別する)", async () => {
    mocks.getGoalCurrentBestTime.mockResolvedValue(23.8);
    const { container } = renderDetail(
      detailGoal({ milestones: [milestone({ id: "m1", status: "in_progress", achieved_at: null })] }),
    );

    await screen.findByText("23.80");
    expect(ratioRow().textContent).toContain("0%");
    expect(within(ratioRow()).queryByText("goals.detail.notSet")).not.toBeInTheDocument();
    expect(bars(container)).toHaveLength(1);
    expect(bars(container)[0]!.style.width).toBe("0%");
  });

  it("[SC7] 3件中1件達成は丸めて 33%", async () => {
    mocks.getGoalCurrentBestTime.mockResolvedValue(null);
    renderDetail(
      detailGoal({
        milestones: [
          milestone({ id: "m1" }),
          milestone({ id: "m2", status: "in_progress", achieved_at: null }),
          milestone({ id: "m3", status: "expired", achieved_at: null }),
        ],
      }),
    );

    await screen.findByText("goals.detail.noRecord");
    expect(ratioRow().textContent).toContain("33%");
  });

  it("[SC7] 大会情報が無い目標でも達成率はマイルストーンから出す (「—」にしない)", async () => {
    mocks.getGoalCurrentBestTime.mockResolvedValue(null);
    const { queryClient, container } = renderDetail(
      detailGoal({
        competition: null,
        milestones: [milestone({ id: "m1" }), milestone({ id: "m2", status: "in_progress", achieved_at: null })],
      }),
    );

    await settleCurrentBestTime(queryClient, "goal-1", "success");
    expect(ratioRow().textContent).toContain("50%");
    expect(ratioRow().textContent).not.toContain("—");
    expect(bars(container)).toHaveLength(1);
  });

  it("画面を開き直すと現在のベストを取り直す (記録の登録は goalKeys を invalidate しないため、キャッシュを新しい扱いにしない)", async () => {
    mocks.getGoalCurrentBestTime.mockResolvedValueOnce(23.8).mockResolvedValueOnce(23.7);
    const queryClient = newQueryClient();
    const ui = (
      <QueryClientProvider client={queryClient}>
        <GoalDetail goal={detailGoal()} styles={[fr50]} onUpdate={async () => {}} onDelete={async () => {}} />
      </QueryClientProvider>
    );

    const first = render(ui);
    expect(await within(screen.getByTestId("goal-before")).findByText("23.80")).toBeInTheDocument();
    first.unmount();

    render(ui);
    expect(await within(screen.getByTestId("goal-before")).findByText("23.70")).toBeInTheDocument();
    expect(mocks.getGoalCurrentBestTime).toHaveBeenCalledTimes(2);
  });

  it("一覧と詳細は同じ目標の現在のベストを1回だけ取得する (同じクエリキーを共有)", async () => {
    mocks.getGoalCurrentBestTime.mockResolvedValue(23.8);
    render(
      <QueryClientProvider client={newQueryClient()}>
        <GoalList
          goals={[listGoal()]}
          selectedGoalId="goal-1"
          onSelectGoal={() => {}}
          onDeleteGoal={async () => {}}
          onEditGoal={() => {}}
        />
        <GoalDetail goal={detailGoal()} styles={[fr50]} onUpdate={async () => {}} onDelete={async () => {}} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('goals.list.diffFromBest:{"diff":"-0.01"}')).toBeInTheDocument();
    expect(await within(screen.getByTestId("goal-before")).findByText("23.80")).toBeInTheDocument();
    expect(mocks.getGoalCurrentBestTime).toHaveBeenCalledTimes(1);
  });
});

describe("マイルストーン: 期限と達成日", () => {
  it("達成済みは期限と達成日を同じ行 (同じ親要素) に並べる", () => {
    render(
      <MilestoneList
        milestones={[milestone()]}
        styles={[fr50]}
        goalCompetitionDate="2026-02-11"
        onUpdate={async () => {}}
      />,
    );

    const deadline = screen.getByText(/goals\.milestone\.deadlineLabel/);
    const achieved = screen.getByText(/goals\.milestone\.achievedDateLabel/);
    expect(deadline).toHaveTextContent("2026年2月11日");
    expect(achieved).toHaveTextContent("2026年2月10日");
    expect(deadline.parentElement).toBe(achieved.parentElement);
    expect(screen.getByText(/goals\.milestoneSummary\.time/)).toBeInTheDocument();
  });

  it("未達成は期限だけを出す", () => {
    render(
      <MilestoneList
        milestones={[milestone({ status: "in_progress", achieved_at: null })]}
        styles={[fr50]}
        goalCompetitionDate="2026-02-11"
        onUpdate={async () => {}}
      />,
    );

    expect(screen.getByText(/goals\.milestone\.deadlineLabel/)).toBeInTheDocument();
    expect(screen.queryByText(/goals\.milestone\.achievedDateLabel/)).not.toBeInTheDocument();
  });
});
