/**
 * DashboardClient — createPracticeLog/updatePracticeLog ラッパーの skipMilestoneUpdate 転送
 *
 * 過去に発見された実バグ:
 *   DashboardClient.tsx 内の createPracticeLog/updatePracticeLog ラッパー関数が、
 *   受け取った skipMilestoneUpdate 引数を実際の mutateAsync 呼び出しへ転送していなかった
 *   (`mutateAsync(log)` / `mutateAsync({ id, updates })` のように引数を握り潰していた)。
 *   このため「ログ保存単体ではマイルストーン判定を行わない」という意図の修正を
 *   入れたつもりでも、本番では一切効いていなかった。
 *   これまでのテストが検出できなかった理由は、useCreatePracticeLogMutation/
 *   useUpdatePracticeLogMutation のモックが引数を無視する形 (`{ mutateAsync: vi.fn() }`)
 *   だったため、「呼ばれたかどうか」しか見ておらず「どんな variables で呼ばれたか」を
 *   assert していなかったこと。
 *
 * 本テストは「引数を記録するモック」で useCreatePracticeLogMutation/
 * useUpdatePracticeLogMutation の mutateAsync を差し替え、DashboardClient が実際に
 * 生成するラッパー関数 (useDashboardHandlers に props として渡されるもの) を
 * 直接呼び出し、mutateAsync の実引数 (variables) に skipMilestoneUpdate がそのまま
 * 届いていることを assert する。
 *
 * DashboardClient 本体のレンダリングに必要な他の依存 (CalendarContainer 等の
 * 表示コンポーネント、useCalendarHandlers 等) は本テストの関心事ではないためスタブ化する。
 * useDashboardHandlers 自体もモックし、DashboardClient から渡された props オブジェクト
 * (createPracticeLog/updatePracticeLog を含む) を捕捉する入口として使う
 * (このテストが検証したいのは useDashboardHandlers の内部ロジックではなく、
 * DashboardClient 側のラッパーの転送処理そのものであるため)。
 */
import React from "react";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createPracticeLogMutateAsync: vi.fn().mockResolvedValue({ id: "created-log-id" }),
  updatePracticeLogMutateAsync: vi.fn().mockResolvedValue({ id: "log-1" }),
  capturedHandlerProps: vi.fn(),
}));

vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: { id: "user-1" }, supabase: {} }),
}));

vi.mock("@apps/shared/api/goals", () => ({
  GoalAPI: vi.fn().mockImplementation(() => ({
    getExpiredGoals: vi.fn().mockResolvedValue([]),
    getExpiredMilestones: vi.fn().mockResolvedValue([]),
    // DashboardClient のマウント時チェック (checkExpired) が
    // runMilestoneJudgment 経由で呼ぶ。無いと TypeError が
    // runMilestoneJudgment の try/catch に握りつぶされ、
    // 本テストが実際には何も検証していない状態で green になる。
    updateAllMilestoneStatuses: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@apps/shared/api", () => ({
  EntryAPI: vi.fn().mockImplementation(() => ({ deleteEntry: vi.fn() })),
}));

vi.mock("@apps/shared/hooks/queries/practices", () => ({
  useCreatePracticeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePracticeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePracticeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // 本テストの本体: 引数をそのまま記録するモック (代入を捨てない)。
  useCreatePracticeLogMutation: () => ({
    mutateAsync: mocks.createPracticeLogMutateAsync,
    isPending: false,
  }),
  useUpdatePracticeLogMutation: () => ({
    mutateAsync: mocks.updatePracticeLogMutateAsync,
    isPending: false,
  }),
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

// useDashboardHandlers 自体はモックし、DashboardClient が構築した
// createPracticeLog/updatePracticeLog ラッパー (props) を capturedHandlerProps 経由で捕捉する。
vi.mock("../../_hooks/useDashboardHandlers", () => ({
  useDashboardHandlers: (props: Record<string, unknown>) => {
    mocks.capturedHandlerProps(props);
    return {
      handlePracticeLogSubmit: vi.fn(),
      handleDeleteItem: vi.fn(),
      handleEntrySubmit: vi.fn(),
      handleEntrySkip: vi.fn(),
      handleRecordLogSubmit: vi.fn(),
      handlePracticeTabSave: vi.fn(),
      handleCompetitionTabSave: vi.fn(),
    };
  },
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

vi.mock("../../_components/CalendarContainer", () => ({
  __esModule: true,
  default: () => null,
}));
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

describe("DashboardClient — createPracticeLog/updatePracticeLog ラッパーの skipMilestoneUpdate 転送", () => {
  beforeEach(() => {
    mocks.createPracticeLogMutateAsync.mockClear();
    mocks.updatePracticeLogMutateAsync.mockClear();
    mocks.capturedHandlerProps.mockClear();
  });

  function renderClient() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
    });
    render(
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

  it("createPracticeLog ラッパーは skipMilestoneUpdate=true を createPracticeLogMutation.mutateAsync の variables にそのまま渡す", async () => {
    renderClient();

    await waitFor(() => expect(mocks.capturedHandlerProps).toHaveBeenCalled());
    const props = mocks.capturedHandlerProps.mock.calls[0]![0] as {
      createPracticeLog: (log: Record<string, unknown>, skipMilestoneUpdate?: boolean) => unknown;
    };

    await props.createPracticeLog({ practice_id: "practice-1", style: "Fr" }, true);

    expect(mocks.createPracticeLogMutateAsync).toHaveBeenCalledTimes(1);
    const variables = mocks.createPracticeLogMutateAsync.mock.calls[0]![0];
    expect(variables).toMatchObject({
      practice_id: "practice-1",
      style: "Fr",
      skipMilestoneUpdate: true,
    });
  });

  it("updatePracticeLog ラッパーは skipMilestoneUpdate=true を updatePracticeLogMutation.mutateAsync の variables にそのまま渡す", async () => {
    renderClient();

    await waitFor(() => expect(mocks.capturedHandlerProps).toHaveBeenCalled());
    const props = mocks.capturedHandlerProps.mock.calls[0]![0] as {
      updatePracticeLog: (
        id: string,
        updates: Record<string, unknown>,
        skipMilestoneUpdate?: boolean,
      ) => unknown;
    };

    await props.updatePracticeLog("log-1", { style: "Br" }, true);

    expect(mocks.updatePracticeLogMutateAsync).toHaveBeenCalledTimes(1);
    const variables = mocks.updatePracticeLogMutateAsync.mock.calls[0]![0];
    expect(variables).toMatchObject({
      id: "log-1",
      updates: { style: "Br" },
      skipMilestoneUpdate: true,
    });
  });

  it("[非退行] skipMilestoneUpdate を省略した場合は variables.skipMilestoneUpdate が undefined のまま渡る (勝手に true を補完しない)", async () => {
    renderClient();

    await waitFor(() => expect(mocks.capturedHandlerProps).toHaveBeenCalled());
    const props = mocks.capturedHandlerProps.mock.calls[0]![0] as {
      createPracticeLog: (log: Record<string, unknown>, skipMilestoneUpdate?: boolean) => unknown;
    };

    await props.createPracticeLog({ practice_id: "practice-1", style: "Fr" });

    const variables = mocks.createPracticeLogMutateAsync.mock.calls[0]![0];
    expect(variables.skipMilestoneUpdate).toBeUndefined();
  });
});
