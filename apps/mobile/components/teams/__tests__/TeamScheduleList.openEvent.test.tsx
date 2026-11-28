// =============================================================================
// TeamScheduleList.openEvent.test.tsx
// =============================================================================
//
// ダッシュボードの日付詳細の「チームの記録を見る」から頼まれた練習・大会の詳細を、
// 予定タブがカードを押したときと同じ詳細 (練習: タイム一覧 / 大会: 記録一覧) で開く (#141)。
//   - 一覧の読み込みを待ってから開き、頼みを消す
//   - 過去の予定 (「過去」オフの一覧に出ないもの) でも開く
//   - 別のチームへの頼みには反応しない
// =============================================================================

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithQuery as render } from "@/__tests__/helpers/testUtils";
import type { Competition, Practice } from "@swim-hub/shared/types";

const mocks = vi.hoisted(() => ({
  handleOpenTimes: vi.fn(),
  handleOpenRecords: vi.fn(),
  practices: [] as unknown[],
  competitions: [] as unknown[],
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ supabase: {}, user: { id: "u-1" } })),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamPracticesQuery: () => ({ data: mocks.practices, isSuccess: true, isError: false, isLoading: false }),
  useTeamCompetitionsQuery: () => ({
    data: mocks.competitions,
    isSuccess: true,
    isError: false,
    isLoading: false,
  }),
}));

vi.mock("../TeamPracticeList", () => ({
  PracticeItem: () => null,
  useTeamPracticeActions: () => ({
    handleAdd: vi.fn(),
    handleBulkRegister: vi.fn(),
    handleEdit: vi.fn(),
    handleAddLog: vi.fn(),
    handleOpenTimes: mocks.handleOpenTimes,
    handleDelete: vi.fn(),
    deletingId: null,
    isDeletePending: false,
    modals: null,
  }),
}));

vi.mock("../TeamCompetitionList", () => ({
  CompetitionItem: () => null,
  useTeamCompetitionActions: () => ({
    handleAdd: vi.fn(),
    handleBulkRegister: vi.fn(),
    handleEdit: vi.fn(),
    handleEntry: vi.fn(),
    handleRecord: vi.fn(),
    handleOpenRecords: mocks.handleOpenRecords,
    handleDelete: vi.fn(),
    deletingId: null,
    isDeletePending: false,
    modals: null,
  }),
}));

import { TeamScheduleList } from "../TeamScheduleList";
import { useTeamViewStore } from "@/stores/teamViewStore";

const pastPractice = {
  id: "p-past",
  date: "2020-01-01",
  title: "昔の練習",
  team_id: "team-1",
} as unknown as Practice;

const competition = {
  id: "c-1",
  date: "2099-01-01",
  title: "先の大会",
  team_id: "team-1",
} as unknown as Competition;

describe("TeamScheduleList 外から頼まれた詳細を開く", () => {
  beforeEach(() => {
    mocks.handleOpenTimes.mockClear();
    mocks.handleOpenRecords.mockClear();
    mocks.practices = [pastPractice];
    mocks.competitions = [competition];
    useTeamViewStore.setState({ pendingOpenEvent: null });
  });

  it("過去の練習でもタイム一覧を開き、頼みを消す", async () => {
    useTeamViewStore.getState().requestOpenEvent({ teamId: "team-1", kind: "practice", id: "p-past" });
    render(<TeamScheduleList teamId="team-1" isAdmin={false} />);

    await waitFor(() => expect(mocks.handleOpenTimes).toHaveBeenCalledWith(pastPractice));
    expect(useTeamViewStore.getState().pendingOpenEvent).toBeNull();
  });

  it("大会は記録一覧を開く", async () => {
    useTeamViewStore.getState().requestOpenEvent({ teamId: "team-1", kind: "competition", id: "c-1" });
    render(<TeamScheduleList teamId="team-1" isAdmin={false} />);

    await waitFor(() => expect(mocks.handleOpenRecords).toHaveBeenCalledWith(competition));
  });

  it("別のチームへの頼みには反応しない", async () => {
    useTeamViewStore.getState().requestOpenEvent({ teamId: "team-2", kind: "practice", id: "p-past" });
    render(<TeamScheduleList teamId="team-1" isAdmin={false} />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.handleOpenTimes).not.toHaveBeenCalled();
    expect(useTeamViewStore.getState().pendingOpenEvent).not.toBeNull();
  });
});
