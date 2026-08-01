/**
 * teamAdminView.test.ts — QA Sprint Contract Phase A スケルトン
 *
 * 対象: apps/mobile/utils/teamAdminView.ts (未実装・Phase B で App Developer が新規作成)
 *
 * QA 追加要件（検証可能性のための Sprint Contract 補強）:
 *   TeamDetailScreen.handleAdminViewChange の「OFF 時に activeTab が
 *   announcements/groups なら members にリセットする」ロジック（既存 L326-334 相当）を
 *   画面から追い出せない場合、TeamDetailScreen 全体を jsdom でレンダリングしないと
 *   検証できず危険（useTeamsQuery / useListPendingMembersQuery / useAuth 等、依存が重い）。
 *   既存の screens/__tests__/tabFormScreen.saveLogic.test.ts や
 *   teamRecordBulk.*.test.ts と同じ方針で、この決定ロジックを
 *   utils/teamAdminView.ts の純関数として抽出することを App Developer に要求する。
 *
 *   期待シグネチャ:
 *     export function resolveActiveTabOnAdminViewToggle(
 *       currentTab: TeamTabType,
 *       nextIsAdminView: boolean,
 *     ): TeamTabType
 *
 *   TeamDetailScreen.handleAdminViewChange は
 *     const next = !isAdminView;
 *     setIsAdminView(next);
 *     setActiveTab((prev) => resolveActiveTabOnAdminViewToggle(prev, next));
 *   のように、この関数の戻り値をそのまま setActiveTab に渡すこと
 *   （ロジックの再実装・重複は禁止。トートロジー防止のため実物を import してテストする）。
 *
 * Sprint Contract 検証観点:
 *   [V-07] OFF (nextIsAdminView=false) かつ currentTab="announcements" → "members" を返す
 *   [V-08] OFF かつ currentTab="groups" → "members" を返す
 *   [V-09] OFF かつ currentTab が members/practices/competitions/attendance →
 *          そのまま維持される（リセットしない）
 *   [V-10] ON (nextIsAdminView=true) のときは currentTab に関わらず変更しない
 */

import { describe, it, expect } from "vitest";
import { resolveActiveTabOnAdminViewToggle } from "../teamAdminView";
import type { TeamTabType } from "@/components/teams/TeamTabs";

describe("resolveActiveTabOnAdminViewToggle", () => {
  // [V-07]
  it("OFF かつ announcements タブのとき members にリセットする", () => {
    expect(resolveActiveTabOnAdminViewToggle("announcements", false)).toBe("members");
  });

  // [V-08]
  it("OFF かつ groups タブのとき members にリセットする", () => {
    expect(resolveActiveTabOnAdminViewToggle("groups", false)).toBe("members");
  });

  // [V-09] リセット不要な4タブ（境界値: 全パターンを網羅）
  it.each<TeamTabType>(["members", "practices", "competitions", "attendance"])(
    "OFF かつ %s タブのときはそのまま維持する（リセットしない）",
    (tab) => {
      expect(resolveActiveTabOnAdminViewToggle(tab, false)).toBe(tab);
    },
  );

  // [V-10] ON のときは常に維持する（管理者専用タブへの遷移時にリセットされては困る）
  it.each<TeamTabType>([
    "members",
    "groups",
    "practices",
    "competitions",
    "attendance",
    "announcements",
  ])("ON のときは %s タブのままである（リセットしない）", (tab) => {
    expect(resolveActiveTabOnAdminViewToggle(tab, true)).toBe(tab);
  });

  // 既存 activeTab が既に "members" でOFFにする場合（冪等性の確認）
  it("OFF かつ既に members のとき members のまま（冪等）", () => {
    expect(resolveActiveTabOnAdminViewToggle("members", false)).toBe("members");
  });
});
