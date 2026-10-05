/**
 * CompetitionTabModal — 大会タブモーダル エントリータブの「目標: xx.xx」バッジ (W5)
 * Sprint Contract goal_target_badge。
 *   - 大会が未保存 (editingCompetitionId === null) の間は出さず、目標の取得 (enabled) もしない
 *   - 保存済み大会 (id あり) では、本人・その大会・その種目の目標が出る
 *   - cancelled / 別大会 / 別ユーザー / 大会削除済み (null) / 別種目では出ない
 *   - 目標取得の失敗・ローディング中でも入力できる
 */

import React from "react";
import { renderWithI18n as render, screen, fireEvent } from "../../utils/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StyleOption } from "@/components/forms/record-log/types";
import CompetitionTabModal from "@/components/forms/CompetitionTabModal";
import ja from "@apps/shared/messages/ja.json";
import type { Goal } from "@apps/shared/types/goals";

const h = vi.hoisted(() => ({
  query: { data: [] as unknown[] | undefined, isError: false, isPending: false },
  optionsSeen: [] as Array<{ enabled?: boolean } | undefined>,
}));

vi.mock("@apps/shared/hooks/queries/goalTargets", () => ({
  useGoalTargetsQuery: (_s: unknown, options?: { enabled?: boolean }) => {
    h.optionsSeen.push(options);
    return h.query;
  },
}));

vi.mock("@/contexts", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    subscription: null,
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: null, error: null })) })) })),
      })),
    },
  }),
}));

vi.mock("@/hooks/useBestTimes", () => ({
  useBestTimes: () => ({ bestTimes: [], loadBestTimes: vi.fn() }),
}));

vi.mock("@apps/shared/api", () => ({
  CompetitionAPI: class {
    getUniqueCompetitionPlaces = vi.fn().mockResolvedValue([]);
  },
}));

// 記録タブの RecordLogEntry はスタブ。親 (CompetitionTabModal) が渡す goalTargetTime を data 属性に出し、
// 配線を assert する。操作は props の onStyleChange / onToggleRelaying を呼ぶボタンで行う
vi.mock("@/components/forms/record-log/components/RecordLogEntry", () => ({
  default: (props: {
    goalTargetTime?: number | null;
    formData: { styleId: string; isRelaying: boolean };
    onStyleChange: (v: string) => void;
    onToggleRelaying: (c: boolean) => void;
  }) => (
    <div
      data-testid="record-log-entry-stub"
      data-goal={props.goalTargetTime === null || props.goalTargetTime === undefined ? "none" : String(props.goalTargetTime)}
      data-style={props.formData.styleId}
      data-relaying={String(props.formData.isRelaying)}
    >
      <button type="button" data-testid="stub-pick-style" onClick={() => props.onStyleChange("1")} />
      <button type="button" data-testid="stub-toggle-relay-on" onClick={() => props.onToggleRelaying(true)} />
      <button type="button" data-testid="stub-toggle-relay-off" onClick={() => props.onToggleRelaying(false)} />
    </div>
  ),
}));


const STYLE_FREE_50: StyleOption = { id: 1, nameJp: "50m自由形", distance: 50 };
const STYLE_BREAST_50: StyleOption = { id: 8, nameJp: "50m平泳ぎ", distance: 50 };

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

function renderModal(editingCompetitionId: string | null) {
  return render(
    <CompetitionTabModal
      isOpen={true}
      onClose={vi.fn()}
      onSave={vi.fn().mockResolvedValue(undefined)}
      selectedDate={new Date("2099-01-01")}
      editingData={null}
      editingCompetitionId={editingCompetitionId}
      styles={[STYLE_FREE_50, STYLE_BREAST_50]}
      isLoading={false}
      initialTab="entry"
    />,
  );
}
const badge = () => screen.queryByTestId("entry-goal-target-badge-1");
const label = ja.forms.recordLog.goalTargetLabel;

