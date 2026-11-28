/**
 * PracticeLogDetail（isPractice 展開ブロック）シェア機能 テスト（Phase B 本実装）
 *
 * 対象: apps/mobile/components/calendar/DayDetailModal/components/PracticeLogDetail.tsx
 * 参照実装: apps/web/.../DayDetailModal/components/PracticeSection/PracticeDetails.tsx
 *
 * テスト方針:
 *   `@/components/share` の `ShareCardModal` を spy 付きスタブに vi.mock し、
 *   共有ボタン押下で組み立てられる `PracticeShareData`（menuItems/totalDistance/totalSets）
 *   を直接検証する。PracticeShareCard 自体のレイアウトは別ファイル
 *   (share/__tests__/PracticeShareCard.test.tsx) で検証済みであり、かつ
 *   totalDistance/totalSets は web/mobile とも一切 DOM に描画されない仕様のため、
 *   カードの描画結果からは検証できない（データ組み立てロジックそのものを見る必要がある）。
 *
 * Sprint Contract 検証観点:
 *   [V-09] isPractice 展開ブロックの練習カードに共有ボタンが表示される
 *   [V-10] practiceLogs が2件以上あるとき、共有ボタン押下で ShareCardModal(type="practice") の
 *          data.menuItems に全件が含まれる（1件目だけでない）
 *   [V-11] practiceLogs が1件のみのとき、data.menuItems にその1件のみが正しく含まれる
 *   [V-12] data.totalDistance が Σ(distance*repCount*setCount)、data.totalSets が
 *          Σ(setCount) として計算される
 *   [V-13] 練習タブでメニュー1件から開いたとき (targetLogId) もそのメニューに共有ボタンが出て、共有は練習全体になる
 *
 * トートロジー防止メモ:
 *   「全ログ集約」という期待値は web PracticeDetails.tsx の実装（menuItems は
 *   practiceLogs 全体の map であり、クリックされた特定の log 由来ではない）と
 *   Sprint Contract の記述から導出したものであり、mobile 実装コードの diff を
 *   読んでコピーしたものではない。
 */

import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithQuery as render } from "@/__tests__/helpers/testUtils";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "@/__mocks__/supabase";

// --- AuthProvider モック ---
vi.mock("@/contexts/AuthProvider");
import { useAuth } from "@/contexts/AuthProvider";
import { buildAuthContext } from "@/__tests__/helpers/authContext";

// --- ShareCardModal spy スタブ ---
const mockShareCardModal = vi.hoisted(() => vi.fn());
vi.mock("@/components/share", () => ({
  ShareCardModal: (props: unknown) => {
    mockShareCardModal(props);
    return null;
  },
}));

// --- expo-image-picker / expo-image-manipulator ---
// ImageViewerModal 経由でバレル評価される依存(components/shared/__tests__/ImageUploader.test.tsx と同一パターン)
vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
}));
vi.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: vi.fn() },
  SaveFormat: { JPEG: "jpeg", PNG: "png", WEBP: "webp" },
}));

// --- Dimensions / SafeAreaView ---
// ImageViewerModal.tsx は react-native 本体の SafeAreaView / Dimensions を直接使うため、
// 基本モック(__mocks__/react-native.ts)に無いこれらを追加する
// (components/shared/__tests__/ImageViewerModal.test.tsx と同一パターン)。
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
import type { CalendarItem } from "@apps/shared/types/ui";

function makeItem(overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    id: "practice-1",
    type: "practice",
    date: "2026-07-01",
    title: "朝練",
    place: "市民プール",
    metadata: {},
    ...overrides,
  } as CalendarItem;
}

function makePracticeLogRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "log-a",
    practice_id: "practice-1",
    style: "Fr",
    swim_category: "Swim",
    rep_count: 4,
    set_count: 1,
    distance: 100,
    circle: 90,
    note: null,
    practice_times: [],
    practice_log_tags: [],
    ...overrides,
  };
}

function setupSupabase(practiceLogs: Record<string, unknown>[]) {
  const supabase = createMockSupabaseClient({
    queryData: {
      id: "practice-1",
      image_paths: [],
      practice_logs: practiceLogs,
    },
  });
  vi.mocked(useAuth).mockReturnValue(buildAuthContext({ user: null, supabase, getAccessToken: vi.fn().mockResolvedValue(null) }));
  return supabase;
}

function renderPracticeLogDetail(overrides: Record<string, unknown> = {}) {
  return render(
    <PracticeLogDetail
      item={makeItem()}
      title="朝練"
      color="#10B981"
      typeLabel="練習"
      isPractice
      practiceId="practice-1"
      onClose={vi.fn()}
      {...overrides}
    />,
  );
}

