// =============================================================================
// TeamTabs.settingsTab.test.tsx — QA Sprint Contract Phase A スケルトン
// =============================================================================
//
// 対象:
//   - apps/mobile/components/teams/teamTabDefs.ts (未実装・Phase B で新規作成)
//   - apps/mobile/components/teams/TeamTabs.tsx (設定タブ追加)
//   - apps/mobile/utils/teamAdminView.ts (定義元の一本化)
//
// ■ QA が Phase A で確定させる実装要件 (Contract 補強 / PM 経由で Developer へ)
//   PM 裁定 D「TeamTabType の三重管理を今回直す」の具体形。
//   `TeamTabs.tsx` は react-native / @expo/vector-icons を import するため、
//   `utils/teamAdminView.ts` から **値** として import すると RN 依存が漏れる。
//   よって定義元は素の TS モジュールに切り出すこと
//   (components/teams/rankings/ の rankingLabels.ts / rowMetrics.ts と同じ方針)。
//
//     // apps/mobile/components/teams/teamTabDefs.ts
//     export const TEAM_TAB_DEFS = [
//       { id: "members",       nameKey: "teams.mobile.tabMembers",       icon: "users" },
//       { id: "groups",        nameKey: "teams.mobile.tabGroups",        icon: "layers",      adminOnly: true },
//       { id: "practices",     nameKey: "teams.mobile.tabPractices",     icon: "clock" },
//       { id: "competitions",  nameKey: "teams.mobile.tabCompetitions",  icon: "award" },
//       { id: "attendance",    nameKey: "teams.mobile.tabAttendance",    icon: "clipboard" },
//       { id: "rankings",      nameKey: "teams.mobile.tabRankings",      icon: "bar-chart-2" },
//       { id: "announcements", nameKey: "teams.mobile.tabAnnouncements", icon: "bell",        adminOnly: true },
//       { id: "settings",      nameKey: "teams.mobile.tabSettings",      icon: "settings" },
//     ] as const;
//     export type TeamTabType = (typeof TEAM_TAB_DEFS)[number]["id"];
//     export const TEAM_TAB_IDS: readonly TeamTabType[];            // 表示順
//     export const ADMIN_ONLY_TEAM_TAB_IDS: readonly TeamTabType[]; // adminOnly:true のみ
//
//   `TeamTabs.tsx` は `TEAM_TAB_DEFS` を描画に使い、`TeamTabType` を
//   **再 export** すること (navigation/types.ts・TeamDetailScreen.tsx・
//   components/teams/index.ts の既存 import を壊さないため)。
//   `utils/teamAdminView.ts` は `ADMIN_ONLY_TEAM_TAB_IDS` を参照して判定すること
//   (現行は "announcements" / "groups" を手書きしており、これが3箇所目の重複)。
//
// ■ Sprint Contract 検証観点
//   [V-A01] 設定タブは非管理者にも表示される (全メンバー向け)
//   [V-A02] 設定タブは管理者にも表示される
//   [V-A03] 設定タブをタップすると onTabChange("settings") が呼ばれる
//   [V-A04] 定義元は1本 — TEAM_TAB_IDS / ADMIN_ONLY_TEAM_TAB_IDS が期待どおり
//   [V-A05] 設定タブは adminOnly ではない
//   [V-A06] 描画タブ数は 非管理者 6 / 管理者 8 (ハード literal。増減で必ず落ちる)
//   [V-A07] teamAdminView の「利用者ビューへ戻すとリセットされるタブ」の集合が
//           ADMIN_ONLY_TEAM_TAB_IDS と一致する (= 設定タブではリセットされない)
//
// ■ 既存テストとの関係
//   apps/mobile/components/teams/__tests__/TeamTabs.test.tsx は
//   タブ数を 5 / 7 で厳密一致させているため設定タブ追加で赤くなる。
//   **これは実装が正で期待値が古い正常な赤**であり、Phase B で QA が 6 / 8 に更新する
//   (Developer は触らないこと)。
//
//   apps/mobile/utils/__tests__/teamAdminView.test.ts の
//   「[V-11] リセットされるタブは announcements と groups だけである」は
//   `allTabs` を **手書き配列**で持っているため、設定タブを足しても赤くならない
//   (= 新タブが検査対象から静かに漏れる false negative)。
//   本ファイルの [V-A07] は TEAM_TAB_IDS から導出するため漏れない。
// =============================================================================

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { TeamTabs, type TeamTabType } from "../TeamTabs";
import { TEAM_TAB_IDS, ADMIN_ONLY_TEAM_TAB_IDS } from "../teamTabDefs";
import { resolveActiveTabOnAdminViewToggle } from "@/utils/teamAdminView";

