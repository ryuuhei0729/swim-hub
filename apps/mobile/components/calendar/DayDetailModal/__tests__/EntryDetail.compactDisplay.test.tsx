/**
 * EntryDetail（エントリー済み・記録未登録の大会グループ）の表示形式
 *
 * - 会場と水路は「新宿コズミックセンター（短水路）」の1行で出す
 * - エントリー種目は「400m個人メドレー（エントリー 4:30.00）」の形で、
 *   「種目:」「エントリータイム:」ラベルと種目ごとのゴミ箱は出さない
 * - 「大会記録を追加」の + アイコンは黒 (背景が淡い青なので白だと見えない)
 */

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CalendarItem } from "@apps/shared/types/ui";

vi.mock("@/contexts/AuthProvider");
import { useAuth } from "@/contexts/AuthProvider";
import { buildAuthContext } from "@/__tests__/helpers/authContext";

import { EntryDetail } from "../components/EntryDetail";
import type { EntryDetailProps } from "../types";

const ENTRY_ROWS = [
  {
    id: "entry-1",
    style_id: 18,
    entry_time: 270,
    note: null,
    style: { id: 18, name_jp: "400m個人メドレー", style: "IM" },
  },
  {
    id: "entry-2",
    style_id: 1,
    entry_time: null,
    note: null,
    style: { id: 1, name_jp: "50m自由形", style: "Fr" },
  },
  {
    id: "entry-3",
    style_id: 2,
    entry_time: 0,
    note: null,
    style: { id: 2, name_jp: "100m自由形", style: "Fr" },
  },
];

function renderEntryDetail(props: Partial<EntryDetailProps> = {}) {
  const supabase = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: ENTRY_ROWS, error: null }).then(resolve),
    })),
  };
  vi.mocked(useAuth).mockReturnValue(buildAuthContext({ user: null, supabase }));

  const entries = [
    { id: "entry-1", type: "entry", date: "2026-11-14", title: "こずみっくTy", metadata: {} },
  ] as CalendarItem[];

  return render(
    <EntryDetail
      competitionId="comp-1"
      competitionName="こずみっくTy"
      place="新宿コズミックセンター"
      poolType={0}
      entries={entries}
      isTeamCompetition={true}
      onAddRecord={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />,
  );
}

describe("EntryDetail の表示形式", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReset();
  });

  it("会場と水路を「会場（水路）」の1行で出す", async () => {
    renderEntryDetail();
    expect(await screen.findByText("新宿コズミックセンター（短水路）")).toBeTruthy();
    expect(screen.queryByText("短水路(25m)")).toBeNull();
  });

  it("長水路は「（長水路）」になる", async () => {
    renderEntryDetail({ poolType: 1 });
    expect(await screen.findByText("新宿コズミックセンター（長水路）")).toBeTruthy();
  });

  it("会場が空なら水路だけを出す", async () => {
    renderEntryDetail({ place: "" });
    expect(await screen.findByText("（短水路）")).toBeTruthy();
  });

  it("種目は「種目名（エントリー <タイム>）」で出し、「種目:」等のラベルは出さない", async () => {
    renderEntryDetail();

    await waitFor(() => {
      expect(screen.getByText("4:30.00")).toBeTruthy();
    });
    // 種目名と括弧書きのエントリータイムが1つの行にまとまっている
    expect(screen.getByText("400m個人メドレー").textContent).toBe(
      "400m個人メドレー（エントリー 4:30.00）",
    );
    // エントリータイム未設定 (null / 0) の種目は括弧ごと出さず、0 も描画しない
    expect(screen.getByText("50m自由形").textContent).toBe("50m自由形");
    expect(screen.getByText("100m自由形").textContent).toBe("100m自由形");
    expect(screen.queryByText("0")).toBeNull();

    expect(screen.queryByText("種目:")).toBeNull();
    expect(screen.queryByText("エントリータイム:")).toBeNull();
  });

  it("「大会記録を追加」の + アイコンは黒", async () => {
    renderEntryDetail();
    await screen.findByText("4:30.00");
    expect(screen.getByTestId("icon-plus").getAttribute("color")).toBe("#111827");
  });
});
