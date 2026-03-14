// =============================================================================
// PracticeLogItem.test.tsx - 練習ログアイテムコンポーネントのテスト
// =============================================================================

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PracticeLogItem } from "../PracticeLogItem";
import type { PracticeLogWithTags } from "@swim-hub/shared/types";

describe("PracticeLogItem", () => {
  const mockLog: PracticeLogWithTags = {
    id: "log-1",
    user_id: "user-1",
    practice_id: "practice-1",
    distance: 100,
    rep_count: 4,
    set_count: 2,
    circle: null,
    style: "freestyle",
    swim_category: "Swim",
    note: "テストメモ",
    created_at: "2025-01-15T10:00:00Z",
    updated_at: "2025-01-15T10:00:00Z",
    practice_times: [
      {
        id: "time-1",
        user_id: "user-1",
        practice_log_id: "log-1",
        set_number: 1,
        rep_number: 1,
        time: 60.5,
        created_at: "2025-01-15T10:00:00Z",
      },
      {
        id: "time-2",
        user_id: "user-1",
        practice_log_id: "log-1",
        set_number: 1,
        rep_number: 2,
        time: 61.0,
        created_at: "2025-01-15T10:00:00Z",
      },
    ],
    practice_log_tags: [
      {
        practice_tag_id: "tag-1",
        practice_tags: {
          id: "tag-1",
          name: "テストタグ",
          color: "#FF0000",
          user_id: "user-1",
          created_at: "2025-01-15T10:00:00Z",
          updated_at: "2025-01-15T10:00:00Z",
        },
      },
    ],
  };

  it("練習内容カードが正しく表示される", () => {
    render(<PracticeLogItem log={mockLog} />);

    // 練習内容ラベル
    expect(screen.getByText("練習内容")).toBeTruthy();
    // 種目が表示される
    expect(screen.getByText("freestyle")).toBeTruthy();
  });

  it("タイムテーブルが表示される", () => {
    render(<PracticeLogItem log={mockLog} />);

    // タイムヘッダーが表示される
    expect(screen.getByText("タイム")).toBeTruthy();
    // セットヘッダーが表示される
    expect(screen.getByText("1セット目")).toBeTruthy();
    // 本数ラベルが表示される
    expect(screen.getByText("1本目")).toBeTruthy();
    // タイム値が表示される
    expect(screen.getByText("1:00.50")).toBeTruthy();
    expect(screen.getByText("1:01.00")).toBeTruthy();
  });

  it("セット平均と全体統計が表示される", () => {
    render(<PracticeLogItem log={mockLog} />);

    expect(screen.getByText("セット平均")).toBeTruthy();
    expect(screen.getByText("全体平均")).toBeTruthy();
    expect(screen.getByText("全体最速")).toBeTruthy();
  });

  it("タグが表示される", () => {
    render(<PracticeLogItem log={mockLog} />);

    expect(screen.getByText("テストタグ")).toBeTruthy();
  });

  it("タグがない場合、タグが表示されない", () => {
    const logWithoutTags: PracticeLogWithTags = {
      ...mockLog,
      practice_log_tags: [],
    };

    render(<PracticeLogItem log={logWithoutTags} />);

    expect(screen.queryByText("テストタグ")).toBeNull();
  });

  it("メモが表示される", () => {
    render(<PracticeLogItem log={mockLog} />);

    expect(screen.getByText("テストメモ")).toBeTruthy();
  });

  it("メモがnullの場合、メモが表示されない", () => {
    const logWithoutNote: PracticeLogWithTags = {
      ...mockLog,
      note: null,
    };

    render(<PracticeLogItem log={logWithoutNote} />);

    expect(screen.queryByText("テストメモ")).toBeNull();
  });

  it("タイムがない場合、タイムセクションが表示されない", () => {
    const logWithoutTimes: PracticeLogWithTags = {
      ...mockLog,
      practice_times: [],
    };

    render(<PracticeLogItem log={logWithoutTimes} />);

    expect(screen.queryByText("タイム")).toBeNull();
  });
});
