// =============================================================================
// StandaloneRecordDetailModal.test.tsx
// =============================================================================
//
// 大会未紐付けレコード（一括ベストタイム入力等）単体の詳細モーダル。
// DayDetailModal の RecordCard を再利用しつつ、大会情報を一切表示しない
// ラッパーであるため、RecordCard は薄いスタブに差し替え「配線」のみを検証する。
//
// Sprint Contract 検証観点:
//   [表示] visible=false / record=null のとき何も描画しない
//   [ラベル表示] ヘッダーに種目名 + 「(一括入力)」ラベルが表示される
//   [編集] onEdit(record) が呼ばれる (RecordCard の onEditRecord 経由)
//   [削除] onDelete(recordId) が呼ばれる (RecordCard の onDeleteRecord 経由。
//          Alert.alert による確認は呼び出し元 RecordsScreen 側の責務)

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RecordWithDetails } from "@swim-hub/shared/types";
import { StandaloneRecordDetailModal } from "../StandaloneRecordDetailModal";

vi.mock("@/components/calendar/DayDetailModal/components", () => ({
  RecordCard: (props: {
    onEditRecord: () => void;
    onDeleteRecord: (recordId: string) => void;
  }) => (
    <div>
      <button onClick={() => props.onEditRecord()}>編集する</button>
      <button onClick={() => props.onDeleteRecord("record-1")}>削除する</button>
    </div>
  ),
}));

const makeRecord = (overrides: Partial<RecordWithDetails> = {}): RecordWithDetails =>
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
    style: { id: 2, name_jp: "50m自由形", distance: 50 },
    split_times: [],
    ...overrides,
  }) as unknown as RecordWithDetails;

describe("StandaloneRecordDetailModal", () => {
  it("record が null の場合は何も描画しない", () => {
    const { container } = render(
      <StandaloneRecordDetailModal
        visible={true}
        record={null}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("[ラベル表示] ヘッダーに種目名と「(一括入力)」ラベルが表示され、大会名は表示されない", () => {
    render(
      <StandaloneRecordDetailModal
        visible={true}
        record={makeRecord()}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("50m自由形")).toBeDefined();
    expect(screen.getByText(/一括入力/)).toBeDefined();
  });

  it("[編集] RecordCard の編集ボタンから onEdit(record) が呼ばれる", () => {
    const onEdit = vi.fn();
    const record = makeRecord();
    render(
      <StandaloneRecordDetailModal
        visible={true}
        record={record}
        onClose={vi.fn()}
        onEdit={onEdit}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("編集する"));
    expect(onEdit).toHaveBeenCalledWith(record);
  });

  it("[削除] RecordCard の削除ボタンから onDelete(recordId) が呼ばれる", () => {
    const onDelete = vi.fn();
    render(
      <StandaloneRecordDetailModal
        visible={true}
        record={makeRecord()}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByText("削除する"));
    expect(onDelete).toHaveBeenCalledWith("record-1");
  });

  it("閉じるボタンで onClose が呼ばれる", () => {
    const onClose = vi.fn();
    render(
      <StandaloneRecordDetailModal
        visible={true}
        record={makeRecord()}
        onClose={onClose}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    // ヘッダーの閉じるボタンは Feather "x" アイコン (テキストを持たない) のため
    // モック済みアイコンの testid 経由でクリックする (クリックは親 Pressable にバブルする)
    fireEvent.click(screen.getByTestId("icon-x"));
    expect(onClose).toHaveBeenCalled();
  });
});
