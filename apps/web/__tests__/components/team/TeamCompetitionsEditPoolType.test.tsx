/**
 * TeamCompetitions — handleEditCompetition の pool_type/end_date 伝搬テスト
 * (Sprint Contract D-4 / V-2 ビルダー#6)
 *
 * Ground Truth 実測: components/team/TeamCompetitions.tsx:347-354 の
 * handleEditCompetition は、一覧クエリ(:279)で pool_type を既に取得済みなのに
 * editingData に渡していなかった(D-4)。この経路は CompetitionTabModal ではなく
 * CompetitionBasicForm (D-1 の DB 再取得を持たない) を開くため、この直接パススルーの
 * 修正自体が最終防衛線になる。既存の TeamCompetitionsAdminActions.test.tsx は
 * editData.title のみ assert しており pool_type は未カバー (Sprint Contract より)。
 */

import React from "react";
import { renderWithI18n as render, screen } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@apps/shared/api/teams/records", () => ({
  TeamRecordsAPI: vi.fn().mockImplementation(() => ({
    update: mocks.update,
    remove: mocks.remove,
    create: mocks.create,
  })),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const RAW_COMPETITION_ROW = {
  id: "competition-1",
  user_id: "member-1",
  team_id: "team-1",
  title: "県大会(長水路)",
  date: "2026-08-01",
  end_date: "2026-08-03",
  place: "県営プール",
  pool_type: 1,
  entry_status: "before",
  note: "更衣室は東側",
  created_at: "2026-07-20T00:00:00Z",
  created_by: "member-1",
  users: { name: "選手A" },
  created_by_user: null,
  records: [],
  entries: [],
};

function buildSupabaseMock(rows: typeof RAW_COMPETITION_ROW[]) {
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

let currentAuthMock: { user: { id: string }; supabase: ReturnType<typeof buildSupabaseMock> };

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => currentAuthMock,
}));

// editData 全体を可視化するスタブ (pool_type/end_date の直接検証用)
vi.mock("@/components/forms/CompetitionBasicForm", () => ({
  default: (props: {
    isOpen: boolean;
    editData?: { title?: string | null; pool_type?: number; end_date?: string | null };
  }) =>
    props.isOpen ? (
      <div data-testid="competition-basic-form-stub">
        <span data-testid="basic-form-title">{props.editData?.title ?? ""}</span>
        <span data-testid="basic-form-pool-type">
          {props.editData?.pool_type === undefined ? "undefined" : String(props.editData.pool_type)}
        </span>
        <span data-testid="basic-form-end-date">{props.editData?.end_date ?? ""}</span>
      </div>
    ) : null,
}));

vi.mock("../../../components/team/TeamCompetitionEntryModal", () => ({ default: () => null }));
vi.mock("../../../components/team/TeamCompetitionRecordsModal", () => ({ default: () => null }));

import TeamCompetitions from "@/components/team/TeamCompetitions";

describe("TeamCompetitions — handleEditCompetition の pool_type/end_date 伝搬 (D-4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentAuthMock = {
      user: { id: "admin-1" },
      supabase: buildSupabaseMock([RAW_COMPETITION_ROW]),
    };
  });

  it("[V-2] 長水路(1)の大会を編集ボタンから開くと、editData.pool_type が 1 で渡る", async () => {
    const user = userEvent.setup();
    render(<TeamCompetitions teamId="team-1" isAdmin={true} />);

    await screen.findByText("県大会(長水路)");
    await user.click(screen.getByTestId("team-competition-edit-button"));

    expect(await screen.findByTestId("competition-basic-form-stub")).toBeInTheDocument();
    expect(screen.getByTestId("basic-form-pool-type")).toHaveTextContent("1");
  });

  it("[V-2/V-5] 複数日開催 (end_date あり) の大会を編集しても end_date が渡る", async () => {
    const user = userEvent.setup();
    render(<TeamCompetitions teamId="team-1" isAdmin={true} />);

    await screen.findByText("県大会(長水路)");
    await user.click(screen.getByTestId("team-competition-edit-button"));

    expect(await screen.findByTestId("competition-basic-form-stub")).toBeInTheDocument();
    expect(screen.getByTestId("basic-form-end-date")).toHaveTextContent("2026-08-03");
  });
});
