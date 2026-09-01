/**
 * PracticeCard テスト
 *
 * 対象: `_components/PracticeCard.tsx` (log-level カード = 1 practice_log で1枚)
 *
 * 2026-08-01 更新:
 *   一覧のカード粒度が「1練習=1カード(全ログを行として詰め込む)」から
 *   「1練習ログ=1カード」へ変わった(大会タブ CompetitionRecordCard と同じ粒度)。
 *   本コンポーネントは渡された1ログ分だけを描画し、複数ログの並置は呼び出し側
 *   (PracticeClient が buildPracticeLogRows で平坦化する)の責務になった。
 *   カードが2枚に分かれること自体の検証は
 *   `_client/__tests__/PracticeClient.filterSort.test.tsx` を参照。
 *
 * 検証観点:
 *   - 渡されたログの内容(距離×本数×セット・サークル・種目・タグ)が表示される
 *   - [最重要] 渡していない兄弟ログの内容は表示されない(day-level 表示への退行防止)
 *   - ヘッダー(日付/タイトル/場所)は practice 由来なので、どのログのカードにも出る
 *   - log=null(ログ未登録の練習)でもクラッシュせず、ヘッダーのみのカードになる
 *   - クリック/Enter で onClick に practice(ログではない)が渡る
 *
 * トートロジー防止メモ: 実装の組み立て手順をなぞらず、「そのカードに何が見えていて
 * 何が見えていないか」から逆算したアサーションにする。
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

const tagA = { id: "tag-a", name: "タグA", color: "#111111", user_id: "u", created_at: "", updated_at: "" };
const tagB = { id: "tag-b", name: "タグB", color: "#222222", user_id: "u", created_at: "", updated_at: "" };

// mobile PracticeItem.test.tsx の PARITY_FIXTURE_LOGS と対応するフィクスチャ
// (distance/rep_count/set_count/circle/style/tags を意図的にログごとに変える)
const PARITY_FIXTURE_LOGS: PracticeLogWithTags[] = [
  makeLog({
    id: "log-a",
    distance: 100,
    rep_count: 4,
    set_count: 1,
    circle: 90,
    style: "Fr",
    practice_log_tags: [{ practice_tag_id: "tag-a", practice_tags: tagA }],
  }),
  makeLog({
    id: "log-b",
    distance: 50,
    rep_count: 8,
    set_count: 2,
    circle: 60,
    style: "Br",
    practice_log_tags: [{ practice_tag_id: "tag-b", practice_tags: tagB }],
  }),
];

// NOTE: `PARITY_FIXTURE_LOGS[N]!` / `practice.practice_logs[0]!` を多用する。
// PARITY_FIXTURE_LOGS は上で2件固定定義しており、practice.practice_logs も
// makePractice() の既定 fixture が1件以上のログを持つ設計になっている。
describe("PracticeCard", () => {
  it("渡されたログの距離×本数×セット・サークル・種目が ' / ' 区切りで表示される", () => {
    const practice = makePractice({ practice_logs: PARITY_FIXTURE_LOGS });
    renderWithIntl(
      <PracticeCard practice={practice} log={PARITY_FIXTURE_LOGS[0]!} onClick={vi.fn()} />,
    );

    expect(screen.getByText(/100m × 4本 × 1セット/)).toBeInTheDocument();
    expect(screen.getByText(/1'30"/)).toBeInTheDocument();
    expect(screen.getByText(/自由形/)).toBeInTheDocument();
  });

  it(
    "[最重要] 複数ログを持つ練習でも、渡されたログ以外の内容は表示されない" +
      "(1枚のカードに全ログを詰め込む day-level 表示への退行防止)",
    () => {
      const practice = makePractice({ practice_logs: PARITY_FIXTURE_LOGS });
      renderWithIntl(
        <PracticeCard practice={practice} log={PARITY_FIXTURE_LOGS[0]!} onClick={vi.fn()} />,
      );

      expect(screen.getByText(/100m × 4本 × 1セット/)).toBeInTheDocument();
      expect(screen.queryByText(/50m × 8本 × 2セット/)).not.toBeInTheDocument();
      expect(screen.queryByText(/平泳ぎ/)).not.toBeInTheDocument();
    },
  );

  it("タグは渡されたログ自身のものだけが表示される(兄弟ログのタグは混入しない)", () => {
    const practice = makePractice({ practice_logs: PARITY_FIXTURE_LOGS });
    renderWithIntl(
      <PracticeCard practice={practice} log={PARITY_FIXTURE_LOGS[1]!} onClick={vi.fn()} />,
    );

    expect(screen.getByText("タグB")).toBeInTheDocument();
    expect(screen.queryByText("タグA")).not.toBeInTheDocument();
  });

  it("ヘッダー(日付・タイトル・場所)は practice 由来なので、どのログのカードにも表示される", () => {
    const practice = makePractice({ title: "IM練習", place: "市民プール", practice_logs: PARITY_FIXTURE_LOGS });

    const { unmount } = renderWithIntl(
      <PracticeCard practice={practice} log={PARITY_FIXTURE_LOGS[0]!} onClick={vi.fn()} />,
    );
    expect(screen.getByText("IM練習")).toBeInTheDocument();
    expect(screen.getByText("市民プール")).toBeInTheDocument();
    unmount();

    renderWithIntl(<PracticeCard practice={practice} log={PARITY_FIXTURE_LOGS[1]!} onClick={vi.fn()} />);
    expect(screen.getByText("IM練習")).toBeInTheDocument();
    expect(screen.getByText("市民プール")).toBeInTheDocument();
  });

  it("log=null(ログ未登録の練習)の場合、2行目は表示されずクラッシュしない", () => {
    const practice = makePractice({ practice_logs: [] });
    expect(() =>
      renderWithIntl(<PracticeCard practice={practice} log={null} onClick={vi.fn()} />),
    ).not.toThrow();
    expect(screen.queryByText(/自由形/)).not.toBeInTheDocument();
    // ヘッダー(場所)は残るので、練習が一覧から消えることはない
    expect(screen.getByText("市民プール")).toBeInTheDocument();
  });

  it("distance/rep_count/set_count が0のログでもクラッシュせず、距離表記だけが省略される", () => {
    const log = makeLog({ id: "log-zero", distance: 0, rep_count: 4, set_count: 1, circle: null, style: "Fr" });
    expect(() =>
      renderWithIntl(<PracticeCard practice={makePractice()} log={log} onClick={vi.fn()} />),
    ).not.toThrow();
    expect(screen.queryByText(/× 4本/)).not.toBeInTheDocument();
    expect(screen.getByText(/自由形/)).toBeInTheDocument();
  });

  it("カードクリックで onClick に practice(練習オブジェクト。ログではない)が渡される", () => {
    const onClick = vi.fn();
    const practice = makePractice({ id: "practice-xyz" });
    renderWithIntl(
      <PracticeCard practice={practice} log={practice.practice_logs[0]!} onClick={onClick} />,
    );

    screen.getByRole("button", { name: /^練習詳細を表示\(/ }).click();

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ id: "practice-xyz" }));
  });

  it("キーボード操作(Enter)でも onClick が発火する(a11y要件)", () => {
    const onClick = vi.fn();
    const practice = makePractice();
    renderWithIntl(
      <PracticeCard practice={practice} log={practice.practice_logs[0]!} onClick={onClick} />,
    );

    const card = screen.getByRole("button", { name: /^練習詳細を表示\(/ });
    card.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("practice.date が不正な文字列でもクラッシュせず、日付欄が「-」表示になる", () => {
    const practice = makePractice({ date: "invalid-date-string" });
    expect(() =>
      renderWithIntl(
        <PracticeCard practice={practice} log={practice.practice_logs[0]!} onClick={vi.fn()} />,
      ),
    ).not.toThrow();
    const card = screen.getByRole("button", { name: /^練習詳細を表示\(/ });
    expect(card.textContent).toContain("-");
  });
});
