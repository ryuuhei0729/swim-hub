"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { PencilSquareIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/contexts";
import type { RecordFeedbackSummary } from "@apps/shared/types/recordFeedback";
import RecordFeedbackCountBadge from "./RecordFeedbackCountBadge";
import RecordFeedbackFormModal from "./RecordFeedbackFormModal";
import RecordFeedbackListModal from "./RecordFeedbackListModal";

export interface RecordFeedbackCellProps {
  recordId: string;
  /** 記録の持ち主 (FB を受け取る選手) */
  recipientId: string;
  recipientName?: string | null;
  summary: RecordFeedbackSummary | undefined;
  /** 呼び出し元のチームで管理者か。書けるかどうかの最終判定は DB が行う */
  isAdmin: boolean;
  /** 一覧モーダルの見出しに添える補足 */
  subtitle?: string;
}

/**
 * チーム記録一覧の1行に置く FB 操作セル。
 * - 件数バッジ: 押すとその記録の FB 一覧 (自分の FB はそこで編集・削除) を開く
 * - 管理者で、まだ書いておらず、自分の記録でもなければ「FBを書く」
 */
export default function RecordFeedbackCell({
  recordId,
  recipientId,
  recipientName,
  summary,
  isAdmin,
  subtitle,
}: RecordFeedbackCellProps) {
  const t = useTranslations("recordFeedback");
  const { user } = useAuth();
  const [showList, setShowList] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const count = summary?.count ?? 0;
  const hasMine = summary?.hasMine ?? false;
  const isOwnRecord = !!user?.id && user.id === recipientId;
  const canWrite = isAdmin && !hasMine && !isOwnRecord;
  const hasUnread = isOwnRecord && (summary?.unreadCount ?? 0) > 0;

  if (count === 0 && !canWrite) return null;

  return (
    <div className="inline-flex flex-wrap items-center justify-center gap-1">
      <RecordFeedbackCountBadge
        count={count}
        hasUnread={hasUnread}
        onClick={() => setShowList(true)}
      />
      {isAdmin && hasMine && (
        <span className="text-[10px] text-gray-500" data-testid="record-feedback-written">
          {t("written")}
        </span>
      )}
      {canWrite && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowForm(true);
          }}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-blue-300 bg-white px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label={t("writeAria", { name: recipientName ?? t("unknownAuthor") })}
          data-testid="record-feedback-write-button"
        >
          <PencilSquareIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {t("write")}
        </button>
      )}

      {showList && (
        <RecordFeedbackListModal
          isOpen={showList}
          onClose={() => setShowList(false)}
          recordId={recordId}
          subtitle={subtitle}
        />
      )}
      {showForm && (
        <RecordFeedbackFormModal
          isOpen={showForm}
          onClose={() => setShowForm(false)}
          recordId={recordId}
          recipientName={recipientName}
        />
      )}
    </div>
  );
}
