/**
 * RankingSplitLayout (web) — ランキングの「絞り込み ↔ 結果」2カラムレイアウト
 *                             (QA Sprint Contract Phase B)
 *
 * 対象: apps/web/components/team/rankings/RankingSplitLayout.tsx
 *
 * ユーザーの依頼:
 *   「スマホサイズの時 (および mobile) では上に選択肢で下にテーブルを表示させる
 *     今のままでいいが、PC サイズの時は、左半分で選択して右半分でランキングを
 *     表示させるようにしたい」
 *
 * Sprint Contract 検証観点:
 *   [V-SL-01] 左右の子を渡した順に描画する (絞り込みが先・結果が後 = DOM 順が
 *             `xl` 未満の縦積みの並びになる)
 *   [V-SL-02] ブレークポイントは **`xl` (1280px)** で、`xl:` 接頭辞しか持たない。
 *             `lg:` / `md:` / `sm:` のグリッド指定が無い (否定形)
 *             → `xl` 未満は素の `<div>` 3枚と等価で「今のまま」が保たれる
 *   [V-SL-03] 🚨 両カラムに `min-w-0` がある。grid item の `min-width` 既定は
 *             `auto` (= min-content) なので、これを外すと表の nowrap な列が
 *             **カラム幅を押し広げてグリッドを食い破る**
 *   [V-SL-04] `matchMedia` / `useMediaQuery` / `window.innerWidth` を使わない。
 *             SSR で幅が分からず初回描画が必ず外れてレイアウトが飛ぶため
 *   [V-SL-05] 個人種目とリレーが**同じコンポーネント**を使う (クラス文字列を
 *             2箇所に持たない)。片方だけ帯域を変えると切り替えでレイアウトが変わる
 *
 * 🚨 **幅・カラムの実寸・折り返しはこのファイルでは検証していない。**
 *    jsdom は CSS を適用せずレイアウトも計算しないので、
 *    `xl:grid` が実際に効くか / 左右が同幅か / 表が食い破らないかは
 *    **原理的に判定できない** (`getBoundingClientRect()` は常に 0)。
 *    それらは QA がヘッドレス Chromium で
 *    320〜1920px × ja/de で実測している (結果は QA レポート)。
 *    ここで固定するのは **クラス文字列と DOM 構造だけ**。
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import RankingSplitLayout from "@/components/team/rankings/RankingSplitLayout";

const SOURCE_PATH = path.resolve(
  __dirname,
  "../../../components/team/rankings/RankingSplitLayout.tsx",
);

/** 行コメントを落としたコード部分 (docstring での言及で誤検出しない) */
function codeOf(file: string): string {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

function renderLayout() {
  return render(
    <RankingSplitLayout
      filters={<div data-testid="qa-filters">QA_FILTERS_SIDE</div>}
      results={<div data-testid="qa-results">QA_RESULTS_SIDE</div>}
    />,
  );
}

describe("[V-SL-01] 左右の子を渡した順に描画する", () => {
  it("絞り込みと結果の両方が描画される", () => {
    renderLayout();

    expect(screen.getByTestId("qa-filters")).toBeInTheDocument();
    expect(screen.getByTestId("qa-results")).toBeInTheDocument();
  });

  it("DOM 順は 絞り込み → 結果 である (xl 未満の縦積みの並びがこれになる)", () => {
    renderLayout();

    const filters = screen.getByTestId("qa-filters");
    const results = screen.getByTestId("qa-results");

    // Node.DOCUMENT_POSITION_FOLLOWING = 4
    expect(filters.compareDocumentPosition(results) & 4).toBe(4);
  });

  it("グリッドの直下は 2 つのカラム div だけ (余計なラッパーを挟まない)", () => {
    const { container } = renderLayout();
    const grid = container.firstElementChild;
    expect(grid).not.toBeNull();
    expect(grid?.children).toHaveLength(2);
  });
});

describe("[V-SL-02] ブレークポイントは xl のみ", () => {
  it("グリッド指定がすべて xl: 接頭辞である", () => {
    const { container } = renderLayout();
    const grid = container.firstElementChild;
    const cls = grid?.getAttribute("class") ?? "";

    for (const expected of ["xl:grid", "xl:grid-cols-2", "xl:gap-6", "xl:items-start"]) {
      expect(cls, `${expected} が無い`).toContain(expected);
    }
  });

  it("🚨 xl 未満で効くグリッド指定を持たない (「今のまま」を壊さない)", () => {
    const { container } = renderLayout();
    const cls = container.firstElementChild?.getAttribute("class") ?? "";

    // 素の `grid` / `flex` や lg:/md:/sm: のグリッド指定があると
    // 1280px 未満でも 2 カラムになり、ユーザーの「今のままでいい」が壊れる
    const offenders = [
      /(^|\s)grid(\s|$)/,
      /(^|\s)flex(\s|$)/,
      /(^|\s)grid-cols-/,
      /(^|\s)(sm|md|lg):grid/,
      /(^|\s)(sm|md|lg):flex/,
      /(^|\s)(sm|md|lg):grid-cols-/,
      /(^|\s)(sm|md|lg):gap-/,
    ].filter((pattern) => pattern.test(cls));

    expect(offenders.map(String), `class="${cls}"`).toEqual([]);
  });

  it("🚨 lg: の指定がソースに1つも無い (lg では片側 316px しか無く表が横スクロールする)", () => {
    // 実測: viewport 1024px のとき片側は 316px。表の min-content は
    // 個人種目 394px / リレー 414px なので lg で2カラムにすると必ず溢れる
    // (縦積みなら 1024px で 656px あって収まる = 明確な後退)
    const code = codeOf(SOURCE_PATH);
    expect(code).not.toMatch(/\blg:/);
    expect(code).not.toMatch(/\bmd:/);
    expect(code).not.toMatch(/\bsm:/);
  });
});

describe("[V-SL-03] 両カラムに min-w-0 がある", () => {
  it("左右どちらのカラムも min-w-0 を持つ", () => {
    const { container } = renderLayout();
    const columns = [...(container.firstElementChild?.children ?? [])];

    expect(columns).toHaveLength(2);
    for (const [index, column] of columns.entries()) {
      expect(column.getAttribute("class") ?? "", `カラム ${index} に min-w-0 が無い`).toContain(
        "min-w-0",
      );
    }
  });

  it("🚨 min-w-0 がソースに 2 箇所ある (片方だけ外すと表が食い破る)", () => {
    // grid item の min-width 既定は auto (= min-content)。
    // 表の white-space:nowrap な列や長い大会名がカラム幅を押し広げるので、
    // min-w-0 で「中身ではなくトラック幅が幅を決める」に倒す必要がある。
    // 溢れは表側の overflow-x-auto に閉じ込める設計
    const code = codeOf(SOURCE_PATH);
    expect((code.match(/min-w-0/g) ?? []).length).toBe(2);
  });
});

describe("[V-SL-04] JS でのブレークポイント判定を使わない", () => {
  it("matchMedia / useMediaQuery / innerWidth / resize をソースで使っていない", () => {
    // SSR で幅が分からないため初回描画が必ずどちらかに外れ、
    // ハイドレーション後にレイアウトが飛ぶ
    const code = codeOf(SOURCE_PATH);

    for (const forbidden of [
      "matchMedia",
      "useMediaQuery",
      "innerWidth",
      "ResizeObserver",
      "addEventListener",
    ]) {
      expect(code, `${forbidden} を使っている`).not.toContain(forbidden);
    }
  });

  it("state / effect を持たない純粋なレイアウトである", () => {
    const code = codeOf(SOURCE_PATH);

    expect(code).not.toContain("useState");
    expect(code).not.toContain("useEffect");
  });
});

describe("[V-SL-05] 帯域の定義元が1箇所である", () => {
  /**
   * ⚠️ **期待値を更新した (2026-09-08 / PM 裁定)。**
   *
   * 旧: `TeamRankings.tsx` と `TeamRelayRankings.tsx` の**両方**が
   *     `RankingSplitLayout` を import していること。
   * 新: 種目軸の統合で `TeamRelayRankings` は結果を描くだけになり、
   *     2カラム化は親 `TeamRankings.tsx` **1箇所**が担う。
   *
   * この項目の意図は「クラス文字列を2箇所に持たない」ことであり、
   * 単一所有はその意図を**より強く**満たす。よって
   * 「両方が import している」ではなく「所有者がちょうど1つ」を要求する。
   */
  const CONSUMERS = [
    "../../../components/team/rankings/TeamRankings.tsx",
    "../../../components/team/rankings/TeamRelayRankings.tsx",
  ] as const;

  it("RankingSplitLayout を使うのは TeamRankings.tsx だけ (所有者が1つ)", () => {
    const owners = CONSUMERS.filter((relPath) =>
      codeOf(path.resolve(__dirname, relPath)).includes("RankingSplitLayout"),
    );
    expect(owners).toEqual(["../../../components/team/rankings/TeamRankings.tsx"]);
  });

  it("🚨 rankings 配下で RankingSplitLayout を描くのが1ファイルだけである (全数)", () => {
    // 決め打ちの2ファイルだけを見ると、3つ目の消費者が増えたことに気づけない。
    // ディレクトリを全走査して数を固定する
    const dir = path.resolve(__dirname, "../../../components/team/rankings");
    const users = readdirSync(dir)
      .filter((name) => name.endsWith(".tsx"))
      .filter((name) => name !== "RankingSplitLayout.tsx")
      .filter((name) => codeOf(path.join(dir, name)).includes("<RankingSplitLayout"));

    expect(users).toEqual(["TeamRankings.tsx"]);
  });

  it.each(CONSUMERS)(
    "%s が自前のグリッドクラス文字列を持たない (帯域の定義元は1箇所)",
    (relPath) => {
      const code = codeOf(path.resolve(__dirname, relPath));

      // 片方だけブレークポイントを変えると、サブビューを切り替えた瞬間に
      // レイアウトが変わる状態が静かに生まれる
      expect(code).not.toContain("xl:grid-cols-2");
      expect(code).not.toMatch(/xl:grid\b/);
    },
  );
});

/**
 * [V-SL-06] 🚨 `xl:sticky` と DashboardLayout の `xl:overflow-x-clip` の結合。
 *
 * `overflow-x: hidden` は CSS 仕様上もう一方の軸の `visible` を `auto` に昇格させる
 * ため、DashboardLayout のメイン div が**縦スクロールコンテナになる**。この div は
 * 高さが中身任せで実際にはスクロールしないので、その中の `position: sticky` は
 * 「スクロールしないスクロールポート」に対して張り付き先を失い、**エラーも警告も
 * 出さずに無効化される**。
 *
 * 実測 (ヘッドレス Chromium, 1280px, /ja/teams/:id?tab=rankings, 60名):
 *   clip   → 左カラム top = 80px で張り付く
 *   hidden → 左カラム top = -444px (グリッドと一緒に流れる)
 *
 * この2ファイルはディレクトリも所有者も違うので、片方だけ触られると
 * **テストも型も lint も全部 green のまま sticky だけが死ぬ**。そこで結合を固定する。
 */
describe("[V-SL-06] DashboardLayout の xl:overflow-x-clip との結合", () => {
  const DASHBOARD_LAYOUT = path.resolve(
    __dirname,
    "../../../components/layout/DashboardLayout.tsx",
  );

  it("DashboardLayout のメイン div が xl:overflow-x-clip を持つ", () => {
    const code = codeOf(DASHBOARD_LAYOUT);
    // base は hidden のまま (横クリップは全幅で維持する) で、xl だけ clip に上書き
    expect(code).toMatch(/className="pt-16 lg:pl-64 overflow-x-hidden xl:overflow-x-clip"/);
  });

  it("🚨 clip の帯域と sticky の帯域が一致する (どちらも xl)", () => {
    const layoutCode = codeOf(DASHBOARD_LAYOUT);
    const splitCode = codeOf(SOURCE_PATH);

    const bandOf = (code: string, re: RegExp) =>
      [...new Set((code.match(re) ?? []).map((m) => m.split(":")[0]))];

    // clip 側の帯域接頭辞
    expect(bandOf(layoutCode, /\b(?:sm|md|lg|xl|2xl):overflow-x-clip\b/g)).toEqual(["xl"]);
    // sticky 側の帯域接頭辞
    expect(bandOf(splitCode, /\b(?:sm|md|lg|xl|2xl):sticky\b/g)).toEqual(["xl"]);
    // 接頭辞なしの sticky / overflow-x-clip が無い (帯域を素で広げていない)
    expect(splitCode).not.toMatch(/className="[^"]*(?:^|\s)sticky(?:\s|")/);
    expect(layoutCode).not.toMatch(/className="[^"]*(?:^|\s)overflow-x-clip(?:\s|")/);
  });

  it("結合の理由が DashboardLayout 側にも書かれている (片側だけ消されるのを防ぐ)", () => {
    // 実装者が clip を「不要な指定」と誤認して消すのを防ぐのは、テストより先に
    // コメントの仕事。コメントが消えたらこのテストが落ちる
    const raw = readFileSync(DASHBOARD_LAYOUT, "utf8");
    expect(raw).toContain("RankingSplitLayout");
    expect(raw).toMatch(/xl:sticky/);
  });

  it("帯域判定の述語そのものが機能する (負のコントロール)", () => {
    const bandOf = (code: string, re: RegExp) =>
      [...new Set((code.match(re) ?? []).map((m) => m.split(":")[0]))];
    expect(bandOf('className="lg:overflow-x-clip"', /\b(?:sm|md|lg|xl|2xl):overflow-x-clip\b/g)).toEqual(["lg"]);
    expect(bandOf('className="overflow-x-hidden"', /\b(?:sm|md|lg|xl|2xl):overflow-x-clip\b/g)).toEqual([]);
    expect(bandOf('className="xl:sticky lg:sticky"', /\b(?:sm|md|lg|xl|2xl):sticky\b/g).sort()).toEqual(["lg", "xl"]);
  });
});
