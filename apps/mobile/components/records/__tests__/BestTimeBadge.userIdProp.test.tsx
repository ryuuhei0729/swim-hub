/**
 * BestTimeBadge (mobile) — Sprint Contract D2: `userId?: string` prop 追加
 *
 * 対象: apps/mobile/components/records/BestTimeBadge.tsx
 * Success Criteria 1 (SPRINT_CONTRACT.md):
 *   「他メンバーの記録でも、その人の userId で判定される
 *    (ログインユーザーの記録で判定していないこと)」
 * D2 は web (D1) と同一契約。一覧パス (showDiff=false) のみが対象
 * (詳細/シェアカード向け3状態パスは自分の記録専用の導線なので userId prop は不要)。
 *
 * 過去の事故 (MEMORY.md「クエリ引数を捨てるモックはスコープを検証不能にする」) を踏まえ、
 * RecordAPI.getListBestCandidates に渡される実引数 (userId) を必ず検証する。
 */

import React from "react";
import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "@/__mocks__/supabase";
import { createQueryWrapper } from "@/__tests__/helpers/testUtils";

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: mockUseAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockGetListBestCandidates = vi.hoisted(() => vi.fn());
vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: vi.fn().mockImplementation(() => ({
    getPreviousBestTime: vi.fn(),
    getListBestCandidates: mockGetListBestCandidates,
  })),
}));

import BestTimeBadge from "../BestTimeBadge";

const defaultProps = {
  recordId: "record-1",
  styleId: 1,
  currentTime: 55.0,
  recordDate: "2026-07-01",
  poolType: 0,
  isRelaying: false,
  showDiff: false as const,
};

describe("BestTimeBadge userId prop (mobile, D2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetListBestCandidates.mockResolvedValue({ competitionRows: [], bulkRows: [] });
  });

  it("[SC1] userId prop が指定されたとき、ログインユーザーではなくその userId でクエリする", async () => {
    const supabase = createMockSupabaseClient();
    mockUseAuth.mockReturnValue({ supabase, user: { id: "logged-in-user" } });

    render(<BestTimeBadge {...defaultProps} userId="other-member" />, {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(mockGetListBestCandidates).toHaveBeenCalledWith("other-member", 1, false, 0);
    });
  });

  it("[後方互換] userId prop が未指定のとき、現行どおりログインユーザーの id にフォールバックする", async () => {
    const supabase = createMockSupabaseClient();
    mockUseAuth.mockReturnValue({ supabase, user: { id: "logged-in-user" } });

    render(<BestTimeBadge {...defaultProps} />, { wrapper: createQueryWrapper() });

    await waitFor(() => {
      expect(mockGetListBestCandidates).toHaveBeenCalledWith("logged-in-user", 1, false, 0);
    });
  });

  it("userId prop も未認証も無いときはフェッチしない", async () => {
    const supabase = createMockSupabaseClient();
    mockUseAuth.mockReturnValue({ supabase, user: null });

    render(<BestTimeBadge {...defaultProps} />, { wrapper: createQueryWrapper() });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockGetListBestCandidates).not.toHaveBeenCalled();
  });
});
