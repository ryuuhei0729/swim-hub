"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ChatBubbleLeftEllipsisIcon } from "@heroicons/react/24/outline";

export interface RecordFeedbackCountBadgeProps {
  /** 閲覧できるフィードバックの件数。0 / undefined のときは何も描画しない */
  count: number | undefined;
  /** 未読があるときは強調表示する */
  hasUnread?: boolean;
  /** 指定するとボタンとして描画する (クリックで一覧を開くなど) */
  onClick?: () => void;
  className?: string;
}

/**
 * 記録カードに出す「FB n件」バッジ。
 * 仕様: docs/specs/record-feedback.md「件数表示」
 */
export default function RecordFeedbackCountBadge({
  count,
  hasUnread = false,
  onClick,
  className = "",
}: RecordFeedbackCountBadgeProps) {
  const t = useTranslations("recordFeedback");
  if (!count || count <= 0) return null;

  const colorClass = hasUnread
    ? "bg-amber-100 text-amber-800 border-amber-300"
    : "bg-emerald-50 text-emerald-700 border-emerald-200";
  const baseClass = `inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${colorClass} ${className}`;
  const content = (
    <>
      <ChatBubbleLeftEllipsisIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{t("countBadge", { count })}</span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className={`${baseClass} hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-emerald-500`}
        aria-label={t("viewAria", { count })}
        data-testid="record-feedback-count-badge"
      >
        {content}
      </button>
    );
  }

  return (
    <span
      className={baseClass}
      aria-label={t("countBadgeAria", { count })}
      data-testid="record-feedback-count-badge"
    >
      {content}
    </span>
  );
}
