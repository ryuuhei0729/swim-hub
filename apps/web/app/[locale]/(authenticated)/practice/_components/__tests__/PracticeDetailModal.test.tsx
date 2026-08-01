/**
 * PracticeDetailModal テスト
 *
 * /practice 履歴タブの行クリックで開く詳細モーダル。ダッシュボード由来の
 * PracticeDetails / AttendanceModal / DeleteConfirmModal をそのまま再利用する
 * ラッパーであるため、PracticeDetails / AttendanceModal は薄いスタブに差し替え、
 * 「配線」(props → コールバック呼び出し) と DeleteConfirmModal (実物) の連携のみを検証する。
 *
 * Sprint Contract 検証観点:
 *   [V-W-P01] 行クリックでダッシュボードと同じ詳細モーダルが開く (isOpen=false で非表示になること)
 *   [V-W-P02] 「編集」導線から PracticeTabModal の practice タブが開く (onEditPractice 呼び出し)
 *   [V-W-P03] 「ログ追加/編集」導線から PracticeTabModal の practiceLog タブが開く
 *   [V-W-P04] 「削除」ボタンで DeleteConfirmModal (共通コンポーネント) が表示され、
 *             確認/キャンセルで正しいコールバックのみが発火する (window.confirm は使わない)
 *   [V-W-P05/06 前提] 個別ログ削除ハンドラ (onDeletePracticeLog) が logId 付きで呼ばれる
 *
 * トートロジー防止メモ:
 *   PracticeDetails/AttendanceModal はスタブ化しているため、内部実装のコピーにはならない。
 *   検証しているのは PracticeDetailModal 自身が持つ状態遷移 (showDeleteConfirm 等) と props 中継のみ。
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi, beforeEach } from "vitest";
import messages from "@apps/shared/messages/ja.json";

// -----------------------------------------------------------------------
// ダッシュボード由来コンポーネントをスタブ化
// -----------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  practiceDetailsProps: [] as unknown[],
}));

vi.mock("@/app/[locale]/(authenticated)/dashboard/_components/DayDetailModal/components", () => ({
  PracticeDetails: (props: {
    onEdit?: (images?: unknown) => void;
    onDelete?: () => void;
    onAddPracticeLog?: () => void;
    onEditPracticeLog?: () => void;
    onDeletePracticeLog?: (logId: string) => void;
    onShowAttendance?: () => void;
  }) => {
    mocks.practiceDetailsProps.push(props);
    return (
      <div data-testid="practice-details-stub">
        <button onClick={() => props.onEdit?.()}>編集する</button>
        <button onClick={() => props.onDelete?.()}>練習を削除</button>
        <button onClick={() => props.onAddPracticeLog?.()}>ログを追加</button>
        <button onClick={() => props.onEditPracticeLog?.()}>ログを編集</button>
        <button onClick={() => props.onDeletePracticeLog?.("log-1")}>ログを削除</button>
        {props.onShowAttendance && <button onClick={() => props.onShowAttendance?.()}>出欠</button>}
      </div>
    );
  },
  AttendanceModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="attendance-modal-stub" /> : null,
}));

import PracticeDetailModal from "../PracticeDetailModal";

const renderModal = (overrides: Partial<React.ComponentProps<typeof PracticeDetailModal>> = {}) => {
  const props: React.ComponentProps<typeof PracticeDetailModal> = {
    isOpen: true,
    onClose: vi.fn(),
    practiceId: "practice-1",
    date: "2026-07-10",
    onEditPractice: vi.fn(),
    onDeletePractice: vi.fn(),
    onOpenPracticeLogTab: vi.fn(),
    onDeletePracticeLog: vi.fn(),
    ...overrides,
  };

  const rendered = render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <PracticeDetailModal {...props} />
    </NextIntlClientProvider>,
  );

  return { ...rendered, props };
};

describe("PracticeDetailModal", () => {
  beforeEach(() => {
    mocks.practiceDetailsProps.length = 0;
  });

  it("[V-W-P01] isOpen=false のとき何も描画しない", () => {
    renderModal({ isOpen: false });
    expect(screen.queryByTestId("practice-detail-page-modal")).not.toBeInTheDocument();
  });

  it("[V-W-P01] isOpen=true のとき詳細モーダルが表示される", () => {
    renderModal();
    expect(screen.getByTestId("practice-detail-page-modal")).toBeInTheDocument();
    expect(screen.getByTestId("practice-details-stub")).toBeInTheDocument();
  });

  it("[V-W-P02] 編集ボタンで onEditPractice が呼ばれる", async () => {
    const user = userEvent.setup();
    const { props } = renderModal();
    await user.click(screen.getByText("編集する"));
    expect(props.onEditPractice).toHaveBeenCalledTimes(1);
  });

  it("[V-W-P03] ログ追加・ログ編集どちらも onOpenPracticeLogTab を呼ぶ", async () => {
    const user = userEvent.setup();
    const { props } = renderModal();

    await user.click(screen.getByText("ログを追加"));
    expect(props.onOpenPracticeLogTab).toHaveBeenCalledTimes(1);

    await user.click(screen.getByText("ログを編集"));
    expect(props.onOpenPracticeLogTab).toHaveBeenCalledTimes(2);
  });

  it("[V-W-P05/06 前提] ログ削除ボタンは logId 付きで onDeletePracticeLog を呼ぶ", async () => {
    const user = userEvent.setup();
    const { props } = renderModal();
    await user.click(screen.getByText("ログを削除"));
    expect(props.onDeletePracticeLog).toHaveBeenCalledWith("log-1");
  });

  it("[V-W-P04] 削除ボタン押下で DeleteConfirmModal が表示される (window.confirm は使わない)", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
    renderModal();

    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    await user.click(screen.getByText("練習を削除"));

    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("[V-W-P04] DeleteConfirmModal で確認すると onDeletePractice が呼ばれ、ダイアログが閉じる", async () => {
    const user = userEvent.setup();
    const { props } = renderModal();

    await user.click(screen.getByText("練習を削除"));
    await user.click(within(screen.getByTestId("confirm-dialog")).getByTestId("confirm-delete-button"));

    expect(props.onDeletePractice).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
  });

  it("[V-W-P04] DeleteConfirmModal でキャンセルすると onDeletePractice は呼ばれず、ダイアログが閉じる", async () => {
    const user = userEvent.setup();
    const { props } = renderModal();

    await user.click(screen.getByText("練習を削除"));
    await user.click(within(screen.getByTestId("confirm-dialog")).getByTestId("cancel-delete-button"));

    expect(props.onDeletePractice).not.toHaveBeenCalled();
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
  });

  it("チーム練習でない場合、出欠ボタン (onShowAttendance) は渡されない", () => {
    renderModal({ isTeamPractice: false, teamId: null });
    expect(screen.queryByText("出欠")).not.toBeInTheDocument();
  });

  it("チーム練習かつ teamId がある場合、出欠ボタンから AttendanceModal を開ける", async () => {
    const user = userEvent.setup();
    renderModal({ isTeamPractice: true, teamId: "team-1" });

    expect(screen.queryByTestId("attendance-modal-stub")).not.toBeInTheDocument();
    await user.click(screen.getByText("出欠"));
    expect(screen.getByTestId("attendance-modal-stub")).toBeInTheDocument();
  });

  it("閉じるボタン (X) で onClose が呼ばれる", async () => {
    const user = userEvent.setup();
    const { props } = renderModal();
    await user.click(screen.getByTestId("modal-close-button"));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("フッターの「閉じる」ボタンでも onClose が呼ばれる", async () => {
    const user = userEvent.setup();
    const { props } = renderModal();
    await user.click(screen.getByText("閉じる"));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
