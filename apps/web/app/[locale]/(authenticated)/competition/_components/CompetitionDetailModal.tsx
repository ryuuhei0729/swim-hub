"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { format, parseISO, isValid } from "date-fns";
import { ja } from "date-fns/locale";
import {
  CompetitionDetails,
  CompetitionWithEntry,
  AttendanceModal,
} from "@/app/[locale]/(authenticated)/dashboard/_components/DayDetailModal/components";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import type { GalleryImage } from "@/components/ui/ImageGallery";
import type { Record as RecordType } from "@apps/shared/types";

interface AttendanceModalState {
  eventId: string;
  eventType: "practice" | "competition";
  teamId: string;
}

type DeleteTarget = { type: "competition" } | { type: "entry"; entryId: string };

export interface CompetitionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** "record": 記録表示 (CompetitionDetails) / "entry": エントリー済み・記録未登録 (CompetitionWithEntry) */
  mode: "record" | "entry";
  competitionId: string;
  competitionName?: string;
  date: string;
  place?: string;
  poolType?: number;
  note?: string;
  isTeamCompetition?: boolean;
  teamId?: string | null;
  teamName?: string;
  // entry モード専用
  entryId?: string;
  styleId?: number;
  styleName?: string;
  entryTime?: number | null;
  /** ダッシュボードと同じ CompetitionTabModal (competition タブ) を開く */
  onEditCompetition: (images?: GalleryImage[]) => void;
  /** 大会全体の削除 (確認モーダル経由) */
  onDeleteCompetition: () => Promise<void> | void;
  /** ダッシュボードと同じ CompetitionTabModal (record タブ) を開く */
  onOpenRecordTab: () => void;
  /** ダッシュボードと同じ CompetitionTabModal (entry タブ) を開く (entry モード) */
  onOpenEntryTab?: () => void;
  /** 個別の大会記録削除 (即時削除、確認なし。ダッシュボードと同じ挙動) */
  onDeleteRecord: (recordId: string) => Promise<void> | void;
  /** エントリー削除 (確認モーダル経由、entry モード) */
  onDeleteEntry?: (entryId: string) => Promise<void> | void;
}

/**
 * 大会履歴タブ (/competition) の行クリックで開く詳細モーダル。
 * ダッシュボードの DayDetailModal 由来の CompetitionDetails / CompetitionWithEntry /
 * AttendanceModal / DeleteConfirmModal をそのまま再利用し、UI/UX をダッシュボードと完全に一致させる。
 */
export default function CompetitionDetailModal({
  isOpen,
  onClose,
  mode,
  competitionId,
  competitionName,
  date,
  place,
  poolType,
  note,
  isTeamCompetition = false,
  teamId,
  teamName,
  entryId,
  styleId,
  styleName,
  entryTime,
  onEditCompetition,
  onDeleteCompetition,
  onOpenRecordTab,
  onOpenEntryTab,
  onDeleteRecord,
  onDeleteEntry,
}: CompetitionDetailModalProps) {
  const t = useTranslations("dashboard");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [showAttendanceModal, setShowAttendanceModal] = useState<AttendanceModalState | null>(null);

  if (!isOpen) return null;

  const parsedDate = date ? parseISO(date) : null;
  const headerDate = parsedDate && isValid(parsedDate) ? format(parsedDate, "M月d日(E)", { locale: ja }) : "";

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "competition") {
      await onDeleteCompetition();
    } else if (deleteTarget.type === "entry") {
      await onDeleteEntry?.(deleteTarget.entryId);
    }
    setDeleteTarget(null);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" data-testid="record-detail-page-modal">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={onClose} />

        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-2xl">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg leading-6 font-medium text-gray-900">{headerDate}</h3>
              <button
                onClick={onClose}
                className="close-button text-gray-400 hover:text-gray-600 transition-colors"
                data-testid="modal-close-button"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {mode === "record" ? (
              <CompetitionDetails
                competitionId={competitionId}
                competitionName={competitionName}
                place={place}
                poolType={poolType}
                note={note}
                isTeamCompetition={isTeamCompetition}
                teamId={teamId}
                teamName={teamName}
                onEdit={(images) => onEditCompetition(images)}
                onDelete={() => setDeleteTarget({ type: "competition" })}
                onAddRecord={() => onOpenRecordTab()}
                onEditRecord={(record: RecordType) => {
                  void record;
                  onOpenRecordTab();
                }}
                onDeleteRecord={(recordId) => onDeleteRecord(recordId)}
                onClose={onClose}
                onShowAttendance={
                  isTeamCompetition && teamId
                    ? () => setShowAttendanceModal({ eventId: competitionId, eventType: "competition", teamId })
                    : undefined
                }
              />
            ) : (
              <CompetitionWithEntry
                entryId={entryId || ""}
                competitionId={competitionId}
                competitionName={competitionName || t("competition.defaultName")}
                place={place}
                note={note}
                styleId={styleId}
                styleName={styleName || ""}
                entryTime={entryTime}
                isTeamCompetition={isTeamCompetition}
                onAddRecord={() => onOpenRecordTab()}
                onEditCompetition={(images) => onEditCompetition(images)}
                onDeleteCompetition={() => setDeleteTarget({ type: "competition" })}
                onEditEntry={() => onOpenEntryTab?.()}
                onDeleteEntry={(id) => setDeleteTarget({ type: "entry", entryId: id })}
                onClose={onClose}
              />
            )}
          </div>

          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              onClick={onClose}
            >
              {t("dayDetail.close")}
            </button>
          </div>
        </div>
      </div>

      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      {showAttendanceModal && (
        <AttendanceModal
          isOpen={true}
          onClose={() => setShowAttendanceModal(null)}
          eventId={showAttendanceModal.eventId}
          eventType={showAttendanceModal.eventType}
          teamId={showAttendanceModal.teamId}
        />
      )}
    </div>
  );
}
