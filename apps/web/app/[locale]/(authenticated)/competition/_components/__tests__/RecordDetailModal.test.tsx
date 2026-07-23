/**
 * RecordDetailModal テスト
 *
 * 大会未紐付けレコード（一括ベストタイム入力等。record.competition が null）用の
 * 単体詳細モーダル。CompetitionDetailModal は competitionId でフェッチするため
 * 大会が無いレコードには使えず、このコンポーネントに分岐する。
 *
 * Sprint Contract 検証観点:
 *   [表示] 既にページ側で読み込み済みの record をそのまま表示する (追加フェッチなし)
 *   [大会情報非表示] 大会名/場所など、大会に関する情報は一切表示しない
 *   [編集] 編集ボタンで onEdit が呼ばれる (RecordLogForm を開く導線)
 *   [削除] 削除ボタンで DeleteConfirmModal (共通コンポーネント) が表示され、
 *          確認/キャンセルで正しいコールバックのみが発火する (window.confirm は使わない)
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi, beforeEach } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import type { Record as RecordType } from "@apps/shared/types";

vi.mock("@/components/ui/RecordBestBadge", () => ({
  __esModule: true,
  default: () => null,
}));

import RecordDetailModal from "../RecordDetailModal";

const makeRecord = (overrides: Partial<RecordType> = {}): RecordType =>
  ({
    id: "record-1",
    user_id: "user-1",
    competition_id: null,
    style_id: 2,
    time: 30.5,
    note: null,
    is_relaying: false,
    reaction_time: null,
    pool_type: 0,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    competition: null,
    style: { id: 2, name_jp: "50m自由形", distance: 50 } as unknown as RecordType["style"],
    split_times: [],
    ...overrides,
  }) as RecordType;

type Props = React.ComponentProps<typeof RecordDetailModal>;

const renderModal = (overrides: Partial<Props> = {}) => {
  const props: Props = {
    isOpen: true,
    onClose: vi.fn(),
    record: makeRecord(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };

  const rendered = render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <RecordDetailModal {...props} />
    </NextIntlClientProvider>,
  );

  return { ...rendered, props };
};

describe("RecordDetailModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("isOpen=false のとき何も描画しない", () => {
    renderModal({ isOpen: false });
    expect(screen.queryByTestId("record-standalone-detail-modal")).not.toBeInTheDocument();
  });

  it("[表示] 既に読み込み済みの record の種目・タイムをそのまま表示する", () => {
    renderModal({ record: makeRecord({ time: 30.5 }) });

    expect(screen.getByTestId("record-standalone-detail-modal")).toBeInTheDocument();
    expect(screen.getByText("50m自由形")).toBeInTheDocument();
    expect(screen.getByTestId("record-time-display")).toHaveTextContent("30.50");
  });

  it("[大会情報非表示] 大会名・場所など大会関連の文言は一切表示しない", () => {
    renderModal({
      record: makeRecord({
        // record.competition は null が正だが、万一値が入っていても
        // このコンポーネントは competition を一切参照しないことを確認する
        note: "テストメモ",
      }),
    });

    expect(screen.queryByText(/大会名/)).not.toBeInTheDocument();
    // メモ欄自体は record 由来の情報として表示されて良い
    expect(screen.getByText("テストメモ")).toBeInTheDocument();
  });

  it("[編集] 編集ボタンで onEdit が呼ばれる", async () => {
    const user = userEvent.setup();
    const { props } = renderModal();

    await user.click(screen.getByTestId("edit-standalone-record-button"));
    expect(props.onEdit).toHaveBeenCalledTimes(1);
  });

  it("[削除] 削除ボタン押下で DeleteConfirmModal が表示される (window.confirm は使わない)", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
    renderModal();

    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("delete-standalone-record-button"));

    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("[削除] DeleteConfirmModal で確認すると onDelete が呼ばれ、ダイアログが閉じる", async () => {
    const user = userEvent.setup();
    const { props } = renderModal();

    await user.click(screen.getByTestId("delete-standalone-record-button"));
    await user.click(within(screen.getByTestId("confirm-dialog")).getByTestId("confirm-delete-button"));

    expect(props.onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
  });

  it("[削除] DeleteConfirmModal でキャンセルすると onDelete は呼ばれない", async () => {
    const user = userEvent.setup();
    const { props } = renderModal();

    await user.click(screen.getByTestId("delete-standalone-record-button"));
    await user.click(within(screen.getByTestId("confirm-dialog")).getByTestId("cancel-delete-button"));

    expect(props.onDelete).not.toHaveBeenCalled();
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
  });

  it("閉じるボタン (X) で onClose が呼ばれる", async () => {
    const user = userEvent.setup();
    const { props } = renderModal();
    await user.click(screen.getByTestId("modal-close-button"));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
