// QA Phase B: チーム代理入力導線の権限ゲート検証 (Contract Checklist #3)。
// isAdmin により記録/ログボタンが TeamRecordBulkForm / TeamPracticeLogBulkForm へ分岐し、
// 非 admin では本人入力フロー CompetitionTabForm(initialTab:"record") /
// PracticeTabForm(initialTab:"log") に向かうことを確認する (下記 it("isAdmin=false: ...")
// 2件の toHaveBeenCalledWith が根拠。旧 RecordLogForm はルート自体を削除済み、
// PracticeLogForm はリダイレクトシムとして現存するが、このファイルの非admin テストの
// 遷移先ではない)。
//
// 【"RecordLogForm" への negative assert を置き換えた経緯 — 定義はここ1箇所】
// 旧 RecordLogForm ルートは RecordLogFormScreen ごと削除され、navigation/types.ts の
// MainStackParamList からも消えた。そのため
// `expect(navigate).not.toHaveBeenCalledWith("RecordLogForm", ...)` のような文字列
// リテラル比較の negative assert は、ルート消滅後は何が壊れても永久に真であり検出力が
// ゼロになる。よってこのファイルおよび TeamCompetitionList.test.tsx では、これらを
// 「`toHaveBeenCalledWith(<期待ルート>)` + `toHaveBeenCalledTimes(1)`」の組
// (= クリック1回につき期待したルートへ1回だけ遷移した、を肯定形で担保する) に
// 置き換えている。各 assert 直上の1行コメントはこの方針への参照である。
import React from "react";
import { describe, it, vi, beforeEach, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  useTeamCompetitionsQuery: vi.fn(),
  useDeleteTeamCompetitionMutation: vi.fn(),
  useTeamPracticesQuery: vi.fn(),
  useDeleteTeamPracticeMutation: vi.fn(),
  // Sprint Contract (D-3) で TeamCompetitionList のカード上プルダウンが
  // useUpdateCompetitionMutation / useQueryClient / teamKeys に依存するようになった。
  // このファイルはその挙動自体を検証しないが、レンダーが通るための配線として必要。
  useUpdateCompetitionMutation: vi.fn(),
  invalidateQueries: vi.fn(),
  navigate: vi.fn(),
  supabase: {},
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamCompetitionsQuery: mocks.useTeamCompetitionsQuery,
  useDeleteTeamCompetitionMutation: mocks.useDeleteTeamCompetitionMutation,
  useTeamPracticesQuery: mocks.useTeamPracticesQuery,
  useDeleteTeamPracticeMutation: mocks.useDeleteTeamPracticeMutation,
}));

vi.mock("@apps/shared/hooks/queries/records", () => ({
  useUpdateCompetitionMutation: mocks.useUpdateCompetitionMutation,
}));

vi.mock("@apps/shared/hooks/queries/keys", () => ({
  teamKeys: {
    competitions: (teamId: string) => ["teams", "detail", teamId, "competitions"],
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: vi.fn(() => ({ invalidateQueries: mocks.invalidateQueries })),
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
    mocks.useUpdateCompetitionMutation.mockReturnValue(makeMutationMock());
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
    // 期待ルート以外へは飛ばない (上の toHaveBeenCalledWith との組で担保)
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });

  // バグ修正 (2026-08-01): 非 admin の本人フローは RecordLogForm (recordId 未指定の
  // ブランクフォーム。既存レコードを検索しないため重複作成を招く) から、
  // useDayDetailHandlers.handleEditRecord と同じ CompetitionTabForm(initialTab:"record")
  // (competitionId 指定で既存レコードを読み込み編集対象にする) へ統一された。
  //
  // 【QA Phase A 書き換えメモ (今回の Sprint Contract SC-2)】competition.date は
  // "2026-07-01" 固定 (このファイルのモジュールスコープで定義済み、変更範囲外)。
  // 実測時点 (2026-09-21) で既に過去日のため、[SC-3][SC-4] の排他仕様上も
  // 記録追加ボタンが表示される側であり非退行。ラベルのみ SC-2 の新文言
  // 「記録追加」(旧「記録」) に書き換えた。
  it("isAdmin=false: 記録追加ボタンで本人フロー CompetitionTabForm(initialTab:'record') へ遷移 (代理導線なし・重複レコード作成バグの回帰防止)", () => {
    render(<TeamCompetitionList teamId="team-1" isAdmin={false} />);
    fireEvent.click(screen.getByRole("button", { name: "記録追加" }));
    expect(mocks.navigate).toHaveBeenCalledWith(
      "CompetitionTabForm",
      expect.objectContaining({ competitionId: "c-1", teamId: "team-1", initialTab: "record" }),
    );
    // 非 admin では代理入力画面 (TeamRecordBulkForm) へは遷移しない (非退行)
    expect(mocks.navigate).not.toHaveBeenCalledWith("TeamRecordBulkForm", expect.anything());
    // 期待ルート以外へは飛ばない (上の toHaveBeenCalledWith との組で担保)
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
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

  // 【QA Phase A 書き換えメモ (今回の Sprint Contract SC-1)】ラベルは
  // 「ログを記入」→「記録追加」に変わった (apps/shared/messages/ja.json 実測で確認済み)。
  // 【QA Phase A 再書き換え (今回のスプリント: 旧画面の統合タブ画面への一本化)】
  // 遷移先が PracticeLogForm から PracticeTabForm(initialTab:"log") に変わった
  // (旧画面 PracticeLogFormScreen はリダイレクトシム化された)。
  it("isAdmin=false: 記録追加ボタンで本人フロー PracticeTabForm(initialTab:'log') へ遷移 (代理導線なし)", () => {
    render(<TeamPracticeList teamId="team-1" isAdmin={false} />);
    fireEvent.click(screen.getByRole("button", { name: "記録追加" }));
    expect(mocks.navigate).toHaveBeenCalledWith(
      "PracticeTabForm",
      expect.objectContaining({ practiceId: "p-1", teamId: "team-1", initialTab: "log" }),
    );
    expect(mocks.navigate).not.toHaveBeenCalledWith("TeamPracticeLogBulkForm", expect.anything());
    expect(mocks.navigate).not.toHaveBeenCalledWith("PracticeLogForm", expect.anything());
  });
});
