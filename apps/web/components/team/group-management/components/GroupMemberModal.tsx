"use client";

import React, { useState, useEffect, useMemo } from "react";
import BaseModal from "@/components/ui/BaseModal";
import Avatar from "@/components/ui/Avatar";
import type { TeamGroupWithCount } from "../hooks/useTeamGroups";

interface TeamMemberForSelection {
  id: string;
  user_id: string;
  users: {
    id: string;
    name: string;
    profile_image_path?: string | null;
  };
}

interface GroupMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: TeamGroupWithCount | null;
  teamMembers: TeamMemberForSelection[];
  currentMemberUserIds: string[];
  onSave: (groupId: string, userIds: string[]) => Promise<boolean>;
  saving: boolean;
  loading: boolean;
}

export const GroupMemberModal: React.FC<GroupMemberModalProps> = ({
  isOpen,
  onClose,
  group,
  teamMembers,
  currentMemberUserIds,
  onSave,
  saving,
  loading,
}) => {
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  // 現在の割り当て済みメンバーで初期化
  useEffect(() => {
    setSelectedUserIds(new Set(currentMemberUserIds));
    setSearchQuery("");
  }, [currentMemberUserIds, isOpen]);

  // 検索フィルター
  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return teamMembers;
    const q = searchQuery.toLowerCase();
    return teamMembers.filter((m) => m.users.name.toLowerCase().includes(q));
  }, [teamMembers, searchQuery]);

  const handleToggle = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedUserIds(new Set(teamMembers.map((m) => m.user_id)));
  };

  const handleDeselectAll = () => {
    setSelectedUserIds(new Set());
  };

  const handleSave = async () => {
    if (!group) return;
    const success = await onSave(group.id, [...selectedUserIds]);
    if (success) {
      onClose();
    }
  };

  if (!group) return null;

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title={`${group.name} のメンバー`} size="lg">
      <div className="space-y-4">
        {/* 検索 */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="メンバーを検索..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />

        {/* 一括選択 */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            {selectedUserIds.size} / {teamMembers.length} 人選択中
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-blue-600 hover:text-blue-800"
            >
              全選択
            </button>
            <button
              type="button"
              onClick={handleDeselectAll}
              className="text-gray-500 hover:text-gray-700"
            >
              全解除
            </button>
          </div>
        </div>

        {/* メンバーリスト */}
        <div className="max-h-80 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-200">
          {loading ? (
            <div className="p-4 text-center text-sm text-gray-500">読み込み中...</div>
          ) : filteredMembers.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">
              {searchQuery ? "該当するメンバーがいません" : "メンバーがいません"}
            </div>
          ) : (
            filteredMembers.map((member) => {
              const isSelected = selectedUserIds.has(member.user_id);
              return (
                <label
                  key={member.user_id}
                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors ${
                    isSelected ? "bg-blue-50" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggle(member.user_id)}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <Avatar
                    avatarUrl={member.users.profile_image_path || null}
                    userName={member.users.name}
                    size="sm"
                  />
                  <span className="text-sm text-gray-900">{member.users.name}</span>
                </label>
              );
            })
          )}
        </div>

        {/* ボタン */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </BaseModal>
  );
};
