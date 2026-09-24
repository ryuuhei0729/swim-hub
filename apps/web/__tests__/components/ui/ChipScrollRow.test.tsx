/**
 * ChipScrollRow 単体テスト (jsdom / QA Phase B 改訂版)
 *
 * Sprint Contract「スマホ幅 Web UI 改善」の新規コンポーネント。
 *
 * ■ このファイルが検証する範囲 (jsdom で原理的に検証できるもの)
 *   - props (role / data-testid / className) が実際に DOM へ出ること
 *   - Contract が要求するレイアウトクラスが「クラストークンの完全一致」で乗っていること
 *   - 右端フェードの表示条件ロジック (先頭 / 中間 / 末尾 / 1px 丸め)
 *   - **scroll イベントを介さない再計測** (チップ増減で scrollWidth が変わる経路)
 *   - ResizeObserver の cleanup (disconnect) が unmount で呼ばれること
 *
 * ■ このファイルが検証しない範囲 (jsdom では不可能)
 *   幅・折り返し・見切れ・行間。jsdom は Tailwind CSS を読まず Flexbox も解決しない。
 *   → Playwright (e2e/src/tests/mobile-chip-carousel.spec.ts) で判定する。
 *
 * ■ Reviewer 指摘を受けた改訂点
 *   [M-3] `toContain("flex")` は `sm:flex-wrap` の部分文字列にヒットするトートロジーだった。
 *         display:flex を消しても green になり「モバイルでチップが縦積み」を見逃す。
 *         → className を空白分割した**トークン完全一致**で判定する。
 *   [H-3] C-03 が全件 scroll イベント発火で updateFade を直接叩いていたため、
 *         deps 無し effect (= チップ増減での再計測) を `[]` に変えても green のままだった。
 *         → scroll を一切発火させずに再レンダーだけでフェードが付くケースを追加。
 *   [Low] 「React 18 は委譲するので bubbles: true が必要」というコメントは事実誤認
 *         (scroll は非委譲イベントで DOM ノードに直接張られる)。削除。
 *   [Low] フェードの中間位置ケース (scrollLeft が 0 でも末尾でもない) を追加。
 *         これが無いと isAtEnd を `scrollLeft > 0` と誤実装しても全件 green になる。
 *
 * ■ 内側ラッパーへの耐性
 *   容器は「data-testid を持つ外側」と「チップの直接の親 (= flex/スクロール容器)」が
 *   別要素になりうる (行間 Critical の修正で内側ラッパーが入る)。
 *   どちらであるかに依存しないよう、チップの親を実測して取得する。
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { ChipScrollRow } from "@/components/ui/ChipScrollRow";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** className を空白分割したトークン集合。部分文字列一致のトートロジーを避ける */
function classTokens(el: HTMLElement): string[] {
  return el.className.split(/\s+/).filter(Boolean);
}

function expectHasClass(el: HTMLElement, token: string, why: string) {
  expect(classTokens(el), `${why} (class="${el.className}")`).toContain(token);
}

/** 実寸レイアウトを持たない jsdom で「スクロール状態」を再現するためのスタブ */
function stubScrollMetrics(
  el: HTMLElement,
  metrics: { scrollWidth: number; clientWidth: number; scrollLeft: number },
) {
  Object.defineProperty(el, "scrollWidth", { value: metrics.scrollWidth, configurable: true });
  Object.defineProperty(el, "clientWidth", { value: metrics.clientWidth, configurable: true });
  Object.defineProperty(el, "scrollLeft", { value: metrics.scrollLeft, configurable: true });
}

function fireScroll(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new Event("scroll"));
  });
}

/**
 * 右端フェードとして許される mask の形。
 *
 * `toContain("linear-gradient")` だけだと以下がすべて素通りする:
 *   - `to right` → `to left`   : フェードが左端に出て「右にチップがある」合図が消える
 *   - ストップ順の入れ替え       : 行の左 90% が丸ごと不可視になる
 *   - `calc(100% - 28px)` → `+` : フェードが画面外に出て機能が消える
 *   - `toContain("28px")`       : `128px` にも一致してしまう
 *   - `toContain("gradient")`   : `radial-gradient` でも通る
 * 方向・ストップ順・幅をまとめて固定する。
 */
