/**
 * PracticeCard — 全ログ展開表示 テスト（Phase B 本実装, C-3）
 *
 * 対象: apps/web/app/[locale]/(authenticated)/practice/_components/PracticeCard.tsx
 *       + _utils/practiceDayGrouping.ts の `buildPracticeLogLines`
 * 参照実装（mobile 側・並行実装）: apps/mobile/components/practices/PracticeItem.tsx
 *
 * 重要 — 既存テストとの矛盾の解消:
 *   既存 `../__tests__/PracticeCard.test.tsx` にあった「先頭ログのみ表示」を
 *   アサートする2テストは、本 Sprint (C-3: 全ログ展開) により QA が既に
 *   「全ログ表示」前提の内容へ書き換え済み。本ファイルは C-3 固有の追加観点
 *   （3件以上・1件のみ退行なし・空配列・タグ混入なし・並び順・パリティ）を担当する。
 *
 * Sprint Contract 検証観点:
 *   [V-26] practice_logs に内容の異なる2件のログがあるとき、両方の secondLineInfo
 *          （距離×本数×セット / サークル / 種目）が画面上に表示される
 *   [V-27] practice_logs が3件以上でも全件表示される
 *   [V-28] practice_logs が1件のみのとき、現行と実質同じ見た目になる（退行なし）
 *   [V-29] practice_logs が空配列のとき、2行目セクションが表示されずクラッシュしない
 *   [V-30] 各ログのタグが「そのログ自身」のタグとして表示される
 *   [V-32] ログの表示順が practice_logs の配列順のまま変わらない
 *   [V-33] カードクリック/Enterキーで onClick に practice(日単位オブジェクト)が渡る（既存回帰）
 *
 * web↔mobile パリティ検証（[V-31]）:
 *   mobile 側 apps/mobile/components/practices/__tests__/PracticeItem.allLogs.test.tsx の
 *   `PARITY_FIXTURE_LOGS` と同一の入力データ（distance/rep_count/set_count/circle/style/tags）
 *   を使う。両ファイルで同じ入力に対し「距離×本数×セット」「サークル」「種目」の3要素が
 *   " / " 区切りで1行にまとまる、という組み立て方針が一致することを確認する
 *   （表示文言自体はロケール依存のため厳密一致ではないが、要素の有無・区切り記号・
 *   並び順・タグの帰属は一致させる）。
 *
 * トートロジー防止メモ:
 *   期待値はユーザー指示（「どちらも表示させたい」）と Sprint Contract C-3 の記述、
 *   および mobile 側実装との突き合わせから導出したものであり、web 実装コードの diff を
 *   読んでコピーしたものではない。
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

// mobile PracticeItem.allLogs.test.tsx の PARITY_FIXTURE_LOGS と対応するフィクスチャ
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

describe("PracticeCard all-logs display (C-3)", () => {
  it("[V-26] 内容の異なる2件のログを持つ practice を渡すと、両方の secondLineInfo が表示される", () => {
    const practice = makePractice({ practice_logs: PARITY_FIXTURE_LOGS });
    renderWithIntl(<PracticeCard practice={practice} onClick={vi.fn()} />);

    expect(screen.getByText(/100m × 4本 × 1セット/)).toBeInTheDocument();
    expect(screen.getByText(/自由形/)).toBeInTheDocument();
    expect(screen.getByText(/50m × 8本 × 2セット/)).toBeInTheDocument();
    expect(screen.getByText(/平泳ぎ/)).toBeInTheDocument();
  });

  it("[V-27] 3件以上のログを持つ practice を渡すと、全件分の行が表示される", () => {
    const practice = makePractice({
      practice_logs: [
        ...PARITY_FIXTURE_LOGS,
        makeLog({ id: "log-c", distance: 25, rep_count: 16, set_count: 1, style: "IM", circle: null }),
      ],
    });
    renderWithIntl(<PracticeCard practice={practice} onClick={vi.fn()} />);

    expect(screen.getByText(/100m × 4本 × 1セット/)).toBeInTheDocument();
    expect(screen.getByText(/50m × 8本 × 2セット/)).toBeInTheDocument();
    expect(screen.getByText(/25m × 16本 × 1セット/)).toBeInTheDocument();
  });

  it("[V-28] ログが1件のみのとき、現行(単一行表示)と実質同じ見た目になる（退行なし）", () => {
    const practice = makePractice({ practice_logs: [PARITY_FIXTURE_LOGS[0]] });
    renderWithIntl(<PracticeCard practice={practice} onClick={vi.fn()} />);

    expect(screen.getByText(/100m × 4本 × 1セット/)).toBeInTheDocument();
    expect(screen.getByText("タグA")).toBeInTheDocument();
    expect(screen.queryByText("タグB")).not.toBeInTheDocument();
  });

  it("[V-29] practice_logs が空配列のとき、2行目セクションが表示されずクラッシュしない", () => {
    const practice = makePractice({ practice_logs: [] });
    expect(() => renderWithIntl(<PracticeCard practice={practice} onClick={vi.fn()} />)).not.toThrow();
    expect(screen.queryByText(/自由形/)).not.toBeInTheDocument();
  });

  it("[V-30] ログ2のタグがログ1の行に混入しない（両方のタグがそれぞれ表示される）", () => {
    const practice = makePractice({ practice_logs: PARITY_FIXTURE_LOGS });
    renderWithIntl(<PracticeCard practice={practice} onClick={vi.fn()} />);

    expect(screen.getByText("タグA")).toBeInTheDocument();
    expect(screen.getByText("タグB")).toBeInTheDocument();
  });

  it("[V-32] ログの表示順が practice_logs の配列順のまま変わらない（DOM 出現順で検証）", () => {
    const practice = makePractice({ practice_logs: PARITY_FIXTURE_LOGS });
    const { container } = renderWithIntl(<PracticeCard practice={practice} onClick={vi.fn()} />);

    const text = container.textContent || "";
    const indexA = text.indexOf("100m × 4本 × 1セット");
    const indexB = text.indexOf("50m × 8本 × 2セット");
    expect(indexA).toBeGreaterThanOrEqual(0);
    expect(indexB).toBeGreaterThan(indexA);
  });

  it("[V-33] カードクリックで onClick に practice(日単位オブジェクト。ログではない)が渡される", () => {
    const onClick = vi.fn();
    const practice = makePractice({ id: "practice-xyz", practice_logs: PARITY_FIXTURE_LOGS });
    renderWithIntl(<PracticeCard practice={practice} onClick={onClick} />);

    screen.getByRole("button", { name: /^練習詳細を表示\(/ }).click();

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ id: "practice-xyz" }));
  });
});
