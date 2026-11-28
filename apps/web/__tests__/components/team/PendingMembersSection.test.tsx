/**
 * PendingMembersSection (管理者ビューの承認待ちメンバー) — swimhub-tasks #71
 *
 * mobile と同じく、承認・拒否とも確認してから実行し、失敗時は文言を画面に出す。
 * 0 件のときは「承認待ちのメンバーはいません」を出す。
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithI18n } from "@/__tests__/helpers/teamQueryTestUtils";
import { PendingMembersSection } from "@/components/team/member-management/components/PendingMembersSection";
import type { TeamMember } from "@/components/team/member-management/hooks/useMembers";

const member: TeamMember = {
  id: "membership-1",
  user_id: "user-1",
  role: "user",
  is_active: true,
  joined_at: "2026-11-01T00:00:00Z",
  users: { id: "user-1", name: "申請太郎", gender: 0 },
};

describe("PendingMembersSection", () => {
  it("承認は確認ダイアログで承認したときだけ実行する", async () => {
    const onApprove = vi.fn().mockResolvedValue(true);
    renderWithI18n(
      <PendingMembersSection
        pendingMembers={[member]}
        isLoading={false}
        onApprove={onApprove}
        onReject={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("pending-member-approve-membership-1"));
    expect(onApprove).not.toHaveBeenCalled();
    expect(screen.getByText("申請太郎を承認しますか？")).toBeInTheDocument();

    // ダイアログの「承認」(一覧の承認ボタンとは別) を押す
    const approveButtons = screen.getAllByRole("button", { name: "承認" });
    fireEvent.click(approveButtons[approveButtons.length - 1]!);
    await waitFor(() => expect(onApprove).toHaveBeenCalledWith("membership-1"));
  });

  it("拒否も確認ダイアログでキャンセルしたら実行しない", () => {
    const onReject = vi.fn().mockResolvedValue(true);
    renderWithI18n(
      <PendingMembersSection
        pendingMembers={[member]}
        isLoading={false}
        onApprove={vi.fn()}
        onReject={onReject}
      />,
    );

    fireEvent.click(screen.getByTestId("pending-member-reject-membership-1"));
    expect(screen.getByText("申請太郎を拒否しますか？")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onReject).not.toHaveBeenCalled();
  });

  it("失敗の文言を画面に出す", () => {
    renderWithI18n(
      <PendingMembersSection
        pendingMembers={[member]}
        isLoading={false}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        actionError="承認に失敗しました"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("承認に失敗しました");
  });

  it("0 件のときは「承認待ちのメンバーはいません」を出す", () => {
    renderWithI18n(
      <PendingMembersSection
        pendingMembers={[]}
        isLoading={false}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(screen.getByTestId("pending-members-empty")).toHaveTextContent(
      "承認待ちのメンバーはいません",
    );
  });
});
