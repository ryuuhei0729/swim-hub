"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { format, parseISO, isValid } from "date-fns";
import { ja } from "date-fns/locale";
import {
  PracticeDetails,
  AttendanceModal,
} from "@/app/[locale]/(authenticated)/dashboard/_components/DayDetailModal/components";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import type { GalleryImage } from "@/components/ui/ImageGallery";

interface AttendanceModalState {
  eventId: string;
  eventType: "practice" | "competition";
  teamId: string;
}

export interface PracticeDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  practiceId: string;
  date: string;
  place?: string;
  isTeamPractice?: boolean;
  teamId?: string | null;
  teamName?: string;
  /** ダッシュボードと同じ PracticeTabModal (practice タブ) を開く */
  onEditPractice: (images?: GalleryImage[]) => void;
  /** 練習全体の削除 (確認モーダル経由) */
  onDeletePractice: () => Promise<void> | void;
  /** ダッシュボードと同じ PracticeTabModal (practiceLog タブ) を開く */
  onOpenPracticeLogTab: () => void;
  /** 個別の練習ログ削除 (カスケード: 残り0件なら親 practice も削除) */
  onDeletePracticeLog: (logId: string) => Promise<void> | void;
}

/**
 * 練習履歴タブ (/practice) の行クリックで開く詳細モーダル。
 * ダッシュボードの DayDetailModal 由来の PracticeDetails / AttendanceModal / DeleteConfirmModal を
 * そのまま再利用し、UI/UX をダッシュボードと完全に一致させる。
 */
export default function PracticeDetailModal({
  isOpen,
  onClose,
  practiceId,
  date,
  place,
  isTeamPractice = false,
  teamId,
  teamName,
  onEditPractice,
  onDeletePractice,
  onOpenPracticeLogTab,
  onDeletePracticeLog,
}: PracticeDetailModalProps) {
  const t = useTranslations("dashboard");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAttendanceModal, setShowAttendanceModal] = useState<AttendanceModalState | null>(null);

  if (!isOpen) return null;

  const parsedDate = date ? parseISO(date) : null;
  const headerDate = parsedDate && isValid(parsedDate) ? format(parsedDate, "M月d日(E)", { locale: ja }) : "";

  const handleDeleteConfirm = async () => {
    await onDeletePractice();
    setShowDeleteConfirm(false);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" data-testid="practice-detail-page-modal">
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

            <PracticeDetails
              practiceId={practiceId}
              place={place}
              isTeamPractice={isTeamPractice}
              teamId={teamId}
              teamName={teamName}
              onEdit={(images) => onEditPractice(images)}
              onDelete={() => setShowDeleteConfirm(true)}
              onAddPracticeLog={() => onOpenPracticeLogTab()}
              onEditPracticeLog={() => onOpenPracticeLogTab()}
              onDeletePracticeLog={(logId) => onDeletePracticeLog(logId)}
              onShowAttendance={
                isTeamPractice && teamId
                  ? () => setShowAttendanceModal({ eventId: practiceId, eventType: "practice", teamId })
                  : undefined
              }
            />
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
        isOpen={showDeleteConfirm}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
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
