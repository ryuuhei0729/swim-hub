/**
 * PracticeLogDetail（practice/team_practice アイテム）練習削除ボタンの
 * team 系ガード テスト (Sprint Contract D4/SC1)
 *
 * 対象: apps/mobile/components/calendar/DayDetailModal/components/PracticeLogDetail.tsx:621-631
 * (isPractice && !isTeamItem && onDeletePractice の分岐)
 *
 * 背景:
 *   isPractice は item.type === "practice" || item.type === "team_practice" の
 *   両方で true になる (DayDetailModal.tsx:335)。旧実装は isPractice だけで
 *   削除ボタンの表示可否を決めていたため、team_practice でも削除ボタンが出て
 *   onDeletePractice(item.id) が呼べてしまっていた。isTeamItem
 *   (= item.type === "team_practice" || "team_competition") を追加ガードにして
 *   team_practice を除外する。
 *
 * Sprint Contract 検証観点:
 *   [V-M-P01] type="team_practice" では練習削除ボタン(icon-trash-2)が描画されない
 *   [V-M-P02] type="practice" (個人練習) では練習削除ボタンが描画され、押下で
 *             onDeletePractice(item.id) が呼ばれる (同じセレクタが機能することの
 *             証明、V-M-P01 の偽陽性防止・非退行)
 *   [V-M-P03] type="record" では record 専用の削除ボタンが描画され、押下で
 *             onDeleteRecord(item.id) は呼ばれるが onDeletePractice は呼ばれない
 *             (別種別のアイテムで練習削除ハンドラが誤配線されないことの回帰防止)
 *
 * トートロジー防止メモ: onDeletePractice/onDeleteRecord はテスト側の spy であり、
 * 期待値は Sprint Contract D4 の記述から導出したものであって実装 diff のコピーではない。
 *
 * Reviewer 指摘 (修正ラウンド1, T1) への対応:
 *   旧 V-M-P03 は isPractice を呼び出し側で false に固定した上でボタンをクリックせず
 *   「呼ばれていないこと」だけを assert しており、isTeamItem ガードを削除しても
 *   red にならないテストだった (isPractice=false で最初の分岐が短絡するだけ)。
 *   isPractice は実アプリ (DayDetailModal.tsx:335) と同じ導出式で計算し、
 *   実際に描画された record 用ボタンをクリックして分岐先を検証する形に修正した。
 *   ただし item.type === "record" の削除ボタン自体は isTeamItem を条件に含まないため
 *   (該当コードに isTeamItem 参照なし)、本テストは isTeamItem ガード除去の
 *   ミューテーションに対しては red にならない。isTeamItem のミューテーション耐性は
 *   V-M-P01 が担う。本テストの役割は「別種別への誤配線が無いこと」の回帰防止であり、
 *   ミューテーション対象は record 用ボタンの type 条件そのものである。
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
    onDeletePractice: (itemId: string) => void;
    onDeleteCompetition: (competitionId: string, isTeamCompetition: boolean) => void;
    onDeleteRecord: (recordId: string) => void;
    onDeleteEntry: (entryId: string) => void;
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

describe("PracticeLogDetail (practice/team_practice) 練習削除ボタンの team ガード", () => {
  beforeEach(() => {
    const supabase = createMockSupabaseClient({ queryData: null });
    mockUseAuth.mockReturnValue({ supabase, getAccessToken: vi.fn().mockResolvedValue(null) });
  });

  it("[V-M-P01] type=team_practice では練習削除ボタンが描画されない", () => {
    const onDeletePractice = vi.fn();
    renderItem(makeItem("team_practice", "practice-team-1", "team-x"), true, {
      onDeletePractice,
    });

    expect(screen.queryByTestId("icon-trash-2")).toBeNull();
  });

  it("[V-M-P02] type=practice (個人練習) では練習削除ボタンが描画され、押下で onDeletePractice(id) が呼ばれる (セレクタの健全性確認・非退行)", () => {
    const onDeletePractice = vi.fn();
    renderItem(makeItem("practice", "practice-personal-1"), true, { onDeletePractice });

    fireEvent.click(screen.getByTestId("icon-trash-2").closest("button")!);

    expect(onDeletePractice).toHaveBeenCalledTimes(1);
    expect(onDeletePractice).toHaveBeenCalledWith("practice-personal-1");
  });

  it("[V-M-P03] type=record では record 専用の削除ボタンが描画され、押下で onDeleteRecord は呼ばれるが onDeletePractice は呼ばれない", () => {
    const onDeletePractice = vi.fn();
    const onDeleteRecord = vi.fn();
    // isPractice は実アプリ (DayDetailModal.tsx:335) と同じ導出式で計算する
    // (呼び出し側でハードコードすると、その値自体で分岐が短絡し何を検証しているか
    // 不明瞭になるため)。
    const item = makeItem("record", "record-1");
    const isPractice = item.type === "practice" || item.type === "team_practice";

    renderItem(item, isPractice, { onDeletePractice, onDeleteRecord });

    fireEvent.click(screen.getByTestId("icon-trash-2").closest("button")!);

    expect(onDeleteRecord).toHaveBeenCalledTimes(1);
    expect(onDeleteRecord).toHaveBeenCalledWith("record-1");
    expect(onDeletePractice).not.toHaveBeenCalled();
  });
});
