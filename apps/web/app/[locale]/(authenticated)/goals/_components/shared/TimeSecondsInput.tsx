"use client";

import React, { useState, useEffect, useRef } from "react";
import Input from "@/components/ui/Input";
import { formatTimeBest } from "@/utils/formatters";
import { parseTimeFlexible } from "@apps/shared/utils/time";

interface TimeSecondsInputProps {
  /** 秒数。null または 0 は未入力を表す */
  value: number | null;
  /** パース成功時は秒数、空欄化時は null を渡す */
  onChange: (seconds: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  /** 空欄で blur したときのエラー文言 (required のときのみ表示) */
  requiredErrorMessage?: string;
  /** 解釈できない値で blur したときのエラー文言 */
  invalidErrorMessage: string;
  /**
   * true の間、blur を経ていなくても invalidErrorMessage を表示する。
   * 呼び出し元が submit 時に「保存できない値 (0以下等)」を検知した場合に使う
   * (新しい文言・表示様式は追加せず、既存の invalidErrorMessage をそのまま使う)。
   * ユーザーが再度入力すると (handleChange 発火時に) 呼び出し元が false に戻す想定。
   */
  forceInvalid?: boolean;
  "data-testid"?: string;
}

/**
 * value/lastNotifiedValueRef の比較用正規化。この部品はもともと表示処理で
 * 「0以下は未入力」を採用している (`value && value > 0` でのみ表示する) ため、
 * 比較にも同じ正規化をかける。呼び出し側が「パースできない途中入力」を null で
 * 受け取って 0 に変換して書き戻しても (MilestoneParamsForm など)、0 を null に
 * 変換して書き戻しても、どちらも「自分の入力がそのまま返ってきただけ」として
 * 同じ扱いになる。
 */
function normalizeForComparison(value: number | null): number | null {
  return value !== null && value > 0 ? value : null;
}

/**
 * 目標タイム/初期タイム等の「単発タイム入力欄」共通部品。
 * 練習・大会記録入力と同じ parseTimeFlexible による柔軟パース + blur 時の正規化表示。
 * GoalForm (目標タイム・初期タイム) / MilestoneParamsForm (目標タイム・平均目標タイム)
 * の4箇所から利用する。
 */
export default function TimeSecondsInput({
  value,
  onChange,
  placeholder = "2.00.00",
  disabled = false,
  required = false,
  requiredErrorMessage,
  invalidErrorMessage,
  forceInvalid = false,
  "data-testid": dataTestId,
}: TimeSecondsInputProps) {
  const [displayValue, setDisplayValue] = useState<string>(() => {
    const normalizedValue = normalizeForComparison(value);
    return normalizedValue !== null ? formatTimeBest(normalizedValue) : "";
  });
  const [error, setError] = useState<string>("");
  // このコンポーネント自身が直近に onChange で親へ通知した秒数 (0以下は null として
  // 正規化して保持する)。value を同じ正規化にかけた上でこの値と一致する間は
  // 「自分の入力がそのまま親に返ってきただけ」とみなし表示を書き換えない
  // (1文字打つたびに value が更新され、それを useEffect が formatTimeBest で
  // 即座に上書きして入力が壊れる不具合があった)。呼び出し側がパースできない
  // 途中入力を null で受け取って 0 に変換して書き戻す実装でも、この正規化により
  // 「自分の入力が返ってきただけ」と正しく認識できる。value が正規化後もこの値と
  // 異なるときだけ「外部からの変更」(初期値・ベストタイム取得ボタン・フォーム
  // リセット等) とみなして表示を同期する。
  const lastNotifiedValueRef = useRef<number | null>(normalizeForComparison(value));

  useEffect(() => {
    const normalizedValue = normalizeForComparison(value);
    if (normalizedValue === lastNotifiedValueRef.current) return;
    lastNotifiedValueRef.current = normalizedValue;
    if (normalizedValue !== null) {
      setDisplayValue(formatTimeBest(normalizedValue));
      setError("");
    } else {
      setDisplayValue("");
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setDisplayValue(raw);

    if (raw.trim() === "") {
      setError("");
      lastNotifiedValueRef.current = null;
      onChange(null);
      return;
    }

    const seconds = parseTimeFlexible(raw);
    if (seconds !== null) {
      setError("");
      lastNotifiedValueRef.current = normalizeForComparison(seconds);
      onChange(seconds);
    } else {
      // 入力途中でまだパースできない値。Enter 押下 (blur を経ない submit) で
      // 古い確定値が残らないよう、親には null を通知しておく。
      // エラー表示自体は blur 時のみ行う (途中入力でエラーを出さないため)。
      lastNotifiedValueRef.current = null;
      onChange(null);
    }
  };

  const handleBlur = () => {
    if (displayValue.trim() === "") {
      if (required) setError(requiredErrorMessage ?? invalidErrorMessage);
      return;
    }

    const seconds = parseTimeFlexible(displayValue);
    if (seconds === null) {
      setError(invalidErrorMessage);
    } else {
      setError("");
      setDisplayValue(formatTimeBest(seconds));
    }
  };

  const displayError = error || (forceInvalid ? invalidErrorMessage : "");

  return (
    <div>
      <Input
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className={displayError ? "border-red-500" : ""}
        data-testid={dataTestId}
      />
      {displayError && <p className="text-xs text-red-500 mt-1">{displayError}</p>}
    </div>
  );
}
