"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import BaseModal from "@/components/ui/BaseModal";

export interface MemberSelectOption {
  user_id: string;
  role: string;
  name: string;
}

interface MemberSelectModalProps {
  isOpen: boolean;
  /** 選択候補メンバー。退会済み (is_active=false) メンバーは呼び出し側で除外して渡すこと */
  members: MemberSelectOption[];
  /** 初期選択中の user_id 配列 */
  selectedUserIds: string[];
  /** 決定時に選択された user_id 配列を返す */
  onConfirm: (userIds: string[]) => void;
  /** モーダルを閉じる（呼び出し元の選択状態は確定しない） */
  onCancel: () => void;
  title?: string;
}

/**
 * チームメンバー複数選択モーダル（web汎用基盤）。
 * RecordClient のインライン実装 (showMemberSelectModal 等) を汎用コンポーネント化したもの。
 * RecordClient/PracticeLogClient のインライン実装自体の置換は別スプリント。
 */
export default function MemberSelectModal({
  isOpen,
  members,
  selectedUserIds,
  onConfirm,
  onCancel,
  title,
}: MemberSelectModalProps) {
  const t = useTranslations("teams");
  const tEntries = useTranslations("competition.entries");

  const [tempSelected, setTempSelected] = useState<string[]>(selectedUserIds);

  // モーダルが開かれるたびに呼び出し元の選択状態に同期する
  useEffect(() => {
    if (isOpen) {
      setTempSelected(selectedUserIds);
    }
  }, [isOpen, selectedUserIds]);

  const toggle = (userId: string) => {
    setTempSelected((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onCancel}
      title={title ?? t("record.memberSelectTitle")}
      size="md"
    >
      {/* 一括選択 */}
      <div className="flex gap-2 pb-3 mb-3 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTempSelected(members.map((m) => m.user_id))}
          className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-md transition-colors"
        >
          {t("record.selectAll")}
        </button>
        <button
          type="button"
          onClick={() => setTempSelected([])}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
        >
          {t("record.clearSelection")}
        </button>
      </div>

      {/* メンバーリスト */}
      {members.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          {tEntries("noMembersToSelect")}
        </p>
      ) : (
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {members.map((member) => {
            const isSelected = tempSelected.includes(member.user_id);
            return (
              <label
                key={member.user_id}
                className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                  isSelected ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(member.user_id)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-3 flex-1 text-sm font-medium text-gray-900">{member.name}</span>
                {member.role === "admin" && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                    {t("record.adminBadge")}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}

      {/* フッター */}
      <div className="flex items-center justify-between pt-4 mt-4 border-t border-gray-200">
        <span className="text-sm text-gray-600">
          {t("record.selectedMemberCount", { n: tempSelected.length })}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
          >
            {t("record.cancelButton")}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(tempSelected)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700"
          >
            {t("record.confirmSelection")}
          </button>
        </div>
      </div>
    </BaseModal>
  );
}
