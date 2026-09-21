/**
 * RecordDetail（大会記録カードのラッパー）編集ボタンの isTeamCompetition ガード
 * (Sprint Contract 2 / D4 / SC1)
 *
 * 対象: apps/mobile/components/calendar/DayDetailModal/components/RecordDetail.tsx
 * (onEditCompetition && !isTeamCompetition の分岐)
 *
 * 削除ガード (RecordDetail.deleteButtonGuard.test.tsx) と同じ isTeamCompetition
 * (必須 prop、F5 で必須化済み) を編集ボタンにも適用する。
 *
 * Sprint Contract 検証観点:
 *   [V-M-RE01] isTeamCompetition=true のとき編集ボタン(icon-edit)が描画されない
 *   [V-M-RE02] isTeamCompetition=false (個人大会) のときは編集ボタンが描画される
 *              (同じセレクタが機能することの証明、V-M-RE01 の偽陽性防止)
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: mockUseAuth,
}));

vi.mock("expo-sharing", () => ({
  isAvailableAsync: vi.fn().mockResolvedValue(true),
  shareAsync: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("react-native-view-shot", () => ({
  captureRef: vi.fn().mockResolvedValue("file:///tmp/share.png"),
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

import { RecordDetail } from "../components/RecordDetail";
import type { RecordDetailProps } from "../types";

function renderRecordDetail(
  props: Partial<Omit<RecordDetailProps, "isTeamCompetition">> & {
    isTeamCompetition: boolean;
  },
) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    single: () => Promise.resolve({ data: { image_paths: [] }, error: null }),
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve),
  };
  mockUseAuth.mockReturnValue({
    supabase: { from: () => chain },
    user: { id: "user-1" },
    getAccessToken: vi.fn().mockResolvedValue(null),
  });

  return render(
    <RecordDetail
      competitionId="comp-1"
      competitionName="テスト大会"
      records={[]}
      onEditCompetition={vi.fn()}
      onDeleteCompetition={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />,
  );
}

describe("RecordDetail 編集ボタンの isTeamCompetition ガード", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it("[V-M-RE01] isTeamCompetition=true のとき編集ボタンが描画されない", () => {
    renderRecordDetail({ isTeamCompetition: true });

    expect(screen.getByText("テスト大会")).toBeTruthy();
    expect(screen.queryByTestId("icon-edit")).toBeNull();
  });

  it("[V-M-RE02] isTeamCompetition=false (個人大会) のとき編集ボタンが描画される (セレクタの健全性確認)", () => {
    renderRecordDetail({ isTeamCompetition: false });

    expect(screen.getByTestId("icon-edit")).toBeTruthy();
  });
});