describe("PracticeLogDetail practice share (isPractice block)", () => {
  beforeEach(() => {
    mockShareCardModal.mockClear();
  });

  it("[V-09] practiceLogs がある日を展開すると、各練習カードに共有ボタンが表示される", async () => {
    setupSupabase([makePracticeLogRow({ id: "log-a" }), makePracticeLogRow({ id: "log-b" })]);
    renderPracticeLogDetail();

    await waitFor(() => {
      expect(screen.getAllByTestId("icon-share-2").length).toBe(2);
    });
  });

  it("[V-10] 内容の異なる2件の practiceLogs があるとき、1件目の共有ボタンを押しても両方が menuItems に含まれる", async () => {
    setupSupabase([
      makePracticeLogRow({ id: "log-a", distance: 100, rep_count: 4, set_count: 1, style: "Fr" }),
      makePracticeLogRow({ id: "log-b", distance: 50, rep_count: 8, set_count: 2, style: "Br" }),
    ]);
    renderPracticeLogDetail();

    await waitFor(() => {
      expect(screen.getAllByTestId("icon-share-2").length).toBe(2);
    });

    // 1件目(log-a)の共有ボタンを押す
    const shareButtons = screen.getAllByTestId("icon-share-2");
    fireEvent.click(shareButtons[0]!.closest("button")!); // getAllByTestId で取得済みのボタンなので必ず存在

    await waitFor(() => {
      expect(mockShareCardModal).toHaveBeenCalledWith(
        expect.objectContaining({ visible: true, type: "practice" }),
      );
    });
    const lastCall = mockShareCardModal.mock.calls[mockShareCardModal.mock.calls.length - 1]![0] as { // 直前の toHaveBeenCalledWith/waitFor で呼び出し済みであることを確認済み
      data: { menuItems: Array<{ distance: number; style: string }> };
    };
    expect(lastCall.data.menuItems).toHaveLength(2);
    expect(lastCall.data.menuItems[0]).toMatchObject({ distance: 100, style: "Fr" });
    expect(lastCall.data.menuItems[1]).toMatchObject({ distance: 50, style: "Br" });
  });

  it("[V-10] 2件目の共有ボタンを押しても、結果は1件目を押したときと同じ(全件集約)になる", async () => {
    setupSupabase([
      makePracticeLogRow({ id: "log-a", distance: 100 }),
      makePracticeLogRow({ id: "log-b", distance: 50 }),
    ]);
    renderPracticeLogDetail();

    await waitFor(() => {
      expect(screen.getAllByTestId("icon-share-2").length).toBe(2);
    });
    const shareButtons = screen.getAllByTestId("icon-share-2");
    fireEvent.click(shareButtons[1]!.closest("button")!); // getAllByTestId で取得済みのボタンなので必ず存在

    await waitFor(() => {
      const lastCall = mockShareCardModal.mock.calls[mockShareCardModal.mock.calls.length - 1]![0] as { // 直前の toHaveBeenCalledWith/waitFor で呼び出し済みであることを確認済み
        data: { menuItems: Array<{ distance: number }> };
      };
      expect(lastCall.data.menuItems).toHaveLength(2);
    });
  });

  it("[V-11] practiceLogs が1件のみのとき、menuItems にその1件のみが含まれる", async () => {
    setupSupabase([makePracticeLogRow({ id: "log-a", distance: 100 })]);
    renderPracticeLogDetail();

    await waitFor(() => {
      expect(screen.getAllByTestId("icon-share-2").length).toBe(1);
    });
    fireEvent.click(screen.getByTestId("icon-share-2").closest("button")!);

    await waitFor(() => {
      const lastCall = mockShareCardModal.mock.calls[mockShareCardModal.mock.calls.length - 1]![0] as { // 直前の toHaveBeenCalledWith/waitFor で呼び出し済みであることを確認済み
        data: { menuItems: unknown[] };
      };
      expect(lastCall.data.menuItems).toHaveLength(1);
    });
  });

  it("[V-12] totalDistance/totalSets が全ログ分の合計として計算される", async () => {
    setupSupabase([
      makePracticeLogRow({ id: "log-a", distance: 100, rep_count: 4, set_count: 2 }), // 800
      makePracticeLogRow({ id: "log-b", distance: 50, rep_count: 8, set_count: 1 }), // 400
    ]);
    renderPracticeLogDetail();

    await waitFor(() => {
      expect(screen.getAllByTestId("icon-share-2").length).toBe(2);
    });
    fireEvent.click(screen.getAllByTestId("icon-share-2")[0]!.closest("button")!); // getAllByTestId は1件以上見つからなければ throw するため必ず存在

    await waitFor(() => {
      const lastCall = mockShareCardModal.mock.calls[mockShareCardModal.mock.calls.length - 1]![0] as { // 直前の toHaveBeenCalledWith/waitFor で呼び出し済みであることを確認済み
        data: { totalDistance: number; totalSets: number };
      };
      expect(lastCall.data.totalDistance).toBe(800 + 400);
      expect(lastCall.data.totalSets).toBe(2 + 1);
    });
  });

  it("[V-13] 練習タブでメニュー1件から開いたとき (targetLogId) もそのメニューに共有ボタンを出し、共有は練習全体にする", async () => {
    setupSupabase([
      makePracticeLogRow({ id: "log-a", distance: 100 }),
      makePracticeLogRow({ id: "log-b", distance: 50 }),
    ]);
    renderPracticeLogDetail({ targetLogId: "log-b" });

    // 出すのは押したメニュー1件だけ
    await waitFor(() => {
      expect(screen.getAllByTestId("icon-share-2").length).toBe(1);
    });
    fireEvent.click(screen.getByTestId("icon-share-2").closest("button")!);

    await waitFor(() => {
      const lastCall = mockShareCardModal.mock.calls[mockShareCardModal.mock.calls.length - 1]![0] as { // 直前の waitFor で共有ボタンを押し済み
        data: { menuItems: unknown[] };
      };
      expect(lastCall.data.menuItems).toHaveLength(2);
    });
  });
});

