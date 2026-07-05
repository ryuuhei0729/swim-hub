'use client';

import { useEffect, useRef } from "react";
import { calcLapState, calcScrollRatio } from "./utils/lapProgressBarUtils";
import SwimmerIcon from "@/components/icons/SwimmerIcon";

/**
 * LP v4.2 ラッププログレスバー
 *
 * スクロール率 0–100% を「往路→ターン→復路」の往復レーンにマッピングする。
 * 99.5% 到達時に window.__stopStopwatch() を呼び出してストップウォッチを停止する。
 *
 * スイマーアイコンは SwimmerIcon コンポーネント (icon-rainbow の泳者+水面、currentColor)。
 * フォント依存なし・CSP 安全・バンドル肥大なし。
 * 装飾要素 (aria-hidden="true" role="presentation") のためアクセシビリティラベルは不要。
 *
 * パフォーマンス最適化 (LP v4.2):
 *   - scrollHeight / clientHeight はスクロール中に変化しないためマウント時 + resize 時にキャッシュ。
 *     スクロールハンドラ内では scrollTop (軽量) のみ読む → 強制リフロー撤廃。
 *   - rAF スロットル (ticking フラグ + single-rAF) で1フレーム1回に制限。
 *   - ResizeObserver で documentElement のサイズ変化を検知しキャッシュを更新。
 */
export default function LapProgressBar() {
  const bar1Ref = useRef<HTMLElement>(null);
  const bar2Ref = useRef<HTMLElement>(null);
  const swimmerRef = useRef<HTMLSpanElement>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    // SVG アイコンは即表示可能 (フォント待機不要)
    if (swimmerRef.current) {
      swimmerRef.current.classList.add("lp-swimmer-ready");
    }

    const el = document.documentElement;

    // scrollHeight / clientHeight キャッシュ (スクロール中は変化しない)
    let cachedScrollHeight = el.scrollHeight;
    let cachedClientHeight = el.clientHeight;

    const updateCache = () => {
      cachedScrollHeight = el.scrollHeight;
      cachedClientHeight = el.clientHeight;
    };

    const applyState = () => {
      const scrollTop = el.scrollTop;
      const ratio = calcScrollRatio(scrollTop, cachedScrollHeight, cachedClientHeight);
      const state = calcLapState(ratio);

      if (bar1Ref.current) bar1Ref.current.style.width = `${state.leg1Width}%`;
      if (bar2Ref.current) bar2Ref.current.style.width = `${state.leg2Width}%`;

      if (swimmerRef.current) {
        // FINISH 時はゴール壁へスナップ (復路なので左端 = 0%)
        const displayLeft = state.shouldStop ? 0 : state.swimmerLeft;
        swimmerRef.current.style.left = `${displayLeft}%`;
        if (state.isBack) {
          swimmerRef.current.classList.add("lp-swimmer-back");
        } else {
          swimmerRef.current.classList.remove("lp-swimmer-back");
        }
      }

      // shouldStop の判定:
      // キャッシュ誤差 (モバイルのアドレスバー開閉) でpctが99.5に届かないケースに対応するため、
      // 進捗が高い (ratio > 90) フレームのみ scrollHeight/clientHeight をその場で再読み込みし、
      // scrollTop + clientHeight >= scrollHeight - TOL (4px) を満たすかピクセル単位で検査する。
      // 常時 fresh 読みするとスクロール毎にreflowが発生するため、高進捗フレームのみに限定。
      const NEAR_BOTTOM_TOL = 4;
      const atBottom =
        state.shouldStop ||
        (ratio > 90 && scrollTop + el.clientHeight >= el.scrollHeight - NEAR_BOTTOM_TOL);

      if (atBottom && !stoppedRef.current) {
        stoppedRef.current = true;
        if (typeof window.__stopStopwatch === "function") {
          window.__stopStopwatch();
        }
      }
    };

    // rAF スロットル: 1フレームに1回だけ applyState を実行する
    let ticking = false;
    let rafId = 0;

    const onScroll = () => {
      if (!ticking) {
        rafId = requestAnimationFrame(() => {
          applyState();
          ticking = false;
        });
        ticking = true;
      }
    };

    // ResizeObserver: documentElement のサイズ変化でキャッシュを更新
    const resizeObserver = new ResizeObserver(() => {
      updateCache();
      applyState();
    });
    resizeObserver.observe(el);

    // window resize: PC ウィンドウリサイズ対応
    const onWindowResize = () => {
      updateCache();
      applyState();
    };
    window.addEventListener("resize", onWindowResize, { passive: true });

    // visualViewport resize/scroll: モバイルのアドレスバー開閉による viewport 変化を拾う
    // ResizeObserver が documentElement コンテンツサイズの変化を取りこぼす場合の補完。
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (vv) {
      vv.addEventListener("resize", onWindowResize);
      vv.addEventListener("scroll", onWindowResize);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    applyState(); // 初期状態を設定

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onWindowResize);
      if (vv) {
        vv.removeEventListener("resize", onWindowResize);
        vv.removeEventListener("scroll", onWindowResize);
      }
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div
      className="lp-lap-progress"
      aria-hidden="true"
      role="presentation"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: -11,
        height: 24,
        pointerEvents: "none",
        zIndex: 3,
      }}
    >
      {/* レーンライン (破線) */}
      <span
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 11,
          height: 1,
          background: `repeating-linear-gradient(90deg, var(--lp-line) 0 12px, transparent 12px 24px)`,
        }}
      />
      {/* 往路バー */}
      <i
        ref={bar1Ref}
        id="lap-bar"
        style={{
          position: "absolute",
          top: 6,
          left: 0,
          height: 3,
          width: "0%",
          background: "var(--lp-royal)",
        }}
      />
      {/* 復路バー (右アンカー) */}
      <i
        ref={bar2Ref}
        id="lap-bar2"
        style={{
          position: "absolute",
          top: 15,
          right: 0,
          height: 3,
          width: "0%",
          background: "var(--lp-royal)",
        }}
      />
      {/* スイマーアイコン (インライン SVG) */}
      <span
        ref={swimmerRef}
        id="lap-swimmer"
        style={{
          position: "absolute",
          left: 0,
          top: -3,
          marginLeft: -10,
          visibility: "hidden",
          display: "inline-flex",
          alignItems: "center",
          color: "var(--lp-royal)",
          userSelect: "none",
        }}
      >
        <SwimmerIcon width={20} height={20} />
      </span>
      <style>{`
        /* スイマー visible/back/bob アニメーション */
        .lp-swimmer-ready { visibility: visible !important; }
        .lp-swimmer-back  { top: 6px !important; transform: scaleX(-1); }
        @media (prefers-reduced-motion: no-preference) {
          #lap-swimmer:not(.lp-swimmer-back) {
            animation: lpSwimBob 0.9s ease-in-out infinite;
          }
          #lap-swimmer.lp-swimmer-back {
            animation: lpSwimBobBack 0.9s ease-in-out infinite;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          #lap-swimmer { animation: none !important; }
        }
        /* scaleX(-1) は span に対して適用済み。内部 SVG は transform 不要。 */
      `}</style>
    </div>
  );
}
