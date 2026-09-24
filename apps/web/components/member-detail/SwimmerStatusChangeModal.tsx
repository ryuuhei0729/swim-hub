import React from "react";
import { useTranslations } from "next-intl";
import BaseModal from "@/components/ui/BaseModal";
import type { MemberDetail } from "@/types/member-detail";

interface SwimmerStatusChangeModalProps {
  isOpen: boolean;
  member: MemberDetail | null;
  pendingIsSwimmer: boolean | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SwimmerStatusChangeModal({
  isOpen,
  member,
  pendingIsSwimmer,
  onConfirm,
  onCancel,
}: SwimmerStatusChangeModalProps) {
  const t = useTranslations("teams.nonSwimmer");
  // ボタン文言は既存の権限変更ダイアログ (RoleChangeModal) と共有する。
  // 「キャンセル」「変更する」は確認ダイアログ全般の共通文言であり、
  // nonSwimmer 専用のキーを新設しない
  const tRoleChange = useTranslations("teams.memberDetail.roleChange");
  const name = member?.users?.name ?? "";
  // pendingIsSwimmer は「変更後」の is_swimmer 値。false = 非泳者にする。
  const message =
    pendingIsSwimmer === false
      ? t("confirmMessageToNonSwimmer", { name })
      : t("confirmMessageToSwimmer", { name });
  return (
    <BaseModal isOpen={isOpen} onClose={onCancel} title={t("confirmTitle")} size="sm">
      <div className="p-4">
        <p className="text-gray-700 mb-6">{message}</p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {tRoleChange("cancel")}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
          >
            {tRoleChange("confirm")}
          </button>
        </div>
      </div>
    </BaseModal>
  );
}
