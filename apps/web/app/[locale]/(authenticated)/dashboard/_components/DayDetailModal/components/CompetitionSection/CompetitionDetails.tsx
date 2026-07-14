"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  PencilIcon,
  TrashIcon,
  ShareIcon,
  MapPinIcon,
  DocumentTextIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { TrophyIcon } from "@heroicons/react/24/solid";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { useTranslations } from "next-intl";

const ShareCardModal = dynamic(
  () =>
    import("@/components/share/ShareCardModal").then((mod) => ({
      default: mod.ShareCardModal,
    })),
  { ssr: false },
);
const VideoPlayer = dynamic(() => import("@/components/video/VideoPlayer"), {
  ssr: false,
});
import type { CompetitionShareData } from "@/components/share";
import { formatTimeBest } from "@/utils/formatters";
import {
  styleIdToCodeKey,
  nameJpToCodeKey,
  buildSwimStyleLabel,
} from "@/utils/swimStyle";
import { useLocale } from "next-intl";
import { useAuth } from "@/contexts";
import RecordBestBadge from "@/components/ui/RecordBestBadge";
import ImageGallery, { GalleryImage } from "@/components/ui/ImageGallery";
import { resolveGalleryImages } from "@/lib/image-url";
import type {
  CalendarItem,
  Record as RecordType,
  SplitTime,
  PoolType,
} from "@apps/shared/types";
import { AttendanceButton } from "../AttendanceSection";
import { RecordSplitTimes } from "./RecordSplitTimes";
import type { CompetitionDetailsProps } from "../../types";
import { RecordAPI } from "@apps/shared/api/records";