describe("CompetitionTabModal — 目標バッジ (W5)", () => {
  beforeEach(() => {
    h.query = { data: [], isError: false, isPending: false };
    h.optionsSeen = [];
  });

  it("保存済み大会 (id あり): 本人・その大会・その種目の目標が出る (アンカー: モックが効いている)", async () => {
    h.query.data = [goal()];
    renderModal("comp-1");
    await screen.findByTestId("entry-time-1");
    expect(badge()?.textContent?.replace(/\s+/g, " ").trim()).toBe(`${label}: 28.50`);
  });

  it("保存済み大会でも、目標が無ければ出ない (アンカー対)", async () => {
    renderModal("comp-1");
    await screen.findByTestId("entry-time-1");
    expect(badge()).toBeNull();
  });

  it("大会が未保存 (editingCompetitionId=null): 目標があっても出ず、取得は enabled:false になる", async () => {
    h.query.data = [goal({ competition_id: "comp-1" }), goal({ id: "g2", competition_id: null })];
    renderModal(null);
    await screen.findByTestId("entry-time-1");
    expect(badge()).toBeNull();
    expect(h.optionsSeen.length).toBeGreaterThan(0);
    expect(h.optionsSeen.every((o) => o?.enabled === false)).toBe(true);
  });

  it("保存済み大会では取得が enabled になる", async () => {
    renderModal("comp-1");
    await screen.findByTestId("entry-time-1");
    expect(h.optionsSeen.some((o) => o?.enabled === true)).toBe(true);
  });

  it("cancelled / 別大会 / 別ユーザー / 大会削除済み (null) / 別種目では出ない", async () => {
    h.query.data = [
      goal({ status: "cancelled" }),
      goal({ competition_id: "comp-OTHER" }),
      goal({ user_id: "someone-else" }),
      goal({ competition_id: null }),
      goal({ style_id: 8 }),
    ];
    renderModal("comp-1");
    await screen.findByTestId("entry-time-1");
    expect(badge()).toBeNull();
  });

  it("目標の取得に失敗 (data 無し) でも入力できる (バッジだけ出ない)", async () => {
    h.query = { data: undefined, isError: true, isPending: false };
    renderModal("comp-1");
    const input = await screen.findByTestId("entry-time-1");
    expect(badge()).toBeNull();
    fireEvent.change(input, { target: { value: "30.00" } });
    expect(screen.getByTestId("entry-time-1")).toHaveValue("30.00");
  });
});

describe("CompetitionTabModal — 記録タブの目標の配線 (RecordLogEntry の goalTargetTime)", () => {
  beforeEach(() => {
    h.query = { data: [], isError: false, isPending: false };
    h.optionsSeen = [];
  });

  function renderRecordTab(editingCompetitionId: string | null) {
    return render(
      <CompetitionTabModal
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
        selectedDate={new Date("2020-01-01")}
        editingData={null}
        editingCompetitionId={editingCompetitionId}
        styles={[STYLE_FREE_50, STYLE_BREAST_50]}
        isLoading={false}
        initialTab="record"
      />,
    );
  }
  const stub = () => screen.getByTestId("record-log-entry-stub");

  it("種目を選ぶと、その種目の目標タイムが goalTargetTime として渡る。引き継ぎ ON で null、OFF で戻る", async () => {
    h.query.data = [goal({ style_id: 1, target_time: 28.5 })];
    renderRecordTab("comp-1");
    await screen.findByTestId("record-log-entry-stub");
    fireEvent.click(screen.getByTestId("stub-pick-style"));
    expect(stub().dataset.style).toBe("1");
    expect(stub().dataset.goal).toBe("28.5");

    fireEvent.click(screen.getByTestId("stub-toggle-relay-on"));
    expect(stub().dataset.relaying).toBe("true");
    expect(stub().dataset.goal).toBe("none");

    fireEvent.click(screen.getByTestId("stub-toggle-relay-off"));
    expect(stub().dataset.goal).toBe("28.5");
  });

  it("目標が無い / 別大会の目標なら null が渡る", async () => {
    h.query.data = [goal({ style_id: 1, competition_id: "comp-OTHER" })];
    renderRecordTab("comp-1");
    await screen.findByTestId("record-log-entry-stub");
    fireEvent.click(screen.getByTestId("stub-pick-style"));
    expect(stub().dataset.goal).toBe("none");
  });

  it("大会が未保存 (id なし) なら、目標があっても null が渡る", async () => {
    h.query.data = [goal({ style_id: 1 })];
    renderRecordTab(null);
    await screen.findByTestId("record-log-entry-stub");
    fireEvent.click(screen.getByTestId("stub-pick-style"));
    expect(stub().dataset.goal).toBe("none");
  });
});
