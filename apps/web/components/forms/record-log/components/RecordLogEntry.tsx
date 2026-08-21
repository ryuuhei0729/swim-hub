"use client";

import React, { useMemo } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { TrashIcon } from "@heroicons/react/24/outline";
import { formatTimeBest } from "@/utils/formatters";
import { isInvalidTimeInput, parseTimeFlexible } from "@apps/shared/utils/time";
import { styleIdToCodeKey, canStyleRelay, type StyleCodeKey } from "@/utils/swimStyle";
import { LapTimeDisplay } from "../../LapTimeDisplay";
import type { EntryInfo } from "@apps/shared/types/ui";
import type { RecordLogFormState, StyleOption } from "../types";
import type { BestTime } from "@/types/member-detail";
import PremiumBadge from "@/components/ui/PremiumBadge";
import { FREE_PLAN_LIMITS } from "@swim-hub/shared/constants/premium";

const VideoUploader = dynamic(() => import("@/components/video/VideoUploader"), { ssr: false });

const isDbUuid = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

interface RecordLogEntryProps {
  formData: RecordLogFormState;
  index: number;
  entryInfo?: EntryInfo;
  styles: StyleOption[];
  /** プールタイプ（0: 短水路, 1: 長水路） */
  poolType: number;
  /** ユーザーのベストタイム一覧 */
  bestTimes: BestTime[];
  isLoading: boolean;
  onTimeChange: (value: string) => void;
  onToggleRelaying: (checked: boolean) => void;
  onNoteChange: (value: string) => void;
  onVideoPathChange: (videoPath: string, thumbnailPath: string) => void;
  onVideoDelete: () => void;
  recordId?: string;
  videoPath?: string | null;
  videoThumbnailPath?: string | null;
  onReactionTimeChange: (value: string) => void;
  onStyleChange: (value: string) => void;
  onAddSplitTime: () => void;
  onAddSplitTimesEvery25m: () => void;
  onAddSplitTimesEvery50m: () => void;
  onRemoveSplitTime: (splitIndex: number) => void;
  onSplitTimeChange: (splitIndex: number, field: "distance" | "splitTime", value: string) => void;
  isSplitTimeLimitReached?: boolean;
  isPremium?: boolean;
  /** 新規作成時に動画が選択／取消しされた場合の通知（id が undefined の場合のみ使用） */
  onPendingFile?: (file: File | null, thumbnail: Blob | null) => void;
  /** 種目見出し(「種目 N」)を表示するか。タブ名で項目を識別する場合は false */
  showTitle?: boolean;
  /** 外枠カード(枠線・背景)を外し、フィールドを直接並べる。外側で枠を持つ場合に使用 */
  bare?: boolean;
  /** 種目カード自体を削除できるか (カードが2件以上の場合のみ true にする想定) */
  canRemove?: boolean;
  /** 種目カード削除ボタンのハンドラ。canRemove が true の場合のみ表示に使用される */
  onRemove?: () => void;
}

/**
 * 記録ログエントリ入力コンポーネント
 */
