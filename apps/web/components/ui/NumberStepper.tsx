"use client";

import React from "react";
import { MinusIcon, PlusIcon } from "@heroicons/react/24/outline";

interface NumberStepperProps {
  /** 現在値。入力中の空状態を許容するため number | "" */
  value: number | "";
  /** 値変更時のコールバック。既存 onUpdate と揃えて文字列で渡す */
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  /** −/+ ボタン1回あたりの増減幅 */
  step?: number;
  placeholder?: string;
  /** 中央 input の aria-label(フィールド名) */
  ariaLabel?: string;
  /** −/+ ボタンの aria-label 用ラベル(例: "本数") */
  fieldLabel?: string;
  decreaseLabel?: string;
  increaseLabel?: string;
  "data-testid"?: string;
}

/**
 * −/+ ボタンと直接入力を兼ねた数値ステッパー。
 * 普段はボタンで増減、変則値は中央をタップして直接入力する。
 */
export default function NumberStepper({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  placeholder,
  ariaLabel,
  fieldLabel,
  decreaseLabel,
  increaseLabel,
  "data-testid": dataTestid,
}: NumberStepperProps) {
  const current = value === "" ? NaN : Number(value);

  const clamp = (n: number) => {
    let result = n;
    if (min !== undefined) result = Math.max(min, result);
    if (max !== undefined) result = Math.min(max, result);
    return result;
  };

  const handleStep = (delta: number) => {
    const base = Number.isNaN(current) ? min : current;
    onChange(String(clamp(base + delta)));
  };

  const atMin = !Number.isNaN(current) && current <= min;
  const atMax = max !== undefined && !Number.isNaN(current) && current >= max;

  const buttonClass =
    "flex items-center justify-center w-7 sm:w-9 shrink-0 text-blue-500 hover:text-blue-600 disabled:text-gray-300 disabled:hover:text-gray-300 transition-colors";

  return (
    <div className="flex items-stretch h-8 sm:h-10 rounded-lg border border-gray-200 bg-white transition-colors focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
      <button
        type="button"
        onClick={() => handleStep(-step)}
        disabled={atMin}
        aria-label={`${fieldLabel ?? ""} ${decreaseLabel ?? ""}`.trim() || undefined}
        className={buttonClass}
        data-testid={dataTestid ? `${dataTestid}-decrease` : undefined}
      >
        <MinusIcon className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        aria-label={ariaLabel}
        data-testid={dataTestid}
        className="w-full min-w-0 text-center text-sm text-gray-900 bg-transparent border-0 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => handleStep(step)}
        disabled={atMax}
        aria-label={`${fieldLabel ?? ""} ${increaseLabel ?? ""}`.trim() || undefined}
        className={buttonClass}
        data-testid={dataTestid ? `${dataTestid}-increase` : undefined}
      >
        <PlusIcon className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
      </button>
    </div>
  );
}
