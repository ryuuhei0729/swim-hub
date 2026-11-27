"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { format, isValid, parseISO } from "date-fns";
import { PencilIcon, TrashIcon, ChatBubbleLeftEllipsisIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/contexts";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import {
  useDeleteRecordFeedbackMutation,
  useMarkRecordFeedbacksReadMutation,
  useRecordFeedbacksQuery,
} from "@apps/shared/hooks/queries/recordFeedbacks";
import type { RecordFeedback } from "@apps/shared/types/recordFeedback";
import RecordFeedbackFormModal from "./RecordFeedbackFormModal";

export interface RecordFeedbackSectionProps {
  recordId: string;
  /** 0件のときも見出しと「まだありません」を出すか (既定: 出さない) */
  showWhenEmpty?: boolean;
  className?: string;
}

function formatFeedbackDate(value: string): string {
  const date = parseISO(value);
  return isValid(date) ? format(date, "yyyy/MM/dd HH:mm") : "-";
}

function isEdited(feedback: RecordFeedback): boolean {
  const created = parseISO(feedback.created_at);
  const updated = parseISO(feedback.updated_at);
  if (!isValid(created) || !isValid(updated)) return false;
  return updated.getTime() > created.getTime();
}

/**
 * 記録1件のフィードバック一覧。
 * - 選手本人が表示したら、その記録の未読 FB を既読にする (表示 = 既読。仕様 4B)
 * - 書いた本人 (管理者) には自分の FB の編集・削除を出す
 * 閲覧権限は DB の RPC が判定する (権限の無い行は返らない)。
 */
export default function RecordFeedbackSection({
  recordId,
  showWhenEmpty = false,
  className = "",
}: RecordFeedbackSectionProps) {
  const t = useTranslations("recordFeedback");
  const { supabase, user } = useAuth();
  const currentUserId = user?.id;
  const feedbacksQuery = useRecordFeedbacksQuery(supabase, recordId);
  const markReadMutation = useMarkRecordFeedbacksReadMutation(supabase);
  const deleteMutation = useDeleteRecordFeedbackMutation(supabase);
  const [editing, setEditing] = useState<RecordFeedback | null>(null);
  const [deleting, setDeleting] = useState<RecordFeedback | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const feedbacks = useMemo(() => feedbacksQuery.data ?? [], [feedbacksQuery.data]);
  const hasUnreadForMe = feedbacks.some(
    (f) => f.recipient_id === currentUserId && f.read_at === null,
  );

  // 未読の FB を表示したら既読にする。同じ表示内容で何度も呼ばない
  const markedKeyRef = useRef<string | null>(null);
  const { mutate: markRead } = markReadMutation;
  useEffect(() => {
    if (!hasUnreadForMe) return;
    const key = `${recordId}:${feedbacks
      .filter((f) => f.read_at === null)
      .map((f) => `${f.id}@${f.updated_at}`)
      .join(",")}`;
    if (markedKeyRef.current === key) return;
    markedKeyRef.current = key;
    markRead({ recordId });
  }, [hasUnreadForMe, feedbacks, recordId, markRead]);

  if (feedbacksQuery.isPending) {
    return showWhenEmpty ? (
      <p className={`text-xs text-gray-500 ${className}`}>{t("loading")}</p>
    ) : null;
  }
  if (feedbacksQuery.isError) {
    return <p className={`text-xs text-red-600 ${className}`}>{t("loadError")}</p>;
  }
  if (feedbacks.length === 0 && !showWhenEmpty) return null;

  const handleDeleteConfirm = async () => {
    if (!deleting) return;
    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync({ feedbackId: deleting.id, recordId });
      setDeleting(null);
    } catch {
      setDeleting(null);
      setDeleteError(t("deleteFailed"));
    }
  };

  return (
    <div
      className={`rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 ${className}`}
      data-testid="record-feedback-section"
    >
      <div className="mb-2 flex items-center gap-1 text-xs font-medium text-emerald-800">
        <ChatBubbleLeftEllipsisIcon className="h-4 w-4" aria-hidden="true" />
        {t("sectionTitle")}
      </div>

      {feedbacks.length === 0 ? (
        <p className="text-sm text-gray-500">{t("empty")}</p>
      ) : (
        <ul className="space-y-2">
          {feedbacks.map((feedback) => {
            const isMine = !!currentUserId && feedback.author_id === currentUserId;
            return (
              <li
                key={feedback.id}
                className="rounded-md border border-emerald-100 bg-white p-3"
                data-testid="record-feedback-item"
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <div className="min-w-0 text-xs text-gray-500">
                    <span className="font-semibold text-gray-800">
                      {feedback.author_name ?? t("unknownAuthor")}
                    </span>
                    <span className="ml-2">{formatFeedbackDate(feedback.created_at)}</span>
                    {isEdited(feedback) && (
                      <span className="ml-2 text-gray-400" data-testid="record-feedback-edited">
                        ({t("edited")})
                      </span>
                    )}
                  </div>
                  {isMine && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setEditing(feedback)}
                        className="rounded-lg p-1 text-gray-500 hover:bg-blue-100 hover:text-blue-600"
                        aria-label={t("editAria")}
                        title={t("editAria")}
                        data-testid="record-feedback-edit-button"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(feedback)}
                        className="rounded-lg p-1 text-gray-500 hover:bg-red-100 hover:text-red-600"
                        aria-label={t("deleteAria")}
                        title={t("deleteAria")}
                        data-testid="record-feedback-delete-button"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
                <p className="whitespace-pre-wrap break-words text-sm text-gray-800">
                  {feedback.content}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {deleteError && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {deleteError}
        </p>
      )}

      {editing && (
        <RecordFeedbackFormModal
          isOpen={!!editing}
          onClose={() => setEditing(null)}
          recordId={recordId}
          feedback={{ id: editing.id, content: editing.content }}
        />
      )}

      {/* DeleteConfirmModal は z-60。親モーダル (z-70 など) の DOM 内に描画するので、その中で前面に出る */}
      <DeleteConfirmModal
        isOpen={!!deleting}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleting(null)}
        isConfirmDisabled={deleteMutation.isPending}
      />
    </div>
  );
}
