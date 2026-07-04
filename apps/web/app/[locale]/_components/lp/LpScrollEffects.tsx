'use client';

import { useEffect } from "react";

// §6.6 スクロールリベール: IntersectionObserver で .rv 要素を監視し、
//       ビューポート進入で .in クラスを付与。2秒の安全タイマーで強制 reveal。
// §6.4 パララックス: scroll イベント駆動 + single-rAF throttle。
//       [data-plx-x] / [data-plx-y] 要素に translate を適用。
//       data-plx-base で base transform を保持し、既存 transform を上書きしない。
export default function LpScrollEffects() {
  useEffect(() => {
    // リロード時に常に最上部から表示する。
    // ブラウザのスクロール復元に任せると scrollY > 0 の状態でマウントされ、
    // LpStopwatch が即 LIVE 遷移してしまうのを防ぐ。
    try {
      if ("scrollRestoration" in history) {
        history.scrollRestoration = "manual";
      }
      window.scrollTo(0, 0);
    } catch { /* scrollRestoration 未対応ブラウザは無視 */ }

    const motionOk = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // --------------------------------------------------------
    // §6.6 スクロールリベール
    // --------------------------------------------------------
    const setupReveal = () => {
      const els = document.querySelectorAll<HTMLElement>(".rv");
      if (!els.length) return;

      if (!motionOk) {
        els.forEach((el) => el.classList.add("in"));
        return;
      }

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("in");
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
      );

      els.forEach((el) => observer.observe(el));

      // 安全タイマー: 2秒後に未表示の要素を強制表示
      const timer = setTimeout(() => {
        document.querySelectorAll<HTMLElement>(".rv:not(.in)").forEach((el) =>
          el.classList.add("in")
        );
      }, 2000);

      return () => {
        observer.disconnect();
        clearTimeout(timer);
      };
    };

    const cleanupReveal = setupReveal();

    // --------------------------------------------------------
    // §6.4 パララックス (scroll 駆動 + single-rAF throttle)
    //
    // パフォーマンス最適化 (LP v4.2):
    //   各要素のドキュメント基準中心位置 (docCenter) をマウント時と resize 時にキャッシュ。
    //   スクロールハンドラ内では window.scrollY (レイアウト非強制) のみ使用し、
    //   getBoundingClientRect() の毎フレーム呼び出しを撤廃 → 強制リフロー解消。
    //
    //   計測の正規化:
    //   - 初回・resize 再計測の両方で measureEntries() を呼ぶ。
    //   - measureEntries() は各要素の transform を base のみの状態に戻してから
    //     getBoundingClientRect() を呼ぶ。これにより過去のパララックスオフセットや
    //     未適用の translate が残った状態での誤計測を防ぐ。
    //   - ghost 要素 (data-plx-base="translateY(-50%)") は base を適用した状態
    //     (translateY(-50%) 込み) で計測する = パララックスオフセットのみを除いた
    //     「素の配置位置」を一貫して取得する。
    //
    //   数値同値の確認:
    //   旧来の毎フレーム計算: offset = ((rect.top + height/2) - vh/2) * factor
    //     ここで rect.top + height/2 = base 適用時の viewport 上の中心 Y
    //                                 = docCenter - scrollY
    //   キャッシュ後の計算:  offset = ((docCenter - scrollY) - vh/2) * factor
    //   両者は代数的に同値。ghost の translateY(-50%) は base として計測に含まれるため、
    //   従来と同じ Y 座標を docCenter に反映できる。
    // --------------------------------------------------------
    let plxRafId = 0;
    let resizeRafId = 0;
    const cleanupPlx = (() => {
      if (!motionOk) return undefined;

      type PlxEntry = {
        el: HTMLElement;
        factor: number;
        base: string;
        axis: "x" | "y";
        /** ドキュメント基準の要素中心 Y 座標 (px)。base transform のみ適用した状態で計測 */
        docCenter: number;
      };

      const plxXEls = Array.from(document.querySelectorAll<HTMLElement>("[data-plx-x]"));
      const plxYEls = Array.from(document.querySelectorAll<HTMLElement>("[data-plx-y]"));
      if (!plxXEls.length && !plxYEls.length) return undefined;

      // エントリ配列を構築 (docCenter は measureEntries() で設定する)
      const entries: PlxEntry[] = [
        ...plxXEls.map((el) => ({
          el,
          factor: parseFloat(el.dataset.plxX ?? "0"),
          base: el.dataset.plxBase ?? "",
          axis: "x" as const,
          docCenter: 0,
        })),
        ...plxYEls.map((el) => ({
          el,
          factor: parseFloat(el.dataset.plxY ?? "0"),
          base: el.dataset.plxBase ?? "",
          axis: "y" as const,
          docCenter: 0,
        })),
      ];

      // 計測共通パス: base のみ適用 → getBoundingClientRect → docCenter キャッシュ更新。
      // 初回・resize 再計測の両方で呼ぶことで同じ正規化を保証する。
      const measureEntries = () => {
        // Step 1: 全要素を base 状態に正規化 (パララックスオフセットを除去)
        entries.forEach((entry) => {
          entry.el.style.transform = entry.base || "";
        });
        // Step 2: 正規化後にまとめて計測 (読み書き分離でスラッシング回避)
        entries.forEach((entry) => {
          const rect = entry.el.getBoundingClientRect();
          entry.docCenter = rect.top + rect.height / 2 + window.scrollY;
        });
      };

      let vh = window.innerHeight;

      // スクロール中は scrollY のみ読む (getBoundingClientRect なし)
      const update = (scrollY: number) => {
        entries.forEach((entry) => {
          const offset = (entry.docCenter - scrollY - vh / 2) * entry.factor;
          entry.el.style.transform = entry.base
            ? `${entry.base} translate${entry.axis.toUpperCase()}(${offset.toFixed(2)}px)`
            : `translate${entry.axis.toUpperCase()}(${offset.toFixed(2)}px)`;
        });
      };

      let ticking = false;
      const onScroll = () => {
        if (!ticking) {
          plxRafId = requestAnimationFrame(() => {
            update(window.scrollY);
            ticking = false;
          });
          ticking = true;
        }
      };

      // resize 時: single-rAF スロットルで連続 resize 中のスラッシングを防ぐ。
      // measureEntries() → update() の順で再計測 → 再描画する。
      let resizeTicking = false;
      const onResize = () => {
        if (!resizeTicking) {
          resizeRafId = requestAnimationFrame(() => {
            vh = window.innerHeight;
            measureEntries();
            update(window.scrollY);
            resizeTicking = false;
          });
          resizeTicking = true;
        }
      };

      // 初回計測: measureEntries() で base 正規化 → docCenter キャッシュ設定
      measureEntries();
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onResize, { passive: true });
      update(window.scrollY); // 初回描画

      return () => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onResize);
        cancelAnimationFrame(plxRafId);
        cancelAnimationFrame(resizeRafId);
      };
    })();

    return () => {
      cleanupReveal?.();
      cleanupPlx?.();
    };
  }, []);

  return (
    <style>{`
      /* §6.6 スクロールリベール — ベーススタイル */
      .rv {
        opacity: 0;
        transform: translateY(18px);
        transition: opacity 0.9s ease, transform 0.9s ease;
      }
      .rv.in {
        opacity: 1;
        transform: translateY(0);
      }
      /* reduced-motion: アニメなし (即最終状態) */
      @media (prefers-reduced-motion: reduce) {
        .rv {
          opacity: 1 !important;
          transform: none !important;
          transition: none !important;
        }
      }
    `}</style>
  );
}
