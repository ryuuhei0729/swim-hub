/**
 * TeamAnnouncementsSection — 「エントリー未提出」通知 → CompetitionTabForm 遷移の
 * teamId 有無 (Sprint Contract SC-6 回帰防止テスト)
 *
 * 背景: CompetitionTabFormScreen.handleSave は resolveSaveReturnTarget(teamId, options) の
 * 結果に応じて popTo("TeamDetail", ...) / goBack() / popToTop() を呼び分ける。この画面は
 * ダッシュボードの「エントリー未提出」通知からも teamId **無し**で開かれる経路がある
 * (この呼び出し元は「直前にいた TeamDetail」が存在しないダッシュボード起点のため、
 * 保存後に TeamDetail へ popTo するのは不適切で、従来通り popToTop/goBack であるべき)。
 *
 * 【QA Phase A 書き換え】遷移先が EntryLogFormScreen ("EntryForm") から
 * CompetitionTabFormScreen ("CompetitionTabForm", initialTab: "entry") に変わったため
 * 期待値を更新した。ただし「teamId キー自体が存在しないこと」を hasOwnProperty で見る
 * 観点は個人フローの回帰ガードとして維持する。
 *
 * このファイルは CompetitionTabFormScreen 側の分岐 (resolveSaveReturnTarget) ではなく、
 * **呼び出し元がそもそも teamId を渡していないこと** を検証する。
 *
 * 検証観点 (Sprint Contract):
 *   [SC-6] 「エントリー未提出」タップ →
 *          navigation.navigate("CompetitionTabForm", { competitionId, date, initialTab: "entry" })
 *          に teamId キーが含まれない (含まれていれば非退行のはずが popTo 経路に迷い込む)
 */

import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  unsubmittedEntries: [] as Array<{
    teamId: string;
    competitionId: string;
    competitionName: string;
    competitionDate: string;
  }>,
}));

vi.mock("@apps/shared/hooks/queries/announcements", () => ({
  useTeamAnnouncementsQuery: () => ({ data: [] }),
}));

vi.mock("@apps/shared/hooks/queries/notifications", () => ({
  useUnansweredAttendancesQuery: () => ({ data: [] }),
  useUnsubmittedEntriesQuery: () => ({ data: mocks.unsubmittedEntries }),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: {}, user: { id: "user-1" } }),
}));

vi.mock("@/hooks/useDateLocale", () => ({
  useDateLocale: () => undefined,
}));

vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mocks.navigate }),
}));

import { TeamAnnouncementsSection } from "../TeamAnnouncementsSection";

const APPROVED_TEAM = {
  team_id: "team-1",
  status: "approved",
  is_active: true,
  role: "member",
  teams: { name: "テストチーム" },
} as unknown as TeamMembershipWithUser;

describe("TeamAnnouncementsSection — エントリー未提出通知 (SC-6 回帰防止)", () => {
  it("[SC-6] タップ時、CompetitionTabForm へ teamId を渡さない (popTo ではなく従来通り popToTop/goBack 経路のまま)", () => {
    mocks.unsubmittedEntries = [
      {
        teamId: "team-1",
        competitionId: "comp-1",
        competitionName: "テスト大会",
        competitionDate: "2026-10-01",
      },
    ];

    const { getByRole } = render(<TeamAnnouncementsSection teams={[APPROVED_TEAM]} />);

    fireEvent.click(getByRole("button", { name: /テスト大会/ }));

    expect(mocks.navigate).toHaveBeenCalledWith("CompetitionTabForm", {
      competitionId: "comp-1",
      date: "2026-10-01",
      initialTab: "entry",
    });
    // teamId キー自体が存在しないこと (undefined 代入ではなくキー欠如) を明示的に確認する
    const [, params] = mocks.navigate.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.prototype.hasOwnProperty.call(params, "teamId")).toBe(false);
  });
});
