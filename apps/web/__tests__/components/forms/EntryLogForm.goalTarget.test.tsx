/**
 * EntryLogForm — 個人エントリー入力の「目標: xx.xx」バッジ (W4)
 * Sprint Contract goal_target_badge。
 *   - 本人・この大会 (competitionId prop)・この種目の目標があれば出る
 *   - cancelled / 別大会 / 別ユーザー / 大会削除済み (competition_id=null) / 別種目では出ない
 *   - 種目を切り替えると、その種目の目標に追従する
 *   - 目標取得の失敗・ローディング中でも入力できる (バッジが出ないだけ)
 *   - ベストバッジが無くても出る
 */
import React from "react";
import { renderWithI18n as render, screen, fireEvent } from "../../utils/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import EntryLogForm from "@/components/forms/EntryLogForm";
import ja from "@apps/shared/messages/ja.json";
import type { Goal } from "@apps/shared/types/goals";

const h = vi.hoisted(() => ({
  query: { data: [] as unknown[] | undefined, isError: false, isPending: false },
}));

vi.mock("@apps/shared/hooks/queries/goalTargets", () => ({
  useGoalTargetsQuery: () => h.query,
}));
vi.mock("@/contexts", () => ({
  useAuth: () => ({ supabase: {}, user: { id: "user-1" } }),
}));
vi.mock("@/hooks/useBestTimes", () => ({
  useBestTimes: () => ({ bestTimes: [], loadBestTimes: vi.fn() }),
}));

const STYLES = [
  { id: "1", nameJp: "50m自由形", distance: 50 },
  { id: "2", nameJp: "50m平泳ぎ", distance: 50 },
];

const goal = (over: Partial<Goal> = {}) =>
  ({
    id: "g1",
    user_id: "user-1",
    competition_id: "comp-1",
    style_id: 1,
    target_time: 28.5,
    start_time: 30,
    status: "active",
    ...over,
  }) as Goal;

function renderForm() {
  return render(
    <EntryLogForm
      isOpen={true}
      onClose={vi.fn()}
      onSubmit={vi.fn().mockResolvedValue(undefined)}
      onSkip={vi.fn()}
      competitionId="comp-1"
      poolType={0}
      styles={STYLES}
    />,
  );
}
const badge = () => screen.queryByTestId("entry-goal-target-badge-1");
const text = () => badge()?.textContent?.replace(/\s+/g, " ").trim();
const label = ja.forms.recordLog.goalTargetLabel;

describe("EntryLogForm — 目標バッジ (W4)", () => {
  beforeEach(() => {
    h.query = { data: [], isError: false, isPending: false };
  });

  it("本人・この大会・この種目の目標があれば「目標: 28.50」が出る (アンカー: モックが効いている)", async () => {
    h.query.data = [goal()];
    renderForm();
    await screen.findByTestId("entry-style-1");
    expect(text()).toBe(`${label}: 28.50`);
  });

  it("目標が無ければ出ない (アンカー対)", async () => {
    renderForm();
    await screen.findByTestId("entry-style-1");
    expect(badge()).toBeNull();
  });

  it("achieved の目標も出る", async () => {
    h.query.data = [goal({ status: "achieved", target_time: 27.25 })];
    renderForm();
    await screen.findByTestId("entry-style-1");
    expect(text()).toBe(`${label}: 27.25`);
  });

  it("cancelled / 別大会 / 別ユーザー / 大会削除済み (null) / 別種目では出ない", async () => {
    h.query.data = [
      goal({ status: "cancelled" }),
      goal({ competition_id: "comp-OTHER" }),
      goal({ user_id: "someone-else" }),
      goal({ competition_id: null }),
      goal({ style_id: 2 }),
    ];
    renderForm();
    await screen.findByTestId("entry-style-1");
    expect(badge()).toBeNull();
  });

  it("別ユーザーの目標だけがある場合は出ない (user_id の照合)", async () => {
    h.query.data = [goal({ user_id: "someone-else" })];
    renderForm();
    await screen.findByTestId("entry-style-1");
    expect(badge()).toBeNull();
  });

  it("種目を切り替えると、その種目の目標に追従する", async () => {
    h.query.data = [goal({ style_id: 1, target_time: 28.5 }), goal({ id: "g2", style_id: 2, target_time: 31 })];
    renderForm();
    await screen.findByTestId("entry-style-1");
    expect(text()).toBe(`${label}: 28.50`);
    fireEvent.change(screen.getByTestId("entry-style-1"), { target: { value: "2" } });
    expect(text()).toBe(`${label}: 31.00`);
    fireEvent.change(screen.getByTestId("entry-style-1"), { target: { value: "" } });
    expect(badge()).toBeNull();
  });

  it("目標の取得に失敗 / ローディング中でも、フォームは描画され入力できる (バッジだけ出ない)", async () => {
    h.query = { data: undefined, isError: true, isPending: false };
    renderForm();
    await screen.findByTestId("entry-style-1");
    expect(badge()).toBeNull();
    fireEvent.change(screen.getByTestId("entry-time-1"), { target: { value: "30.00" } });
    expect(screen.getByTestId("entry-time-1")).toHaveValue("30.00");
  });
});
