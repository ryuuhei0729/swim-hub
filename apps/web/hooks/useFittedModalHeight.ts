"use client";

import { useLayoutEffect, useRef, useState } from "react";

interface FittedHeight {
  /** カードに与える高さ(px)。中身の高さと、画面に収まる上限の小さい方。 */
  height: number;
  /** 中身が上限を超えていて、本文をスクロールさせる必要があるか。 */
  capped: boolean;
}

/**
 * 中央モーダルのカードを「中身の高さ、ただし画面に収まる上限まで」に合わせる。
 *
 * CSS だけ(height:auto + max-height)でも大きさは合うが、非同期に中身が読み込まれて
 * 高さが変わるたびにカードが一瞬で跳ねる。height:auto は transition できないため、
 * 中身を実測して px で指定し、その値を transition させる。
 *
 * 使い方: container(画面いっぱいの余白付きラッパー) / card / header / content(スクロール領域の
 * 内側) / footer に ref を付ける。header・content・footer は「固定部 + 本文 + 固定部」の
 * 自然な高さを足し合わせるために使う。
 *
 * ResizeObserver が無い環境やレイアウトが取れない環境(jsdom)では null を返すので、
 * 呼び出し側は CSS の max-height だけで成立するフォールバックを持っておくこと。
 */
export function useFittedModalHeight(active: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const [fitted, setFitted] = useState<FittedHeight | null>(null);
  // 開いた瞬間の最初の採寸はアニメーションさせない(0 から伸びて見えるのを防ぐ)。
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    const card = cardRef.current;
    const parts = [headerRef.current, contentRef.current, footerRef.current];
    if (!container || !card) return;

    const measure = () => {
      const containerStyle = window.getComputedStyle(container);
      const available =
        container.clientHeight -
        (parseFloat(containerStyle.paddingTop) || 0) -
        (parseFloat(containerStyle.paddingBottom) || 0);
      const border = card.offsetHeight - card.clientHeight;
      const natural = parts.reduce((sum, el) => sum + (el?.offsetHeight ?? 0), 0) + border;
      if (!(available > 0) || !(natural > border)) return;

      const next = {
        height: Math.min(natural, available),
        capped: natural > available,
      };
      setFitted((prev) =>
        prev && prev.height === next.height && prev.capped === next.capped ? prev : next,
      );
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    for (const el of parts) {
      if (el) observer.observe(el);
    }
    const frame = window.requestAnimationFrame(() => setAnimate(true));

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      // 次に開いたとき、前回の高さから伸縮して見えないようにする。
      setFitted(null);
      setAnimate(false);
    };
  }, [active]);

  return {
    containerRef,
    cardRef,
    headerRef,
    contentRef,
    footerRef,
    fitted,
    animate,
  };
}
