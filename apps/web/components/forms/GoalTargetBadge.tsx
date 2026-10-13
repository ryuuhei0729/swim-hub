"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { formatTimeBest } from "@apps/shared/utils/time";

interface GoalTargetBadgeProps {
  /** 目標タイム (秒) */
  time: number;
  /**
   * 隣のベストタイムバッジの形に合わせる。
   * - `chip`: `<div>` の丸バッジ (px-3)。RecordLogEntry のヘッダー行用
   * - `inline`: `<p>` の丸バッジ (mt-1, px-2)。代理入力・エントリー入力の行用
   * - `text`: `<p>` の素のテキスト (text-xs mt-1)。EntryLogForm の素テキスト型ベスト表示用
   */
  variant?: "chip" | "inline" | "text";
  "data-testid"?: string;
}

/**
 * 「目標: xx.xx」バッジ (表示専用)。ベストタイムバッジ (緑) と見分けられるよう青系にする。
 * 表示するかどうかの判定は呼び出し側が `findGoalTargetTime` で行う。
 */
export default function GoalTargetBadge({
  time,
  variant = "inline",
  "data-testid": testId,
}: GoalTargetBadgeProps) {
  const t = useTranslations("forms.recordLog");
  const text = `${t("goalTargetLabel")}: ${formatTimeBest(time)}`;

  if (variant === "chip") {
    return (
      <div
        data-testid={testId}
        className="text-xs text-sky-800 bg-sky-100 px-3 py-1 rounded-full inline-flex items-center gap-2"
      >
        <span className="text-sky-700">{text}</span>
      </div>
    );
  }
  if (variant === "text") {
    return (
      <p data-testid={testId} className="text-xs text-sky-700 mt-1">
        {text}
      </p>
    );
  }
  return (
    <p
      data-testid={testId}
      className="mt-1 text-xs text-sky-800 bg-sky-100 px-2 py-1 rounded-full inline-flex items-center"
    >
      {text}
    </p>
  );
}
