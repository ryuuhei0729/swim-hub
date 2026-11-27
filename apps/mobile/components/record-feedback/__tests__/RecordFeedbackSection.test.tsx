// =============================================================================
// RecordFeedbackSection: 記録1件の FB 一覧
// 仕様: docs/specs/record-feedback.md
//   - 個人の記録 (team_id なし) には何も出さない
//   - 書いた人が退会済み (author_name null) なら「退会したユーザー」
//   - updated_at > created_at なら「編集済み」
//   - 選手本人が表示したら、自分宛ての未読を1回だけ既読にする
//   - 書いた本人 (管理者) にだけ編集・削除を出す
//   - 管理者ビューで、まだ書いていない他人の記録なら「FBを書く」
// =============================================================================

import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordFeedback } from "@swim-hub/shared/types";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  feedbacks: [] as unknown[],
  markRead: vi.fn(),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: mocks.useAuth,
}));

vi.mock("@apps/shared/hooks/queries/recordFeedbacks", () => ({
  useRecordFeedbacksQuery: () => ({
    data: mocks.feedbacks,
    isLoading: false,
    isError: false,
  }),
  useMarkRecordFeedbacksReadMutation: () => ({ mutate: mocks.markRead }),
  useDeleteRecordFeedbackMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateRecordFeedbackMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateRecordFeedbackMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { RecordFeedbackSection, isRecordFeedbackEdited } from "../RecordFeedbackSection";

/** RN の accessibilityLabel はモックでは DOM 属性 accessibilitylabel になる */
const byA11yLabel = (label: string) =>
  document.querySelector(`[accessibilitylabel="${label}"]`);

const ME = "user-me";
const ADMIN = "user-admin";

function feedback(overrides: Partial<RecordFeedback>): RecordFeedback {
  return {
    id: "fb-1",
    record_id: "rec-1",
    team_id: "team-1",
    recipient_id: ME,
    author_id: ADMIN,
    author_name: "コーチ山田",
    author_profile_image_path: null,
    content: "スタートが良かった",
    read_at: "2026-11-26T10:00:00Z",
    created_at: "2026-11-26T09:00:00Z",
    updated_at: "2026-11-26T09:00:00Z",
    ...overrides,
  };
}

describe("RecordFeedbackSection", () => {
  beforeEach(() => {
    mocks.feedbacks = [];
    mocks.markRead.mockReset();
    mocks.useAuth.mockReturnValue({ supabase: {}, user: { id: ME } });
  });

  it("個人の記録 (teamId null) には何も出さない", () => {
    mocks.feedbacks = [feedback({})];
    const { container } = render(<RecordFeedbackSection recordId="rec-1" teamId={null} />);
    expect(container.textContent).toBe("");
  });

  it("FB が無く書けもしないなら何も出さない", () => {
    const { container } = render(<RecordFeedbackSection recordId="rec-1" teamId="team-1" />);
    expect(container.textContent).toBe("");
  });

  it("書いた人・本文・編集済みを表示し、退会者は「退会したユーザー」", () => {
    mocks.feedbacks = [
      feedback({ id: "fb-1", updated_at: "2026-11-26T11:00:00Z" }),
      feedback({ id: "fb-2", author_id: null, author_name: null, content: "ターンを意識" }),
    ];
    render(<RecordFeedbackSection recordId="rec-1" teamId="team-1" recordOwnerId={ME} />);
    expect(screen.getByText("コーチ山田")).toBeTruthy();
    expect(screen.getByText("スタートが良かった")).toBeTruthy();
    expect(screen.getByText("退会したユーザー")).toBeTruthy();
    expect(screen.getByText(/編集済み/)).toBeTruthy();
    // 選手本人には編集・削除を出さない
    expect(byA11yLabel("フィードバックを編集")).toBeNull();
    expect(byA11yLabel("削除")).toBeNull();
  });

  it("自分宛ての未読があれば1回だけ既読にする", () => {
    mocks.feedbacks = [feedback({ read_at: null })];
    const { rerender } = render(
      <RecordFeedbackSection recordId="rec-1" teamId="team-1" recordOwnerId={ME} />,
    );
    rerender(<RecordFeedbackSection recordId="rec-1" teamId="team-1" recordOwnerId={ME} />);
    expect(mocks.markRead).toHaveBeenCalledTimes(1);
    expect(mocks.markRead.mock.calls[0]?.[0]).toEqual({ recordId: "rec-1" });
    expect(screen.getByText("NEW")).toBeTruthy();
  });

  it("管理者が見ても (自分宛てではない) 既読にしない", () => {
    mocks.useAuth.mockReturnValue({ supabase: {}, user: { id: ADMIN } });
    mocks.feedbacks = [feedback({ read_at: null })];
    render(<RecordFeedbackSection recordId="rec-1" teamId="team-1" recordOwnerId={ME} canWrite />);
    expect(mocks.markRead).not.toHaveBeenCalled();
  });

  it("書いた本人には編集・削除を出し、書き込み済みなら「FBを書く」は出さない", () => {
    mocks.useAuth.mockReturnValue({ supabase: {}, user: { id: ADMIN } });
    mocks.feedbacks = [feedback({})];
    render(<RecordFeedbackSection recordId="rec-1" teamId="team-1" recordOwnerId={ME} canWrite />);
    expect(byA11yLabel("フィードバックを編集")).not.toBeNull();
    expect(byA11yLabel("削除")).not.toBeNull();
    expect(screen.queryByText("FBを書く")).toBeNull();
  });

  it("管理者ビューで、まだ書いていない他人の記録なら「FBを書く」", () => {
    mocks.useAuth.mockReturnValue({ supabase: {}, user: { id: ADMIN } });
    render(<RecordFeedbackSection recordId="rec-1" teamId="team-1" recordOwnerId={ME} canWrite />);
    expect(screen.getByText("FBを書く")).toBeTruthy();
  });

  it("自分の記録には管理者でも「FBを書く」を出さない", () => {
    mocks.useAuth.mockReturnValue({ supabase: {}, user: { id: ADMIN } });
    const { container } = render(
      <RecordFeedbackSection recordId="rec-1" teamId="team-1" recordOwnerId={ADMIN} canWrite />,
    );
    expect(container.textContent).toBe("");
  });
});

describe("isRecordFeedbackEdited", () => {
  it("updated_at が created_at より後なら true", () => {
    expect(
      isRecordFeedbackEdited({ created_at: "2026-11-26T09:00:00Z", updated_at: "2026-11-26T09:00:01Z" }),
    ).toBe(true);
  });
  it("同じなら false、不正な日付も false", () => {
    expect(
      isRecordFeedbackEdited({ created_at: "2026-11-26T09:00:00Z", updated_at: "2026-11-26T09:00:00Z" }),
    ).toBe(false);
    expect(isRecordFeedbackEdited({ created_at: "x", updated_at: "y" })).toBe(false);
  });
});
