/**
 * DayDetailModal.scope.test.tsx
 *
 * Sprint Contract (DayDetailModal のドメインスコープ分離) 検証観点:
 *
 *   [V-19] scope 未指定 (デフォルト "day") は全種別混在を描画する (ダッシュボード回帰)
 *   [V-20] scope="practice" は練習系のみ描画し、大会系は描画しない (練習履歴タブ用)
 *   [V-21] scope="competition" は大会系のみ描画し、練習系は描画しない (大会記録履歴タブ用)
 *   [V-22] scope="day" かつエントリーが 0 件のとき、空状態チューザー
 *          (「大会記録を追加」「練習記録を追加」の2ボタン) が描画される
 *   [V-23] scope="practice" でエントリーが 0 件のとき、空状態チューザーは描画されない
 *   [V-24] scope="competition" でエントリーが 0 件のとき、空状態チューザーは描画されない
 *   [V-25] scope="day" かつエントリーが 1 件以上のとき、下部の「記録を追加」セクション
 *          (ショートボタン: 「大会記録」「練習記録」) が描画される
 *   [V-26] scope="practice"/"competition" はエントリーが 1 件以上でも
 *          下部の「記録を追加」セクションを描画しない
 *
 * Reviewer Critical 修正 (scoped モードの白紙パネル) 再検証観点 (追加):
 *   [V-29] scope="practice"/"competition" で isLoading=true のとき、ローディング表示
 *          (common.loading の文言) が出て、チューザー/空メッセージは出ない
 *   [V-30] scope="practice"/"competition" で isError=true のとき、エラー表示
 *          (common.error の文言 + 再試行ボタン) が出て、onRetry 押下で onRetry が呼ばれる
 *   [V-31] scope="practice"/"competition" で scopedEntries=0 件かつ
 *          isLoading/isError でないとき、空メッセージ (entryEmptyText) が出て
 *          チューザーは出ない (白紙パネルではなくメッセージが表示される)
 *   [V-32] scope="day" は isLoading/isError を明示的に false にしても
 *          従来のチューザー挙動が変わらない (回帰)
 *   [V-33] isLoading が isError より優先される (両方 true のときローディング表示が出る)
 *
 * 対象実装: apps/mobile/components/calendar/DayDetailModal/DayDetailModal.tsx
 *
 * テスト方針:
 *   MemoizedPracticeLogDetail/RecordDetail/EntryDetail は本テストの関心事 (どの scope で
 *   どの type が描画されるか) と無関係な詳細を大量に持つため、テスト容易性のため
 *   `@/components/calendar/DayDetailModal/components` を軽量スタブに vi.mock する
 *   (既存の StandaloneRecordDetailModal.test.tsx と同一パターン)。
 *   i18n は vitest.setup.ts のグローバルモックにより実際の ja.json (shared/messages/ja.json)
 *   の文言がそのまま解決されるため、期待文言はハードコードではなく Contract 上の実文言。
 *
 * トートロジー防止メモ:
 *   期待値 (scope 別にどの type / どの UI セクションが表示されるか) は Sprint Contract の仕様
 *   (練習履歴タブ=練習系のみ・チューザー/追加セクション非表示、大会記録履歴タブ=大会系のみ・
 *   同様に非表示、ダッシュボード=全件+チューザー/追加セクションあり) から導出したものであり、
 *   DayDetailModal.tsx の diff (scope==="day" 分岐の書き方) を読んでコピーしたものではない。
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CalendarItem } from "@apps/shared/types/ui";
import { DayDetailModal } from "../DayDetailModal";

vi.mock("@/components/calendar/DayDetailModal/components", () => ({
  MemoizedPracticeLogDetail: (props: { item: CalendarItem }) => (
    <div data-testid={`other-item-${props.item.type}-${props.item.id}`}>
      {props.item.type}:{props.item.id}
    </div>
  ),
  RecordDetail: (props: { competitionId: string }) => (
    <div data-testid={`record-detail-${props.competitionId}`}>record-detail</div>
  ),
  EntryDetail: (props: { competitionId: string }) => (
    <div data-testid={`entry-detail-${props.competitionId}`}>entry-detail</div>
  ),
}));

/** テスト用の最小 CalendarItem を組み立てるヘルパー */
function makeItem(
  type: CalendarItem["type"],
  id: string,
  overrides: Partial<CalendarItem> = {},
): CalendarItem {
  return {
    id,
    type,
    date: "2026-07-15",
    title: `item-${id}`,
    metadata: {},
    ...overrides,
  };
}

/** 全7種別を1件ずつ含む混在エントリー (entry/record は独立した competitionId を持つ) */
function buildAllTypeEntries(): CalendarItem[] {
  return [
    makeItem("practice", "p1"),
    makeItem("team_practice", "tp1"),
    makeItem("practice_log", "pl1"),
    makeItem("competition", "c1"),
    makeItem("team_competition", "tc1"),
    makeItem("entry", "en1", {
      metadata: {
        competition: {
          id: "comp-en1",
          title: "Comp EN1",
          date: "2026-07-15",
          place: null,
          pool_type: 0,
        },
      },
    }),
    makeItem("record", "r1", {
      metadata: {
        competition: {
          id: "comp-r1",
          title: "Comp R1",
          date: "2026-07-15",
          place: null,
          pool_type: 0,
        },
      },
    }),
  ];
}

