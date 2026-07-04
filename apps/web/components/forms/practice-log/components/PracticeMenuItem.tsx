"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import NumberStepper from "@/components/ui/NumberStepper";
import { TrashIcon, ClockIcon } from "@heroicons/react/24/outline";
import TagInput from "../../TagInput";
import type { PracticeMenu, Tag } from "../types";
import { SWIM_STYLES, SWIM_CATEGORIES, DISTANCE_PRESETS } from "../types";
import { formatTime, formatTimeAverage } from "@/utils/formatters";
import { cn } from "@/utils/cn";
import { SelectChips, chipClass } from "./SelectChips";

interface PracticeMenuItemProps {
  menu: PracticeMenu;
  menuIndex: number;
  canRemove: boolean;
  availableTags: Tag[];
  isLoading: boolean;
  onRemove: () => void;
  onUpdate: (field: keyof PracticeMenu, value: string | number | "" | Tag[]) => void;
  onTagsChange: (tags: Tag[]) => void;
  onAvailableTagsUpdate: (tags: Tag[]) => void;
  onOpenTimeModal: () => void;
  /** メニュー見出し(「メニュー N」)を表示するか。タブ名で項目を識別する場合は false */
  showTitle?: boolean;
  /** 外枠カード(緑背景・枠線)を外し、フィールドを直接並べる。外側で枠を持つ場合に使用 */
  bare?: boolean;
  /** タグ入力と同じ行の右側に表示する要素(例: テンプレートから作成ボタン) */
  tagRowAction?: React.ReactNode;
}

/**
 * 練習メニュー入力コンポーネント
 */
