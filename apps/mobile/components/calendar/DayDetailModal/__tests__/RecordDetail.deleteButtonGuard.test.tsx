/**
 * RecordDetail（大会記録カードのラッパー）削除ボタンの isTeamCompetition ガード
 * (Sprint Contract D4/SC1)
 *
 * 対象: apps/mobile/components/calendar/DayDetailModal/components/RecordDetail.tsx:748
 * (DayDetailModal.tsx:474 で isTeamCompetition を配線)
 *
 * 背景:
 *   当初 `isTeamCompetition?: boolean` は optional でデフォルト false だったため、
 *   呼び出し元での配線漏れがあると team 大会でも削除ボタンが出てしまう (fail open)
 *   リスクがあった。App Developer (F5) が全呼び出し元 (DayDetailModal.tsx 1箇所のみ、
 *   配線漏れ無しを実測済み) を確認した上で `isTeamCompetition: boolean` を**必須化**し、
 *   デフォルト値を削除した (types.ts, RecordDetail.tsx)。
 *
 *   これにより「prop 省略時に fail open するか」というリスク自体が型システムで
 *   到達不能になった (省略すると TS2322 でコンパイルエラーになる)。そのため
 *   このリスクを検証する [V-M-R03] (旧: 省略時は削除ボタンが出ることを pin) は
 *   **削除した**。tsc --noEmit が CI ハーネスで回るため、「必須 prop が省略できないこと」
 *   自体を別途テストで pin する必要はない (`expectTypeOf` は vitest typecheck 未設定のため
 *   無音で通ってしまい、型 pin の手段として不適切でもある)。
 *
 *   「必須 prop が実際にガードとして機能しているか」は [V-M-R01]/[V-M-R02] が
 *   isTeamCompetition=true/false の両方を明示指定して担保している。
 *
 * Sprint Contract 検証観点:
 *   [V-M-R01] isTeamCompetition=true のとき削除ボタン(icon-trash-2)が描画されない
 *   [V-M-R02] isTeamCompetition=false (個人大会) のときは削除ボタンが描画される
 *             (同じセレクタが機能することの証明、V-M-R01 の偽陽性防止)
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
      onDeleteCompetition={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />,
  );
}

describe("RecordDetail 削除ボタンの isTeamCompetition ガード", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it("[V-M-R01] isTeamCompetition=true のとき削除ボタンが描画されない", () => {
    renderRecordDetail({ isTeamCompetition: true });

    expect(screen.getByText("テスト大会")).toBeTruthy();
    expect(screen.queryByTestId("icon-trash-2")).toBeNull();
  });

  it("[V-M-R02] isTeamCompetition=false (個人大会) のとき削除ボタンが描画される (セレクタの健全性確認)", () => {
    renderRecordDetail({ isTeamCompetition: false });

    expect(screen.getByTestId("icon-trash-2")).toBeTruthy();
  });
});
