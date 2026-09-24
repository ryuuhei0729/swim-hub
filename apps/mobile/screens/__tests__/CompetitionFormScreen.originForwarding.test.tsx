/**
 * CompetitionFormScreen.originForwarding.test.tsx
 *
 * Sprint Contract v3 — D2 / BC-1 の検証。
 *
 * ■ 対象
 *   `screens/CompetitionBasicFormScreen.tsx` (route 名は "CompetitionForm"。D2 で
 *   リダイレクトシムに置換された)。`navigation.replace("CompetitionTabForm", {...})` で
 *   route params を転送するだけの画面。
 *
 * ■ 検証観点
 *   [CFS-1] origin='teamAdmin' が competitionId/date/teamId と共存して**厳密一致**で転送される
 *   [CFS-2] (BC-1) origin 未指定のとき、replace の params に **origin キー自体が存在しない**
 *   [CFS-3] 新規作成 (competitionId 無し) でも既存キーの転送が壊れない
 *   [CFS-4] (境界値) teamId が空文字 '' のとき teamId キー自体が生えない
 *           (`...(x ? {x} : {})` のスプレッド形が守られているか)
 *   [CFS-5] (境界値) competitionId が空文字 '' のとき competitionId キー自体が生えない
 *   [CFS-6] 遷移先ルート名が "CompetitionTabForm" であり、replace はちょうど1回
 *
 * ■ トートロジー防止メモ
 *   - `toEqual` の厳密一致で見る。`objectContaining` は「余分なキーが無いこと」を
 *     検証できないため使わない (BC-1 は「キーが存在しないこと」が要件)。
 *   - `undefined` を値に持つキーがあっても `toEqual` は等価判定してしまうので、
 *     `Object.prototype.hasOwnProperty` で**キーの実在**を直接見る。
 *   - PracticeFormScreen.originForwarding.test.tsx (PFS-1/2/3) と同型。
 */

import React from "react";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CompetitionBasicFormScreen } from "@/screens/CompetitionBasicFormScreen";

const h = vi.hoisted(() => ({
  mockUseRoute: vi.fn(),
  mockReplace: vi.fn(),
}));

vi.mock("@react-navigation/native", () => ({
  useRoute: h.mockUseRoute,
  useNavigation: () => ({
    replace: h.mockReplace,
  }),
}));

/** replace の第2引数 (params) を型無しで取り出す */
function replacedParams(): Record<string, unknown> {
  const call = h.mockReplace.mock.calls[0] as [string, Record<string, unknown>] | undefined;
  if (!call) throw new Error("navigation.replace が一度も呼ばれていない");
  return call[1];
}

function ownKeys(): string[] {
  return Object.keys(replacedParams()).sort();
}

describe("CompetitionBasicFormScreen — リダイレクトシムの params 転送 (Sprint Contract v3 D2/BC-1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[CFS-1] origin='teamAdmin' が competitionId/date/teamId と共存して厳密一致で転送される", async () => {
    h.mockUseRoute.mockReturnValue({
      params: {
        competitionId: "comp-cfs-1",
        date: "2026-07-11",
        teamId: "team-cfs-1",
        origin: "teamAdmin",
      },
    });

    render(<CompetitionBasicFormScreen />);

    await waitFor(() => expect(h.mockReplace).toHaveBeenCalledTimes(1));
    expect(h.mockReplace).toHaveBeenCalledWith("CompetitionTabForm", {
      competitionId: "comp-cfs-1",
      date: "2026-07-11",
      teamId: "team-cfs-1",
      origin: "teamAdmin",
    });
    expect(ownKeys()).toEqual(["competitionId", "date", "origin", "teamId"]);
  });

  it("[CFS-2 / BC-1] origin 未指定のとき、replace の params に origin キー自体が存在しない", async () => {
    h.mockUseRoute.mockReturnValue({
      params: { competitionId: "comp-cfs-2", date: "2026-07-12", teamId: "team-cfs-2" },
    });

    render(<CompetitionBasicFormScreen />);

    await waitFor(() => expect(h.mockReplace).toHaveBeenCalledTimes(1));
    const params = replacedParams();
    expect(params).toEqual({
      competitionId: "comp-cfs-2",
      date: "2026-07-12",
      teamId: "team-cfs-2",
    });
    expect(Object.prototype.hasOwnProperty.call(params, "origin")).toBe(false);
    expect(ownKeys()).toEqual(["competitionId", "date", "teamId"]);
  });

  it("[CFS-3] 新規作成 (competitionId 無し) + teamId + origin='teamAdmin' でも既存キーの転送が壊れない", async () => {
    h.mockUseRoute.mockReturnValue({
      params: { date: "2026-07-13", teamId: "team-cfs-3", origin: "teamAdmin" },
    });

    render(<CompetitionBasicFormScreen />);

    await waitFor(() => expect(h.mockReplace).toHaveBeenCalledTimes(1));
    expect(h.mockReplace).toHaveBeenCalledWith("CompetitionTabForm", {
      date: "2026-07-13",
      teamId: "team-cfs-3",
      origin: "teamAdmin",
    });
    expect(Object.prototype.hasOwnProperty.call(replacedParams(), "competitionId")).toBe(false);
  });

  it("[CFS-4 / 境界値] teamId が空文字 '' のとき teamId キー自体が生えない (undefined 値のキーを作らない)", async () => {
    h.mockUseRoute.mockReturnValue({
      params: { competitionId: "comp-cfs-4", date: "2026-07-14", teamId: "", origin: "teamAdmin" },
    });

    render(<CompetitionBasicFormScreen />);

    await waitFor(() => expect(h.mockReplace).toHaveBeenCalledTimes(1));
    const params = replacedParams();
    expect(Object.prototype.hasOwnProperty.call(params, "teamId")).toBe(false);
    expect(ownKeys()).toEqual(["competitionId", "date", "origin"]);
  });

  it("[CFS-5 / 境界値] competitionId が空文字 '' のとき competitionId キー自体が生えない", async () => {
    h.mockUseRoute.mockReturnValue({
      params: { competitionId: "", date: "2026-07-15", teamId: "team-cfs-5" },
    });

    render(<CompetitionBasicFormScreen />);

    await waitFor(() => expect(h.mockReplace).toHaveBeenCalledTimes(1));
    const params = replacedParams();
    expect(Object.prototype.hasOwnProperty.call(params, "competitionId")).toBe(false);
    expect(ownKeys()).toEqual(["date", "teamId"]);
  });

  it("[CFS-6] 遷移先ルート名は 'CompetitionTabForm' で、replace はちょうど1回 (二重遷移しない)", async () => {
    h.mockUseRoute.mockReturnValue({
      params: { competitionId: "comp-cfs-6", date: "2026-07-16", teamId: "team-cfs-6", origin: "teamAdmin" },
    });

    render(<CompetitionBasicFormScreen />);

    await waitFor(() => expect(h.mockReplace).toHaveBeenCalledTimes(1));
    const [routeName] = h.mockReplace.mock.calls[0] as [string, unknown];
    expect(routeName).toBe("CompetitionTabForm");
    // 旧画面の自前フォーム経路 (CompetitionForm へ戻す等) に落ちていないこと
    expect(h.mockReplace).toHaveBeenCalledTimes(1);
  });
});
