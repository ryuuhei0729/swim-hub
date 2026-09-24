"use client";

import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/utils/cn";

/** 右端フェードの幅。mobile 版 (apps/mobile/components/ui/ChipScrollRow.tsx) と同一 */
const EDGE_FADE_WIDTH_PX = 28;

const FADE_MASK = `linear-gradient(to right, #000 calc(100% - ${EDGE_FADE_WIDTH_PX}px), transparent)`;

interface ChipScrollRowProps {
  children: React.ReactNode;
  /** gap など行固有のクラス。flex / overflow / 折り返しの基本形は本コンポーネントが持つ */
  className?: string;
  role?: React.AriaRole;
  "data-testid"?: string;
}

/**
 * チップ行のレイアウト容器。
 * sm 未満: 1行の横スクロール。スクロール余地が残っている間だけ右端をフェードさせる。
 * sm 以上: flex-wrap + overflow visible で従来の折り返し表示に復帰する。
 *
 * フェードは背景色に依存しない mask-image で描く。呼び出し元の背景が
 * 白 / gray-50 / green-50 と可変なため、ベタ塗りグラデーションは使えない。
 *
 * DOM が2段になっている理由 (外側ラッパーを削るな):
 * スクロール容器は focus:ring-2 の上下クリップを避けるため `py-1 -my-1` を持つ。
 * Tailwind v4 の `space-y-*` は `:where()` でゼロ特異度に出力される
 * (`:where(.space-y-1\.5 > :not(:last-child)){margin-block-end:...}`) ため、
 * この `-my-1` / `sm:my-0` を親の直下子に載せると親の space-y が上書きされて
 * 行間が潰れる。margin を持つのは内側だけにして、親から見える外側は margin ゼロに保つ。
 * 外側を `flex` にしているのは、内側の負 margin が外側と相殺 (margin collapsing) して
 * 外側自身の margin として漏れるのを防ぐため (flex アイテムの margin は collapse しない)。
 */
export function ChipScrollRow({
  children,
  className,
  role,
  "data-testid": dataTestId,
}: ChipScrollRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [showFade, setShowFade] = useState(false);
  const showFadeRef = useRef(false);

  const updateFade = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    const isScrollable = el.scrollWidth > el.clientWidth + 1;
    const isAtEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;
    // sm 以上は flex-wrap で折り返すため通常 scrollWidth === clientWidth となりフェードは出ない。
    // ただし単一チップが行幅より広い場合は折り返せず scrollWidth > clientWidth になり得るので、
    // 「sm 以上では必ず false」ではなく実測値で判定する (mobile 版と同一の式)。
    const next = isScrollable && !isAtEnd;
    if (next === showFadeRef.current) return;
    showFadeRef.current = next;
    setShowFade(next);
  }, []);

  // 容器幅の変化 (画面回転・ブレークポイント跨ぎ) を監視
  useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateFade);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateFade]);

  // チップの増減で scrollWidth が変わるため、描画のたびに測り直す。
  // useLayoutEffect なのでフェード無しの1フレームが挟まらない。
  useLayoutEffect(() => {
    updateFade();
  });

  return (
    // margin を持たないレイアウト用ラッパー。親の space-y-* はこの要素に効く。
    // 行の外形 (高さ・行間) を測るのはこの要素。内側は py-1 の分だけ 8px 高い
    <div className="flex" data-testid={dataTestId ? `${dataTestId}-box` : undefined}>
      <div
        ref={rowRef}
        role={role}
        data-testid={dataTestId}
        onScroll={updateFade}
        className={cn(
          // py-1/-my-1: overflow-x-auto は overflow-y も auto 扱いになりチップの
          // focus:ring-2 が上下で切れるため、内側に余白を作って外側で相殺する。
          // min-w-0: 効くのは sm 以上。sm 未満は main 軸の overflow が visible 以外
          // (overflow-x-auto) なので Flexbox §4.5 により automatic minimum size が
          // 自動で 0 になり冗長。sm 以上は sm:overflow-x-visible で visible に戻り
          // min-width:auto が content ベースに復帰するため、ここで 0 に固定する
          "min-w-0 flex-1 flex overflow-x-auto scrollbar-hide py-1 -my-1 [&>*]:shrink-0",
          "sm:flex-wrap sm:overflow-x-visible sm:py-0 sm:my-0 sm:[&>*]:shrink",
          className,
        )}
        // 不変条件: この style に入れる値は scrollWidth / clientWidth / scrollLeft を
        // 変化させてはならない (mask-image は描画のみでレイアウトに影響しない)。
        // 影響する値 (padding-right やダミー要素など) に変えると、
        // 計測 → state 変化 → 再計測で値が振動し、useLayoutEffect が
        // ペイント前に同期ループしてタブが固まる。showFadeRef の早期 return は
        // 「同値での再入」しか止められず、振動は止められない
        style={
          showFade ? { maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK } : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}
