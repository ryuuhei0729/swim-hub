"use client";

import React, { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AcademicCapIcon, BuildingLibraryIcon, GlobeAltIcon } from "@heroicons/react/24/outline";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { cn } from "@/utils/cn";
import { SWIM_STYLES } from "@apps/shared/types";
import { calculateWaPoints, getWaBaseTime, type Gender, type PoolType } from "@apps/shared/utils/waPoints";
import {
  evaluateStandardTime,
  getSelectableEvents,
  getTochuStandardTime,
  getTokoStandardTime,
} from "@apps/shared/utils/regionalStandardTimes";
import type { StyleTranslationKey } from "@apps/shared/utils/swimStyles";
import { formatSignedSeconds, formatTime, isInvalidTimeInput, parseTimeFlexible } from "@apps/shared/utils/time";

// カード表示状態。3指標は独立して判定するため、種目/距離/水路の組合せごとに
// 個別に算出する (1つが空でも他を潰さない)。
type CardResult =
  | { kind: "no-time" }
  | { kind: "lcm-only" }
  | { kind: "no-standard" }
  | { kind: "points-only"; baseTime: number; points: number }
  | { kind: "with-standard"; baseTime: number; points: number; cleared: boolean; diffLabel: string };

export default function TimeLevelClient() {
  const t = useTranslations("timeLevel");
  const tPractice = useTranslations("practice");
  const tCommon = useTranslations("common");

  const [gender, setGender] = useState<Gender>(0);
  const [poolType, setPoolType] = useState<PoolType>(1);
  const [styleKey, setStyleKey] = useState<StyleTranslationKey>("Fr");
  const [distance, setDistance] = useState<number>(50);
  const [timeInput, setTimeInput] = useState("");

  const events = useMemo(() => getSelectableEvents(gender), [gender]);

  // SWIM_STYLES の順で種目選択肢を導出 (ハードコード対応表を持たず、events から動的に導出する)
  const availableStyles = useMemo(() => {
    const present = new Set(events.map((e) => e.styleKey));
    return SWIM_STYLES.filter((style): style is StyleTranslationKey => present.has(style));
  }, [events]);

  const distancesForStyle = useMemo(
    () => events.filter((e) => e.styleKey === styleKey).map((e) => e.distance),
    [events, styleKey],
  );

  // 性別を切り替えて現在の (種目, 距離) の組が無効になったら、有効な組にリセットする (D8)。
  // useEffect ではなくイベントハンドラ内で同期して行い、無効な中間状態を描画しない。
  const handleGenderChange = (nextGender: Gender) => {
    setGender(nextGender);
    const nextEvents = getSelectableEvents(nextGender);
    const stillValid = nextEvents.some((e) => e.styleKey === styleKey && e.distance === distance);
    if (!stillValid) {
      const fallback = nextEvents.find((e) => e.styleKey === styleKey) ?? nextEvents[0];
      if (fallback) {
        setStyleKey(fallback.styleKey);
        setDistance(fallback.distance);
      }
    }
  };

  // 種目を切り替えて現在の距離が無効になったら、その種目の最小距離にリセットする。
  const handleStyleChange = (nextStyleKey: StyleTranslationKey) => {
    setStyleKey(nextStyleKey);
    const stillValid = events.some((e) => e.styleKey === nextStyleKey && e.distance === distance);
    if (!stillValid) {
      const fallback = events.find((e) => e.styleKey === nextStyleKey);
      if (fallback) setDistance(fallback.distance);
    }
  };

  const isInvalid = isInvalidTimeInput(timeInput);
  // parseTimeFlexible は空文字・不正形式・0以下いずれも null を返すため、
  // 「タイムを入力してください」系の空状態はこの1箇所で吸収できる (D7)。
  const parsedTime = parseTimeFlexible(timeInput);

  const waResult: CardResult = useMemo(() => {
    if (parsedTime === null) return { kind: "no-time" };
    const baseTime = getWaBaseTime(poolType, gender, styleKey, distance);
    if (baseTime === null) return { kind: "no-standard" };
    return { kind: "points-only", baseTime, points: calculateWaPoints(baseTime, parsedTime) };
  }, [parsedTime, poolType, gender, styleKey, distance]);

  const tochuResult: CardResult = useMemo(() => {
    if (parsedTime === null) return { kind: "no-time" };
    if (poolType === 0) return { kind: "lcm-only" };
    const baseTime = getTochuStandardTime(gender, styleKey, distance);
    if (baseTime === null) return { kind: "no-standard" };
    const evaluation = evaluateStandardTime(baseTime, parsedTime);
    // parsedTime は parseTimeFlexible 通過後 (有限かつ正)、baseTime もテーブル上の正の
    // 定数のみなので、この分岐は現在の UI からは到達不能。evaluateStandardTime が
    // `StandardTimeEvaluation | null` を返す型になったことに伴う防御的な分岐であり、
    // 到達不能パスのための新規文言は追加せず既存の「基準タイムなし」空状態に合流させる。
    if (evaluation === null) return { kind: "no-standard" };
    return {
      kind: "with-standard",
      baseTime,
      points: evaluation.points,
      cleared: evaluation.cleared,
      diffLabel: formatSignedSeconds(evaluation.diffSeconds),
    };
  }, [parsedTime, poolType, gender, styleKey, distance]);

  const tokoResult: CardResult = useMemo(() => {
    if (parsedTime === null) return { kind: "no-time" };
    if (poolType === 0) return { kind: "lcm-only" };
    const baseTime = getTokoStandardTime(gender, styleKey, distance);
    if (baseTime === null) return { kind: "no-standard" };
    const evaluation = evaluateStandardTime(baseTime, parsedTime);
    // 到達不能パス。理由は tochuResult 側のコメントと同じ
    if (evaluation === null) return { kind: "no-standard" };
    return {
      kind: "with-standard",
      baseTime,
      points: evaluation.points,
      cleared: evaluation.cleared,
      diffLabel: formatSignedSeconds(evaluation.diffSeconds),
    };
  }, [parsedTime, poolType, gender, styleKey, distance]);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6 space-y-4">
          {/* 性別 */}
          <div>
            <span className="block text-sm font-medium text-gray-700 mb-2">{t("genderLabel")}</span>
            <div
              className="grid grid-cols-2 h-10 rounded-lg border border-gray-300 overflow-hidden"
              role="group"
              aria-label={t("genderLabel")}
            >
              <button
                type="button"
                onClick={() => handleGenderChange(0)}
                aria-pressed={gender === 0}
                className={cn(
                  "px-3 text-sm transition-colors",
                  gender === 0 ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50",
                )}
              >
                {t("genderMale")}
              </button>
              <button
                type="button"
                onClick={() => handleGenderChange(1)}
                aria-pressed={gender === 1}
                className={cn(
                  "px-3 text-sm transition-colors border-l border-gray-300",
                  gender === 1 ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50",
                )}
              >
                {t("genderFemale")}
              </button>
            </div>
          </div>

          {/* 水路 */}
          <div>
            <span className="block text-sm font-medium text-gray-700 mb-2">{t("poolTypeLabel")}</span>
            <div
              className="grid grid-cols-2 h-10 rounded-lg border border-gray-300 overflow-hidden"
              role="group"
              aria-label={t("poolTypeLabel")}
            >
              <button
                type="button"
                onClick={() => setPoolType(0)}
                aria-pressed={poolType === 0}
                className={cn(
                  "px-3 text-sm transition-colors",
                  poolType === 0 ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50",
                )}
              >
                {tCommon("poolTypeShort")}
              </button>
              <button
                type="button"
                onClick={() => setPoolType(1)}
                aria-pressed={poolType === 1}
                className={cn(
                  "px-3 text-sm transition-colors border-l border-gray-300",
                  poolType === 1 ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50",
                )}
              >
                {tCommon("poolTypeLong")}
              </button>
            </div>
          </div>

          {/* 種目・距離 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="time-level-style" className="block text-sm font-medium text-gray-700 mb-2">
                {t("styleLabel")}
              </label>
              <select
                id="time-level-style"
                value={styleKey}
                onChange={(e) => handleStyleChange(e.target.value as StyleTranslationKey)}
                className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {availableStyles.map((style) => (
                  <option key={style} value={style}>
                    {tPractice(`styles.${style}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="time-level-distance" className="block text-sm font-medium text-gray-700 mb-2">
                {t("distanceLabel")}
              </label>
              <select
                id="time-level-distance"
                value={distance}
                onChange={(e) => setDistance(Number(e.target.value))}
                className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {distancesForStyle.map((d) => (
                  <option key={d} value={d}>
                    {d}m
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* タイム */}
          <Input
            id="time-level-time"
            label={t("timeLabel")}
            type="text"
            value={timeInput}
            onChange={(e) => setTimeInput(e.target.value)}
            onBlur={(e) => {
              const parsed = parseTimeFlexible(e.target.value);
              if (parsed !== null) setTimeInput(formatTime(parsed));
            }}
            placeholder={t("timePlaceholder")}
            error={isInvalid ? t("invalidTimeFormat") : undefined}
            data-testid="time-level-time-input"
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ResultCard
          icon={<GlobeAltIcon className="h-5 w-5 text-blue-600" />}
          titleKey="wa.title"
          result={waResult}
        />
        <ResultCard
          icon={<AcademicCapIcon className="h-5 w-5 text-blue-600" />}
          titleKey="tochu.title"
          noteKey="tochu.note"
          result={tochuResult}
        />
        <ResultCard
          icon={<BuildingLibraryIcon className="h-5 w-5 text-blue-600" />}
          titleKey="toko.title"
          noteKey="toko.note"
          result={tokoResult}
        />
      </div>
    </div>
  );
}

