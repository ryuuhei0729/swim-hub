// =============================================================================
// MainStack.routes.test.tsx — MainStack に登録された画面と options
// =============================================================================
//
//   [goals-D3] 目標管理の stack 画面 (GoalDetail / GoalForm / MilestoneForm) の登録とタイトル
//   [TD-1]     チーム詳細は stack に積む画面 (旧 TeamDetail) ではなく、チームタブの中に出す。
//              TeamDetail が stack に再登録されていないこと
//
// ■ テスト方針
//   MainStack 全体を実描画すると 20 近い画面が起動するため、画面はすべて null
//   スタブに差し替え、createNativeStackNavigator をこのファイル限定で上書きして
//   <Stack.Screen> に渡された props を記録する。options の評価は
//   **実プロダクションコードの関数をそのまま呼ぶ** (ロジックの再実装はしない)。
// =============================================================================

import { render } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/screens/PracticeFormScreen", () => ({ PracticeFormScreen: () => null }));
vi.mock("@/screens/PracticeLogFormScreen", () => ({ PracticeLogFormScreen: () => null }));
vi.mock("@/screens/PracticeTabFormScreen", () => ({ PracticeTabFormScreen: () => null }));
vi.mock("@/screens/PracticeTimeFormScreen", () => ({ PracticeTimeFormScreen: () => null }));
vi.mock("@/screens/RecordFormScreen", () => ({ RecordFormScreen: () => null }));
vi.mock("@/screens/CompetitionBasicFormScreen", () => ({ CompetitionBasicFormScreen: () => null }));
vi.mock("@/screens/CompetitionTabFormScreen", () => ({ CompetitionTabFormScreen: () => null }));
vi.mock("@/screens/EntryLogFormScreen", () => ({ EntryLogFormScreen: () => null }));
// TeamRecordBulkFormScreen (旧・チーム大会記録の代理入力画面) は2階層化に伴い
// TeamRecordStyleListScreen (一覧) / TeamRecordStyleDetailScreen (詳細) の
// 2画面に置き換わった (MainStack.tsx の TeamRecordBulkForm /
// TeamRecordBulkFormDetail ルート定義を参照)。旧画面へのモックのままだと
// MainStack が実際に import する新2画面が未モック化のまま実モジュールとして
// 読み込まれ、依存チェーン経由で expo-auth-session (expo-modules-core の
// CodedError 未モック) に到達して落ちる (QA Sprint Contract Phase B で修正)。
vi.mock("@/screens/TeamRecordStyleListScreen", () => ({
  TeamRecordStyleListScreen: () => null,
}));
vi.mock("@/screens/TeamRecordStyleDetailScreen", () => ({
  TeamRecordStyleDetailScreen: () => null,
}));
vi.mock("@/screens/TeamPracticeLogBulkFormScreen", () => ({
  TeamPracticeLogBulkFormScreen: () => null,
}));
vi.mock("@/screens/TeamEntryBulkFormScreen", () => ({ TeamEntryBulkFormScreen: () => null }));
vi.mock("@/screens/TeamBulkRegisterScreen", () => ({ TeamBulkRegisterScreen: () => null }));
vi.mock("@/screens/AccountPlanScreen", () => ({ AccountPlanScreen: () => null }));
vi.mock("@/screens/AccountCalendarScreen", () => ({ AccountCalendarScreen: () => null }));
vi.mock("@/screens/AccountSecurityScreen", () => ({ AccountSecurityScreen: () => null }));
vi.mock("@/screens/PracticeLogTemplatesScreen", () => ({
  PracticeLogTemplatesScreen: () => null,
}));
vi.mock("@/screens/PaywallScreen", () => ({ PaywallScreen: () => null }));
// 目標管理 (6タブ化) で MainStack に増えた3画面。未モックだと実物が AuthProvider 経由で
// expo-modules-core (CodedError 未モック) に到達して落ちる。
vi.mock("@/screens/GoalDetailScreen", () => ({ GoalDetailScreen: () => null }));
vi.mock("@/screens/GoalFormScreen", () => ({ GoalFormScreen: () => null }));
vi.mock("@/screens/MilestoneFormScreen", () => ({ MilestoneFormScreen: () => null }));
vi.mock("../TabNavigator", () => ({ TabNavigator: () => null }));

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

import { MainStack } from "../MainStack";

describe("MainStack — 登録された画面", () => {
  beforeEach(() => {
    stackMocks.screens = [];
    render(<MainStack />);
  });

  it("[TD-1] チーム詳細 (TeamDetail) は stack に登録されていない (チームタブの中に出す)", () => {
    const names = stackMocks.screens.map((s) => s.name);
    expect(names).not.toContain("TeamDetail");
    expect(names).toContain("MainTabs");
  });

  it("[goals-D3] 目標管理の stack 画面 GoalDetail / GoalForm / MilestoneForm が登録され、Goals (タブ側) は MainStack に無い", () => {
    const names = stackMocks.screens.map((s) => s.name);
    for (const n of ["GoalDetail", "GoalForm", "MilestoneForm"]) {
      expect(names.filter((x) => x === n), n).toHaveLength(1);
    }
    expect(names).not.toContain("Goals");
  });

  it("[goals-D3] GoalDetail のタイトルは navigation.mobile.titles.goalDetail の ja 値", () => {
    const screen = stackMocks.screens.find((s) => s.name === "GoalDetail");
    const options = screen?.options as { title?: string };
    expect(typeof options.title).toBe("string");
    expect(options.title).toBe("目標詳細");
  });

  it("[goals-D3] GoalForm / MilestoneForm のタイトルは params の goalId / milestoneId で作成・編集を切り替える", () => {
    const resolve = (name: string, params?: Record<string, unknown>) => {
      const screen = stackMocks.screens.find((s) => s.name === name);
      expect(typeof screen?.options, `${name} の options は関数`).toBe("function");
      return (
        screen!.options as (a: { route: { params?: Record<string, unknown> } }) => { title?: string }
      )({ route: { params } }).title;
    };
    expect(resolve("GoalForm", {})).toBe("新規目標作成");
    expect(resolve("GoalForm", { goalId: "g1" })).toBe("目標編集");
    expect(resolve("MilestoneForm", { goalId: "g1" })).toBe("マイルストーン作成");
    expect(resolve("MilestoneForm", { goalId: "g1", milestoneId: "m1" })).toBe("マイルストーン編集");
  });

  it("[account] 設定 (Settings) は無く、アカウント配下の3画面がアカウントの行と同じタイトルで登録されている", () => {
    const names = stackMocks.screens.map((s) => s.name);
    expect(names).not.toContain("Settings");
    const titles: Record<string, string> = {
      AccountPlan: "プラン",
      AccountCalendar: "カレンダー",
      AccountSecurity: "ログインとセキュリティ",
    };
    for (const [name, title] of Object.entries(titles)) {
      const screen = stackMocks.screens.find((s) => s.name === name);
      expect(screen, name).toBeTruthy();
      expect((screen!.options as { title?: string }).title).toBe(title);
    }
  });
});
