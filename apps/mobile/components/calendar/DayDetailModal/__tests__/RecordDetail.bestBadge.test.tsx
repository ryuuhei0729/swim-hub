/**
 * RecordCard（大会記録カード）のベスト判定バッジとラップ表示
 *
 * - #81: タイムの横に「初」/ベストとの差のバッジを出す (web CompetitionDetails の RecordBestBadge と同じ判定。
 *   大会の開始日より前の自己ベストと比べる)
 * - #82: 距離別 Lap は種目の距離に応じて 100/200m などの列も出す (web LapTimeDisplay と同じ考え方)。
 *   見出しは翻訳キー
 */

import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithQuery as render } from "@/__tests__/helpers/testUtils";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/contexts/AuthProvider");
import { useAuth } from "@/contexts/AuthProvider";
import { buildAuthContext } from "@/__tests__/helpers/authContext";

const mockGetPreviousBestTime = vi.hoisted(() => vi.fn());
vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: vi.fn().mockImplementation(function () {
    return { getPreviousBestTime: mockGetPreviousBestTime };
  }),
}));

vi.mock("@/components/share", () => ({ ShareCardModal: () => null }));
vi.mock("@/components/record-feedback/RecordFeedbackRecordBadge", () => ({
  RecordFeedbackRecordBadge: () => null,
}));
vi.mock("@/components/record-feedback/RecordFeedbackSection", () => ({
  RecordFeedbackSection: () => null,
}));
vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
}));
vi.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: vi.fn() },
  SaveFormat: { JPEG: "jpeg", PNG: "png", WEBP: "webp" },
}));
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

import { RecordCard } from "../components/RecordDetail";
import type { RecordData } from "../types";
import type { CalendarItem } from "@apps/shared/types/ui";

function makeRecord(overrides: Partial<RecordData> = {}): RecordData {
  return {
    id: "record-1",
    styleName: "200m自由形",
    time: 120.5,
    reactionTime: null,
    isRelaying: false,
    note: null,
    styleId: 2,
    styleDistance: 200,
    videoPath: null,
    videoThumbnailPath: null,
    ...overrides,
  };
}

// 2日間の大会の2日目のカレンダー項目 (date は表示日、competition.date は大会の開始日)
const calendarRecords: CalendarItem[] = [
  {
    id: "comp-1",
    type: "record",
    date: "2026-07-02",
    title: "テスト大会",
    metadata: { competition: { id: "comp-1", date: "2026-07-01", pool_type: 1 } },
  } as unknown as CalendarItem,
];

function renderCard(record: RecordData = makeRecord(), splits: Array<{ distance: number; split_time: number }> = []) {
  vi.mocked(useAuth).mockReturnValue(buildAuthContext({ user: null, supabase: {} }));
  return render(
    <RecordCard
      record={record}
      splits={splits}
      records={calendarRecords}
      poolType={1}
      competitionId="comp-1"
      competitionName="テスト大会"
    />,
  );
}

describe("RecordCard ベスト判定バッジ (#81)", () => {
  beforeEach(() => {
    mockGetPreviousBestTime.mockReset();
  });

  it("過去の記録が無いときは「初」バッジを出し、大会の開始日・水路・リレー有無で判定する", async () => {
    mockGetPreviousBestTime.mockResolvedValue(null);
    renderCard();

    await waitFor(() => expect(screen.getByText("初")).toBeTruthy());
    expect(mockGetPreviousBestTime).toHaveBeenCalledWith(2, 1, "record-1", false, "2026-07-01");
  });

  it("過去のベストより速いときはベストとの差を出す", async () => {
    mockGetPreviousBestTime.mockResolvedValue(121.0);
    renderCard();

    await waitFor(() => expect(screen.getByText("-0.50")).toBeTruthy());
  });

  it("取得に失敗したときはバッジを出さない", async () => {
    mockGetPreviousBestTime.mockRejectedValue(new Error("network"));
    renderCard();

    await waitFor(() => expect(mockGetPreviousBestTime).toHaveBeenCalled());
    expect(screen.queryByText("初")).toBeNull();
  });
});

describe("RecordCard ラップ表示 (#82)", () => {
  beforeEach(() => {
    mockGetPreviousBestTime.mockReset();
    mockGetPreviousBestTime.mockResolvedValue(null);
  });

  it("200m の種目では 25m/50m に加えて 100m の列も出し、見出しは翻訳キーで出す", async () => {
    const splits = [
      { distance: 50, split_time: 28.0 },
      { distance: 100, split_time: 58.5 },
      { distance: 150, split_time: 89.5 },
    ];
    renderCard(makeRecord(), splits);

    expect(screen.getByText("距離別 Lap")).toBeTruthy();
    expect(screen.getByText("距離")).toBeTruthy();
    expect(screen.getByText("50m Lap")).toBeTruthy();
    expect(screen.getByText("100m Lap")).toBeTruthy();
    // 200m(ゴール) の 100m Lap = 120.50 - 58.50 = 62.00 → 1:02.00
    expect(screen.getByText("1:02.00")).toBeTruthy();

    fireEvent.click(screen.getByText("All Lap").closest("button")!);
    expect(screen.getByText("区間")).toBeTruthy();
  });
});
