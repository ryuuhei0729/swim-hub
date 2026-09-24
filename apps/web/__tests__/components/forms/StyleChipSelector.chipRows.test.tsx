/**
 * StyleChipSelector — チップ行カルーセル化の構造テスト (jsdom / QA Phase B 改訂版)
 *
 * Sprint Contract (PM 裁定 2):
 *   エントリータブ (StyleChipSelector.tsx:92,117) も同時にカルーセル化する。
 *
 * ■ Phase B 改訂点
 *   - 容器 testid を衝突不能な `chiprow-` 名前空間に統一 (PM 裁定)。
 *     旧 `entry-style-1-stroke-row` 等は既存 e2e の前方一致セレクタが
 *     容器 div を掴んでしまう危険があった。
 *   - クラス判定を `toContain` (部分文字列) から**トークン完全一致**に変更。
 *     `"flex"` は `"sm:flex-wrap"` の部分文字列なので display:flex を消しても
 *     green になり「チップが縦積み」を見逃していた。
 *   - ChipScrollRow の内側ラッパー追加に耐えるよう、チップの親は実測で辿る。
 *
 * ■ 幅・折り返しは Playwright (mobile-chip-carousel.spec.ts) で判定する
 */

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import messages from "@apps/shared/messages/ja.json";
import type { StyleOption } from "@/components/forms/record-log/types";
import StyleChipSelector from "@/components/forms/StyleChipSelector";

// styleIdToCodeKey の ID 帯: 1-7 Fr / 8-11 Br / 12-15 Ba / 16-19 Fly / 20-22 IM
const STYLES: StyleOption[] = [
  { id: 1, nameJp: "25m自由形", distance: 25 },
  { id: 2, nameJp: "50m自由形", distance: 50 },
  { id: 3, nameJp: "100m自由形", distance: 100 },
  { id: 4, nameJp: "200m自由形", distance: 200 },
  { id: 9, nameJp: "50m平泳ぎ", distance: 50 },
  { id: 13, nameJp: "50m背泳ぎ", distance: 50 },
  { id: 17, nameJp: "50mバタフライ", distance: 50 },
  { id: 21, nameJp: "200m個人メドレー", distance: 200 },
];

const PREFIX = "entry-style-1";
const DISTANCE_ROW = `chiprow-${PREFIX}-distance`;
const STROKE_ROW = `chiprow-${PREFIX}-stroke`;

const classTokens = (el: HTMLElement) => el.className.split(/\s+/).filter(Boolean);

/** チップの直接の親 = flex / スクロール容器 (内側ラッパーの有無に依存しない) */
function scrollerOf(row: HTMLElement): HTMLElement {
  const chips = within(row).queryAllByRole("button");
  expect(chips.length, "行にチップが1つも無い").toBeGreaterThan(0);
  const parent = chips[0]!.parentElement!;
  for (const c of chips) {
    expect(c.parentElement, "チップごとにラッパーが挟まっている").toBe(parent);
  }
  expect(row.contains(parent), "スクロール容器が行コンテナの外にある").toBe(true);
  return parent;
}

// 現在は row 自身がスクロール容器なので同じトークンが 2 回並ぶ (恒等写像)。
// 内側ラッパーが増えても壊れないようにするための冗長化。
const rowTokens = (row: HTMLElement) => [...classTokens(row), ...classTokens(scrollerOf(row))];

function renderSelector(opts: { value?: string; onChange?: (v: string) => void } = {}) {
  return render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <StyleChipSelector
        styles={STYLES}
        value={opts.value ?? "2"}
        onChange={opts.onChange ?? (() => {})}
        testIdPrefix={PREFIX}
      />
    </NextIntlClientProvider>,
  );
}

describe("StyleChipSelector — チップ行のカルーセル化", () => {
  it("[S-01] 距離行の testid が存在し、距離チップが単一のスクロール容器にぶら下がる", () => {
    renderSelector();
    const row = screen.getByTestId(DISTANCE_ROW);
    const scroller = scrollerOf(row);
    for (const d of [25, 50, 100, 200]) {
      expect(screen.getByTestId(`${PREFIX}-distance-${d}`).parentElement).toBe(scroller);
    }
    expect(within(row).getAllByRole("button")).toHaveLength(4);
  });

  it("[S-02] 泳法行の testid が存在し、泳法チップが単一のスクロール容器にぶら下がる", () => {
    renderSelector({ value: "2" }); // 50m → Fr / Br / Ba / Fly
    const row = screen.getByTestId(STROKE_ROW);
    const scroller = scrollerOf(row);
    for (const ck of ["Fr", "Br", "Ba", "Fly"]) {
      expect(screen.getByTestId(`${PREFIX}-stroke-${ck}`).parentElement).toBe(scroller);
    }
    expect(within(row).getAllByRole("button")).toHaveLength(4);
  });

  it("[S-03] 両行が display:flex + 横スクロール + チップ非圧縮 + sm 折り返し復帰", () => {
    renderSelector();
    for (const testId of [DISTANCE_ROW, STROKE_ROW]) {
      const tokens = rowTokens(screen.getByTestId(testId));
      // "flex" をトークン完全一致で見る ("sm:flex-wrap" の部分文字列に当てない)
      expect(tokens, `${testId}: display:flex が無い (チップが縦積みになる)`).toContain("flex");
      expect(tokens, testId).toContain("overflow-x-auto");
      expect(tokens, testId).toContain("[&>*]:shrink-0");
      expect(tokens, testId).toContain("sm:flex-wrap");
      expect(tokens, testId).toContain("sm:overflow-x-visible");
    }
  });

  it("[S-04] 距離チップのクリック挙動が変更前と同一 (同じ泳法の別距離へ)", () => {
    const onChange = vi.fn();
    renderSelector({ value: "2", onChange }); // 50m自由形
    fireEvent.click(screen.getByTestId(`${PREFIX}-distance-100`));
    expect(onChange).toHaveBeenCalledWith("3"); // 100m自由形
  });

  it("[S-05] 泳法チップのクリック挙動が変更前と同一 (同じ距離の別泳法へ)", () => {
    const onChange = vi.fn();
    renderSelector({ value: "2", onChange });
    fireEvent.click(screen.getByTestId(`${PREFIX}-stroke-Br`));
    expect(onChange).toHaveBeenCalledWith("9"); // 50m平泳ぎ
  });

  it("[S-06] リレートグルはチップ行の外に出したままである (行の高さ計測を汚さない)", () => {
    // 行を1行に保つ Playwright 判定の前提。トグルを行の中に入れられると
    // 「1行に収まる」判定が意味を失う。
    render(
      <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
        <StyleChipSelector
          styles={STYLES}
          value="2"
          onChange={() => {}}
          testIdPrefix={PREFIX}
          isRelaying={false}
          onToggleRelaying={() => {}}
          relayLabel="リレー"
        />
      </NextIntlClientProvider>,
    );
    // fixture 前提の確認: 50m自由形 (id=2) は canStyleRelay=true なのでトグルが出る
    const relay = screen.getByTestId(`${PREFIX}-relay`);
    expect(screen.getByTestId(DISTANCE_ROW).contains(relay)).toBe(false);
    expect(screen.getByTestId(STROKE_ROW).contains(relay)).toBe(false);
  });

  it("[S-07] チップの focus:ring-2 が残っている (py-1 -my-1 の前提)", () => {
    renderSelector();
    expect(classTokens(screen.getByTestId(`${PREFIX}-distance-50`))).toContain("focus:ring-2");
  });
});
