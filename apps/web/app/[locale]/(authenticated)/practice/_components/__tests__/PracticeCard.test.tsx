/**
 * PracticeCard テスト (Sprint Contract Phase B)
 *
 * 対象: `_components/PracticeCard.tsx` (day-level カード、旧 PracticeLogCard の置き換え)
 *
 * 2026-07-28 更新（C-3: 全ログ展開）:
 *   2026-07-23 時点では「day-level カードは先頭ログ(practice_logs[0])のみを表示」が
 *   Sprint Contract だったが、ユーザー判断（「1つの練習に2つの練習ログが登録されていた場合、
 *   どちらも表示させたい」）によりこの決定を上書きし、practice_logs 全件を表示する方式に
 *   変更された（`_utils/practiceDayGrouping.ts` の `buildPracticeLogLines` 参照）。
 *   本ファイルの「先頭ログのみ表示」を検証していた2テストは、QA が「全ログ表示」前提の
 *   内容に書き換えた（単に複数要素を許容する緩いアサーションにはせず、2件目の内容が
 *   実際に見えていることを積極的に検証する）。C-3 の追加観点（3件以上・空配列・
 *   パリティ等）は ./PracticeCard.allLogs.test.tsx を参照。
 *
 * Sprint Contract 検証観点:
 *   [V-26] 内容の異なる2件のログを持つ practice を渡すと、両方の内容(距離・種目・タグ)が
 *          DOM 上に表示される（旧: 先頭ログのみ表示、から意図的に反転）
 *   [V-WP-mobile parity] 表示項目は mobile PracticeItem.tsx の logRows/secondLineInfo/tags と
 *     同一の組み立て方針(日付+タイトル+場所 / ログごとの距離×本数×セット・サークル・種目・タグ)
 *
 * トートロジー防止メモ: PracticeCard.tsx 内の buildPracticeLogLines 組み立てロジックをなぞらず、
 * 「内容の異なる2ログを持つ practice を渡したときに両方の内容がDOM上に見えている」という
 * Sprint Contract C-3 の要求から逆算したアサーションにする。
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
    "[V-26] 2件のログを持つ practice を渡すと、2件目のログの内容(距離・種目)も" +
      "DOM上に表示される(全ログ展開。旧: 先頭ログのみ表示、からの意図的な反転)",
    () => {
      const practice = makePractice({
        practice_logs: [
          makeLog({ id: "log-a", distance: 100, rep_count: 4, set_count: 1, style: "Fr" }),
          makeLog({ id: "log-b", distance: 50, rep_count: 2, set_count: 1, style: "Br" }),
        ],
      });
      renderWithIntl(<PracticeCard practice={practice} onClick={vi.fn()} />);

      expect(screen.getByText(/100m × 4本 × 1セット/)).toBeInTheDocument();
      expect(screen.getByText(/50m × 2本 × 1セット/)).toBeInTheDocument();
      expect(screen.getByText(/平泳ぎ/)).toBeInTheDocument();
    },
  );

  it("practice_logs が空配列の場合、2行目(距離・種目)は表示されずクラッシュしない", () => {
    const practice = makePractice({ practice_logs: [] });
    expect(() => renderWithIntl(<PracticeCard practice={practice} onClick={vi.fn()} />)).not.toThrow();
    expect(screen.queryByText(/自由形/)).not.toBeInTheDocument();
  });

  it("[V-30] 各ログのタグがそれぞれ表示される(ログ1・ログ2のタグが両方見える)", () => {
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
    expect(screen.getByText("タグB")).toBeInTheDocument();
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
