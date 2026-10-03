/**
 * useDashboardHandlers.handlePracticeLogSubmit — マイルストーン判定の順序
 *
 * マイルストーン判定は、ログ保存そのもの (createPracticeLog/updatePracticeLog) とは
 * 完全に切り離されており、`refreshMilestonesAfterPracticeSave`
 * (apps/web/utils/practiceMilestoneRefresh.ts) がタイム永続化後にまとめて1回だけ
 * 呼ぶ設計になっている (ログ保存側は常に skipMilestoneUpdate=true を渡し、判定自体は
 * 行わない)。「createPracticeLog/updatePracticeLog の呼び出し = 判定が走る代理」と
 * みなすオラクルは誤りで、判定が実際に走るタイミングとは別物になりうる。
 *
 * また、作成分岐で「createPracticeTime が createPracticeLog より先」という順序は、
 * practice_times.practice_log_id が createPracticeLog の戻り値 (新規ログの id) を
 * 必要とする外部キー制約上そもそも成立しえない (作成分岐は必ず
 * createPracticeLog → createPracticeTime の順にしかなり得ない)。更新分岐の
 * updatePracticeLog 呼び出し位置 (タグ・タイム同期より前) はこの順序のままが
 * 正しい実装である。
 *
 * よって本テストは「判定が走る代理」を createPracticeLog/updatePracticeLog ではなく
 * 実際の判定関数 `refreshMilestonesAfterPracticeSave` に置き直し、以下だけを assert する:
 *   - `refreshMilestonesAfterPracticeSave` が「その保存で発生した最後の createPracticeTime」
 *     より後に、ちょうど1回だけ呼ばれる。
 *   - ログ保存 (createPracticeLog/updatePracticeLog) は skipMilestoneUpdate=true 付きで
 *     呼ばれる (判定をここで二重に走らせない契約になっていることの確認)。
 * createPracticeLog と createPracticeTime の相対順序 (どちらが先か) は、上記の理由により
 * 本テストではもう assert しない。
 *
 * トートロジー防止メモ: useDashboardHandlers を実際に呼び出し、
 * `@/utils/practiceMilestoneRefresh` モジュールをモックしてその呼び出し引数・タイミングを
 * 観測する。実装のコピーではなく、モジュール境界を跨いだ実際の呼び出しのみを固定する。
 */
import { act, renderHook } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import { usePracticeStore } from "@/stores/practice/practiceStore";
import { useDashboardHandlers } from "../useDashboardHandlers";
import type { PracticeMenuFormData } from "@/stores/types";

const mocks = vi.hoisted(() => ({
  refreshMilestonesAfterPracticeSave: vi.fn().mockResolvedValue(undefined),
}));

