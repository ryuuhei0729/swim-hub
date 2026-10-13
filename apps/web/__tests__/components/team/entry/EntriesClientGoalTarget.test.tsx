/**
 * EntriesClient — チームエントリー代理入力の「目標: xx.xx」バッジ (W2)
 * Sprint Contract goal_target_badge。
 *   - 目標がある (選手, 大会, 種目) の行に出る。目標なし / cancelled / 別大会 / 別種目では出ない
 *   - メンバー A の目標が B の行に出ない。同じ選手の別種目の行はそれぞれの値が出る
 *   - ベストバッジが無くても出る。ベストバッジがあれば DOM 順でその後ろ
 *   - goalTargets 未指定 (optional) でも壊れない
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { BestTime, Style } from "@apps/shared/types";
import EntriesClient, {
  type ExistingEntryDisplay,
} from "../../../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/entries/_client/EntriesClient";

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: vi.fn().mockImplementation(() => ({
    createBulkEntries: vi.fn(),
    updateEntry: vi.fn(),
    deleteBulkEntries: vi.fn(),
  })),
}));
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "admin-1" }, supabase: {} }),
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return {
    ...original,
    useTranslations: () =>
      ((key: string) => key) as unknown as ReturnType<typeof original.useTranslations>,
    useLocale: () => "ja",
  };
});

const FREE_100: Style = { id: 3, name_jp: "自由形100m", name: "Freestyle", style: "Fr", distance: 100 };
const BREAST_50: Style = { id: 9, name_jp: "平泳ぎ50m", name: "Breaststroke", style: "Br", distance: 50 };

const competition = {
  id: "comp-1",
  title: "テスト大会",
  date: "2999-01-01",
  place: null,
  pool_type: 0 as const,
  entry_status: "open" as const,
  teamName: "テストチーム",
};
const activeMembers = [
  { user_id: "user-1", role: "user", name: "選手A" },
  { user_id: "user-2", role: "user", name: "選手B" },
];

type Props = Parameters<typeof EntriesClient>[0];
type Goals = NonNullable<Props["goalTargets"]>;
const goal = (over: Partial<Goals[number]> = {}): Goals[number] => ({
  competition_id: "comp-1",
  user_id: "user-1",
  style_id: 3,
  target_time: 58.5,
  status: "active",
  ...over,
});
const entry = (id: string, userId: string, styleId: number, name: string): ExistingEntryDisplay => ({
  id, user_id: userId, style_id: styleId, entry_time: 60, note: null, targetUserName: name,
});

function renderIt(entries: ExistingEntryDisplay[], goalTargets?: Goals, best: Record<string, BestTime[]> = {}) {
  return render(
    <EntriesClient
      teamId="team-1"
      competitionId="comp-1"
      competition={competition}
      activeMembers={activeMembers}
      existingEntries={entries}
      styles={[FREE_100, BREAST_50]}
      bestTimesByUser={best}
      returnOrigin="admin"
      goalTargets={goalTargets}
    />,
  );
}
const badges = () => screen.queryAllByTestId(/^entry-goal-target-badge-/);
const texts = () => badges().map((b) => b.textContent?.replace(/\s+/g, " ").trim());

describe("EntriesClient — 目標バッジ", () => {
  it("目標がある行に「goalTargetLabel: 58.50」が出る", () => {
    renderIt([entry("e1", "user-1", 3, "選手A")], [goal()]);
    expect(texts()).toEqual(["goalTargetLabel: 58.50"]);
  });

  it("goalTargets 未指定 (optional) / 空配列では出ない", () => {
    const { unmount } = renderIt([entry("e1", "user-1", 3, "選手A")], undefined);
    expect(badges()).toHaveLength(0);
    unmount();
    renderIt([entry("e1", "user-1", 3, "選手A")], []);
    expect(badges()).toHaveLength(0);
  });

  it("cancelled は出ない / achieved は出る", () => {
    const { unmount } = renderIt([entry("e1", "user-1", 3, "選手A")], [goal({ status: "cancelled" })]);
    expect(badges()).toHaveLength(0);
    unmount();
    renderIt([entry("e1", "user-1", 3, "選手A")], [goal({ status: "achieved" })]);
    expect(texts()).toEqual(["goalTargetLabel: 58.50"]);
  });

  it("別大会の目標・別種目の目標は出ない", () => {
    renderIt([entry("e1", "user-1", 3, "選手A")], [
      goal({ competition_id: "comp-OTHER" }),
      goal({ style_id: 9 }),
    ]);
    expect(badges()).toHaveLength(0);
  });

  /** バッジが属する選手名 (先祖をたどって、選手名を1人だけ含む最初の要素から決める) */
  const ownerOf = (badge: HTMLElement): string => {
    let cur: HTMLElement | null = badge;
    while (cur) {
      const t = cur.textContent ?? "";
      const hasA = t.includes("選手A");
      const hasB = t.includes("選手B");
      if (hasA !== hasB) return hasA ? "選手A" : "選手B";
      if (hasA && hasB) return "both";
      cur = cur.parentElement;
    }
    return "none";
  };

  it("メンバー A の目標がメンバー B の行に出ない (バッジは A の行にだけある)", () => {
    renderIt(
      [entry("e1", "user-1", 3, "選手A"), entry("e2", "user-2", 3, "選手B")],
      [goal({ user_id: "user-1", target_time: 58 })],
    );
    const found = badges();
    expect(found).toHaveLength(1);
    expect(texts()).toEqual(["goalTargetLabel: 58.00"]);
    expect(ownerOf(found[0]!)).toBe("選手A");
  });

  it("同じ種目でも選手ごとの値が、それぞれの選手の行に出る (A と B の取り違えを検出)", () => {
    renderIt(
      [entry("e1", "user-1", 3, "選手A"), entry("e2", "user-2", 3, "選手B")],
      [goal({ user_id: "user-1", target_time: 58 }), goal({ user_id: "user-2", target_time: 61 })],
    );
    const byOwner = Object.fromEntries(badges().map((b) => [ownerOf(b), b.textContent?.replace(/\s+/g, " ").trim()]));
    expect(byOwner).toEqual({
      選手A: "goalTargetLabel: 58.00",
      選手B: "goalTargetLabel: 1:01.00",
    });
  });

  it("同じ選手の別種目の行は、それぞれの種目の目標が出る (種目に追従)", () => {
    renderIt(
      [entry("e1", "user-1", 3, "選手A"), entry("e2", "user-1", 9, "選手A")],
      [goal({ style_id: 3, target_time: 58 }), goal({ style_id: 9, target_time: 31 })],
    );
    expect(texts().sort()).toEqual(["goalTargetLabel: 31.00", "goalTargetLabel: 58.00"]);
  });

  it("ベストタイムが無くても目標は出る。ベストバッジがあればその後ろ (直下) に出る", () => {
    renderIt([entry("e1", "user-1", 3, "選手A")], [goal()], {});
    expect(screen.queryByTestId(/^entry-best-time-badge-/)).toBeNull();
    expect(badges()).toHaveLength(1);
  });

  it("ベストバッジの真下の独立した行 (ベストと同じ親の中で、ベストの次の兄弟) に目標が出る", () => {
    const best: Record<string, BestTime[]> = {
      "user-1": [
        {
          id: "b1", time: 57, created_at: "2025-01-01T00:00:00Z", pool_type: 0, is_relaying: false,
          style_id: 3, style: { name_jp: "自由形100m", distance: 100 },
        },
      ],
    };
    renderIt([entry("e1", "user-1", 3, "選手A")], [goal()], best);
    const b = screen.getByTestId(/^entry-best-time-badge-/);
    const g = screen.getByTestId(/^entry-goal-target-badge-/);
    // 目標は <div> で包まれ、そのラッパーがベストの直後の兄弟 (= 独立した次の行)
    expect(g.parentElement!.tagName).toBe("DIV");
    expect(g.parentElement!.previousElementSibling).toBe(b);
    expect(g.parentElement!.parentElement).toBe(b.parentElement);
  });
});
