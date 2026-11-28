/**
 * EntryDetail（エントリー済み・記録未登録の大会）
 *
 * - #83: エントリー1件ごとの削除ボタン (確認は onDeleteEntry 側) と大会画像の表示 (web の CompetitionWithEntry と同じ)
 * - #141: チーム大会には「チームの記録を見る」を出し、チーム画面の予定タブでその大会の詳細を開く
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithQuery as render } from "@/__tests__/helpers/testUtils";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CalendarItem } from "@apps/shared/types/ui";

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    Dimensions: {
      get: vi.fn((_dim: string) => ({ width: 375, height: 667 })),
      addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    },
  };
});

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

// 画像の署名付きURLの解決は対象外。パスをそのまま URL として返す
vi.mock("@/hooks/useGalleryImages", () => ({
  useGalleryImages: (_bucket: string, paths: string[] | null | undefined) =>
    (paths ?? []).map((path) => ({ id: path, url: `https://example.com/${path}` })),
}));

vi.mock("@/contexts/AuthProvider");
import { useAuth } from "@/contexts/AuthProvider";
import { buildAuthContext } from "@/__tests__/helpers/authContext";

import { EntryDetail } from "../components/EntryDetail";

const ENTRY_ROWS = [
  { id: "entry-a", style_id: 1, entry_time: 60.5, note: null, style: { id: 1, name_jp: "100m自由形", style: "fr" } },
  { id: "entry-b", style_id: 2, entry_time: null, note: null, style: { id: 2, name_jp: "50m自由形", style: "fr" } },
];

function setupSupabase() {
  const supabase = {
    from: vi.fn((table: string) => {
      const result =
        table === "competitions"
          ? { data: [{ image_paths: ["comp/1.jpg", "comp/2.jpg"] }], error: null }
          : { data: ENTRY_ROWS, error: null };
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        then: (resolve: (v: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      };
      return chain;
    }),
  };
  vi.mocked(useAuth).mockReturnValue(buildAuthContext({ user: { id: "user-1" }, supabase }));
}

function makeEntry(): CalendarItem {
  return {
    id: "comp-1",
    type: "entry",
    date: "2099-08-01",
    title: "テスト大会",
    metadata: { competition: { id: "comp-1", team_id: "team-1" } },
  } as unknown as CalendarItem;
}

describe("EntryDetail エントリーの削除・大会画像・チームの記録", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    setupSupabase();
  });

  it("エントリーごとに削除ボタンを出し、押すとそのエントリーの id で onDeleteEntry を呼ぶ", async () => {
    const onDeleteEntry = vi.fn();
    render(
      <EntryDetail
        competitionId="comp-1"
        competitionName="テスト大会"
        entries={[makeEntry()]}
        isTeamCompetition={false}
        onDeleteEntry={onDeleteEntry}
      />,
    );

    // 大会の削除 (onDeleteCompetition) は渡していないので、ゴミ箱はエントリーの分だけ
    await waitFor(() => expect(screen.getAllByTestId("icon-trash-2")).toHaveLength(2));
    fireEvent.click(screen.getAllByTestId("icon-trash-2")[1]!.closest("button")!); // 直前で2件あることを確認済み
    expect(onDeleteEntry).toHaveBeenCalledWith("entry-b");
  });

  it("大会の添付画像を表示する", async () => {
    const { container } = render(
      <EntryDetail
        competitionId="comp-1"
        competitionName="テスト大会"
        entries={[makeEntry()]}
        isTeamCompetition={false}
      />,
    );

    await waitFor(() => expect(container.querySelectorAll("img").length).toBe(2));
  });

  it("チーム大会では「チームの記録を見る」を出し、予定タブでその大会の詳細を開く", async () => {
    const onClose = vi.fn();
    render(
      <EntryDetail
        competitionId="comp-1"
        competitionName="テスト大会"
        entries={[makeEntry()]}
        isTeamCompetition
        teamId="team-1"
        onClose={onClose}
      />,
    );

    await waitFor(() => expect(screen.getByText("チームの記録を見る")).toBeTruthy());
    fireEvent.click(screen.getByText("チームの記録を見る").closest("button")!);
    expect(onClose).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("MainTabs", {
      screen: "Teams",
      params: {
        teamId: "team-1",
        initialTab: "schedule",
        openEvent: { kind: "competition", id: "comp-1" },
      },
    });
  });
});
