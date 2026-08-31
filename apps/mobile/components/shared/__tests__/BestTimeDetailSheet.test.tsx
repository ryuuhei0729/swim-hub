// =============================================================================
// BestTimeDetailSheet.test.tsx
// =============================================================================
// mobile UI フィードバック #1: ベストタイム詳細を「ボトムシート→中央ポップアップ」に
// 変更 (`BestTimeDetailSheet` が `CenterModal` を使うようになった)。
// `CenterModal` 自身の構造的性質は `components/ui/__tests__/CenterModal.test.tsx` で
// 検証済みのため、ここでは BestTimeDetailSheet 固有の配線 (detail の3分岐・
// props が変わっていないこと) を検証する。
//
// Sprint Contract 検証観点:
//   [V-DETAIL-01] detail!==null のとき中央ポップアップとして開き、内容が表示される
//   [V-DETAIL-02] detail===null のとき何も表示されない
//   [V-DETAIL-03] 閉じるボタン (×) で onClose が呼ばれる
//   [V-DETAIL-04] 背面タップで onClose が呼ばれる
//   [V-DETAIL-05] props (detail/onClose/noteFallbackLabel) は変更前と同一であること
//     (呼び出し元3箇所が無変更で動く前提。tsc がこれを型レベルで保証しているが、
//     実行時にも同じ props で実際にレンダリングできることを確認する)
//   [V-DETAIL-06] 象限C (competitionTitle なし・note あり): note が表示される
//
// バグ修正: 「大会名あり・備考あり」のとき備考が排他的に捨てられていた (`competitionTitle
// ? <Text>{title}</Text> : <Text>{note || fallback}</Text>` の三項排他分岐)。
// competitionTitle と note は独立に判定する4象限として以下を追加で検証する:
//   [V-DETAIL-07] 象限A (title あり・note あり): 両方が表示される (今回直る象限)
//   [V-DETAIL-08] 象限B (title あり・note なし=null): title のみ。fallback は出ない
//   [V-DETAIL-09] 境界 (title あり・note=""): 空文字は「無し」扱いで象限Bと同じ表示になる
//   [V-DETAIL-10] 境界 (title=""・note あり): 空文字は「無し」扱いで象限Cと同じくnoteが表示される
//   [V-DETAIL-11] 境界 (title=""・note=""): 象限Dと同じくfallbackが表示される
//
// トートロジー防止メモ: 大会名 "第10回記録会" / 備考 "追い風参考" / フォールバック
// "一括登録" は互いの部分文字列にならない独立した文字列であり、意図的に選定している。
//
// PM裁定 (mutation review): [V-DETAIL-09]/[V-DETAIL-10] のテキストベースの assert だけでは、
// `hasNote`/`hasCompetitionTitle` の falsy 判定を `Boolean(x)` から `x != null` (nullのみ除外し
// ""を残す) に壊す変異を検出できない穴があった (""は空文字のTextノードを追加で描画するが、
// 空文字は可視テキストを持たないため getByText/queryByText では区別できない)。
// 実測: この変異を当てても [V-DETAIL-09]/[V-DETAIL-10] は green のままだった一方、
// [V-DETAIL-11] は (fallback文言自体が消えるため) 副次的に red になった。
// これを塞ぐため、[V-DETAIL-09]/[V-DETAIL-10] に「""と既知良のnullが同一DOM構造になる」
// という構造的な等価性 assert を追加する (可視テキストではなくDOM構造で「無し」扱いを保証する)。
// =============================================================================

import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { BestTimeDetailSheet, type BestTimeDetail } from "../BestTimeDetailSheet";

const detail: BestTimeDetail = {
  date: "2024-05-05",
  competitionTitle: "第10回記録会",
  note: null,
};

