// =============================================================================
// RecordFeedbackArrivalHost: 受信ポップアップの出し直しの扱い
// 仕様: docs/specs/record-feedback.md「受信ポップアップ（ダッシュボード）」
//   - 「閉じる」: 同じセッション中は、閉じたときに出ていた FB では再表示しない
//   - 「記録画面へ」: 一緒に出ていた他の FB は閉じた扱いにしない。開かなかった未読は
//     次にダッシュボードを開いたときにまた出す (web と同じ。swimhub-tasks#92)
// =============================================================================

import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UnreadRecordFeedback } from "@swim-hub/shared/types";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  unread: [] as unknown[],
  // useFocusEffect に渡されたコールバック。テストから「ダッシュボードに戻った」を起こす
  focusCallback: null as null | (() => void | (() => void)),
  blur: null as null | (() => void),
}));

vi.mock("@react-navigation/native", async () => {
  const React = await import("react");
  return {
    useNavigation: () => ({ navigate: mocks.navigate }),
    useFocusEffect: (callback: () => void | (() => void)) => {
      mocks.focusCallback = callback;
      React.useEffect(() => {
        const cleanup = callback();
        mocks.blur = typeof cleanup === "function" ? cleanup : null;
        // 初回フォーカスだけを起こす。以降はテストから明示的に起こす
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
    },
  };
});
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: {}, user: { id: "user-1" } }),
}));
vi.mock("@apps/shared/hooks/queries/recordFeedbacks", () => ({
  useUnreadRecordFeedbacksQuery: () => ({ data: mocks.unread }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [] }),
}));
// ポップアップ本体はこのテストの対象外。項目ごとの「記録画面へ」と「閉じる」だけを持つ代わりを置く
vi.mock("../RecordFeedbackArrivalPopup", () => ({
  RecordFeedbackArrivalPopup: ({
    feedbacks,
    onClose,
    onOpenRecord,
  }: {
    feedbacks: UnreadRecordFeedback[];
    onClose: () => void;
    onOpenRecord: (feedback: UnreadRecordFeedback) => void;
  }) => (
    <div data-testid="popup">
      {feedbacks.map((f) => (
        <button key={f.id} type="button" onClick={() => onOpenRecord(f)}>
          {`open-${f.id}`}
        </button>
      ))}
      <button type="button" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

import { RecordFeedbackArrivalHost } from "../RecordFeedbackArrivalHost";
import { resetDismissedFeedbacksForTest } from "../dismissedFeedbacks";

const item = (id: string): UnreadRecordFeedback => ({
  id,
  record_id: `rec-${id}`,
  team_id: "team-1",
  author_id: "admin-1",
  author_name: "コーチ山田",
  updated_at: "2026-11-26T09:00:00Z",
  competition_id: "comp-1",
  competition_title: "秋季大会",
  competition_date: "2026-11-20",
  style_id: 1,
  time: 61.23,
  pool_type: 0,
  is_relaying: false,
  record_created_at: "2026-11-20T09:00:00Z",
});

/** ダッシュボードから離れて、また戻ってきた状態にする */
function refocus() {
  act(() => {
    mocks.blur?.();
    const cleanup = mocks.focusCallback?.();
    mocks.blur = typeof cleanup === "function" ? cleanup : null;
  });
}

beforeEach(() => {
  resetDismissedFeedbacksForTest();
  mocks.navigate.mockReset();
  mocks.unread = [item("fb-1"), item("fb-2")];
  mocks.focusCallback = null;
  mocks.blur = null;
});

describe("RecordFeedbackArrivalHost", () => {
  it("「記録画面へ」で進んでも他の FB は閉じた扱いにせず、次にダッシュボードを開いたときにまた出す", () => {
    render(<RecordFeedbackArrivalHost enabled />);
    expect(screen.getByText("open-fb-2")).toBeTruthy();

    fireEvent.click(screen.getByText("open-fb-1"));
    expect(mocks.navigate).toHaveBeenCalledWith(
      "MainTabs",
      expect.objectContaining({ screen: "Records" }),
    );
    // 記録画面へ移る間は出し直さない
    expect(screen.queryByTestId("popup")).toBeNull();

    // 開いた fb-1 は記録画面で既読になった。開かなかった fb-2 は戻ってきたときにまた出る
    mocks.unread = [item("fb-2")];
    refocus();
    expect(screen.getByText("open-fb-2")).toBeTruthy();
    expect(screen.queryByText("open-fb-1")).toBeNull();
  });

  it("「閉じる」を押した FB は、同じセッション中は戻ってきても出さない", () => {
    render(<RecordFeedbackArrivalHost enabled />);
    fireEvent.click(screen.getByText("close"));
    expect(screen.queryByTestId("popup")).toBeNull();

    mocks.unread = [item("fb-1"), item("fb-2")];
    refocus();
    expect(screen.queryByTestId("popup")).toBeNull();
  });
});
