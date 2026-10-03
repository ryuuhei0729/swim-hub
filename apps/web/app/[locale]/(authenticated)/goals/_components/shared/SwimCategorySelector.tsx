"use client";

import React from "react";
import { SelectChips } from "@/components/forms/practice-log/components/SelectChips";
import { SWIM_CATEGORIES } from "../constants";

interface SwimCategorySelectorProps {
  value: "Swim" | "Pull" | "Kick";
  onChange: (value: "Swim" | "Pull" | "Kick") => void;
  disabled?: boolean;
}

/**
 * Swim/Pull/Kick選択コンポーネント。練習入力 (PracticeMenuItem) と同じ
 * SelectChips を使い、入力 UX を揃える。
 */
export default function SwimCategorySelector({
  value,
  onChange,
  disabled = false,
}: SwimCategorySelectorProps) {
  return (
    <div
      className={disabled ? "pointer-events-none opacity-50" : undefined}
      aria-disabled={disabled}
    >
      <SelectChips
        options={SWIM_CATEGORIES.map((category) => ({
          value: category.value,
          label: category.label,
        }))}
        value={value}
        onChange={(v) => onChange(v as "Swim" | "Pull" | "Kick")}
        testIdPrefix="goal-milestone-swim-category"
      />
    </div>
  );
}