export default function RecordLogEntry({
  formData,
  index,
  entryInfo,
  styles,
  poolType,
  bestTimes,
  isLoading,
  onTimeChange,
  onToggleRelaying,
  onNoteChange,
  onVideoPathChange,
  onVideoDelete,
  recordId,
  videoPath,
  videoThumbnailPath,
  onReactionTimeChange,
  onStyleChange,
  onAddSplitTime,
  onAddSplitTimesEvery25m,
  onAddSplitTimesEvery50m,
  onRemoveSplitTime,
  onSplitTimeChange,
  isSplitTimeLimitReached = false,
  isPremium = false,
  onPendingFile,
  showTitle = true,
  bare = false,
  canRemove = false,
  onRemove,
}: RecordLogEntryProps) {
  const t = useTranslations("forms.recordLog");
  const tPremium = useTranslations("forms.premium");
  const tStyles = useTranslations("practice.styles");
  const tTimeError = useTranslations("bulkBestTime.error");
  const sectionIndex = index + 1;

  // 不正形式（"1.23.45" 等）は time=0 のまま確定されないため、入力欄でエラー表示する
  const timeFormatInvalid = isInvalidTimeInput(formData.timeDisplayValue);

  const currentStyleId = formData.styleId;
  const currentStyle = styles.find((s) => s.id.toString() === currentStyleId);
  const raceDistance = currentStyle?.distance;
  const currentCodeKey = currentStyle ? styleIdToCodeKey(currentStyle.id) : undefined;

  // entryInfo は呼び出し側で index ベースに渡されることがあり、必ずしもこのレコードの種目と
  // 対応しているとは限らない（例: 別種目のレコードを追加した場合）。
  // 種目が一致する場合のみエントリータイムバッジを表示するガード。
  // 新規作成時の自動生成フロー（エントリー→レコードが種目一致の1:1で並ぶ）では常に一致するため、
  // 従来通りバッジが表示される。
  const entryMatchesCurrentStyle =
    !!entryInfo && entryInfo.styleId != null && String(entryInfo.styleId) === currentStyleId;

  // 種目を「距離」×「CodeKey」でグルーピング (locale 非依存)
  const distanceOptions = Array.from(new Set(styles.map((s) => s.distance))).sort(
    (a, b) => a - b,
  );

  // CodeKey の出現順を保持
  const codeKeyOrder: StyleCodeKey[] = [];
  styles.forEach((s) => {
    const ck = styleIdToCodeKey(s.id);
    if (ck && !codeKeyOrder.includes(ck)) codeKeyOrder.push(ck);
  });

  const findStyleIdByCodeKey = (d: number | undefined, ck: StyleCodeKey | undefined): string | undefined => {
    if (d === undefined || ck === undefined) return undefined;
    const found = styles.find((s) => s.distance === d && styleIdToCodeKey(s.id) === ck);
    return found ? found.id.toString() : undefined;
  };

  // 選択中の距離で入力可能な CodeKey のみ
  const codeKeysForCurrentDistance = codeKeyOrder.filter((ck) =>
    styles.some((s) => s.distance === raceDistance && styleIdToCodeKey(s.id) === ck),
  );

  // リレー種目として選択可能かどうか (canStyleRelay に委譲)
  const canRelay =
    currentStyle != null && canStyleRelay(currentStyle.id, currentStyle.distance);

  // 現在の種目・プールタイプ・リレーフラグに基づいてベストタイムを取得（優先順位付き）
  // リレーOFFの場合: 1. 同じ水路・非リレー → 2. 同じ水路・リレー → 3. 異なる水路・非リレー → 4. 異なる水路・リレー
  // リレーONの場合: 1. 同じ水路・リレー → 2. 同じ水路・非リレー → 3. 異なる水路・リレー → 4. 異なる水路・非リレー
  const currentBestTime = useMemo((): { time: number; label: string } | null => {
    if (!currentStyle || !bestTimes.length) return null;

    const styleName = currentStyle.nameJp;
    const isRelaying = formData.isRelaying;
    const otherPoolType = poolType === 0 ? 1 : 0;
    const otherPoolLabelKey = poolType === 0 ? "bestTimeLong" : "bestTimeShort";
    const otherPoolRelayLabelKey = poolType === 0 ? "bestTimeLongRelay" : "bestTimeShortRelay";

    // 同じ水路のベストタイムを検索
    const samePool = bestTimes.find(
      (bt) => bt.style.name_jp === styleName && bt.pool_type === poolType,
    );
    // 異なる水路のベストタイムを検索
    const otherPool = bestTimes.find(
      (bt) => bt.style.name_jp === styleName && bt.pool_type === otherPoolType,
    );

    if (isRelaying) {
      // リレーONの場合の優先順位
      // 1. 同じ水路・リレー
      if (samePool?.relayingTime) {
        return { time: samePool.relayingTime.time, label: t("bestTimeRelay") };
      }
      // 2. 同じ水路・非リレー
      if (samePool && !samePool.is_relaying) {
        return { time: samePool.time, label: t("bestTimeLabel") };
      }
      // 3. 異なる水路・リレー
      if (otherPool?.relayingTime) {
        return { time: otherPool.relayingTime.time, label: t(otherPoolRelayLabelKey) };
      }
      // 4. 異なる水路・非リレー
      if (otherPool && !otherPool.is_relaying) {
        return { time: otherPool.time, label: t(otherPoolLabelKey) };
      }
    } else {
      // リレーOFFの場合の優先順位
      // 1. 同じ水路・非リレー
      if (samePool && !samePool.is_relaying) {
        return { time: samePool.time, label: t("bestTimeLabel") };
      }
      // 2. 同じ水路・リレー
      if (samePool?.relayingTime) {
        return { time: samePool.relayingTime.time, label: t("bestTimeRelay") };
      }
      // 3. 異なる水路・非リレー
      if (otherPool && !otherPool.is_relaying) {
        return { time: otherPool.time, label: t(otherPoolLabelKey) };
      }
      // 4. 異なる水路・リレー
      if (otherPool?.relayingTime) {
        return { time: otherPool.relayingTime.time, label: t(otherPoolRelayLabelKey) };
      }
    }

    return null;
  }, [currentStyle, bestTimes, poolType, formData.isRelaying, t]);

  // スプリットタイムを距離でソート
  const sortedSplitTimes = [...formData.splitTimes]
    .sort((a, b) => {
      const distA =
        typeof a.distance === "number"
          ? a.distance
          : a.distance === ""
            ? 0
            : parseFloat(String(a.distance)) || 0;
      const distB =
        typeof b.distance === "number"
          ? b.distance
          : b.distance === ""
            ? 0
            : parseFloat(String(b.distance)) || 0;
      return distA - distB;
    })
    .map((st) => {
      const originalIndex = formData.splitTimes.findIndex((s) => s.uiKey === st.uiKey);
      return { st, originalIndex };
    });

  // 有効なスプリットタイムを取得
  const validSplitTimes = formData.splitTimes
    .map((st) => {
      const distance =
        typeof st.distance === "number"
          ? st.distance
          : st.distance === ""
            ? NaN
            : parseFloat(String(st.distance));
      if (!isNaN(distance) && distance > 0 && st.splitTime > 0) {
        return { distance, splitTime: st.splitTime };
      }
      return null;
    })
    .filter((st): st is { distance: number; splitTime: number } => st !== null);

  return (
    <div
      className={
        bare
          ? "space-y-2 sm:space-y-4"
          : "rounded-xl border border-gray-200 bg-gray-50/60 p-3 sm:p-6 space-y-2 sm:space-y-4"
      }
      data-testid={`record-entry-section-${sectionIndex}`}
    >
      {(showTitle ||
        (entryMatchesCurrentStyle && entryInfo && entryInfo.entryTime && entryInfo.entryTime > 0) ||
        currentBestTime) && (
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        {showTitle && (
          <div className="flex items-center gap-2">
            <h4 className="text-base font-semibold text-gray-900">{t("eventHeader", { n: sectionIndex })}</h4>
            {canRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="text-red-500 hover:text-red-700"
                aria-label={t("removeEventAria")}
                data-testid={`record-entry-remove-button-${sectionIndex}`}
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {entryMatchesCurrentStyle && entryInfo && entryInfo.entryTime && entryInfo.entryTime > 0 && (
            <div className="text-xs text-blue-800 bg-blue-100 px-3 py-1 rounded-full inline-flex items-center gap-2">
              <span className="text-blue-700">
                {t("entryTimeLabel")} {formatTimeBest(entryInfo.entryTime)}
              </span>
            </div>
          )}
          {currentBestTime && (
            <div className="text-xs text-green-800 bg-green-100 px-3 py-1 rounded-full inline-flex items-center gap-2">
              <span className="text-green-700">
                {currentBestTime.label}: {formatTimeBest(currentBestTime.time)}
              </span>
            </div>
          )}
        </div>
      </div>
      )}

      {/* 種目とリレー */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t("styleLabel")} <span className="text-red-500">*</span>
        </label>
        <div className="space-y-1.5" data-testid={`record-style-${sectionIndex}`}>
          {/* 距離 */}
          <div className="flex flex-wrap gap-1">
            {distanceOptions.map((d) => {
              const isActive = raceDistance === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    const id =
                      findStyleIdByCodeKey(d, currentCodeKey ?? undefined) ??
                      findStyleIdByCodeKey(d, codeKeyOrder.find((ck) => findStyleIdByCodeKey(d, ck)));
                    if (id) onStyleChange(id);
                  }}
                  aria-pressed={isActive}
                  className={`px-2.5 py-1 rounded-md border text-xs sm:text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isActive
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                  data-testid={`record-style-distance-${sectionIndex}-${d}`}
                >
                  {d}m
                </button>
              );
            })}
          </div>
          {/* 泳法 — ラベルは practice.styles 翻訳 */}
          <div className="flex flex-wrap gap-1">
            {codeKeysForCurrentDistance.map((ck) => {
              const isActive = currentCodeKey === ck;
              return (
                <button
                  key={ck}
                  type="button"
                  onClick={() => {
                    const id = findStyleIdByCodeKey(raceDistance, ck);
                    if (id) onStyleChange(id);
                  }}
                  aria-pressed={isActive}
                  className={`px-2.5 py-1 rounded-md border text-xs sm:text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isActive
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                  data-testid={`record-style-stroke-${sectionIndex}-${ck}`}
                >
                  {tStyles(ck)}
                </button>
              );
            })}
          </div>
          {/* リレー (3行目: オンオフトグル) */}
          {canRelay && (
            <button
              type="button"
              role="switch"
              aria-checked={formData.isRelaying}
              onClick={() => onToggleRelaying(!formData.isRelaying)}
              className="flex items-center gap-2 focus:outline-none"
              data-testid={`record-relay-${sectionIndex}`}
            >
              <span
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                  formData.isRelaying ? "bg-blue-600" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    formData.isRelaying ? "translate-x-[18px]" : "translate-x-0.5"
                  }`}
                />
              </span>
              <span className="text-[10px] sm:text-sm text-gray-700">{t("relayLabel")}</span>
            </button>
          )}
        </div>
      </div>

      {/* タイムとリアクションタイム */}
      <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("timeLabel")} <span className="text-red-500">*</span>
          </label>
          <Input
            type="text"
            value={formData.timeDisplayValue}
            onChange={(e) => onTimeChange(e.target.value)}
            onBlur={(e) => {
              // blur 時に確定値へ再フォーマット (mobile 版と同じ UX)
              const parsed = parseTimeFlexible(e.target.value);
              if (parsed !== null) onTimeChange(formatTimeBest(parsed));
            }}
            placeholder={t("time_placeholder")}
            className="w-full"
            data-testid={`record-time-${sectionIndex}`}
          />
          {timeFormatInvalid && (
            <p className="mt-1 text-xs text-red-600" data-testid={`record-time-error-${sectionIndex}`}>
              {tTimeError("invalidTimeFormat")}
            </p>
          )}
        </div>
        <div className="w-20 sm:w-36">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <span className="sm:hidden">{t("reactionTimeLabelShort")}</span>
            <span className="hidden sm:inline">{t("reactionTimeLabelFull")}</span>
          </label>
          <Input
            type="number"
            step="0.01"
            min="-1"
            max="2"
            value={formData.reactionTime}
            onChange={(e) => onReactionTimeChange(e.target.value)}
            placeholder={t("reactionTime_placeholder")}
            className="w-full"
            data-testid={`record-reaction-time-${sectionIndex}`}
          />
        </div>
      </div>

      {/* スプリットタイム */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
          <label className="block text-sm font-medium text-gray-700 whitespace-nowrap">
            {t("splitTimeLabel")}
          </label>
          <div className="flex gap-1">
            <Button
              type="button"
              onClick={onAddSplitTimesEvery25m}
              variant="outline"
              className="!text-[10px] !px-1.5 !py-0.5 !h-6"
              disabled={isLoading || !raceDistance || isSplitTimeLimitReached}
              data-testid={`record-split-add-25m-button-${sectionIndex}`}
            >
              {t("splitAdd25m")}
            </Button>
            <Button
              type="button"
              onClick={onAddSplitTimesEvery50m}
              variant="outline"
              className="!text-[10px] !px-1.5 !py-0.5 !h-6"
              disabled={isLoading || !raceDistance || isSplitTimeLimitReached}
              data-testid={`record-split-add-50m-button-${sectionIndex}`}
            >
              {t("splitAdd50m")}
            </Button>
            <Button
              type="button"
              onClick={onAddSplitTime}
              variant="outline"
              className="!text-[10px] !px-1.5 !py-0.5 !h-6"
              disabled={isLoading || isSplitTimeLimitReached}
              data-testid={`record-split-add-button-${sectionIndex}`}
            >
              {t("splitAdd")}
            </Button>
          </div>
        </div>
        {formData.splitTimes.length > 0 && (
          <div className="space-y-2">
            {sortedSplitTimes.map(({ st, originalIndex }, splitIndex) => (
              <div
                key={st.uiKey || `${index}-${originalIndex}`}
                className="flex items-center space-x-2"
              >
                <Input
                  type="text"
                  inputMode="decimal"
                  value={st.distance === 0 || st.distance === "" ? "" : String(st.distance)}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "" || /^\d+(\.\d*)?$/.test(value)) {
                      onSplitTimeChange(originalIndex, "distance", value);
                    }
                  }}
                  placeholder={t("distance_placeholder")}
                  className="w-24"
                  data-testid={`record-split-distance-${sectionIndex}-${originalIndex + 1}`}
                />
                <div className="flex-1">
                  <Input
                    type="text"
                    value={st.splitTimeDisplayValue || ""}
                    onChange={(e) => onSplitTimeChange(originalIndex, "splitTime", e.target.value)}
                    onBlur={(e) => {
                      const parsed = parseTimeFlexible(e.target.value);
                      if (parsed !== null) {
                        onSplitTimeChange(originalIndex, "splitTime", formatTimeBest(parsed));
                      }
                    }}
                    placeholder={t("time_placeholder")}
                    className="w-full"
                    data-testid={`record-split-time-${sectionIndex}-${originalIndex + 1}`}
                  />
                  {isInvalidTimeInput(st.splitTimeDisplayValue) && (
                    <p
                      className="mt-1 text-xs text-red-600"
                      data-testid={`record-split-time-error-${sectionIndex}-${originalIndex + 1}`}
                    >
                      {tTimeError("invalidTimeFormat")}
                    </p>
                  )}
                </div>
                {!(typeof st.distance === "number" && st.distance === raceDistance) ? (
                  <button
                    type="button"
                    onClick={() => onRemoveSplitTime(originalIndex)}
                    className="p-2 text-red-600 hover:text-red-700"
                    disabled={isLoading}
                    data-testid={`record-split-remove-button-${sectionIndex}-${splitIndex + 1}`}
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                ) : (
                  <div className="p-2 w-9" />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Lap-Time表示 */}
        <LapTimeDisplay splitTimes={validSplitTimes} raceDistance={raceDistance} />

        {/* Premium 制限メッセージ */}
        {!isPremium && isSplitTimeLimitReached && (
          <div className="mt-2" data-testid={`premium-badge-split-limit-${sectionIndex}`}>
            <PremiumBadge
              message={tPremium("splitTimeLimit", { limit: FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD })}
            />
          </div>
        )}
      </div>

      {/* 動画 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t("videoLabel")}</label>
        <VideoUploader
          type="record"
          id={recordId && isDbUuid(recordId) ? recordId : undefined}
          existingVideoPath={videoPath ?? undefined}
          existingThumbnailPath={videoThumbnailPath ?? undefined}
          isPremium={isPremium ?? false}
          onUploadComplete={(vPath, tPath) => onVideoPathChange(vPath, tPath)}
          onDelete={onVideoDelete}
          onPendingFile={onPendingFile}
        />
      </div>

      {/* メモ */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t("noteLabel")}</label>
        <textarea
          value={formData.note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder={t("notePlaceholder")}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          data-testid={`record-note-${sectionIndex}`}
        />
      </div>
    </div>
  );
}
