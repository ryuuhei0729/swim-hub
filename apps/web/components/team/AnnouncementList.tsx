"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  useTeamAnnouncementsQuery,
  useDeleteTeamAnnouncementMutation,
} from "@apps/shared/hooks/queries/announcements";
import { useAuth } from "@/contexts";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import type { TeamAnnouncement } from "@apps/shared/types/team";
import { formatDateTime } from "@apps/shared/utils/date";

interface AnnouncementListProps {
  teamId: string;
  isAdmin: boolean;
  onCreateNew?: () => void;
  onEdit?: (announcement: TeamAnnouncement) => void;
  viewOnly?: boolean;
  hideEmptyMessage?: boolean;
}

export const AnnouncementList: React.FC<AnnouncementListProps> = ({
  teamId,
  isAdmin,
  onCreateNew,
  onEdit,
  viewOnly = false,
  hideEmptyMessage = false,
}) => {
  const t = useTranslations("teamsAdmin");
  const { supabase } = useAuth();
  const {
    data: announcements = [],
    isLoading: loading,
    error,
    refetch,
  } = useTeamAnnouncementsQuery(supabase, { teamId, viewOnly });
  const deleteAnnouncementMutation = useDeleteTeamAnnouncementMutation(supabase);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [truncatedIds, setTruncatedIds] = useState<Set<string>>(new Set());
  const contentRefs = useRef<Map<string, HTMLParagraphElement>>(new Map());
  const expandedIdsRef = useRef(expandedIds);
  expandedIdsRef.current = expandedIds;

  // サーバー側でフィルタリング済みなので、そのまま使用
  const filteredAnnouncements = announcements;

  const registerContentRef = useCallback(
    (id: string) => (el: HTMLParagraphElement | null) => {
      if (el) {
        contentRefs.current.set(id, el);
      } else {
        contentRefs.current.delete(id);
      }
    },
    [],
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    const measureTruncation = () => {
      setTruncatedIds((prev) => {
        const next = new Set<string>();
        contentRefs.current.forEach((el, id) => {
          // 展開中のアイテムは line-clamp が外れているため計測できない。
          // 展開前の判定結果を引き継ぐ (折りたたむとトグルが消えるのを防ぐ)。
          if (expandedIdsRef.current.has(id)) {
            if (prev.has(id)) {
              next.add(id);
            }
            return;
          }
          if (el.scrollHeight > el.clientHeight) {
            next.add(id);
          }
        });
        if (prev.size === next.size && [...prev].every((id) => next.has(id))) {
          return prev;
        }
        return next;
      });
    };

    measureTruncation();
    window.addEventListener("resize", measureTruncation);
    return () => window.removeEventListener("resize", measureTruncation);
  }, [filteredAnnouncements]);

  const handleDeleteConfirm = async () => {
    if (!confirmDeleteId) return;
    try {
      setDeletingId(confirmDeleteId);
      await deleteAnnouncementMutation.mutateAsync({ id: confirmDeleteId, teamId });
    } catch (error) {
      console.error("削除エラー:", error);
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-600">{t("announcementList.loadError")}</p>
        <button
          onClick={() => refetch()}
          className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
        >
          {t("announcementList.retry")}
        </button>
      </div>
    );
  }

  return (
    <div className={viewOnly ? "space-y-2" : "p-4 space-y-2"}>
      {/* ヘッダー（viewOnlyの場合は非表示） */}
      {!viewOnly && (
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900">{t("announcementList.title")}</h2>
          {isAdmin && onCreateNew && (
            <button
              onClick={onCreateNew}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              {t("announcementList.createButton")}
            </button>
          )}
        </div>
      )}

      {/* お知らせ一覧 */}
      {filteredAnnouncements.length === 0 ? (
        !hideEmptyMessage && (
          <div className="text-center py-2 text-gray-500">
            <p>{t("announcementList.empty")}</p>
          </div>
        )
      ) : (
        <div className="space-y-2">
          {filteredAnnouncements.map((announcement) => (
            <div key={announcement.id} className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-medium text-gray-900">{announcement.title}</h3>
                    {!announcement.is_published && (
                      <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">
                        {t("announcementList.draftBadge")}
                      </span>
                    )}
                  </div>
                  <p
                    ref={registerContentRef(announcement.id)}
                    className={`text-gray-600 text-sm mb-2 ${
                      expandedIds.has(announcement.id) ? "" : "line-clamp-2"
                    }`}
                  >
                    {announcement.content}
                  </p>
                  {truncatedIds.has(announcement.id) && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(announcement.id)}
                      aria-expanded={expandedIds.has(announcement.id)}
                      data-testid={`announcement-toggle-${announcement.id}`}
                      className="text-blue-600 hover:text-blue-800 text-sm mb-2"
                    >
                      {expandedIds.has(announcement.id)
                        ? t("announcementList.showLess")
                        : t("announcementList.showMore")}
                    </button>
                  )}
                  <div className="text-xs text-gray-500">
                    <span>{t("announcementList.updatedAtLabel")} {formatDateTime(announcement.updated_at)}</span>
                  </div>
                </div>

                {/* アクションボタン（viewOnlyの場合は非表示） */}
                {!viewOnly && (
                  <div className="flex gap-2 ml-4">
                    {isAdmin && onEdit && (
                      <button
                        onClick={() => onEdit(announcement)}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        {t("announcementList.editButton")}
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => setConfirmDeleteId(announcement.id)}
                        disabled={
                          deletingId === announcement.id || deleteAnnouncementMutation.isPending
                        }
                        className="text-red-600 hover:text-red-800 text-sm disabled:opacity-50"
                      >
                        {deletingId === announcement.id
                          ? t("announcementList.deleting")
                          : t("announcementList.deleteButton")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 削除確認ダイアログ */}
      <ConfirmDialog
        isOpen={confirmDeleteId !== null}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmDeleteId(null)}
        title={t("announcementList.deleteConfirm.title")}
        message={t("announcementList.deleteConfirm.message")}
        confirmLabel={t("announcementList.deleteConfirm.confirmButton")}
        cancelLabel={t("announcementList.deleteConfirm.cancelButton")}
        variant="danger"
      />
    </div>
  );
};
