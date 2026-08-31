/**
 * Sprint Contract 再検証 (Phase B 修正ラウンド, Reviewer Critical指摘対応):
 * resolveSafeLocalRedirect のユニットテスト
 *
 * 背景: stripLocale は1レイヤーしか剥がさない純関数であり、二重 locale
 * (/ja/ja/dashboard 等) を1回の適用では剥がし切れない。バグ1 (二重 locale
 * プレフィックス404) の再現URLそのものが redirect_to として渡された場合に
 * 同じ404が再発するのを防ぐため、剥がし切るまで繰り返してから
 * getSafeRedirectUrl で検証する専用の純関数 resolveSafeLocalRedirect が
 * 新設された (utils/localeRedirect.ts)。
 *
 * このファイルはコンポーネントを描画せず、purely な関数として直接検証する。
 * 3箇所の呼び出し側 (login/page.tsx 等) の component テストは
 * __tests__/auth/loginRedirectLocaleStrip.test.tsx が別途担う。
 *
 * 順序の安全性 (stripLocale → getSafeRedirectUrl) 自体は
 * __tests__/auth/loginRedirectLocaleStrip.test.tsx の
 * オープンリダイレクト防御ブロックで検証済みのため、ここでは
 * 「剥がし切る」動作 (二重 locale・境界値・非 locale 類似パス) にフォーカスする。
 */

import { describe, expect, it } from "vitest";
import { resolveSafeLocalRedirect } from "@/utils/localeRedirect";

