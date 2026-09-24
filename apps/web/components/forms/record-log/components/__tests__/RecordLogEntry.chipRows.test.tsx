/**
 * RecordLogEntry — チップ行カルーセル化 / スプリット距離幅 の構造テスト (jsdom / QA Phase A)
 *
 * Sprint Contract「スマホ幅 Web UI 改善」の Deliverable:
 *   - RecordLogEntry.tsx:253,280 — 距離/泳法チップ行を ChipScrollRow に
 *   - RecordLogEntry.tsx:422-435 — スプリット距離 Input をラッパー div (w-16 sm:w-24 shrink-0)
 *     で包み、Input 側は w-full にする (F-1: utils/cn.ts は tailwind-merge ではないため
 *     Input に w-24 を渡しても内部 base の w-full と同時出力され後勝ちで効かない)
 *
 * ■ jsdom で見られること: DOM 構造 / クラス文字列 / クリック挙動
 * ■ jsdom で見られないこと: 実際の幅・行数・見切れ
 *   → Playwright (apps/web/e2e/src/tests/mobile-chip-carousel.spec.ts) で判定する
 *
 * ■ トートロジー回避メモ
 *   「クラス文字列が実装と同じ」ことを確かめても意味は薄いので、
 *   - チップ行は「testid が付いた単一のスクロール容器にチップが直接ぶら下がる」という
 *     Playwright 側の測定前提 (チップの親 = 測定対象) を固定する形で書く
 *   - スプリット幅は「幅クラスがラッパーに居て Input には居ない」という
 *     F-1 の真因そのものを表現する形で書く (数値 w-16/w-24 は Contract の PM 裁定)
 *   - 挙動 (クリックで onStyleChange が正しい style id で呼ばれる) は変更前後で不変の契約
 */

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import messages from "@apps/shared/messages/ja.json";
import type { RecordLogFormState, StyleOption } from "@/components/forms/record-log/types";
import RecordLogEntry from "../RecordLogEntry";

vi.mock("@/components/video/VideoUploader", () => ({
  __esModule: true,
  default: () => null,
}));

const renderWithIntl = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );

// styleIdToCodeKey (apps/web/utils/swimStyle.ts) の ID 帯に沿った実在レンジの fixture。
//   1-7: Fr / 8-11: Br / 12-15: Ba / 16-19: Fly / 20-22: IM
// 距離が 4 種・泳法が 5 種あり、375px では確実に 1 行に収まらない = カルーセルの
// ガードを実際に通る fixture であること (ガードを避ける fixture を選ばない)。
const STYLES: StyleOption[] = [
  { id: 1, nameJp: "25m自由形", distance: 25 },
  { id: 2, nameJp: "50m自由形", distance: 50 },
  { id: 3, nameJp: "100m自由形", distance: 100 },
  { id: 4, nameJp: "200m自由形", distance: 200 },
  { id: 9, nameJp: "50m平泳ぎ", distance: 50 },
  { id: 10, nameJp: "100m平泳ぎ", distance: 100 },
  { id: 13, nameJp: "50m背泳ぎ", distance: 50 },
  { id: 17, nameJp: "50mバタフライ", distance: 50 },
  { id: 21, nameJp: "200m個人メドレー", distance: 200 },
];

const makeFormData = (overrides: Partial<RecordLogFormState> = {}): RecordLogFormState => ({
  styleId: "2",
  time: 0,
  timeDisplayValue: "",
  isRelaying: false,
  splitTimes: [],
  note: "",
  videoPath: null,
  videoThumbnailPath: null,
  reactionTime: "",
  ...overrides,
});

const noop = () => {};

function renderEntry(opts: {
  formData?: RecordLogFormState;
  styles?: StyleOption[];
  onStyleChange?: (v: string) => void;
  index?: number;
}) {
  const index = opts.index ?? 0;
  return renderWithIntl(
    <RecordLogEntry
      formData={opts.formData ?? makeFormData()}
      index={index}
      styles={opts.styles ?? STYLES}
      poolType={0}
      bestTimes={[]}
      isLoading={false}
      onTimeChange={noop}
      onToggleRelaying={noop}
      onNoteChange={noop}
      onVideoPathChange={noop}
      onVideoDelete={noop}
      onReactionTimeChange={noop}
      onStyleChange={opts.onStyleChange ?? noop}
      onAddSplitTime={noop}
      onAddSplitTimesEvery25m={noop}
      onAddSplitTimesEvery50m={noop}
      onRemoveSplitTime={noop}
      onSplitTimeChange={noop}
    />,
  );
}