const RIGHT_FADE_MASK =
  /^linear-gradient\(\s*to right\s*,\s*(?:rgb\(0,\s*0,\s*0\)|#000(?:000)?)\s+calc\(100%\s*-\s*28px\)\s*,\s*transparent\s*\)$/;

/** フェードが掛かっている要素 (外側/内側どちらに乗っていても拾う) の mask を返す */
function maskOf(root: HTMLElement): string {
  const candidates = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  for (const el of candidates) {
    const mask = el.style.maskImage || el.style.webkitMaskImage || "";
    if (mask) return mask;
  }
  return "";
}

/** チップの直接の親 = flex / スクロール容器 (内側ラッパーの有無に依存しない) */
function scrollerOf(container: HTMLElement): HTMLElement {
  const chip = container.querySelector<HTMLElement>("[data-chip]");
  expect(chip, "チップが描画されていない").not.toBeNull();
  const parent = chip!.parentElement;
  expect(parent, "チップの親が無い").not.toBeNull();
  return parent!;
}

const chip = (id: string, label: string) => (
  <button type="button" data-chip="1" data-testid={id} key={id}>
    {label}
  </button>
);

const CHIPS = [chip("chip-a", "50m"), chip("chip-b", "100m")];

describe("ChipScrollRow", () => {
  describe("[C-01] props の受け渡し (握りつぶすと静かに壊れる)", () => {
    it("data-testid が DOM 属性として出力される", () => {
      render(<ChipScrollRow data-testid="row-x">{CHIPS}</ChipScrollRow>);
      expect(screen.getByTestId("row-x")).toBeInTheDocument();
    });

    it("role が DOM 属性として出力される", () => {
      render(
        <ChipScrollRow data-testid="row-x" role="group">
          {CHIPS}
        </ChipScrollRow>,
      );
      expect(screen.getByTestId("row-x")).toHaveAttribute("role", "group");
      // role="group" は SelectChips の既存契約。querySelector でも引けること。
      expect(document.querySelector('[role="group"]')).not.toBeNull();
    });

    it("外側ボックスに `<data-testid>-box` が出力される (Playwright の高さ・行間測定点)", () => {
      // Playwright 側の高さ・行間判定は全部この -box に依存している。
      // だが Playwright は CI で skip されるため (spec 冒頭参照)、
      // -box が消えたことを CI で検出できるのは**この jsdom テストだけ**。
      render(<ChipScrollRow data-testid="row-x">{CHIPS}</ChipScrollRow>);
      const container = screen.getByTestId("row-x");
      expect(screen.getByTestId("row-x-box")).toBe(container.parentElement);
    });

    it("data-testid 未指定なら外側 / 内側とも testid 属性が出ない", () => {
      // StyleChipSelector は testIdPrefix 未指定で呼ばれうる。その場合に
      // `undefined-box` のような文字列が漏れないこと。
      // (チップ自身は data-testid を持つのでコンテナ 2 段だけを見る)
      const { container } = render(<ChipScrollRow>{CHIPS}</ChipScrollRow>);
      const outer = container.firstElementChild as HTMLElement;
      expect(outer, "ルート要素が無い").not.toBeNull();
      const inner = outer.firstElementChild as HTMLElement;
      expect(outer.hasAttribute("data-testid")).toBe(false);
      expect(inner.hasAttribute("data-testid")).toBe(false);
    });

    it("role を渡さない場合は属性が付かない (既存行の a11y ツリーを変えない)", () => {
      render(<ChipScrollRow data-testid="row-x">{CHIPS}</ChipScrollRow>);
      expect(screen.getByTestId("row-x").hasAttribute("role")).toBe(false);
    });

    it("全チップが単一の親にぶら下がる (チップごとのラッパーを挟まない)", () => {
      // Playwright 側の測定は「チップの親 = スクロール容器」を前提にしている。
      // チップごとにラッパー div を挟まれるとその前提が崩れる。
      // (行全体を包む内側ラッパー1枚は許容する。行間 Critical の修正で必要になるため)
      render(<ChipScrollRow data-testid="row-x">{CHIPS}</ChipScrollRow>);
      const container = screen.getByTestId("row-x");
      const a = screen.getByTestId("chip-a");
      const b = screen.getByTestId("chip-b");
      expect(a.parentElement).toBe(b.parentElement);
      expect(container.contains(a.parentElement)).toBe(true);
      expect(a.parentElement!.children).toHaveLength(2);
    });

    it("className が既定クラスに追記される (既定を上書きして消さない)", () => {
      render(
        <ChipScrollRow data-testid="row-x" className="gap-1.5 sm:gap-2">
          {CHIPS}
        </ChipScrollRow>,
      );
      const container = screen.getByTestId("row-x");
      const scroller = scrollerOf(container);
      // gap は行ごとに違うので呼び出し元の指定が生きること
      const allTokens = [...classTokens(container), ...classTokens(scroller)];
      expect(allTokens).toContain("gap-1.5");
      expect(allTokens).toContain("sm:gap-2");
      // 呼び出し元の gap を足しても基本形が残っていること
      expectHasClass(scroller, "flex", "gap 指定で既定の flex が消えている");
      expectHasClass(scroller, "overflow-x-auto", "gap 指定で overflow-x-auto が消えている");
    });
  });

  describe("[C-02] Contract が要求するレイアウトクラス (トークン完全一致)", () => {
    const renderRow = () => {
      render(<ChipScrollRow data-testid="row-x">{CHIPS}</ChipScrollRow>);
      const container = screen.getByTestId("row-x");
      return { container, scroller: scrollerOf(container) };
    };

    it("sm 未満: 1行の横スクロール (display:flex + overflow-x-auto + scrollbar-hide)", () => {
      const { scroller } = renderRow();
      // "flex" を toContain で見ると "sm:flex-wrap" の部分文字列に当たってしまうため
      // トークン完全一致で見る。display:flex が消えるとチップが縦積みになる。
      expectHasClass(scroller, "flex", "display:flex が無い (チップが縦積みになる)");
      expectHasClass(scroller, "overflow-x-auto", "横スクロール容器になっていない");
      // scrollbar-hide は globals.css:350 で定義済み。ItemTabs にあった未定義の
      // scrollbar-none と取り違えないこと。
      expectHasClass(scroller, "scrollbar-hide", "scrollbar-hide が無い");
      expect(classTokens(scroller)).not.toContain("scrollbar-none");
    });

    it("チップが潰れない ([&>*]:shrink-0)", () => {
      // これが無いと 375px で全チップが横に圧縮され、文字が見切れる。
      const { scroller } = renderRow();
      expectHasClass(scroller, "[&>*]:shrink-0", "チップ非圧縮の指定が無い");
    });

    it("sm 以上: 折り返し挙動に復帰する (sm:flex-wrap + sm:overflow-x-visible)", () => {
      const { scroller } = renderRow();
      expectHasClass(scroller, "sm:flex-wrap", "sm 以上で折り返しに戻らない");
      expectHasClass(scroller, "sm:overflow-x-visible", "sm 以上で overflow-x が戻らない");
    });

    it("focus ring のクリップ回避 py-1/-my-1 は必ず対で、sm で両方解除される", () => {
      // どの要素が持つかは内側ラッパーの有無で変わるため要素を特定しない。
      // 「py-1 と -my-1 が同一要素にあり、その要素が sm:py-0 と sm:my-0 も持つ」
      // という対の関係だけを見る。片方だけだとレイアウトがずれる / デスクトップの
      // 行間が潰れる (Reviewer 指摘の Critical) 。
      const { container } = renderRow();
      const all = [container, ...Array.from(container.querySelectorAll<HTMLElement>("*"))];
      const owner = all.find((el) => {
        const t = classTokens(el);
        return t.includes("py-1") && t.includes("-my-1");
      });
      expect(owner, "py-1 と -my-1 を対で持つ要素が無い (focus ring が上下で切れる)").toBeDefined();
      const t = classTokens(owner!);
      expect(t, "sm:py-0 が無い (デスクトップの行高さが変わる)").toContain("sm:py-0");
      expect(t, "sm:my-0 が無い (デスクトップの行高さが変わる)").toContain("sm:my-0");
    });

    it("親から見えるルート要素が margin を持たず、flex である (C-1 の構造的根拠)", () => {
      // Reviewer 指摘の Critical: 親の space-y-1.5 が生成する
      // `:where(.space-y-1\.5 > :not(:last-child)) { margin-block: … }` は特異度 0 なので、
      // ChipScrollRow の**ルート**に `-my-1` (特異度 0,1,0) が乗ると上書きされ、
      // 1280px で行間 6px → 0px に潰れる。
      // 現在の実装はルートを margin ゼロの <div className="flex"> にし、
      // -my-1 は内側のスクロール容器だけが持つ。
      const { container } = renderRow();
      const root = container.parentElement;
      expect(root, "スクロール容器を包むルート要素が無い").not.toBeNull();

      const rootTokens = classTokens(root!);
      expect(rootTokens, "ルートに負のマージンがあると親の space-y-* を潰す").not.toContain(
        "-my-1",
      );
      expect(rootTokens, "ルートに sm:my-0 があると親の space-y-* を潰す").not.toContain("sm:my-0");
      // ルートが block だと内側の負 margin が collapse してルート自身の margin として
      // 漏れ、結局 C-1 が再発する。flex アイテムの margin は collapse しない。
      expect(rootTokens, "ルートが flex でないと margin collapsing で C-1 が再発する").toContain(
        "flex",
      );

      // 負のマージンは内側 (= data-testid を持つスクロール容器) が持つ
      expect(classTokens(container), "内側に -my-1 が無い").toContain("-my-1");
    });
  });

  describe("[C-03] 右端フェードの表示条件ロジック", () => {
    // 注記: ここで見ているのは「式が正しいか」であって「実際に見えるか」ではない。
    // 実描画の確認は Playwright 側 (mask-image の computed style) で行う。

    const setup = () => {
      const utils = render(<ChipScrollRow data-testid="row-x">{CHIPS}</ChipScrollRow>);
      const container = screen.getByTestId("row-x");
      return { ...utils, container, scroller: scrollerOf(container) };
    };

    it("スクロール余地が無いときはフェードを出さない", () => {
      const { container, scroller } = setup();
      stubScrollMetrics(scroller, { scrollWidth: 300, clientWidth: 300, scrollLeft: 0 });
      fireScroll(scroller);
      expect(maskOf(container)).toBe("");
    });

    it("スクロール可能で先頭にいるときはフェードを出す", () => {
      const { container, scroller } = setup();
      stubScrollMetrics(scroller, { scrollWidth: 800, clientWidth: 300, scrollLeft: 0 });
      fireScroll(scroller);
      // 方向 (to right) / ストップ順 / 幅 (28px, mobile 版と同一) をまとめて固定する
      expect(maskOf(container)).toMatch(RIGHT_FADE_MASK);
    });

    it("中間位置 (先頭でも末尾でもない) でもフェードを出し続ける", () => {
      // これが無いと isAtEnd を `scrollLeft > 0` と誤実装しても全件 green になる。
      const { container, scroller } = setup();
      stubScrollMetrics(scroller, { scrollWidth: 800, clientWidth: 300, scrollLeft: 200 });
      fireScroll(scroller);
      expect(maskOf(container)).toMatch(RIGHT_FADE_MASK);
    });

    it("右端までスクロールしたらフェードを消す", () => {
      const { container, scroller } = setup();
      stubScrollMetrics(scroller, { scrollWidth: 800, clientWidth: 300, scrollLeft: 200 });
      fireScroll(scroller);
      expect(maskOf(container)).toMatch(RIGHT_FADE_MASK);

      stubScrollMetrics(scroller, { scrollWidth: 800, clientWidth: 300, scrollLeft: 500 });
      fireScroll(scroller);
      expect(maskOf(container)).toBe("");
    });

    it("1px しか溢れていないときはフェードを出さない", () => {
      // ★ 名前と実態の注記 (QA Phase B ミューテーション MUT-11 で判明):
      //   このケースは `isScrollable` の `+ 1` 許容を検証**できていない**。
      //   `+ 1` を外して `scrollWidth > clientWidth` にしても本ケースは緑のままになる。
      //   理由: scrollWidth - clientWidth === 1 のとき isAtEnd の
      //   `scrollLeft >= scrollWidth - clientWidth - 1` が scrollLeft=0 で常に true に
      //   なり、isScrollable がどちらでも next は false になるため。
      //   つまり `isScrollable` の +1 許容は isAtEnd の -1 に吸収されており、
      //   出力からは原理的に観測できない (実害の無い冗長なガード)。
      //   本ケースが担保しているのは「1px しか溢れていない行にフェードを出さない」
      //   というユーザーから見える結果の方だけである。
      const { container, scroller } = setup();
      stubScrollMetrics(scroller, { scrollWidth: 301, clientWidth: 300, scrollLeft: 0 });
      fireScroll(scroller);
      expect(maskOf(container)).toBe("");
    });
  });

  describe("[C-04] スクロールイベントを介さない再計測 (チップ増減)", () => {
    it("scroll を一度も発火させずに、チップが増えて溢れたらフェードが付く", () => {
      // 中核の設計判断: 毎レンダー後に測り直す effect (deps 無し / useLayoutEffect)。
      // これが無いと「距離を選んだら泳法チップが増えた」ケースでフェードが出ず、
      // ユーザーは横にスクロールできることに気づけない。
      // ミューテーション: この effect の deps を [] にすると本テストだけが赤くなる。
      const { rerender } = render(<ChipScrollRow data-testid="row-x">{CHIPS}</ChipScrollRow>);
      const container = screen.getByTestId("row-x");
      const scroller = scrollerOf(container);

      // 初期状態: 溢れていない
      stubScrollMetrics(scroller, { scrollWidth: 280, clientWidth: 300, scrollLeft: 0 });
      rerender(<ChipScrollRow data-testid="row-x">{CHIPS}</ChipScrollRow>);
      expect(maskOf(container), "溢れていないのにフェードが出ている").toBe("");

      // チップが増えて溢れた状態を作り、再レンダーのみで再計測されることを見る。
      // ★ fireScroll / ResizeObserver コールバックは一切使わない
      stubScrollMetrics(scroller, { scrollWidth: 900, clientWidth: 300, scrollLeft: 0 });
      rerender(
        <ChipScrollRow data-testid="row-x">
          {[...CHIPS, chip("chip-c", "200m"), chip("chip-d", "400m")]}
        </ChipScrollRow>,
      );

      expect(
        maskOf(container),
        "チップ増加で scrollWidth が変わってもフェードが再計算されていない",
      ).toMatch(RIGHT_FADE_MASK);
    });

    it("チップが減って溢れなくなったらフェードが消える (scroll 非依存)", () => {
      const many = [...CHIPS, chip("chip-c", "200m"), chip("chip-d", "400m")];
      const { rerender } = render(<ChipScrollRow data-testid="row-x">{many}</ChipScrollRow>);
      const container = screen.getByTestId("row-x");
      const scroller = scrollerOf(container);

      stubScrollMetrics(scroller, { scrollWidth: 900, clientWidth: 300, scrollLeft: 0 });
      rerender(<ChipScrollRow data-testid="row-x">{many}</ChipScrollRow>);
      expect(maskOf(container)).toMatch(RIGHT_FADE_MASK);

      stubScrollMetrics(scroller, { scrollWidth: 280, clientWidth: 300, scrollLeft: 0 });
      rerender(<ChipScrollRow data-testid="row-x">{CHIPS}</ChipScrollRow>);
      expect(maskOf(container), "チップ減少後もフェードが残っている").toBe("");
    });
  });

  describe("[C-05] ResizeObserver の購読・解除・コールバック", () => {
    /**
     * vitest.setup.ts のグローバルモックは observe/disconnect が no-op で、
     * コンストラクタに渡されたコールバックを捨ててしまう。
     * それだと `new ResizeObserver(updateFade)` を `new ResizeObserver(() => {})` に
     * 変えても全件 green になり、RO を持つ唯一の理由 (画面回転・ブレークポイント跨ぎ)
     * が丸ごと無検証になる。ここではコールバックを保持して手動で invoke する。
     */
    function stubResizeObserver() {
      const observe = vi.fn();
      const disconnect = vi.fn();
      const unobserve = vi.fn();
      const callbacks: ResizeObserverCallback[] = [];
      vi.stubGlobal(
        "ResizeObserver",
        vi.fn().mockImplementation((cb: ResizeObserverCallback) => {
          callbacks.push(cb);
          return { observe, unobserve, disconnect };
        }),
      );
      return { observe, unobserve, disconnect, callbacks };
    }

    it("リサイズ通知でフェードが再計算される (コールバックが updateFade に繋がっている)", () => {
      const { callbacks } = stubResizeObserver();
      render(<ChipScrollRow data-testid="row-x">{CHIPS}</ChipScrollRow>);
      const container = screen.getByTestId("row-x");
      const scroller = scrollerOf(container);

      expect(callbacks, "ResizeObserver にコールバックが渡されていない").toHaveLength(1);

      // 初期は溢れていない
      stubScrollMetrics(scroller, { scrollWidth: 280, clientWidth: 300, scrollLeft: 0 });
      act(() => {
        callbacks[0]!([], {} as ResizeObserver);
      });
      expect(maskOf(container), "溢れていないのにフェードが出ている").toBe("");

      // 画面が縮んで溢れた = リサイズ通知だけでフェードが出ること
      // (scroll イベントも再レンダーも起こさない)
      stubScrollMetrics(scroller, { scrollWidth: 900, clientWidth: 300, scrollLeft: 0 });
      act(() => {
        callbacks[0]!([], {} as ResizeObserver);
      });
      expect(
        maskOf(container),
        "リサイズ通知でフェードが再計算されていない (コールバックが繋がっていない)",
      ).toMatch(RIGHT_FADE_MASK);

      // 画面が広がって収まった = フェードが消えること
      stubScrollMetrics(scroller, { scrollWidth: 280, clientWidth: 300, scrollLeft: 0 });
      act(() => {
        callbacks[0]!([], {} as ResizeObserver);
      });
      expect(maskOf(container), "リサイズで収まってもフェードが残っている").toBe("");
    });

    it("マウントで observe し、アンマウントで disconnect する", () => {
      const { observe, disconnect } = stubResizeObserver();

      const { unmount } = render(<ChipScrollRow data-testid="row-x">{CHIPS}</ChipScrollRow>);
      expect(observe).toHaveBeenCalledTimes(1);
      // 監視対象は幅が変わる要素 (= スクロール容器か、それを含む外側)
      const container = screen.getByTestId("row-x");
      const observed = observe.mock.calls[0]![0] as HTMLElement;
      expect(container === observed || container.contains(observed)).toBe(true);
      expect(disconnect).not.toHaveBeenCalled();

      unmount();
      expect(disconnect).toHaveBeenCalledTimes(1);
    });
  });
});
