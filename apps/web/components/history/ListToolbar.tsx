"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ArrowsUpDownIcon, AdjustmentsHorizontalIcon } from "@heroicons/react/24/outline";

export interface ListToolbarProps {
  /** 絞り込み後の総件数(filteredRecords.length 等。displayCount とは別物) */
  itemCount: number;
  onSortClick: () => void;
  onFilterClick: () => void;
  /** 有効な絞り込み条件の数。0 より大きい場合のみバッジを表示する */
  activeFilterCount: number;
}

/**
 * 大会/練習履歴タブ共通の一覧ツールバー。
 * 左に絞り込み後の件数、右に並べ替え/絞り込みのボトムシートを開くボタンを表示する。
 */
export default function ListToolbar({
  itemCount,
  onSortClick,
  onFilterClick,
  activeFilterCount,
}: ListToolbarProps) {
  const tCommon = useTranslations("common");

  return (
    <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
      <span className="text-sm text-gray-600">
        {tCommon("listToolbar.itemCount", { count: itemCount })}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSortClick}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <ArrowsUpDownIcon className="h-4 w-4" aria-hidden="true" />
          {tCommon("listToolbar.sortButton")}
        </button>
        <button
          type="button"
          onClick={onFilterClick}
          className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <AdjustmentsHorizontalIcon className="h-4 w-4" aria-hidden="true" />
          {tCommon("listToolbar.filterButton")}
          {activeFilterCount > 0 && (
            <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-semibold leading-none">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
