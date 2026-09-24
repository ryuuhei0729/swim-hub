// =============================================================================
// DayDetailModal.flexibleModalHeight.test.tsx
// [QA Sprint Contract Phase A] 記録モーダルの縦幅をコンテンツ量にフレキシブルに追従させる
// =============================================================================
//
// 【ユーザー報告】
// 「8月29日(土)の記録」モーダルに大会カード1枚だけなのに、モーダルが画面の2/3を占め
// カード下に大量の空白ができる。maxHeight だけ指定し、そこに達するまでは中身に応じて
// フレキシブルに大きさを調整してほしい。
//
// 【PM 設計判断 (契約)】
//   1. styles.body を flex:1 → { flexGrow: 0, flexShrink: 1 } に変更する。
//      flexGrow:0 だけにしてはならない。RN の flexShrink 既定値は 0 なので、
//      flexGrow だけ落とすと maxHeight:90% を超えたコンテンツがスクロールできず溢れる。
//   2. styles.bodyContent から flexGrow:1 を削除する。
//   3. minHeight.ts (エントリー件数などから動的に px を計算していた実装) と
//      __tests__/minHeight.test.ts は削除する。
//   4. 空状態の2択チューザー (「大会記録を追加」「練習記録を追加」) は、外側の
//      modalContent の高さ (旧 minHeight:300) に依存して flex:1 の連鎖で育っていた。
//      minHeight 撤去でこの連鎖が消えるため、チューザー自身が明示的な垂直サイズ
//      (paddingVertical か minHeight) を持ち、タップ領域を自前で確保しなければならない。
//   5. [PM 裁定・Deliverable] computeDayDetailMinHeight の専用配線
//      (practiceLogsWithTimes/entriesWithMedia state、onPracticeTimeLoaded/onMediaLoaded
//      プロップ。DayDetailModal.tsx/types.ts/components/PracticeLogDetail.tsx/
//      components/RecordDetail.tsx の4ファイル跨り) は削除必須。理由: 唯一の消費者だった
//      computeDayDetailMinHeight が消えるため完全な dead code になり、「メディア読込結果を
//      高さに反映する」という既に嘘になった意図がコードに残ってしまう。
//      【重要】削除するのは「取得結果を親へ bubble する経路」だけであり、画像/動画の
//      取得ロジック自体 (PracticeLogDetail/RecordDetail 内の非同期フェッチ) は不変。
//      Developer がここを踏み外して取得処理まで壊さないよう、Phase B で
//      PracticeLogDetail.share.test.tsx / RecordDetail.share.test.tsx 等の
//      メディア表示系テストが回帰なく green のままであることも合わせて確認すること。
//
// 【jsdom の限界 (誤魔化さず明記する)】
// この不具合は純粋な RN flexbox のレイアウト崩れであり、jsdom にはレイアウトエンジンが
// 無い (実際の折り返し・実測ピクセル高さ・「下に空白ができるかどうか」は計算されない)。
// 「余白が消えたこと」自体はこの自動テストでは絶対に検証できない。
// 本テストで担保できるのは以下の2種類のみ:
//   (a) styles.ts の構造的性質 (body.flexGrow/flexShrink, bodyContent の
//       flexGrow プロパティの有無) — スタイルオブジェクトを直接 import して検証。
//   (b) 描画された DOM ノードの inline style 値 (React が el.style[key]=value を
//       素通しで設定するため、jsdom の CSSStyleDeclaration からも読める。
//       ただし ScrollView モック (__mocks__/react-native.ts) は style プロパティを
//       完全に無視し overflow:auto で上書きするため、body/bodyContent の実際の
//       適用結果を ScrollView の DOM から検証することはできない。
//       そのため body/bodyContent は (a) の styles.ts 直接検証のみで担保する)。
// 実機/シミュレータでの「カード下の空白が消えたか」の最終確認は、このテストの
// 対象外であり、人間 (または実機を持つ QA セッション) による目視確認が別途必要。
//
// 【トートロジー防止メモ】
// 期待値は PM 設計判断 (Sprint Contract) から導出したものであり、DayDetailModal.tsx /
// styles.ts の diff を読んでコピーしたものではない (Phase A 時点で Developer は未着手)。
// 具体的な paddingVertical / minHeight の px 値は Developer 裁量とし、本テストは
// 「明示的な垂直サイズが指定されているかどうか」の有無のみを問う (値そのものを
// styles.ts から import して突き合わせるようなことはしない)。
// =============================================================================

