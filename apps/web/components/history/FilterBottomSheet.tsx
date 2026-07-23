"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/utils/cn";
import BottomSheet from "@/components/ui/BottomSheet";
import Button from "@/components/ui/Button";

export type FilterGroupMode = "single" | "multi";

export interface FilterGroupOption {
  value: string;
  label: string;
  /** タグ等、選択時にこの色を背景に使う場合に指定する */
  color?: string;
}

export interface FilterGroup {
  id: string;
  label: string;
  mode: FilterGroupMode;
  options: FilterGroupOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  /** このグループのみを未選択(=すべて)に戻す */
  onClearGroup: () => void;
  /** 見出し直下に表示する注記(例: タググループの「すべて選択したタグを含む」) */
  note?: string;
}

export interface FilterBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  groups: FilterGroup[];
  /** 有効な絞り込み条件の総数。0 の場合は「すべてクリア」ボタンを無効化する */
  activeCount: number;
  /** 全グループをクリアする(ソートは巻き込まない)。押下してもシートは閉じない */
  onClearAll: () => void;
  /**
   * 指定時のみ、フッターを「すべてクリア」+「適用」の2ボタン構成にする(ドラフト適用モード)。
   * 未指定時は従来通り「すべてクリア」の1ボタンのみ(即時反映モード、practice タブ等の既存挙動)。
   */
  onApply?: () => void;
}

/**
 * 絞り込みボトムシート(汎用)。グループごとにチップを表示する。
 * - `onApply` 未指定時: チップ操作(onChange)が即座に反映される想定(呼び出し側がストアへ直接書き込む)。
 * - `onApply` 指定時: チップ操作(onChange)は呼び出し側のドラフト state のみを更新する想定で、
 *   「適用」ボタン押下時にのみ呼び出し側がストアへ一括コミットする(このコンポーネント自体は
 *   groups の selectedValues がドラフト値かストア値かを関知しない)。
 * - single: クリックで選択を置き換える。選択中のチップを再クリックした場合はトグルで解除し、
 *   未選択(=すべて)に戻す(「すべて」チップは置かず、グループの「クリア」ボタンと同じ状態になる)
 * - multi: クリックでトグル(複数選択。選択済みを再クリックすると配列から外れる)
 */
export default function FilterBottomSheet({
  isOpen,
  onClose,
  title,
  groups,
  activeCount,
  onClearAll,
  onApply,
}: FilterBottomSheetProps) {
  const tCommon = useTranslations("common");

  const handleOptionClick = (group: FilterGroup, value: string) => {
    if (group.mode === "single") {
      const isAlreadySelected = group.selectedValues.includes(value);
      group.onChange(isAlreadySelected ? [] : [value]);
      return;
    }
    const next = group.selectedValues.includes(value)
      ? group.selectedValues.filter((v) => v !== value)
      : [...group.selectedValues, value];
    group.onChange(next);
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        onApply ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 justify-center"
              disabled={activeCount === 0}
              onClick={onClearAll}
            >
              {tCommon("bottomSheet.clearAll")}
            </Button>
            <Button className="flex-1 justify-center" onClick={onApply}>
              {tCommon("bottomSheet.apply")}
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full justify-center"
            disabled={activeCount === 0}
            onClick={onClearAll}
          >
            {tCommon("bottomSheet.clearAll")}
          </Button>
        )
      }
    >
      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.id}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {group.label}
              </h3>
              {group.selectedValues.length > 0 && (
                <button
                  type="button"
                  onClick={group.onClearGroup}
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  {tCommon("bottomSheet.clearGroup")}
                </button>
              )}
            </div>
            {group.note && <p className="text-xs text-gray-400 mb-2">{group.note}</p>}
            <div className="flex flex-wrap gap-2">
              {group.options.length === 0 ? (
                <span className="text-xs text-gray-400">-</span>
              ) : (
                group.options.map((option) => {
                  const selected = group.selectedValues.includes(option.value);
                  const usesCustomColor = selected && !!option.color;
                  return (
                    <button
                      key={option.value || "__unset__"}
                      type="button"
                      onClick={() => handleOptionClick(group, option.value)}
                      style={usesCustomColor ? { backgroundColor: option.color } : undefined}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                        selected
                          ? usesCustomColor
                            ? "text-white"
                            : "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}
