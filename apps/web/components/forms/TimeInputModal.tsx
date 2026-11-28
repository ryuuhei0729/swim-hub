"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { XMarkIcon, InformationCircleIcon } from "@heroicons/react/24/outline";
import { formatTime, formatTimeAverage } from "@apps/shared/utils/time";
import { useQuickTimeInput } from "@/components/forms/shared/TimeInput/hooks";
import {
  formatQuickBuffer,
  quickBufferToSeconds,
  quickTimeContextFromSeconds,
  quickTypedCapacity,
  seedFromSeconds,
} from "@apps/shared/utils/quickTimeMask";

interface TimeEntry {
  id: string;
  setNumber: number;
  repNumber: number;
  time: number; // 秒単位
  displayValue?: string; // 表示用の値
  /**
   * 2本目以降のクイック入力(マスク入力)で使う「引き継ぎシード」("3" = 十の位のみ、"1.2" = 分.十の位)。
   * undefined の間は自由入力 (1本目・既存値の編集・区切り文字を打った後) で、文字列 (空文字含む) の間はマスク入力。
   * mobile PracticeTimeFormScreen と同じ仕組み
   */
  quickSeed?: string;
  /** シードに続けて打った数字 (最大2桁: 一の位・小数第1位。シードが空なら最大3桁) */
  quickTyped?: string;
}

/** クイック入力のシードと打った数字から、セルの表示値・タイムを組み立てる */
function applyQuickBuffer(entry: TimeEntry, seed: string, typed: string): TimeEntry {
  return {
    ...entry,
    quickSeed: seed,
    quickTyped: typed,
    displayValue: formatQuickBuffer(seed, typed),
    time: quickBufferToSeconds(seed, typed),
  };
}

/** マスク入力をやめて自由入力に切り替える (確定時に「2-3」形式などとして解釈する) */
function toFreeInput(entry: TimeEntry, displayValue: string): TimeEntry {
  return { ...entry, quickSeed: undefined, quickTyped: undefined, displayValue, time: 0 };
}

interface TimeInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (times: TimeEntry[]) => void;
  setCount: number;
  repCount: number;
  initialTimes?: TimeEntry[];
  menuNumber?: number; // メニュー番号を追加
}

