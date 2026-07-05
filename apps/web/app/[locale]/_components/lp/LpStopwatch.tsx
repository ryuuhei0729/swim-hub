'use client';

import { useEffect, useRef, useState, useCallback } from "react";
import { transitionStopwatch, formatStopwatchTime, type StopwatchState } from "./utils/stopwatchUtils";

interface LpStopwatchProps {
  ariaLabel?: string;
}

/**
 * LP v4.2 ストップウォッチ (右上固定・7セグ表示)
 *
 * 状態遷移:
 *   READY → 最初のスクロール (scrollY > 8) → LIVE
 *   LIVE  → window.__stopStopwatch() 呼び出し → FINISH
 *
 * DSEG7Classic フォントで ice 色の LED 風表示。
 * prefers-reduced-motion: reduce のときはアニメーションさせず READY (00:00.00) のまま静止表示する。
 */
export default function LpStopwatch({ ariaLabel }: LpStopwatchProps) {
  const [state, setState] = useState<StopwatchState>({ status: "READY", elapsedMs: 0 });
  const [displayTime, setDisplayTime] = useState("00:00.00");
  const stateRef = useRef<StopwatchState>({ status: "READY", elapsedMs: 0 });
  const t0Ref = useRef<number>(0);
  const ivRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reducedMotion = useRef(false);

  const stopWatch = useCallback(() => {
    if (stateRef.current.status !== "LIVE") return;
    const now = performance.now();
    const elapsed = now - t0Ref.current;
    const next = transitionStopwatch(stateRef.current, "STOP", now, t0Ref.current);
    stateRef.current = next;
    setState(next);
    setDisplayTime(formatStopwatchTime(elapsed));
    if (ivRef.current) clearInterval(ivRef.current);
  }, []);

  useEffect(() => {
    // reduced-motion: アニメーションさせず READY (00:00.00) のまま静止表示
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      reducedMotion.current = true;
      return;
    }

    // window.__stopStopwatch を登録
    window.__stopStopwatch = stopWatch;

    const onFirstScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      if (scrollY > 8 && stateRef.current.status === "READY") {
        const now = performance.now();
        t0Ref.current = now;
        const next = transitionStopwatch(stateRef.current, "START", now);
        stateRef.current = next;
        setState(next);
        ivRef.current = setInterval(() => {
          if (stateRef.current.status !== "LIVE") return;
          const elapsed = performance.now() - t0Ref.current;
          setDisplayTime(formatStopwatchTime(elapsed));
        }, 47);
        window.removeEventListener("scroll", onFirstScroll);
      }
    };

    window.addEventListener("scroll", onFirstScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onFirstScroll);
      if (ivRef.current) clearInterval(ivRef.current);
      // クリーンアップ時は __stopStopwatch を解除しない (他で参照されている可能性)
    };
  }, [stopWatch]);

  const isDone = state.status === "FINISH";
  const label = state.status === "READY" ? "READY" : isDone ? "FINISH" : "LIVE";

  return (
    <div
      id="stopwatch"
      aria-label={ariaLabel ?? "ページ滞在タイム"}
      style={{
        position: "fixed",
        top: 90,
        right: 18,
        zIndex: 45,
        display: "flex",
        alignItems: "baseline",
        gap: 10,
        background: "rgba(11,20,36,0.9)",
        color: "var(--lp-w-white)",
        border: `1px solid ${isDone ? "var(--lp-ice)" : "var(--lp-w-line-strong)"}`,
        padding: "10px 18px",
        boxShadow: "0 14px 30px -16px rgba(11,20,36,0.4)",
      }}
    >
      {/* 点滅ドット */}
      <span
        style={{
          width: 7,
          height: 7,
          background: "var(--lp-ice)",
          transform: "rotate(45deg)",
          flexShrink: 0,
          // baseline 揃えコンテナ内でドットだけ自身を中央に保つ
          alignSelf: "center",
          animation: isDone || reducedMotion.current ? "none" : "lpDecoBlink 1.2s steps(2,end) infinite",
        }}
      />
      {/* ラベル */}
      <span
        style={{
          fontFamily: "var(--font-josefin-sans), sans-serif",
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.3em",
          color: "var(--lp-ice)",
          textTransform: "uppercase",
          lineHeight: 1,
        }}
      >
        {label}
      </span>
      {/* 7セグ表示
          コンテナが align-items:baseline のため、ラベル文字下端と数字下端が自動的に揃う。
          DSEG7 はディセンダがほぼ無いため baseline=数字下端となり下端が一致して見える。
          translateY は撤去済み(下がり過ぎの原因)。微調整が必要なら translateY(-0.5px) 方向で。
          要QA目視確認: LIVE/FINISH 全状態で下端の揃いを確認すること。 */}
      <span style={{ position: "relative", display: "inline-block", lineHeight: 1 }}>
        {/* ゴーストセグメント */}
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            fontFamily: "'DSEG7Classic', monospace",
            fontStyle: "italic",
            fontWeight: 700,
            fontSize: 14,
            lineHeight: 1,
            color: "var(--lp-ice)",
            opacity: 0.2,
            userSelect: "none",
          }}
        >
          88:88.88
        </span>
        {/* 実際の時刻 */}
        <span
          id="sw-time"
          style={{
            position: "relative",
            fontFamily: "'DSEG7Classic', monospace",
            fontStyle: "italic",
            fontWeight: 700,
            fontSize: 14,
            lineHeight: 1,
            color: "var(--lp-ice)",
          }}
        >
          {displayTime}
        </span>
      </span>
      <style>{`
        @media (max-width: 560px) {
          #stopwatch { right: 10px !important; padding: 8px 12px !important; gap: 7px !important; }
          #stopwatch #sw-time, #stopwatch [aria-hidden="true"] { font-size: 12px !important; }
        }
      `}</style>
    </div>
  );
}
