/**
 * PracticeClient — allowParentUpdate の導出 (Sprint Contract 2 SC1/SC4)
 *
 * /practice 履歴タブは `selectedPractice.team_id == null` から allowParentUpdate を
 * 直接導出する。dashboard の getEditingDataTeamId、/competition の
 * (selection.record.competition as Competition)?.team_id とは独立した3つ目の
 * 導出経路のため、専用のテストで「チーム練習 (team_id あり) は編集不可 /
 * 個人練習 (team_id なし) は編集可」を直接検証する。
 *
 * トートロジー防止メモ: 期待値は Sprint Contract 2 (SC1/SC4) の記述から
 * 導出したものであり、実装の三項演算子をそのままコピーしたものではない。
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi, beforeEach } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import type { PracticeWithLogs, Style } from "@apps/shared/types";
import { usePracticeStore } from "@/stores/practice/practiceStore";

const mocks = vi.hoisted(() => ({
  usePracticesQuery: vi.fn(),
}));

vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: { id: "user-1" }, supabase: {} }),
}));

vi.mock("@apps/shared/hooks/queries/practices", () => ({
  usePracticesQuery: mocks.usePracticesQuery,
  useCreatePracticeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePracticeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePracticeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreatePracticeLogMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePracticeLogMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePracticeLogMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreatePracticeTimeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePracticeTimeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// PracticeClient.test.tsx (配線ロジック中心) とは別に、ここでは PracticeClient が
// 「どの値を渡すか」だけを見たいのでスタブ化する。
vi.mock("@/components/forms/PracticeTabModal", () => ({
  __esModule: true,
  default: (props: { isOpen: boolean; allowParentUpdate?: boolean }) =>
    props.isOpen ? (
      <div data-testid="practice-tab-modal-stub">
        <span data-testid="tab-allow-parent-update">{String(props.allowParentUpdate)}</span>
      </div>
    ) : null,
}));

vi.mock("@/app/[locale]/(authenticated)/practice/_components/PracticeDetailModal", () => ({
  __esModule: true,
  default: (props: { isOpen: boolean; onEditPractice: () => void; onClose: () => void }) =>
    props.isOpen ? (
      <div data-testid="practice-detail-modal-stub">
        <button onClick={() => props.onEditPractice()}>詳細から編集</button>
        <button onClick={() => props.onClose()}>詳細を閉じる</button>
      </div>
    ) : null,
}));

import PracticeClient from "../PracticeClient";

const makePractice = (overrides: Partial<PracticeWithLogs> = {}): PracticeWithLogs =>
  ({
    id: "practice-1",
    user_id: "user-1",
    date: "2026-07-01",
    title: null,
    place: "市民プール",
    note: null,
    team_id: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    practice_logs: [
      {
        id: "log-a",
        user_id: "user-1",
        practice_id: "practice-1",
        style: "Fr",
        swim_category: "Swim",
        rep_count: 4,
        set_count: 1,
        distance: 100,
        circle: 90,
        note: "",
        created_at: "2026-07-01T00:00:00Z",
        updated_at: "2026-07-01T00:00:00Z",
        practice_times: [],
        practice_log_tags: [],
      },
    ],
    ...overrides,
  }) as PracticeWithLogs;

const renderClient = (practices: PracticeWithLogs[]) => {
  mocks.usePracticesQuery.mockReturnValue({
    data: practices,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });

  return render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <PracticeClient styles={[] as Style[]} tags={[]} />
    </NextIntlClientProvider>,
  );
};

const getCardRows = (): HTMLElement[] => screen.queryAllByRole("button", { name: /^練習詳細を表示\(/ });

describe("PracticeClient allowParentUpdate 導出", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePracticeStore.getState().closeTabModal();
    usePracticeStore.getState().resetFilter();
  });

  it("[SC1] チーム練習 (team_id あり) を編集しようとすると allowParentUpdate=false が渡る", async () => {
    const user = userEvent.setup();
    renderClient([makePractice({ team_id: "team-abc" })]);

    await user.click(getCardRows()[0]!);
    await user.click(screen.getByText("詳細から編集"));

    await waitFor(() => {
      expect(screen.getByTestId("practice-tab-modal-stub")).toBeInTheDocument();
    });
    expect(screen.getByTestId("tab-allow-parent-update")).toHaveTextContent("false");
  });

  it("[SC4 / 非退行] 個人練習 (team_id なし) を編集すると allowParentUpdate=true が渡る", async () => {
    const user = userEvent.setup();
    renderClient([makePractice()]); // team_id: null (デフォルト)

    await user.click(getCardRows()[0]!);
    await user.click(screen.getByText("詳細から編集"));

    await waitFor(() => {
      expect(screen.getByTestId("practice-tab-modal-stub")).toBeInTheDocument();
    });
    expect(screen.getByTestId("tab-allow-parent-update")).toHaveTextContent("true");
  });
});