// useDashboardHandlers.ts が実際に import しているのと同じモジュール境界をモックする。
// これにより「判定 (=マイルストーン再評価) が実際に呼ばれたか」を、
// createPracticeLog/updatePracticeLog のような無関係な代理シグナルではなく、
// 本物の判定関数の呼び出しそのものとして観測できる。
vi.mock("@/utils/practiceMilestoneRefresh", () => ({
  refreshMilestonesAfterPracticeSave: mocks.refreshMilestonesAfterPracticeSave,
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
    {children}
  </NextIntlClientProvider>
);

function createFakeSupabase() {
  const chain = {
    select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
    delete: () => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
    insert: vi.fn().mockResolvedValue({ error: null }),
  };
  return { from: vi.fn(() => chain) };
}

function buildProps(overrides: Record<string, unknown> = {}) {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: createFakeSupabase() as any,
    user: { id: "user-1" },
    styles: [],
    createPractice: vi.fn(),
    updatePractice: vi.fn(),
    createPracticeLog: vi.fn().mockResolvedValue({ id: "new-log-id" }),
    updatePracticeLog: vi.fn().mockResolvedValue({ id: "log-1" }),
    deletePracticeLog: vi.fn(),
    createPracticeTime: vi.fn().mockResolvedValue({}),
    deletePracticeTime: vi.fn().mockResolvedValue(undefined),
    createPracticeLogForTabSave: vi.fn(),
    updatePracticeLogForTabSave: vi.fn(),
    deletePractice: vi.fn(),
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
    deleteRecord: vi.fn(),
    deleteEntry: vi.fn(),
    createCompetition: vi.fn(),
    updateCompetition: vi.fn(),
    deleteCompetition: vi.fn(),
    createSplitTimes: vi.fn(),
    replaceSplitTimes: vi.fn(),
    editingData: null,
    createdPracticeId: null,
    competitionEditingData: null,
    createdCompetitionId: "comp-1",
    setPracticeLoading: vi.fn(),
    setCompetitionLoading: vi.fn(),
    closePracticeBasicForm: vi.fn(),
    closePracticeLogForm: vi.fn(),
    closeCompetitionBasicForm: vi.fn(),
    closeEntryLogForm: vi.fn(),
    closeRecordLogForm: vi.fn(),
    openPracticeLogForm: vi.fn(),
    setCreatedEntries: vi.fn(),
    openEntryLogForm: vi.fn(),
    openRecordLogForm: vi.fn(),
    refreshCalendar: vi.fn(),
    closePracticeTabModal: vi.fn(),
    closeCompetitionTabModal: vi.fn(),
    setEditingPracticeId: vi.fn(),
    setEditingCompetitionId: vi.fn(),
    ...overrides,
  };
}

const timeEntry = { setNumber: 1, repNumber: 1, time: 58 };

describe("useDashboardHandlers.handlePracticeLogSubmit — マイルストーン判定 (refreshMilestonesAfterPracticeSave) の呼び出し", () => {
  beforeEach(() => {
    usePracticeStore.getState().closeAll();
    mocks.refreshMilestonesAfterPracticeSave.mockClear();
    mocks.refreshMilestonesAfterPracticeSave.mockResolvedValue(undefined);
  });

  it("[更新分岐] refreshMilestonesAfterPracticeSave が最後の createPracticeTime の後にちょうど1回だけ呼ばれ、updatePracticeLog は skipMilestoneUpdate=true で呼ばれる", async () => {
    const callOrder: string[] = [];
    const updatePracticeLog = vi.fn().mockResolvedValue({ id: "log-1" });
    const createPracticeTime = vi.fn(async (..._args: unknown[]) => {
      callOrder.push("createPracticeTime");
      return {};
    });
    mocks.refreshMilestonesAfterPracticeSave.mockImplementation(async (..._args: unknown[]) => {
      callOrder.push("refreshMilestonesAfterPracticeSave");
    });

    const { result } = renderHook(
      () =>
        useDashboardHandlers(
          buildProps({
            editingData: { id: "log-1" },
            updatePracticeLog,
            createPracticeTime,
          }) as Parameters<typeof useDashboardHandlers>[0],
        ),
      { wrapper },
    );

    const menu: PracticeMenuFormData = {
      style: "Fr",
      swimCategory: "Swim",
      distance: 100,
      reps: 1,
      sets: 1,
      circleTime: 90,
      note: "",
      tags: [],
      times: [timeEntry],
    };

    await act(async () => {
      await result.current.handlePracticeLogSubmit([menu]);
    });

    // 本物の判定 (refreshMilestonesAfterPracticeSave) がちょうど1回だけ呼ばれる。
    expect(mocks.refreshMilestonesAfterPracticeSave).toHaveBeenCalledTimes(1);
    // タイム永続化 (createPracticeTime) が完了した後に判定が呼ばれる
    // (callOrder の最後の要素が判定であること = createPracticeTime より後)。
    expect(callOrder).toEqual(["createPracticeTime", "refreshMilestonesAfterPracticeSave"]);
    // ログ保存自体はここでは判定を行わない契約 (skipMilestoneUpdate=true) になっている。
    expect(updatePracticeLog).toHaveBeenCalledWith(
      "log-1",
      expect.objectContaining({ style: "Fr" }),
      true,
    );
  });

  it("[作成分岐] refreshMilestonesAfterPracticeSave が最後の createPracticeTime の後にちょうど1回だけ呼ばれ、createPracticeLog は skipMilestoneUpdate=true で呼ばれる", async () => {
    usePracticeStore.getState().setCreatedPracticeId("practice-1");

    const callOrder: string[] = [];
    const createPracticeLog = vi.fn().mockResolvedValue({ id: "new-log-id" });
    const createPracticeTime = vi.fn(async (..._args: unknown[]) => {
      callOrder.push("createPracticeTime");
      return {};
    });
    mocks.refreshMilestonesAfterPracticeSave.mockImplementation(async (..._args: unknown[]) => {
      callOrder.push("refreshMilestonesAfterPracticeSave");
    });

    const { result } = renderHook(
      () =>
        useDashboardHandlers(
          buildProps({
            editingData: null,
            createdPracticeId: "practice-1",
            createPracticeLog,
            createPracticeTime,
          }) as Parameters<typeof useDashboardHandlers>[0],
        ),
      { wrapper },
    );

    const menu: PracticeMenuFormData = {
      style: "Fr",
      swimCategory: "Swim",
      distance: 100,
      reps: 1,
      sets: 1,
      circleTime: 90,
      note: "",
      tags: [],
      times: [timeEntry],
    };

    await act(async () => {
      await result.current.handlePracticeLogSubmit([menu]);
    });

    expect(mocks.refreshMilestonesAfterPracticeSave).toHaveBeenCalledTimes(1);
    // createPracticeLog → createPracticeTime の順は FK 制約上不可避 (practice_times は
    // 新規ログの id を必要とする) なので assert しない。判定がその後に来ることのみ確認する。
    expect(callOrder).toEqual(["createPracticeTime", "refreshMilestonesAfterPracticeSave"]);
    expect(createPracticeLog).toHaveBeenCalledWith(
      expect.objectContaining({ style: "Fr", practice_id: "practice-1" }),
      true,
    );
  });
});