const NOOP_DATE = new Date("2026-07-15T00:00:00Z");

describe("DayDetailModal — scope による表示種別の絞り込み", () => {
  it("[V-19] scope 未指定 (デフォルト) は全7種別すべてを描画する", () => {
    render(
      <DayDetailModal
        visible={true}
        date={NOOP_DATE}
        entries={buildAllTypeEntries()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("other-item-practice-p1")).toBeDefined();
    expect(screen.getByTestId("other-item-team_practice-tp1")).toBeDefined();
    expect(screen.getByTestId("other-item-practice_log-pl1")).toBeDefined();
    expect(screen.getByTestId("other-item-competition-c1")).toBeDefined();
    expect(screen.getByTestId("other-item-team_competition-tc1")).toBeDefined();
    expect(screen.getByTestId("entry-detail-comp-en1")).toBeDefined();
    expect(screen.getByTestId("record-detail-comp-r1")).toBeDefined();
  });

  it("[V-20] scope=\"practice\" は練習系のみ描画し、大会系は一切描画しない", () => {
    render(
      <DayDetailModal
        visible={true}
        date={NOOP_DATE}
        entries={buildAllTypeEntries()}
        scope="practice"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("other-item-practice-p1")).toBeDefined();
    expect(screen.getByTestId("other-item-team_practice-tp1")).toBeDefined();
    expect(screen.getByTestId("other-item-practice_log-pl1")).toBeDefined();

    expect(screen.queryByTestId("other-item-competition-c1")).toBeNull();
    expect(screen.queryByTestId("other-item-team_competition-tc1")).toBeNull();
    expect(screen.queryByTestId("entry-detail-comp-en1")).toBeNull();
    expect(screen.queryByTestId("record-detail-comp-r1")).toBeNull();
  });

  it("[V-21] scope=\"competition\" は大会系のみ描画し、練習系は一切描画しない", () => {
    render(
      <DayDetailModal
        visible={true}
        date={NOOP_DATE}
        entries={buildAllTypeEntries()}
        scope="competition"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("other-item-competition-c1")).toBeDefined();
    expect(screen.getByTestId("other-item-team_competition-tc1")).toBeDefined();
    expect(screen.getByTestId("entry-detail-comp-en1")).toBeDefined();
    expect(screen.getByTestId("record-detail-comp-r1")).toBeDefined();

    expect(screen.queryByTestId("other-item-practice-p1")).toBeNull();
    expect(screen.queryByTestId("other-item-team_practice-tp1")).toBeNull();
    expect(screen.queryByTestId("other-item-practice_log-pl1")).toBeNull();
  });
});

describe("DayDetailModal — 空状態チューザーの scope 別出し分け", () => {
  it("[V-22] scope=\"day\" でエントリー0件のとき、空状態チューザー(2ボタン)が描画される", () => {
    render(
      <DayDetailModal
        visible={true}
        date={NOOP_DATE}
        entries={[]}
        onAddRecord={vi.fn()}
        onAddPractice={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("大会記録を追加")).toBeDefined();
    expect(screen.getByText("練習記録を追加")).toBeDefined();
  });

  it("[V-23] scope=\"practice\" でエントリー0件のとき、空状態チューザーは描画されない", () => {
    render(
      <DayDetailModal
        visible={true}
        date={NOOP_DATE}
        entries={[makeItem("competition", "c1")]} // フィルタ後は0件になる
        scope="practice"
        onAddRecord={vi.fn()}
        onAddPractice={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByText("大会記録を追加")).toBeNull();
    expect(screen.queryByText("練習記録を追加")).toBeNull();
  });

  it("[V-24] scope=\"competition\" でエントリー0件のとき、空状態チューザーは描画されない", () => {
    render(
      <DayDetailModal
        visible={true}
        date={NOOP_DATE}
        entries={[makeItem("practice", "p1")]} // フィルタ後は0件になる
        scope="competition"
        onAddRecord={vi.fn()}
        onAddPractice={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByText("大会記録を追加")).toBeNull();
    expect(screen.queryByText("練習記録を追加")).toBeNull();
  });
});

describe("DayDetailModal — 下部「記録を追加」セクションの scope 別出し分け", () => {
  it("[V-25] scope=\"day\" でエントリーがあるとき、下部の記録追加セクションが描画される", () => {
    render(
      <DayDetailModal
        visible={true}
        date={NOOP_DATE}
        entries={[makeItem("practice", "p1")]}
        onAddRecord={vi.fn()}
        onAddPractice={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("記録を追加")).toBeDefined();
    expect(screen.getByText("大会記録")).toBeDefined();
    expect(screen.getByText("練習記録")).toBeDefined();
  });

  it("[V-26] scope=\"practice\" はエントリーがあっても下部の記録追加セクションを描画しない", () => {
    render(
      <DayDetailModal
        visible={true}
        date={NOOP_DATE}
        entries={[makeItem("practice", "p1")]}
        scope="practice"
        onAddRecord={vi.fn()}
        onAddPractice={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByText("記録を追加")).toBeNull();
  });

  it("[V-26b] scope=\"competition\" はエントリーがあっても下部の記録追加セクションを描画しない", () => {
    render(
      <DayDetailModal
        visible={true}
        date={NOOP_DATE}
        entries={[makeItem("competition", "c1")]}
        scope="competition"
        onAddRecord={vi.fn()}
        onAddPractice={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByText("記録を追加")).toBeNull();
  });
});

describe("DayDetailModal — scoped モードの loading/error/empty (白紙パネル修正の再検証)", () => {
  it("[V-29] scope=\"practice\" で isLoading=true のとき、ローディング表示が出てチューザー/空メッセージは出ない", () => {
    render(
      <DayDetailModal
        visible={true}
        date={NOOP_DATE}
        entries={[]}
        scope="practice"
        isLoading={true}
        onAddRecord={vi.fn()}
        onAddPractice={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("読み込み中...")).toBeDefined();
    expect(screen.queryByText("大会記録を追加")).toBeNull();
    expect(screen.queryByText("練習記録を追加")).toBeNull();
    expect(screen.queryByText("エントリー情報が見つかりません")).toBeNull();
  });

  it("[V-29b] scope=\"competition\" で isLoading=true のとき、ローディング表示が出てチューザー/空メッセージは出ない", () => {
    render(
      <DayDetailModal
        visible={true}
        date={NOOP_DATE}
        entries={[]}
        scope="competition"
        isLoading={true}
        onAddRecord={vi.fn()}
        onAddPractice={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("読み込み中...")).toBeDefined();
    expect(screen.queryByText("大会記録を追加")).toBeNull();
    expect(screen.queryByText("エントリー情報が見つかりません")).toBeNull();
  });

  it("[V-30] scope=\"practice\" で isError=true のとき、エラー表示が出て再試行で onRetry が呼ばれる", () => {
    const onRetry = vi.fn();
    render(
      <DayDetailModal
        visible={true}
        date={NOOP_DATE}
        entries={[]}
        scope="practice"
        isError={true}
        onRetry={onRetry}
        onAddRecord={vi.fn()}
        onAddPractice={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("エラーが発生しました")).toBeDefined();
    expect(screen.queryByText("大会記録を追加")).toBeNull();

    fireEvent.click(screen.getByText("再試行"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("[V-30b] scope=\"competition\" で isError=true のとき、エラー表示が出て再試行で onRetry が呼ばれる", () => {
    const onRetry = vi.fn();
    render(
      <DayDetailModal
        visible={true}
        date={NOOP_DATE}
        entries={[]}
        scope="competition"
        isError={true}
        onRetry={onRetry}
        onAddRecord={vi.fn()}
        onAddPractice={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("エラーが発生しました")).toBeDefined();

    fireEvent.click(screen.getByText("再試行"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it(
    "[V-31] scope=\"practice\" で scopedEntries=0件かつ loading/error でないとき、" +
      "空メッセージが出てチューザーは出ない (白紙パネルにならない)",
    () => {
      render(
        <DayDetailModal
          visible={true}
          date={NOOP_DATE}
          entries={[makeItem("competition", "c1")]} // フィルタ後は0件
          scope="practice"
          onAddRecord={vi.fn()}
          onAddPractice={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByText("エントリー情報が見つかりません")).toBeDefined();
      expect(screen.queryByText("大会記録を追加")).toBeNull();
      expect(screen.queryByText("練習記録を追加")).toBeNull();
    },
  );

  it(
    "[V-31b] scope=\"competition\" で scopedEntries=0件かつ loading/error でないとき、" +
      "空メッセージが出てチューザーは出ない (白紙パネルにならない)",
    () => {
      render(
        <DayDetailModal
          visible={true}
          date={NOOP_DATE}
          entries={[makeItem("practice", "p1")]} // フィルタ後は0件
          scope="competition"
          onAddRecord={vi.fn()}
          onAddPractice={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByText("エントリー情報が見つかりません")).toBeDefined();
      expect(screen.queryByText("大会記録を追加")).toBeNull();
    },
  );

  it("[V-32] scope=\"day\" は isLoading/isError を明示的に false にしても従来のチューザー挙動が変わらない (回帰)", () => {
    render(
      <DayDetailModal
        visible={true}
        date={NOOP_DATE}
        entries={[]}
        isLoading={false}
        isError={false}
        onAddRecord={vi.fn()}
        onAddPractice={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("大会記録を追加")).toBeDefined();
    expect(screen.getByText("練習記録を追加")).toBeDefined();
    expect(screen.queryByText("エントリー情報が見つかりません")).toBeNull();
  });

  it("[V-33] isLoading と isError が両方 true のとき、ローディング表示が優先される", () => {
    render(
      <DayDetailModal
        visible={true}
        date={NOOP_DATE}
        entries={[]}
        scope="practice"
        isLoading={true}
        isError={true}
        onRetry={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("読み込み中...")).toBeDefined();
    expect(screen.queryByText("エラーが発生しました")).toBeNull();
  });
});
