/**
 * TeamCompetitionList コンポーネント テスト
 *
 * Sprint 2 Phase B QA 検証
 *
 * 検証観点:
 * [S2-V-05] isLoading 時にローディング表示が出る
 * [S2-V-06] isError 時にエラー表示が出る
 * [S2-V-07] 大会が 0 件のとき空状態表示
 * [S2-V-08] 大会リストが表示される (タイトル / 場所)
 * [S2-V-09] isAdmin=true のとき追加ボタン・navigate が呼ばれる
 * [S2-V-10] isAdmin=false のとき追加ボタンが表示されない
 */

import React from "react";
import { describe, it, vi, beforeEach, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  useTeamCompetitionsQuery: vi.fn(),
  useDeleteTeamCompetitionMutation: vi.fn(),
  navigate: vi.fn(),
  supabase: {},
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamCompetitionsQuery: mocks.useTeamCompetitionsQuery,
  useDeleteTeamCompetitionMutation: mocks.useDeleteTeamCompetitionMutation,
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ supabase: mocks.supabase })),
}));

vi.mock("@react-navigation/native", () => ({
  useNavigation: vi.fn(() => ({ navigate: mocks.navigate })),
}));

import { TeamCompetitionList } from "../TeamCompetitionList";

const makeCompetition = (overrides: Record<string, unknown> = {}) => ({
  id: "c-1",
  user_id: "user-1",
  team_id: "team-1",
  date: "2026-06-15",
  title: "春季大会",
  place: "○○プール",
  pool_type: 1,
  note: null,
  end_date: null,
  created_at: "2026-06-15T10:00:00Z",
  updated_at: "2026-06-15T10:00:00Z",
  image_paths: [],
  ...overrides,
});

const makeMutationMock = () => ({
  mutateAsync: vi.fn().mockResolvedValue(undefined),
  isPending: false,
});

describe("TeamCompetitionList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useDeleteTeamCompetitionMutation.mockReturnValue(makeMutationMock());
  });

  // [S2-V-05] ローディング
  it("isLoading=true のときリスト表示されない", () => {
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-1" isAdmin={false} />);

    expect(screen.queryByText("春季大会")).toBeNull();
  });

  // [S2-V-06] エラー状態
  it("isError=true のときエラーメッセージが表示される", () => {
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: "大会取得エラー" },
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-1" isAdmin={false} />);

    expect(screen.getByText("大会取得エラー")).toBeDefined();
  });

  // [S2-V-07] 空状態
  it("competitions が空のとき大会タイトルが表示されない", () => {
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-1" isAdmin={false} />);

    expect(screen.queryAllByText("春季大会")).toHaveLength(0);
  });

  // [S2-V-08] リスト表示
  it("competitions が存在するとき大会タイトルが表示される", () => {
    const comp = makeCompetition({ title: "夏季招待大会" });
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [comp],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-1" isAdmin={false} />);

    expect(screen.getByText("夏季招待大会")).toBeDefined();
  });

  // [S2-V-09] isAdmin=true: 追加ボタンが表示され navigate が呼ばれる
  it("isAdmin=true で追加ボタンを押すと CompetitionForm + teamId で navigate される", () => {
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-1" isAdmin={true} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    fireEvent.click(buttons[0]);

    expect(mocks.navigate).toHaveBeenCalledWith(
      "CompetitionForm",
      expect.objectContaining({ teamId: "team-1" }),
    );
  });

  // [S2-V-10] isAdmin=false: 追加ボタンがない
  it("isAdmin=false のとき追加ボタンが表示されない", () => {
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-1" isAdmin={false} />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  // isAdmin=true で編集ボタンを押すと { competitionId, date, teamId } で navigate される
  it("isAdmin=true で編集ボタンを押すと CompetitionForm + { competitionId, date, teamId } で navigate される", () => {
    const comp = makeCompetition({ id: "c-edit", title: "編集対象大会", date: "2026-08-10" });
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [comp],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-1" isAdmin={true} />);

    const buttons = screen.getAllByRole("button");
    // buttons[0] = ヘッダー追加, buttons[1] = 編集, buttons[2] = 削除
    fireEvent.click(buttons[1]);

    expect(mocks.navigate).toHaveBeenCalledWith(
      "CompetitionForm",
      expect.objectContaining({
        competitionId: "c-edit",
        date: "2026-08-10",
        teamId: "team-1",
      }),
    );
  });

  // -----------------------------------------------------------------------
  // Sprint 3 検証: [S3-V-B1] エントリー/記録ボタンが存在し teamId で遷移する
  // -----------------------------------------------------------------------

  // [S3-V-B1] エントリーボタンが表示される
  it("[S3-V-B1] 大会がある場合、エントリーボタンが表示される", () => {
    const comp = makeCompetition({ title: "冬季大会" });
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [comp],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-1" isAdmin={false} />);

    // ja.json の teams.mobile.teamCompetitionList.entryButton = 'エントリー'
    expect(screen.getByText("エントリー")).toBeDefined();
  });

  // [S3-V-B1] 記録ボタンが表示される
  it("[S3-V-B1] 大会がある場合、記録ボタンが表示される", () => {
    const comp = makeCompetition({ title: "冬季大会" });
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [comp],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-1" isAdmin={false} />);

    // ja.json の teams.mobile.teamCompetitionList.recordButton = '記録'
    expect(screen.getByText("記録")).toBeDefined();
  });

  // [S3-V-B1] エントリーボタン押下で EntryForm + { competitionId, date, teamId } で navigate される
  it("[S3-V-B1] エントリーボタンを押すと EntryForm に { competitionId, date, teamId } で navigate される", () => {
    const comp = makeCompetition({ id: "c-ent", date: "2026-09-01", title: "秋季大会" });
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [comp],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-ent" isAdmin={false} />);

    const entryButton = screen.getByRole("button", { name: "エントリー" });
    fireEvent.click(entryButton);

    expect(mocks.navigate).toHaveBeenCalledWith(
      "EntryForm",
      expect.objectContaining({
        competitionId: "c-ent",
        date: "2026-09-01",
        teamId: "team-ent",
      }),
    );
  });

  // [S3-V-B1] 記録ボタン押下で RecordLogForm + { competitionId, date, teamId } で navigate される
  it("[S3-V-B1] 記録ボタンを押すと RecordLogForm に { competitionId, date, teamId } で navigate される", () => {
    const comp = makeCompetition({ id: "c-rec", date: "2026-10-15", title: "選手権大会" });
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [comp],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-rec" isAdmin={false} />);

    const recordButton = screen.getByRole("button", { name: "記録" });
    fireEvent.click(recordButton);

    expect(mocks.navigate).toHaveBeenCalledWith(
      "RecordLogForm",
      expect.objectContaining({
        competitionId: "c-rec",
        date: "2026-10-15",
        teamId: "team-rec",
      }),
    );
  });
});
