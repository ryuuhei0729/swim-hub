/**
 * TeamPractices — 練習カードを押すとメンバー全員のタイム一覧を開く
 *
 * mobile の予定タブ (TeamPracticeList) と同じ導線:
 *   - admin/非admin を問わずカード全体を押すとタイム一覧モーダルが開く
 *   - admin がカードを押してもログ代理入力ページには飛ばない。代理入力は「記録代理入力」ボタンから
 *   - 記録が無い練習もカードを押すと開く (0件なら一覧側で空表示。swimhub-tasks#103)
 */
import React from "react";
import { renderWithI18n as render, screen } from "@/__tests__/helpers/teamQueryTestUtils";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  create: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@apps/shared/api/teams/practices", () => ({
  TeamPracticesAPI: vi.fn().mockImplementation(function () {
    return {
      update: mocks.update,
      remove: mocks.remove,
      create: mocks.create,
    };
  }),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
}));

const RAW_PRACTICE_ROW = {
  id: "practice-1",
  user_id: "member-1",
  date: "2026-07-20",
  title: "朝練",
  place: "市民プール",
  note: null,
  created_at: "2026-07-20T00:00:00Z",
  created_by: "member-1",
  users: { name: "選手A" },
  created_by_user: null,
  practice_logs: [{ id: "log-1", style: "Fr", distance: 100, practice_times: [] }],
};

/**
 * TeamPractices.loadTeamPractices() が発行する2種類のチェーンを模したモック:
 *   1. count 用: .select("*", { count, head: true }).eq(...)  → thenable で解決
 *   2. data 用:  .select(cols).eq(...).order(...).range(...)  → thenable で解決
 */
interface SupabaseMock {
  from: (...args: unknown[]) => unknown;
}

function buildSupabaseMock(rows: (typeof RAW_PRACTICE_ROW)[]): SupabaseMock {
  const fromMock = vi.fn(() => ({
    select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) {
        return { eq: () => Promise.resolve({ count: rows.length, error: null }) };
      }
      return {
        eq: () => ({
          order: () => ({
            range: () => Promise.resolve({ data: rows, error: null }),
          }),
        }),
      };
    },
  }));
  return { from: fromMock };
}

function buildAuthMock({
  isAdmin,
  supabase,
}: {
  isAdmin: boolean;
  supabase: SupabaseMock;
}) {
  return { user: { id: isAdmin ? "admin-1" : "member-1" }, supabase };
}

vi.mock("@/contexts/AuthProvider");
import { useAuth } from "@/contexts/AuthProvider";
import { buildAuthContext } from "@/__tests__/utils/authContext";

vi.mock("@/components/forms/PracticeBasicForm", () => ({
  default: (props: { isOpen: boolean; editData?: { title?: string | null } }) =>
    props.isOpen ? (
      <div data-testid="practice-basic-form-stub">
        {props.editData ? `edit:${props.editData.title ?? ""}` : "create"}
      </div>
    ) : null,
}));

vi.mock("../../../components/team/TeamPracticeDetailModal", () => ({
  default: (props: { practiceId: string; heading: string }) => (
    <div data-testid="practice-times-modal-stub">{`${props.practiceId}:${props.heading}`}</div>
  ),
}));

// 練習カードと操作は予定タブ (TeamSchedule) と同じ useTeamPracticeActions。一覧の取得はテスト用の描画側
import { TeamPractices } from "@/__tests__/utils/teamScheduleCardRenderers";

function setAuth(isAdmin: boolean, rows: (typeof RAW_PRACTICE_ROW)[] = [RAW_PRACTICE_ROW]) {
  vi.mocked(useAuth).mockReturnValue(
    buildAuthContext(buildAuthMock({ isAdmin, supabase: buildSupabaseMock(rows) })),
  );
}

describe("TeamPractices — 練習カードからタイム一覧を開く", () => {
  beforeEach(() => {
    mocks.push.mockClear();
  });

  it.each([true, false])("isAdmin=%s: カードを押すとタイム一覧が開き、ページ遷移はしない", async (isAdmin) => {
    setAuth(isAdmin);
    const user = userEvent.setup();
    render(<TeamPractices teamId="team-1" isAdmin={isAdmin} />);
    await screen.findByText("朝練");
    expect(screen.queryByTestId("practice-times-modal-stub")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "7月20日(月)のタイムを表示" }));

    expect(screen.getByTestId("practice-times-modal-stub")).toHaveTextContent(
      "practice-1:7月20日(月) 朝練",
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("キーボード (Enter) でも開ける", async () => {
    setAuth(false);
    const user = userEvent.setup();
    render(<TeamPractices teamId="team-1" isAdmin={false} />);
    await screen.findByText("朝練");

    screen.getByRole("button", { name: "7月20日(月)のタイムを表示" }).focus();
    await user.keyboard("{Enter}");

    expect(screen.getByTestId("practice-times-modal-stub")).toBeInTheDocument();
  });

  it("admin: 「記録代理入力」ボタンでログ代理入力ページへ進み、タイム一覧は開かない", async () => {
    setAuth(true);
    const user = userEvent.setup();
    render(<TeamPractices teamId="team-1" isAdmin={true} />);
    await screen.findByText("朝練");

    await user.click(screen.getByTestId("team-practice-log-input-button"));

    expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-1/practices/practice-1/logs");
    expect(screen.queryByTestId("practice-times-modal-stub")).not.toBeInTheDocument();
  });

  it("非admin: 「記録代理入力」ボタンは出ない", async () => {
    setAuth(false);
    render(<TeamPractices teamId="team-1" isAdmin={false} />);
    await screen.findByText("朝練");

    expect(screen.queryByTestId("team-practice-log-input-button")).not.toBeInTheDocument();
  });

  it("記録が無い練習もカードがボタンになり、押すとタイム一覧が開く (swimhub-tasks#103)", async () => {
    setAuth(false, [{ ...RAW_PRACTICE_ROW, practice_logs: [] }]);
    const user = userEvent.setup();
    render(<TeamPractices teamId="team-1" isAdmin={false} />);
    await screen.findByText("朝練");

    await user.click(screen.getByRole("button", { name: /タイムを表示/ }));
    expect(await screen.findByTestId("practice-times-modal-stub")).toBeInTheDocument();
  });
});