export default function PracticeMenuItem({
  menu,
  menuIndex,
  canRemove,
  availableTags,
  isLoading,
  onRemove,
  onUpdate,
  onTagsChange,
  onAvailableTagsUpdate,
  onOpenTimeModal,
  showTitle = true,
  bare = false,
  tagRowAction,
}: PracticeMenuItemProps) {
  const t = useTranslations("forms.practiceMenu");
  const tPractice = useTranslations("practice");
  // 距離がプリセット外(空含む)なら「その他」入力モードで開始
  const [showCustomDistance, setShowCustomDistance] = useState(
    () =>
      menu.distance === "" ||
      !(DISTANCE_PRESETS as readonly number[]).includes(Number(menu.distance)),
  );
  return (
    <div
      className={
        bare
          ? "space-y-2 sm:space-y-4"
          : "border border-gray-200 rounded-lg p-2 sm:p-4 space-y-2 sm:space-y-4 bg-green-50"
      }
      data-testid="practice-menu-container"
    >
      {/* メニューヘッダー */}
      {(showTitle || canRemove) && (
      <div className="flex items-center justify-between">
        {showTitle && (
          <h5 className="font-medium text-gray-700">{t("header", { n: menuIndex + 1 })}</h5>
        )}
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-red-500 hover:text-red-700"
            disabled={isLoading}
            aria-label={t("removeAria", { n: menuIndex + 1 })}
            data-testid={`practice-menu-remove-button-${menuIndex + 1}`}
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        )}
      </div>
      )}

      {/* メニュー入力フィールド */}
      <div className="space-y-2 sm:space-y-4">
        {/* 1行目：タグ */}
        <div>
          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-0.5 sm:mb-2">{t("tagLabel")}</label>
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <TagInput
                selectedTags={menu.tags}
                availableTags={availableTags}
                onTagsChange={onTagsChange}
                onAvailableTagsUpdate={onAvailableTagsUpdate}
                placeholder={t("tagPlaceholder")}
              />
            </div>
            {tagRowAction && <div className="shrink-0">{tagRowAction}</div>}
          </div>
        </div>

        {/* 2行目：種目と泳法カテゴリ（チップ選択） */}
        <div className="space-y-2 sm:space-y-4">
          <div>
            <label className="block text-[10px] sm:text-sm font-medium text-gray-700 mb-0.5 sm:mb-2">
              {t("style1Label")} <span className="text-red-500">*</span>
            </label>
            <SelectChips
              options={SWIM_STYLES.map((style) => ({
                value: style.value,
                label: tPractice(`styles.${style.value}` as Parameters<typeof tPractice>[0]),
              }))}
              value={menu.style}
              onChange={(value) => onUpdate("style", value)}
              testIdPrefix="practice-style"
            />
          </div>
          <div>
            <label className="block text-[10px] sm:text-sm font-medium text-gray-700 mb-0.5 sm:mb-2">
              {t("style2Label")} <span className="text-red-500">*</span>
            </label>
            <SelectChips
              options={SWIM_CATEGORIES.map((category) => ({
                value: category.value,
                label: category.label,
              }))}
              value={menu.swimCategory}
              onChange={(value) => onUpdate("swimCategory", value as "Swim" | "Pull" | "Kick")}
              testIdPrefix="practice-swim-category"
            />
          </div>
        </div>

        {/* 3行目：距離（プリセットチップ + その他で直接入力）*/}
        <div>
          <label className="block text-[10px] sm:text-sm font-medium text-gray-700 mb-0.5 sm:mb-2">
            {t("distanceLabel")} <span className="text-red-500">*</span>
          </label>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {DISTANCE_PRESETS.map((preset) => {
              const selected = !showCustomDistance && Number(menu.distance) === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setShowCustomDistance(false);
                    onUpdate("distance", String(preset));
                  }}
                  className={cn(chipClass(selected), "min-w-12")}
                  aria-pressed={selected}
                  data-testid={`practice-distance-preset-${preset}`}
                >
                  {preset}
                </button>
              );
            })}
            {showCustomDistance ? (
              // 「その他」ボタンがその場で入力欄に変化する
              <input
                type="number"
                inputMode="numeric"
                value={menu.distance}
                onChange={(e) => onUpdate("distance", e.target.value)}
                placeholder="100"
                min={1}
                required
                autoFocus
                aria-label={t("distanceLabel")}
                data-testid="practice-distance"
                className="h-8 sm:h-10 w-20 px-3 rounded-md border border-blue-600 bg-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  onUpdate("distance", "");
                  setShowCustomDistance(true);
                }}
                className={chipClass(false)}
                data-testid="practice-distance-other"
              >
                {t("distanceOther")}
              </button>
            )}
          </div>
        </div>

        {/* 4行目：本数、セット数、サークル（分/秒）— ステッパー */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
          <div>
            <label className="block text-[10px] sm:text-sm font-medium text-gray-700 mb-0.5 sm:mb-2">
              {t("repsLabel")}<span className="text-red-500">*</span>
            </label>
            <NumberStepper
              value={menu.reps}
              onChange={(v) => onUpdate("reps", v)}
              min={1}
              step={1}
              placeholder="4"
              ariaLabel={t("repsLabel")}
              fieldLabel={t("repsLabel")}
              decreaseLabel={t("decrease")}
              increaseLabel={t("increase")}
              data-testid="practice-rep-count"
            />
          </div>

          <div>
            <label className="block text-[10px] sm:text-sm font-medium text-gray-700 mb-0.5 sm:mb-2">
              {t("setsLabel")} <span className="text-red-500">*</span>
            </label>
            <NumberStepper
              value={menu.sets}
              onChange={(v) => onUpdate("sets", v)}
              min={1}
              step={1}
              placeholder="1"
              ariaLabel={t("setsLabel")}
              fieldLabel={t("setsLabel")}
              decreaseLabel={t("decrease")}
              increaseLabel={t("increase")}
              data-testid="practice-set-count"
            />
          </div>

          <div>
            <label className="block text-[10px] sm:text-sm font-medium text-gray-700 mb-0.5 sm:mb-2">{t("circleMinLabel")}</label>
            <NumberStepper
              value={menu.circleMin}
              onChange={(v) => onUpdate("circleMin", v)}
              min={0}
              step={1}
              placeholder="1"
              ariaLabel={t("circleMinLabel")}
              fieldLabel={t("circleMinLabel")}
              decreaseLabel={t("decrease")}
              increaseLabel={t("increase")}
              data-testid="practice-circle-min"
            />
          </div>

          <div>
            <label className="block text-[10px] sm:text-sm font-medium text-gray-700 mb-0.5 sm:mb-2">{t("circleSecLabel")}</label>
            <NumberStepper
              value={menu.circleSec}
              onChange={(v) => onUpdate("circleSec", v)}
              min={0}
              max={59}
              step={10}
              placeholder="30"
              ariaLabel={t("circleSecLabel")}
              fieldLabel={t("circleSecLabel")}
              decreaseLabel={t("decrease")}
              increaseLabel={t("increase")}
              data-testid="practice-circle-sec"
            />
          </div>
        </div>

        {/* タイム入力ボタン */}
        <div>
          <label className="block text-[10px] sm:text-sm font-medium text-gray-700 mb-0.5 sm:mb-2">{t("timeLabel")}</label>
          <Button
            type="button"
            onClick={onOpenTimeModal}
            variant="outline"
            className="w-full flex items-center justify-center gap-2"
            data-testid="time-input-button"
          >
            <ClockIcon className="h-5 w-5" />
            {menu.times && menu.times.length > 0
              ? t("timeEdit", { count: menu.times.length })
              : t("timeAdd")}
          </Button>
        </div>

        {/* 既存タイム表示 */}
        {menu.times && menu.times.length > 0 && <PracticeTimesDisplay menu={menu} />}

        {/* メモ */}
        <div>
          <label className="block text-[10px] sm:text-sm font-medium text-gray-700 mb-0.5 sm:mb-2">{t("noteLabel")}</label>
          <textarea
            value={menu.note}
            onChange={(e) => onUpdate("note", e.target.value)}
            rows={2}
            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={t("notePlaceholder")}
            data-testid={`practice-log-note-${menuIndex + 1}`}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * 練習タイム表示コンポーネント
 */
function PracticeTimesDisplay({ menu }: { menu: PracticeMenu }) {
  const t = useTranslations("forms.practiceMenu");
  return (
    <div className="mt-2 sm:mt-3">
      <div className="flex items-center gap-2 mb-1.5 sm:mb-3">
        <div className="w-1 h-4 bg-blue-500 rounded-full"></div>
        <p className="text-xs sm:text-sm font-medium text-blue-700">{t("timesHeader")}</p>
      </div>
      <div className="bg-gray-50 rounded-lg p-1.5 sm:p-3 border border-gray-200 overflow-x-auto">
        <table className="w-full text-[10px] sm:text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-1 sm:py-2 px-1 sm:px-2 font-medium text-gray-800"></th>
              {Array.from({ length: Number(menu.sets) || 1 }, (_, setIndex) => (
                <th key={setIndex + 1} className="text-center py-1 sm:py-2 px-1 sm:px-2 font-medium text-gray-800 whitespace-nowrap">
                  {t("setHeader", { n: setIndex + 1 })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: Number(menu.reps) || 1 }, (_, repIndex) => {
              const repNumber = repIndex + 1;
              return (
                <tr key={repNumber} className="border-b border-gray-100">
                  <td className="py-1 sm:py-2 px-1 sm:px-2 font-medium text-gray-700 whitespace-nowrap">{t("repHeader", { n: repNumber })}</td>
                  {Array.from({ length: Number(menu.sets) || 1 }, (_, setIndex) => {
                    const setNumber = setIndex + 1;
                    const time = menu.times.find(
                      (te) => te.setNumber === setNumber && te.repNumber === repNumber,
                    );
                    const setTimes = menu.times.filter(
                      (te) => te.setNumber === setNumber && te.time > 0,
                    );
                    const setFastest =
                      setTimes.length > 0 ? Math.min(...setTimes.map((te) => te.time)) : 0;
                    const isFastest = time && time.time > 0 && time.time === setFastest;

                    return (
                      <td key={setNumber} className="py-1 sm:py-2 px-1 sm:px-2 text-center">
                        <span className={isFastest ? "text-blue-600 font-bold" : "text-gray-800"}>
                          {time && time.time > 0 ? formatTime(time.time) : "-"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {/* 平均行 */}
            <tr className="border-b border-gray-100 bg-gray-100">
              <td className="py-1 sm:py-2 px-1 sm:px-2 font-medium text-gray-800 whitespace-nowrap">{t("avgRow")}</td>
              {Array.from({ length: Number(menu.sets) || 1 }, (_, setIndex) => {
                const setNumber = setIndex + 1;
                const setTimes = menu.times.filter((te) => te.setNumber === setNumber && te.time > 0);
                const average =
                  setTimes.length > 0
                    ? setTimes.reduce((sum: number, te) => sum + te.time, 0) / setTimes.length
                    : 0;
                return (
                  <td key={setNumber} className="py-1 sm:py-2 px-1 sm:px-2 text-center">
                    <span className="text-gray-800 font-medium">
                      {average > 0 ? formatTimeAverage(average) : "-"}
                    </span>
                  </td>
                );
              })}
            </tr>
            {/* 全体平均行 */}
            <tr className="border-t-2 border-gray-300 bg-blue-50">
              <td
                className="py-1 sm:py-2 px-1 sm:px-2 font-medium text-blue-800 whitespace-nowrap"
                data-testid="practice-overall-average"
              >
                {t("overallAvg")}
              </td>
              <td className="py-1 sm:py-2 px-1 sm:px-2 text-center" colSpan={Number(menu.sets) || 1}>
                <span className="text-blue-800 font-bold">
                  {(() => {
                    const allValidTimes = menu.times.filter((te) => te.time > 0);
                    const overallAverage =
                      allValidTimes.length > 0
                        ? allValidTimes.reduce((sum: number, te) => sum + te.time, 0) /
                          allValidTimes.length
                        : 0;
                    return overallAverage > 0 ? formatTimeAverage(overallAverage) : "-";
                  })()}
                </span>
              </td>
            </tr>
            {/* 全体最速行 */}
            <tr className="bg-blue-50">
              <td
                className="py-2 px-2 font-medium text-blue-800"
                data-testid="practice-overall-fastest"
              >
                {t("overallFastest")}
              </td>
              <td className="py-1 sm:py-2 px-1 sm:px-2 text-center" colSpan={Number(menu.sets) || 1}>
                <span className="text-blue-800 font-bold">
                  {(() => {
                    const allValidTimes = menu.times.filter((te) => te.time > 0);
                    const overallFastest =
                      allValidTimes.length > 0 ? Math.min(...allValidTimes.map((te) => te.time)) : 0;
                    return overallFastest > 0 ? formatTime(overallFastest) : "-";
                  })()}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
