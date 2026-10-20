// =============================================================================
// __tests__/goals/goalsTimeDisplay.test.tsx
// =============================================================================
// 目標管理画面 (mobile) の表示を web (apps/web/__tests__/goals/goalsTimeDisplay.test.tsx) に揃えた
// 変更 (2026-10-14) を固定する。
//  - 一覧カード: 1行目「日付 (YYYY/MM/DD) 大会名」、2行目「種目名 / 目標タイム (Best-0.01)」だけ。
//    進捗バー・達成率 %・Before/After・残り日数は出さない
//  - 詳細: 大会日 (YYYY/MM/DD) を大会名の左、水路を大会名の右に出し、種目を見出しにする /
//    左に After (目標タイム)、右に Before (現在のベスト) を並べ、間に大会までの残り日数と
//    目標までの残り秒数を出す
//  - マイルストーン: 期限と達成日を同じ行に並べる
// 「今日」は Date だけを偽装して固定する (React Query のタイマーは本物のまま)。
// RN モックの View は testID を data-testid に変換しないため、[testid=...] で引く。
// =============================================================================
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { goalKeys } from "@apps/shared/hooks/queries/goals";
import type { GoalWithMilestones, Milestone } from "@apps/shared/types";

const h = vi.hoisted(() => ({
  getGoalCurrentBestTime: vi.fn(),
  getGoalWithMilestones: vi.fn(),
  refresh: null as null | (() => Promise<unknown>),
}));

vi.mock("@/contexts/AuthProvider", () => ({ useAuth: () => ({ supabase: {}, user: { id: "u1" } }) }));
vi.mock("@apps/shared/api/goals", () => ({
  GoalAPI: class {
    getGoalCurrentBestTime = h.getGoalCurrentBestTime;
    getGoalWithMilestones = h.getGoalWithMilestones;
    deleteGoal = vi.fn();
    deleteMilestone = vi.fn();
  },
}));
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn() }),
  useRoute: () => ({ params: { goalId: "goal-1" } }),
}));
vi.mock("@/hooks/usePullToRefresh", () => ({
  usePullToRefresh: (refresh: () => Promise<unknown>) => {
    h.refresh = refresh;
    return { refreshing: false, handleRefresh: refresh };
  },
}));

import { GoalCard } from "@/components/goals/GoalCard";
import { MilestoneList } from "@/components/goals/MilestoneList";
import { GoalDetailScreen } from "@/screens/GoalDetailScreen";

const TODAY = new Date(2026, 9, 13, 10, 0, 0); // 2026-10-13 (ローカル)

let qc: QueryClient;
function withQuery(node: React.ReactElement) {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}
// react-query の通知は setTimeout(0) でバッチされるため、act を複数回に分けて待つ
const flush = async () => {
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
};
const byTestId = (id: string) => document.querySelector(`[testid="${id}"]`) as HTMLElement | null;
const text = () => document.body.textContent ?? "";

function renderCard(over: Partial<React.ComponentProps<typeof GoalCard>> = {}) {
  return withQuery(
    <GoalCard
      goalId="goal-1"
      competitionTitle="新水フェスティバル"
      competitionDate="2026-02-11"
      competitionUnavailable={false}
      styleName="50m自由形"
      targetTime={23.79}
      achieved={false}
      onPress={() => {}}
      onEdit={() => {}}
      onDelete={() => {}}
      {...over}
    />,
  );
}

const fr50 = { id: 1, name_jp: "50m自由形", name: "50m Fr", style: "Fr", distance: 50 };
function detailGoal(over: Partial<GoalWithMilestones> = {}): GoalWithMilestones {
  return {
    id: "goal-1", user_id: "u1", competition_id: "comp-1", style_id: 1, target_time: 23.79,
    status: "active", achieved_at: null, reflection_note: null, created_at: "", updated_at: "",
    competition: { id: "comp-1", title: "新水フェスティバル", date: "2026-10-20", end_date: null, pool_type: 0 } as never,
    style: fr50 as never,
    milestones: [],
    ...over,
  } as GoalWithMilestones;
}
function competitionOn(date: string, endDate: string | null = null, poolType = 0) {
  return { id: "comp-1", title: "大会", date, end_date: endDate, pool_type: poolType } as never;
}
async function renderDetail(goal: GoalWithMilestones) {
  h.getGoalWithMilestones.mockResolvedValue(goal);
  const result = withQuery(<GoalDetailScreen />);
  await flush();
  return result;
}

