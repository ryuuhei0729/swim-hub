/**
 * ActionItemsSection (ホームの「対応が必要なこと」)
 *
 * 出欠未回答・エントリー未提出は以前 TeamAnnouncementsSection にあり、
 * TeamAnnouncementsSection.notificationNavigation.test.tsx が遷移先を守っていた。
 * ここへ移したので、その観点 ([SC-6] [AT-1]) もこのファイルで引き継ぐ。
 *
 *   [SC-6] エントリー未提出のタップ → CompetitionTabForm に teamId キーを渡さない
 *          (ダッシュボード起点なので、保存後にチームタブへ popTo してはいけない)
 *   [AT-1] 出欠未回答のタップ → そのチームの出欠タブを利用者ビュー (asMember) で開く
 */

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";
import {
  actionItemKey,
  actionItemsCollapseStorageKey,
} from "@apps/shared/utils/dashboardActionItems";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  unanswered: [] as Array<Record<string, string>>,
  unsubmitted: [] as Array<Record<string, string>>,
  unrecorded: [] as Array<Record<string, string>>,
}));

vi.mock("@apps/shared/hooks/queries/notifications", () => ({
  useUnansweredAttendancesQuery: () => ({ data: mocks.unanswered }),
  useUnsubmittedEntriesQuery: () => ({ data: mocks.unsubmitted }),
}));
vi.mock("@apps/shared/hooks/queries/dashboard", () => ({
  useUnrecordedCompetitionsQuery: () => ({ data: mocks.unrecorded }),
}));
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: {}, user: { id: "user-1" } }),
}));
vi.mock("@/hooks/useDateLocale", () => ({ useDateLocale: () => "ja" }));
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mocks.navigate }),
}));

import { ActionItemsSection } from "../ActionItemsSection";

const APPROVED_TEAM = {
  team_id: "team-1",
  status: "approved",
  is_active: true,
  role: "member",
  teams: { name: "テストチーム" },
} as unknown as TeamMembershipWithUser;

const STORAGE_KEY = actionItemsCollapseStorageKey("user-1");

beforeEach(() => {
  vi.mocked(AsyncStorage.getItem).mockResolvedValue(null);
  mocks.unanswered = [];
  mocks.unsubmitted = [];
  mocks.unrecorded = [];
});

describe("ActionItemsSection — 遷移先", () => {
  it("[SC-6] エントリー未提出のタップで、CompetitionTabForm へ teamId を渡さない", () => {
    mocks.unsubmitted = [
      { teamId: "team-1", teamName: "テストチーム", competitionId: "comp-1", competitionName: "テスト大会", competitionDate: "2026-10-01" },
    ];
    const { getByRole } = render(<ActionItemsSection teams={[APPROVED_TEAM]} />);

    fireEvent.click(getByRole("button", { name: /テスト大会/ }));

    expect(mocks.navigate).toHaveBeenCalledWith("CompetitionTabForm", {
      competitionId: "comp-1",
      date: "2026-10-01",
      initialTab: "entry",
    });
    const [, params] = mocks.navigate.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.prototype.hasOwnProperty.call(params, "teamId")).toBe(false);
  });

  it("[AT-1] 出欠未回答のタップで、そのチームの出欠タブを利用者ビューで開く", () => {
    mocks.unanswered = [
      { teamId: "team-1", teamName: "テストチーム", eventId: "p1", eventType: "practice", eventName: "練習", eventDate: "2026-11-09" },
    ];
    const { getByText } = render(<ActionItemsSection teams={[APPROVED_TEAM]} />);

    fireEvent.click(getByText("出欠が未回答 1件 ・ テストチーム"));

    expect(mocks.navigate).toHaveBeenCalledWith("MainTabs", {
      screen: "Teams",
      params: { teamId: "team-1", initialTab: "attendance", asMember: true },
    });
  });

  it("記録が未入力のタップで、その大会の記録タブを開く", () => {
    mocks.unrecorded = [
      { competitionId: "comp-2", competitionName: "秋季公認記録会", competitionDate: "2026-11-03" },
    ];
    const { getByRole } = render(<ActionItemsSection teams={[]} />);

    fireEvent.click(getByRole("button", { name: /秋季公認記録会/ }));

    expect(mocks.navigate).toHaveBeenCalledWith("CompetitionTabForm", {
      competitionId: "comp-2",
      date: "2026-11-03",
      initialTab: "record",
    });
  });
});

describe("ActionItemsSection — 表示と開閉", () => {
  it("対応事項が0件なら何も出さない", () => {
    const { queryByTestId } = render(<ActionItemsSection teams={[APPROVED_TEAM]} />);
    expect(queryByTestId("dashboard-action-items")).toBeNull();
  });

  it("出欠の未回答はチームごとに1行にまとめる", () => {
    mocks.unanswered = [
      { teamId: "team-1", teamName: "テストチーム", eventId: "p1", eventType: "practice", eventName: "練習", eventDate: "2026-11-09" },
      { teamId: "team-1", teamName: "テストチーム", eventId: "p2", eventType: "practice", eventName: "練習", eventDate: "2026-11-12" },
    ];
    const { getByText } = render(<ActionItemsSection teams={[APPROVED_TEAM]} />);
    expect(getByText("出欠が未回答 2件 ・ テストチーム")).toBeTruthy();
    expect(getByText("1件")).toBeTruthy();
  });

  it("見出しをタップすると閉じて、閉じた時点の項目と一緒に保存する", () => {
    mocks.unrecorded = [
      { competitionId: "comp-2", competitionName: "秋季公認記録会", competitionDate: "2026-11-03" },
    ];
    const { getByText, queryByText } = render(<ActionItemsSection teams={[]} />);

    // RN モックでは Pressable の testID を引けないので、見出しの文字を押す
    fireEvent.click(getByText("対応が必要なこと"));

    expect(queryByText(/秋季公認記録会/)).toBeNull();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify({ collapsed: true, keys: [actionItemKey.record("comp-2")] }),
    );
  });

  it("保存した閉じた状態を読み、項目が同じなら閉じたまま出す", async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(
      JSON.stringify({ collapsed: true, keys: [actionItemKey.record("comp-2")] }),
    );
    mocks.unrecorded = [
      { competitionId: "comp-2", competitionName: "秋季公認記録会", competitionDate: "2026-11-03" },
    ];
    const { queryByText, getByText } = render(<ActionItemsSection teams={[]} />);

    await waitFor(() => expect(queryByText(/秋季公認記録会/)).toBeNull());
    expect(getByText("1件")).toBeTruthy();
    expect(AsyncStorage.getItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it("閉じた時点に無かった項目があれば開いて出す", async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(
      JSON.stringify({ collapsed: true, keys: [actionItemKey.record("comp-2")] }),
    );
    mocks.unrecorded = [
      { competitionId: "comp-2", competitionName: "秋季公認記録会", competitionDate: "2026-11-03" },
      { competitionId: "comp-3", competitionName: "市民大会", competitionDate: "2026-11-01" },
    ];
    const { findByText } = render(<ActionItemsSection teams={[]} />);
    expect(await findByText(/市民大会/)).toBeTruthy();
  });
});
