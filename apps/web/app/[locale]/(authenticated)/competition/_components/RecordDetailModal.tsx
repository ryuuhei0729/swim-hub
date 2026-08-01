"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { XMarkIcon, PencilIcon, TrashIcon } from "@heroicons/react/24/outline";
import { formatTimeBest } from "@/utils/formatters";
import { LapTimeDisplay } from "@/components/forms/LapTimeDisplay";
import RecordBestBadge from "@/components/ui/RecordBestBadge";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import type { Record as RecordType, Style } from "@apps/shared/types";

const VideoPlayer = dynamic(() => import("@/components/video/VideoPlayer"), { ssr: false });

export interface RecordDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 大会に紐付いていない記録（一括ベストタイム入力等。record.competition が null） */
  record: RecordType;
  /** 単体レコード編集フォーム(RecordLogForm)を開く */
  onEdit: () => void;
  /** レコード削除(確認モーダル経由) */
  onDelete: () => Promise<void> | void;
}

/**
 * 大会に紐付いていない記録（一括ベストタイム入力等）用の単体詳細モーダル。
 * CompetitionDetailModal は competitionId でフェッチするため、大会が無い記録には使えない。
 * 既にページ側で読み込み済みの record をそのまま表示するため追加フェッチは不要。
 * 見た目は CompetitionDetails の記録カードと同じトーンに揃え、
 * 大会情報(大会名/場所)は表示しない。
 */
export default function RecordDetailModal({
  isOpen,
  onClose,
  record,
  onEdit,
  onDelete,
}: RecordDetailModalProps) {
  const t = useTranslations("competition");
  const tPractice = useTranslations("practice");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!isOpen) return null;

  const style = record.style as Style | undefined;
  const raceDistance = style?.distance;
  const recordTime = record.time;

  const baseSplitTimes = (record.split_times || []).map((st) => ({
    distance: st.distance,
    splitTime: st.split_time,
  }));
  const hasGoalSplit = baseSplitTimes.some((st) => st.distance === raceDistance);
  const splitTimes =
    raceDistance && recordTime && recordTime > 0 && !hasGoalSplit
      ? [...baseSplitTimes, { distance: raceDistance, splitTime: recordTime }]
      : baseSplitTimes;

  const handleDeleteConfirm = async () => {
    await onDelete();
    setShowDeleteConfirm(false);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" data-testid="record-standalone-detail-modal">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={onClose} />

        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-2xl">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg leading-6 font-medium text-gray-900">{t("detail.title")}</h3>
              <button
                onClick={onClose}
                className="close-button text-gray-400 hover:text-gray-600 transition-colors"
                data-testid="modal-close-button"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="bg-blue-50 rounded-xl px-1 py-3 sm:p-3">
              <div className="bg-blue-50 rounded-lg px-1 py-2 sm:p-3">
                <div className="bg-white rounded-lg p-2 sm:p-3 mb-1 border border-blue-300">
                  {/* 1行目: ラベルと編集/削除アイコン */}
                  <div className="grid grid-cols-[1fr_2fr_1fr] sm:grid-cols-[2fr_2fr_1fr] gap-2 items-center mb-1">
                    <div className="text-xs font-medium text-gray-500">{t("table.style")}</div>
                    <div className="text-xs font-medium text-gray-500">{tPractice("details.timeLabel")}</div>
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        onClick={onEdit}
                        className="p-1 text-gray-500 hover:text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                        title={t("actions.edit")}
                        data-testid="edit-standalone-record-button"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="p-1 text-gray-500 hover:text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                        title={t("actions.delete")}
                        data-testid="delete-standalone-record-button"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* 2行目: 種目、タイム+Best、リアクションタイム */}
                  <div className="grid grid-cols-[1fr_2fr_1fr] sm:grid-cols-[2fr_2fr_1fr] gap-2 items-end">
                    <div className="text-base sm:text-xl font-bold text-blue-700">
                      {style?.name_jp || t("client.styleFallback")}
                      {record.is_relaying && <span className="font-bold text-red-600 ml-1">R</span>}
                    </div>
                    <div className="flex items-end gap-2">
                      <span className="text-xl sm:text-3xl font-bold text-blue-700" data-testid="record-time-display">
                        {record.time ? formatTimeBest(record.time) : "-"}
                      </span>
                      <RecordBestBadge
                        recordId={record.id}
                        styleId={record.style_id}
                        poolType={record.pool_type}
                        currentTime={record.time || 0}
                        isRelaying={record.is_relaying}
                      />
                    </div>
                    <div
                      className="text-xs sm:text-sm text-gray-600 text-right"
                      data-testid="record-reaction-time-display"
                    >
                      {record.reaction_time != null ? `RT ${record.reaction_time.toFixed(2)}` : ""}
                    </div>
                  </div>
                </div>

                {/* スプリットタイム */}
                {splitTimes.length > 0 && (
                  <div className="mt-3">
                    <LapTimeDisplay splitTimes={splitTimes} raceDistance={raceDistance} />
                  </div>
                )}

                {/* 動画 */}
                {record.video_path && (
                  <div className="mt-3">
                    <VideoPlayer videoPath={record.video_path} thumbnailPath={record.video_thumbnail_path} />
                  </div>
                )}

                {/* メモ */}
                {record.note && (
                  <div className="rounded-lg p-3 mb-1 border border-slate-200 mt-2 bg-white">
                    <div className="text-xs font-medium text-gray-500 mb-1">{tPractice("details.memoLabel")}</div>
                    <div className="text-sm text-gray-700">{record.note}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              onClick={onClose}
            >
              {t("detail.close")}
            </button>
          </div>
        </div>
      </div>

      <DeleteConfirmModal
        isOpen={showDeleteConfirm}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