describe("resolveSafeLocalRedirect", () => {
  // ----------------------------------------------------------------
  // 境界値: null / locale無しの正当なパス (非退行)
  // ----------------------------------------------------------------
  describe("境界値・非退行", () => {
    it("null → /dashboard", () => {
      expect(resolveSafeLocalRedirect(null)).toBe("/dashboard");
    });

    it("/dashboard (locale無し) → /dashboard のまま", () => {
      expect(resolveSafeLocalRedirect("/dashboard")).toBe("/dashboard");
    });

    it("/ja/dashboard (locale1層) → /dashboard", () => {
      expect(resolveSafeLocalRedirect("/ja/dashboard")).toBe("/dashboard");
    });
  });

  // ----------------------------------------------------------------
  // 🔴 二重 locale: 剥がし切るまで繰り返すことの核心
  // ----------------------------------------------------------------
  describe("🔴 二重 locale (/ja/ja/...) は剥がし切って /dashboard に収束する", () => {
    it("/ja/ja/dashboard → /dashboard (完全一致。/ja/dashboard で止まらない)", () => {
      expect(resolveSafeLocalRedirect("/ja/ja/dashboard")).toBe("/dashboard");
      expect(resolveSafeLocalRedirect("/ja/ja/dashboard")).not.toBe("/ja/dashboard");
    });

    it("/ja/ja//evil.com (多層 + プロトコル相対の複合) → /dashboard", () => {
      const result = resolveSafeLocalRedirect("/ja/ja//evil.com");
      expect(result).toBe("/dashboard");
      expect(result).not.toBe("//evil.com");
      expect(result).not.toBe("/ja//evil.com");
      expect(result).not.toBe("/ja/ja//evil.com");
    });

    it("/ja/ja (locale2層単体) → 剥がし切ると / に収束する (非攻撃の境界値)", () => {
      expect(resolveSafeLocalRedirect("/ja/ja")).toBe("/");
    });

    it("/en/en/mypage (他localeの二重) → /mypage", () => {
      expect(resolveSafeLocalRedirect("/en/en/mypage")).toBe("/mypage");
    });
  });

  // ----------------------------------------------------------------
  // locale と類似するが実際は locale ではないパスを誤って削らないこと
  // ----------------------------------------------------------------
  describe("locale 類似の非 locale パスは誤って削られない", () => {
    it("/jazz/foo (先頭が 'ja' で始まるが locale ではない) → そのまま /jazz/foo", () => {
      expect(resolveSafeLocalRedirect("/jazz/foo")).toBe("/jazz/foo");
    });

    it("/english/settings ('en' で始まるが locale ではない) → そのまま /english/settings", () => {
      expect(resolveSafeLocalRedirect("/english/settings")).toBe("/english/settings");
    });
  });

  // ----------------------------------------------------------------
  // 既知の挙動: 大文字 locale は剥がされない (stripLocale は大文字小文字を
  // 区別する既存実装のまま)。ここでは「まだ直っていないバグ」ではなく
  // 「現状の既知の挙動」として固定する (将来の意図しない変更を検出するガード)。
  // ----------------------------------------------------------------
  describe("既知の挙動: 大文字 locale は剥がされない", () => {
    it("/JA/dashboard (大文字) → 剥がされずそのまま /JA/dashboard", () => {
      expect(resolveSafeLocalRedirect("/JA/dashboard")).toBe("/JA/dashboard");
    });
  });

  // ----------------------------------------------------------------
  // 🔴 追加 (Phase B 再検証, Web Dev → QA への計算量確認依頼への回答):
  // resolveSafeLocalRedirect の for(;;) ループは「剥がせるだけ剥がす」
  // アンバウンドなループのため、極端に深い locale チェーン
  // (/ja/ja/ja/.../dashboard) を渡されたときに無限ループ・スタックオーバーフロー
  // を起こさず、線形時間で収束することを実測する。
  // ----------------------------------------------------------------
  describe("🔴 計算量: 極端に深い locale チェーンでも線形時間で収束し無限ループしない", () => {
    function buildDeepLocaleChain(depth: number): string {
      return "/" + Array(depth).fill("ja").join("/") + "/dashboard";
    }

    it("locale が1000重に連結された入力でも同期的に完了し、結果は /dashboard に収束する", () => {
      const input = buildDeepLocaleChain(1000);
      const start = performance.now();
      const result = resolveSafeLocalRedirect(input);
      const elapsed = performance.now() - start;
      console.log(`[perf] depth=1000 inputLen=${input.length} elapsed=${elapsed.toFixed(3)}ms`);
      expect(result).toBe("/dashboard");
      expect(elapsed).toBeLessThan(500); // 極端に遅くないこと (無限ループ化していないことのガード)
    });

    it("locale が100,000重に連結された巨大入力でも無限ループせず同期的に完了する (スタックオーバーフローもしない)", () => {
      const input = buildDeepLocaleChain(100_000);
      const start = performance.now();
      let result: string | undefined;
      expect(() => {
        result = resolveSafeLocalRedirect(input);
      }).not.toThrow();
      const elapsed = performance.now() - start;
      console.log(`[perf] depth=100000 inputLen=${input.length} elapsed=${elapsed.toFixed(3)}ms`);
      expect(result).toBe("/dashboard");
      // ループ回数(100,000)に比例する程度で完了すること。指数的/無限ループなら
      // このテスト自体がタイムアウトする (vitest のデフォルトテストタイムアウトで検出される)。
      expect(elapsed).toBeLessThan(5000);
    });

    it("線形性の確認: depth を10倍にしても所要時間が桁違いに増大しない (指数的悪化の検出)", () => {
      const small = buildDeepLocaleChain(1_000);
      const large = buildDeepLocaleChain(10_000);

      const t1 = performance.now();
      resolveSafeLocalRedirect(small);
      const smallElapsed = performance.now() - t1;

      const t2 = performance.now();
      resolveSafeLocalRedirect(large);
      const largeElapsed = performance.now() - t2;

      console.log(
        `[perf] small(depth=1000)=${smallElapsed.toFixed(3)}ms large(depth=10000)=${largeElapsed.toFixed(3)}ms ratio=${(largeElapsed / Math.max(smallElapsed, 0.001)).toFixed(2)}`,
      );
      // 線形なら概ね10倍程度で収まるはず。指数的悪化なら桁違いに大きくなる。
      // 測定誤差(GC・JIT等)を考慮し、余裕を持って100倍未満をガードラインとする。
      expect(largeElapsed).toBeLessThan(Math.max(smallElapsed, 1) * 100);
    });
  });
});
