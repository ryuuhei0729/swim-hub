// QA Phase B: チーム代理入力導線の権限ゲート検証 (Contract Checklist #3)。
// isAdmin により記録/ログボタンが TeamRecordBulkForm / TeamPracticeLogBulkForm へ分岐し、
// 非 admin では従来の本人入力フロー (RecordLogForm / PracticeLogForm) に向かうことを確認する。
import React from "react";
import { describe, it, vi, beforeEach, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  useTeamCompetitionsQuery: vi.fn(),
  useDeleteTeamCompetitionMutation: vi.fn(),
  useTeamPracticesQuery: vi.fn(),
  useDeleteTeamPracticeMutation: vi.fn(),
  navigate: vi.fn(),
  supabase: {},
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamCompetitionsQuery: mocks.useTeamCompetitionsQuery,
  useDeleteTeamCompetitionMutation: mocks.useDeleteTeamCompetitionMutation,
  useTeamPracticesQuery: mocks.useTeamPracticesQuery,
  useDeleteTeamPracticeMutation: mocks.useDeleteTeamPracticeMutation,
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ supabase: mocks.supabase })),
}));

vi.mock("@react-navigation/native", () => ({
  useNavigation: vi.fn(() => ({ navigate: mocks.navigate })),
}));

import { TeamCompetitionList } from "../TeamCompetitionList";
import { TeamPracticeList } from "../TeamPracticeList";

const makeMutationMock = () => ({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false });

const competition = {
  id: "c-1",
  user_id: "user-1",
  team_id: "team-1",
  date: "2026-07-01",
  title: "代理入力大会",
  place: "市民プール",
  pool_type: 1,
  note: null,
  end_date: null,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
  image_paths: [],
};

const practice = {
  id: "p-1",
  user_id: "user-1",
  team_id: "team-1",
  date: "2026-07-02",
  title: "代理入力練習",
  place: "市民プール",
  note: null,
  created_at: "2026-07-02T00:00:00Z",
  updated_at: "2026-07-02T00:00:00Z",
  image_paths: [],
};

describe("[Gate] TeamCompetitionList 記録ボタンの admin 分岐", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useDeleteTeamCompetitionMutation.mockReturnValue(makeMutationMock());
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [competition],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  // 仕様変更 (Sprint Contract SC-1/D-3): admin 時のボタンラベルは「記録」から
  // 「記録代理入力」に変わった (遷移先 TeamRecordBulkForm は不変)。
  // 旧ラベルでの検索は新仕様で必ず要素が見つからず失敗するため、QA が新ラベルに書き換えた。
  it("isAdmin=true: 「記録代理入力」ボタンで TeamRecordBulkForm へ { competitionId, teamId } 遷移", () => {
    render(<TeamCompetitionList teamId="team-1" isAdmin={true} />);
    fireEvent.click(screen.getByRole("button", { name: "記録代理入力" }));
    expect(mocks.navigate).toHaveBeenCalledWith("TeamRecordBulkForm", {
      competitionId: "c-1",
      teamId: "team-1",
    });
    expect(mocks.navigate).not.toHaveBeenCalledWith("RecordLogForm", expect.anything());
  });

  // バグ修正 (2026-08-01): 非 admin の本人フローは RecordLogForm (recordId 未指定の
  // ブランクフォーム。既存レコードを検索しないため重複作成を招く) から、
  // useDayDetailHandlers.handleEditRecord と同じ CompetitionTabForm(initialTab:"record")
  // (competitionId 指定で既存レコードを読み込み編集対象にする) へ統一された。
  it("isAdmin=false: 記録ボタンで本人フロー CompetitionTabForm(initialTab:'record') へ遷移 (代理導線なし・重複レコード作成バグの回帰防止)", () => {
    render(<TeamCompetitionList teamId="team-1" isAdmin={false} />);
    fireEvent.click(screen.getByRole("button", { name: "記録" }));
    expect(mocks.navigate).toHaveBeenCalledWith(
      "CompetitionTabForm",
      expect.objectContaining({ competitionId: "c-1", teamId: "team-1", initialTab: "record" }),
    );
    // 非 admin では代理入力画面 (TeamRecordBulkForm) へは遷移しない (非退行)
    expect(mocks.navigate).not.toHaveBeenCalledWith("TeamRecordBulkForm", expect.anything());
    // 回帰防止: recordId 未指定のブランクフォーム (RecordLogForm) には遷移しないこと
    // (既存レコードを無視した重複作成バグの再発防止)
    expect(mocks.navigate).not.toHaveBeenCalledWith("RecordLogForm", expect.anything());
  });
});

describe("[Gate] TeamPracticeList ログボタンの admin 分岐", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useDeleteTeamPracticeMutation.mockReturnValue(makeMutationMock());
    mocks.useTeamPracticesQuery.mockReturnValue({
      data: [practice],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  // 仕様変更 (Sprint Contract SC-7 / D-2): admin 時のボタンラベルは「ログを記入」から
  // 「記録代理入力」に変わった (遷移先 TeamPracticeLogBulkForm は不変)。
  // 旧ラベルでの検索は新仕様で必ず要素が見つからず失敗するため、QA が新ラベルに書き換えた。
  // ラベル自体の詳細な回帰防止テストは TeamPracticeList.test.tsx の [SC-7] に集約する。
  it("isAdmin=true: 「記録代理入力」ボタンで TeamPracticeLogBulkForm へ { practiceId, teamId } 遷移", () => {
    render(<TeamPracticeList teamId="team-1" isAdmin={true} />);
    fireEvent.click(screen.getByRole("button", { name: "記録代理入力" }));
    expect(mocks.navigate).toHaveBeenCalledWith("TeamPracticeLogBulkForm", {
      practiceId: "p-1",
      teamId: "team-1",
    });
    expect(mocks.navigate).not.toHaveBeenCalledWith("PracticeLogForm", expect.anything());
  });

  it("isAdmin=false: ログボタンで本人フロー PracticeLogForm へ遷移 (代理導線なし)", () => {
    render(<TeamPracticeList teamId="team-1" isAdmin={false} />);
    fireEvent.click(screen.getByRole("button", { name: "ログを記入" }));
    expect(mocks.navigate).toHaveBeenCalledWith(
      "PracticeLogForm",
      expect.objectContaining({ practiceId: "p-1", teamId: "team-1" }),
    );
    expect(mocks.navigate).not.toHaveBeenCalledWith("TeamPracticeLogBulkForm", expect.anything());
  });
});
