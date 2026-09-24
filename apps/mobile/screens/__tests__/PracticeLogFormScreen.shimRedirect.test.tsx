/**
 * PracticeLogFormScreen — リダイレクトシムの検証。
 *
 * 背景: このスプリントで PracticeLogFormScreen は 1122 行の独自フォーム実装から
 * 39 行のリダイレクトシム (screens/PracticeLogFormScreen.tsx) に置き換わった。
 * 旧フォームロジックを検証していた screens/__tests__/PracticeLogFormScreen.teamId.test.tsx
 * (実装を import せずナビゲーション引数生成ロジックを再実装したトートロジー) と
 * screens/__tests__/PracticeLogFormScreen.tagModalRace.test.tsx (シム化で render 不能、
 * navigation.replace is not a function で全滅) は削除した。
 *
 * 本ファイルはシムの唯一の責務 — マウント直後に PracticeTabForm へ
 * navigation.replace すること — だけを、実装 (PracticeLogFormScreen.tsx) を
 * import した実 render で検証する。
 */

import React from "react";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PracticeLogFormScreen } from "@/screens/PracticeLogFormScreen";

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

describe("PracticeLogFormScreen — リダイレクトシム", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("teamId あり: マウント直後に PracticeTabForm へ { practiceId, teamId, initialTab: 'log' } で replace される", async () => {
    h.mockUseRoute.mockReturnValue({
      params: { practiceId: "practice-1", teamId: "team-1" },
    });

    render(<PracticeLogFormScreen />);

    await waitFor(() => expect(h.mockReplace).toHaveBeenCalledTimes(1));
    expect(h.mockReplace).toHaveBeenCalledWith("PracticeTabForm", {
      practiceId: "practice-1",
      teamId: "team-1",
      initialTab: "log",
    });
  });

  it("teamId なし (個人フロー): replace のパラメータに teamId キー自体が含まれない", async () => {
    h.mockUseRoute.mockReturnValue({
      params: { practiceId: "practice-2" },
    });

    render(<PracticeLogFormScreen />);

    await waitFor(() => expect(h.mockReplace).toHaveBeenCalledTimes(1));
    const [, params] = h.mockReplace.mock.calls[0] as [string, Record<string, unknown>];
    expect(params).toEqual({ practiceId: "practice-2", initialTab: "log" });
    expect(Object.prototype.hasOwnProperty.call(params, "teamId")).toBe(false);
  });
});
