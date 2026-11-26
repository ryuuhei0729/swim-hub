"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { cn } from "@/utils/cn";

/** スライド同士の間隔 (gap-2)。カードの影が隣のスライドに見えないよう空ける */
const SLIDE_GAP_PX = 8;

interface DashboardCardCarouselProps {
  /** 1枚ずつ横に並べるカード。幅と高さはスライドに合わせて広がる */
  children: React.ReactNode;
  /**
   * 開いたときに表示しておくカードの位置 (既定 0)。カルーセルを組んだときに1度だけ効く。
   * 並び順は変えずに、最初に見せるカードだけを選ぶために使う
   */
  initialIndex?: number;
  /**
   * 並べるカードと initialIndex が決まったか (既定 true)。false の間は読み込み表示を出す。
   * 先にカードを出してから最初のカードへ移ると、開いた直後に表示が切り替わって見えるため
   */
  ready?: boolean;
}

/**
 * ダッシュボードのカードを横に並べ、1枚ずつ切り替える。
 * スワイプ・横スクロールに加えて、下の ‹ › とドットでも切り替えられる。
 * カードが1枚だけならカルーセルにせず、そのまま出す。
 * 各スライドの高さは一番高いカードに揃う (flex の stretch)。
 */
export default function DashboardCardCarousel({
  children,
  initialIndex = 0,
  ready = true,
}: DashboardCardCarouselProps) {
  const cards = React.Children.toArray(children).filter(React.isValidElement);

  if (!ready) {
    return (
      <section
        className="rounded-lg bg-white p-4 shadow sm:p-5"
        aria-busy="true"
        data-testid="dashboard-card-carousel-loading"
      >
        <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
        <div className="mt-4 h-24 animate-pulse rounded bg-gray-100" />
      </section>
    );
  }
  if (cards.length <= 1) return <>{cards}</>;
  // カルーセルを組むたびに作り直し、そのときの initialIndex で開く
  return <CarouselTrack cards={cards} initialIndex={initialIndex} />;
}

function CarouselTrack({
  cards,
  initialIndex,
}: {
  cards: React.ReactElement[];
  initialIndex: number;
}) {
  const t = useTranslations("dashboard.cardCarousel");
  const count = cards.length;
  // 最初に見せるカードは組んだ時点の値で固定する (見ている途中で勝手に切り替えない)
  const [startIndex] = useState(() => Math.max(0, Math.min(count - 1, initialIndex)));
  const [index, setIndex] = useState(startIndex);
  const trackRef = useRef<HTMLDivElement>(null);

  // 最初の描画の前に、最初に見せるカードへ移す
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (el) el.scrollLeft = startIndex * el.clientWidth;
  }, [startIndex]);

  // スライド1枚 + 間隔ぶんで1ページ。トラックは左右に間隔の半分ずつ余白を持つので、
  // 1ページの移動量はトラックの表示幅と同じになる
  const handleScroll = () => {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    setIndex(Math.max(0, Math.min(count - 1, next)));
  };

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div data-testid="dashboard-card-carousel">
      {/* 影が切れないよう上下左右に少し余白を取り、負のマージンで外形を元に戻す */}
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="-mx-1 -my-1 flex snap-x snap-mandatory overflow-x-auto scrollbar-hide px-1 py-1"
        style={{ gap: SLIDE_GAP_PX, scrollPaddingInline: SLIDE_GAP_PX / 2 }}
      >
        {cards.map((card, i) => (
          <div
            key={card.key ?? i}
            className="flex w-full shrink-0 snap-start [&>*]:min-w-0 [&>*]:flex-1"
            // 見えていないカードの中のボタンに Tab で入らないようにする
            inert={i !== index}
          >
            {card}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-center gap-1">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          aria-label={t("previous")}
          className="rounded-full border border-gray-200 bg-white p-1 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <div className="flex items-center">
          {cards.map((card, i) => (
            // 押せる範囲を広げるため、ドットの周りに余白を持たせる
            <button
              key={card.key ?? i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={t("goTo", { index: i + 1 })}
              aria-current={i === index}
              className="group p-1.5"
            >
              <span
                className={cn(
                  "block h-1.5 rounded-full transition-all",
                  i === index ? "w-4 bg-blue-600" : "w-1.5 bg-gray-300 group-hover:bg-gray-400",
                )}
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => goTo(index + 1)}
          disabled={index === count - 1}
          aria-label={t("next")}
          className="rounded-full border border-gray-200 bg-white p-1 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
        >
          <ChevronRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