export default function TimeInputModal({
  isOpen,
  onClose,
  onSubmit,
  setCount,
  repCount,
  initialTimes = [],
  menuNumber,
}: TimeInputModalProps) {
  const t = useTranslations("forms.timeInput");
  const tUnsaved = useTranslations("forms.unsavedChanges");
  const [times, setTimes] = useState<TimeEntry[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmContext, setConfirmContext] = useState<"close" | "back">("close");
  const [showHelp, setShowHelp] = useState(false);
  const isInitializedRef = useRef(false);
  const ignorePopStateRef = useRef(false);
  const { parseInput, resetContext, setContext } = useQuickTimeInput();

  // 全てのセット・レップの組み合わせを生成する関数
  const generateTimeCombinations = useCallback((): TimeEntry[] => {
    const allCombinations: TimeEntry[] = [];
    for (let set = 1; set <= setCount; set++) {
      for (let rep = 1; rep <= repCount; rep++) {
        const uniqueId = `${set}-${rep}-${Date.now()}-${Math.random()}`;

        // 既存のタイムデータから該当するものを検索
        const existingTime = initialTimes?.find((t) => t.setNumber === set && t.repNumber === rep);

        allCombinations.push({
          id: uniqueId,
          setNumber: set,
          repNumber: rep,
          time: existingTime?.time || 0,
          displayValue: existingTime && existingTime.time > 0 ? formatTime(existingTime.time) : "",
        });
      }
    }
    return allCombinations;
  }, [setCount, repCount, initialTimes]);

  // 依存する値が変更されたときに組み合わせを再生成
  useEffect(() => {
    if (isOpen) {
      setTimes(generateTimeCombinations());
      isInitializedRef.current = false;
      // 初期化後に少し待ってからフラグを立てる（初回設定で未保存扱いにならないようにする）
      setTimeout(() => {
        isInitializedRef.current = true;
      }, 100);
    }
  }, [setCount, repCount, initialTimes, isOpen, generateTimeCombinations]);

  // モーダルが閉じた時にリセット
  useEffect(() => {
    if (!isOpen) {
      setHasUnsavedChanges(false);
      setIsSubmitted(false);
      setShowConfirmDialog(false);
      setShowHelp(false);
      isInitializedRef.current = false;
    }
  }, [isOpen]);

  // モーダルオープン時にコンテキストをリセット
  useEffect(() => {
    if (isOpen) {
      resetContext();
    }
  }, [isOpen, resetContext]);

  // ブラウザバックでの離脱を防ぐ
  useEffect(() => {
    if (!isOpen || !hasUnsavedChanges || isSubmitted) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    const handlePopState = () => {
      if (ignorePopStateRef.current) {
        ignorePopStateRef.current = false;
        return;
      }
      if (hasUnsavedChanges && !isSubmitted) {
        window.history.pushState(null, "", window.location.href);
        setConfirmContext("back");
        setShowConfirmDialog(true);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isOpen, hasUnsavedChanges, isSubmitted]);

  const handleClose = useCallback(() => {
    if (hasUnsavedChanges && !isSubmitted) {
      setConfirmContext("close");
      setShowConfirmDialog(true);
      return;
    }
    onClose();
  }, [hasUnsavedChanges, isSubmitted, onClose]);

  const handleConfirmClose = useCallback(() => {
    if (confirmContext === "back") {
      ignorePopStateRef.current = true;
      window.history.back();
    }
    setShowConfirmDialog(false);
    onClose();
  }, [confirmContext, onClose]);

  const handleCancelClose = useCallback(() => {
    setShowConfirmDialog(false);
  }, []);

  if (!isOpen) return null;

  // 入力中は displayValue のみ更新（パースしない）
  const handleTimeChange = (id: string, value: string) => {
    setTimes((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              displayValue: value,
            }
          : t,
      ),
    );
    // フィールドを空にしたらコンテキストをリセットする。
    // これをしないと、前回入力（例: 1:12.2）の「分」がクイック入力コンテキストに残り、
    // 削除後に「33-3」を入力すると「1:33.3」に化けてしまう。
    if (!value.trim()) {
      resetContext();
    }
    // 初期化完了後の変更のみ追跡
    if (isInitializedRef.current) {
      setHasUnsavedChanges(true);
    }
  };

  // 入力確定時にパース（Enter または フォーカスアウト）
  const handleTimeConfirm = (id: string, value: string) => {
    if (!value.trim()) {
      // 空のまま blur / Enter したケースのフォールバック。
      // 通常は handleTimeChange 側の resetContext で解除済みだが、こちらでも
      // 分引き継ぎコンテキストを確実に解除する（setContextState は冪等）。
      resetContext();
      setTimes((prev) => prev.map((t) => (t.id === id ? { ...t, displayValue: "", time: 0 } : t)));
      return;
    }
    const { time, displayValue } = parseInput(value);
    setTimes((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              displayValue: displayValue || value,
              time,
            }
          : t,
      ),
    );
  };

  // 2本目以降: フォーカス時に直前の本の十の位 (分がある場合は「分.十の位」) をシードとして先に入れておく。
  // 既に触った後・既存値がある場合は上書きしない。Enter で次のセルへ移ったときは直前の本の確定が
  // まだ state に反映されていないため、関数形式の更新で最新の値を見る
  const handleQuickFocus = (globalIndex: number) => {
    setTimes((prev) => {
      const current = prev[globalIndex];
      if (!current) return prev;
      const alreadyTouched = current.quickSeed !== undefined;
      const hasExistingValue = (current.displayValue ?? "").trim() !== "";
      if (alreadyTouched || hasExistingValue) return prev;
      const prevEntry = prev[globalIndex - 1];
      // 引き継ぎ元が無い場合はシード無しでマスク入力に入る
      const seed = prevEntry && prevEntry.time > 0 ? seedFromSeconds(prevEntry.time) : "";
      return prev.map((t, i) => (i === globalIndex ? applyQuickBuffer(t, seed, "") : t));
    });
  };

  // 2本目以降のマスク入力: 数字は末尾に足し (「.」は自動で入る)、末尾の削除は打った数字 → シードの順に戻す。
  // 数字以外の区切り文字 (「2-3」の「-」など) を打ったら自由入力に切り替え、打った文字だけを残す
  // (確定時に従来どおり十の位・分を引き継いで解釈される)
  const handleQuickChange = (entry: TimeEntry, value: string) => {
    const seed = entry.quickSeed ?? "";
    const typed = entry.quickTyped ?? "";
    const current = entry.displayValue ?? "";
    let next: TimeEntry;

    if (value === "") {
      next = applyQuickBuffer(entry, "", "");
      // 空にしたら「2-3」形式の引き継ぎもリセットする (自由入力の handleTimeChange と同じ)
      resetContext();
    } else if (value.length < current.length && current.startsWith(value)) {
      let nextSeed = seed;
      let nextTyped = typed;
      while (formatQuickBuffer(nextSeed, nextTyped).length > value.length) {
        if (nextTyped.length > 0) {
          nextTyped = nextTyped.slice(0, -1);
        } else if (nextSeed.length > 0) {
          nextSeed = nextSeed.slice(0, -1);
        } else {
          break;
        }
      }
      next = applyQuickBuffer(entry, nextSeed, nextTyped);
    } else if (value.startsWith(current)) {
      const inserted = value.slice(current.length);
      const cap = quickTypedCapacity(seed);
      let nextTyped = typed;
      let switched: TimeEntry | null = null;
      for (let i = 0; i < inserted.length; i++) {
        const ch = inserted.charAt(i);
        if (/[0-9]/.test(ch)) {
          if (nextTyped.length < cap) nextTyped += ch;
          continue;
        }
        if (/\s/.test(ch)) continue;
        // 「.」は自動で入るので、入る位置・打ち始め・桁が埋まった後に打たれたものは無視する
        if (
          ch === "." &&
          (nextTyped === "" ||
            nextTyped.length >= cap ||
            formatQuickBuffer(seed, nextTyped).endsWith("."))
        ) {
          continue;
        }
        switched = toFreeInput(entry, nextTyped + inserted.slice(i));
        break;
      }
      next = switched ?? applyQuickBuffer(entry, seed, nextTyped);
    } else {
      // 途中の書き換え・選択範囲への貼り付けなどは自由入力として扱う
      next = toFreeInput(entry, value);
    }

    // 一の位まで揃ったら、このタイムを「2-3」形式の引き継ぎ元にする
    if (next.quickSeed !== undefined && next.time > 0) {
      setContext(quickTimeContextFromSeconds(next.time));
    }
    setTimes((prev) => prev.map((t) => (t.id === entry.id ? next : t)));
    if (next.displayValue !== current && isInitializedRef.current) {
      setHasUnsavedChanges(true);
    }
  };

  // フォーカスアウト: 自由入力はここで解釈して確定する。マスク入力で一の位まで打たずに離れたセルは、
  // 引き継いだシードだけが残らないよう空に戻す (次にフォーカスしたときに入れ直す)
  const handleBlur = (entry: TimeEntry, value: string) => {
    if (entry.quickSeed === undefined) {
      handleTimeConfirm(entry.id, value);
      return;
    }
    if (entry.time <= 0) {
      setTimes((prev) =>
        prev.map((t) => (t.id === entry.id ? toFreeInput(t, "") : t)),
      );
    }
  };

  // Enterキーで確定 (自由入力のみパース) ＋次のフィールドへ移動
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    currentIndex: number,
    entry: TimeEntry,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (entry.quickSeed === undefined) {
        handleTimeConfirm(entry.id, entry.displayValue || "");
      }
      const inputs = document.querySelectorAll<HTMLInputElement>("[data-time-input]");
      const nextInput = inputs[currentIndex + 1];
      if (nextInput) {
        nextInput.focus();
      }
    }
  };

  const handleSubmit = () => {
    setIsSubmitted(true);
    setHasUnsavedChanges(false);
    // クイック入力用の内部状態は保存先に渡さない
    onSubmit(times.map(({ quickSeed: _quickSeed, quickTyped: _quickTyped, ...rest }) => rest));
    onClose();
  };

  const getTimesBySet = (setNumber: number) => {
    return times.filter((te) => te.setNumber === setNumber);
  };

  const _getSetTotal = (setNumber: number) => {
    const setTimes = getTimesBySet(setNumber);
    return setTimes.reduce((sum, te) => sum + te.time, 0);
  };

  const getSetAverage = (setNumber: number) => {
    const setTimes = getTimesBySet(setNumber);
    const validTimes = setTimes.filter((te) => te.time > 0);
    if (validTimes.length === 0) return 0;
    return validTimes.reduce((sum, te) => sum + te.time, 0) / validTimes.length;
  };

  const _getOverallTotal = () => {
    return times.reduce((sum, te) => sum + te.time, 0);
  };

  const getOverallAverage = () => {
    const validTimes = times.filter((te) => te.time > 0);
    if (validTimes.length === 0) return 0;
    return validTimes.reduce((sum, te) => sum + te.time, 0) / validTimes.length;
  };

  // 最速タイム (mobile PracticeTimeFormScreen と同じく、入力済みの中で最も速いタイム)
  const getFastestTime = () => {
    const validTimes = times.filter((te) => te.time > 0);
    if (validTimes.length === 0) return 0;
    return Math.min(...validTimes.map((te) => te.time));
  };

  return (
    <div className="fixed inset-0 z-80 overflow-y-auto" data-testid="time-input-modal">
      <div className="flex min-h-screen items-center justify-center px-4 sm:px-0 py-4">
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={handleClose}></div>

        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-4xl">
          {/* ヘッダー */}
          <div className="bg-white px-3 sm:px-6 py-2 sm:py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm sm:text-lg leading-6 font-medium text-gray-900">
                  {menuNumber ? t("title", { n: menuNumber }) : t("titleGeneric")}
                </h3>
                {/* ヒントラベル + ポップオーバー */}
                <div className="relative group/help">
                  <button
                    type="button"
                    onClick={() => setShowHelp((v) => !v)}
                    onBlur={() => setShowHelp(false)}
                    className="sm:pointer-events-none flex items-center gap-0.5 text-xs text-gray-500 hover:text-gray-700"
                  >
                    <InformationCircleIcon className="h-4 w-4 shrink-0" />
                    <span>{t("helpTitle")}</span>
                  </button>
                  {/* デスクトップ: ホバーで表示 */}
                  <div className="hidden group-hover/help:sm:block absolute top-full mt-1.5 left-0 w-72 max-w-[calc(100vw-2rem)] p-3 bg-gray-800 text-white text-xs rounded shadow-lg z-50 leading-relaxed">
                    <p className="whitespace-pre-line">{t("helpBody")}</p>
                  </div>
                  {/* スマホ: タップトグル */}
                  {showHelp && (
                    <div className="sm:hidden absolute top-full mt-1.5 left-0 w-72 max-w-[calc(100vw-2rem)] p-3 bg-gray-800 text-white text-xs rounded shadow-lg z-50 leading-relaxed">
                      <p className="whitespace-pre-line">{t("helpBody")}</p>
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-500"
                onClick={handleClose}
                aria-label={t("titleGeneric")}
              >
                <XMarkIcon className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
            </div>
            <p className="text-[10px] sm:text-sm text-gray-600 mt-0.5 sm:mt-1">
              {t("subtitle", { sets: setCount, reps: repCount })}
            </p>
          </div>

          {/* タイム入力フォーム */}
          <div className="bg-white px-2 sm:px-6 py-2 sm:py-4 max-h-96 overflow-y-auto">
            <div className="space-y-3 sm:space-y-6">
              {Array.from({ length: setCount }, (_, setIndex) => {
                const setNumber = setIndex + 1;
                const setTimes = getTimesBySet(setNumber);
                const setAverage = getSetAverage(setNumber);
                const validTimesCount = setTimes.filter((te) => te.time > 0).length;

                return (
                  <div key={setNumber} className="border border-gray-200 rounded-lg p-2 sm:p-4">
                    <div className="flex items-center justify-between mb-1.5 sm:mb-4">
                      <h4 className="text-xs sm:text-md font-semibold text-gray-900">{t("setHeader", { n: setNumber })}</h4>
                      <div className="text-[10px] sm:text-sm text-gray-600">
                        {t("average")} {setAverage > 0 ? formatTimeAverage(setAverage) : t("notEntered")}
                        {validTimesCount > 0 && ` (${validTimesCount})`}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 sm:gap-3">
                      {setTimes.map((timeEntry, repIndex) => {
                        const globalIndex = setIndex * repCount + repIndex;
                        // 1本目は自由入力。2本目以降は直前の本の十の位 (と分) を引き継ぐマスク入力
                        const isQuickInputCell = globalIndex > 0;
                        return (
                          <div key={timeEntry.id}>
                            <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-0.5">
                              {t("repLabel", { n: timeEntry.repNumber })}
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="2.00.00"
                              value={timeEntry.displayValue || ""}
                              onChange={(e) =>
                                timeEntry.quickSeed !== undefined
                                  ? handleQuickChange(timeEntry, e.target.value)
                                  : handleTimeChange(timeEntry.id, e.target.value)
                              }
                              onFocus={isQuickInputCell ? () => handleQuickFocus(globalIndex) : undefined}
                              onBlur={(e) => handleBlur(timeEntry, e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, globalIndex, timeEntry)}
                              className="w-full px-1.5 sm:px-3 py-1 sm:py-2 border border-gray-300 rounded-md text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              data-testid={`time-input-${timeEntry.setNumber}-${timeEntry.repNumber}`}
                              data-time-input
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 平均値表示 */}
          <div className="bg-gray-50 px-3 sm:px-6 py-2 sm:py-3 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-medium text-gray-700">{t("overallAvg")}</span>
              <span className="text-sm sm:text-lg font-bold text-blue-600">
                {getOverallAverage() > 0 ? formatTimeAverage(getOverallAverage()) : t("notEntered")}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs sm:text-sm font-medium text-gray-700">{t("fastest")}</span>
              <span
                className="text-sm sm:text-lg font-bold text-red-600"
                data-testid="time-input-fastest"
              >
                {getFastestTime() > 0 ? formatTime(getFastestTime()) : t("notEntered")}
              </span>
            </div>
          </div>

          {/* フッター */}
          <div className="bg-gray-50 px-3 sm:px-6 py-2 sm:py-3 flex flex-col sm:flex-row-reverse gap-1.5 sm:gap-3">
            <Button
              onClick={handleSubmit}
              className="w-full sm:w-auto"
              data-testid="save-times-button"
            >
              {t("save")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="w-full sm:w-auto"
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      </div>

      {/* 確認ダイアログ */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        onConfirm={handleConfirmClose}
        onCancel={handleCancelClose}
        title={tUnsaved("title")}
        message={
          confirmContext === "back"
            ? tUnsaved("messageBack")
            : tUnsaved("messageClose")
        }
        confirmLabel={confirmContext === "back" ? tUnsaved("confirmBack") : tUnsaved("confirmClose")}
        cancelLabel={tUnsaved("cancel")}
        variant="warning"
      />
    </div>
  );
}