// sectionIndex = index + 1 (RecordLogEntry.tsx:110)
const SECTION = 1;

/** className を空白分割したトークン集合 (部分文字列一致のトートロジーを避ける) */
const classTokens = (el: HTMLElement) => el.className.split(/\s+/).filter(Boolean);

/**
 * チップの直接の親 = flex / スクロール容器。
 * ChipScrollRow は行間 Critical の対策で内側ラッパーを持ちうるため、
 * data-testid が付いた外側と一致するとは限らない。実測で辿る。
 */
function scrollerOf(row: HTMLElement): HTMLElement {
  const chips = within(row).queryAllByRole("button");
  expect(chips.length, "行にチップが1つも無い").toBeGreaterThan(0);
  const parent = chips[0]!.parentElement;
  expect(parent, "チップの親が無い").not.toBeNull();
  for (const c of chips) {
    expect(c.parentElement, "チップごとにラッパーが挟まっている").toBe(parent);
  }
  expect(row.contains(parent), "スクロール容器が行コンテナの外にある").toBe(true);
  return parent!;
}

/**
 * 行コンテナとスクロール容器の両方のトークンを集める。
 * 現在の ChipScrollRow では data-testid はスクロール容器自身に付いており
 * 両者は同一要素なので、結果は同じトークンが 2 回並ぶだけになる (恒等写像)。
 * 将来レイアウト用の内側ラッパーが増えても壊れないようにするための冗長化であって、
 * 今この時点で 2 要素を見分けているわけではない。
 */
function rowTokens(row: HTMLElement): string[] {
  const scroller = scrollerOf(row);
  return [...classTokens(row), ...classTokens(scroller)];
}

