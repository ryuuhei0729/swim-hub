"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  PencilIcon,
  TrashIcon,
  ShareIcon,
  MapPinIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import { BoltIcon } from "@heroicons/react/24/solid";
import { format, parseISO, isValid } from "date-fns";
import { ja } from "date-fns/locale";

const ShareCardModal = dynamic(
  () =>
    import("@/components/share/ShareCardModal").then((mod) => ({ default: mod.ShareCardModal })),
  { ssr: false },
);
const VideoPlayer = dynamic(() => import("@/components/video/VideoPlayer"), { ssr: false });
import type { PracticeShareData, PracticeMenuItem } from "@/components/share";
import { formatTime, formatTimeAverage } from "@/utils/formatters";
import { useAuth } from "@/contexts";
import ImageGallery, { GalleryImage } from "@/components/ui/ImageGallery";
import { resolveGalleryImages } from "@/lib/image-url";
import { hexToRgba, mixWithWhite, CALENDAR_COLOR_ALPHA } from "@apps/shared/utils/colorAlpha";
import { DEFAULT_PRACTICE_COLOR } from "@apps/shared/utils/calendarColorResolver";
import type { PracticeLogWithTimes, PracticeTag, TimeEntry } from "@apps/shared/types";
import { usePracticeDetailQuery } from "@/hooks/queries/dayDetailQueries";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { AttendanceButton } from "../AttendanceSection";
import type { PracticeDetailsProps } from "../../types";
import { toStyleCode } from "@apps/shared/utils/swimStyles";

// 色の明度に基づいてテキスト色を決定する関数
const getTextColor = (backgroundColor: string) => {
  const hex = backgroundColor.replace("#", "");
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? "#000000" : "#FFFFFF";
};

