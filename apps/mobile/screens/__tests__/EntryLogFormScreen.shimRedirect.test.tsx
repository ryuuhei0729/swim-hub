/**
 * EntryLogFormScreen — リダイレクトシムの検証。
 *
 * 背景: このスプリントで EntryLogFormScreen は 1005 行の独自フォーム実装から
 * 39 行のリダイレクトシム (screens/EntryLogFormScreen.tsx) に置き換わった。
 * 旧フォームロジックを検証していた screens/__tests__/EntryLogFormScreen.teamId.test.tsx
 * (実装を import せずナビゲーション引数生成ロジックを再実装したトートロジー) と
 * screens/__tests__/EntryLogFormScreen.saveReturnTarget.test.tsx (シム化で render 不能、
 * navigation.replace is not a function で全滅) は削除した。
 *
 * 本ファイルはシムの唯一の責務 — マウント直後に CompetitionTabForm へ
 * navigation.replace すること — だけを、実装 (EntryLogFormScreen.tsx) を
 * import した実 render で検証する。
 */

import React from "react";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { EntryLogFormScreen } from "@/screens/EntryLogFormScreen";

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

describe("EntryLogFormScreen — リダイレクトシム", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("teamId あり: マウント直後に CompetitionTabForm へ { competitionId, date, teamId, initialTab: 'entry' } で replace される", async () => {
    h.mockUseRoute.mockReturnValue({
      params: { competitionId: "comp-1", date: "2026-06-16", teamId: "team-1" },
    });

    render(<EntryLogFormScreen />);

    await waitFor(() => expect(h.mockReplace).toHaveBeenCalledTimes(1));
    expect(h.mockReplace).toHaveBeenCalledWith("CompetitionTabForm", {
      competitionId: "comp-1",
      date: "2026-06-16",
      teamId: "team-1",
      initialTab: "entry",
    });
  });

  it("teamId なし (TeamAnnouncementsSection 経由の個人フロー): replace のパラメータに teamId キー自体が含まれない", async () => {
    h.mockUseRoute.mockReturnValue({
      params: { competitionId: "comp-2", date: "2026-06-16" },
    });

    render(<EntryLogFormScreen />);

    await waitFor(() => expect(h.mockReplace).toHaveBeenCalledTimes(1));
    const [, params] = h.mockReplace.mock.calls[0] as [string, Record<string, unknown>];
    expect(params).toEqual({ competitionId: "comp-2", date: "2026-06-16", initialTab: "entry" });
    expect(Object.prototype.hasOwnProperty.call(params, "teamId")).toBe(false);
  });
});
