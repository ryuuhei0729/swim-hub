/**
 * RecordFeedbackSection / RecordFeedbackCountBadge / RecordFeedbackFormModal (web)
 * 仕様: docs/specs/record-feedback.md
 *
 * shared の React Query フックはモックし、コンポーネントが
 *   - 退会者・編集済みを正しく表示するか
 *   - 選手本人が未読を表示したときだけ既読化を1回呼ぶか
 *   - 自分の FB にだけ編集・削除を出すか
 *   - フォームが文字数を数え、エラーコードを文言に変換するか
 * を検証する。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithI18n } from "@/__tests__/helpers/teamQueryTestUtils";
import type { RecordFeedback } from "@apps/shared/types/recordFeedback";

const mocks = vi.hoisted(() => ({
  userId: "player-1",
  feedbacks: [] as unknown[],
  isPending: false,
  isError: false,
  markRead: vi.fn(),
  deleteMutateAsync: vi.fn(),
  createMutateAsync: vi.fn(),
  updateMutateAsync: vi.fn(),
}));

vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: { id: mocks.userId }, supabase: {} }),
}));

vi.mock("@apps/shared/hooks/queries/recordFeedbacks", () => ({
  useRecordFeedbacksQuery: () => ({
    data: mocks.isPending ? undefined : mocks.feedbacks,
    isPending: mocks.isPending,
    isError: mocks.isError,
  }),
  useMarkRecordFeedbacksReadMutation: () => ({ mutate: mocks.markRead }),
  useDeleteRecordFeedbackMutation: () => ({
    mutateAsync: mocks.deleteMutateAsync,
    isPending: false,
  }),
  useCreateRecordFeedbackMutation: () => ({
    mutateAsync: mocks.createMutateAsync,
    isPending: false,
  }),
  useUpdateRecordFeedbackMutation: () => ({
    mutateAsync: mocks.updateMutateAsync,
    isPending: false,
  }),
}));

import RecordFeedbackSection from "@/components/record-feedback/RecordFeedbackSection";
import RecordFeedbackCountBadge from "@/components/record-feedback/RecordFeedbackCountBadge";
import RecordFeedbackFormModal from "@/components/record-feedback/RecordFeedbackFormModal";

function makeFeedback(overrides: Partial<RecordFeedback> = {}): RecordFeedback {
  return {
    id: "fb-1",
    record_id: "rec-1",
    team_id: "team-1",
    recipient_id: "player-1",
    author_id: "coach-1",
    author_name: "コーチA",
    author_profile_image_path: null,
    content: "スタートが良かった",
    read_at: "2026-11-20T00:00:00Z",
    created_at: "2026-11-20T00:00:00Z",
    updated_at: "2026-11-20T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  mocks.userId = "player-1";
  mocks.feedbacks = [];
  mocks.isPending = false;
  mocks.isError = false;
});

describe("RecordFeedbackCountBadge", () => {
  it("0件・未指定のときは何も描画しない", () => {
    const { container, rerender } = renderWithI18n(<RecordFeedbackCountBadge count={0} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<RecordFeedbackCountBadge count={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("件数を「FB n件」で表示する", () => {
    renderWithI18n(<RecordFeedbackCountBadge count={2} />);
    expect(screen.getByTestId("record-feedback-count-badge")).toHaveTextContent("FB 2件");
  });
});

describe("RecordFeedbackSection", () => {
  it("0件で showWhenEmpty でなければ何も描画しない", () => {
    const { container } = renderWithI18n(<RecordFeedbackSection recordId="rec-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("書いた人が退会していれば「退会したユーザー」、編集されていれば「編集済み」を出す", () => {
    mocks.feedbacks = [
      makeFeedback({ author_id: null, author_name: null, updated_at: "2026-11-21T00:00:00Z" }),
    ];
    renderWithI18n(<RecordFeedbackSection recordId="rec-1" />);
    expect(screen.getByText("退会したユーザー")).toBeInTheDocument();
    expect(screen.getByTestId("record-feedback-edited")).toHaveTextContent("編集済み");
  });

  it("編集していなければ「編集済み」を出さない", () => {
    mocks.feedbacks = [makeFeedback()];
    renderWithI18n(<RecordFeedbackSection recordId="rec-1" />);
    expect(screen.getByText("コーチA")).toBeInTheDocument();
    expect(screen.queryByTestId("record-feedback-edited")).not.toBeInTheDocument();
  });

  it("選手本人が未読を表示したら、その記録の既読化を1回だけ呼ぶ", () => {
    mocks.feedbacks = [makeFeedback({ read_at: null })];
    const { rerender } = renderWithI18n(<RecordFeedbackSection recordId="rec-1" />);
    rerender(<RecordFeedbackSection recordId="rec-1" />);
    expect(mocks.markRead).toHaveBeenCalledTimes(1);
    expect(mocks.markRead).toHaveBeenCalledWith({ recordId: "rec-1" });
  });

  it("表示した時点で自分宛ての未読だった FB に「NEW」を出し、既読になった後もこの表示の間は出し続ける", () => {
    mocks.feedbacks = [
      makeFeedback({ id: "fb-new", read_at: null }),
      makeFeedback({ id: "fb-old", author_name: "コーチB" }),
    ];
    const { rerender } = renderWithI18n(<RecordFeedbackSection recordId="rec-1" />);
    const badges = screen.getAllByTestId("record-feedback-new-badge");
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent("NEW");
    expect(screen.getAllByTestId("record-feedback-item")[0]).toContainElement(badges[0]!);

    // 既読化が反映されて取り直された後も消えない
    mocks.feedbacks = [
      makeFeedback({ id: "fb-new", read_at: "2026-11-28T00:00:00Z" }),
      makeFeedback({ id: "fb-old", author_name: "コーチB" }),
    ];
    rerender(<RecordFeedbackSection recordId="rec-1" />);
    expect(screen.getAllByTestId("record-feedback-new-badge")).toHaveLength(1);
  });

  it("他人宛ての未読 (管理者が見たとき) には「NEW」を出さない", () => {
    mocks.userId = "coach-2";
    mocks.feedbacks = [makeFeedback({ read_at: null })];
    renderWithI18n(<RecordFeedbackSection recordId="rec-1" />);
    expect(screen.queryByTestId("record-feedback-new-badge")).not.toBeInTheDocument();
  });

  it("既読済みなら既読化を呼ばない", () => {
    mocks.feedbacks = [makeFeedback()];
    renderWithI18n(<RecordFeedbackSection recordId="rec-1" />);
    expect(mocks.markRead).not.toHaveBeenCalled();
  });

  it("選手本人でない (管理者が他人宛ての未読を見た) ときは既読化を呼ばない", () => {
    mocks.userId = "coach-2";
    mocks.feedbacks = [makeFeedback({ read_at: null })];
    renderWithI18n(<RecordFeedbackSection recordId="rec-1" />);
    expect(mocks.markRead).not.toHaveBeenCalled();
  });

  it("編集・削除ボタンは自分が書いた FB にだけ出る", () => {
    mocks.userId = "coach-1";
    mocks.feedbacks = [
      makeFeedback({ id: "fb-mine", author_id: "coach-1" }),
      makeFeedback({ id: "fb-other", author_id: "coach-2", author_name: "コーチB" }),
    ];
    renderWithI18n(<RecordFeedbackSection recordId="rec-1" />);
    expect(screen.getAllByTestId("record-feedback-edit-button")).toHaveLength(1);
    expect(screen.getAllByTestId("record-feedback-delete-button")).toHaveLength(1);
  });

  it("選手本人には編集・削除ボタンを出さない", () => {
    mocks.feedbacks = [makeFeedback()];
    renderWithI18n(<RecordFeedbackSection recordId="rec-1" />);
    expect(screen.queryByTestId("record-feedback-edit-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("record-feedback-delete-button")).not.toBeInTheDocument();
  });

  it("削除を確認すると自分の FB の削除を呼ぶ", async () => {
    mocks.userId = "coach-1";
    mocks.deleteMutateAsync.mockResolvedValue(undefined);
    mocks.feedbacks = [makeFeedback({ id: "fb-mine", author_id: "coach-1" })];
    renderWithI18n(<RecordFeedbackSection recordId="rec-1" />);
    fireEvent.click(screen.getByTestId("record-feedback-delete-button"));
    fireEvent.click(await screen.findByTestId("confirm-delete-button"));
    await waitFor(() =>
      expect(mocks.deleteMutateAsync).toHaveBeenCalledWith({ feedbackId: "fb-mine", recordId: "rec-1" }),
    );
  });
});

describe("RecordFeedbackFormModal", () => {
  it("空のときは送信できず、入力すると前後の空白を除いた文字数を数える", () => {
    renderWithI18n(<RecordFeedbackFormModal isOpen onClose={vi.fn()} recordId="rec-1" />);
    expect(screen.getByTestId("record-feedback-submit")).toBeDisabled();
    fireEvent.change(screen.getByTestId("record-feedback-textarea"), {
      target: { value: "  良い  " },
    });
    expect(screen.getByTestId("record-feedback-counter")).toHaveTextContent("2 / 1000");
    expect(screen.getByTestId("record-feedback-submit")).not.toBeDisabled();
  });

  it("1000文字を超えると送信できない", () => {
    renderWithI18n(<RecordFeedbackFormModal isOpen onClose={vi.fn()} recordId="rec-1" />);
    fireEvent.change(screen.getByTestId("record-feedback-textarea"), {
      target: { value: "あ".repeat(1001) },
    });
    expect(screen.getByTestId("record-feedback-submit")).toBeDisabled();
    expect(screen.getByText("1000文字以内で入力してください")).toBeInTheDocument();
  });

  it("作成に成功したら閉じる", async () => {
    const onClose = vi.fn();
    mocks.createMutateAsync.mockResolvedValue(undefined);
    renderWithI18n(<RecordFeedbackFormModal isOpen onClose={onClose} recordId="rec-1" />);
    fireEvent.change(screen.getByTestId("record-feedback-textarea"), {
      target: { value: "ターンが速い" },
    });
    fireEvent.click(screen.getByTestId("record-feedback-submit"));
    await waitFor(() =>
      expect(mocks.createMutateAsync).toHaveBeenCalledWith({ recordId: "rec-1", content: "ターンが速い" }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("重複 (23505) は専用の文言を出し、閉じない", async () => {
    const onClose = vi.fn();
    mocks.createMutateAsync.mockRejectedValue({ code: "23505", message: "duplicate key" });
    renderWithI18n(<RecordFeedbackFormModal isOpen onClose={onClose} recordId="rec-1" />);
    fireEvent.change(screen.getByTestId("record-feedback-textarea"), { target: { value: "x" } });
    fireEvent.click(screen.getByTestId("record-feedback-submit"));
    expect(
      await screen.findByText("この記録にはすでにフィードバックを書いています"),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("編集モードでは既存の本文を初期値にし、更新を呼ぶ", async () => {
    mocks.updateMutateAsync.mockResolvedValue(undefined);
    renderWithI18n(
      <RecordFeedbackFormModal
        isOpen
        onClose={vi.fn()}
        recordId="rec-1"
        feedback={{ id: "fb-1", content: "元の本文" }}
      />,
    );
    const textarea = screen.getByTestId("record-feedback-textarea") as HTMLTextAreaElement;
    expect(textarea.value).toBe("元の本文");
    fireEvent.change(textarea, { target: { value: "書き直し" } });
    fireEvent.click(screen.getByTestId("record-feedback-submit"));
    await waitFor(() =>
      expect(mocks.updateMutateAsync).toHaveBeenCalledWith({
        feedbackId: "fb-1",
        recordId: "rec-1",
        content: "書き直し",
      }),
    );
  });
});
