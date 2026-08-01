// =============================================================================
// PracticeItem.test.tsx - 練習記録アイテムコンポーネントのテスト
// =============================================================================
//
// 2026-08-01 更新: 一覧のカード粒度が「1練習=1カード(全ログを行として詰め込む)」から
// 「1練習ログ=1カード」へ変わった(大会タブ RecordItem と同じ粒度)。本コンポーネントは
// props で渡された1ログ分だけを描画し、複数ログの並置は呼び出し側(PracticesScreen が
// buildPracticeLogRows で平坦化する)の責務になった。
//
// web 側の対応テスト(同一フィクスチャでパリティ確認):
//   apps/web/app/[locale]/(authenticated)/practice/_components/__tests__/PracticeCard.test.tsx
//
// トートロジー防止メモ: 実装の組み立て手順をなぞらず、「そのカードに何が見えていて
// 何が見えていないか」から逆算したアサーションにする。

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { PracticeLogWithTags } from "@swim-hub/shared/types";
import { PracticeItem } from "../PracticeItem";
import { createMockPracticeWithLogs } from "@/__mocks__/supabase";

// web PracticeCard.test.tsx と対応する共通フィクスチャ(パリティ検証用)。
// distance/rep_count/set_count/circle/style/tags をあえてログごとに変える。
const PARITY_FIXTURE_LOGS: PracticeLogWithTags[] = [
  {
    id: "log-a",
    user_id: "user-1",
    practice_id: "practice-1",
    swim_category: "Swim",
    distance: 100,
    rep_count: 4,
    set_count: 1,
    circle: 90,
    style: "fr",
    note: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    practice_times: [],
    practice_log_tags: [
      { practice_tag_id: "tag-a", practice_tags: { id: "tag-a", name: "タグA", color: "#111111" } },
    ],
  },
  {
    id: "log-b",
    user_id: "user-1",
    practice_id: "practice-1",
    swim_category: "Swim",
    distance: 50,
    rep_count: 8,
    set_count: 2,
    circle: 60,
    style: "br",
    note: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    practice_times: [],
    practice_log_tags: [
      { practice_tag_id: "tag-b", practice_tags: { id: "tag-b", name: "タグB", color: "#222222" } },
    ],
  },
] as unknown as PracticeLogWithTags[];

describe("PracticeItem", () => {
  const mockPractice = createMockPracticeWithLogs({
    date: "2025-01-15",
    title: "テスト練習",
    place: "テストプール",
    note: "テストメモ",
    practice_logs: PARITY_FIXTURE_LOGS,
  });

  it("ヘッダー(日付・タイトル・場所)と、渡されたログの内容が表示される", () => {
    render(<PracticeItem practice={mockPractice} log={PARITY_FIXTURE_LOGS[0]} />);

    // 日付が表示される（2026-08-01 ユーザー要望で numeric 形式に変更。
    // ja/en/zh/ko は "yyyy/MM/dd"、de のみ "dd.MM.yyyy"。例: "2025/01/15"）
    expect(screen.getByText(/2025\/01\/15/)).toBeTruthy();
    expect(screen.getByText("テスト練習")).toBeTruthy();
    expect(screen.getByText("テストプール")).toBeTruthy();
    expect(screen.getByTestId("icon-map-pin")).toBeTruthy();
    // 渡されたログの距離・本数・セット
    expect(screen.getByText(/100m × 4本 × 1セット/)).toBeTruthy();
  });

  it(
    "[最重要] 複数ログを持つ練習でも、渡されたログ以外の内容は表示されない" +
      "(1枚のカードに全ログを詰め込む day-level 表示への退行防止)",
    () => {
      render(<PracticeItem practice={mockPractice} log={PARITY_FIXTURE_LOGS[0]} />);

      expect(screen.getByText(/100m × 4本 × 1セット/)).toBeTruthy();
      expect(screen.queryByText(/50m × 8本 × 2セット/)).toBeNull();
    },
  );

  it("タグは渡されたログ自身のものだけが表示される(兄弟ログのタグは混入しない)", () => {
    render(<PracticeItem practice={mockPractice} log={PARITY_FIXTURE_LOGS[1]} />);

    expect(screen.getByText("タグB")).toBeTruthy();
    expect(screen.queryByText("タグA")).toBeNull();
  });

  it("ヘッダーは practice 由来なので、どのログのカードにも表示される", () => {
    const { unmount } = render(<PracticeItem practice={mockPractice} log={PARITY_FIXTURE_LOGS[0]} />);
    expect(screen.getByText("テスト練習")).toBeTruthy();
    unmount();

    render(<PracticeItem practice={mockPractice} log={PARITY_FIXTURE_LOGS[1]} />);
    expect(screen.getByText("テスト練習")).toBeTruthy();
    expect(screen.getByText(/50m × 8本 × 2セット/)).toBeTruthy();
  });

  it("タイトルがnullの場合、「練習」が表示される", () => {
    const practiceWithoutTitle = createMockPracticeWithLogs({
      ...mockPractice,
      title: null,
    });

    render(<PracticeItem practice={practiceWithoutTitle} log={PARITY_FIXTURE_LOGS[0]} />);

    expect(screen.getByText("練習")).toBeTruthy();
  });

  it("log=null(ログ未登録の練習)の場合、2行目は表示されずクラッシュしない", () => {
    const practiceWithoutLogs = createMockPracticeWithLogs({
      ...mockPractice,
      practice_logs: [],
    });

    expect(() => render(<PracticeItem practice={practiceWithoutLogs} log={null} />)).not.toThrow();
    expect(screen.queryByText(/セット/)).toBeNull();
    // ヘッダーは残るので、練習が一覧から消えることはない
    expect(screen.getByText("テストプール")).toBeTruthy();
  });

  it("場所がnullの場合、場所が表示されない", () => {
    const practiceWithoutPlace = createMockPracticeWithLogs({
      ...mockPractice,
      place: null,
    });

    render(<PracticeItem practice={practiceWithoutPlace} log={PARITY_FIXTURE_LOGS[0]} />);

    expect(screen.queryByText("テストプール")).toBeNull();
    expect(screen.queryByTestId("icon-map-pin")).toBeNull();
  });

  it("メモは一覧カードには表示されない", () => {
    render(<PracticeItem practice={mockPractice} log={PARITY_FIXTURE_LOGS[0]} />);

    expect(screen.queryByText("テストメモ")).toBeNull();
  });

  it("タップで onPress にログではなく practice オブジェクトそのものが渡る", () => {
    const onPress = vi.fn();
    render(<PracticeItem practice={mockPractice} log={PARITY_FIXTURE_LOGS[1]} onPress={onPress} />);

    // Pressableをタップ（button要素としてレンダリングされる）
    const pressable = screen.getByText("テスト練習").closest("button");
    expect(pressable).not.toBeNull();

    fireEvent.click(pressable!);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(mockPractice);
  });

  it("onPressが提供されない場合でもエラーが発生しない", () => {
    render(<PracticeItem practice={mockPractice} log={PARITY_FIXTURE_LOGS[0]} />);

    expect(screen.getByText("テスト練習")).toBeTruthy();
  });
});
