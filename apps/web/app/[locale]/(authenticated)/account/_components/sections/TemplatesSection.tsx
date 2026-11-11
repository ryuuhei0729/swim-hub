"use client";

import React, { useCallback, useState } from "react";
import { PracticeLogTemplateList } from "@/components/practice-log-templates/PracticeLogTemplateList";
import { PracticeLogTemplateCreateModal } from "@/components/practice-log-templates/PracticeLogTemplateCreateModal";
import type { PracticeLogTemplate } from "@swim-hub/shared/types";

export default function TemplatesSection() {
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
    <>
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <PracticeLogTemplateList onCreateNew={handleCreateNew} onEdit={handleEdit} />
      </div>
      <PracticeLogTemplateCreateModal
        isOpen={showModal}
        onClose={handleCloseModal}
        editData={editData}
      />
    </>
  );
}
