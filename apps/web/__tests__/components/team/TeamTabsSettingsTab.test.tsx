/**
 * TeamTabsSettingsTab.test.tsx — QA Sprint Contract Phase A スケルトン (web)
 *
 * 対象: apps/web/components/team/TeamTabs.tsx (TEAM_TAB_DEFS への settings 追加)
 *
 * ■ スコープA (web)
 *   チーム詳細 (一般ページ) に「設定」タブを追加する。設定タブは **全メンバー**に表示する。
 *   `TEAM_TAB_DEFS` が型・表示順・`?tab=` ホワイトリスト (isTeamTabType) の
 *   唯一の定義元なので、ここに 1 行足すだけで3者が揃う (既存 docstring の方針どおり)。
 *
 * ■ Sprint Contract 検証観点
 *   [V-A60] タブがちょうど 6 つで、順序は 出欠 / メンバー / 練習 / 大会 / ランキング / 設定
 *   [V-A61] isAdmin=false でも設定タブは表示される (全メンバー向け)
 *   [V-A62] 設定タブをクリックすると onTabChange("settings") が呼ばれる
 *   [V-A63] isTeamTabType("settings") が true を返す
 *           (?tab=settings で直接着地できる。ホワイトリスト漏れは型エラーも
 *            lint エラーも出さずに黙って無視されるので明示的に固定する)
 *   [V-A64] 近い綴り (?tab=setting / ?tab=settings-admin) は通さない
 *
 * ■ 既存テストとの関係
 *   apps/web/__tests__/components/team/TeamRankingsTabWiring.test.tsx の
 *     - 「タブがちょうど 5 つで、順序は 出欠 / メンバー / 練習 / 大会 / ランキング」
 *     - 「[V-33] 一般タブ: 描画される5タブがすべて isTeamTabType を通り、rankings も含まれる」
 *   は設定タブ追加で赤くなる。**実装が正で期待値が古い正常な赤**であり、
 *   Phase B で QA が 6 タブへ更新する (Developer は触らないこと)。
 *   ⚠️ Planner の申し送りにこのファイルは含まれていなかった (QA が find で実測して追加)。
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, it, expect, vi } from "vitest";

import messages from "@apps/shared/messages/ja.json";
import TeamTabs, { isTeamTabType } from "../../../components/team/TeamTabs";

function wrap(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

/**
 * 設定タブのラベル。キーが未追加のとき `name: undefined` で
 * 「Found multiple elements with the role button」という無関係なエラーに化けるのを避け、
 * 何が足りないのかを明示して落とす。
 */
function settingsTabLabel(): string {
  const value = (messages.teams.tabs as Record<string, string>).settings;
  if (typeof value !== "string" || value === "") {
    throw new Error("i18n キー teams.tabs.settings が shared/messages/ja.json に存在しない");
  }
  return value;
}

describe("[V-A60〜A62] web チーム詳細の設定タブ", () => {
  it("[V-A60] タブがちょうど 6 つで、順序は 出欠 / メンバー / 練習 / 大会 / ランキング / 設定", () => {
    wrap(<TeamTabs activeTab="members" onTabChange={vi.fn()} />);

    const labels = screen.getAllByRole("button").map((button) => button.textContent?.trim());
    expect(labels).toEqual([
      messages.teams.tabs.attendance,
      messages.teams.tabs.members,
      messages.teams.tabs.practices,
      messages.teams.tabs.competitions,
      messages.teams.tabs.rankings,
      // Phase A 時点ではキー自体が無いため undefined になり、ここで落ちる
      settingsTabLabel(),
    ]);
  });

  it("[V-A61] isAdmin=false でも設定タブは表示される", () => {
    wrap(<TeamTabs activeTab="members" isAdmin={false} onTabChange={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: settingsTabLabel() }),
    ).toBeInTheDocument();
  });

  it("[V-A62] 設定タブをクリックすると onTabChange('settings') が呼ばれる", async () => {
    const onTabChange = vi.fn();
    wrap(<TeamTabs activeTab="members" onTabChange={onTabChange} />);

    await userEvent.click(
      screen.getByRole("button", { name: settingsTabLabel() }),
    );

    expect(onTabChange).toHaveBeenCalledTimes(1);
    expect(onTabChange).toHaveBeenCalledWith("settings");
  });
});

describe("[V-A63/A64] ?tab= のホワイトリスト", () => {
  it("[V-A63] isTeamTabType('settings') が true", () => {
    expect(isTeamTabType("settings")).toBe(true);
  });

  it("[V-A63 対照] 既存のタブ ID も引き続き通る", () => {
    for (const id of ["attendance", "members", "practices", "competitions", "rankings"]) {
      expect(isTeamTabType(id), id).toBe(true);
    }
  });

  it("[V-A64] 近い綴りは通さない", () => {
    for (const id of ["setting", "settings-admin", "Settings", "settings "]) {
      expect(isTeamTabType(id), id).toBe(false);
    }
  });

  it("[V-A63] 描画される全タブが isTeamTabType を通る (定義元が1本であることの確認)", () => {
    wrap(<TeamTabs activeTab="members" onTabChange={vi.fn()} />);

    const labelToId = new Map<string, string>([
      [messages.teams.tabs.attendance, "attendance"],
      [messages.teams.tabs.members, "members"],
      [messages.teams.tabs.practices, "practices"],
      [messages.teams.tabs.competitions, "competitions"],
      [messages.teams.tabs.rankings, "rankings"],
      [settingsTabLabel(), "settings"],
    ]);

    const rendered = screen.getAllByRole("button").map((b) => b.textContent?.trim() ?? "");
    expect(rendered).toHaveLength(6);
    for (const label of rendered) {
      const id = labelToId.get(label);
      expect(id, `未知のタブラベル: ${label}`).toBeDefined();
      expect(isTeamTabType(id!)).toBe(true);
    }
  });
});
