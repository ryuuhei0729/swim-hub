/**
 * EntryDetail（エントリー済み・未記録の大会グループ）編集ボタンの isTeamCompetition
 * ガード (Sprint Contract 2 / D4 / SC1)
 *
 * 対象: apps/mobile/components/calendar/DayDetailModal/components/EntryDetail.tsx
 * (onEditCompetition && !isTeamCompetition の分岐)
 *
 * Sprint Contract 検証観点:
 *   [V-M-EE01] isTeamCompetition=true のとき編集ボタン(icon-edit)が描画されない
 *   [V-M-EE02] isTeamCompetition=false (個人大会) のときは編集ボタンが描画される
 *              (同じセレクタが機能することの証明、V-M-EE01 の偽陽性防止)
 *
 * 注意: EntryDetail 内には各エントリー行にも "編集" 用ボタン (onEditEntry) が
 * 存在し、それも Feather name="edit" を使う。本テストの対象は大会本体の
 * 編集ボタン (見出し行) のみのため、getAllByTestId で件数を比較して切り分ける。
 */

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CalendarItem } from "@apps/shared/types/ui";

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: mockUseAuth,
}));

import { EntryDetail } from "../components/EntryDetail";
import type { EntryDetailProps } from "../types";

function makeEntry(overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    id: "entry-1",
    type: "entry",
    date: "2026-08-01",
    title: "エントリー1",
    metadata: {},
    ...overrides,
  } as CalendarItem;
}

function renderEntryDetail(
  props: Partial<Omit<EntryDetailProps, "isTeamCompetition">> & {
    isTeamCompetition: boolean;
  },
) {
  const supabase = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    })),
  };
  mockUseAuth.mockReturnValue({ supabase });

  return render(
    <EntryDetail
      competitionId="comp-1"
      competitionName="テスト大会"
      entries={[makeEntry()]}
      onEditCompetition={vi.fn()}
      onDeleteCompetition={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />,
  );
}

describe("EntryDetail 編集ボタンの isTeamCompetition ガード", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it("[V-M-EE01] isTeamCompetition=true のとき大会本体の編集ボタンが描画されない", async () => {
    renderEntryDetail({ isTeamCompetition: true, onEditEntry: undefined });

    await waitFor(() => {
      expect(screen.getByText("テスト大会")).toBeTruthy();
    });
    // onEditEntry を渡していないため、残る icon-edit は大会本体編集ボタンのみのはず。
    // ガードが効いていれば1件も無い。
    expect(screen.queryAllByTestId("icon-edit").length).toBe(0);
  });

  it("[V-M-EE02] isTeamCompetition=false (個人大会) のとき大会本体の編集ボタンが描画される (セレクタの健全性確認)", async () => {
    renderEntryDetail({ isTeamCompetition: false, onEditEntry: undefined });

    await waitFor(() => {
      expect(screen.queryAllByTestId("icon-edit").length).toBeGreaterThan(0);
    });
  });
});
