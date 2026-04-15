"use client";

import React, { useState, useRef, useEffect, useCallback, useId } from "react";
import { format, isValid } from "date-fns";
import { cn } from "@/utils/cn";

interface BirthdayInputProps {
  /** 値 (yyyy-MM-dd 形式の文字列、または先頭 10 文字が YYYY-MM-DD である ISO 文字列) */
  value?: string;
  /** 値が変化したとき (yyyy-MM-dd 形式の文字列 or "" を返す) */
  onChange: (date: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  /** 外部から指定するエラーメッセージ (バリデーションとは独立) */
  error?: string;
  helperText?: string;
  /** 最小年。デフォルト: 1900 */
  minYear?: number;
  /** 最大年。デフォルト: 当年。
   *  注意: 未指定時は "use client" の初回レンダで評価される当年を使用する。
   *  年またぎの瞬間に実行されるコンポーネントでは呼び出し側で明示値を渡すこと。 */
  maxYear?: number;
  className?: string;
}

function normalizeIsoToDate(v: string | undefined): string {
  if (!v) return "";
  return v.length >= 10 ? v.substring(0, 10) : "";
}

export default function BirthdayInput({
  value,
  onChange,
  label,
  required,
  disabled,
  error: externalError,
  helperText,
  minYear = 1900,
  maxYear = new Date().getFullYear(),
  className,
}: BirthdayInputProps) {
  const id = useId();
  const yearId = `${id}-year`;
  const monthId = `${id}-month`;
  const dayId = `${id}-day`;
  const errorId = `${id}-error`;

  const [yearText, setYearText] = useState("");
  const [monthText, setMonthText] = useState("");
  const [dayText, setDayText] = useState("");
  const [internalError, setInternalError] = useState<string | null>(null);

  const yearRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);

  // 外部 value の変化検知用。自分が onChange で emit した値と区別する
  const lastEmittedRef = useRef<string>("");

  // 外部 value → 内部 state 同期。自前で emit した値は skip
  const normalizedValue = normalizeIsoToDate(value);
  useEffect(() => {
    if (normalizedValue === lastEmittedRef.current) return;
    lastEmittedRef.current = normalizedValue;
    if (normalizedValue) {
      const [y, m, d] = normalizedValue.split("-");
      setYearText(y || "");
      setMonthText(m ? String(Number(m)) : "");
      setDayText(d ? String(Number(d)) : "");
    } else {
      setYearText("");
      setMonthText("");
      setDayText("");
    }
    setInternalError(null);
  }, [normalizedValue]);

  const emit = useCallback(
    (next: string) => {
      if (next === lastEmittedRef.current) return;
      lastEmittedRef.current = next;
      onChange(next);
    },
    [onChange],
  );

  const validateAndEmit = useCallback(
    (y: string, m: string, d: string) => {
      // 未入力/中間状態 → "" を emit (親の value が既に "" でも差分がなければ emit されない)
      if (!y || !m || !d || y.length !== 4) {
        setInternalError(null);
        emit("");
        return;
      }

      const yNum = Number(y);
      const mNum = Number(m);
      const dNum = Number(d);
      const date = new Date(yNum, mNum - 1, dNum);
      const isRealDate =
        isValid(date) &&
        date.getFullYear() === yNum &&
        date.getMonth() === mNum - 1 &&
        date.getDate() === dNum;

      if (!isRealDate) {
        setInternalError("存在しない日付です");
        emit("");
        return;
      }

      if (yNum < minYear || yNum > maxYear) {
        setInternalError(`${minYear}〜${maxYear}年の範囲で入力してください`);
        emit("");
        return;
      }

      setInternalError(null);
      emit(format(date, "yyyy-MM-dd"));
    },
    [minYear, maxYear, emit],
  );

  // 内部 state の変化で validate + emit (handler 内 stale closure 回避)
  useEffect(() => {
    validateAndEmit(yearText, monthText, dayText);
  }, [yearText, monthText, dayText, validateAndEmit]);