import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CalendarItem } from "@apps/shared/types/ui";
import { DayDetailModal } from "../DayDetailModal";
import { styles } from "../styles";

vi.mock("@/components/calendar/DayDetailModal/components", () => ({
  MemoizedPracticeLogDetail: (props: { item: CalendarItem }) => (
    <div data-testid={`other-item-${props.item.id}`} />
  ),
  RecordDetail: (props: { competitionId: string }) => (
    <div data-testid={`record-detail-${props.competitionId}`} />
  ),
  EntryDetail: (props: { competitionId: string }) => (
    <div data-testid={`entry-detail-${props.competitionId}`} />
  ),
}));

function makeItem(
  type: CalendarItem["type"],
  id: string,
  overrides: Partial<CalendarItem> = {},
): CalendarItem {
  return {
    id,
    type,
    date: "2026-08-29",
    title: `item-${id}`,
    metadata: {
      competition: {
        id: `comp-${id}`,
        title: `Comp ${id}`,
        date: "2026-08-29",
        place: null,
        pool_type: 0,
      },
    },
    ...overrides,
  };
}

const SAT_AUG_29 = new Date("2026-08-29T00:00:00Z");

/**
 * inline style の値が「明示的な正のサイズ指定」であるかを判定する。
 * jsdom の el.style.<未設定プロパティ> は "" ではなく undefined を返すことがあり
 * (`undefined !== ""` は true になる) 単純な空文字比較だけだと false positive になる。
 */
function hasPositiveSizing(value: string | undefined): boolean {
  return typeof value === "string" && value !== "" && value !== "0px";
}

/**
 * paddingVertical/paddingHorizontal のような RN 専用プロパティ名は CSSStyleDeclaration の
 * 型定義に存在しないが、jsdom はこれを実際の inline style として保持しブラケットアクセスで
 * 読み出せる (probe で確認済み)。型チェックを通すためのブラケットアクセスラッパー。
 */
function getRawStyleValue(el: HTMLElement, prop: string): string | undefined {
  return (el.style as unknown as Record<string, string | undefined>)[prop];
}

/** modalContent (最外周の白いカード View) を、閉じるボタンのアイコンから2階層遡って取得する */
function getModalContentElement(): HTMLElement {
  const closeIcon = screen.getByTestId("icon-x");
  const closeButton = closeIcon.closest("button");
  if (!closeButton) throw new Error("close button not found");
  const header = closeButton.parentElement;
  if (!header) throw new Error("header not found");
  const modalContent = header.parentElement;
  if (!modalContent) throw new Error("modalContent not found");
  return modalContent;
}

describe("[V-FLEX-01/02/03] styles.ts — body/bodyContent のフレックス契約", () => {
  it("[V-FLEX-01] body.flexGrow は 0 である (中身が短くても可視領域いっぱいに伸ばさない)", () => {
    expect(styles.body.flexGrow).toBe(0);
  });

  it(
    "[V-FLEX-02] body.flexShrink は 1 である " +
      "(RN の既定値は0なので明示しないと maxHeight:90% を超えたコンテンツがスクロールできず溢れる)",
    () => {
      expect(styles.body.flexShrink).toBe(1);
    },
  );

  it("[V-FLEX-03] bodyContent は flexGrow プロパティを持たない", () => {
    expect(styles.bodyContent).not.toHaveProperty("flexGrow");
  });
});

describe("[V-FLEX-04] modalContent の高さがエントリー件数に依存した動的 minHeight を注入されない", () => {
  // Reviewer Suggestion 反映: 「1件と3件で同値」だけだと、件数に依存しない新しい固定 minHeight
  // (例:全ケース一律 400px) が再導入された場合に検出できない (どちらも "400px" で一致してしまう)。
  // 「そもそも minHeight が未設定 (空文字) であること」を併せて assert し、固定値の再注入も
  // 検出できるようにする。
  it(
    "エントリー1件のときと3件のときで modalContent の inline minHeight が同じ値になり、" +
      "かつそもそも minHeight が設定されていない (空文字である)",
    () => {
      const oneEntry = [makeItem("record", "r1")];
      const threeEntries = [
        makeItem("record", "r1"),
        makeItem("record", "r2"),
        makeItem("record", "r3"),
      ];

      const { unmount } = render(
        <DayDetailModal visible date={SAT_AUG_29} entries={oneEntry} onClose={vi.fn()} />,
      );
      const minHeightWithOneEntry = getModalContentElement().style.minHeight;
      unmount();

      render(
        <DayDetailModal visible date={SAT_AUG_29} entries={threeEntries} onClose={vi.fn()} />,
      );
      const minHeightWithThreeEntries = getModalContentElement().style.minHeight;

      expect(minHeightWithOneEntry).toBe(minHeightWithThreeEntries);
      expect(minHeightWithOneEntry).toBe("");
      expect(minHeightWithThreeEntries).toBe("");
    },
  );
});

