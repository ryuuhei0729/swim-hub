/**
 * RecordCard（大会記録カード）シェア機能 テスト（Phase B 本実装）
 *
 * 対象: apps/mobile/components/calendar/DayDetailModal/components/RecordDetail.tsx の `RecordCard`
 * 参照実装: apps/web/.../DayDetailModal/components/CompetitionSection/CompetitionDetails.tsx
 *
 * テスト方針:
 *   `RecordDetail`（大会全体のラッパー、自前で supabase から records/splits/画像を fetch する）
 *   ではなく、共有ボタンとシェアデータ組み立てロジックの実体である `RecordCard` を直接
 *   レンダリングして検証する（props 経由でデータを渡せるため、供給元の fetch 経路を
 *   モックする必要がなく、シェア機能そのものに焦点を絞れる）。
 *   ShareCardModal/CompetitionShareCard は実物を使い、共有ボタン押下→previousBest 取得→
 *   モーダル内バッジ表示という統合的な流れを検証する（浅いモックで表面だけ確認しない）。
 *
 * Sprint Contract 検証観点:
 *   [V-01] RecordCard に共有ボタン(アイコン)が表示される
 *   [V-02] 共有ボタン押下で ShareCardModal(type="competition") が開き、data に
 *          competitionName/date/place/poolType/eventName/time が渡る
 *   [V-03] getPreviousBestTime が現在タイムより大きい値を返すとき、「ベスト」バッジが表示される
 *   [V-04] getPreviousBestTime が現在タイムより小さい値を返すとき、「ベストより遅い」バッジが表示される
 *   [V-05] getPreviousBestTime が null を返すとき、「初」バッジが表示される
 *   [V-06] getPreviousBestTime が例外を throw するとき、バッジが表示されない
 *   [V-07] splitTimes が0件のレコードで共有ボタンを押してもクラッシュしない
 *
 * トートロジー防止メモ:
 *   期待値は web CompetitionDetails.tsx の share-record-button ハンドラのロジック
 *   （try/catch で previousBest 取得失敗時はバッジ非表示のまま）と Sprint Contract の
 *   C-1 記述から導出したものであり、mobile 実装コードの diff を読んでコピーしたものではない。
 */

import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

// --- AuthProvider モック（RecordCard は useAuth() から supabase を取得する） ---
const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: mockUseAuth,
}));

// --- RecordAPI モック（getPreviousBestTime のみ差し替え） ---
const mockGetPreviousBestTime = vi.hoisted(() => vi.fn());
vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: vi.fn().mockImplementation(() => ({
    getPreviousBestTime: mockGetPreviousBestTime,
  })),
}));

// --- expo-sharing / react-native-view-shot（ShareCardModal 実体が使う） ---
vi.mock("expo-sharing", () => ({
  isAvailableAsync: vi.fn().mockResolvedValue(true),
  shareAsync: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("react-native-view-shot", () => ({
  captureRef: vi.fn().mockResolvedValue("file:///tmp/share.png"),
}));

// --- expo-image-picker / expo-image-manipulator ---
// RecordCard は @/components/shared から ImageViewerModal を import しており、
// shared/index.ts のバレル経由で ImageUploader.tsx (expo-image-picker 使用) も
// 評価されるためスタブ化する (components/shared/__tests__/ImageUploader.test.tsx と同一パターン)。
vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
}));
vi.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: vi.fn() },
  SaveFormat: { JPEG: "jpeg", PNG: "png", WEBP: "webp" },
}));

// --- Dimensions ---
// 基本 react-native モック(__mocks__/react-native.ts)には Dimensions が無く、
// ImageViewerModal.tsx が Dimensions.get("window") を参照するため追加する
// (components/shared/__tests__/ImageViewerModal.test.tsx と同一パターン)。
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
    styleName: "100m自由形",
    time: 60.0,
    reactionTime: null,
    isRelaying: false,
    note: null,
    styleId: 1,
    styleDistance: 100,
    videoPath: null,
    videoThumbnailPath: null,
    ...overrides,
  };
}

function makeCalendarRecords(date = "2026-07-01"): CalendarItem[] {
  return [
    {
      id: "record-1",
      type: "record",
      date,
      title: "テスト大会",
      place: "市民プール",
      metadata: {},
    } as CalendarItem,
  ];
}

