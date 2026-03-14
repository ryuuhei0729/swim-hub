"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts";
import BaseModal from "@/components/ui/BaseModal";
import Avatar from "@/components/ui/Avatar";
import { UsersIcon } from "@heroicons/react/24/outline";
import type { TeamGroupWithCount } from "../hooks/useTeamGroups";
import type { MemberDetail } from "@/types/member-detail";

interface GroupMemberListModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: TeamGroupWithCount | null;
  teamId: string;
  onMemberClick: (member: MemberDetail) => void;
}

export const GroupMemberListModal: React.FC<GroupMemberListModalProps> = ({
  isOpen,
  onClose,
  group,
  teamId,
  onMemberClick,
}) => {
  const { supabase } = useAuth();
  const [members, setMembers] = useState<MemberDetail[]>([]);
  const [loading, setLoading] = useState(false);

  const loadMembers = useCallback(async () => {
    if (!group) return;
    setLoading(true);
    try {
      // グループに所属するuser_idを取得
      const { data: groupMemberships, error: gmError } = await supabase
        .from("team_group_memberships")
        .select("user_id")
        .eq("team_group_id", group.id);
      if (gmError) throw gmError;

      const userIds = (groupMemberships ?? []).map((m) => m.user_id);
      if (userIds.length === 0) {
        setMembers([]);
        return;
      }

      // team_membershipsからMemberDetail情報を取得
      const { data, error: tmError } = await supabase
        .from("team_memberships")
        .select(
          `
          id,
          user_id,
          role,
          is_active,
          joined_at,
          users!team_memberships_user_id_fkey (
            id,
            name,
            birthday,
            bio,
            profile_image_path
          )
        `,
        )
        .eq("team_id", teamId)
        .eq("status", "approved")
        .eq("is_active", true)
        .in("user_id", userIds)
        .order("role", { ascending: true });

      if (tmError) throw tmError;
      setMembers((data ?? []) as unknown as MemberDetail[]);
    } catch (err) {
      console.error("グループメンバー取得エラー:", err);
    } finally {
      setLoading(false);
    }
  }, [group, teamId, supabase]);

  useEffect(() => {
    if (isOpen && group) {
      loadMembers();
    }
  }, [isOpen, group, loadMembers]);

  if (!group) return null;

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title={`${group.name}`} size="md">
      <div className="space-y-1">
        {/* ヘッダー */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
          <UsersIcon className="h-4 w-4" />
          <span>{members.length}人のメンバー</span>
        </div>

        {/* ローディング */}
        {loading ? (
          <div className="py-8">
            <div className="animate-pulse space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2">
                  <div className="h-8 w-8 bg-gray-200 rounded-full" />
                  <div className="h-4 bg-gray-200 rounded w-32" />
                </div>
              ))}
            </div>
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-8">
            <UsersIcon className="h-10 w-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">メンバーが登録されていません</p>
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto -mx-1">
            {members.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => onMemberClick(member)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-left"
                aria-label={`${member.users?.name || "名前未設定"} の詳細を表示`}
              >
                <Avatar
                  avatarUrl={member.users?.profile_image_path ?? null}
                  userName={member.users?.name || "?"}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-900 truncate block">
                    {member.users?.name || "名前未設定"}
                  </span>
                </div>
                {member.role === "admin" && (
                  <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full shrink-0">
                    管理者
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </BaseModal>
  );
};
