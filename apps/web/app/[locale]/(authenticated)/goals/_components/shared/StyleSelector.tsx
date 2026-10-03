"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SelectChips } from "@/components/forms/practice-log/components/SelectChips";
import { SWIM_STYLES } from "../constants";

interface StyleSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * 泳法選択コンポーネント。練習入力 (PracticeMenuItem) と同じ SelectChips を使い、
 * 入力 UX を揃える。
 */
export default function StyleSelector({ value, onChange, disabled = false }: StyleSelectorProps) {
  const tPractice = useTranslations("practice");
  return (
    <div
      className={disabled ? "pointer-events-none opacity-50" : undefined}
      aria-disabled={disabled}
    >
      <SelectChips
        options={SWIM_STYLES.map((style) => ({
          value: style.value,
          label: tPractice(`styles.${style.value}`),
        }))}
        value={value}
        onChange={onChange}
        testIdPrefix="goal-milestone-style"
      />
    </div>
  );
}