describe("PracticeLogDetail 練習カード (メニューのある練習, #59 / #142)", () => {
  beforeEach(() => {
    mockShareCardModal.mockClear();
  });

  function setupSupabaseWithUser(practiceLogs: Record<string, unknown>[], note: string | null = null) {
    const supabase = createMockSupabaseClient({
      queryData: { id: "practice-1", image_paths: [], note, practice_logs: practiceLogs },
    });
    vi.mocked(useAuth).mockReturnValue(
      buildAuthContext({ user: { id: "user-1" }, supabase, getAccessToken: vi.fn().mockResolvedValue(null) }),
    );
  }

  it("Swim 以外の種別 (Kick/Pull) を練習内容に出す", async () => {
    setupSupabaseWithUser([makePracticeLogRow({ id: "log-a", user_id: "user-1", swim_category: "Kick" })]);
    renderPracticeLogDetail();

    await waitFor(() => expect(screen.getByText("Kick")).toBeTruthy());
  });

  it("練習メモを見出しに出す", async () => {
    setupSupabaseWithUser([makePracticeLogRow({ id: "log-a", user_id: "user-1" })]);
    renderPracticeLogDetail({ item: makeItem({ note: "フォーム重視" }) });

    expect(screen.getByText("フォーム重視")).toBeTruthy();
  });

  it("[#142] チーム練習に付いている他のメンバーのメニューは出さず、共有にも混ぜない", async () => {
    setupSupabaseWithUser([
      makePracticeLogRow({ id: "log-mine", user_id: "user-1", distance: 100 }),
      makePracticeLogRow({ id: "log-other", user_id: "user-2", distance: 50 }),
    ]);
    renderPracticeLogDetail({
      item: makeItem({ type: "team_practice", metadata: { team_id: "team-1" } }),
    });

    await waitFor(() => {
      expect(screen.getAllByTestId("icon-share-2").length).toBe(1);
    });
    fireEvent.click(screen.getByTestId("icon-share-2").closest("button")!);
    await waitFor(() => {
      const lastCall = mockShareCardModal.mock.calls[mockShareCardModal.mock.calls.length - 1]![0] as { // 直前の waitFor で共有ボタンを押し済み
        data: { menuItems: Array<{ distance: number }> };
      };
      expect(lastCall.data.menuItems).toEqual([expect.objectContaining({ distance: 100 })]);
    });

    // 自分のメニューがあるチーム練習にも出欠ボタン (#144) と「チームの記録を見る」(#141) を出す
    expect(screen.getByTestId("icon-clipboard")).toBeTruthy();
    expect(screen.getByText("チームの記録を見る")).toBeTruthy();
  });

  it("メニューごとに編集・削除ボタンを出し、押すとそのメニューで呼ぶ", async () => {
    setupSupabaseWithUser([makePracticeLogRow({ id: "log-a", user_id: "user-1" })]);
    const onEditPracticeLog = vi.fn();
    const onDeletePracticeLog = vi.fn();
    renderPracticeLogDetail({ onEditPracticeLog, onDeletePracticeLog });

    await waitFor(() => expect(screen.getByTestId("icon-share-2")).toBeTruthy());
    // 練習そのものの編集・削除 (onEditPractice / onDeletePractice) は渡していないので、
    // 鉛筆・ゴミ箱はメニューの分だけ
    fireEvent.click(screen.getByTestId("icon-trash-2").closest("button")!);
    expect(onDeletePracticeLog).toHaveBeenCalledWith("log-a");
    fireEvent.click(screen.getByTestId("icon-edit-2").closest("button")!);
    expect(onEditPracticeLog).toHaveBeenCalledWith(
      expect.objectContaining({ id: "log-a", metadata: expect.objectContaining({ practice_id: "practice-1" }) }),
    );
  });
});