describe("RecordLogEntry — チップ行のカルーセル化", () => {
  describe("[R-01] 距離チップ行", () => {
    it("行コンテナ testid が存在し、全距離チップがその直接の子である", () => {
      renderEntry({});
      const row = screen.getByTestId(`chiprow-record-style-distance-${SECTION}`);

      // Playwright 側は「チップの親要素 = スクロール容器」を測定する。
      // 行全体を包む内側ラッパー1枚は許容するが、チップごとのラッパーは許容しない
      // (scrollerOf がそれを検出する)。
      const scroller = scrollerOf(row);
      for (const d of [25, 50, 100, 200]) {
        const chip = screen.getByTestId(`record-style-distance-${SECTION}-${d}`);
        expect(chip.parentElement).toBe(scroller);
      }
      expect(within(row).getAllByRole("button")).toHaveLength(4);
    });

    it("行コンテナが横スクロール + チップ非圧縮のクラスを持つ", () => {
      renderEntry({});
      const tokens = rowTokens(screen.getByTestId(`chiprow-record-style-distance-${SECTION}`));
      // "flex" は "sm:flex-wrap" の部分文字列なのでトークン完全一致で見る
      expect(tokens, "display:flex が無い (チップが縦積みになる)").toContain("flex");
      expect(tokens).toContain("overflow-x-auto");
      expect(tokens).toContain("[&>*]:shrink-0");
      expect(tokens).toContain("sm:flex-wrap");
      expect(tokens).toContain("sm:overflow-x-visible");
    });

    it("距離チップのクリックで同じ泳法の別距離 style id に切り替わる (挙動は変更前と同一)", () => {
      const onStyleChange = vi.fn();
      // 現在 50m自由形 (id=2) → 100m をクリックすると 100m自由形 (id=3)
      renderEntry({ formData: makeFormData({ styleId: "2" }), onStyleChange });

      fireEvent.click(screen.getByTestId(`record-style-distance-${SECTION}-100`));
      expect(onStyleChange).toHaveBeenCalledTimes(1);
      expect(onStyleChange).toHaveBeenCalledWith("3");
    });

    it("選択中の距離チップに aria-pressed=true が付く", () => {
      renderEntry({ formData: makeFormData({ styleId: "2" }) });
      expect(screen.getByTestId(`record-style-distance-${SECTION}-50`)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByTestId(`record-style-distance-${SECTION}-100`)).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });

    it("チップに focus:ring-2 が残っている (クリップ回避の前提)", () => {
      // ChipScrollRow 側の py-1 -my-1 は「リングがあること」が前提の対策。
      // リング自体を消して解決されると Playwright の可視性検証が無意味になる。
      renderEntry({});
      expect(screen.getByTestId(`record-style-distance-${SECTION}-50`).className).toContain(
        "focus:ring-2",
      );
    });
  });

  describe("[R-02] 泳法チップ行", () => {
    it("行コンテナ testid が存在し、泳法チップがその直接の子である", () => {
      renderEntry({ formData: makeFormData({ styleId: "2" }) }); // 50m → Fr/Br/Ba/Fly
      const row = screen.getByTestId(`chiprow-record-style-stroke-${SECTION}`);
      const scroller = scrollerOf(row);
      for (const ck of ["Fr", "Br", "Ba", "Fly"]) {
        const chip = screen.getByTestId(`record-style-stroke-${SECTION}-${ck}`);
        expect(chip.parentElement).toBe(scroller);
      }
      expect(within(row).getAllByRole("button")).toHaveLength(4);
    });

    it("行コンテナが横スクロール + チップ非圧縮のクラスを持つ", () => {
      renderEntry({ formData: makeFormData({ styleId: "2" }) });
      const tokens = rowTokens(screen.getByTestId(`chiprow-record-style-stroke-${SECTION}`));
      expect(tokens, "display:flex が無い (チップが縦積みになる)").toContain("flex");
      expect(tokens).toContain("overflow-x-auto");
      expect(tokens).toContain("[&>*]:shrink-0");
      expect(tokens).toContain("sm:flex-wrap");
      expect(tokens).toContain("sm:overflow-x-visible");
    });

    it("泳法チップのクリックで同じ距離の別泳法 style id に切り替わる", () => {
      const onStyleChange = vi.fn();
      renderEntry({ formData: makeFormData({ styleId: "2" }), onStyleChange }); // 50m自由形
      fireEvent.click(screen.getByTestId(`record-style-stroke-${SECTION}-Ba`));
      expect(onStyleChange).toHaveBeenCalledWith("13"); // 50m背泳ぎ
    });

    it("[境界] 距離が未選択 (styles に無い styleId) でも泳法行が空のまま描画され落ちない", () => {
      // Contract Boundary Case: StyleChipSelector と違いフォールバックが無いため、
      // codeKeysForCurrentDistance が [] になる経路が実在する。
      renderEntry({ formData: makeFormData({ styleId: "9999" }) });
      const row = screen.getByTestId(`chiprow-record-style-stroke-${SECTION}`);
      expect(row).toBeInTheDocument();
      expect(within(row).queryAllByRole("button")).toHaveLength(0);
      // 空でも距離行は生きていること (ユーザーが選び直せる)
      expect(
        within(screen.getByTestId(`chiprow-record-style-distance-${SECTION}`)).getAllByRole("button"),
      ).toHaveLength(4);
    });
  });

  describe("[R-03] スプリット距離 input の幅 (F-1 修正)", () => {
    const withSplit = () =>
      makeFormData({
        styleId: "4", // 200m自由形
        splitTimes: [
          { uiKey: "s1", distance: 50, splitTime: 0, splitTimeDisplayValue: "27.50" },
          { uiKey: "s2", distance: 1500, splitTime: 0, splitTimeDisplayValue: "1:23.45" },
          // st.distance === raceDistance の行 = ゴミ箱が出ず w-9 スペーサーになる経路
          { uiKey: "s3", distance: 200, splitTime: 0, splitTimeDisplayValue: "2:05.10" },
        ],
      });

    // Input (components/ui/Input.tsx) は <input> を自前で 2 段 (space-y-2 > relative) 包む。
    // 段数を決め打ちすると Input の内部構造が変わった瞬間に無意味な赤になるため、
    // 「距離 input とタイム input の両方を含む最も近い祖先 = スプリット1行」を起点に、
    // その行の直接の子を幅ラッパーとして構造から導出する。
    /** 距離 input とタイム input の両方を含む最も近い祖先 = スプリット 1 行 */
    const splitRow = (idx: number) => {
      const dist = screen.getByTestId(`record-split-distance-${SECTION}-${idx}`);
      const time = screen.getByTestId(`record-split-time-${SECTION}-${idx}`);
      let el: HTMLElement | null = dist.parentElement;
      while (el && !el.contains(time)) el = el.parentElement;
      expect(el, "距離 input とタイム input を含むスプリット行が見つからない").not.toBeNull();
      return el!;
    };

    /** 指定要素から辿った「スプリット行の直接の子」= 幅を持つラッパー */
    const wrapperInRow = (el: HTMLElement, idx: number) => {
      const row = splitRow(idx);
      let cur: HTMLElement = el;
      while (cur.parentElement && cur.parentElement !== row) cur = cur.parentElement;
      expect(cur.parentElement, "スプリット行の直接の子まで辿れない").toBe(row);
      return cur;
    };

    it("距離 input がラッパー div の中にあり、幅クラスはラッパー側にある", () => {
      renderEntry({ formData: withSplit() });
      const input = screen.getByTestId(`record-split-distance-${SECTION}-1`);
      const wrapper = wrapperInRow(input, 1);

      // ★ 幅ラッパーは input の直接の親ではない。Input (components/ui/Input.tsx) は
      //    <div class="space-y-2"><div class="relative"><input …> を返すため、
      //    input.parentElement は常に "relative" になる。そこを見ていた旧版は
      //    F-1 修正 (PM 裁定 1) を一切検証できていなかった。
      expect(wrapper).not.toBe(input.parentElement);

      // PM 裁定 1: w-16 sm:w-24 (デスクトップも 180px→96px に変わることを承認済み)
      const tokens = classTokens(wrapper);
      expect(tokens, "幅ラッパーに w-16 が無い").toContain("w-16");
      expect(tokens, "幅ラッパーに sm:w-24 が無い").toContain("sm:w-24");
      // flex 行の中で潰れないこと
      expect(tokens, "幅ラッパーに shrink-0 が無い").toContain("shrink-0");
    });

    it("Input 自身には w-full だけが渡り、w-* の固定幅は渡らない (cn.ts が後勝ちで潰すため)", () => {
      renderEntry({ formData: withSplit() });
      const input = screen.getByTestId(`record-split-distance-${SECTION}-1`);
      expect(input.className).toContain("w-full");
      // 真因そのもの: Input に固定幅を渡すと内部 base の w-full と同時出力される
      expect(input.className).not.toMatch(/\bw-24\b/);
      expect(input.className).not.toMatch(/\bw-16\b/);
    });

    it("タイム input 側は flex-1 のラッパーで残り幅を占める (距離を縮めた分が回る)", () => {
      renderEntry({ formData: withSplit() });
      const timeInput = screen.getByTestId(`record-split-time-${SECTION}-1`);
      const wrapper = wrapperInRow(timeInput, 1);
      expect(wrapper).not.toBe(timeInput.parentElement);
      expect(classTokens(wrapper), "タイム側ラッパーに flex-1 が無い").toContain("flex-1");
      expect(timeInput.className).toContain("w-full");
    });

    it("[境界] 距離 1500 の値がそのまま input の value に入る (切り詰めない)", () => {
      renderEntry({ formData: withSplit() });
      expect(screen.getByTestId(`record-split-distance-${SECTION}-2`)).toHaveValue("1500");
    });

    it("[境界] ゴミ箱が出ない行 (st.distance === raceDistance) でも距離欄の幅クラスが同一", () => {
      // Contract Boundary Case: スペーサー (w-9) 側の行だけ幅が揃わない事故を防ぐ。
      //
      // ★ 旧版は input.parentElement 同士を比較していたため、両方 Input 内部の
      //   "relative" になり「常に一致」する完全なトートロジーだった。
      //   幅ラッパー同士を比較し、かつ実際に幅クラスを持っていることも確認する。
      renderEntry({ formData: withSplit() });
      const normal = wrapperInRow(screen.getByTestId(`record-split-distance-${SECTION}-1`), 1);
      const spacer = wrapperInRow(screen.getByTestId(`record-split-distance-${SECTION}-3`), 3);

      expect(classTokens(normal), "比較対象が幅クラスを持っていない").toContain("w-16");
      expect(classTokens(spacer), "スペーサー行の距離欄に幅クラスが無い").toContain("w-16");
      expect(spacer.className).toBe(normal.className);

      // ゴミ箱の有無自体は行ごとに違う (前提が崩れていないことの確認)
      expect(
        screen.queryByTestId(`record-split-remove-button-${SECTION}-1`),
        "通常行にゴミ箱が無い = fixture がガードを通っていない",
      ).not.toBeNull();
    });
  });
});
