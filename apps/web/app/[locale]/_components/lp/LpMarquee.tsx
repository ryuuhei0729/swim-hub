'use client';

import React, { useEffect, useRef, useState } from "react";

interface LpMarqueeProps {
  /** マーキーのテキスト (◆ 区切りの繰り返し) */
  items: string[];
  /** ライトテーマ (白背景・右流れ) */
  light?: boolean;
}

const ITEMS_DARK = ["Practice Log", "Race Result", "Proxy Entry", "AI Scanner", "Best Times"];
const ITEMS_LIGHT = ["Join The Team", "Free Sign-Up", "Records For Life", "SwimHub"];

// ビューポートをカバーするために必要なセグメント最小枚数 (安全側の定数)
// 動的計算前のサーバー/初期レンダリング用の最低値。rAF ループ内で必要に応じて増やす。
const MIN_SEGMENTS = 4;

/**
 * LP v4.2 マーキー帯
 *
 * prefers-reduced-motion: no-preference のとき rAF 駆動 (JS-driven)。
 * reduce のとき CSS animation lpMqDeco にフォールバック (3セグメントで常時充填)。
 *
 * 空白防止の原則:
 *   オフセット t を常に [0, segW) に正規化し、translateX(-t) を適用 (left-scroll)。
 *   → t=0 でトラック先頭がビューポート左端: 常に左端が埋まる。
 *   → t=segW-1 でトラックが1セグメント分左にずれ: 2セグメント以上あれば右端も埋まる。
 *
 * 向きの制御:
 *   dark: t を 0→segW 方向に増加 → 左流れ (コンテンツが左に流れる)
 *   light: t を segW→0 方向に減少 → 右流れ (コンテンツが右に流れる)
 *   どちらも translateX(-t) を使うので先頭より左は露出しない。
 *
 * 充填枚数:
 *   segW が判明した時点で Math.ceil(vw / segW) + 2 枚に動的更新。
 *   リセット周期は segW 単位のまま。
 */
