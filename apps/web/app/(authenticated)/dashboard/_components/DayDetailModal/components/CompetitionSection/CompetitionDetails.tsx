"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { PencilIcon, TrashIcon, ShareIcon } from "@heroicons/react/24/outline";
import { TrophyIcon } from "@heroicons/react/24/solid";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

const ShareCardModal = dynamic(
  () =>
    import("@/components/share/ShareCardModal").then((mod) => ({ default: mod.ShareCardModal })),
  { ssr: false },
);
const VideoPlayer = dynamic(() => import("@/components/video/VideoPlayer"), { ssr: false });
import type { CompetitionShareData } from "@/components/share";
import { formatTimeBest } from "@/utils/formatters";
import { useAuth } from "@/contexts";
import BestTimeBadge from "@/components/ui/BestTimeBadge";
import ImageGallery, { GalleryImage } from "@/components/ui/ImageGallery";
import type { CalendarItem, Record as RecordType, SplitTime, PoolType } from "@apps/shared/types";
import { AttendanceButton } from "../AttendanceSection";
import { RecordSplitTimes } from "./RecordSplitTimes";
import type { CompetitionDetailsProps } from "../../types";

// 種目名を短縮形に変換（例: "200m自由形" → "200Fr"）
const getShortStyleName = (nameJp: string | undefined, distance?: number): string => {
  if (!nameJp) return "";

  // 種目コードマッピング
  const styleMap: Record<string, string> = {
    自由形: "Fr",
    背泳ぎ: "Ba",
    平泳ぎ: "Br",
    バタフライ: "Fly",
    個人メドレー: "IM",
    メドレーリレー: "MR",
    フリーリレー: "FR",
  };

  // 距離を抽出（例: "200m自由形" → 200）
  const distMatch = nameJp.match(/(\d+)m/);
  const dist = distMatch ? distMatch[1] : distance ? String(distance) : "";

  // 種目名を抽出してコードに変換
  for (const [jpName, code] of Object.entries(styleMap)) {
    if (nameJp.includes(jpName)) {
      return `${dist}${code}`;
    }
  }

  return nameJp; // 変換できない場合はそのまま返す
};

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
  const { supabase, user } = useAuth();
  const [actualRecords, setActualRecords] = useState<CalendarItem[]>([]);
  const [competitionImages, setCompetitionImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareRecordData, setShareRecordData] = useState<CompetitionShareData | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setLoading(false);
      setLoadError("読み込みがタイムアウトしました。再度お試しください。");
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
          supabase.from("competitions").select("image_paths").eq("id", competitionId).single(),
          recordQuery,
        ]);

        const competition = competitionData as { image_paths?: string[] | null } | null;
        const imagePaths = competition?.image_paths || [];
        const r2PublicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
        const images: GalleryImage[] = imagePaths.map((path: string, index: number) => {
          const imageUrl = r2PublicUrl
            ? `${r2PublicUrl}/competition-images/${path}`
            : supabase.storage.from("competition-images").getPublicUrl(path).data.publicUrl;
          return {
            id: path,
            thumbnailUrl: imageUrl,
            originalUrl: imageUrl,
            fileName: path.split("/").pop() || `image-${index + 1}`,
          };
        });
        setCompetitionImages(images);

        if (error) throw error;

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

        setActualRecords(formattedRecords);
        clearTimeout(timeoutId);
      } catch (err) {
        clearTimeout(timeoutId);
        console.error("記録の取得エラー:", err);
        setActualRecords([]);
        setCompetitionImages([]);
      } finally {
        setLoading(false);
      }
    };

    loadRecords();

    return () => {
      clearTimeout(timeoutId);
    };
  }, [competitionId, supabase, isTeamCompetition, user?.id]);

  const _getPoolTypeText = (poolType: number) => {
    return poolType === 1 ? "長水路(50m)" : "短水路(25m)";
  };

  return (
    <div className="mt-3">
      {/* Competition全体の枠 */}
      <div className="bg-blue-50 rounded-xl px-1 py-3 sm:p-3" data-testid="record-detail-modal">
        {/* Competition全体のヘッダー */}
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`text-lg font-semibold px-3 py-1 rounded-lg flex items-center gap-2 ${
                  isTeamCompetition ? "text-violet-800 bg-violet-200" : "text-blue-800 bg-blue-200"
                }`}
                data-testid="competition-title-display"
              >
                <TrophyIcon className="h-5 w-5" />
                {competitionName || "大会"}
                {isTeamCompetition && teamName && <span className="text-sm">({teamName})</span>}
              </span>
              {isTeamCompetition && teamId && onShowAttendance && (
                <AttendanceButton onClick={onShowAttendance} />
              )}
            </div>
            {(place || poolType != null || note) && (
              <div className="text-sm text-gray-700 mb-2 flex flex-wrap items-center gap-3">
                {place && (
                  <span className="flex items-center gap-1" data-testid="competition-place-display">
                    <span className="text-gray-500">📍</span>
                    {place}
                  </span>
                )}
                {poolType != null && (
                  <span className="flex items-center gap-1">
                    <span className="text-gray-500">🏊‍♀️</span>
                    {_getPoolTypeText(poolType)}
                  </span>
                )}
                {note && (
                  <span className="flex items-center gap-1 break-all">
                    <span className="shrink-0">📝</span>
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
              title="大会情報を編集"
              data-testid="edit-competition-button"
            >
              <PencilIcon className="h-5 w-5" />
            </button>
            <button
              onClick={onDelete}
              className="p-2 text-gray-500 hover:text-red-600 rounded-lg hover:bg-red-100 transition-colors"
              title="大会を削除"
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
                <p className="text-sm mt-2">記録を読み込み中...</p>
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
                <span className="mr-2">➕</span>
                大会記録を追加
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
                    pool_type: ((record.metadata as { pool_type?: number } | undefined)
                      ?.pool_type ?? 0) as PoolType,
                    split_times: recordData.split_times || [],
                  };
                  onEditRecord?.(editData);
                }
                onClose?.();
              };

              return (
                <div key={record.id} className="bg-blue-50 rounded-lg px-1 py-2 sm:p-3">
                  {/* 記録内容 */}
                  <div className="bg-white rounded-lg p-2 sm:p-3 mb-1 border border-blue-300">
                    {/* 1行目：ラベルとアイコン */}
                    <div className="grid grid-cols-[1fr_2fr_1fr] sm:grid-cols-[2fr_2fr_1fr] gap-2 items-center mb-1">
                      <div className="text-xs font-medium text-gray-500">種目</div>
                      <div className="text-xs font-medium text-gray-500">タイム</div>
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          onClick={() => {
                            const competition = record.metadata?.competition;
                            const recordData = record.metadata?.record;
                            const style = record.metadata?.style || recordData?.style;
                            setShareRecordData({
                              competitionName: competitionName || competition?.title || "大会",
                              date: competition?.date
                                ? format(new Date(competition.date), "yyyy年M月d日", { locale: ja })
                                : record.date
                                  ? format(new Date(record.date), "yyyy年M月d日", { locale: ja })
                                  : "",
                              place: place || competition?.place || "",
                              poolType:
                                (poolType ?? competition?.pool_type) === 1 ? "long" : "short",
                              eventName: style?.name_jp || "",
                              raceDistance: style?.distance || 0,
                              time: recordData?.time || 0,
                              reactionTime: recordData?.reaction_time ?? undefined,
                              splitTimes: recordData?.split_times,
                              isBestTime: false,
                              userName: "",
                              teamName: teamName,
                            });
                            setShowShareModal(true);
                          }}
                          className="p-1 text-gray-500 hover:text-cyan-600 rounded-lg hover:bg-cyan-100 transition-colors"
                          title="記録をシェア"
                          data-testid="share-record-button"
                        >
                          <ShareIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={openRecordEditor}
                          className="p-1 text-gray-500 hover:text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                          title="記録を編集"
                          data-testid="edit-record-button"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => onDeleteRecord?.(record.id)}
                          className="p-1 text-gray-500 hover:text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                          title="記録を削除"
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
                          {getShortStyleName(
                            record.metadata?.style?.name_jp ||
                              record.metadata?.record?.style?.name_jp,
                            record.metadata?.style?.distance ||
                              record.metadata?.record?.style?.distance,
                          ) || record.title}
                        </span>
                        <span className="hidden sm:inline">
                          {record.metadata?.style?.name_jp ||
                            record.metadata?.record?.style?.name_jp ||
                            record.title}
                        </span>
                        {record.metadata?.record?.is_relaying && (
                          <span className="font-bold text-red-600 ml-1">R</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xl sm:text-3xl font-bold text-blue-700"
                          data-testid="record-time-display"
                        >
                          {record.metadata?.record?.time
                            ? formatTimeBest(record.metadata.record.time)
                            : "-"}
                        </span>
                        <BestTimeBadge
                          recordId={record.id}
                          styleId={(() => {
                            const id =
                              record.metadata?.style?.id || record.metadata?.record?.style?.id;
                            return typeof id === "number" ? id : undefined;
                          })()}
                          currentTime={record.metadata?.record?.time || 0}
                          recordDate={record.metadata?.competition?.date}
                          poolType={
                            record.metadata?.competition?.pool_type ?? record.metadata?.pool_type
                          }
                          isRelaying={record.metadata?.record?.is_relaying}
                          showDiff={true}
                        />
                      </div>
                      <div
                        className="text-xs sm:text-sm text-gray-600 text-right"
                        data-testid="record-reaction-time-display"
                      >
                        {record.metadata?.record?.reaction_time != null &&
                        typeof record.metadata?.record?.reaction_time === "number"
                          ? `RT ${record.metadata.record.reaction_time.toFixed(2)}`
                          : ""}
                      </div>
                    </div>
                  </div>

                  {/* スプリットタイム */}
                  <RecordSplitTimes
                    recordId={record.id}
                    raceDistance={
                      record.metadata?.style?.distance || record.metadata?.record?.style?.distance
                    }
                    recordTime={record.metadata?.record?.time}
                  />

                  {/* 動画 */}
                  {record.metadata?.record?.video_path && (
                    <div className="mt-3">
                      <VideoPlayer
                        videoPath={record.metadata.record.video_path}
                        thumbnailPath={record.metadata.record.video_thumbnail_path}
                      />
                    </div>
                  )}

                  {/* メモ */}
                  {record.note && (
                    <div className=" rounded-lg p-3 mb-1 border border-slate-200 mt-2">
                      <div className="text-xs font-medium text-gray-500 mb-1">メモ</div>
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
                <span className="mr-1">➕</span>
                大会記録を追加
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
