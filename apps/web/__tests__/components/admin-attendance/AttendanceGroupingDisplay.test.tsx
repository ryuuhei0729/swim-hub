/**
 * AttendanceGroupingDisplay (1 つの練習・大会の全員の出欠)
 *
 *   - 各メンバーの備考も出す (swimhub-tasks #75)
 *   - 管理者ビュー (onChangeMemberStatus あり) では自分以外のメンバーに「変更」を出し、
 *     回答を代わりに変更できる。行が無い人は attendanceId を null で渡す (swimhub-tasks #61)
 *   - 利用者ビュー (onChangeMemberStatus なし) では「変更」を出さない (#67)
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithI18n } from "@/__tests__/helpers/teamQueryTestUtils";
import { AttendanceGroupingDisplay } from "@/components/admin-attendance/AttendanceGroupingDisplay";
import type { TeamAttendanceWithDetails } from "@swim-hub/shared/types";
import type { TeamMember } from "@swim-hub/shared/utils/team";

function makeAttendance(
  userId: string,
  status: "present" | "absent" | "other" | null,
  name: string,
  note: string | null = null,
): TeamAttendanceWithDetails {
  return {
    id: `att-${userId}`,
    practice_id: "practice-1",
    competition_id: null,
    user_id: userId,
    status,
    note,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    user: { id: userId, name } as TeamAttendanceWithDetails["user"],
  };
}

const teamMembers: TeamMember[] = [
  { id: "me", name: "自分" },
  { id: "u1", name: "田中" },
  { id: "u2", name: "佐藤" },
  { id: "u3", name: "鈴木" },
];

const attendanceData = [
  makeAttendance("me", "present", "自分"),
  makeAttendance("u1", "absent", "田中", "体調不良のため"),
  // u2 は DB トリガーで作られた未回答の行、u3 は行が無い
  makeAttendance("u2", null, "佐藤", "遅れて参加します"),
];

describe("AttendanceGroupingDisplay", () => {
  it("各メンバーの備考を出す (未回答の人の備考も)", () => {
    renderWithI18n(
      <AttendanceGroupingDisplay attendanceData={attendanceData} teamMembers={teamMembers} />,
    );
    expect(screen.getByTestId("attendance-member-u1")).toHaveTextContent("体調不良のため");
    expect(screen.getByTestId("attendance-member-u2")).toHaveTextContent("遅れて参加します");
  });

  it("onChangeMemberStatus が無い (利用者ビュー) ときは「変更」を出さない", () => {
    renderWithI18n(
      <AttendanceGroupingDisplay attendanceData={attendanceData} teamMembers={teamMembers} />,
    );
    expect(screen.queryByTestId("attendance-edit-member-u1")).not.toBeInTheDocument();
  });

  it("管理者ビューでは自分以外のメンバーの回答を代わりに変更できる", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    renderWithI18n(
      <AttendanceGroupingDisplay
        attendanceData={attendanceData}
        teamMembers={teamMembers}
        currentUserId="me"
        onChangeMemberStatus={onChange}
      />,
    );

    // 自分には出さない
    expect(screen.queryByTestId("attendance-edit-member-me")).not.toBeInTheDocument();

    // 行がある人は行 ID と備考を渡す
    fireEvent.click(screen.getByTestId("attendance-edit-member-u1"));
    fireEvent.click(screen.getByTestId("attendance-edit-member-u1-present"));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        { userId: "u1", attendanceId: "att-u1", note: "体調不良のため" },
        "present",
      ),
    );
    await waitFor(() =>
      expect(screen.queryByTestId("attendance-edit-member-u1-present")).not.toBeInTheDocument(),
    );

    // 行が無い人は attendanceId を null で渡す (作成になる)
    fireEvent.click(screen.getByTestId("attendance-edit-member-u3"));
    fireEvent.click(screen.getByTestId("attendance-edit-member-u3-other"));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        { userId: "u3", attendanceId: null, note: null },
        "other",
      ),
    );
  });

  it("変更に失敗したら理由を出し、選択肢は開いたままにする", async () => {
    const onChange = vi.fn().mockRejectedValue(new Error("network"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderWithI18n(
      <AttendanceGroupingDisplay
        attendanceData={attendanceData}
        teamMembers={teamMembers}
        currentUserId="me"
        onChangeMemberStatus={onChange}
      />,
    );

    fireEvent.click(screen.getByTestId("attendance-edit-member-u1"));
    fireEvent.click(screen.getByTestId("attendance-edit-member-u1-other"));
    expect(await screen.findByRole("alert")).toHaveTextContent("出欠情報の保存に失敗しました");
    expect(screen.getByTestId("attendance-edit-member-u1-other")).toBeInTheDocument();
  });
});
