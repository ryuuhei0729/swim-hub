/**
 * DayDetailModal: メニュー (practice_log) の行を練習1件のカードにまとめる (#59 / #144)
 *
 * calendar_view はメニューのある練習をメニューの行で返す。web と同じく練習1件のカードにまとめ、
 * 練習タイトル・練習メモ・練習単位の操作 (共有・削除) を出せるようにする。
 * チーム練習は type="team_practice" の練習として渡し、自分のメニューがあっても出欠ボタンが出るようにする。
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CalendarItem } from "@apps/shared/types/ui";
import { DayDetailModal } from "../DayDetailModal";

vi.mock("@/components/calendar/DayDetailModal/components", () => ({
  MemoizedPracticeLogDetail: (props: {
    item: CalendarItem;
    title: string;
    typeLabel: string;
    isPractice: boolean;
    practiceId: string;
    targetLogId?: string;
    practiceLogUpdateKey?: string;
  }) => (
    <div
      data-testid={`card-${props.item.type}-${props.item.id}`}
      data-title={props.title}
      data-type-label={props.typeLabel}
      data-is-practice={String(props.isPractice)}
      data-practice-id={props.practiceId}
      data-note={props.item.note ?? ""}
      data-target-log-id={props.targetLogId ?? ""}
      data-update-key={props.practiceLogUpdateKey ?? ""}
    />
  ),
  RecordDetail: () => null,
  EntryDetail: () => null,
}));

function makeLog(id: string, practice: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    id,
    type: "practice_log",
    date: "2026-07-15",
    title: "100m × 4本",
    place: "市民プール",
    metadata: {
      practice,
      practice_log: { id, practice_id: practice.id, distance: 100, rep_count: 4, set_count: 1, updated_at: `u-${id}` },
      ...extra,
    },
  } as unknown as CalendarItem;
}

function renderModal(entries: CalendarItem[]) {
  return render(
    <DayDetailModal visible date={new Date("2026-07-15T00:00:00Z")} entries={entries} onClose={vi.fn()} />,
  );
}

describe("DayDetailModal 練習のまとめ", () => {
  it("同じ練習のメニュー2行を練習1件のカードにまとめ、練習タイトル・練習メモを渡す", () => {
    const practice = { id: "practice-1", title: "朝練", note: "フォーム重視", place: "市民プール" };
    renderModal([makeLog("log-a", practice), makeLog("log-b", practice)]);

    const card = screen.getByTestId("card-practice-practice-1");
    expect(screen.getAllByTestId(/^card-/)).toHaveLength(1);
    expect(card.getAttribute("data-is-practice")).toBe("true");
    expect(card.getAttribute("data-practice-id")).toBe("practice-1");
    expect(card.getAttribute("data-title")).toBe("朝練");
    expect(card.getAttribute("data-note")).toBe("フォーム重視");
    expect(card.getAttribute("data-type-label")).toBe("練習ログ");
    expect(card.getAttribute("data-target-log-id")).toBe("");
    expect(card.getAttribute("data-update-key")).toBe("log-a:u-log-a,log-b:u-log-b");
  });

  it("[#144] 自分のメニューがあるチーム練習は team_practice の練習として渡す (出欠ボタンが出る)", () => {
    const practice = { id: "practice-t", title: null, note: null, place: "" };
    renderModal([
      makeLog("log-t", practice, { team_id: "team-1", team: { id: "team-1", name: "Aチーム" } }),
    ]);

    const card = screen.getByTestId("card-team_practice-practice-t");
    expect(card.getAttribute("data-type-label")).toBe("チーム練習");
    expect(card.getAttribute("data-title")).toBe("Aチーム - チーム練習");
  });
});