describe(
  "[V-FLEX-05] 空状態2択チューザーは外側の flex 連鎖ではなく自身で垂直サイズを確保する",
  () => {
    it("「大会記録を追加」ボタンは明示的な paddingVertical か minHeight を持つ", () => {
      render(
        <DayDetailModal
          visible
          date={SAT_AUG_29}
          entries={[]}
          onAddRecord={vi.fn()}
          onAddPractice={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      const addRecordButton = screen.getByText("大会記録を追加").closest("button");
      if (!addRecordButton) throw new Error("add record button not found");

      const hasExplicitVerticalSizing =
        hasPositiveSizing(getRawStyleValue(addRecordButton, "paddingVertical")) ||
        hasPositiveSizing(addRecordButton.style.minHeight);

      expect(hasExplicitVerticalSizing).toBe(true);
    });

    it("「練習記録を追加」ボタンも同様に明示的な paddingVertical か minHeight を持つ", () => {
      render(
        <DayDetailModal
          visible
          date={SAT_AUG_29}
          entries={[]}
          onAddRecord={vi.fn()}
          onAddPractice={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      const addPracticeButton = screen.getByText("練習記録を追加").closest("button");
      if (!addPracticeButton) throw new Error("add practice button not found");

      const hasExplicitVerticalSizing =
        hasPositiveSizing(getRawStyleValue(addPracticeButton, "paddingVertical")) ||
        hasPositiveSizing(addPracticeButton.style.minHeight);

      expect(hasExplicitVerticalSizing).toBe(true);
    });
  },
);

describe(
  "[V-FLEX-09] computeDayDetailMinHeight 専用配線の完全削除 (PM裁定 — dead code の完全撤去)",
  () => {
    // ソースをテキストとして読み、対象識別子が一切残っていないことを確認する
    // (プロダクションのロジックを再実装するのではなく、「消えているか」の有無だけを問う
    // メタテスト。読み込みは describe 本体で行い、各 it は読み込み済み文字列を検証するだけ)
    const DAY_DETAIL_MODAL_SRC = readFileSync(
      path.join(__dirname, "..", "DayDetailModal.tsx"),
      "utf-8",
    );
    const TYPES_SRC = readFileSync(path.join(__dirname, "..", "types.ts"), "utf-8");
    const PRACTICE_LOG_DETAIL_SRC = readFileSync(
      path.join(__dirname, "..", "components", "PracticeLogDetail.tsx"),
      "utf-8",
    );
    const RECORD_DETAIL_SRC = readFileSync(
      path.join(__dirname, "..", "components", "RecordDetail.tsx"),
      "utf-8",
    );

    it("[V-FLEX-09a] DayDetailModal.tsx が computeDayDetailMinHeight / ./minHeight を参照しない", () => {
      expect(DAY_DETAIL_MODAL_SRC).not.toMatch(/computeDayDetailMinHeight/);
      expect(DAY_DETAIL_MODAL_SRC).not.toMatch(/from ["']\.\/minHeight["']/);
    });

    it("[V-FLEX-09b] DayDetailModal.tsx に practiceLogsWithTimes / entriesWithMedia state が残っていない", () => {
      expect(DAY_DETAIL_MODAL_SRC).not.toMatch(/practiceLogsWithTimes/);
      expect(DAY_DETAIL_MODAL_SRC).not.toMatch(/entriesWithMedia/);
    });

    it(
      "[V-FLEX-09c] DayDetailModal.tsx / types.ts / PracticeLogDetail.tsx / RecordDetail.tsx が " +
        "onPracticeTimeLoaded / onMediaLoaded を一切参照しない",
      () => {
        for (const src of [
          DAY_DETAIL_MODAL_SRC,
          TYPES_SRC,
          PRACTICE_LOG_DETAIL_SRC,
          RECORD_DETAIL_SRC,
        ]) {
          expect(src).not.toMatch(/onPracticeTimeLoaded/);
          expect(src).not.toMatch(/onMediaLoaded/);
        }
      },
    );
  },
);
