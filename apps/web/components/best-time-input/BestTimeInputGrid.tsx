"use client";

import React, { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { parseTimeFlexible, formatTimeBest } from "@apps/shared/utils/time";
import {
  INPUT_GRID_DISTANCES,
  INPUT_GRID_STYLE_KEYS,
  buildCurrentBestMap,
  findInputGridStyle,
  getCellKey,
  getInputGridStyleById,
  isEnterableCell,
  isEnteredButInvalid,
  type BestTimeInputMap,
  type CurrentBestSource,
  type InputGridStyleKey,
} from "@apps/shared/utils/bestTimeInputGrid";

// 種目ごとの色 (ダッシュボードのベストタイム表と同じ)
const HEADER_BG: Record<InputGridStyleKey, string> = {
  Fr: "bg-yellow-100",
  Br: "bg-green-100",
  Ba: "bg-red-100",
  Fly: "bg-blue-100",
  IM: "bg-pink-100",
};
const CELL_BG: Record<InputGridStyleKey, string> = {
  Fr: "bg-yellow-50",
  Br: "bg-green-50",
  Ba: "bg-red-50",
  Fly: "bg-blue-50",
  IM: "bg-pink-50",
};

export interface BestTimeInputGridProps {
  bestTimes: readonly CurrentBestSource[];
  poolType: 0 | 1;
  isRelaying: boolean;
  inputs: BestTimeInputMap;
  onUpdateCell: (key: string, field: "time" | "note", value: string) => void;
  onClearCell: (key: string) => void;
  disabled: boolean;
}

/**
 * ダッシュボードのベストタイム表の入力モード (mobile と同じ仕様)。
 * 表の形はそのままで、マスを押すと表の下に入力欄が開く。開いたまま別のマスを押すと切り替わる。
 * 水路と「引き継ぎ」は表の上の切り替え (BestTimesTable) で選ぶ。切り替えると呼び出し元が key を
 * 変えて作り直すので、選択中のマスもそこで閉じる。
 */
export default function BestTimeInputGrid({
  bestTimes,
  poolType,
  isRelaying,
  inputs,
  onUpdateCell,
  onClearCell,
  disabled,
}: BestTimeInputGridProps) {
  const t = useTranslations("mypage.bestTimesTable");
  const tStyles = useTranslations("practice.styles");
  const tStyleAbbrev = useTranslations("practice.styleAbbrev");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const currentBest = useMemo(() => buildCurrentBestMap(bestTimes), [bestTimes]);
  const poolLabel = poolType === 0 ? t("shortCourse") : t("longCourse");
  const relaySuffix = isRelaying ? ` · ${t("edit.relayTag")}` : "";

  const selectedStyle = selectedKey
    ? getInputGridStyleById(Number(selectedKey.split("_")[0]))
    : undefined;

  return (
    <div className="@container space-y-2" data-testid="best-time-input-grid">
      <p className={`text-xs ${isRelaying ? "font-semibold text-blue-600" : "text-gray-500"}`}>
        {isRelaying ? t("edit.relayModeHint") : t("edit.tapHint")}
      </p>

      <div className="bg-white rounded-none sm:rounded-xl shadow border-y sm:border border-gray-300 -mx-4 sm:mx-0 overflow-hidden">
        <table className="w-full table-fixed border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="px-0.5 @lg:px-2 py-0.5 @lg:py-1 text-left text-[9px] @lg:text-xs font-semibold text-gray-700 border-r border-gray-300 w-[36px] @lg:w-[52px] h-[24px] @lg:h-[32px]">
                {t("distanceHeader")}
              </th>
              {INPUT_GRID_STYLE_KEYS.map((key) => (
                <th
                  key={key}
                  className={`px-0.5 @lg:px-1 py-0.5 @lg:py-1 text-center text-[9px] @lg:text-xs font-semibold text-gray-800 border-r border-gray-300 last:border-r-0 h-[24px] @lg:h-[32px] ${HEADER_BG[key]}`}
                >
                  <span className="@lg:hidden">{tStyleAbbrev(key)}</span>
                  <span className="hidden @lg:inline">{tStyles(key)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {INPUT_GRID_DISTANCES.map((distance) => (
              <tr key={distance}>
                <td className="px-0.5 @lg:px-2 text-[9px] @lg:text-xs font-semibold text-gray-600 border-r border-t border-gray-300 bg-gray-50 h-[32px] @lg:h-[36px]">
                  {distance}m
                </td>
                {INPUT_GRID_STYLE_KEYS.map((key) => {
                  const style = findInputGridStyle(key, distance);
                  const baseCell =
                    "border-r border-t border-gray-300 last:border-r-0 h-[32px] @lg:h-[36px] p-0";
                  if (!isEnterableCell(style, poolType, isRelaying)) {
                    return <td key={key} className={`${baseCell} bg-gray-200`} aria-hidden="true" />;
                  }
                  const cellKey = getCellKey(style.id, poolType, isRelaying);
                  const entered = inputs[cellKey]?.time ?? "";
                  const best = currentBest.get(cellKey);
                  const invalid = isEnteredButInvalid(entered);
                  const isSelected = selectedKey === cellKey;
                  const styleName = `${distance}m ${tStyles(key)}`;
                  const state = entered
                    ? t("edit.cellEntered", { time: entered })
                    : best !== undefined
                      ? t("edit.currentBest", { time: formatTimeBest(best) })
                      : t("edit.cellEmpty");
                  return (
                    <td key={key} className={`${baseCell} ${CELL_BG[key]}`}>
                      <button
                        type="button"
                        data-testid={`best-time-input-cell-${cellKey}`}
                        aria-pressed={isSelected}
                        aria-label={`${styleName} ${poolLabel}${relaySuffix} ${state}`}
                        disabled={disabled}
                        onClick={() => setSelectedKey(isSelected ? null : cellKey)}
                        className={`flex h-full w-full flex-col items-center justify-center leading-tight transition-colors hover:bg-white/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset ${
                          isSelected
                            ? "ring-2 ring-inset ring-blue-600"
                            : invalid
                              ? "ring-2 ring-inset ring-red-500"
                              : ""
                        }`}
                      >
                        {entered ? (
                          <>
                            <span
                              className={`text-[10px] @lg:text-sm font-semibold ${invalid ? "text-red-600" : "text-blue-600"}`}
                            >
                              {entered}
                              {isRelaying && <span className="ml-0.5 text-[8px] @lg:text-[10px]">R</span>}
                            </span>
                            {best !== undefined && !invalid && (
                              <span className="text-[8px] @lg:text-[10px] text-gray-400 line-through">
                                {formatTimeBest(best)}
                              </span>
                            )}
                          </>
                        ) : best !== undefined ? (
                          <span className="text-[10px] @lg:text-sm font-semibold text-gray-900">
                            {formatTimeBest(best)}
                            {isRelaying && <span className="ml-0.5 text-[8px] @lg:text-[10px]">R</span>}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">＋</span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedKey && selectedStyle && (
        <BestTimeCellEditor
          key={selectedKey}
          title={`${selectedStyle.distance}m ${tStyles(selectedStyle.styleKey)}`}
          subtitle={`${poolLabel}${relaySuffix}`}
          time={inputs[selectedKey]?.time ?? ""}
          note={inputs[selectedKey]?.note ?? ""}
          currentBest={currentBest.get(selectedKey)}
          disabled={disabled}
          onChangeTime={(v) => onUpdateCell(selectedKey, "time", v)}
          onChangeNote={(v) => onUpdateCell(selectedKey, "note", v)}
          onClear={() => onClearCell(selectedKey)}
          onDone={() => setSelectedKey(null)}
        />
      )}
    </div>
  );
}

// =============================================================================
// 選んだマスの入力欄
// =============================================================================

interface BestTimeCellEditorProps {
  title: string;
  subtitle: string;
  time: string;
  note: string;
  currentBest: number | undefined;
  disabled: boolean;
  onChangeTime: (value: string) => void;
  onChangeNote: (value: string) => void;
  onClear: () => void;
  onDone: () => void;
}

function BestTimeCellEditor({
  title,
  subtitle,
  time,
  note,
  currentBest,
  disabled,
  onChangeTime,
  onChangeNote,
  onClear,
  onDone,
}: BestTimeCellEditorProps) {
  const t = useTranslations("mypage.bestTimesTable");
  const tBulk = useTranslations("bulkBestTime");
  const tOnboarding = useTranslations("onboarding.step3");
  const [showNote, setShowNote] = useState(() => note !== "");
  const invalid = isEnteredButInvalid(time);
  const parsed = parseTimeFlexible(time);
  const slower = parsed !== null && currentBest !== undefined && parsed > currentBest;

  // 確定したら表示を揃える (練習タイム・大会記録の入力と同じ)。形式が正しくない値はそのまま残す
  const handleBlur = () => {
    if (parsed !== null) onChangeTime(formatTimeBest(parsed));
  };

  // Enter / Esc で閉じる
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      handleBlur();
      onDone();
    }
  };

  return (
    <div
      className="rounded-xl border border-gray-200 bg-white p-3 shadow-md space-y-2"
      data-testid="best-time-cell-editor"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-sm font-bold text-gray-900">
          {title}
          <span className="ml-2 text-xs font-normal text-gray-500">{subtitle}</span>
        </p>
        <p className="shrink-0 text-xs text-gray-500">
          {currentBest !== undefined
            ? t("edit.currentBest", { time: formatTimeBest(currentBest) })
            : t("edit.noCurrentBest")}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          autoFocus
          autoComplete="off"
          value={time}
          onChange={(e) => onChangeTime(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={tOnboarding("timePlaceholder")}
          disabled={disabled}
          aria-label={`${title} ${subtitle}`}
          aria-invalid={invalid}
          className={`h-10 min-w-0 flex-1 rounded-lg border-2 px-3 text-lg font-bold tabular-nums text-gray-900 focus:outline-none ${
            invalid ? "border-red-500" : "border-blue-600"
          }`}
        />
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {t("edit.clear")}
        </button>
        <button
          type="button"
          onClick={onDone}
          data-testid="best-time-cell-editor-done"
          className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {t("edit.done")}
        </button>
      </div>

      {invalid && (
        <p role="alert" className="text-xs text-red-600">
          {tBulk("error.invalidTimeFormat")}
        </p>
      )}
      {slower && <p className="text-xs text-amber-700">{t("edit.slowerThanBest")}</p>}

      {showNote ? (
        <input
          type="text"
          value={note}
          onChange={(e) => onChangeNote(e.target.value)}
          placeholder={t("edit.notePlaceholder")}
          disabled={disabled}
          aria-label={`${title} ${t("edit.notePlaceholder")}`}
          className="h-9 w-full rounded-md border border-gray-300 px-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowNote(true)}
          disabled={disabled}
          className="rounded-full border border-dashed border-gray-300 px-2.5 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
        >
          {t("edit.addNote")}
        </button>
      )}
    </div>
  );
}
