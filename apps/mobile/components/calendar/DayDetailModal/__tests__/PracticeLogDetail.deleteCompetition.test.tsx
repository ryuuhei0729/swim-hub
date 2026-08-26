/**
 * PracticeLogDetail（「その他アイテム」= competition/team_competition の裸大会ブロック）
 * 削除ボタンの isTeamCompetition 引き渡し テスト
 *
 * 対象: apps/mobile/components/calendar/DayDetailModal/components/PracticeLogDetail.tsx:691-702
 *
 * 背景 (PM 追加指摘):
 *   entries/records が紐づかない裸の大会アイテム (competition/team_competition) は
 *   DayDetailModal から MemoizedPracticeLogDetail (= PracticeLogDetail) 経由で削除される。
 *   この経路は PM/Planner が当初把握していなかった4つ目の削除経路であり、
 *   `onDeleteCompetition(item.id, item.type === "team_competition")` の第2引数
 *   (isTeamCompetition) が正しく渡らないと、useDayDetailHandlers.handleDeleteCompetition
 *   側の「チーム大会では records 件数フェッチを行わない」ガードが機能しない
 *   (常に false が渡って個人大会と誤判定される可能性がある)。
 *
 * Sprint Contract 検証観点:
 *   [V-M-C06] type="competition" (個人) の削除ボタン押下で
 *             onDeleteCompetition(id, false) が呼ばれる
 *   [V-M-C07] type="team_competition" の削除ボタン押下で
 *             onDeleteCompetition(id, true) が呼ばれる (isTeamCompetition=true が
 *             正しく伝播し、上位の件数フェッチスキップ判定に使える状態になっている)
 *   [V-M-C08] type="practice"/"record"/"entry" では、この競技削除ボタン自体が
 *             描画されない (誤って別種別で削除ボタンが出ないことの回帰防止)
 *
 * トートロジー防止メモ: onDeleteCompetition はテスト側の spy であり実装からコピーした
 * assertion ではない。「押した item の id とその item.type から導かれる真偽値」という
 * Sprint Contract の仕様のみを検証する。
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
  handlers: Partial<{
    onDeleteCompetition: (competitionId: string, isTeamCompetition: boolean) => void;
    onDeletePractice: (itemId: string) => void;
    onDeleteRecord: (recordId: string) => void;
    onDeleteEntry: (entryId: string) => void;
  }> = {},
) {
  return render(
    <PracticeLogDetail
      item={item}
      title="title"
      color="#10B981"
      typeLabel="大会"
      isPractice={false}
      isPracticeLog={false}
      practiceId=""
      onClose={vi.fn()}
      {...handlers}
    />,
  );
}

describe("PracticeLogDetail (その他アイテム) 削除ボタンの isTeamCompetition 引き渡し", () => {
  beforeEach(() => {
    const supabase = createMockSupabaseClient({ queryData: null });
    mockUseAuth.mockReturnValue({ supabase, getAccessToken: vi.fn().mockResolvedValue(null) });
  });

  it("[V-M-C06] type=competition (個人大会) の削除ボタンは onDeleteCompetition(id, false) を呼ぶ", () => {
    const onDeleteCompetition = vi.fn();
    renderItem(makeItem("competition", "comp-personal-1"), { onDeleteCompetition });

    fireEvent.click(screen.getByTestId("icon-trash-2").closest("button")!);

    expect(onDeleteCompetition).toHaveBeenCalledTimes(1);
    expect(onDeleteCompetition).toHaveBeenCalledWith("comp-personal-1", false);
  });

  it("[V-M-C07] type=team_competition の削除ボタンは onDeleteCompetition(id, true) を呼ぶ", () => {
    const onDeleteCompetition = vi.fn();
    renderItem(makeItem("team_competition", "comp-team-1", "team-x"), { onDeleteCompetition });

    fireEvent.click(screen.getByTestId("icon-trash-2").closest("button")!);

    expect(onDeleteCompetition).toHaveBeenCalledTimes(1);
    expect(onDeleteCompetition).toHaveBeenCalledWith("comp-team-1", true);
  });

  it("[V-M-C08] type=practice では大会削除ボタン (trash-2アイコン) が描画されない", () => {
    const onDeletePractice = vi.fn();
    const onDeleteCompetition = vi.fn();
    renderItem(makeItem("practice", "practice-1"), { onDeletePractice, onDeleteCompetition });

    // practice には別の削除ハンドラ (onDeletePractice) を渡していないため
    // 削除アイコン自体が一切描画されないはず (誤って competition 用ボタンが出ない)
    expect(screen.queryByTestId("icon-trash-2")).toBeNull();
  });
});
