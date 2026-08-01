"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { cn } from "@/utils/cn";
import { lockBodyScroll } from "@/utils/scrollLock";

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** シートのタイトル。指定時は aria-labelledby でヘッダーの見出し要素を参照する */
  title?: string;
  children: React.ReactNode;
  /** sticky フッター領域(例: 「すべてクリア」ボタン) */
  footer?: React.ReactNode;
  /** コンテンツ領域の最大高さクラス(既定: max-h-[80vh]) */
  maxHeightClassName?: string;
}

// isOpen=false になってから実際に DOM から取り除くまでの遅延(閉じるスライドモーション分)
const CLOSE_ANIMATION_MS = 300;

/**
 * 汎用ボトムシート(下部からスライドインするパネル)。
 * a11y・フォーカストラップ・body スクロールロックは components/ui/ConfirmDialog.tsx の
 * 実装パターンを踏襲しつつ、スライドアニメーションのための遅延アンマウントを追加している。
 *
 * SortBottomSheet / FilterBottomSheet の土台として使う。
 */
export default function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxHeightClassName = "max-h-[80vh]",
}: BottomSheetProps) {
  const tCommon = useTranslations("common");
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);

  // 最新の onClose を ref 経由で参照する。onClose はインライン関数で親の再レンダーごとに
  // 参照が変わり得るため、Escape ハンドラの effect の deps には含めない
  // (含めると、シートを開いたまま親が再レンダーするたびに effect が張り直され、
  // 後述のフォーカス系副作用が意図せず再実行されてしまう)。
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // isOpen=true の間だけ DOM に存在させたいが、閉じる際はスライドアウトモーションのため
  // 一定時間 (CLOSE_ANIMATION_MS) 経過してからアンマウントする
  const [shouldRender, setShouldRender] = useState(isOpen);
  // translate-y-full ⇔ translate-y-0 を切り替えるための表示状態
  const [isVisible, setIsVisible] = useState(false);

  // マウント/アンマウント + スライドイン・アウトの制御
  useEffect(() => {
    if (isOpen) {
      triggerElementRef.current = document.activeElement as HTMLElement | null;
      setShouldRender(true);
      // 初期状態(translate-y-full)でマウントしてから次フレームで translate-y-0 に切り替える
      const raf = requestAnimationFrame(() => setIsVisible(true));
      return () => cancelAnimationFrame(raf);
    }

    // 閉じる: まずスライドアウトさせ、モーション時間分待ってからアンマウントする
    setIsVisible(false);
    // 開く前にフォーカスしていた要素(トリガーボタン想定)へフォーカスを戻す
    triggerElementRef.current?.focus();
    const timer = setTimeout(() => setShouldRender(false), CLOSE_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // 初期フォーカス: ダイアログが実際に DOM にマウントされた(shouldRender が true になった)
  // 直後にのみ×ボタンへフォーカスを移す。isOpen/shouldRender どちらも変化していない
  // 再レンダー(例: シートを開いたままの親の状態更新)では再実行されないため、
  // 選択済みチップ等からフォーカスを奪わない。
  useEffect(() => {
    if (isOpen && shouldRender) {
      closeButtonRef.current?.focus();
    }
  }, [isOpen, shouldRender]);

  // 開いている間のみ有効: Escape・フォーカストラップ(isOpen の変化のみで張り直す。
  // onClose の参照変化では張り直さない=Symptom B 対策)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab" && sheetRef.current) {
        const focusableElements = sheetRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // body スクロールロック: shouldRender(実マウント状態)の間ずっとロックし続ける。
  // isOpen=false になった直後(スライドアウトの300ms間はまだ見えている)ではまだ解除しない
  // (解除タイミングをアンマウントに揃える)。
  useEffect(() => {
    if (!shouldRender) return;
    const unlockScroll = lockBodyScroll();
    return () => {
      unlockScroll();
    };
  }, [shouldRender]);

  if (!shouldRender) return null;

  return createPortal(
    <div className="fixed inset-0 z-100">
      {/* オーバーレイ */}
      <div className="fixed inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      {/* シート本体 */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={cn(
          "fixed bottom-0 inset-x-0 z-101 flex flex-col rounded-t-2xl bg-white shadow-xl transition-transform duration-300 ease-out",
          isVisible ? "translate-y-0" : "translate-y-full",
        )}
      >
        {/* グラブハンドル(見た目のみ) */}
        <div className="flex shrink-0 justify-center pt-2" aria-hidden="true">
          <div className="h-1.5 w-10 rounded-full bg-gray-300" />
        </div>

        {/* ヘッダー(sticky) */}
        <div className="flex shrink-0 items-center justify-between px-4 py-3 border-b border-gray-200">
          {title ? (
            <h2 id={titleId} className="text-base font-semibold text-gray-900">
              {title}
            </h2>
          ) : (
            <span />
          )}
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label={tCommon("bottomSheet.close")}
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* コンテンツ(内部スクロール) */}
        <div className={cn("overflow-y-auto px-4 py-3", maxHeightClassName)}>{children}</div>

        {/* フッター(sticky) */}
        {footer && (
          <div className="shrink-0 border-t border-gray-200 px-4 py-3">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