export function CompetitionDetails({
  competitionId,
  competitionName,
  place,
  poolType,
  note,
  records: _records = [],
  onEdit,
  onDelete,
  onAddRecord,
  onEditRecord,
  onDeleteRecord,
  onClose,
  isTeamCompetition = false,
  teamId,
  teamName,
  onShowAttendance,
}: CompetitionDetailsProps) {
  const t = useTranslations("dashboard");
  const tPractice = useTranslations("practice");
  const tCompetition = useTranslations("competition");
  const tStyles = useTranslations("practice.styles");
  const tStyleAbbrev = useTranslations("practice.styleAbbrev");
  const locale = useLocale();
  const { supabase, user } = useAuth();

  /**
   * PC 表示用: 距離 + 翻訳済み泳法名 (例: ja="100m自由形", en="100m Freestyle")
   * フォールバック: name_jp が null/undefined のとき fallback を返す。
   * 未知種目 (コードキーなし) は name_jp をそのまま返す。
   */
  const localizedStyleLabel = (
    styleId: string | number | undefined,
    nameJp: string | undefined,
    distance: number | undefined,
    fallback: string,
  ): string => {
    if (!nameJp && !styleId) return fallback;
    const codeKey =
      styleId != null
        ? styleIdToCodeKey(styleId)
        : nameJp
          ? nameJpToCodeKey(nameJp)
          : null;
    if (codeKey && distance) {
      return buildSwimStyleLabel(distance, tStyles(codeKey), locale);
    }
    return nameJp || fallback;
  };

  /**
   * モバイル表示用: 距離 + 略称 (例: "200Fr", "100m Fr")
   * 未知種目は name_jp から距離+略称を組み立てる。
   */
  const localizedStyleAbbrev = (
    styleId: string | number | undefined,
    nameJp: string | undefined,
    distance: number | undefined,
    fallback: string,
  ): string => {
    if (!nameJp && !styleId) return fallback;
    const codeKey =
      styleId != null
        ? styleIdToCodeKey(styleId)
        : nameJp
          ? nameJpToCodeKey(nameJp)
          : null;
    if (codeKey && distance) {
      return `${distance}${tStyleAbbrev(codeKey)}`;
    }
    // 未知種目: name_jp から距離部分を取り出して返す
    return nameJp || fallback;
  };
  const [actualRecords, setActualRecords] = useState<CalendarItem[]>([]);
  const [competitionImages, setCompetitionImages] = useState<GalleryImage[]>(
    [],
  );

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareRecordData, setShareRecordData] =
    useState<CompetitionShareData | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      setLoading(false);
      setLoadError(t("competition.loadTimeout"));
    }, 15000);

    const loadRecords = async () => {
      try {
        setLoading(true);
        setLoadError(null);
        setActualRecords([]);
        setCompetitionImages([]);

        // 大会画像パスとレコードを並行取得
        let recordQuery = supabase
          .from("records")
          .select(
            `
              *,
              style:styles(*),
              competition:competitions(*),
              split_times(*)
            `,
          )
          .eq("competition_id", competitionId);

        // チーム大会の場合は自分の記録だけを表示
        if (isTeamCompetition && user?.id) {
          recordQuery = recordQuery.eq("user_id", user.id);
        }

        const [{ data: competitionData }, { data, error }] = await Promise.all([
          supabase
            .from("competitions")
            .select("image_paths")
            .eq("id", competitionId)
            .single(),
          recordQuery,
        ]);

        if (error) throw error;

        // 画像の署名URL解決は本文表示をブロックしない（fire-and-forget）
        const competition = competitionData as {
          image_paths?: string[] | null;
        } | null;
        const imagePaths = competition?.image_paths || [];
        resolveGalleryImages("competition-images", imagePaths).then(
          (images: GalleryImage[]) => {
            if (cancelled) return;
            setCompetitionImages(images);
          },
        );

        // calendar_view形式に変換
        type RecordFromDB = {
          id: string;
          competition_id: string | null;
          style_id: number;
          time: number;
          video_path: string | null;
          video_thumbnail_path: string | null;
          note: string | null;
          is_relaying: boolean;
          reaction_time?: number | null;
          competition?: {
            id: string;
            title: string;
            date: string;
            place: string | null;
            pool_type: number;
          } | null;
          style?: {
            id: number;
            name_jp: string;
            distance: number;
          } | null;
          split_times?: Array<{
            id: string;
            record_id: string;
            distance: number;
            split_time: number;
            created_at: string;
          }>;
        };
        const formattedRecords = ((data || []) as RecordFromDB[]).map(
          (record): CalendarItem => ({
            id: record.id,
            type: "record" as const,
            date: record.competition?.date || "",
            title: record.competition?.title || "",
            place: record.competition?.place || "",
            note: record.note || undefined,
            metadata: {
              record: {
                time: record.time,
                is_relaying: record.is_relaying,
                video_path: record.video_path || undefined,
                video_thumbnail_path: record.video_thumbnail_path || undefined,
                reaction_time: record.reaction_time ?? null,
                style: record.style
                  ? {
                      id: record.style.id.toString(),
                      name_jp: record.style.name_jp,
                      distance: record.style.distance,
                    }
                  : {
                      id: record.style_id.toString(),
                      name_jp: "",
                      distance: 0,
                    },
                competition_id: record.competition_id || undefined,
                split_times: record.split_times || [],
              },
              competition: record.competition || undefined,
              style: record.style || undefined,
              pool_type: record.competition?.pool_type || 0,
            },
          }),
        );

        if (cancelled) return;
        setActualRecords(formattedRecords);
        clearTimeout(timeoutId);
      } catch (err) {
        clearTimeout(timeoutId);
        console.error("記録の取得エラー:", err);
        if (cancelled) return;
        setActualRecords([]);
        setCompetitionImages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadRecords();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [competitionId, supabase, isTeamCompetition, user?.id, t]);

  const _getPoolTypeText = (poolType: number) => {
    return poolType === 1
      ? t("competition.poolTypeLong")
      : t("competition.poolTypeShort");
  };

  return (
    <div className="mt-3">
      {/* Competition全体の枠 */}
      <div
        className="bg-blue-50 rounded-xl px-1 py-3 sm:p-3"
        data-testid="record-detail-modal"
      >
        {/* Competition全体のヘッダー */}
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`text-lg font-semibold px-3 py-1 rounded-lg flex items-center gap-2 ${
                  isTeamCompetition
                    ? "text-violet-800 bg-violet-200"
                    : "text-blue-800 bg-blue-200"
                }`}
                data-testid="competition-title-display"
              >
                <TrophyIcon className="h-5 w-5" />
                {competitionName || t("competition.defaultName")}
                {isTeamCompetition && teamName && (
                  <span className="text-sm">({teamName})</span>
                )}
              </span>
              {isTeamCompetition && teamId && onShowAttendance && (
                <AttendanceButton onClick={onShowAttendance} />
              )}
            </div>
            {(place || poolType != null || note) && (
              <div className="text-sm text-gray-700 mb-2 flex flex-wrap items-center gap-3">
                {place && (
                  <span
                    className="flex items-center gap-1"
                    data-testid="competition-place-display"
                  >
                    <MapPinIcon
                      className="h-4 w-4 text-gray-400 shrink-0"
                      aria-hidden="true"
                    />
                    {place}
                  </span>
                )}
                {poolType != null && (
                  <span className="flex items-center gap-1">
                    {_getPoolTypeText(poolType)}
                  </span>
                )}
                {note && (
                  <span className="flex items-center gap-1 break-all">
                    <DocumentTextIcon
                      className="h-4 w-4 text-gray-400 shrink-0"
                      aria-hidden="true"
                    />
                    {note}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2 ml-4">
            <button
              onClick={() => onEdit?.(competitionImages)}
              className="p-2 text-gray-500 hover:text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
              title={t("competition.editTitle")}
              data-testid="edit-competition-button"
            >
              <PencilIcon className="h-5 w-5" />
            </button>
            <button
              onClick={onDelete}
              className="p-2 text-gray-500 hover:text-red-600 rounded-lg hover:bg-red-100 transition-colors"
              title={t("competition.deleteTitle")}
              data-testid="delete-competition-button"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Recordsのコンテナ */}
        <div className="space-y-3">
          {/* Loading状態 */}
          {loading && (
            <div className="bg-white border-2 border-dashed border-blue-300 rounded-lg p-6 text-center">
              <div className="text-gray-500">
                <span className="text-2xl">⏳</span>
                <p className="text-sm mt-2">{tPractice("details.loading")}</p>
              </div>
            </div>
          )}

          {/* エラー表示 */}
          {loadError && (
            <div className="bg-white border-2 border-red-300 rounded-lg p-6 text-center">
              <div className="text-red-600">
                <p className="text-sm">{loadError}</p>
              </div>
            </div>
          )}

          {/* Recordsがない場合 */}
          {!loading && !loadError && actualRecords.length === 0 && (
            <div className="bg-white border-2 border-dashed border-blue-300 rounded-lg p-6 text-center">
              <button
                onClick={() => {
                  onAddRecord?.({ competitionId });
                  onClose?.();
                }}
                className="inline-flex items-center px-4 py-2 border border-blue-300 rounded-lg shadow-sm text-sm font-medium text-blue-700 bg-white hover:bg-blue-50 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              >
                <PlusIcon
                  className="h-4 w-4 mr-2 shrink-0"
                  aria-hidden="true"
                />
                {t("dayDetail.addRecord")}
              </button>
            </div>
          )}

          {/* Recordsがある場合の表示 */}
          {!loading &&
            actualRecords.map((record, _index: number) => {
              const openRecordEditor = async () => {
                const { data: fullRecord } = await supabase
                  .from("records")
                  .select(
                    `
                  id,
                  style_id,
                  time,
                  video_path,
                  video_thumbnail_path,
                  note,
                  is_relaying,
                  reaction_time,
                  competition_id,
                  split_times (*)
                `,
                  )
                  .eq("id", record.id)
                  .single();

                type FullRecord = {
                  id: string;
                  style_id: number;
                  time: number;
                  is_relaying: boolean;
                  note: string | null;
                  video_path: string | null;
                  video_thumbnail_path: string | null;
                  reaction_time?: number | null;
                  competition_id: string;
                  split_times: SplitTime[];
                };
                if (fullRecord) {
                  const recordData = fullRecord as FullRecord;
                  const editData: RecordType = {
                    id: recordData.id,
                    user_id: "",
                    competition_id: recordData.competition_id,
                    style_id: recordData.style_id,
                    time: recordData.time,
                    video_path: recordData.video_path,
                    video_thumbnail_path: recordData.video_thumbnail_path,
                    note: recordData.note,
                    is_relaying: recordData.is_relaying,
                    reaction_time: recordData.reaction_time ?? null,
                    created_at: "",
                    updated_at: "",
                    pool_type: ((
                      record.metadata as { pool_type?: number } | undefined
                    )?.pool_type ?? 0) as PoolType,
                    split_times: recordData.split_times || [],
                  };
                  onEditRecord?.(editData);
                }
                onClose?.();
              };

              return (
                <div
                  key={record.id}
                  className="bg-blue-50 rounded-lg px-1 py-2 sm:p-3"
                >
                  {/* 記録内容 */}
                  <div className="bg-white rounded-lg p-2 sm:p-3 mb-1 border border-blue-300">
                    {/* 1行目：ラベルとアイコン */}
                    <div className="grid grid-cols-[1fr_2fr_1fr] sm:grid-cols-[2fr_2fr_1fr] gap-2 items-center mb-1">
                      <div className="text-xs font-medium text-gray-500">
                        {tCompetition("table.style")}
                      </div>
                      <div className="text-xs font-medium text-gray-500">
                        {tPractice("details.timeLabel")}
                      </div>
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          onClick={async () => {
                            const competition = record.metadata?.competition;
                            const recordData = record.metadata?.record;
                            const style =
                              record.metadata?.style || recordData?.style;
                            const recordId = record.id;
                            const styleId =
                              style?.id != null ? Number(style.id) : undefined;
                            const poolTypeNum =
                              (poolType ?? competition?.pool_type) === 1
                                ? 1
                                : 0;
                            let previousBest: number | undefined;
                            let isFirstRecord = false;
                            const competitionDate =
                              record.metadata?.competition?.date;
                            if (
                              styleId != null &&
                              !Number.isNaN(styleId) &&
                              recordId &&
                              competitionDate
                            ) {
                              try {
                                const prevBest = await new RecordAPI(
                                  supabase,
                                ).getPreviousBestTime(
                                  styleId,
                                  poolTypeNum,
                                  recordId,
                                  recordData?.is_relaying ?? false,
                                  competitionDate,
                                );
                                if (prevBest === null) {
                                  isFirstRecord = true; // 記録なし＝初記録
                                } else {
                                  previousBest = prevBest;
                                }
                              } catch {
                                // 取得失敗時はバッジ非表示（初記録の誤表示を防ぐ）
                              }
                            }
                            setShareRecordData({
                              competitionName:
                                competitionName ||
                                competition?.title ||
                                t("competition.defaultName"),
                              date: competition?.date
                                ? format(
                                    new Date(competition.date),
                                    "yyyy年M月d日",
                                    { locale: ja },
                                  )
                                : record.date
                                  ? format(
                                      new Date(record.date),
                                      "yyyy年M月d日",
                                      { locale: ja },
                                    )
                                  : "",
                              place: place || competition?.place || "",
                              poolType:
                                (poolType ?? competition?.pool_type) === 1
                                  ? "long"
                                  : "short",
                              eventName: style?.name_jp || "",
                              raceDistance: style?.distance || 0,
                              time: recordData?.time || 0,
                              reactionTime:
                                recordData?.reaction_time ?? undefined,
                              splitTimes: recordData?.split_times,
                              isFirstRecord,
                              previousBest,
                              userName: "",
                              teamName: teamName,
                            });
                            setShowShareModal(true);
                          }}
                          className="p-1 text-gray-500 hover:text-cyan-600 rounded-lg hover:bg-cyan-100 transition-colors"
                          title={t("competition.shareRecord")}
                          data-testid="share-record-button"
                        >
                          <ShareIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={openRecordEditor}
                          className="p-1 text-gray-500 hover:text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                          title={t("competition.editRecord")}
                          data-testid="edit-record-button"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => onDeleteRecord?.(record.id)}
                          className="p-1 text-gray-500 hover:text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                          title={t("competition.deleteRecord")}
                          data-testid="delete-record-button"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    {/* 2行目：種目、タイム+Best、リアクションタイム */}
                    <div className="grid grid-cols-[1fr_2fr_1fr] sm:grid-cols-[2fr_2fr_1fr] gap-2 items-end">
                      <div className="text-base sm:text-xl font-bold text-blue-700">
                        <span className="sm:hidden">
                          {localizedStyleAbbrev(
                            record.metadata?.style?.id ||
                              record.metadata?.record?.style?.id,
                            record.metadata?.style?.name_jp ||
                              record.metadata?.record?.style?.name_jp,
                            record.metadata?.style?.distance ||
                              record.metadata?.record?.style?.distance,
                            record.title,
                          )}
                        </span>
                        <span className="hidden sm:inline">
                          {localizedStyleLabel(
                            record.metadata?.style?.id ||
                              record.metadata?.record?.style?.id,
                            record.metadata?.style?.name_jp ||
                              record.metadata?.record?.style?.name_jp,
                            record.metadata?.style?.distance ||
                              record.metadata?.record?.style?.distance,
                            record.title,
                          )}
                        </span>
                        {record.metadata?.record?.is_relaying && (
                          <span className="font-bold text-red-600 ml-1">R</span>
                        )}
                      </div>
                      <div className="flex items-end gap-2">
                        <span
                          className="text-xl sm:text-3xl font-bold text-blue-700"
                          data-testid="record-time-display"
                        >
                          {record.metadata?.record?.time
                            ? formatTimeBest(record.metadata.record.time)
                            : "-"}
                        </span>
                        <RecordBestBadge
                          recordId={record.id}
                          styleId={(() => {
                            const id =
                              record.metadata?.style?.id ||
                              record.metadata?.record?.style?.id;
                            return typeof id === "number" ? id : undefined;
                          })()}
                          poolType={
                            record.metadata?.competition?.pool_type ??
                            record.metadata?.pool_type
                          }
                          currentTime={record.metadata?.record?.time || 0}
                          isRelaying={record.metadata?.record?.is_relaying}
                          recordDate={record.metadata?.competition?.date}
                        />
                      </div>
                      <div
                        className="text-xs sm:text-sm text-gray-600 text-right"
                        data-testid="record-reaction-time-display"
                      >
                        {record.metadata?.record?.reaction_time != null &&
                        typeof record.metadata?.record?.reaction_time ===
                          "number"
                          ? `RT ${record.metadata.record.reaction_time.toFixed(2)}`
                          : ""}
                      </div>
                    </div>
                  </div>

                  {/* スプリットタイム */}
                  <RecordSplitTimes
                    recordId={record.id}
                    raceDistance={
                      record.metadata?.style?.distance ||
                      record.metadata?.record?.style?.distance
                    }
                    recordTime={record.metadata?.record?.time}
                  />

                  {/* 動画 */}
                  {record.metadata?.record?.video_path && (
                    <div className="mt-3">
                      <VideoPlayer
                        videoPath={record.metadata.record.video_path}
                        thumbnailPath={
                          record.metadata.record.video_thumbnail_path
                        }
                      />
                    </div>
                  )}

                  {/* メモ */}
                  {record.note && (
                    <div className=" rounded-lg p-3 mb-1 border border-slate-200 mt-2">
                      <div className="text-xs font-medium text-gray-500 mb-1">
                        {tPractice("details.memoLabel")}
                      </div>
                      <div className="text-sm text-gray-700">{record.note}</div>
                    </div>
                  )}
                </div>
              );
            })}

          {/* 「大会記録を追加」ボタン（Recordsがある場合でも表示） */}
          {actualRecords.length > 0 && (
            <div className="text-center pt-2">
              <button
                onClick={() => {
                  onAddRecord?.({ competitionId });
                  onClose?.();
                }}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded transition-colors"
              >
                <PlusIcon
                  className="h-4 w-4 mr-1 shrink-0"
                  aria-hidden="true"
                />
                {t("dayDetail.addRecord")}
              </button>
            </div>
          )}
        </div>

        {/* 添付画像 */}
        {competitionImages.length > 0 && (
          <div className="mt-4 pt-4 border-t border-blue-200">
            <ImageGallery images={competitionImages} />
          </div>
        )}
      </div>

      {/* シェアカードモーダル */}
      {showShareModal && shareRecordData && (
        <ShareCardModal
          isOpen={showShareModal}
          onClose={() => {
            setShowShareModal(false);
            setShareRecordData(null);
          }}
          type="competition"
          data={shareRecordData}
        />
      )}
    </div>
  );
}
