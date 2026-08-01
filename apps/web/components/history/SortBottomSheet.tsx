"use client";

import React from "react";
import { CheckIcon } from "@heroicons/react/24/outline";
import type { SortOrder } from "@/hooks/useTableSort";
import BottomSheet from "@/components/ui/BottomSheet";

export interface SortPreset<C extends string> {
  id: string;
  label: string;
  /** ソート対象カラム。既定順(例: 日付新しい順)は isDefault と組み合わせて表現する */
  column: C;
  order: SortOrder;
  /**
   * true の場合、sortColumn===null (=未ソート=既定表示順) のときもこのプリセットが
   * 選択中として扱われる(例: 「日付新しい順」は初期状態の sortColumn=null と等価)
   */
  isDefault?: boolean;
}

export interface SortBottomSheetProps<C extends string> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  presets: SortPreset<C>[];
  activeColumn: C | null;
  activeOrder: SortOrder;
  onSelect: (preset: SortPreset<C>) => void;
}

/**
 * 並べ替えボトムシート(汎用)。プリセットをタップすると即座に onSelect が呼ばれ、
 * 実際の sortColumn/sortOrder 反映・displayCount リセット・シートを閉じる処理は
 * 呼び出し側(各 Client)が行う。
 */
export default function SortBottomSheet<C extends string>({
  isOpen,
  onClose,
  title,
  presets,
  activeColumn,
  activeOrder,
  onSelect,
}: SortBottomSheetProps<C>) {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={title}>
      <ul className="divide-y divide-gray-100">
        {presets.map((preset) => {
          const isSelected = preset.isDefault
            ? activeColumn === null || (activeColumn === preset.column && activeOrder === preset.order)
            : activeColumn === preset.column && activeOrder === preset.order;

          return (
            <li key={preset.id}>
              <button
                type="button"
                onClick={() => onSelect(preset)}
                className="w-full flex items-center justify-between gap-2 py-3 text-left text-sm text-gray-900 hover:bg-gray-50"
              >
                <span className={isSelected ? "font-semibold text-blue-600" : undefined}>
                  {preset.label}
                </span>
                {isSelected && <CheckIcon className="h-5 w-5 text-blue-600 shrink-0" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ul>
    </BottomSheet>
  );
}
