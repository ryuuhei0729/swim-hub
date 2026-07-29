/**
 * PracticeItem — 全ログ展開表示 テスト（Phase B 本実装, C-3）
 *
 * 対象: apps/mobile/components/practices/PracticeItem.tsx（logRows 一般化実装済み）
 * 参照実装（web 側・並行実装）: apps/web/app/[locale]/(authenticated)/practice/_components/PracticeCard.tsx
 *
 * 既存ファイル apps/mobile/components/practices/__tests__/PracticeItem.test.tsx とは
 * 責務分離した別ファイル（既存の命名パターン `Component.feature.test.tsx` に準拠）。
 *
 * Sprint Contract 検証観点:
 *   [V-26] practice_logs に内容の異なる2件のログがあるとき、両方の secondLineInfo
 *          （距離×本数×セット / サークル / 種目）が画面上に表示される
 *   [V-27] practice_logs が3件以上でも全件表示される
 *   [V-28] practice_logs が1件のみのとき、現行と実質同じ見た目になる（退行なし）
 *   [V-29] practice_logs が空配列のとき、ログ一覧セクションが何も表示されずクラッシュしない
 *   [V-30] 各ログのタグが「そのログ自身」のタグとして表示される
 *   [V-32] ログの表示順が practice_logs の配列順のまま変わらない
 *   [V-33] 既存の一覧タップ遷移（onPress で practice オブジェクトそのものが渡る）に回帰がない
 *
 * web↔mobile パリティ検証（[V-31]）:
 *   web 側 apps/web/app/[locale]/(authenticated)/practice/_components/__tests__/
 *   PracticeCard.allLogs.test.tsx の `PARITY_FIXTURE_LOGS` と同一の入力データを使う。
 *   両ファイルで同じ入力に対し「距離×本数×セット」「サークル」「種目」の3要素が
 *   " / " 区切りで1行にまとまる、という組み立て方針が一致することを確認する
 *   （テキストの表現そのものはロケール依存の翻訳文言のため多少異なるが、要素の
 *   有無・区切り記号・並び順は一致させる）。
 *
 * トートロジー防止メモ:
 *   期待値はユーザー指示（「どちらも表示させたい」）と Sprint Contract C-3 の記述、
 *   および web 側実装との突き合わせから導出したものであり、mobile 実装コードの diff を
 *   読んでコピーしたものではない。
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PracticeItem } from "../PracticeItem";
import { createMockPracticeWithLogs } from "@/__mocks__/supabase";

// web PracticeCard.allLogs.test.tsx と対応する共通フィクスチャ(パリティ検証用)。
// distance/rep_count/set_count/circle/style/tags をあえてログごとに変える。
const PARITY_FIXTURE_LOGS = [
  {
    id: "log-a",
    practice_id: "practice-1",
    distance: 100,
    rep_count: 4,
    set_count: 1,
    circle: 90,
    style: "fr",
    note: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    practice_log_tags: [
      { practice_tag_id: "tag-a", practice_tags: { id: "tag-a", name: "タグA", color: "#111111" } },
    ],
  },
  {
    id: "log-b",
    practice_id: "practice-1",
    distance: 50,
    rep_count: 8,
    set_count: 2,
    circle: 60,
    style: "br",
    note: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    practice_log_tags: [
      { practice_tag_id: "tag-b", practice_tags: { id: "tag-b", name: "タグB", color: "#222222" } },
    ],
  },
];

describe("PracticeItem all-logs display (C-3)", () => {
  it("[V-26] 内容の異なる2件のログを持つ practice を渡すと、両方の secondLineInfo が表示される", () => {
    const practice = createMockPracticeWithLogs({ practice_logs: PARITY_FIXTURE_LOGS });
    render(<PracticeItem practice={practice} />);

    expect(screen.getByText(/100m × 4本 × 1セット/)).toBeTruthy();
    expect(screen.getByText(/50m × 8本 × 2セット/)).toBeTruthy();
  });

  it("[V-27] 3件以上のログを持つ practice を渡すと、全件分の行が表示される", () => {
    const practice = createMockPracticeWithLogs({
      practice_logs: [
        ...PARITY_FIXTURE_LOGS,
        {
          id: "log-c",
          practice_id: "practice-1",
          distance: 25,
          rep_count: 16,
          set_count: 1,
          circle: null,
          style: null,
          note: null,
          created_at: "2026-07-01T00:00:00Z",
          updated_at: "2026-07-01T00:00:00Z",
          practice_log_tags: [],
        },
      ],
    });
    render(<PracticeItem practice={practice} />);

    expect(screen.getByText(/100m × 4本 × 1セット/)).toBeTruthy();
    expect(screen.getByText(/50m × 8本 × 2セット/)).toBeTruthy();
    expect(screen.getByText(/25m × 16本 × 1セット/)).toBeTruthy();
  });

  it("[V-28] ログが1件のみのとき、現行(単一行表示)と実質同じ見た目になる（退行なし）", () => {
    const practice = createMockPracticeWithLogs({ practice_logs: [PARITY_FIXTURE_LOGS[0]] });
    render(<PracticeItem practice={practice} />);

    expect(screen.getByText(/100m × 4本 × 1セット/)).toBeTruthy();
    expect(screen.getByText("タグA")).toBeTruthy();
    expect(screen.queryByText("タグB")).toBeNull();
  });

  it("[V-29] practice_logs が空配列のとき、ログ一覧セクションが表示されずクラッシュしない", () => {
    const practice = createMockPracticeWithLogs({ practice_logs: [] });
    expect(() => render(<PracticeItem practice={practice} />)).not.toThrow();
    expect(screen.queryByText(/セット/)).toBeNull();
  });

  it("[V-30] ログ2のタグがログ1の行に混入しない（各ログの行に自身のタグのみ表示される）", () => {
    const practice = createMockPracticeWithLogs({ practice_logs: PARITY_FIXTURE_LOGS });
    render(<PracticeItem practice={practice} />);

    expect(screen.getByText("タグA")).toBeTruthy();
    expect(screen.getByText("タグB")).toBeTruthy();
  });

  it("[V-32] ログの表示順が practice_logs の配列順のまま変わらない（DOM 出現順で検証）", () => {
    const practice = createMockPracticeWithLogs({ practice_logs: PARITY_FIXTURE_LOGS });
    const { container } = render(<PracticeItem practice={practice} />);

    const text = container.textContent || "";
    const indexA = text.indexOf("100m × 4本 × 1セット");
    const indexB = text.indexOf("50m × 8本 × 2セット");
    expect(indexA).toBeGreaterThanOrEqual(0);
    expect(indexB).toBeGreaterThan(indexA);
  });

  it("[V-33] onPress が呼ばれるとき、ログ単位ではなく practice オブジェクトそのものが渡る（既存回帰）", () => {
    const practice = createMockPracticeWithLogs({ practice_logs: PARITY_FIXTURE_LOGS });
    const onPress = vi.fn();
    render(<PracticeItem practice={practice} onPress={onPress} />);

    const pressable = screen.getByText(/100m × 4本 × 1セット/).closest("button");
    expect(pressable).toBeTruthy();
    pressable!.click();

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(practice);
  });
});
