/**
 * PracticeFormScreen.originForwarding.test.tsx
 *
 * Sprint Contract #PM-1 Phase B — 実装完了後の実アサーション。
 *
 * ■ 対象
 *   PracticeFormScreen.tsx (リダイレクトシム)。実装 (PM 実測済み):
 *   ```
 *   navigation.replace("PracticeTabForm", {
 *     ...(practiceId ? { practiceId } : {}),
 *     ...(date ? { date } : {}),
 *     ...(teamId ? { teamId } : {}),
 *     ...(origin ? { origin } : {}),
 *   });
 *   ```
 *
 * ■ 参考実装パターン
 *   apps/mobile/screens/__tests__/PracticeLogFormScreen.shimRedirect.test.tsx と同型
 *   (実装を import して実 render し、navigation.replace の呼び出し引数を厳密一致で見る)。
 *
 * ■ トートロジー防止メモ
 *   navigation.replace の呼び出し引数を toEqual の厳密一致で見る (objectContaining は
 *   「余分なキーが無いこと」を検証できないため使わない)。
 */

import React from "react";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PracticeFormScreen } from "@/screens/PracticeFormScreen";

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

describe("PracticeFormScreen — リダイレクトシムの origin 転送 (Sprint Contract #PM-1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[PFS-1] origin='teamAdmin' が practiceId/teamId と共存して厳密一致で転送される", async () => {
    h.mockUseRoute.mockReturnValue({
      params: { practiceId: "practice-1", teamId: "team-1", origin: "teamAdmin" },
    });

    render(<PracticeFormScreen />);

    await waitFor(() => expect(h.mockReplace).toHaveBeenCalledTimes(1));
    expect(h.mockReplace).toHaveBeenCalledWith("PracticeTabForm", {
      practiceId: "practice-1",
      teamId: "team-1",
      origin: "teamAdmin",
    });
  });

  it("[PFS-2 / 非退行] origin 未指定のとき、replace の params に origin キー自体が存在しない", async () => {
    h.mockUseRoute.mockReturnValue({
      params: { practiceId: "practice-2", teamId: "team-2" },
    });

    render(<PracticeFormScreen />);

    await waitFor(() => expect(h.mockReplace).toHaveBeenCalledTimes(1));
    const [, params] = h.mockReplace.mock.calls[0] as [string, Record<string, unknown>];
    expect(params).toEqual({ practiceId: "practice-2", teamId: "team-2" });
    expect(Object.prototype.hasOwnProperty.call(params, "origin")).toBe(false);
  });

  it("[PFS-3 / 非退行] 新規作成 (practiceId 無し) + teamId + origin='teamAdmin' でも既存キーの forwarding が壊れていない", async () => {
    h.mockUseRoute.mockReturnValue({
      params: { teamId: "team-3", date: "2026-05-01", origin: "teamAdmin" },
    });

    render(<PracticeFormScreen />);

    await waitFor(() => expect(h.mockReplace).toHaveBeenCalledTimes(1));
    expect(h.mockReplace).toHaveBeenCalledWith("PracticeTabForm", {
      teamId: "team-3",
      date: "2026-05-01",
      origin: "teamAdmin",
    });
  });
});
