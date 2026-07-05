"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { PracticeLogTemplateList } from "./_components/PracticeLogTemplateList";
import { PracticeLogTemplateCreateModal } from "./_components/PracticeLogTemplateCreateModal";
import type { PracticeLogTemplate } from "@swim-hub/shared/types";

export default function PracticeLogTemplatesPage() {
  const t = useTranslations("practiceLogTemplates");
  const locale = useLocale();
  const [showModal, setShowModal] = useState(false);
  const [editData, setEditData] = useState<PracticeLogTemplate | null>(null);

  const handleCreateNew = useCallback(() => {
    setEditData(null);
    setShowModal(true);
  }, []);

  const handleEdit = useCallback((template: PracticeLogTemplate) => {
    setEditData(template);
    setShowModal(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
    setEditData(null);
  }, []);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ヘッダー（lg以上で表示 — SettingsClient と同パターン） */}
      <div className="hidden lg:block bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-2">
          <Link
            href={`/${locale}/settings`}
            className="inline-flex items-center justify-center p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="設定に戻る"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t("page.title")}</h1>
        </div>
      </div>

      {/* コンテンツカード */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <PracticeLogTemplateList onCreateNew={handleCreateNew} onEdit={handleEdit} />
      </div>

      {/* 作成・編集モーダル */}
      <PracticeLogTemplateCreateModal
        isOpen={showModal}
        onClose={handleCloseModal}
        editData={editData}
      />
    </div>
  );
}