describe("BestTimeDetailSheet", () => {
  it("[V-DETAIL-01] detail が渡されると中央ポップアップとして開き、大会名が表示される", () => {
    render(
      <BestTimeDetailSheet detail={detail} onClose={vi.fn()} noteFallbackLabel="一括登録" />,
    );

    expect(screen.getByText("第10回記録会")).toBeTruthy();
  });

  it("[V-DETAIL-02] detail が null のとき何も表示されない", () => {
    const { container } = render(
      <BestTimeDetailSheet detail={null} onClose={vi.fn()} noteFallbackLabel="一括登録" />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("[V-DETAIL-03] 閉じるボタン (×) で onClose が呼ばれる", () => {
    const onClose = vi.fn();
    render(
      <BestTimeDetailSheet detail={detail} onClose={onClose} noteFallbackLabel="一括登録" />,
    );

    fireEvent.click(screen.getByTestId("icon-x").closest("button")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("[V-DETAIL-04] 背面タップで onClose が呼ばれる", () => {
    const onClose = vi.fn();
    render(
      <BestTimeDetailSheet detail={detail} onClose={onClose} noteFallbackLabel="一括登録" />,
    );

    // 背面タップ用 Pressable は最初の button (CenterModal の構造上、閉じるボタンより先に描画される)
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("[V-DETAIL-05] note フォールバック分岐: competition/note 無しのとき noteFallbackLabel が表示される", () => {
    render(
      <BestTimeDetailSheet
        detail={{ date: "2024-01-01", competitionTitle: null, note: null }}
        onClose={vi.fn()}
        noteFallbackLabel="一括登録"
      />,
    );
    expect(screen.getByText("一括登録")).toBeTruthy();
  });

  it("[V-DETAIL-06] note フォールバック分岐: competition 無し + note ありのとき note が表示される (フォールバックより優先)", () => {
    render(
      <BestTimeDetailSheet
        detail={{ date: "2024-01-01", competitionTitle: null, note: "自主練での計測" }}
        onClose={vi.fn()}
        noteFallbackLabel="一括登録"
      />,
    );
    expect(screen.getByText("自主練での計測")).toBeTruthy();
    expect(screen.queryByText("一括登録")).toBeNull();
  });

  it("[V-DETAIL-07] 象限A: competitionTitle と note が両方あるとき、大会名と備考の両方が表示される (今回直る象限)", () => {
    render(
      <BestTimeDetailSheet
        detail={{ date: "2024-03-03", competitionTitle: "第10回記録会", note: "追い風参考" }}
        onClose={vi.fn()}
        noteFallbackLabel="一括登録"
      />,
    );
    expect(screen.getByText("第10回記録会")).toBeTruthy();
    expect(screen.getByText("追い風参考")).toBeTruthy();
    expect(screen.queryByText("一括登録")).toBeNull();
  });

  it("[V-DETAIL-08] 象限B: competitionTitle あり + note なし(null) のとき、大会名のみ表示され「一括登録」は出ない", () => {
    render(
      <BestTimeDetailSheet
        detail={{ date: "2024-03-03", competitionTitle: "第10回記録会", note: null }}
        onClose={vi.fn()}
        noteFallbackLabel="一括登録"
      />,
    );
    expect(screen.getByText("第10回記録会")).toBeTruthy();
    expect(screen.queryByText("追い風参考")).toBeNull();
    expect(screen.queryByText("一括登録")).toBeNull();
  });

  it('[V-DETAIL-09] 境界: note が空文字("")のとき「無し」扱いになり、象限Bと同じ表示になる(フォールバックも出ない)', () => {
    render(
      <BestTimeDetailSheet
        detail={{ date: "2024-03-03", competitionTitle: "第10回記録会", note: "" }}
        onClose={vi.fn()}
        noteFallbackLabel="一括登録"
      />,
    );
    expect(screen.getByText("第10回記録会")).toBeTruthy();
    expect(screen.queryByText("一括登録")).toBeNull();
  });

  it('[V-DETAIL-09b] 境界(構造検証): note="" は note=null と完全に同一のDOM構造になる (可視テキストが無い分岐の取り違えをDOM構造で検出する)', () => {
    const { container: emptyStringContainer } = render(
      <BestTimeDetailSheet
        detail={{ date: "2024-03-03", competitionTitle: "第10回記録会", note: "" }}
        onClose={vi.fn()}
        noteFallbackLabel="一括登録"
      />,
    );
    const emptyStringHtml = emptyStringContainer.innerHTML;
    cleanup();

    const { container: nullNoteContainer } = render(
      <BestTimeDetailSheet
        detail={{ date: "2024-03-03", competitionTitle: "第10回記録会", note: null }}
        onClose={vi.fn()}
        noteFallbackLabel="一括登録"
      />,
    );
    expect(emptyStringHtml).toBe(nullNoteContainer.innerHTML);
  });

  it('[V-DETAIL-10] 境界: competitionTitle が空文字("")のとき「無し」扱いになり、象限Cと同じくnoteが表示される', () => {
    render(
      <BestTimeDetailSheet
        detail={{ date: "2024-03-03", competitionTitle: "", note: "追い風参考" }}
        onClose={vi.fn()}
        noteFallbackLabel="一括登録"
      />,
    );
    expect(screen.getByText("追い風参考")).toBeTruthy();
    expect(screen.queryByText("一括登録")).toBeNull();
  });

  it('[V-DETAIL-10b] 境界(構造検証): competitionTitle="" は competitionTitle=null と完全に同一のDOM構造になる (可視テキストが無い分岐の取り違えをDOM構造で検出する)', () => {
    const { container: emptyTitleContainer } = render(
      <BestTimeDetailSheet
        detail={{ date: "2024-03-03", competitionTitle: "", note: "追い風参考" }}
        onClose={vi.fn()}
        noteFallbackLabel="一括登録"
      />,
    );
    const emptyTitleHtml = emptyTitleContainer.innerHTML;
    cleanup();

    const { container: nullTitleContainer } = render(
      <BestTimeDetailSheet
        detail={{ date: "2024-03-03", competitionTitle: null, note: "追い風参考" }}
        onClose={vi.fn()}
        noteFallbackLabel="一括登録"
      />,
    );
    expect(emptyTitleHtml).toBe(nullTitleContainer.innerHTML);
  });

  it('[V-DETAIL-11] 境界: competitionTitle も note も空文字("")のとき、象限Dと同じくフォールバックが表示される', () => {
    render(
      <BestTimeDetailSheet
        detail={{ date: "2024-03-03", competitionTitle: "", note: "" }}
        onClose={vi.fn()}
        noteFallbackLabel="一括登録"
      />,
    );
    expect(screen.getByText("一括登録")).toBeTruthy();
    expect(screen.queryByText("追い風参考")).toBeNull();
  });
});