function milestone(over: Partial<Milestone> = {}): Milestone {
  return {
    id: "ms-1", goal_id: "goal-1", title: "練習タイム：25秒台", type: "time",
    params: { distance: 50, target_time: 25.99, style: "Fr", swim_category: "Swim" },
    deadline: "2026-02-11", status: "achieved", achieved_at: "2026-02-10T03:00:00Z",
    reflection_done: false, reflection_note: null, created_at: "", updated_at: "",
    ...over,
  } as Milestone;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(TODAY);
  h.getGoalCurrentBestTime.mockReset();
  h.getGoalWithMilestones.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("一覧カード: 日付・大会名 / 種目名・目標タイム (Best差) だけ", () => {
  it("1行目に日付 (YYYY/MM/DD) と大会名、2行目に種目名と目標タイム・Best差を出す", async () => {
    h.getGoalCurrentBestTime.mockResolvedValue(23.8);
    renderCard();
    await flush();

    const date = screen.getByText("2026/02/11");
    const competition = screen.getByText("新水フェスティバル");
    const style = screen.getByText("50m自由形");
    const target = screen.getByText("23.79");
    const diff = screen.getByText("(Best-0.01)");
    // 日付と大会名は同じ行、目標タイムと Best 差は同じ塊、種目名と目標タイムは2行目
    expect(date.parentElement).toBe(competition.parentElement);
    expect(target.parentElement).toBe(diff.parentElement);
    expect(style.parentElement?.parentElement).toBe(target.parentElement?.parentElement);
    expect(h.getGoalCurrentBestTime).toHaveBeenCalledWith("goal-1");
  });

  it("進捗バー・達成率 %・Before/After・残り日数・現在のベストのラベル・「目標:」接頭辞は出さない", async () => {
    h.getGoalCurrentBestTime.mockResolvedValue(25);
    renderCard({ competitionDate: "2026-10-20" });
    await flush();

    expect(text()).not.toMatch(/%|あと\d+日|あと[\d.]+秒|現在のベスト|目標:|本日|終了/);
    expect(byTestId("goal-before-after-gap")).toBeNull();
    expect(document.querySelector('[data-testid="icon-arrow-left"]')).toBeNull();
  });

  it("目標がベストより遅い (既に上回っている) なら Best+x.xx", async () => {
    h.getGoalCurrentBestTime.mockResolvedValue(23.5);
    renderCard();
    await flush();
    expect(screen.getByText("(Best+0.29)")).toBeTruthy();
  });

  it("記録が無ければ Best 差は出さない (目標タイムだけ)", async () => {
    h.getGoalCurrentBestTime.mockResolvedValue(null);
    renderCard();
    await flush();
    await vi.waitFor(() => expect(qc.getQueryState(goalKeys.currentBestTime("goal-1"))?.status).toBe("success"));
    await flush();
    expect(screen.getByText("23.79")).toBeTruthy();
    expect(text()).not.toContain("Best");
  });

  it("大会情報が無い目標は API が値を返しても Best 差を出さず、日付も出さない", async () => {
    h.getGoalCurrentBestTime.mockResolvedValue(23.8);
    renderCard({ competitionTitle: null, competitionDate: undefined, competitionUnavailable: true });
    await flush();
    await vi.waitFor(() => expect(qc.getQueryState(goalKeys.currentBestTime("goal-1"))?.status).toBe("success"));
    await flush();
    expect(screen.getByText("大会情報なし")).toBeTruthy();
    expect(text()).not.toContain("Best");
    expect(text()).not.toMatch(/\d{4}\/\d{2}\/\d{2}/);
  });

  it("取得中は Best 差を出さない (目標タイムだけ)", async () => {
    h.getGoalCurrentBestTime.mockImplementation(() => new Promise(() => {}));
    renderCard();
    await flush();
    expect(qc.getQueryState(goalKeys.currentBestTime("goal-1"))?.status).toBe("pending");
    expect(screen.getByText("23.79")).toBeTruthy();
    expect(text()).not.toContain("Best");
  });

  it("取得に失敗したら Best 差は出さない", async () => {
    h.getGoalCurrentBestTime.mockRejectedValue(new Error("boom"));
    renderCard();
    await flush();
    await vi.waitFor(() => expect(qc.getQueryState(goalKeys.currentBestTime("goal-1"))?.status).toBe("error"));
    await flush();
    expect(text()).not.toContain("Best");
    expect(text()).not.toContain("boom");
  });

  it("達成バッジは種目名の横 (同じ塊) に出す", async () => {
    h.getGoalCurrentBestTime.mockResolvedValue(null);
    renderCard({ achieved: true });
    await flush();
    const badge = screen.getByText("達成！");
    expect(badge.parentElement?.parentElement).toBe(screen.getByText("50m自由形").parentElement);
  });
});

describe("詳細: 現在のベストと目標までの残り", () => {
  it("左から After (目標タイム)・残り日数と残り秒数・Before (現在のベスト) の順に出す", async () => {
    h.getGoalCurrentBestTime.mockResolvedValue(23.8);
    await renderDetail(detailGoal());

    const after = byTestId("goal-after")!;
    const gap = byTestId("goal-before-after-gap")!;
    const before = byTestId("goal-before")!;
    expect(after.textContent).toBe("目標タイム23.79");
    expect(gap.textContent).toBe("あと7日あと0.01秒");
    expect(gap.querySelector('[data-testid="icon-arrow-left"]')).not.toBeNull();
    expect(before.textContent).toBe("現在のベスト23.80");
    // 並び順 (DOM 順) が After → 間 → Before
    expect(after.nextElementSibling).toBe(gap);
    expect(gap.nextElementSibling).toBe(before);
  });

  it("1分を超える種目は現在のベストを M:SS.cc、残りを秒で出す", async () => {
    h.getGoalCurrentBestTime.mockResolvedValue(65.5);
    await renderDetail(detailGoal({ target_time: 63.2 }));
    expect(byTestId("goal-before")!.textContent).toContain("1:05.50");
    expect(byTestId("goal-before-after-gap")!.textContent).toContain("あと2.30秒");
  });

  it.each([
    ["目標と同タイム", 23.79],
    ["目標より速い", 23.5],
  ])("%s (%s) のベストなら「目標タイム到達」で残り秒数は出さない", async (_label, best) => {
    h.getGoalCurrentBestTime.mockResolvedValue(best);
    await renderDetail(detailGoal());
    const gap = byTestId("goal-before-after-gap")!.textContent;
    expect(gap).toContain("目標タイム到達");
    expect(gap).not.toMatch(/秒/);
  });

  it("取得中は現在のベストを「—」にし、残り秒数は出さない", async () => {
    h.getGoalCurrentBestTime.mockImplementation(() => new Promise(() => {}));
    await renderDetail(detailGoal());
    expect(qc.getQueryState(goalKeys.currentBestTime("goal-1"))?.status).toBe("pending");
    expect(byTestId("goal-before")!.textContent).toBe("現在のベスト—");
    expect(byTestId("goal-before-after-gap")!.textContent).toBe("あと7日");
  });

  it("引っ張って更新で現在のベストも取り直す (別端末で記録が増えた場合)", async () => {
    h.getGoalCurrentBestTime.mockResolvedValueOnce(23.8).mockResolvedValueOnce(23.5);
    await renderDetail(detailGoal());
    expect(byTestId("goal-before")!.textContent).toBe("現在のベスト23.80");
    await act(async () => { await h.refresh!(); });
    await flush();
    expect(h.getGoalCurrentBestTime).toHaveBeenCalledTimes(2);
    expect(byTestId("goal-before")!.textContent).toBe("現在のベスト23.50");
  });

  it("記録が無ければ「記録なし」を出し、残り秒数は出さない", async () => {
    h.getGoalCurrentBestTime.mockResolvedValue(null);
    await renderDetail(detailGoal());
    expect(byTestId("goal-before")!.textContent).toContain("記録なし");
    expect(byTestId("goal-before-after-gap")!.textContent).not.toMatch(/秒|到達/);
  });

  it("大会情報が無い目標は API が値を返しても「—」(水路が分からないタイムを出さない)", async () => {
    h.getGoalCurrentBestTime.mockResolvedValue(23.8);
    await renderDetail(detailGoal({ competition: null as never }));
    await vi.waitFor(() => expect(qc.getQueryState(goalKeys.currentBestTime("goal-1"))?.status).toBe("success"));
    await flush();
    expect(byTestId("goal-before")!.textContent).toContain("—");
    expect(text()).not.toContain("23.80");
    // 大会日が無いので残り日数も出さない
    expect(byTestId("goal-before-after-gap")!.textContent).toBe("");
  });

  it("取得に失敗したら「—」", async () => {
    h.getGoalCurrentBestTime.mockRejectedValue(new Error("SECRET"));
    await renderDetail(detailGoal());
    await vi.waitFor(() => expect(qc.getQueryState(goalKeys.currentBestTime("goal-1"))?.status).toBe("error"));
    await flush();
    expect(byTestId("goal-before")!.textContent).toContain("—");
    expect(text()).not.toContain("SECRET");
  });
});

describe("詳細: 大会日までの残り日数", () => {
  it.each([
    ["7日後", "2026-10-20", "あと7日"],
    ["明日", "2026-10-14", "あと1日"],
    ["当日", "2026-10-13", "本日"],
    ["過去", "2026-02-11", "終了"],
  ])("%s の大会 (%s) → %s", async (_label, date, expected) => {
    h.getGoalCurrentBestTime.mockResolvedValue(null);
    await renderDetail(detailGoal({ competition: competitionOn(date) }));
    expect(byTestId("goal-before-after-gap")!.textContent).toBe(expected);
  });

  it.each([
    ["開催中 (2日目)", "2026-10-12", "2026-10-14", "本日"],
    ["最終日", "2026-10-11", "2026-10-13", "本日"],
    ["初日", "2026-10-13", "2026-10-15", "本日"],
    ["開始前", "2026-10-20", "2026-10-22", "あと7日"],
    ["最終日の翌日", "2026-10-10", "2026-10-12", "終了"],
    ["終了日が不正なら開始日で判定", "2026-10-12", "not-a-date", "終了"],
  ])("複数日開催: %s (%s〜%s) → %s", async (_label, start, end, expected) => {
    h.getGoalCurrentBestTime.mockResolvedValue(null);
    await renderDetail(detailGoal({ competition: competitionOn(start, end) }));
    expect(byTestId("goal-before-after-gap")!.textContent).toBe(expected);
  });

  it("夜遅く (23:59) でも暦日で数える (時刻の端数で1日ずれない)", async () => {
    vi.setSystemTime(new Date(2026, 9, 13, 23, 59, 0));
    h.getGoalCurrentBestTime.mockResolvedValue(null);
    await renderDetail(detailGoal({ competition: competitionOn("2026-10-14") }));
    expect(byTestId("goal-before-after-gap")!.textContent).toBe("あと1日");
  });
});

describe("詳細: 見出し (大会日・大会名・水路 / 種目)", () => {
  // 2026-10-15 ユーザー指定: 日付と大会名は改行する。編集・削除はテキストボタンではなく右上のアイコン
  it("1行目に大会日 (YYYY/MM/DD)、2行目に大会名と水路。種目を見出しにする。大会日は1箇所だけ", async () => {
    h.getGoalCurrentBestTime.mockResolvedValue(null);
    await renderDetail(detailGoal({ competition: competitionOn("2026-10-20", null, 1) }));

    const date = screen.getByText("2026/10/20");
    const title = screen.getByText("大会");
    const pool = screen.getByText("(長水路)");
    expect(pool.parentElement).toBe(title.parentElement);
    expect(date.parentElement).not.toBe(title.parentElement);
    expect(date.nextElementSibling).toBe(title.parentElement);
    const headers = Array.from(document.querySelectorAll('[accessibilityrole="header"]'));
    expect(headers.map((e) => e.textContent)).toEqual(["50m自由形"]);
    expect(text().match(/2026\/10\/20/g)).toHaveLength(1);
    // 旧表示 (「種目 | 2026年10月20日」) は出さない
    expect(text()).not.toContain("2026年10月20日");
    expect(text()).not.toContain(" | ");
  });

  it("編集・削除は大会日の行の右 (右上) にアイコンだけで出し、テキストのボタンは出さない", async () => {
    h.getGoalCurrentBestTime.mockResolvedValue(null);
    await renderDetail(detailGoal({ competition: competitionOn("2026-10-20", null, 1) }));

    const edit = Array.from(document.querySelectorAll('[accessibilitylabel="編集"]')) as HTMLElement[];
    const del = Array.from(document.querySelectorAll('[accessibilitylabel="削除"]')) as HTMLElement[];
    expect(edit).toHaveLength(1);
    expect(del).toHaveLength(1);
    expect(edit[0]!.querySelector('[data-testid="icon-edit-2"]')).not.toBeNull();
    expect(del[0]!.querySelector('[data-testid="icon-trash-2"]')).not.toBeNull();
    expect(edit[0]!.textContent).toBe("");
    expect(del[0]!.textContent).toBe("");
    // 大会日・大会名のまとまりと同じ行 (同じ親) に、後ろ (右) に並ぶ
    const headerText = screen.getByText("2026/10/20").parentElement!;
    const actions = edit[0]!.parentElement!;
    expect(del[0]!.parentElement).toBe(actions);
    expect(headerText.nextElementSibling).toBe(actions);
  });

  it("短水路は (短水路)", async () => {
    h.getGoalCurrentBestTime.mockResolvedValue(null);
    await renderDetail(detailGoal({ competition: competitionOn("2026-10-20", null, 0) }));
    expect(screen.getByText("(短水路)")).toBeTruthy();
  });

  it("大会情報が無い目標は「大会情報なし」と編集できない理由を出し、日付・水路は出さない", async () => {
    h.getGoalCurrentBestTime.mockResolvedValue(null);
    await renderDetail(detailGoal({ competition: null as never }));
    expect(screen.getByText("大会情報なし")).toBeTruthy();
    expect(screen.getByText("大会情報がないため編集できません")).toBeTruthy();
    expect(text()).not.toMatch(/短水路|長水路|\d{4}\/\d{2}\/\d{2}/);
  });
});

describe("マイルストーン: 期限と達成日", () => {
  it("達成済みは期限と達成日を同じ行 (横並びの同じ親要素) に並べ、概要とは別の行にする", () => {
    render(<MilestoneList milestones={[milestone()]} onEdit={() => {}} onDelete={() => {}} />);
    const deadline = screen.getByText(/^期限:/);
    const achieved = screen.getByText(/^達成日:/);
    const row = deadline.parentElement!;
    expect(achieved.parentElement).toBe(row);
    expect(row.style.flexDirection).toBe("row");
    expect(row.textContent).not.toContain("50m: 25.99");
    expect(deadline.textContent).toContain("2026年2月11日");
    expect(achieved.textContent).toContain("2026年2月10日");
  });

  // 2026-10-15 ユーザー指定: 左の状態アイコン (時計・チェック) を消し、概要と日付は編集・削除アイコンの下まで使う
  it("左の状態アイコンを出さない (達成・進行中・期限切れ・未着手のどれでも)", () => {
    render(
      <MilestoneList
        milestones={[
          milestone({ id: "a" }),
          milestone({ id: "b", status: "in_progress", achieved_at: null }),
          milestone({ id: "c", status: "expired", achieved_at: null }),
          milestone({ id: "d", status: "not_started", achieved_at: null }),
        ]}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    for (const name of ["check-circle", "clock", "alert-triangle"]) {
      expect(document.querySelector(`[data-testid="icon-${name}"]`), name).toBeNull();
    }
    expect(document.querySelectorAll('[data-testid="icon-edit-2"]')).toHaveLength(4);
  });

  it("編集・削除はタイトルと同じ行にあり、概要と日付はその行の下 (カードの全幅) に出す", () => {
    render(<MilestoneList milestones={[milestone()]} onEdit={() => {}} onDelete={() => {}} />);
    const title = screen.getByText("練習タイム：25秒台");
    const edit = document.querySelector('[accessibilitylabel="編集"]') as HTMLElement;
    const del = document.querySelector('[accessibilitylabel="削除"]') as HTMLElement;
    const header = title.parentElement!.parentElement!;
    expect(edit.parentElement!.parentElement).toBe(header);
    expect(del.parentElement).toBe(edit.parentElement);
    const summary = screen.getByText("50m: 25.99");
    const card = header.parentElement!;
    expect(summary.parentElement).toBe(card);
    expect(screen.getByText(/^期限:/).parentElement!.parentElement).toBe(card);
    expect(header.contains(summary)).toBe(false);
  });

  it("未達成は期限だけを出す", () => {
    render(
      <MilestoneList
        milestones={[milestone({ status: "in_progress", achieved_at: null })]}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText(/^期限:/)).toBeTruthy();
    expect(screen.queryByText(/^達成日:/)).toBeNull();
  });
});