  const handleYearChange = (text: string) => {
    const num = text.replace(/[^0-9]/g, "").slice(0, 4);
    setYearText(num);
    if (num.length === 4) monthRef.current?.focus();
  };

  const handleMonthChange = (text: string) => {
    const num = text.replace(/[^0-9]/g, "").slice(0, 2);
    setMonthText(num);
    // "1" の時点では autoFocus しない (10, 11, 12月入力のため)。
    // 2 桁揃った、または "2"〜"9" で一意に確定できるときのみ日へ。
    if (num.length === 2 || (num.length === 1 && Number(num) >= 2)) {
      dayRef.current?.focus();
    }
  };

  const handleDayChange = (text: string) => {
    const num = text.replace(/[^0-9]/g, "").slice(0, 2);
    setDayText(num);
  };

  // Backspace で空フィールドから前フィールドへフォーカスを戻す
  const handleMonthKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && monthText === "") yearRef.current?.focus();
  };
  const handleDayKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && dayText === "") monthRef.current?.focus();
  };

  const hasError = !!(externalError || internalError);
  const displayError = externalError || internalError;
  const describedBy = hasError ? errorId : undefined;

  return (
    <fieldset
      className={cn("w-full border-0 p-0 m-0", className)}
      aria-describedby={describedBy}
    >
      {label && (
        <legend className="block text-sm font-medium text-gray-700 mb-2 p-0">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </legend>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        <input
          id={yearId}
          ref={yearRef}
          type="text"
          inputMode="numeric"
          autoComplete="bday-year"
          value={yearText}
          onChange={(e) => handleYearChange(e.target.value)}
          placeholder="1996"
          maxLength={4}
          disabled={disabled}
          aria-label="生年"
          aria-invalid={hasError}
          className={cn(
            "w-16 sm:w-20 h-8 sm:h-10 px-1 sm:px-2 text-sm text-center border rounded-md bg-white transition-colors focus:outline-none focus:ring-2 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed shrink-0",
            hasError
              ? "border-red-500 focus:ring-red-500"
              : "border-gray-300 focus:ring-blue-500",
          )}
        />
        <span className="text-sm text-gray-600 shrink-0">年</span>

        <input
          id={monthId}
          ref={monthRef}
          type="text"
          inputMode="numeric"
          autoComplete="bday-month"
          value={monthText}
          onChange={(e) => handleMonthChange(e.target.value)}
          onKeyDown={handleMonthKeyDown}
          placeholder="2"
          maxLength={2}
          disabled={disabled}
          aria-label="生月"
          aria-invalid={hasError}
          className={cn(
            "w-10 sm:w-12 h-8 sm:h-10 px-1 sm:px-2 text-sm text-center border rounded-md bg-white transition-colors focus:outline-none focus:ring-2 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed shrink-0",
            hasError
              ? "border-red-500 focus:ring-red-500"
              : "border-gray-300 focus:ring-blue-500",
          )}
        />
        <span className="text-sm text-gray-600 shrink-0">月</span>

        <input
          id={dayId}
          ref={dayRef}
          type="text"
          inputMode="numeric"
          autoComplete="bday-day"
          value={dayText}
          onChange={(e) => handleDayChange(e.target.value)}
          onKeyDown={handleDayKeyDown}
          placeholder="22"
          maxLength={2}
          disabled={disabled}
          aria-label="生日"
          aria-invalid={hasError}
          className={cn(
            "w-10 sm:w-12 h-8 sm:h-10 px-1 sm:px-2 text-sm text-center border rounded-md bg-white transition-colors focus:outline-none focus:ring-2 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed shrink-0",
            hasError
              ? "border-red-500 focus:ring-red-500"
              : "border-gray-300 focus:ring-blue-500",
          )}
        />
        <span className="text-sm text-gray-600 shrink-0">日</span>
      </div>

      {hasError && (
        <p id={errorId} className="mt-2 text-sm text-red-600" role="alert">
          {displayError}
        </p>
      )}

      {helperText && !hasError && <p className="mt-2 text-sm text-gray-500">{helperText}</p>}
    </fieldset>
  );
}
