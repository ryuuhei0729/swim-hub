"use client";

import React from "react";
import { cn } from "@/utils/cn";

/** 選択式チップボタンの共通クラス */
export function chipClass(selected: boolean) {
  return cn(
    "h-8 sm:h-10 px-3 rounded-md border text-sm font-medium transition-colors",
    selected
      ? "border-blue-600 bg-blue-600 text-white"
      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
  );
}

interface SelectChipsProps {
  options: { value: string; label: React.ReactNode }[];
  value: string;
  onChange: (value: string) => void;
  testIdPrefix: string;
}

/** 単一選択のチップボタン群(種目・カテゴリ用) */
export function SelectChips({ options, value, onChange, testIdPrefix }: SelectChipsProps) {
  return (
    <div className="flex flex-wrap gap-1.5 sm:gap-2" role="group">
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={selected}
            className={chipClass(selected)}
            data-testid={`${testIdPrefix}-${opt.value}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