export function PracticeDetails({
  practiceId,
  place,
  practiceLogUpdateKey,
  onEdit,
  onDelete,
  onAddPracticeLog,
  onEditPracticeLog,
  onDeletePracticeLog,
  isTeamPractice = false,
  teamId,
  teamName,
  onShowAttendance,
  color,
  targetLogId,
}: PracticeDetailsProps) {
  const { supabase, user } = useAuth();
  const wrapperColor = color ?? DEFAULT_PRACTICE_COLOR;
  // 未カスタマイズ(デフォルト色のまま)なら旧 Tailwind クラスをそのまま使い、
  // 既存ユーザーの見た目をピクセル一致で維持する。カスタム色時のみ動的着色する(C2/C5対応)。
  const isDefaultColor = wrapperColor === DEFAULT_PRACTICE_COLOR;
  const t = useTranslations("practice");
  const tDash = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const userId = user?.id;

  // 種目コードをローカライズラベルに変換。practice_logs.style は CHECK 制約の無い
  // 自由記述列で legacy な小文字行が混在し得るため、toStyleCode() で正規化してから
  // 翻訳キーを引く(生の "fr" のまま t() に渡すと該当キーが無く壊れたラベルになる)。
  const getStyleLabel = (styleValue: string): string => {
    const code = toStyleCode(styleValue);
    if (code) {
      return t(`styles.${code}`);
    }
    // DB の name_jp 値（ベストタイム由来）がそのまま来た場合はそのまま返す
    return styleValue;
  };
  const [practiceImages, setPracticeImages] = useState<GalleryImage[]>([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharePracticeData, setSharePracticeData] = useState<PracticeShareData | null>(null);
  // 削除確認中の練習メニューID(null は確認ダイアログを閉じている状態。mobile と同じく削除前に確認する)
  const [pendingDeleteLogId, setPendingDeleteLogId] = useState<string | null>(null);
  // ConfirmDialog は onCancel の参照が変わるたびにフォーカス移動をやり直すため、参照を固定する
  const closeDeleteLogConfirm = useCallback(() => setPendingDeleteLogId(null), []);

  // 練習詳細 (開くたびに取り直す。同じ練習を開き直したときは前回の内容を先に表示する)
  const {
    data: practiceDetail,
    error,
    refetch,
  } = usePracticeDetailQuery(supabase, {
    practiceId,
    isTeamPractice,
    userId: userId ?? null,
  });
  const practice = practiceDetail?.practice ?? null;

  // 練習ログの更新 (カレンダーの再取得で updateKey が変わる) に追随して取り直す
  const lastUpdateKeyRef = useRef(practiceLogUpdateKey);
  useEffect(() => {
    if (lastUpdateKeyRef.current === practiceLogUpdateKey) return;
    lastUpdateKeyRef.current = practiceLogUpdateKey;
    void refetch();
  }, [practiceLogUpdateKey, refetch]);

  // 画像の署名URL解決は本文表示をブロックしない（fire-and-forget）。
  // 署名付きURLは期限があるのでクエリデータには入れず、表示のたびに解決する
  const imagePathsKey = practiceDetail ? JSON.stringify(practiceDetail.imagePaths) : null;
  useEffect(() => {
    if (imagePathsKey === null) return;
    let cancelled = false;
    const imagePaths = JSON.parse(imagePathsKey) as string[];
    resolveGalleryImages("practice-images", imagePaths).then((images: GalleryImage[]) => {
      if (cancelled) return;
      setPracticeImages(images);
    });
    return () => {
      cancelled = true;
    };
  }, [imagePathsKey]);

  // データが無いときだけ読み込み中・エラーを表示する (裏での取り直し中・その失敗では隠さない)
  if (!practice) {
    if (error) {
      return <div className="mt-3 text-sm text-red-600">{t("details.error")}</div>;
    }
    return <div className="mt-3 text-sm text-gray-500">{t("details.loading")}</div>;
  }

  const practiceLogs = practice.practiceLogs || [];
  // 一覧カードから開いたとき(targetLogId 指定)は押したメニュー1件だけを出す。
  // シェアは従来どおり練習全体(practiceLogs)を対象にする
  const visibleLogs = targetLogId
    ? practiceLogs.filter((log) => log.id === targetLogId)
    : practiceLogs;

  return (
    <div className="mt-3">
      <div
        className={`rounded-xl px-1 py-3 sm:p-3 ${isDefaultColor ? "bg-green-50" : ""}`}
        style={
          isDefaultColor
            ? undefined
            : { backgroundColor: mixWithWhite(wrapperColor, CALENDAR_COLOR_ALPHA.DAY_DETAIL_WRAPPER_BACKGROUND) }
        }
        data-testid="practice-detail-modal"
      >
        {/* Practice全体のヘッダー */}
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2" data-testid="practice-log-summary">
              <span
                className={`text-sm sm:text-lg font-semibold px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg flex items-center gap-1 sm:gap-2 ${
                  isDefaultColor
                    ? isTeamPractice
                      ? "text-emerald-800 bg-emerald-200"
                      : "text-green-800 bg-green-200"
                    : ""
                }`}
                style={
                  isDefaultColor
                    ? undefined
                    : {
                        backgroundColor: hexToRgba(
                          wrapperColor,
                          CALENDAR_COLOR_ALPHA.DAY_DETAIL_BADGE_BACKGROUND,
                        ),
                        color: getTextColor(wrapperColor),
                      }
                }
              >
                <BoltIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                {practice.title || t("details.badge")}
                {isTeamPractice && teamName && <span className="text-sm">({teamName})</span>}
              </span>
              {isTeamPractice && teamId && onShowAttendance && (
                <AttendanceButton onClick={onShowAttendance} />
              )}
            </div>
            <div className="flex items-center gap-4 mb-2 flex-wrap">
              {place && (
                <p className="text-sm text-gray-700 flex items-center gap-1">
                  <MapPinIcon className="h-4 w-4 text-gray-400 shrink-0" aria-hidden="true" />
                  {place}
                </p>
              )}
              {practice.note && (
                <p className="text-sm text-gray-700 flex items-center gap-1 break-all">
                  <DocumentTextIcon className="h-4 w-4 text-gray-400 shrink-0" aria-hidden="true" />
                  {practice.note}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2 ml-4">
            {!isTeamPractice && (
              <button
                onClick={() => onEdit?.(practiceImages)}
                className="p-2 text-gray-500 hover:text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                title={tDash("practice.editTitle")}
                data-testid="edit-practice-button"
              >
                <PencilIcon className="h-5 w-5" />
              </button>
            )}
            {!isTeamPractice && (
              <button
                onClick={onDelete}
                className="p-2 text-gray-500 hover:text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                title={tDash("practice.deleteTitle")}
                data-testid="delete-practice-button"
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Practice_logsのコンテナ */}
        <div className="space-y-3">
          {/* PracticeLogsがない場合 */}
          {practiceLogs.length === 0 && (
            <div className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
              <button
                onClick={() => onAddPracticeLog?.(practiceId)}
                className="inline-flex items-center gap-2 px-4 py-2 border border-green-300 rounded-lg shadow-sm text-sm font-medium text-green-700 bg-white hover:bg-green-50 hover:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
                data-testid="add-new-button"
              >
                <PencilIcon className="h-5 w-5" />
                {t("details.addMenu")}
              </button>
            </div>
          )}

          {/* PracticeLogsがある場合の表示 */}
          {visibleLogs.map((log, index: number) => {
            const formattedLog = log;
            const allTimes = formattedLog.times || [];

            return (
              <div
                key={formattedLog.id}
                className={`rounded-lg px-1 py-4 sm:p-4 ${isDefaultColor ? "bg-green-50" : ""}`}
                style={
                  isDefaultColor
                    ? undefined
                    : { backgroundColor: mixWithWhite(wrapperColor, CALENDAR_COLOR_ALPHA.DAY_DETAIL_WRAPPER_BACKGROUND) }
                }
                data-testid={`practice-log-item-${index + 1}`}
              >
                {/* 練習メニューのヘッダー */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    {formattedLog.tags &&
                      Array.isArray(formattedLog.tags) &&
                      formattedLog.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {formattedLog.tags.map((tag: PracticeTag) => (
                            <span
                              key={tag.id}
                              className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full"
                              style={{
                                backgroundColor: tag.color,
                                color: getTextColor(tag.color),
                              }}
                              data-testid={`selected-tag-${tag.id}`}
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      )}
                  </div>
                </div>

                {/* 練習内容 */}
                <div
                  className={`bg-white rounded-lg p-2 sm:p-3 mb-2 sm:mb-3 border relative ${
                    isDefaultColor ? "border-green-300" : ""
                  }`}
                  style={
                    isDefaultColor
                      ? undefined
                      : { borderColor: hexToRgba(wrapperColor, CALENDAR_COLOR_ALPHA.DAY_DETAIL_BORDER) }
                  }
                >
                  {/* シェア・編集・削除ボタン（右上） */}
                  <div className="absolute top-1 right-1 sm:top-3 sm:right-3 flex items-center space-x-0.5 sm:space-x-2">
                    <button
                      onClick={() => {
                        const menuItems: PracticeMenuItem[] = practiceLogs.map((log) => ({
                          style: log.style,
                          category: log.swim_category || "Swim",
                          distance: log.distance,
                          repCount: log.repCount,
                          setCount: log.setCount,
                          circle: log.circle ?? undefined,
                          times: log.times?.map((t) => ({
                            setNumber: t.setNumber,
                            repNumber: t.repNumber,
                            time: t.time,
                          })),
                          note: log.note ?? undefined,
                          tags: (log.tags || []).map((tag) => ({
                            name: tag.name,
                            color: tag.color,
                          })),
                        }));

                        const totalDistance = practiceLogs.reduce(
                          (sum, log) => sum + log.distance * log.repCount * log.setCount,
                          0,
                        );

                        const totalSets = practiceLogs.reduce(
                          (sum, log) => sum + (log.setCount || 0),
                          0,
                        );

                        const parsedDate = practice.date ? parseISO(practice.date) : null;
                        const formattedDate =
                          parsedDate && isValid(parsedDate)
                            ? format(parsedDate, "yyyy年M月d日(E)", { locale: ja })
                            : "";

                        setSharePracticeData({
                          date: formattedDate,
                          title: practice.title || tDash("practice.defaultTitle"),
                          place: place ?? undefined,
                          note: practice.note ?? undefined,
                          menuItems,
                          totalDistance,
                          totalSets,
                          userName: "",
                          teamName: teamName,
                        });
                        setShowShareModal(true);
                      }}
                      className="p-1 sm:p-2 text-gray-500 hover:text-cyan-600 rounded-lg hover:bg-cyan-100 transition-colors"
                      title={tDash("practice.shareTitle")}
                      data-testid="share-practice-log-button"
                    >
                      <ShareIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                    </button>
                    <button
                      onClick={() => {
                        // legacy な小文字行 ("fr" 等) を編集フォームの StyleChipSelector に
                        // そのまま渡すと選択中チップが表示されない(canonical なタイトルケース
                        // 値としか一致しない)ため、toStyleCode() で正規化する。フォールバックは
                        // "Fr" ではなく元の値: 正規化できない値を "Fr" に潰すと、種目欄を
                        // 触らず保存しただけで元の値が自由形として静かに上書きされてしまう
                        // (pool_type ?? 0 と同型の実障害パターン)。
                        const styleCode = toStyleCode(formattedLog.style) ?? formattedLog.style;

                        const formData: PracticeLogWithTimes & {
                          tags?: PracticeTag[];
                          times?: Array<{ memberId: string; times: TimeEntry[] }>;
                        } = {
                          id: formattedLog.id,
                          user_id: practice.user_id,
                          practice_id: formattedLog.practiceId,
                          style: styleCode,
                          swim_category: formattedLog.swim_category || "Swim",
                          rep_count: formattedLog.repCount,
                          set_count: formattedLog.setCount,
                          distance: formattedLog.distance,
                          circle: formattedLog.circle,
                          note: formattedLog.note,
                          tags: formattedLog.tags || [],
                          practice_times: (formattedLog.times || []).map((t) => ({
                            id: t.id,
                            user_id: practice.user_id,
                            practice_log_id: formattedLog.id,
                            set_number: t.setNumber,
                            rep_number: t.repNumber,
                            time: t.time,
                            created_at: formattedLog.created_at || "",
                          })),
                          times: [
                            {
                              memberId: "",
                              times: (formattedLog.times || []).map((t) => ({
                                setNumber: t.setNumber,
                                repNumber: t.repNumber,
                                time: t.time,
                              })),
                            },
                          ],
                          created_at: formattedLog.created_at || "",
                          updated_at: formattedLog.updated_at || "",
                        };
                        onEditPracticeLog?.(formData);
                      }}
                      className="p-1 sm:p-2 text-gray-500 hover:text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                      title={tDash("practice.editMenuTitle")}
                      data-testid="edit-practice-log-button"
                    >
                      <PencilIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                    </button>
                    <button
                      onClick={() => setPendingDeleteLogId(formattedLog.id)}
                      className="p-1 sm:p-2 text-gray-500 hover:text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                      title={tDash("practice.deleteMenuTitle")}
                      data-testid="delete-practice-log-button"
                    >
                      <TrashIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                    </button>
                  </div>
                  <div className="text-[10px] sm:text-xs font-medium text-gray-500 mb-0.5 sm:mb-1">{t("details.contentLabel")}</div>
                  <div className="text-xs sm:text-sm text-gray-800">
                    <span className="text-sm sm:text-lg font-semibold text-green-700">
                      {formattedLog.distance}
                    </span>
                    m ×{" "}
                    <span className="text-sm sm:text-lg font-semibold text-green-700">
                      {formattedLog.repCount}
                    </span>
                    {formattedLog.setCount > 1 && (
                      <>
                        {" × "}
                        <span className="text-sm sm:text-lg font-semibold text-green-700">
                          {formattedLog.setCount}
                        </span>
                      </>
                    )}
                    {"　"}
                    <span className="text-sm sm:text-lg font-semibold text-green-700">
                      {formattedLog.circle
                        ? `${Math.floor(formattedLog.circle / 60)}'${Math.floor(
                            formattedLog.circle % 60,
                          )
                            .toString()
                            .padStart(2, "0")}"`
                        : "-"}
                    </span>
                    {" "}
                    <span className="text-sm sm:text-lg font-semibold text-green-700">
                      {getStyleLabel(formattedLog.style)}
                    </span>
                    {formattedLog.swim_category && formattedLog.swim_category !== "Swim" && (
                      <>
                        {" "}
                        <span className="text-sm sm:text-lg font-semibold text-green-700">
                          {formattedLog.swim_category}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* タイム表示 */}
                {allTimes.length > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center gap-2 mb-1.5 sm:mb-3">
                      <div
                        className={`w-1 h-4 rounded-full ${isDefaultColor ? "bg-green-500" : ""}`}
                        style={
                          isDefaultColor
                            ? undefined
                            : {
                                backgroundColor: hexToRgba(
                                  wrapperColor,
                                  CALENDAR_COLOR_ALPHA.DAY_DETAIL_ACCENT_BAR,
                                ),
                              }
                        }
                      ></div>
                      <p
                        className={`text-xs sm:text-sm font-medium ${isDefaultColor ? "text-green-700" : ""}`}
                        style={isDefaultColor ? undefined : { color: wrapperColor }}
                      >
                        {t("details.timeLabel")}
                      </p>
                    </div>
                    <div
                      className={`bg-white rounded-lg p-1.5 sm:p-3 border overflow-x-auto ${
                        isDefaultColor ? "border-green-300" : ""
                      }`}
                      style={
                        isDefaultColor
                          ? undefined
                          : { borderColor: hexToRgba(wrapperColor, CALENDAR_COLOR_ALPHA.DAY_DETAIL_BORDER) }
                      }
                    >
                      <table className="w-full text-[10px] sm:text-sm">
                        <thead>
                          <tr className="border-b border-green-300">
                            <th className="text-left py-1 sm:py-2 px-1 sm:px-2 font-medium text-green-800"></th>
                            {Array.from({ length: formattedLog.setCount }, (_, setIndex) => (
                              <th
                                key={setIndex + 1}
                                className="text-center py-1 sm:py-2 px-1 sm:px-2 font-medium text-green-800 whitespace-nowrap"
                              >
                                {t("details.setLabel", { n: setIndex + 1 })}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: formattedLog.repCount }, (_, repIndex) => {
                            const repNumber = repIndex + 1;
                            return (
                              <tr key={repNumber} className="border-b border-green-100">
                                <td className="py-1 sm:py-2 px-1 sm:px-2 font-medium text-gray-700 whitespace-nowrap">
                                  {t("details.repLabel", { n: repNumber })}
                                </td>
                                {Array.from({ length: formattedLog.setCount }, (_, setIndex) => {
                                  const setNumber = setIndex + 1;
                                  const time = allTimes.find(
                                    (t) => t.setNumber === setNumber && t.repNumber === repNumber,
                                  );
                                  const setTimes = allTimes.filter(
                                    (t) => t.setNumber === setNumber && t.time > 0,
                                  );
                                  const setFastest =
                                    setTimes.length > 0
                                      ? Math.min(...setTimes.map((t) => t.time))
                                      : 0;
                                  const isFastest =
                                    time && time.time > 0 && time.time === setFastest;

                                  return (
                                    <td key={setNumber} className="py-1 sm:py-2 px-1 sm:px-2 text-center">
                                      <span
                                        className={
                                          isFastest ? "text-blue-600 font-bold" : "text-gray-800"
                                        }
                                      >
                                        {time && time.time > 0 ? formatTime(time.time) : "-"}
                                      </span>
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                          {/* 平均行 */}
                          <tr className="border-b border-green-100 bg-green-50">
                            <td className="py-1 sm:py-2 px-1 sm:px-2 font-medium text-green-800 whitespace-nowrap">{t("details.setAverage")}</td>
                            {Array.from({ length: formattedLog.setCount }, (_, setIndex) => {
                              const setNumber = setIndex + 1;
                              const setTimes = allTimes.filter(
                                (t) => t.setNumber === setNumber && t.time > 0,
                              );
                              const average =
                                setTimes.length > 0
                                  ? setTimes.reduce((sum, t) => sum + t.time, 0) / setTimes.length
                                  : 0;
                              return (
                                <td key={setNumber} className="py-1 sm:py-2 px-1 sm:px-2 text-center">
                                  <span className="text-green-800 font-medium">
                                    {average > 0 ? formatTimeAverage(average) : "-"}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                          {/* 全体平均行 */}
                          <tr className="border-t-2 border-green-300 bg-blue-50">
                            <td className="py-1 sm:py-2 px-1 sm:px-2 font-medium text-blue-800 whitespace-nowrap">{t("details.overallAverage")}</td>
                            <td className="py-1 sm:py-2 px-1 sm:px-2 text-center" colSpan={formattedLog.setCount}>
                              <span className="text-blue-800 font-bold">
                                {(() => {
                                  const allValidTimes = allTimes.filter((t) => t.time > 0);
                                  const overallAverage =
                                    allValidTimes.length > 0
                                      ? allValidTimes.reduce((sum, t) => sum + t.time, 0) /
                                        allValidTimes.length
                                      : 0;
                                  return overallAverage > 0
                                    ? formatTimeAverage(overallAverage)
                                    : "-";
                                })()}
                              </span>
                            </td>
                          </tr>
                          {/* 全体最速行 */}
                          <tr className="bg-blue-50">
                            <td className="py-1 sm:py-2 px-1 sm:px-2 font-medium text-blue-800 whitespace-nowrap">{t("details.overallFastest")}</td>
                            <td className="py-1 sm:py-2 px-1 sm:px-2 text-center" colSpan={formattedLog.setCount}>
                              <span className="text-blue-800 font-bold">
                                {(() => {
                                  const allValidTimes = allTimes.filter((t) => t.time > 0);
                                  const overallFastest =
                                    allValidTimes.length > 0
                                      ? Math.min(...allValidTimes.map((t) => t.time))
                                      : 0;
                                  return overallFastest > 0 ? formatTime(overallFastest) : "-";
                                })()}
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* メモ */}
                {formattedLog.note && (
                  <div className="rounded-lg p-3 mb-1 border border-slate-200">
                    <div className="text-xs font-medium text-gray-500 mb-1">{t("details.memoLabel")}</div>
                    <div className="text-sm text-gray-700">{formattedLog.note}</div>
                  </div>
                )}

                {/* 動画 */}
                {formattedLog.video_path && (
                  <div className="mt-3">
                    <VideoPlayer
                      videoPath={formattedLog.video_path}
                      thumbnailPath={formattedLog.video_thumbnail_path}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 添付画像 */}
        {practiceImages.length > 0 && (
          <div className="mt-4 pt-4 border-t border-green-200">
            <ImageGallery images={practiceImages} />
          </div>
        )}
      </div>

      {/* 練習メニューの削除確認 */}
      <ConfirmDialog
        isOpen={pendingDeleteLogId !== null}
        onConfirm={() => {
          const logId = pendingDeleteLogId;
          setPendingDeleteLogId(null);
          if (logId) onDeletePracticeLog?.(logId);
        }}
        onCancel={closeDeleteLogConfirm}
        title={tDash("mobile.deletePracticeConfirmTitle")}
        message={tDash("mobile.deleteMenuConfirmMessage")}
        confirmLabel={tDash("mobile.deleteButton")}
        cancelLabel={tCommon("cancel")}
        variant="danger"
        initialFocus="cancel"
      />

      {/* シェアカードモーダル */}
      {showShareModal && sharePracticeData && (
        <ShareCardModal
          isOpen={showShareModal}
          onClose={() => {
            setShowShareModal(false);
            setSharePracticeData(null);
          }}
          type="practice"
          data={sharePracticeData}
        />
      )}
    </div>
  );
}