const makeProps = (
  overrides: Partial<{
    activeTab: TeamTabType;
    isAdmin: boolean;
    onTabChange: (tab: TeamTabType) => void;
  }> = {},
) => ({
  activeTab: "members" as TeamTabType,
  isAdmin: false,
  onTabChange: vi.fn(),
  ...overrides,
});

describe("[V-A01〜A03] TeamTabs 設定タブ", () => {
  it("[V-A01] 非管理者にも設定タブが表示される", () => {
    render(<TeamTabs {...makeProps({ isAdmin: false })} />);
    expect(screen.getByTestId("icon-settings")).toBeTruthy();
  });

  it("[V-A02] 管理者にも設定タブが表示される", () => {
    render(<TeamTabs {...makeProps({ isAdmin: true })} />);
    expect(screen.getByTestId("icon-settings")).toBeTruthy();
  });

  it("[V-A03] 設定タブをタップすると onTabChange('settings') が呼ばれる", () => {
    const onTabChange = vi.fn();
    render(<TeamTabs {...makeProps({ isAdmin: false, onTabChange })} />);

    const settingsTab = screen.getByTestId("icon-settings").closest("button");
    expect(settingsTab, "設定タブのボタンが見つからない").not.toBeNull();
    fireEvent.click(settingsTab!);

    expect(onTabChange).toHaveBeenCalledTimes(1);
    expect(onTabChange).toHaveBeenCalledWith("settings");
  });

  it("[V-A06] 描画されるタブ数は 非管理者 6 / 管理者 8 である", () => {
    const { rerender } = render(<TeamTabs {...makeProps({ isAdmin: false })} />);
    expect(screen.getAllByRole("button")).toHaveLength(6);

    rerender(<TeamTabs activeTab="members" isAdmin onTabChange={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(8);
  });

  // 「描画」と「定義」が同じ1本から出ていることの確認。
  // 件数の literal ([V-A06]) と併せて、片方だけ足す事故を両方向で検出する
  it("[V-A06 補助] 管理者に描画されるタブ数は TEAM_TAB_IDS の件数と一致する", () => {
    render(<TeamTabs {...makeProps({ isAdmin: true })} />);
    expect(screen.getAllByRole("button")).toHaveLength(TEAM_TAB_IDS.length);
  });
});

describe("[V-A04/A05] タブ定義の単一定義元", () => {
  it("[V-A04] TEAM_TAB_IDS は表示順どおりで settings を最後に含む", () => {
    expect([...TEAM_TAB_IDS]).toEqual([
      "members",
      "groups",
      "practices",
      "competitions",
      "attendance",
      "rankings",
      "announcements",
      "settings",
    ]);
  });

  it("[V-A05] ADMIN_ONLY_TEAM_TAB_IDS は groups と announcements のみ (settings は含まない)", () => {
    expect([...ADMIN_ONLY_TEAM_TAB_IDS]).toEqual(["groups", "announcements"]);
  });

  it("[V-A05 補助] ADMIN_ONLY_TEAM_TAB_IDS は TEAM_TAB_IDS の部分集合である", () => {
    const all = new Set<string>(TEAM_TAB_IDS);
    expect(ADMIN_ONLY_TEAM_TAB_IDS.every((id) => all.has(id))).toBe(true);
  });
});

describe("[V-A07] 管理者ビュー切替と設定タブ", () => {
  // 手書きの allTabs を使わない。新タブを足すと自動で検査対象に入る
  it("[V-A07] 利用者ビューへ戻したときリセットされるタブは ADMIN_ONLY_TEAM_TAB_IDS と完全一致する", () => {
    const resetTabs = TEAM_TAB_IDS.filter(
      (tab) => resolveActiveTabOnAdminViewToggle(tab, false) !== tab,
    );
    expect([...resetTabs]).toEqual([...ADMIN_ONLY_TEAM_TAB_IDS]);
  });

  it("[V-A07] 設定タブを見ている状態で利用者ビューへ戻しても settings のままである", () => {
    expect(resolveActiveTabOnAdminViewToggle("settings", false)).toBe("settings");
    expect(resolveActiveTabOnAdminViewToggle("settings", true)).toBe("settings");
  });

  it("[V-A07 対照] 同じ操作で announcements は members にリセットされる (差が出ている)", () => {
    expect(resolveActiveTabOnAdminViewToggle("announcements", false)).toBe("members");
    expect(resolveActiveTabOnAdminViewToggle("settings", false)).not.toBe("members");
  });
});
