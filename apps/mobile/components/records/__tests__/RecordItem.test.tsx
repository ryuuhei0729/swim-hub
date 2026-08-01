// =============================================================================
// RecordItem.test.tsx - 大会記録アイテムコンポーネントのテスト
// =============================================================================

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RecordItem } from "../RecordItem";
import {
  createMockRecordWithDetails,
  createMockCompetition,
  createMockStyle,
  createMockSupabaseClient,
} from "@/__mocks__/supabase";
import { createQueryWrapper } from "@/__tests__/helpers/testUtils";

// BestTimeBadge が useAuth を使用するため AuthProvider をモック
const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: mockUseAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

/** BestTimeBadge が React Query を使うため QueryClientProvider でラップして描画する */
function renderItem(ui: React.ReactElement) {
  return render(ui, { wrapper: createQueryWrapper() });
}

describe("RecordItem", () => {
  // 各テスト前に useAuth モックをセットアップ (BestTimeBadge が useAuth を呼ぶため)
  const mockSupabase = createMockSupabaseClient({ userId: "user-1", queryData: [] });
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ supabase: mockSupabase });
  });

  // NOTE: 大会に紐づく記録は保存時に record.pool_type が必ず competition.pool_type と
  // 同値でコピーされる (web useCompetitionTabSave.ts / mobile RecordFormScreen.tsx・
  // RecordLogFormScreen.tsx いずれの保存パスも競技会の pool_type をそのまま記録へコピーする)。
  // フィクスチャでこの不変条件を崩す (top-level pool_type と competition.pool_type が
  // 食い違う) と、実データでは起こり得ない状態になり、表示ロジックの参照フィールドを
  // 切り替えるリファクタで見かけ上のリグレッションを誤検知する。
  const mockRecord = createMockRecordWithDetails({
    time: 60.5,
    pool_type: 1, // competition.pool_type (下記) と必ず一致させる
    competition: {
      ...createMockCompetition(),
      id: "comp-1",
      title: "テスト大会",
      date: "2025-01-15",
      place: "テスト会場",
      pool_type: 1,
    },
    style: {
      ...createMockStyle(),
      id: 1,
      name_jp: "100m自由形",
      distance: 100,
    },
  });

  it("大会記録データが正しく表示される", () => {
    renderItem(<RecordItem record={mockRecord} />);

    // 日付が表示される（2026-08-01 ユーザー要望で numeric 形式に変更。
    // ja/en/zh/ko は "yyyy/MM/dd"、de のみ "dd.MM.yyyy"。例: "2025/01/15"）
    expect(screen.getByText(/2025\/01\/15/)).toBeTruthy();
    // 大会名が表示される
    expect(screen.getByText("テスト大会")).toBeTruthy();
    // 種目・距離が表示される(2026-07-22 Sprint: mobile はスマホ幅のため常時略称表示。
    // style="fr"/distance=100 → formatStyleAbbrev で "100mFr")
    expect(screen.getByText("100mFr")).toBeTruthy();
    // プールタイプが表示される
    expect(screen.getByText("長水路")).toBeTruthy();
  });

  it("大会名がnullの場合、「大会」が表示される", () => {
    const recordWithoutTitle = createMockRecordWithDetails({
      ...mockRecord,
      competition: {
        ...mockRecord.competition!,
        title: null,
      },
    });

    renderItem(<RecordItem record={recordWithoutTitle} />);

    expect(screen.getByText("大会")).toBeTruthy();
  });

  it("タイムが正しくフォーマットされて表示される", () => {
    renderItem(<RecordItem record={mockRecord} />);

    // formatTime(60.5) = "1:00.50"
    expect(screen.getByText("1:00.50")).toBeTruthy();
  });

  it("短水路の場合、プールタイプが「短水路」と表示される", () => {
    const shortCourseRecord = createMockRecordWithDetails({
      ...mockRecord,
      pool_type: 0, // competition.pool_type と一致させる (実データの不変条件)
      competition: {
        ...mockRecord.competition!,
        pool_type: 0,
      },
    });

    renderItem(<RecordItem record={shortCourseRecord} />);

    expect(screen.getByText("短水路")).toBeTruthy();
  });

  it("場所がnullの場合、場所が表示されない", () => {
    const recordWithoutPlace = createMockRecordWithDetails({
      ...mockRecord,
      competition: {
        ...mockRecord.competition!,
        place: null,
      },
    });

    renderItem(<RecordItem record={recordWithoutPlace} />);

    expect(screen.queryByText("テスト会場")).toBeNull();
    expect(screen.queryByTestId("icon-map-pin")).toBeNull();
  });

  it("onPressが提供された場合、タップでコールバックが呼ばれる", () => {
    const onPress = vi.fn();
    renderItem(<RecordItem record={mockRecord} onPress={onPress} />);

    // Pressableをタップ（button要素としてレンダリングされる）
    const pressable = screen.getByText("テスト大会").closest("button");
    expect(pressable).not.toBeNull();

    fireEvent.click(pressable!);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(mockRecord);
  });

  it("onPressが提供されない場合でもエラーが発生しない", () => {
    renderItem(<RecordItem record={mockRecord} />);

    // エラーなくレンダリングされる
    expect(screen.getByText("テスト大会")).toBeTruthy();
  });
});