export default function LpMarquee({ items, light = false }: LpMarqueeProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  // 正規化オフセット: 常に [0, segW) の範囲。増加方向 = left-scroll。
  const tRef = useRef(0);
  const velRef = useRef(0);
  const lastScrollYRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  // セグメント1枚幅のキャッシュ
  const segWRef = useRef(0);

  // セグメント枚数を state で管理 (動的充填のため)
  const [segCount, setSegCount] = useState(MIN_SEGMENTS);

  // CSS animation フォールバック用クラスを JS 駆動時に除去
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const track = trackRef.current;
    if (!track) return;

    // CSS アニメーションを無効化してJS駆動に切り替え
    track.classList.add("lp-mq-js-drive");

    const BASE_SPEED = 0.45;

    // セグメント1枚幅を計測し、必要枚数を更新する
    const measureAndRefill = () => {
      // track.scrollWidth = segW * segCount なので segW = scrollWidth / segCount
      const totalW = track.scrollWidth;
      const count = track.children.length;
      if (count <= 0 || totalW <= 0) return;
      const sw = totalW / count;
      segWRef.current = sw;

      // ビューポート幅 + セグメント1枚 をカバーできる枚数 (最低 MIN_SEGMENTS)
      const needed = Math.max(MIN_SEGMENTS, Math.ceil(window.innerWidth / sw) + 2);
      if (needed !== count) {
        setSegCount(needed);
      }
    };

    measureAndRefill();
    // フォントロード後に再計測 (Poiret One ロード前は scrollWidth が不正確な場合がある)
    if (typeof document !== "undefined" && document.fonts) {
      document.fonts.ready.then(() => measureAndRefill());
    }

    // ResizeObserver で幅変化時のみ再計測
    const ro = new ResizeObserver(measureAndRefill);
    ro.observe(track);

    const onScroll = () => {
      const sy = window.scrollY;
      velRef.current = sy - lastScrollYRef.current;
      lastScrollYRef.current = sy;
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const loop = () => {
      const segW = segWRef.current;
      // フォント未ロード等で segW=0 の間はスキップ
      if (segW <= 0) { rafRef.current = requestAnimationFrame(loop); return; }

      const speed = BASE_SPEED + Math.min(Math.abs(velRef.current) * 0.22, 5);

      // dark: tRef を増加 (左流れ)
      // light: tRef を減少 (右流れ)
      if (light) {
        tRef.current -= speed;
      } else {
        tRef.current += speed;
      }

      // [0, segW) に正規化 (常に先頭より左を露出しない)
      tRef.current = ((tRef.current % segW) + segW) % segW;

      // translateX(-t): t=0 でトラック先頭がビューポート左端に完全に収まる
      track.style.transform = `translateX(${-tRef.current}px)`;

      // skewX で速度感
      const skew = Math.min(Math.abs(velRef.current) * 0.4, 10) * (velRef.current >= 0 ? -1 : 1);
      track.style.setProperty("--lp-mq-skew", `${skew}deg`);

      // 速度の減衰
      velRef.current *= 0.85;
      rafRef.current = requestAnimationFrame(loop);
    };

    // --- IntersectionObserver でビューポート外は rAF 停止 ---
    const startLoop = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(loop);
    };

    const stopLoop = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          startLoop();
        } else {
          stopLoop();
        }
      },
      { threshold: 0 }
    );
    io.observe(track);

    return () => {
      window.removeEventListener("scroll", onScroll);
      stopLoop();
      ro.disconnect();
      io.disconnect();
    };
  }, [light]);

  const segItems = items.length > 0 ? items : light ? ITEMS_LIGHT : ITEMS_DARK;

  const Segment = ({ idx }: { idx: number }) => (
    <div
      key={idx}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "clamp(26px, 3.4vw, 44px)",
        paddingRight: "clamp(26px, 3.4vw, 44px)",
        fontFamily: "var(--font-poiret-one, cursive)",
        fontSize: "clamp(16px, 2.3vw, 23px)",
        letterSpacing: "0.16em",
        textTransform: "uppercase" as const,
        whiteSpace: "nowrap" as const,
      }}
    >
      {segItems.map((item, i) => (
        <span key={i}>
          {item}
          {i < segItems.length - 1 && (
            <span
              style={{
                color: light ? "var(--lp-royal)" : "var(--lp-ice)",
                fontSize: 11,
                marginLeft: "clamp(26px, 3.4vw, 44px)",
              }}
            >
              ◆
            </span>
          )}
        </span>
      ))}
    </div>
  );

  return (
    <div
      aria-hidden="true"
      style={{
        background: light ? "var(--lp-panel)" : "var(--lp-navy)",
        color: light ? "var(--lp-navy)" : "var(--lp-w-white)",
        overflow: "hidden",
        padding: "16px 0",
        borderTop: "1px solid var(--lp-line)",
        borderBottom: "1px solid var(--lp-line)",
      }}
    >
      <div
        ref={trackRef}
        style={{
          display: "flex",
          width: "max-content",
          // CSS アニメーション (reduced-motion フォールバック)
          // 3セグメント以上でトラック長をビューポート幅に対して十分確保し、
          // -33.33% (-1セグメント) だけ translateX して 2セグメント目から始める。
          // lpMqDecoFill が 0%→-33.33% でループする (keyframes は globals.css 側)。
          animationName: "lpMqDeco",
          animationDuration: "64s",
          animationTimingFunction: "linear",
          animationIterationCount: "infinite",
          animationDirection: light ? "reverse" : "normal",
        } as React.CSSProperties}
        className={`lp-marquee-track${light ? " lp-marquee-light-track" : ""}`}
      >
        {Array.from({ length: segCount }, (_, i) => (
          <Segment key={i} idx={i} />
        ))}
      </div>
      <style>{`
        .lp-mq-js-drive {
          animation: none !important;
          transform-origin: center;
        }
        @media (prefers-reduced-motion: reduce) {
          /*
           * CSS フォールバック: ${MIN_SEGMENTS}枚セグメントで常時充填。
           * lpMqDeco は 0 → -25% (1/4 = セグメント1枚幅) をループ。
           * 任意枚数 n に対して -100/n % 移動で1セグメント分左スクロール。
           * MIN_SEGMENTS=4 のとき -25% で1枚ループ。
           */
          .lp-marquee-track {
            animation: lpMqDecoFill 64s linear infinite !important;
          }
          .lp-marquee-light-track {
            animation-direction: reverse !important;
          }
        }
        @keyframes lpMqDecoFill {
          from { transform: translateX(0); }
          to   { transform: translateX(-25%); }
        }
      `}</style>
    </div>
  );
}
