// =============================================================================
// PracticeItem.test.tsx - 練習記録アイテムコンポーネントのテスト
// =============================================================================
//
// 2026-07-28 更新: C-3(全ログ展開)によりログ1件目のみでなく全件を表示するようになった。
// 従来のフィクスチャは log-1/log-2 が同一内容だったため、全ログ表示化により
// 「同じテキストが2要素になる」だけで Found multiple elements 例外になっていた
// (2件目が実際に見えていることの証明にはならない、緩いだけの修正は禁止)。
// ここでは内容の異なる2ログのフィクスチャに変更し、[V-26] の主旨(2件目のログの内容が
// 実際に見えている)を明示的に検証する。関連スケルトン:
// components/practices/__tests__/PracticeItem.allLogs.test.tsx

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PracticeItem } from "../PracticeItem";
import { createMockPracticeWithLogs } from "@/__mocks__/supabase";

describe("PracticeItem", () => {
  const mockPractice = createMockPracticeWithLogs({
    date: "2025-01-15",
    title: "テスト練習",
    place: "テストプール",
    note: "テストメモ",
    practice_logs: [
      {
        id: "log-1",
        practice_id: "practice-1",
        distance: 100,
        rep_count: 4,
        set_count: 2,
        circle: null,
        style: null,
        note: null,
        created_at: "2025-01-15T10:00:00Z",
        updated_at: "2025-01-15T10:00:00Z",
        practice_log_tags: [],
      },
      {
        id: "log-2",
        practice_id: "practice-1",
        distance: 50,
        rep_count: 8,
        set_count: 1,
        circle: null,
        style: null,
        note: null,
        created_at: "2025-01-15T10:00:00Z",
        updated_at: "2025-01-15T10:00:00Z",
        practice_log_tags: [],
      },
    ],
  });

  it("練習記録データが正しく表示される（[V-26] 内容の異なる2件目のログも表示される）", () => {
    render(<PracticeItem practice={mockPractice} />);

    // 日付が表示される（2026-07-22 大会 RecordItem とのパリティ対応で
    // long形式・年込み・ロケール依存に変更。例: "2025年1月15日"）
    expect(screen.getByText(/2025年1月15日/)).toBeTruthy();
    // タイトルが表示される
    expect(screen.getByText("テスト練習")).toBeTruthy();
    // 場所が表示される（アイコンとテキストが含まれる）
    expect(screen.getByText("テストプール")).toBeTruthy();
    expect(screen.getByTestId("icon-map-pin")).toBeTruthy();
    // 1件目のログの情報が表示される（距離・本数・セット）
    expect(screen.getByText(/100m × 4本 × 2セット/)).toBeTruthy();
    // [V-26] 2件目のログ(内容が異なる)も省略されずに表示される
    expect(screen.getByText(/50m × 8本 × 1セット/)).toBeTruthy();
  });

  it("タイトルがnullの場合、「練習」が表示される", () => {
    const practiceWithoutTitle = createMockPracticeWithLogs({
      ...mockPractice,
      title: null,
    });

    render(<PracticeItem practice={practiceWithoutTitle} />);

    expect(screen.getByText("練習")).toBeTruthy();
  });

  it("練習ログ数が表示される（複数ログ分すべてのセット数が個別の行として表示される）", () => {
    render(<PracticeItem practice={mockPractice} />);

    // セット数は「距離m × 本数本 × セット数セット」の形式で、ログごとに1行ずつ表示される
    // ([V-26]/[V-27] 全ログ展開)。1件目(2セット)・2件目(1セット)がそれぞれ見える。
    expect(screen.getByText(/100m × 4本 × 2セット/)).toBeTruthy();
    expect(screen.getByText(/50m × 8本 × 1セット/)).toBeTruthy();
  });

  it("練習ログがない場合、ログ数が表示されない", () => {
    const practiceWithoutLogs = createMockPracticeWithLogs({
      ...mockPractice,
      practice_logs: [],
    });

    render(<PracticeItem practice={practiceWithoutLogs} />);

    expect(screen.queryByText(/セット/)).toBeNull();
  });

  it("場所がnullの場合、場所が表示されない", () => {
    const practiceWithoutPlace = createMockPracticeWithLogs({
      ...mockPractice,
      place: null,
    });

    render(<PracticeItem practice={practiceWithoutPlace} />);

    expect(screen.queryByText("テストプール")).toBeNull();
    expect(screen.queryByTestId("icon-map-pin")).toBeNull();
  });

  it("メモがnullの場合、メモが表示されない", () => {
    const practiceWithoutNote = createMockPracticeWithLogs({
      ...mockPractice,
      note: null,
    });

    render(<PracticeItem practice={practiceWithoutNote} />);

    expect(screen.queryByText("テストメモ")).toBeNull();
  });

  it("onPressが提供された場合、タップでコールバックが呼ばれる", () => {
    const onPress = vi.fn();
    render(<PracticeItem practice={mockPractice} onPress={onPress} />);

    // Pressableをタップ（button要素としてレンダリングされる）
    const pressable = screen.getByText("テスト練習").closest("button");
    expect(pressable).not.toBeNull();

    fireEvent.click(pressable!);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(mockPractice);
  });

  it("onPressが提供されない場合でもエラーが発生しない", () => {
    render(<PracticeItem practice={mockPractice} />);

    // エラーなくレンダリングされる
    expect(screen.getByText("テスト練習")).toBeTruthy();
  });
});
