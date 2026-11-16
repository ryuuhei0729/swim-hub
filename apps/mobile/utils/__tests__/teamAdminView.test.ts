/**
 * teamAdminView.test.ts
 *
 * 対象: apps/mobile/utils/teamAdminView.ts の resolveActiveTabOnAdminViewToggle
 *
 * 利用者ビューへ切り替えたとき、管理者専用タブにいたら members に戻す関数。
 * 現在のタブ構成 (メンバー / 予定 / 出欠 / その他) には管理者専用タブが無いため、
 * どのタブにいても切替でタブは変わらない (管理者ビューでもタブの数・位置を変えない方針)。
 * 管理者専用の判定は teamTabDefs.ts の adminOnly が唯一の定義元なので、
 * ここでは TEAM_TAB_IDS を回して「リセットされるタブの集合」を固定する。
 */

import { describe, it, expect } from "vitest";
import { resolveActiveTabOnAdminViewToggle } from "../teamAdminView";
import { TEAM_TAB_IDS } from "@/components/teams/teamTabDefs";

describe("resolveActiveTabOnAdminViewToggle", () => {
  it.each([...TEAM_TAB_IDS])("OFF にしても %s タブのまま", (tab) => {
    expect(resolveActiveTabOnAdminViewToggle(tab, false)).toBe(tab);
  });

  it.each([...TEAM_TAB_IDS])("ON にしても %s タブのまま", (tab) => {
    expect(resolveActiveTabOnAdminViewToggle(tab, true)).toBe(tab);
  });

  it("利用者ビューへの切替でリセットされるタブは無い", () => {
    const resetTabs = TEAM_TAB_IDS.filter(
      (tab) => resolveActiveTabOnAdminViewToggle(tab, false) !== tab,
    );
    expect(resetTabs).toEqual([]);
  });
});
