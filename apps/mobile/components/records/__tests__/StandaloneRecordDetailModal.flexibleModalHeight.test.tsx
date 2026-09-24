// =============================================================================
// StandaloneRecordDetailModal.flexibleModalHeight.test.tsx
// [QA Sprint Contract Phase A — 取りこぼし修正] 記録モーダルの縦幅フレキシブル化の亜種
// =============================================================================
//
// 【背景】
// DayDetailModal (Deliverable #1) と同じ余白バグが、大会未紐付けレコード
// (一括ベストタイム入力等。record.competition が null) の行タップ時に開く
// StandaloneRecordDetailModal (Deliverable #2) にも存在する。
// 分岐元は RecordsScreen.tsx:558-570 の handleRecordPress。
//
// 【PM 設計判断 (契約)】
//   - StandaloneRecordDetailModal.tsx の localStyles.modalContent = { minHeight: 260 } を撤去する。
//   - このコンポーネントは dayDetailStyles.body / dayDetailStyles.bodyContent を直接 import して
//     使っているため、DayDetailModal.flexibleModalHeight.test.tsx 側 (V-FLEX-01/02/03) の
//     styles.ts 修正がそのまま効く。二重管理にはなっていないので、body/bodyContent の
//     個別修正はこのファイルでは不要 (styles.ts 側のテストで既に担保済み)。
//     ここで検証するのは、このコンポーネント固有の追加オーバーライド (localStyles.modalContent)
//     が消えているかどうかのみ。
//
// 【jsdom の限界 (誤魔化さず明記する)】
// DayDetailModal.flexibleModalHeight.test.tsx と同じ限界がそのまま当てはまる。
// 「大会未紐付け記録1件で開いたときに余白が出ないか」は jsdom では検証不能であり、
// 実機/シミュレータでの目視確認が別途必須 (V-FLEX-11)。
// 本テストで担保できるのは「modalContent に inline の minHeight が注入されていないこと」
// という構造的性質のみ。
//
// 【トートロジー防止メモ】
// 期待値は PM 設計判断から導出したものであり、StandaloneRecordDetailModal.tsx の diff
// (Phase A 時点では Developer 未着手) を読んでコピーしたものではない。
// =============================================================================

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RecordWithDetails } from "@swim-hub/shared/types";
import { StandaloneRecordDetailModal } from "../StandaloneRecordDetailModal";

vi.mock("@/components/calendar/DayDetailModal/components", () => ({
  RecordCard: () => <div data-testid="record-card-stub" />,
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

/** modalContent (最外周の白いカード View) を、閉じるボタンのアイコンから2階層遡って取得する */
function getModalContentElement(): HTMLElement {
  const closeIcon = screen.getByTestId("icon-x");
  const closeButton = closeIcon.closest("button");
  if (!closeButton) throw new Error("close button not found");
  const header = closeButton.parentElement;
  if (!header) throw new Error("header not found");
  const modalContent = header.parentElement;
  if (!modalContent) throw new Error("modalContent not found");
  return modalContent;
}

describe("[V-FLEX-10] StandaloneRecordDetailModal が固定 minHeight を注入しない", () => {
  it("モーダル外周 View の inline style に minHeight が設定されていない", () => {
    render(
      <StandaloneRecordDetailModal
        visible
        record={makeRecord()}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const modalContent = getModalContentElement();
    expect(modalContent.style.minHeight).toBe("");
  });
});