function renderRecordCard(props: Partial<React.ComponentProps<typeof RecordCard>> = {}) {
  mockUseAuth.mockReturnValue({ supabase: {} });
  return render(
    <RecordCard
      record={props.record ?? makeRecord()}
      splits={props.splits ?? []}
      records={props.records ?? makeCalendarRecords()}
      place={props.place ?? "市民プール"}
      poolType={props.poolType ?? 0}
      competitionId={props.competitionId ?? "comp-1"}
      competitionName={props.competitionName ?? "テスト大会"}
      onEditRecord={props.onEditRecord}
      onDeleteRecord={props.onDeleteRecord}
      onClose={props.onClose}
    />,
  );
}

async function clickShareButton() {
  const shareButton = screen.getByTestId("icon-share-2").closest("button");
  expect(shareButton).toBeTruthy();
  fireEvent.click(shareButton!);
}

describe("RecordCard share button", () => {
  beforeEach(() => {
    mockGetPreviousBestTime.mockReset();
  });

  it("[V-01] 共有ボタン(share-2アイコン)が表示される", () => {
    renderRecordCard();
    expect(screen.getByTestId("icon-share-2")).toBeTruthy();
  });

  it("[V-02] 共有ボタン押下で ShareCardModal が開き、大会名・記録内容が表示される", async () => {
    mockGetPreviousBestTime.mockResolvedValue(null);
    renderRecordCard({
      record: makeRecord({ time: 65.43, styleName: "100m自由形" }),
      competitionName: "夏季大会",
    });

    await clickShareButton();

    await waitFor(() => {
      expect(screen.getByText("夏季大会")).toBeTruthy();
    });
    // カード本体側にも同じ種目名・タイムが表示されているため、モーダルとの重複を許容する
    expect(screen.getAllByText("100m自由形").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1:05.43").length).toBeGreaterThan(0);
  });

  it("[V-03] getPreviousBestTime が現在タイムより遅い過去記録を返すとき、「ベスト」バッジが表示される", async () => {
    mockGetPreviousBestTime.mockResolvedValue(70.0); // 現在60.0 < 過去70.0 → 更新=ベスト
    renderRecordCard({ record: makeRecord({ time: 60.0 }) });

    await clickShareButton();

    await waitFor(() => {
      expect(screen.getByText("自己ベスト")).toBeTruthy();
    });
  });

  it("[V-04] getPreviousBestTime が現在タイムより速い過去記録を返すとき、「ベストより遅い」バッジが表示される", async () => {
    mockGetPreviousBestTime.mockResolvedValue(50.0); // 現在60.0 > 過去50.0 → 悪化
    renderRecordCard({ record: makeRecord({ time: 60.0 }) });

    await clickShareButton();

    // 3状態とも同じラベル文言("自己ベスト")を使い、値の符号(+/-)で判別する実装
    // (BestTimeBadge.test.tsx と同一の3状態モデル)ため、バッジ自体が出ることを確認する
    await waitFor(() => {
      expect(screen.getByText("自己ベスト")).toBeTruthy();
    });
    expect(screen.getByText(/^\+/)).toBeTruthy();
  });

  it("[V-05] getPreviousBestTime が null を返すとき、「初」バッジが表示される", async () => {
    mockGetPreviousBestTime.mockResolvedValue(null);
    renderRecordCard();

    await clickShareButton();

    await waitFor(() => {
      expect(screen.getByText("初")).toBeTruthy();
    });
  });

  it("[V-06] getPreviousBestTime が例外を throw するとき、バッジが表示されない", async () => {
    mockGetPreviousBestTime.mockRejectedValue(new Error("network error"));
    renderRecordCard();

    await clickShareButton();

    // モーダル自体は開く(大会名が見える)が、バッジ関連のテキストは一切出ない
    await waitFor(() => {
      expect(screen.getByText("テスト大会")).toBeTruthy();
    });
    expect(screen.queryByText("初")).toBeNull();
    expect(screen.queryByText("自己ベスト")).toBeNull();
  });

  it("[V-07] splitTimes が0件のレコードで共有ボタンを押してもクラッシュしない", async () => {
    mockGetPreviousBestTime.mockResolvedValue(null);
    renderRecordCard({ splits: [] });

    await expect(clickShareButton()).resolves.not.toThrow();
    await waitFor(() => {
      expect(screen.getByText("テスト大会")).toBeTruthy();
    });
  });

  it("[既存回帰] 編集・削除ボタンが引き続き表示され、押下でコールバックが呼ばれる", () => {
    const onEditRecord = vi.fn();
    const onDeleteRecord = vi.fn();
    renderRecordCard({ onEditRecord, onDeleteRecord });

    fireEvent.click(screen.getByTestId("icon-edit").closest("button")!);
    expect(onEditRecord).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("icon-trash-2").closest("button")!);
    expect(onDeleteRecord).toHaveBeenCalledWith("record-1");
  });
});
