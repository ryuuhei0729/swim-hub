/**
 * CompetitionDetailModal テスト
 *
 * /competition 履歴タブの行クリックで開く詳細モーダル。ダッシュボード由来の
 * CompetitionDetails (mode="record") / CompetitionWithEntry (mode="entry") /
 * AttendanceModal / DeleteConfirmModal をそのまま再利用するラッパーであるため、
 * CompetitionDetails / CompetitionWithEntry / AttendanceModal は薄いスタブに
 * 差し替え、「配線」と DeleteConfirmModal (実物) の連携のみを検証する。
 *
 * Sprint Contract 検証観点:
 *   [V-W-C01] mode="record" のとき CompetitionDetails が表示される
 *   [V-W-C02] 「編集」導線から CompetitionTabModal の competition タブが開く (onEditCompetition)
 *   [V-W-C03] 「記録追加/編集」導線から CompetitionTabModal の record タブが開く (onOpenRecordTab)
 *   [V-W-C04] 大会削除ボタンで DeleteConfirmModal が表示され、確認/キャンセルが正しく発火する
 *   [V-W-C05] mode="entry" のとき CompetitionWithEntry が表示される (エントリー済み・記録未登録)
 *   [V-W-C06] entry モードの「エントリー編集」から onOpenEntryTab が呼ばれる
 *   [V-W-C07] 記録の削除 (onDeleteRecord) は DeleteConfirmModal を経由せず即時に発火する (確認なし)
 *   [V-W-C08] エントリー削除は DeleteConfirmModal 経由で確認される
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi, beforeEach } from "vitest";
import messages from "@apps/shared/messages/ja.json";

vi.mock("@/app/[locale]/(authenticated)/dashboard/_components/DayDetailModal/components", () => ({
  CompetitionDetails: (props: {
    onEdit?: (images?: unknown) => void;
    onDelete?: () => void;
    onAddRecord?: () => void;
    onEditRecord?: (record: unknown) => void;
    onDeleteRecord?: (recordId: string) => void;
  }) => (
    <div data-testid="competition-details-stub">
      <button onClick={() => props.onEdit?.()}>大会を編集</button>
      <button onClick={() => props.onDelete?.()}>大会を削除</button>
      <button onClick={() => props.onAddRecord?.()}>記録を追加</button>
      <button onClick={() => props.onEditRecord?.({ id: "record-1" })}>記録を編集</button>
      <button onClick={() => props.onDeleteRecord?.("record-1")}>記録を削除(確認なし)</button>
    </div>
  ),
  CompetitionWithEntry: (props: {
    competitionName: string;
    onAddRecord?: () => void;
    onEditCompetition?: (images?: unknown) => void;
    onDeleteCompetition?: () => void;
    onEditEntry?: () => void;
    onDeleteEntry?: (entryId: string) => void;
  }) => (
    <div data-testid="competition-with-entry-stub">
      <span data-testid="entry-competition-name">{props.competitionName}</span>
      <button onClick={() => props.onAddRecord?.()}>記録を追加(entry)</button>
      <button onClick={() => props.onEditCompetition?.()}>大会を編集(entry)</button>
      <button onClick={() => props.onDeleteCompetition?.()}>大会を削除(entry)</button>
      <button onClick={() => props.onEditEntry?.()}>エントリーを編集</button>
      <button onClick={() => props.onDeleteEntry?.("entry-1")}>エントリーを削除</button>
    </div>
  ),
  AttendanceModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="attendance-modal-stub" /> : null,
}));

import CompetitionDetailModal from "../CompetitionDetailModal";

type Props = React.ComponentProps<typeof CompetitionDetailModal>;

const renderModal = (overrides: Partial<Props> = {}) => {
  const props: Props = {
    isOpen: true,
    onClose: vi.fn(),
    mode: "record",
    competitionId: "comp-1",
    date: "2026-07-10",
    onEditCompetition: vi.fn(),
    onDeleteCompetition: vi.fn(),
    onOpenRecordTab: vi.fn(),
    onOpenEntryTab: vi.fn(),
    onDeleteRecord: vi.fn(),
    onDeleteEntry: vi.fn(),
    ...overrides,
  };

  const rendered = render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <CompetitionDetailModal {...props} />
    </NextIntlClientProvider>,
  );

  return { ...rendered, props };
};

describe("CompetitionDetailModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("mode=record", () => {
    it("[V-W-C01] CompetitionDetails が表示される", () => {
      renderModal({ mode: "record" });
      expect(screen.getByTestId("record-detail-page-modal")).toBeInTheDocument();
      expect(screen.getByTestId("competition-details-stub")).toBeInTheDocument();
      expect(screen.queryByTestId("competition-with-entry-stub")).not.toBeInTheDocument();
    });

    it("[V-W-C02] 編集ボタンで onEditCompetition が呼ばれる", async () => {
      const user = userEvent.setup();
      const { props } = renderModal({ mode: "record" });
      await user.click(screen.getByText("大会を編集"));
      expect(props.onEditCompetition).toHaveBeenCalledTimes(1);
    });

    it("[V-W-C03] 記録の追加・編集はどちらも onOpenRecordTab を呼ぶ", async () => {
      const user = userEvent.setup();
      const { props } = renderModal({ mode: "record" });

      await user.click(screen.getByText("記録を追加"));
      expect(props.onOpenRecordTab).toHaveBeenCalledTimes(1);

      await user.click(screen.getByText("記録を編集"));
      expect(props.onOpenRecordTab).toHaveBeenCalledTimes(2);
    });

    it("[V-W-C07] 記録削除ボタンは確認モーダルを経由せず即時に onDeleteRecord を呼ぶ", async () => {
      const user = userEvent.setup();
      const { props } = renderModal({ mode: "record" });

      await user.click(screen.getByText("記録を削除(確認なし)"));

      expect(props.onDeleteRecord).toHaveBeenCalledWith("record-1");
      expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    });

    it("[V-W-C04] 大会削除ボタンで DeleteConfirmModal が表示され、確認で onDeleteCompetition が呼ばれる", async () => {
      const user = userEvent.setup();
      const { props } = renderModal({ mode: "record" });

      await user.click(screen.getByText("大会を削除"));
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();

      await user.click(within(screen.getByTestId("confirm-dialog")).getByTestId("confirm-delete-button"));
      expect(props.onDeleteCompetition).toHaveBeenCalledTimes(1);
      expect(props.onDeleteEntry).not.toHaveBeenCalled();
      expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    });

    it("[V-W-C04] 大会削除の確認モーダルでキャンセルすると onDeleteCompetition は呼ばれない", async () => {
      const user = userEvent.setup();
      const { props } = renderModal({ mode: "record" });

      await user.click(screen.getByText("大会を削除"));
      await user.click(within(screen.getByTestId("confirm-dialog")).getByTestId("cancel-delete-button"));

      expect(props.onDeleteCompetition).not.toHaveBeenCalled();
      expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    });
  });

  describe("mode=entry (エントリー済み・記録未登録)", () => {
    it("[V-W-C05] CompetitionWithEntry が表示される", () => {
      renderModal({
        mode: "entry",
        entryId: "entry-1",
        styleId: 2,
        styleName: "50m自由形",
        competitionName: "テスト大会",
      });
      expect(screen.getByTestId("competition-with-entry-stub")).toBeInTheDocument();
      expect(screen.queryByTestId("competition-details-stub")).not.toBeInTheDocument();
      expect(screen.getByTestId("entry-competition-name")).toHaveTextContent("テスト大会");
    });

    it("competitionName 未指定時は既定の大会名にフォールバックする", () => {
      renderModal({ mode: "entry", entryId: "entry-1", competitionName: undefined });
      expect(screen.getByTestId("entry-competition-name")).toHaveTextContent("大会");
    });

    it("[V-W-C06] 「エントリーを編集」で onOpenEntryTab が呼ばれる", async () => {
      const user = userEvent.setup();
      const { props } = renderModal({ mode: "entry", entryId: "entry-1" });
      await user.click(screen.getByText("エントリーを編集"));
      expect(props.onOpenEntryTab).toHaveBeenCalledTimes(1);
    });

    it("[V-W-C03] entry モードの「記録を追加」でも onOpenRecordTab が呼ばれる", async () => {
      const user = userEvent.setup();
      const { props } = renderModal({ mode: "entry", entryId: "entry-1" });
      await user.click(screen.getByText("記録を追加(entry)"));
      expect(props.onOpenRecordTab).toHaveBeenCalledTimes(1);
    });

    it("[V-W-C08] エントリー削除は DeleteConfirmModal 経由で確認され、確認後 onDeleteEntry(entryId) が呼ばれる", async () => {
      const user = userEvent.setup();
      const { props } = renderModal({ mode: "entry", entryId: "entry-1" });

      await user.click(screen.getByText("エントリーを削除"));
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();

      await user.click(within(screen.getByTestId("confirm-dialog")).getByTestId("confirm-delete-button"));
      expect(props.onDeleteEntry).toHaveBeenCalledWith("entry-1");
      expect(props.onDeleteCompetition).not.toHaveBeenCalled();
    });

    it("entry モードの大会削除 (onDeleteCompetition) も DeleteConfirmModal 経由になる", async () => {
      const user = userEvent.setup();
      const { props } = renderModal({ mode: "entry", entryId: "entry-1" });

      await user.click(screen.getByText("大会を削除(entry)"));
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();

      await user.click(within(screen.getByTestId("confirm-dialog")).getByTestId("confirm-delete-button"));
      expect(props.onDeleteCompetition).toHaveBeenCalledTimes(1);
      expect(props.onDeleteEntry).not.toHaveBeenCalled();
    });
  });

  it("isOpen=false のとき何も描画しない", () => {
    renderModal({ isOpen: false });
    expect(screen.queryByTestId("record-detail-page-modal")).not.toBeInTheDocument();
  });

  it("閉じるボタン (X) で onClose が呼ばれる", async () => {
    const user = userEvent.setup();
    const { props } = renderModal();
    await user.click(screen.getByTestId("modal-close-button"));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