function ResultCard({
  icon,
  titleKey,
  noteKey,
  result,
}: {
  icon: React.ReactNode;
  titleKey: "wa.title" | "tochu.title" | "toko.title";
  noteKey?: "tochu.note" | "toko.note";
  result: CardResult;
}) {
  const t = useTranslations("timeLevel");

  // CardResult の kind を網羅的に描画する。将来 kind が追加されたときに描画を
  // 書き忘れるとここでコンパイルエラーになる (default 節の never チェック)。
  let body: React.ReactNode;
  switch (result.kind) {
    case "no-time":
      body = <p className="text-sm text-gray-400">{t("emptyEnterTime")}</p>;
      break;
    case "lcm-only":
      body = <p className="text-sm text-gray-400">{t("lcmOnly")}</p>;
      break;
    case "no-standard":
      body = <p className="text-sm text-gray-400">{t("noStandardTime")}</p>;
      break;
    case "points-only":
      body = (
        <div className="space-y-1.5">
          <p className="text-3xl font-bold text-blue-700">
            {result.points}
            <span className="text-sm font-normal text-gray-500 ml-1">{t("pointsUnit")}</span>
          </p>
          <p className="text-xs text-gray-500">
            {t("baseTimeLabel")}: {formatTime(result.baseTime)}
          </p>
        </div>
      );
      break;
    case "with-standard":
      body = (
        <div className="space-y-1.5">
          <p className="text-3xl font-bold text-blue-700">
            {result.points}
            <span className="text-sm font-normal text-gray-500 ml-1">{t("pointsUnit")}</span>
          </p>
          <p className="text-xs text-gray-500">
            {t("baseTimeLabel")}: {formatTime(result.baseTime)}
          </p>
          <p className={cn("text-sm font-medium", result.cleared ? "text-green-600" : "text-gray-500")}>
            {result.cleared ? t("cleared") : t("notCleared")}
            <span className="ml-1 text-xs text-gray-400">({result.diffLabel})</span>
          </p>
        </div>
      );
      break;
    default: {
      const _exhaustive: never = result;
      body = _exhaustive;
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {icon}
          {t(titleKey)}
        </CardTitle>
        {noteKey && <p className="text-xs text-gray-400 leading-relaxed">{t(noteKey)}</p>}
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
