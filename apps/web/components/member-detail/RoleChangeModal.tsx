import React from "react";
import { useTranslations } from "next-intl";
import BaseModal from "@/components/ui/BaseModal";
import type { MemberDetail } from "@/types/member-detail";

interface RoleChangeModalProps {
  isOpen: boolean;
  member: MemberDetail | null;
  pendingRole: "admin" | "user" | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RoleChangeModal({
  isOpen,
  member,
  pendingRole,
  onConfirm,
  onCancel,
}: RoleChangeModalProps) {
  const t = useTranslations("teams.memberDetail.roleChange");
  const role = pendingRole === "admin" ? t("roleAdmin") : t("roleUser");
  return (
    <BaseModal isOpen={isOpen} onClose={onCancel} title={t("title")} size="sm">
      <div className="p-4">
        <p className="text-gray-700 mb-6">
          {t("message", { name: member?.users?.name ?? "", role })}
        </p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {t("cancel")}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
          >
            {t("confirm")}
          </button>
        </div>
      </div>
    </BaseModal>
  );
}
