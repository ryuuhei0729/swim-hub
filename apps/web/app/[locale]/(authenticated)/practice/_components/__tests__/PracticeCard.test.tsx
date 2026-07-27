/**
 * PracticeCard テスト (Sprint Contract Phase B)
 *
 * 対象: `_components/PracticeCard.tsx` (day-level カード、旧 PracticeLogCard の置き換え)
 *
 * Sprint Contract 検証観点:
 *   [V-WP-02] day-level カードは先頭ログ(practice_logs[0])のみを表示し、2件目以降は表示しない
 *   [V-WP-mobile parity] 表示項目は mobile PracticeItem.tsx の firstLog/secondLineInfo/tags と
 *     同一の組み立て方針(日付+タイトル+場所 / 距離×本数×セット・サークル・種目 / タグ)
 *
 * トートロジー防止メモ: PracticeCard.tsx 内の secondLineParts 組み立てロジックをなぞらず、
 * 「2ログ持つ practice を渡したときに2件目の内容がDOM上に一切現れない」という
 * Sprint Contract の要求から逆算したアサーションにする。
 */

import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import type { PracticeWithLogs, PracticeLogWithTags } from "@apps/shared/types";
import PracticeCard from "../PracticeCard";

const renderWithIntl = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );

function makeLog(overrides: Partial<PracticeLogWithTags> & { id: string }): PracticeLogWithTags {
  return {
    user_id: "user-1",
    practice_id: "practice-1",
    style: "Fr",
    swim_category: "Swim",
    rep_count: 4,
    set_count: 1,
    distance: 100,
    circle: 90,
    note: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    practice_times: [],
    practice_log_tags: [],
    ...overrides,
  } as PracticeLogWithTags;
}

function makePractice(overrides: Partial<PracticeWithLogs> = {}): PracticeWithLogs {
  return {
    id: "practice-1",
    user_id: "user-1",
    date: "2026-07-01",
    title: null,
    place: "市民プール",
    note: null,
    team_id: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    practice_logs: [makeLog({ id: "log-a" })],
    ...overrides,
  } as PracticeWithLogs;
}

describe("PracticeCard", () => {
  it("[V-WP-02] 先頭ログの距離×本数×セット・種目が表示される", () => {
    const practice = makePractice({
      practice_logs: [makeLog({ id: "log-a", distance: 100, rep_count: 4, set_count: 1, style: "Fr" })],
    });
    renderWithIntl(<PracticeCard practice={practice} onClick={vi.fn()} />);

    // 2行目は "100m × 4本 × 1セット / 1'30" / 自由形" のように " / " 区切りで1つの
    // <span> に結合される(mobile PracticeItem.tsx の secondLineInfo と同じ組み立て方針)。
    // 完全一致ではなく部分一致で検証する。
    expect(screen.getByText(/100m × 4本 × 1セット/)).toBeInTheDocument();
    expect(screen.getByText(/自由形/)).toBeInTheDocument();
  });

  it(
    "[V-WP-02 最重要] 2件のログを持つ practice を渡しても、2件目のログの内容(距離・種目)は" +
      "DOM上に一切現れない(先頭ログのみ表示)",
    () => {
      const practice = makePractice({
        practice_logs: [
          makeLog({ id: "log-a", distance: 100, rep_count: 4, set_count: 1, style: "Fr" }),
          makeLog({ id: "log-b", distance: 50, rep_count: 2, set_count: 1, style: "Br" }),
        ],
      });
      renderWithIntl(<PracticeCard practice={practice} onClick={vi.fn()} />);

      expect(screen.getByText(/100m × 4本 × 1セット/)).toBeInTheDocument();
      expect(screen.queryByText(/50m × 2本 × 1セット/)).not.toBeInTheDocument();
      expect(screen.queryByText(/平泳ぎ/)).not.toBeInTheDocument();
    },
  );

  it("practice_logs が空配列の場合、2行目(距離・種目)は表示されずクラッシュしない", () => {
    const practice = makePractice({ practice_logs: [] });
    expect(() => renderWithIntl(<PracticeCard practice={practice} onClick={vi.fn()} />)).not.toThrow();
    expect(screen.queryByText(/自由形/)).not.toBeInTheDocument();
  });

  it("先頭ログのタグのみが表示される(2件目のログのタグは現れない)", () => {
    const tagA = { id: "tag-a", name: "タグA", color: "#111", user_id: "u", created_at: "", updated_at: "" };
    const tagB = { id: "tag-b", name: "タグB", color: "#222", user_id: "u", created_at: "", updated_at: "" };
    const practice = makePractice({
      practice_logs: [
        makeLog({
          id: "log-a",
          practice_log_tags: [{ practice_tag_id: "tag-a", practice_tags: tagA }],
        }),
        makeLog({
          id: "log-b",
          practice_log_tags: [{ practice_tag_id: "tag-b", practice_tags: tagB }],
        }),
      ],
    });
    renderWithIntl(<PracticeCard practice={practice} onClick={vi.fn()} />);

    expect(screen.getByText("タグA")).toBeInTheDocument();
    expect(screen.queryByText("タグB")).not.toBeInTheDocument();
  });

  it("カードクリックで onClick に practice(日単位オブジェクト。ログではない)が渡される", async () => {
    const onClick = vi.fn();
    const practice = makePractice({ id: "practice-xyz" });
    renderWithIntl(<PracticeCard practice={practice} onClick={onClick} />);

    screen.getByRole("button", { name: /^練習詳細を表示\(/ }).click();

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ id: "practice-xyz" }));
  });

  it("キーボード操作(Enter)でも onClick が発火する(a11y要件)", () => {
    const onClick = vi.fn();
    renderWithIntl(<PracticeCard practice={makePractice()} onClick={onClick} />);

    const card = screen.getByRole("button", { name: /^練習詳細を表示\(/ });
    card.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("practice.date が不正な文字列でもクラッシュせず、日付欄が「-」表示になる", () => {
    const practice = makePractice({ date: "invalid-date-string" });
    expect(() => renderWithIntl(<PracticeCard practice={practice} onClick={vi.fn()} />)).not.toThrow();
    const card = screen.getByRole("button", { name: /^練習詳細を表示\(/ });
    expect(card.textContent).toContain("-");
  });
});
