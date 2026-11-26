/**
 * RecordFeedbackArrivalPopup (web) — ダッシュボードの未読フィードバック通知
 * 仕様: docs/specs/record-feedback.md「受信ポップアップ」
 *
 *   - 未読があれば「手紙が届く」アニメーション → ポップアップ。タップでアニメーションを飛ばせる
 *   - reduce motion ではアニメーションを出さずにポップアップだけ出す
 *   - 「閉じる」は既読にせず、出ていた FB を sessionStorage に入れて同じセッション中は出さない
 *   - 編集された FB (updated_at が変わった) はもう一度出る
 *   - 「記録画面へ」は /competition?recordId=...&competitionId=... へ遷移する
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithI18n } from "@/__tests__/helpers/teamQueryTestUtils";
import type { UnreadRecordFeedback } from "@apps/shared/types/recordFeedback";

const mocks = vi.hoisted(() => ({
  unread: [] as unknown[],
  push: vi.fn(),
  reducedMotion: false,
}));

vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: { id: "player-1" }, supabase: {} }),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: class {
    getStyles = async () => [{ id: 2, name_jp: "50m自由形", distance: 50 }];
  },
}));

vi.mock("@apps/shared/hooks/queries/recordFeedbacks", () => ({
  useUnreadRecordFeedbacksQuery: () => ({ data: mocks.unread }),
}));

import RecordFeedbackArrivalPopup, {
  RECORD_FEEDBACK_ANIMATION_MS,
  RECORD_FEEDBACK_DISMISSED_STORAGE_KEY,
  buildRecordFeedbackHref,
} from "@/components/record-feedback/RecordFeedbackArrivalPopup";

function makeUnread(overrides: Partial<UnreadRecordFeedback> = {}): UnreadRecordFeedback {
  return {
    id: "fb-1",
    record_id: "rec-1",
    team_id: "team-1",
    author_id: "coach-1",
    author_name: "コーチA",
    updated_at: "2026-11-20T00:00:00Z",
    competition_id: "comp-1",
    competition_title: "秋季大会",
    competition_date: "2026-11-01",
    style_id: 2,
    time: 30.12,
    pool_type: 0,
    is_relaying: false,
    record_created_at: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  mocks.unread = [];
  mocks.reducedMotion = false;
  window.sessionStorage.clear();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("reduce") ? mocks.reducedMotion : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RecordFeedbackArrivalPopup", () => {
  it("未読が無ければ何も出さない", () => {
    const { container } = renderWithI18n(<RecordFeedbackArrivalPopup />);
    expect(container).toBeEmptyDOMElement();
  });

  it("未読があればアニメーションを出し、約3秒後にポップアップに切り替わる", async () => {
    vi.useFakeTimers();
    mocks.unread = [makeUnread()];
    renderWithI18n(<RecordFeedbackArrivalPopup />);
    expect(screen.getByTestId("record-feedback-arrival-animation")).toBeInTheDocument();
    expect(screen.queryByTestId("record-feedback-arrival-popup")).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(RECORD_FEEDBACK_ANIMATION_MS);
    });
    expect(screen.getByTestId("record-feedback-arrival-popup")).toBeInTheDocument();
  });

  it("アニメーションはタップで飛ばせる", () => {
    mocks.unread = [makeUnread()];
    renderWithI18n(<RecordFeedbackArrivalPopup />);
    fireEvent.click(screen.getByTestId("record-feedback-arrival-animation"));
    expect(screen.getByTestId("record-feedback-arrival-popup")).toBeInTheDocument();
  });

  it("reduce motion ではアニメーションを出さずにポップアップを出す", () => {
    mocks.reducedMotion = true;
    mocks.unread = [makeUnread()];
    renderWithI18n(<RecordFeedbackArrivalPopup />);
    expect(screen.queryByTestId("record-feedback-arrival-animation")).not.toBeInTheDocument();
    expect(screen.getByTestId("record-feedback-arrival-popup")).toBeInTheDocument();
  });

  it("送り主・大会名・種目・タイムを出す。退会者は「退会したユーザー」", async () => {
    mocks.reducedMotion = true;
    mocks.unread = [
      makeUnread(),
      makeUnread({ id: "fb-2", author_id: null, author_name: null, competition_title: null }),
    ];
    renderWithI18n(<RecordFeedbackArrivalPopup />);
    const items = screen.getAllByTestId("record-feedback-popup-item");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("コーチAさんからフィードバックが届きました");
    expect(items[0]).toHaveTextContent("秋季大会");
    expect(items[0]).toHaveTextContent("30.12");
    await waitFor(() => expect(items[0]).toHaveTextContent("50m自由形"));
    expect(items[1]).toHaveTextContent("退会したユーザーさんからフィードバックが届きました");
    expect(items[1]).toHaveTextContent("大会なし");
  });

  it("「閉じる」で出ていた FB を記録し、同じセッションでは再表示しない (既読にはしない)", () => {
    mocks.reducedMotion = true;
    mocks.unread = [makeUnread()];
    const first = renderWithI18n(<RecordFeedbackArrivalPopup />);
    fireEvent.click(screen.getByTestId("record-feedback-popup-close"));
    expect(screen.queryByTestId("record-feedback-arrival-popup")).not.toBeInTheDocument();
    expect(JSON.parse(window.sessionStorage.getItem(RECORD_FEEDBACK_DISMISSED_STORAGE_KEY)!)).toEqual([
      "fb-1:2026-11-20T00:00:00Z",
    ]);
    first.unmount();

    // ダッシュボードを開き直しても同じ FB では出ない
    const second = renderWithI18n(<RecordFeedbackArrivalPopup />);
    expect(second.container).toBeEmptyDOMElement();
    second.unmount();

    // 編集されて updated_at が変わったらもう一度出る
    mocks.unread = [makeUnread({ updated_at: "2026-11-22T00:00:00Z" })];
    renderWithI18n(<RecordFeedbackArrivalPopup />);
    expect(screen.getByTestId("record-feedback-arrival-popup")).toBeInTheDocument();
  });

  it("sessionStorage が壊れていても落ちずに表示する", () => {
    mocks.reducedMotion = true;
    window.sessionStorage.setItem(RECORD_FEEDBACK_DISMISSED_STORAGE_KEY, "{not json");
    mocks.unread = [makeUnread()];
    renderWithI18n(<RecordFeedbackArrivalPopup />);
    expect(screen.getByTestId("record-feedback-arrival-popup")).toBeInTheDocument();
  });

  it("「記録画面へ」で記録ページの該当記録へ遷移する", () => {
    mocks.reducedMotion = true;
    mocks.unread = [makeUnread()];
    renderWithI18n(<RecordFeedbackArrivalPopup />);
    fireEvent.click(screen.getByTestId("record-feedback-popup-go"));
    expect(mocks.push).toHaveBeenCalledWith("/competition?recordId=rec-1&competitionId=comp-1");
  });

  it("enabled=false の間は出さない", () => {
    mocks.reducedMotion = true;
    mocks.unread = [makeUnread()];
    const { container } = renderWithI18n(<RecordFeedbackArrivalPopup enabled={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("大会の無い記録では competitionId を付けない", () => {
    expect(buildRecordFeedbackHref(makeUnread({ competition_id: null }))).toBe(
      "/competition?recordId=rec-1",
    );
  });
});
