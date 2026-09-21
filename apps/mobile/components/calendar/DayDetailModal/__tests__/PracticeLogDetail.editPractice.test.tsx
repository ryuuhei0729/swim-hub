/**
 * PracticeLogDetail（practice/team_practice アイテム）練習編集ボタンの
 * team 系ガード テスト (Sprint Contract 2 / D4 / SC1)
 *
 * 対象: apps/mobile/components/calendar/DayDetailModal/components/PracticeLogDetail.tsx
 * (isPractice && !isTeamItem && onEditPractice の分岐)
 *
 * 削除ガード (PracticeLogDetail.deletePractice.test.tsx) と同型のパターンを踏襲する。
 * isPractice はテスト側でハードコードせず、実アプリ (DayDetailModal.tsx:335) と
 * 同じ式で計算してから渡す (Reviewer 指摘 T1 の教訓: ハードコードすると
 * ガード除去時に赤くならない壊れたテストになる)。
 *
 * Sprint Contract 検証観点:
 *   [V-M-PE01] type=team_practice では練習編集ボタン(icon-edit)が描画されない
 *   [V-M-PE02] type=practice (個人練習) では練習編集ボタンが描画され、押下で
 *              onEditPractice(item) が呼ばれる (同じセレクタが機能することの
 *              証明、V-M-PE01 の偽陽性防止・非退行)
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "@/__mocks__/supabase";
import type { CalendarItem } from "@apps/shared/types/ui";

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: mockUseAuth,
}));

vi.mock("@/components/share", () => ({
  ShareCardModal: () => null,
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
  const React = await import("react");
  return {
    ...original,
    Dimensions: {
      get: vi.fn((_dim: string) => ({ width: 375, height: 667 })),
      addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    },
    SafeAreaView: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) =>
      React.createElement("div", props, children),
  };
});

import { PracticeLogDetail } from "../components/PracticeLogDetail";

function makeItem(type: CalendarItem["type"], id: string, teamId?: string): CalendarItem {
  return {
    id,
    type,
    date: "2026-07-15",
    title: `item-${id}`,
    metadata: teamId ? { team_id: teamId } : {},
  } as CalendarItem;
}

function renderItem(
  item: CalendarItem,
  isPractice: boolean,
  handlers: Partial<{
    onEditPractice: (item: CalendarItem) => void;
    onDeletePractice: (itemId: string) => void;
  }> = {},
) {
  return render(
    <PracticeLogDetail
      item={item}
      title="title"
      color="#10B981"
      typeLabel="練習"
      isPractice={isPractice}
      isPracticeLog={false}
      practiceId={item.id}
      onClose={vi.fn()}
      {...handlers}
    />,
  );
}

describe("PracticeLogDetail (practice/team_practice) 練習編集ボタンの team ガード", () => {
  beforeEach(() => {
    const supabase = createMockSupabaseClient({ queryData: null });
    mockUseAuth.mockReturnValue({ supabase, getAccessToken: vi.fn().mockResolvedValue(null) });
  });

  it("[V-M-PE01] type=team_practice では練習編集ボタンが描画されない", () => {
    const onEditPractice = vi.fn();
    renderItem(makeItem("team_practice", "practice-team-1", "team-x"), true, { onEditPractice });

    expect(screen.queryByTestId("icon-edit")).toBeNull();
  });

  it("[V-M-PE02] type=practice (個人練習) では練習編集ボタンが描画され、押下で onEditPractice(item) が呼ばれる (セレクタの健全性確認・非退行)", () => {
    const onEditPractice = vi.fn();
    const item = makeItem("practice", "practice-personal-1");
    renderItem(item, true, { onEditPractice });

    fireEvent.click(screen.getByTestId("icon-edit").closest("button")!);

    expect(onEditPractice).toHaveBeenCalledTimes(1);
    expect(onEditPractice).toHaveBeenCalledWith(item);
  });
});
