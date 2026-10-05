/**
 * RecordLogForm — 本人の記録入力の「目標: xx.xx」バッジ (W3)
 * Sprint Contract goal_target_badge。
 *   - 目標 (本人・この大会・この種目) があるカードに出る。引き継ぎトグル ON で消え、OFF で戻る
 *   - cancelled / 別大会 / 別ユーザー / 大会が削除された目標 (competition_id=null) では出ない
 *   - 目標フックが失敗 (data 無し)・ローディング中でも入力は止まらず、バッジが出ないだけ
 *   - ベストバッジの有無に依らず出る
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import type { ReactElement } from "react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import type { EntryInfo } from "@apps/shared/types/ui";
import type { Goal } from "@apps/shared/types/goals";

const h = vi.hoisted(() => ({
  query: { data: [] as unknown[] | undefined, isError: false, isPending: false },
}));

vi.mock("@apps/shared/hooks/queries/goalTargets", () => ({
  useGoalTargetsQuery: () => h.query,
}));
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: {}, user: { id: "member-1" }, subscription: null }),
}));
vi.mock("@/hooks/useBestTimes", () => ({
  useBestTimes: () => ({ bestTimes: [], loading: false, error: null, loadBestTimes: vi.fn() }),
}));
vi.mock("@/components/video/VideoUploader", () => ({ default: () => null }));

import RecordLogForm from "@/components/forms/record-log/RecordLogForm";
import type { StyleOption } from "@/components/forms/record-log/types";

const renderWithIntl = (ui: ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );

const STYLE_FR100: StyleOption = { id: 3, nameJp: "100m自由形", distance: 100 };
const ENTRY: EntryInfo[] = [{ styleId: 3, styleName: "100m自由形", entryTime: 65.0 }];

const goal = (over: Partial<Goal> = {}) =>
  ({
    id: "g1",
    user_id: "member-1",
    competition_id: "competition-1",
    style_id: 3,
    target_time: 58.5,
    start_time: 62,
    status: "active",
    ...over,
  }) as Goal;

async function open(competitionId = "competition-1") {
  renderWithIntl(
    <RecordLogForm
      isOpen={true}
      onClose={vi.fn()}
      onSubmit={vi.fn().mockResolvedValue(undefined)}
      competitionId={competitionId}
      poolType={0}
      styles={[STYLE_FR100]}
      entryDataList={ENTRY}
    />,
  );
  await screen.findByTestId("record-entry-section-1");
}
const badge = () => screen.queryByTestId("record-goal-target-badge-1");
const label = messages.forms.recordLog.goalTargetLabel;

describe("RecordLogForm — 目標バッジ (W3)", () => {
  beforeEach(() => {
    h.query = { data: [], isError: false, isPending: false };
  });

  it("本人・この大会・この種目の目標があれば「目標: 58.50」が出る (アンカー: フックのモックが効いている)", async () => {
    h.query.data = [goal()];
    await open();
    expect(badge()?.textContent?.replace(/\s+/g, " ").trim()).toBe(`${label}: 58.50`);
  });

  it("目標が無ければ出ない (アンカー対: 同じ描画経路で、データ有りだけが表示を変える)", async () => {
    h.query.data = [];
    await open();
    expect(badge()).toBeNull();
  });

  it("cancelled は出ない / achieved は出る", async () => {
    h.query.data = [goal({ status: "cancelled" })];
    await open();
    expect(badge()).toBeNull();
  });

  it("achieved の目標も出る", async () => {
    h.query.data = [goal({ status: "achieved", target_time: 57.25 })];
    await open();
    expect(badge()?.textContent?.replace(/\s+/g, " ").trim()).toBe(`${label}: 57.25`);
  });

  it("別大会の目標・別ユーザーの目標・別種目の目標は出ない", async () => {
    h.query.data = [
      goal({ competition_id: "competition-OTHER" }),
      goal({ user_id: "someone-else" }),
      goal({ style_id: 9 }),
    ];
    await open();
    expect(badge()).toBeNull();
  });

  it("大会が削除された目標 (competition_id=null) はこの大会の行に出ない", async () => {
    h.query.data = [goal({ competition_id: null })];
    await open();
    expect(badge()).toBeNull();
  });

  it("引き継ぎトグル ON で消え、OFF に戻すと再び出る", async () => {
    h.query.data = [goal()];
    const user = userEvent.setup();
    await open();
    expect(badge()).not.toBeNull();

    const toggle = screen.getByTestId("record-relay-1");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(badge()).toBeNull());

    await user.click(toggle);
    await waitFor(() => expect(badge()).not.toBeNull());
  });

  it("目標の取得に失敗 (data 無し) / ローディング中でも、フォームは描画され入力でき、エラー文は出ない", async () => {
    h.query = { data: undefined, isError: true, isPending: false };
    const user = userEvent.setup();
    await open();
    expect(badge()).toBeNull();
    await user.type(screen.getByTestId("record-time-1"), "58.00");
    expect(screen.queryByTestId("record-form-error")).not.toBeInTheDocument();
    expect(screen.getByTestId("save-record-button")).toBeEnabled();
  });

  it("ローディング中 (data 無し・isPending) も同様にバッジだけ出ない", async () => {
    h.query = { data: undefined, isError: false, isPending: true };
    await open();
    expect(badge()).toBeNull();
    expect(screen.getByTestId("save-record-button")).toBeEnabled();
  });
});
