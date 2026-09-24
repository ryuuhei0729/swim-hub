/**
 * TeamCompetitionList — 大会カードの admin ボタン置換 (mobile, 要件B前半 / D3, R3)
 *
 * Sprint Contract: `sprint-contract.md` D3, R3
 * 検証観点 (Verification Checklist): V-M-05
 *
 * 【インターフェース契約 / PM 裁定】
 * - R3: admin の未来日ボタンを「エントリー代理入力」から「エントリー」(モーダルを開く) に
 *   置換する。カード上に代理入力ボタンは残さない。
 * - 「記録代理入力」(isEntryTabVisible=false 側) はこの Deliverable の対象外で無変更。
 *
 * トートロジー防止: 日付は `new Date()` からの相対 (addDays/subDays) で生成し、
 * 固定日付をハードコードしない。
 */

import React from "react";
import { Text } from "react-native";
import { describe, it, vi, beforeEach, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { addDays, format, subDays } from "date-fns";

const NOW = new Date();
const FUTURE_DATE = format(addDays(NOW, 5), "yyyy-MM-dd");
const PAST_DATE = format(subDays(NOW, 5), "yyyy-MM-dd");
const TODAY_DATE = format(NOW, "yyyy-MM-dd");

const mocks = vi.hoisted(() => ({
  useTeamCompetitionsQuery: vi.fn(),
  useDeleteTeamCompetitionMutation: vi.fn(),
  useUpdateCompetitionMutation: vi.fn(),
  mutateAsync: vi.fn(),
  invalidateQueries: vi.fn(),
  navigate: vi.fn(),
  supabase: {},
  entryModalSpy: vi.fn(),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamCompetitionsQuery: mocks.useTeamCompetitionsQuery,
  useDeleteTeamCompetitionMutation: mocks.useDeleteTeamCompetitionMutation,
}));

vi.mock("@apps/shared/hooks/queries/records", () => ({
  useUpdateCompetitionMutation: mocks.useUpdateCompetitionMutation,
}));

vi.mock("@apps/shared/hooks/queries/keys", () => ({
  teamKeys: {
    competitions: (teamId: string) => ["teams", "detail", teamId, "competitions"],
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: vi.fn(() => ({ invalidateQueries: mocks.invalidateQueries })),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ supabase: mocks.supabase })),
}));

vi.mock("@react-navigation/native", () => ({
  useNavigation: vi.fn(() => ({ navigate: mocks.navigate })),
}));

vi.mock("../TeamCompetitionEntryModal", () => ({
  TeamCompetitionEntryModal: (props: Record<string, unknown>) => {
    mocks.entryModalSpy(props);
    if (!props.visible) return null;
    return React.createElement(Text, null, "ENTRY_MODAL_OPEN");
  },
}));

vi.mock("../TeamCompetitionRecordsModal", () => ({
  TeamCompetitionRecordsModal: (props: Record<string, unknown>) => {
    if (!props.visible) return null;
    return React.createElement(Text, null, "RECORDS_MODAL_OPEN");
  },
}));

import { TeamCompetitionList } from "../TeamCompetitionList";

const makeCompetition = (overrides: Record<string, unknown> = {}) => ({
  id: "c-1",
  user_id: "user-1",
  team_id: "team-1",
  title: "テスト大会",
  date: FUTURE_DATE,
  place: null,
  pool_type: 0,
  note: null,
  entry_status: "open",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

function renderList(competitions: ReturnType<typeof makeCompetition>[], isAdmin: boolean) {
  mocks.useTeamCompetitionsQuery.mockReturnValue({
    data: competitions,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
  return render(<TeamCompetitionList teamId="team-1" isAdmin={isAdmin} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useUpdateCompetitionMutation.mockReturnValue({
    mutateAsync: mocks.mutateAsync,
    isPending: false,
  });
});

describe("TeamCompetitionList — 大会カードの admin ボタン置換 (mobile)", () => {
  describe("[V-M-05] SC5: admin が最初に見るボタンが「エントリー」であり、同じモーダルが開く", () => {
    it("未来日 + admin のカードで、accessibilityLabel が「エントリー」のボタンが表示される", () => {
      renderList([makeCompetition({ id: "c-future", date: FUTURE_DATE })], true);
      expect(screen.getByRole("button", { name: "エントリー" })).toBeDefined();
    });

    it("admin がそのボタンを押すと、非admin と同じ TeamCompetitionEntryModal が開く (isAdmin: true で props が渡る)", async () => {
      renderList(
        [makeCompetition({ id: "c-future", date: FUTURE_DATE, entry_status: "open" })],
        true,
      );

      expect(screen.queryByText("ENTRY_MODAL_OPEN")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "エントリー" }));

      expect(screen.getByText("ENTRY_MODAL_OPEN")).toBeDefined();
      expect(mocks.entryModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          visible: true,
          competitionId: "c-future",
          isAdmin: true,
          entryStatus: "open",
        }),
      );
    });

    it("[回帰] 未来日 + admin のカードに「エントリー代理入力」ボタンは存在しない", () => {
      renderList([makeCompetition({ id: "c-future", date: FUTURE_DATE })], true);
      expect(screen.queryByRole("button", { name: "エントリー代理入力" })).toBeNull();
    });

    it("[非退行] 過去日/今日 + admin では「記録代理入力」ボタンが引き続き表示される (D3 の対象外)", () => {
      renderList([makeCompetition({ id: "c-past", date: PAST_DATE })], true);
      expect(screen.getByRole("button", { name: "記録代理入力" })).toBeDefined();
      expect(screen.queryByRole("button", { name: "エントリー" })).toBeNull();

      renderList([makeCompetition({ id: "c-today", date: TODAY_DATE })], true);
      expect(screen.getAllByRole("button", { name: "記録代理入力" }).length).toBeGreaterThan(0);
    });

    it("[非退行] 非admin のカードのエントリーボタンの見た目・遷移は変わらない", async () => {
      renderList(
        [makeCompetition({ id: "c-nonadmin", date: FUTURE_DATE, entry_status: "open" })],
        false,
      );

      fireEvent.click(screen.getByRole("button", { name: "エントリー" }));
      await waitFor(() => expect(screen.getByText("ENTRY_MODAL_OPEN")).toBeDefined());
      expect(mocks.entryModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({ isAdmin: false }),
      );
    });
  });
});
