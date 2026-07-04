"use client";

import React from "react";
import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";

export interface ItemTabsProps {
  count: number;
  activeIndex: number;
  onSelect: (i: number) => void;
  onAdd: () => void;
  /** タブ内の × で項目を削除。未指定の場合は × を表示しない */
  onRemove?: (i: number) => void;
  /** ピルラベル生成。例: (i) => `種目 ${i + 1}` */
  label: (i: number) => string;
  accent?: "blue" | "green";
  canAdd?: boolean;
  disabled?: boolean;
  testIdPrefix: string;
  /** + ボタンのみ異なる data-testid を使いたい場合に指定。デフォルト: `${testIdPrefix}-add-button` */
  addTestId?: string;
  /** + ボタンの aria-label / title。スクリーンリーダー向け(例: "記録を追加") */
  addLabel?: string;
  /** アクティブタブと一体化して表示するコンテンツ */
  children: React.ReactNode;
}

/**
 * Chrome 風フォルダタブ(サブタブ)コンポーネント。
 * タブ行はコンテンツパネルの上辺に密着し、アクティブタブはパネルと一体化する。
 * 各タブ右端に × 削除ボタン(onRemove 指定かつ count > 1 のとき)、末尾に + 追加ボタン。
 */
export default function ItemTabs({
  count,
  activeIndex,
  onSelect,
  onAdd,
  onRemove,
  label,
  accent = "blue",
  canAdd = true,
  disabled = false,
  testIdPrefix,
  addTestId,
  addLabel,
  children,
}: ItemTabsProps) {
  const activeText = accent === "green" ? "text-green-700" : "text-blue-700";
  const activeBg = accent === "green" ? "bg-green-50" : "bg-blue-50";
  const addHover = accent === "green" ? "hover:text-green-700" : "hover:text-blue-700";
  const focusRing = accent === "green" ? "focus:ring-green-500" : "focus:ring-blue-500";

  const showRemove = typeof onRemove === "function" && count > 1;

  return (
    <div className="flex flex-col">
      {/* タブ行: パネル上辺(border)に密着。items-end + -mb-px でフォルダタブ化 */}
      <div
        role="tablist"
        aria-label="item tabs"
        className="flex items-end gap-1 overflow-x-auto px-1 scrollbar-none"
      >
        {Array.from({ length: count }, (_, i) => {
          const isActive = activeIndex === i;
          return (
            <div
              key={i}
              className={`
                relative -mb-px flex shrink-0 items-center rounded-t-lg border transition-colors
                ${
                  isActive
                    ? `${activeBg} border-gray-200 border-b-transparent`
                    : "bg-gray-100 border-transparent hover:bg-gray-200"
                }
              `}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelect(i)}
                disabled={disabled}
                data-testid={`${testIdPrefix}-tab-${i + 1}`}
                className={`
                  whitespace-nowrap py-2 pl-3 text-sm font-medium select-none
                  focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed
                  ${showRemove ? "pr-1" : "pr-3"}
                  ${isActive ? `${activeText} font-semibold` : "text-gray-500 hover:text-gray-700"}
                `}
              >
                {label(i)}
              </button>
              {showRemove && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove?.(i);
                  }}
                  disabled={disabled}
                  aria-label="remove item"
                  data-testid={`${testIdPrefix}-remove-${i + 1}`}
                  className={`
                    mr-1.5 shrink-0 rounded p-0.5 text-gray-400
                    hover:bg-black/10 hover:text-gray-700
                    focus:outline-none focus:ring-2 ${focusRing}
                    disabled:opacity-50 disabled:cursor-not-allowed
                  `}
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}

        {canAdd && (
          <button
            type="button"
            onClick={onAdd}
            disabled={disabled}
            data-testid={addTestId ?? `${testIdPrefix}-add-button`}
            aria-label={addLabel ?? "add item"}
            title={addLabel}
            className={`
              mb-1 ml-0.5 shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1
              text-xs font-medium text-gray-500 transition-colors
              hover:bg-gray-100 ${addHover}
              focus:outline-none focus:ring-2 ${focusRing}
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            <PlusIcon className="h-4 w-4 shrink-0" />
            {addLabel && <span className="whitespace-nowrap">{addLabel}</span>}
          </button>
        )}
      </div>

      {/* コンテンツパネル: アクティブタブと一体化(上辺枠でタブと接合) */}
      <div
        role="tabpanel"
        className="rounded-b-lg rounded-tr-lg border border-gray-200 bg-white p-3 sm:p-4"
      >
        {children}
      </div>
    </div>
  );
}
