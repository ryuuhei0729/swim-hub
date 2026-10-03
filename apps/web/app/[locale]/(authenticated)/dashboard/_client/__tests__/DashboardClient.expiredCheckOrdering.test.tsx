/**
 * DashboardClient — マウント時の checkExpired の呼び出し順序
 *
 * チーム管理者による代理保存 (練習・大会記録の代理入力) は保存時点ではマイルストーン
 * 判定を行わない (遅延評価)。対象メンバー本人が /dashboard を開いたこのセッションで
 * GoalAPI.updateAllMilestoneStatuses(user.id) を1回走らせてから期限切れチェック
 * (getExpiredGoals → getExpiredMilestones) を行うことで、代理保存分も反映された
 * 状態で「期限切れ・未達成」の振り返りモーダルの対象を判定する必要がある。
 * 判定を後回しにすると、代理保存で既に達成済みのマイルストーンに対して誤って
 * 「未達成」の振り返りが出てしまう。
 *
 * 本テストは:
 *  - updateAllMilestoneStatuses が getExpiredGoals/getExpiredMilestones より先に、
 *    かつ完了を待ってから (await で直列に) 呼ばれることを呼び出し順序で assert する
 *  - 判定が失敗 (reject) しても、期限切れチェックは実行され、画面が落ちない
 *    (例外が伝播しない) ことを assert する
 *
 * トートロジー防止メモ: 呼び出し順序の記録は各 API 呼び出しの「開始時刻」ではなく
 * 「呼ばれた瞬間」に push するため、await を挟んだ直列実行のみを正としてカウントする
 * (並列実行だと push の順序が呼び出し順と一致しない場合がある点に注意し、
 * 各モックは呼ばれた瞬間に同期的に push してから非同期に resolve/reject する)。
 */
import React from "react";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  callOrder: [] as string[],
  updateAllMilestoneStatuses: vi.fn(),
  getExpiredGoals: vi.fn(),
  getExpiredMilestones: vi.fn(),
}));

vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: { id: "user-1" }, supabase: {} }),
}));

vi.mock("@apps/shared/api/goals", () => ({
  GoalAPI: vi.fn().mockImplementation(() => ({
    updateAllMilestoneStatuses: (...args: unknown[]) => {
      mocks.callOrder.push("updateAllMilestoneStatuses");
      return mocks.updateAllMilestoneStatuses(...args);
    },
    getExpiredGoals: (...args: unknown[]) => {
      mocks.callOrder.push("getExpiredGoals");
      return mocks.getExpiredGoals(...args);
    },
    getExpiredMilestones: (...args: unknown[]) => {
      mocks.callOrder.push("getExpiredMilestones");
      return mocks.getExpiredMilestones(...args);
    },
  })),
}));

vi.mock("@apps/shared/api", () => ({
  EntryAPI: vi.fn().mockImplementation(() => ({ deleteEntry: vi.fn() })),
}));

