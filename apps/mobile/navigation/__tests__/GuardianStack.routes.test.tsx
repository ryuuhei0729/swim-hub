// =============================================================================
// GuardianStack.routes.test.tsx — 保護者アカウント用スタックに登録された画面
// =============================================================================
//
//   [GS-1] ボトムタブ (MainTabs) を持たず、最初の画面は保護者版のチーム画面
//   [GS-2] 登録するのはチーム画面と、そこから開く閲覧専用の画面 (お知らせ・ランキング) だけ。
//          記録の入力・設定・メンバーの目標などの画面へは辿れない
//   [GS-3] 閲覧画面のタイトルは MainStack と同じ
//
// MainStack.routes.test.tsx と同じく、createNativeStackNavigator を差し替えて
// <Stack.Screen> に渡された props を記録する。
// =============================================================================

import { render } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/screens/GuardianTeamScreen", () => ({ GuardianTeamScreen: () => null }));
vi.mock("@/screens/TeamAnnouncementsScreen", () => ({ TeamAnnouncementsScreen: () => null }));
vi.mock("@/screens/TeamRankingsScreen", () => ({ TeamRankingsScreen: () => null }));

interface CapturedScreenProps {
  name?: string;
  options?: unknown;
  [key: string]: unknown;
}

const stackMocks = vi.hoisted(() => ({
  screens: [] as CapturedScreenProps[],
}));

vi.mock("@react-navigation/native-stack", () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => children,
    Screen: (props: CapturedScreenProps) => {
      stackMocks.screens.push(props);
      return null;
    },
  }),
}));

import { GuardianStack } from "../GuardianStack";

describe("GuardianStack — 登録された画面", () => {
  beforeEach(() => {
    stackMocks.screens = [];
    render(<GuardianStack />);
  });

  it("[GS-1] 最初の画面は保護者版のチーム画面で、ボトムタブ (MainTabs) は無い", () => {
    const names = stackMocks.screens.map((s) => s.name);
    expect(names[0]).toBe("GuardianTeam");
    expect(names).not.toContain("MainTabs");
  });

  it("[GS-2] チーム画面・お知らせ・ランキングの 3 画面だけを登録する", () => {
    const names = stackMocks.screens.map((s) => s.name);
    expect(names).toEqual(["GuardianTeam", "TeamAnnouncements", "TeamRankings"]);
  });

  it("[GS-3] お知らせ・ランキングのタイトルは MainStack と同じ", () => {
    const titleOf = (name: string) =>
      (stackMocks.screens.find((s) => s.name === name)?.options as { title?: string }).title;
    expect(titleOf("TeamAnnouncements")).toBe("お知らせ");
    expect(titleOf("TeamRankings")).toBe("ランキング");
  });
});
