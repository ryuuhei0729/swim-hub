"use client";

import React, { useState } from "react";
import { cn } from "@/utils/cn";
import { chipClass } from "./SelectChips";
import { ChipScrollRow } from "@/components/ui/ChipScrollRow";
import { DISTANCE_PRESETS } from "../types";

interface DistanceInputProps {
  /** 現在の距離値 (PracticeMenu.distance と同じ number | "" 形式) */
  value: number | "";
  /** 距離変更時のコールバック。既存 onUpdate/onChange と揃えて文字列で渡す */
  onChange: (value: string) => void;
  label: string;
  /** 「その他」チップのラベル */
  otherLabel: string;
  /** data-testid の接頭辞 (例: "practice-distance" → practice-distance-preset-25 等) */
  testIdPrefix: string;
  /** 「その他」入力欄を表示した瞬間に autoFocus するか (PracticeMenuItem は true) */
  autoFocusCustomInput?: boolean;
}

/**
 * 距離入力(プリセットチップ + その他で直接入力)。
 * PracticeMenuItem の距離 UI を切り出した共通部品。
 * DOM構造・className・data-testid・a11y属性・16pxズーム防止は元実装から変更しない。
 * 練習ログ入力・目標管理 (goals) の両方から利用する。
 */
export default function DistanceInput({
  value,
  onChange,
  label,
  otherLabel,
  testIdPrefix,
  autoFocusCustomInput = true,
}: DistanceInputProps) {
  // 距離がプリセット外(空含む)なら「その他」入力モードで開始
  const [showCustomDistance, setShowCustomDistance] = useState(
    () => value === "" || !(DISTANCE_PRESETS as readonly number[]).includes(Number(value)),
  );

  return (
    <div>
      <label className="block text-[10px] sm:text-sm font-medium text-gray-700 mb-0.5 sm:mb-2">
        {label} <span className="text-red-500">*</span>
      </label>
      <ChipScrollRow className="gap-1.5 sm:gap-2" data-testid={`chiprow-${testIdPrefix}-preset`}>
        {DISTANCE_PRESETS.map((preset) => {
          const selected = !showCustomDistance && Number(value) === preset;
          return (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setShowCustomDistance(false);
                onChange(String(preset));
              }}
              className={cn(chipClass(selected), "min-w-12")}
              aria-pressed={selected}
              data-testid={`${testIdPrefix}-preset-${preset}`}
            >
              {preset}
            </button>
          );
        })}
        {showCustomDistance ? (
          // 「その他」ボタンがその場で入力欄に変化する
          //
          // 高さ・padding の根拠: components/ui/Input.tsx の「16px ズーム防止 box サイズ根拠」参照。
          // 同じチップ行に並ぶ SelectChips (chipClass, h-8 sm:h-10) と高さを揃える必要が
          // あるため、箱の高さは変えず padding のみ py-0.5 sm:py-1.5 に縮小する
          // (h-9 等の非レスポンシブ高さにするとプリセットチップと数px ずれる)。
          <input
            type="number"
            inputMode="numeric"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="100"
            min={1}
            required
            autoFocus={autoFocusCustomInput}
            aria-label={label}
            data-testid={testIdPrefix}
            className="h-8 sm:h-10 w-20 px-3 py-0.5 sm:py-1.5 rounded-md border border-blue-600 bg-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setShowCustomDistance(true);
            }}
            className={chipClass(false)}
            data-testid={`${testIdPrefix}-other`}
          >
            {otherLabel}
          </button>
        )}
      </ChipScrollRow>
    </div>
  );
}