vi.mock("@apps/shared/hooks/queries/practices", () => ({
  useCreatePracticeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePracticeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePracticeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreatePracticeLogMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePracticeLogMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePracticeLogMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreatePracticeTimeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePracticeTimeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@apps/shared/hooks/queries/records", () => ({
  useCreateRecordMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateRecordMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteRecordMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateCompetitionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCompetitionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCompetitionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateSplitTimesMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReplaceSplitTimesMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("../../_hooks/useDashboardHandlers", () => ({
  useDashboardHandlers: () => ({
    handlePracticeLogSubmit: vi.fn(),
    handleDeleteItem: vi.fn(),
    handleEntrySubmit: vi.fn(),
    handleEntrySkip: vi.fn(),
    handleRecordLogSubmit: vi.fn(),
    handlePracticeTabSave: vi.fn(),
    handleCompetitionTabSave: vi.fn(),
  }),
}));

vi.mock("../../_hooks/useCalendarHandlers", () => ({
  useCalendarHandlers: () => ({
    onDateClick: vi.fn(),
    onAddItem: vi.fn(),
    onEditItem: vi.fn(),
    onDeleteItem: vi.fn(),
    onAddPracticeLog: vi.fn(),
    onAddPracticeLogFromTemplate: vi.fn(),
    onEditPracticeLog: vi.fn(),
    onDeletePracticeLog: vi.fn(),
    onAddRecord: vi.fn(),
    onEditRecord: vi.fn(),
    onDeleteRecord: vi.fn(),
  }),
}));

vi.mock("../../_components/CalendarContainer", () => ({ __esModule: true, default: () => null }));
vi.mock("../../_components/TeamAnnouncementsSection", () => ({
  __esModule: true,
  default: () => null,
}));
vi.mock("../FormModals", () => ({ FormModals: () => null }));
vi.mock("@/app/[locale]/(authenticated)/goals/_components/ReflectionModal", () => ({
  __esModule: true,
  default: () => null,
}));
vi.mock("@/app/[locale]/(authenticated)/goals/_components/GoalReflectionModal", () => ({
  __esModule: true,
  default: () => null,
}));

import DashboardClient from "../DashboardClient";

function renderClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DashboardClient
        initialCalendarItems={[]}
        initialMonthlySummary={{} as never}
        teams={[]}
        styles={[]}
        tags={[]}
      />
    </QueryClientProvider>,
  );
}

describe("DashboardClient — マウント時 checkExpired の呼び出し順序", () => {
  beforeEach(() => {
    mocks.callOrder.length = 0;
    mocks.updateAllMilestoneStatuses.mockReset().mockResolvedValue(undefined);
    mocks.getExpiredGoals.mockReset().mockResolvedValue([]);
    mocks.getExpiredMilestones.mockReset().mockResolvedValue([]);
  });

  it("updateAllMilestoneStatuses が getExpiredGoals より先に、getExpiredGoals が getExpiredMilestones より先に、それぞれ完了を待って直列に呼ばれる", async () => {
    renderClient();

    await waitFor(() => expect(mocks.getExpiredMilestones).toHaveBeenCalledTimes(1));

    expect(mocks.callOrder).toEqual([
      "updateAllMilestoneStatuses",
      "getExpiredGoals",
      "getExpiredMilestones",
    ]);
  });

  it("updateAllMilestoneStatuses の解決を待ってから getExpiredGoals が呼ばれる (呼び出し順序だけでなく完了待ちであること自体を確認)", async () => {
    // 呼び出し順序 (どちらが先に呼ばれ始めるか) だけでは、await せず fire-and-forget
    // で呼んだ場合でも「呼ばれる順」自体はソースコードの記述順と一致しうるため
    // 検出できない。ここでは判定の Promise を明示的に「まだ解決していない」状態に
    // 固定し、その間 getExpiredGoals が一切呼ばれていないことを確認してから
    // 解決させる、という直接的な確認方法を取る。
    let resolveJudgment!: () => void;
    mocks.updateAllMilestoneStatuses.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveJudgment = resolve;
        }),
    );

    renderClient();

    await waitFor(() => expect(mocks.updateAllMilestoneStatuses).toHaveBeenCalledTimes(1));
    // マイクロタスクを数周させても、判定が未解決の間は後続の期限切れチェックが
    // 呼ばれていない。
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.getExpiredGoals).not.toHaveBeenCalled();
    expect(mocks.getExpiredMilestones).not.toHaveBeenCalled();

    resolveJudgment();

    await waitFor(() => expect(mocks.getExpiredGoals).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.getExpiredMilestones).toHaveBeenCalledTimes(1));
  });

  it("判定 (updateAllMilestoneStatuses) が失敗しても、期限切れチェックは実行され画面が落ちない", async () => {
    mocks.updateAllMilestoneStatuses.mockRejectedValue(new Error("judgment failed"));

    expect(() => renderClient()).not.toThrow();

    await waitFor(() => expect(mocks.getExpiredMilestones).toHaveBeenCalledTimes(1));

    // 判定が失敗しても getExpiredGoals/getExpiredMilestones はどちらも実行されている
    // (呼び出しが握りつぶされずに後続処理へ進んでいることの確認)。
    expect(mocks.getExpiredGoals).toHaveBeenCalledTimes(1);
    expect(mocks.getExpiredMilestones).toHaveBeenCalledTimes(1);
  });
});
