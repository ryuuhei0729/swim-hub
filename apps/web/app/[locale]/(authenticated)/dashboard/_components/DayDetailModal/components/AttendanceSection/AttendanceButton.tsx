"use client";

import { useTranslations } from "next-intl";
import { ClipboardDocumentCheckIcon } from "@heroicons/react/24/outline";
import type { AttendanceButtonProps } from "../../types";

export function AttendanceButton({ onClick }: AttendanceButtonProps) {
  const t = useTranslations("dashboard");
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg transition-colors text-sm"
      title={t("attendance.checkTitle")}
    >
      <ClipboardDocumentCheckIcon className="h-4 w-4" />
      <span>{t("attendance.title")}</span>
    </button>
  );
}
